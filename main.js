const { app, BrowserWindow, dialog } = require('electron');
const { setDataDir } = require('./lib/paths');

let mainWindow;

// Cegah lebih dari satu instance jalan bersamaan (penyebab umum error
// "address already in use" kalau exe ke-klik dua kali atau proses lama
// belum benar-benar tertutup).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  async function createWindow() {
    // Folder aplikasi (di dalam asar) read-only saat dipaketkan, jadi upload
    // dan hasil render disimpan di folder data pengguna Electron.
    setDataDir(app.getPath('userData'));

    let PORT;
    try {
      const { start } = require('./server');
      PORT = await start();
    } catch (err) {
      dialog.showErrorBox(
        'HTML Render Studio gagal start',
        `Server lokal tidak bisa jalan.\n\n${err.message}\n\nCoba tutup dulu semua jendela HTML Render Studio yang mungkin masih terbuka di Task Manager, lalu buka lagi aplikasinya.`
      );
      app.quit();
      return;
    }

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 680,
      title: 'HTML Render Studio',
      backgroundColor: '#0c0616',
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
