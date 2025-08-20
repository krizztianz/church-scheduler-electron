import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolusi path: dev -> root project, packaged -> resourcesPath
function resolveProjectPath(...segments) {
  const base = app.isPackaged ? process.resourcesPath : __dirname;
  return path.join(base, ...segments);
}

// Direktori python (submodule) & runner
const PY_DIR  = resolveProjectPath('pythonScripts');
const RUN_SH  = path.join(PY_DIR, 'run.sh');
const RUN_BAT = path.join(PY_DIR, 'run.bat');

ipcMain.handle('python:generate', async (_evt, args) => {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const cmd = isWin ? RUN_BAT : RUN_SH;
    const cmdArgs = Array.isArray(args) ? args : [];

    const child = spawn(cmd, cmdArgs, {
      cwd: PY_DIR,              // PENTING: jalankan di pythonScripts/
      shell: false
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d.toString()));
    child.stderr.on('data', d => (stderr += d.toString()));

    child.on('close', code => {
      if (code === 0) resolve({ ok: true, stdout });
      else reject(new Error(`pythonScripts exited with code ${code}\n${stderr}`));
    });

    child.on('error', reject);
  });
});

function createWindow () {
  const win = new BrowserWindow({
    width: 1024,
    height: 600,
    minWidth: 880,
    minHeight: 530,
    show: true,                 // tampilkan setelah siap
    autoHideMenuBar: true,       // sembunyikan menu
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: resolveProjectPath('build', 'icon.png')
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
