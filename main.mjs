// main.mjs — absolute-path fix for preload & index.html (v6)
// - Uses __dirname derived from import.meta.url
// - Ensures absolute paths for preload + loadFile
// - Retains Go-engine + Settings IPC previously implemented

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow () {
  const win = new BrowserWindow({
    width: 1024,
    height: 560,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      // ABSOLUTE PATH for preload (Windows-safe)
      preload: path.resolve(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      sandbox: true,
    },
    show: false
  });
  win.once('ready-to-show', () => win.show());

  // ABSOLUTE PATH for index.html (Windows-safe)
  win.loadFile(path.resolve(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// -------------------- Config helpers --------------------
function configDir() {
  return path.join(os.homedir(), 'Documents', 'JadwalPetugas', 'config');
}
function configPath() {
  return path.join(configDir(), 'config.json');
}
const defaultConfig = {
  general: {
    verbose: false,
    outdir: "",               // empty => engine default ~/Documents/JadwalPetugas
    templateName: "TemplateOutput.xlsx",
    masterOverride: ""
  }
};
function ensureConfigDir() {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function readConfig() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return structuredClone(defaultConfig);
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    // Shallow merge with defaults to tolerate older/newer versions
    return {
      general: {
        ...defaultConfig.general,
        ...(parsed?.general ?? {}),
      }
    };
  } catch {
    return structuredClone(defaultConfig);
  }
}
function writeConfig(cfg) {
  ensureConfigDir();
  const merged = {
    general: {
      ...defaultConfig.general,
      ...(cfg?.general ?? {}),
    }
  };
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// -------------------- Engine path resolution --------------------
function resolveEnginePath() {
  const binName = process.platform === 'win32' ? 'engine-go.exe' : 'engine-go';
  const envPath = process.env.ENGINE_GO_PATH && process.env.ENGINE_GO_PATH.trim();

  const candidates = [
    envPath,
    // dev-first: near this main.mjs
    path.join(__dirname, 'deploy', 'go', binName),
    // packaged resources
    path.join(process.resourcesPath ?? '', 'deploy', 'go', binName),
    // app path
    path.join(app.getAppPath(), 'deploy', 'go', binName),
    // cwd (last resort)
    path.join(process.cwd(), 'deploy', 'go', binName),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const dir = path.dirname(p);
        return { bin: p, cwd: dir };
      }
    } catch {}
  }
  throw new Error(`Engine Go binary not found. Expected at one of:
- ${candidates.filter(Boolean).join('\n- ')}
Tip: put your binary at deploy/go/${binName} or set ENGINE_GO_PATH.`);
}

// -------------------- Engine runner --------------------
function runGoEngine(flags) {
  return new Promise((resolve, reject) => {
    let out = '', err = '';
    let outputPath = '';

    let eng;
    try {
      const { bin, cwd } = resolveEnginePath();

      // Best-effort: on POSIX ensure executable bit (dev only)
      if (process.platform !== 'win32') {
        try {
          const st = fs.statSync(bin);
          const mode = st.mode | 0o111;
          if ((st.mode & 0o111) === 0) fs.chmodSync(bin, mode);
        } catch {}
      }

      eng = spawn(bin, flags, { cwd, env: process.env });

      eng.stdout.on('data', (d) => {
        const s = d.toString();
        out += s;
        const m = s.match(/SUKSES:\s*(.+)$/m);
        if (m) outputPath = m[1].trim();
      });
      eng.stderr.on('data', (d) => { err += d.toString(); });
      eng.on('error', (e) => reject(e));
      eng.on('close', (code) => {
        if (code === 0) resolve({ stdout: out, stderr: err, outputPath });
        else reject(new Error(err || out || `Engine exited with code ${code}`));
      });
    } catch (e) {
      reject(e);
    }
  });
}

// -------------------- IPC: Settings --------------------
ipcMain.handle('settings:load', async () => {
  return readConfig();
});
ipcMain.handle('settings:save', async (_evt, cfg) => {
  try {
    const saved = writeConfig(cfg);
    return { ok: true, cfg: saved };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// -------------------- IPC: File/Folder pickers --------------------
ipcMain.handle('dialog:pick-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || !res.filePaths?.length) return { canceled: true };
  return { canceled: false, path: res.filePaths[0] };
});
ipcMain.handle('dialog:pick-file', async (_evt, opts) => {
  const filters = opts?.filters ?? [{ name: 'All Files', extensions: ['*'] }];
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  if (res.canceled || !res.filePaths?.length) return { canceled: true };
  return { canceled: false, path: res.filePaths[0] };
});

// -------------------- IPC: Generate via Go engine --------------------
ipcMain.handle('go:generate', async (_evt, payload) => {
  // Accept either legacy payload.args = [MM, YYYY] or payload.form = {month, year, generateOneMonth, day}
  let MM, YYYY, generateOneMonth = true, day = null;

  if (payload?.form) {
    const f = payload.form;
    MM = parseInt(f.month, 10);
    YYYY = parseInt(f.year, 10);
    generateOneMonth = !!f.generateOneMonth;
    day = f.day ? parseInt(f.day, 10) : null;
  } else {
    const A = Array.isArray(payload?.args) ? payload.args : [];
    MM = parseInt(A[0] ?? '', 10);
    YYYY = parseInt(A[1] ?? '', 10);
    generateOneMonth = true;
  }

  if (!MM || !YYYY) {
    throw new Error('Argumen tidak valid. Bulan & Tahun wajib.');
  }

  const cfg = readConfig();
  const flags = ['-bulan', String(MM), '-tahun', String(YYYY)];

  // Settings mapping (1–4)
  if (cfg?.general?.verbose) flags.push('-v');
  if (cfg?.general?.outdir)  flags.push('-outdir', String(cfg.general.outdir));
  if (cfg?.general?.templateName) flags.push('-template', String(cfg.general.templateName));
  if (cfg?.general?.masterOverride) flags.push('-master', String(cfg.general.masterOverride));

  // Single date?
  if (!generateOneMonth && day && day >= 1 && day <= 31) {
    flags.push('-tgl', String(day));
  }

  const result = await runGoEngine(flags);
  return {
    ok: true,
    outputPath: result.outputPath || null,
    stdout: result.stdout,
    stderr: result.stderr
  };
});

// -------------------- IPC: open output folder --------------------
ipcMain.handle('open:output-folder', async (_evt, givenPath) => {
  let target = givenPath && String(givenPath);
  if (!target) {
    target = path.join(os.homedir(), 'Documents', 'JadwalPetugas');
  }
  try {
    if (fs.existsSync(target)) {
      const stat = fs.statSync(target);
      if (stat.isDirectory()) {
        await shell.openPath(target);
      } else {
        shell.showItemInFolder(target);
      }
      return { ok: true, opened: target };
    }
  } catch {}
  throw new Error(`Folder/File tidak ditemukan: ${target}`);
});
