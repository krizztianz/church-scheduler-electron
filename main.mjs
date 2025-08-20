import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipcMain } from 'electron'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged; // true saat npm start

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 600,
    minWidth: 880,
    minHeight: 530,
    show: false,                 // tampilkan setelah siap
    autoHideMenuBar: true,       // sembunyikan menu
    icon: path.join(__dirname, 'build', 'icon.ico'), // opsional
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  // Muat file HTML kamu
  win.loadFile(path.join(__dirname, 'index.html'));

  if (isDev) {
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Di Windows, kita tutup app saat semua window tertutup
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  // Di macOS, klik dock icon -> buat window baru jika tidak ada
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('generate', async (event, payload) => {
  // kerjakan generate di sini (tulis file, dsb)
  // return hasil/status
  return { ok: true, message: `Generated for ${payload.bulan}/${payload.tahun}` };
});
