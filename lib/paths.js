const path = require('path');

// Default: root proyek (dipakai saat development / `node server.js` langsung).
// Saat berjalan sebagai aplikasi Electron yang dipaketkan (asar, read-only),
// main.js akan memanggil setDataDir() dengan folder userData Electron
// (mis. %APPDATA%/HTMLRenderStudio di Windows) sebelum server di-start.
let dataDir = path.join(__dirname, '..');

function setDataDir(dir) {
  dataDir = dir;
}

function getUploadsDir() {
  return path.join(dataDir, 'uploads');
}

function getRendersDir() {
  return path.join(dataDir, 'renders');
}

function getSettingsPath() {
  return path.join(dataDir, 'settings.json');
}

module.exports = { setDataDir, getUploadsDir, getRendersDir, getSettingsPath };
