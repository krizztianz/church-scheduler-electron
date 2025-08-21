
import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveProjectPath(...segments) {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  return path.join(base, ...segments);
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

// Save to Documents/JadwalPetugas/output when packaged, else to ./output (dev)
function resolveOutputDir() {
  if (app.isPackaged) {
    return path.join(app.getPath('documents'), 'JadwalPetugas', 'output');
  }
  return resolveProjectPath('output');
}

// Ensure Master.xlsx exists under Documents/JadwalPetugas/config.
// 1) If found there, return it.
// 2) Else try to copy from resources candidates.
// 3) Else prompt user to select a .xlsx and copy it there.
async function ensureMasterInDocuments() {
  const cfgDir = path.join(app.getPath('documents'), 'JadwalPetugas', 'config');
  const target = path.join(cfgDir, 'Master.xlsx');
  if (fs.existsSync(target)) return target;

  const candidates = [
    resolveProjectPath('Master.xlsx'),
    resolveProjectPath('pythonScripts', 'Master.xlsx')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      ensureDir(cfgDir);
      fs.copyFileSync(c, target);
      return target;
    }
  }

  // Ask user to pick Master.xlsx once
  const res = await dialog.showOpenDialog({
    title: 'Pilih file Master.xlsx',
    message: 'File Master.xlsx tidak ditemukan. Pilih file Master.xlsx sumber data Anda. File akan disalin ke Documents/JadwalPetugas/config.',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  });
  if (res.canceled || !res.filePaths?.length) {
    throw new Error('Master.xlsx belum tersedia. Silakan pilih file Master.xlsx.');
  }
  const picked = res.filePaths[0];
  if (!fs.existsSync(picked)) throw new Error('File yang dipilih tidak ditemukan.');
  ensureDir(cfgDir);
  fs.copyFileSync(picked, target);
  return target;
}

// Format "Jadwal_Bulan_{Bulan}-{YYYY}_{HHmmss}.xlsx"
function buildOutputName(year, month) {
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  const bulanNama = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(d);
  const hhmmss = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date()).replace(/:/g, '');
  return `Jadwal_Bulan_${bulanNama}-${year}_${hhmmss}.xlsx`;
}

// --- IPC: trigger generation via OS-aware wrapper ---------------------------
ipcMain.handle('python:generate', async (_evt, payload) => {
  try {
    const [MM, YYYY, pjemaatRaw] = payload?.args || [];
    if (!MM || !YYYY) throw new Error("Args missing. Expect [MM, YYYY, pjemaat].");

    // Pre-initialize Master.xlsx in Documents (one-time, interactive if needed)
    await ensureMasterInDocuments();

    const month = String(parseInt(MM, 10));
    const year  = String(parseInt(YYYY, 10));
    const pjemaat = String(parseInt(pjemaatRaw ?? "3", 10) || 3);

    const scriptDir = resolveProjectPath('pythonScripts');
    const runSh = path.join(scriptDir, 'run.sh');
    const runBat = path.join(scriptDir, 'run.bat');

    const outputDir = resolveOutputDir();
    ensureDir(outputDir);
    const fileName = buildOutputName(year, month);
    const outputPath = path.join(outputDir, fileName);

    // Validate wrapper presence
    if (process.platform === 'win32') {
      if (!fs.existsSync(runBat)) throw new Error(`Wrapper missing: ${runBat}`);
    } else {
      if (!fs.existsSync(runSh)) throw new Error(`Wrapper missing: ${runSh}`);
      try {
        const st = fs.statSync(runSh);
        const mode = st.mode | 0o111;
        if ((st.mode & 0o111) === 0) fs.chmodSync(runSh, mode);
      } catch {}
    }

    // Spawn
    const env = { ...process.env, OUTPUT_PATH: outputPath };
    let child;
    if (process.platform === 'win32') {
      child = spawn('cmd.exe', ['/c', runBat, month, year, pjemaat], { cwd: scriptDir, env });
    } else {
      child = spawn(runSh, [month, year, pjemaat], { cwd: scriptDir, env });
    }

    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => stdout += d.toString());
    child.stderr.on('data', (d) => stderr += d.toString());

    return await new Promise((resolve, reject) => {
      child.on('error', (err) => reject(new Error(`Spawn failed: ${err.message}`)));
      child.on('close', (code) => {
        if (code === 0) resolve({ code, stdout, stderr, outputPath });
        else reject(new Error(stderr || `Wrapper exited with code ${code}`));
      });
    });
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
});

// --- IPC: open output folder ------------------------------------------------
ipcMain.handle('open:output-folder', async (_evt, argOutputPath) => {
  try {
    const p = argOutputPath && typeof argOutputPath === 'string'
      ? argOutputPath
      : resolveOutputDir();
    const folder = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
    const res = await shell.openPath(folder);
    if (res) throw new Error(res); // shell.openPath returns empty string on success
    return true;
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
});

// --- Window -----------------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 560,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: resolveProjectPath('build', 'icon.png')
  });
  win.loadFile(resolveProjectPath('index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
