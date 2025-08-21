
import { app, BrowserWindow, ipcMain } from 'electron';
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

// Format "Jadwal_Bulan_{Bulan}-{YYYY}_{HHmmss}.xlsx" in Indonesian locale
function buildOutputName(year, month) {
  const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  const bulanNama = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(d);
  const hhmmss = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date()).replace(/:/g, '');
  return `Jadwal_Bulan_${bulanNama}-${year}_${hhmmss}.xlsx`;
}

// --- IPC: python:generate ---------------------------------------------------
ipcMain.handle('python:generate', async (_evt, payload) => {
  try {
    const [MM, YYYY, pjemaatRaw] = payload?.args || [];
    if (!MM || !YYYY) throw new Error("Args missing. Expect [MM, YYYY, pjemaat].");

    const month = String(parseInt(MM, 10));
    const year  = String(parseInt(YYYY, 10));
    const pjemaat = String(parseInt(pjemaatRaw ?? "3", 10) || 3);

    const scriptDir = resolveProjectPath('pythonScripts');
    const runSh = path.join(scriptDir, 'run.sh');
    const runBat = path.join(scriptDir, 'run.bat');

    const outputDir = resolveProjectPath('output');
    ensureDir(outputDir);
    const fileName = buildOutputName(year, month);
    const outputPath = path.join(outputDir, fileName);

    // Validate wrappers exist
    if (process.platform === 'win32') {
      if (!fs.existsSync(runBat)) throw new Error(`Wrapper missing: ${runBat}`);
    } else {
      if (!fs.existsSync(runSh)) throw new Error(`Wrapper missing: ${runSh}`);
    }

    let child;
    const env = { ...process.env, OUTPUT_PATH: outputPath };
    if (process.platform === 'win32') {
      child = spawn('cmd.exe', ['/c', runBat, month, year, pjemaat], {
        cwd: scriptDir, env
      });
    } else {
      // ensure exec bit; best-effort
      try {
        const st = fs.statSync(runSh);
        const mode = st.mode | 0o111;
        if ((st.mode & 0o111) === 0) fs.chmodSync(runSh, mode);
      } catch {}
      child = spawn(runSh, [month, year, pjemaat], {
        cwd: scriptDir, env
      });
    }

    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => stdout += d.toString());
    child.stderr.on('data', (d) => stderr += d.toString());

    return await new Promise((resolve, reject) => {
      child.on('error', (err) => reject(new Error(`Spawn failed: ${err.message}`)));
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ code, stdout, stderr, outputPath });
        } else {
          reject(new Error(stderr || `Wrapper exited with code ${code}`));
        }
      });
    });
  } catch (err) {
    throw new Error(err?.message || String(err));
  }
});

// --- Window ---------------------------------------------------
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
