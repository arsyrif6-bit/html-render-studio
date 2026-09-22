#!/usr/bin/env node
// Dijalankan setelah electron-packager selesai (lihat package.json scripts).
// Tujuannya memangkas ukuran folder aplikasi yang sudah di-package tanpa
// mengubah apapun yang benar-benar dipakai aplikasi saat runtime:
//   1. Bahasa Chromium (locales/*.pak) -- kita cuma pakai UI berbahasa
//      Indonesia & fallback Inggris, ~55 file bahasa lain (puluhan MB)
//      aman dihapus.
//   2. File non-kode di dalam ffmpeg-static yang ter-unpack (LICENSE,
//      README, definisi TypeScript, dsb) -- tidak dibaca aplikasi saat
//      runtime sama sekali.
const fs = require('fs');
const path = require('path');

const appDir = process.argv[2];
if (!appDir || !fs.existsSync(appDir)) {
  console.error('Penggunaan: node scripts/prune-output.js <folder-hasil-package>');
  process.exit(1);
}

function rm(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('  hapus:', p);
  }
}

function human(n) {
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function dirSize(p) {
  let total = 0;
  if (!fs.existsSync(p)) return 0;
  const stat = fs.statSync(p);
  if (stat.isFile()) return stat.size;
  for (const name of fs.readdirSync(p)) total += dirSize(path.join(p, name));
  return total;
}

const before = dirSize(appDir);

// 1) Locale Chromium: cari folder "locales" di manapun letaknya (beda
// sedikit antar versi electron-packager/platform).
const KEEP_LOCALES = new Set(['en-US.pak', 'id.pak']);
function pruneLocales(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'locales') {
        for (const f of fs.readdirSync(full)) {
          if (f.endsWith('.pak') && !KEEP_LOCALES.has(f)) rm(path.join(full, f));
        }
      } else {
        pruneLocales(full);
      }
    }
  }
}
pruneLocales(appDir);

// 2) File dokumentasi/tipe yang ikut ter-unpack bareng ffmpeg-static.
function pruneFfmpegExtras(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'ffmpeg-static') {
        for (const f of fs.readdirSync(full)) {
          if (/\.(md|LICENSE|README)$/i.test(f) || f === 'types' || f === 'example.js' || f === 'install.js') {
            rm(path.join(full, f));
          }
        }
      } else {
        pruneFfmpegExtras(full);
      }
    }
  }
}
pruneFfmpegExtras(appDir);

const after = dirSize(appDir);
console.log(`Ukuran sebelum: ${human(before)}  ->  sesudah: ${human(after)}  (hemat ${human(before - after)})`);
