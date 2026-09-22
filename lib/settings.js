const fs = require('fs');
const path = require('path');
const { getSettingsPath } = require('./paths');

// Pengaturan yang dipertahankan antar sesi: folder input/output terakhir,
// mode pantau folder, target ukuran file, dsb. Disimpan sebagai JSON kecil
// di folder data aplikasi (bukan di dalam asar yang read-only).
function getSettings() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (e) {
    console.error('Gagal membaca settings.json:', e.message);
  }
  return {};
}

function saveSettings(patch) {
  const merged = { ...getSettings(), ...patch };
  try {
    const p = getSettingsPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(merged, null, 2));
  } catch (e) {
    console.error('Gagal menyimpan settings.json:', e.message);
  }
  return merged;
}

module.exports = { getSettings, saveSettings };
