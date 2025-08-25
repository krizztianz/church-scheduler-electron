// main.mjs — v12: resilient index.html locator (asar + resources fallback)
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function pickIndexPath() {
  const appPath = app.getAppPath(); // often .../resources/app.asar
  const candidates = [
    path.join(__dirname, 'index.html'),                   // typical dev/asar
    path.join(appPath, 'index.html'),                     // another asar ref
    path.join(process.resourcesPath ?? '', 'index.html'), // extraResources fallback
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  console.error('index.html not found. Candidates checked:\n- ' + candidates.join('\n- '));
  // Return the first (so error message from did-fail-load shows something deterministic)
  return candidates[0];
}

function createWindow () {
  const win = new BrowserWindow({
    width: 1024,
    height: 560,
    webPreferences: {
      contextIsolation: true,
      preload: path.resolve(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      sandbox: false,
    },
    show: false
  });

  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    console.error('did-fail-load', { code, desc, url });
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('render-process-gone', details);
  });

  const idxPath = pickIndexPath();
  const idxUrl = pathToFileURL(idxPath).toString();
  console.log('Loading index from:', idxUrl);
  win.loadURL(idxUrl);

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', function () { if (process.platform !== 'darwin') app.quit(); });

// -------------------- Config helpers --------------------
function configDir() { return path.join(os.homedir(), 'Documents', 'JadwalPetugas', 'config'); }
function configPath() { return path.join(configDir(), 'config.json'); }
const defaultConfig = { general: { verbose: false, outdir: "", templateName: "TemplateOutput.xlsx", masterOverride: "" } };
function ensureConfigDir() { const dir = configDir(); fs.mkdirSync(dir, { recursive: true }); return dir; }
function readConfig() {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return structuredClone(defaultConfig);
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    return { general: { ...defaultConfig.general, ...(parsed?.general ?? {}) } };
  } catch { return structuredClone(defaultConfig); }
}
function writeConfig(cfg) {
  ensureConfigDir();
  const merged = { general: { ...defaultConfig.general, ...(cfg?.general ?? {}) } };
  fs.writeFileSync(configPath(), JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

// -------------------- Engine path resolution --------------------
function resolveEnginePath() {
  const binName = process.platform === 'win32' ? 'engine-go.exe' : 'engine-go';
  const envPath = process.env.ENGINE_GO_PATH && process.env.ENGINE_GO_PATH.trim();
  const looksInsideAsar = (p) => typeof p === 'string' && p.toLowerCase().includes('.asar');

  const candidates = [
    envPath,
    path.join(process.resourcesPath ?? '', 'deploy', 'go', binName),
    path.join(process.resourcesPath ?? '', 'app.asar.unpacked', 'deploy', 'go', binName),
    path.join(__dirname, 'deploy', 'go', binName),
    path.join(app.getAppPath(), 'deploy', 'go', binName),
    path.join(process.cwd(), 'deploy', 'go', binName),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (!p) continue;
      if (looksInsideAsar(p)) continue;
      if (fs.existsSync(p)) return { bin: p, cwd: path.dirname(p) };
    } catch {}
  }
  throw new Error(`Engine Go binary not found. Expected at one of:\n- ${candidates.filter(Boolean).join('\n- ')}`);
}

// -------------------- Engine runner --------------------
function runGoEngine(flags) {
  return new Promise((resolve, reject) => {
    let out = '', err = '', outputPath = '';
    try {
      const { bin, cwd } = resolveEnginePath();
      if (process.platform !== 'win32') {
        try { const st = fs.statSync(bin); if ((st.mode & 0o111) === 0) fs.chmodSync(bin, st.mode | 0o111); } catch {}
      }
      const child = spawn(bin, flags, { cwd, env: process.env });
      child.stdout.on('data', d => { const s = d.toString(); out += s; const m = s.match(/SUKSES:\s*(.+)$/m); if (m) outputPath = m[1].trim(); });
      child.stderr.on('data', d => { err += d.toString(); });
      child.on('error', e => reject(e));
      child.on('close', code => { code === 0 ? resolve({ stdout: out, stderr: err, outputPath }) : reject(new Error(err || out || `Engine exited with code ${code}`)); });
    } catch (e) { reject(e); }
  });
}

// -------------------- IPC --------------------
ipcMain.handle('settings:load', async () => readConfig());
ipcMain.handle('settings:save', async (_evt, cfg) => { try { return { ok: true, cfg: writeConfig(cfg) }; } catch (e) { return { ok: false, error: String(e?.message || e) }; } });
ipcMain.handle('dialog:pick-folder', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths?.length) return { canceled: true };
  return { canceled: false, path: r.filePaths[0] };
});
ipcMain.handle('dialog:pick-file', async (_evt, opts) => {
  const filters = opts?.filters ?? [{ name: 'All Files', extensions: ['*'] }];
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters });
  if (r.canceled || !r.filePaths?.length) return { canceled: true };
  return { canceled: false, path: r.filePaths[0] };
});
ipcMain.handle('go:generate', async (_evt, payload) => {
  let MM, YYYY, generateOneMonth = true, day = null;
  if (payload?.form) {
    const f = payload.form;
    MM = parseInt(f.month, 10); YYYY = parseInt(f.year, 10);
    generateOneMonth = !!f.generateOneMonth; day = f.day ? parseInt(f.day, 10) : null;
  } else {
    const A = Array.isArray(payload?.args) ? payload.args : []; MM = parseInt(A[0] ?? '', 10); YYYY = parseInt(A[1] ?? '', 10);
  }
  if (!MM || !YYYY) throw new Error('Argumen tidak valid. Bulan & Tahun wajib.');
  const cfg = readConfig();
  const flags = ['-bulan', String(MM), '-tahun', String(YYYY)];
  if (cfg?.general?.verbose) flags.push('-v');
  if (cfg?.general?.outdir) flags.push('-outdir', String(cfg.general.outdir));
  if (cfg?.general?.templateName) flags.push('-template', String(cfg.general.templateName));
  if (cfg?.general?.masterOverride) flags.push('-master', String(cfg.general.masterOverride));
  if (!generateOneMonth && day && day >= 1 && day <= 31) flags.push('-tgl', String(day));
  const result = await runGoEngine(flags);
  return { ok: true, outputPath: result.outputPath || null, stdout: result.stdout, stderr: result.stderr };
});
ipcMain.handle('open:output-folder', async (_evt, givenPath) => {
  let target = givenPath && String(givenPath);
  if (!target) target = path.join(os.homedir(), 'Documents', 'JadwalPetugas');
  if (fs.existsSync(target)) { const st = fs.statSync(target); if (st.isDirectory()) await shell.openPath(target); else shell.showItemInFolder(target); return { ok: true, opened: target }; }
  throw new Error(`Folder/File tidak ditemukan: ${target}`);
});
