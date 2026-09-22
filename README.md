# HTML Render Studio

Aplikasi lokal untuk menjalankan animasi HTML/CSS/Three.js dan merekamnya
menjadi video (MP4 H.264 atau MOV ProRes4444 dengan alpha channel), satuan
maupun bulk (banyak file sekaligus).

Cara kerjanya: jendela Chromium tersembunyi (offscreen, bawaan Electron) membuka file HTML kamu, lalu
"waktu" di dalam browser itu dibekukan dan digerakkan manual frame-per-frame
sesuai FPS yang kamu pilih — jadi hasilnya presisi (bukan rekam layar biasa)
dan tidak terpengaruh cepat/lambatnya komputer. Setiap frame dikirim langsung
ke FFmpeg untuk di-encode jadi video.

## 1. Prasyarat

- **Node.js** versi 18 atau lebih baru. Cek dengan `node -v`. Kalau belum ada,
  unduh di https://nodejs.org
- Koneksi internet saat instalasi pertama kali (untuk mengunduh Chromium versi
  Puppeteer dan FFmpeg statis — setelah itu aplikasi bisa jalan offline).

## 2. Cara paling gampang: double-click

- **Windows**: double-click `start.bat`
- **Mac/Linux**: double-click `start.sh` (kalau tidak bisa langsung jalan,
  klik kanan → Properties/Get Info → izinkan "run as executable", atau
  jalankan `bash start.sh` sekali dari terminal)

Pertama kali dijalankan, akan otomatis `npm install` (unduh Chromium ~200MB
+ FFmpeg, butuh internet, bisa 5-10 menit). Setelah itu jendela server
terbuka dan browser otomatis membuka `http://localhost:4321`. Jalan-jalan
berikutnya jauh lebih cepat karena dependensi sudah terunduh.

Kalau `start.bat`/`start.sh` bilang Node.js belum ada, download dulu di
https://nodejs.org (pilih versi **LTS**), install, lalu double-click lagi.

## 3. Cara manual (opsional, kalau mau kontrol sendiri)

```bash
npm install
npm start
```

Lalu buka `http://localhost:4321` di browser secara manual.

Kalau port 4321 sudah dipakai aplikasi lain:

```bash
PORT=5000 npm start
```

## 4. Cara pakai

1. Klik **+ Tambah HTML** untuk upload satu atau beberapa file `.html`.
   - Kalau animasimu butuh file terpisah (script Three.js, gambar, CSS)
     dengan path relatif, zip semuanya jadi satu file `.zip` lalu upload
     lewat **+ Tambah ZIP**.
2. Klik salah satu file di daftar untuk melihat pratinjaunya di panel tengah.
3. Atur **Resolusi** (1080p / 2K / 4K), **FPS** (24/30/60), **Durasi**
   (detik), **Format** (MP4 biasa atau MOV+Alpha untuk transparansi), dan
   **Kualitas**.
4. Kalau animasimu punya background transparan dan kamu pilih format
   **MOV + Alpha**, aktifkan juga toggle **Latar transparan**.
5. Klik **Render Berkas Terpilih** untuk satu file, atau **Render Semua
   (Bulk)** untuk merender semua file dalam daftar dengan pengaturan yang
   sama — job akan diproses satu per satu secara berurutan.
6. Pantau progres di panel **Antrian & Hasil** di bagian bawah. Kalau sudah
   `selesai`, klik **Unduh** untuk mengambil file videonya.

File hasil render tersimpan juga di folder `renders/` di dalam proyek ini.

## 5. Catatan teknis

- **MOV + Alpha** memakai codec ProRes 4444 (`prores_ks`, pixel format
  `yuva444p10le`) — cocok dibuka lagi di After Effects/Premiere/DaVinci
  dengan transparansi utuh. File-nya jauh lebih besar dari MP4.
- **MP4** memakai H.264 (`yuv420p`), lebih ringan dan cocok untuk dibagikan
  atau diputar di mana saja, tapi tidak mendukung alpha channel.
- Rendering 4K & durasi panjang cukup berat di CPU (encode) dan RAM (setiap
  frame di-screenshot penuh resolusi). Kalau komputer terasa berat, coba
  turunkan resolusi/FPS dulu untuk uji coba.
- Semua data (file upload, job, hasil render) disimpan lokal di komputer
  kamu sendiri — tidak ada yang dikirim ke server manapun.

## 6. Struktur folder

```
html-render-studio/
├── server.js         # Express server + API upload & render
├── lib/
│   ├── capture.js     # Inti: Puppeteer capture deterministik + pipe ke FFmpeg
│   └── jobs.js         # Antrian job in-memory
├── public/            # UI (HTML/CSS/JS statis)
├── uploads/           # File HTML/ZIP yang diupload (otomatis dibuat)
└── renders/            # Hasil video (otomatis dibuat)
```

## 7. Build aplikasi desktop siap-pakai (Windows & Mac)

Aplikasi ini dipaketkan pakai `electron-packager` (sudah ada di
`devDependencies`). Jalankan perintah build dari OS target masing-masing
(electron-packager cuma mengunduh binary Electron sesuai `--platform`, jadi
kalau mau hasil `.app` untuk Mac, paling aman jalankan `npm run build:mac`
**di komputer Mac** — begitu juga sebaliknya untuk Windows) dan pastikan ada
koneksi internet saat pertama kali (untuk mengunduh binary Electron +
`npm install`).

```bash
npm install        # sekali saja per OS, mengunduh Electron & ffmpeg-static
                    # versi yang sesuai platform komputer kamu

npm run build:win        # -> dist/HTMLRenderStudio-win32-x64/
npm run build:mac        # -> dist/HTMLRenderStudio-darwin-universal/  (Intel + Apple Silicon jadi satu)
npm run build:mac-intel  # -> dist/HTMLRenderStudio-darwin-x64/        (khusus Mac Intel)
npm run build:mac-arm    # -> dist/HTMLRenderStudio-darwin-arm64/      (khusus Apple Silicon/M-series)
```

Setiap script build otomatis menjalankan `scripts/prune-output.js` di akhir
untuk memangkas ukuran hasil paket (buang file bahasa Chromium yang tidak
dipakai & file dokumentasi bawaan `ffmpeg-static`) — ini yang membuat ukuran
akhir jauh lebih kecil dibanding hasil `electron-packager` polos.

Catatan soal Mac:
- Hasil `npm run build:mac`/`build:mac-*` **belum ditandatangani (unsigned)**
  dan belum di-notarize Apple. Untuk pemakaian pribadi ini tidak masalah,
  tapi macOS Gatekeeper kemungkinan akan memunculkan peringatan "aplikasi
  tidak bisa dibuka karena berasal dari pengembang tak dikenal" saat pertama
  kali dibuka. Solusinya: klik kanan `HTMLRenderStudio.app` → **Open** →
  **Open** lagi di dialog konfirmasi (cukup sekali, setelah itu app bisa
  dibuka normal). Untuk distribusi lebih luas tanpa peringatan ini,
  dibutuhkan Apple Developer ID untuk code signing + notarization
  (`electron-osx-sign` / `@electron/notarize`) — di luar cakupan setup ini.
- `main.js` sudah menangani perbedaan siklus hidup jendela Windows vs Mac
  (`window-all-closed` tidak langsung quit di Mac, sesuai konvensi macOS).

## 8. Mengembangkan lebih lanjut (ide)

- Tambah concurrency (render beberapa file paralel) di `lib/jobs.js`.
- Tambah watermark/logo overlay lewat filter FFmpeg tambahan.
- Tambah preset custom resolution (input width/height manual) — sudah
  didukung di backend (`settings.width` / `settings.height`), tinggal
  ditambahkan input-nya di UI.
- Simpan histori job ke file JSON supaya tidak hilang saat server direstart.
