# Cara Dapat Versi Mac (.dmg) & Linux (.tar.gz)

Kenapa nggak langsung dikirim file jadinya? Karena proses build butuh
download Electron & ffmpeg versi macOS/Linux dari internet — dan itu
harus dijalankan di komputer/server yang benar-benar OS-nya (bukan
di sandbox Claude yang tidak ada akses internet).

Solusinya: sudah disiapkan **GitHub Actions** yang akan build otomatis
di server GitHub (gratis) begitu kamu upload project ini ke GitHub.
Kamu TIDAK perlu punya Mac fisik.

## Langkah-langkah

1. Buat akun GitHub kalau belum punya: https://github.com/signup

2. Buat repository baru (boleh Private), misal namanya `html-render-studio`.

3. Upload semua isi folder ini ke repo tsb. Paling gampang lewat
   browser: buka repo baru itu > "uploading an existing file" >
   drag semua file & folder di sini (termasuk folder `.github` yang
   isinya tersembunyi kalau kamu lihat lewat file explorer biasa,
   jadi pastikan ikut ke-upload).

   Atau kalau familiar git:
   ```
   git init
   git add .
   git commit -m "initial"
   git branch -M main
   git remote add origin https://github.com/USERNAME/html-render-studio.git
   git push -u origin main
   ```

4. Setelah ke-push ke branch `main`, buka tab **Actions** di repo
   GitHub kamu. Akan otomatis jalan 2 job: "Build macOS" dan
   "Build Linux". Tunggu sekitar 5-10 menit sampai tanda centang hijau.

   Kalau tidak jalan otomatis, klik workflow "Build Mac & Linux" di
   tab Actions, lalu klik tombol "Run workflow" (manual trigger).

5. Kalau sudah selesai (centang hijau), scroll ke bawah halaman run
   tsb, ada bagian **Artifacts**:
   - `HTMLRenderStudio-mac-dmg` -> berisi 2 file .dmg (Intel & Apple Silicon)
   - `HTMLRenderStudio-linux-tar` -> berisi HTMLRenderStudio-linux-x64.tar.gz

   Download, itu hasil jadinya, tinggal dipakai.

## Cara pakai hasilnya

**Mac (.dmg):**
Buka file .dmg > drag ikon HTMLRenderStudio ke folder Applications >
buka dari Applications seperti aplikasi Mac biasa.
(Karena app belum di-code sign/notarize, macOS mungkin akan
memperingatkan "app tidak dikenal" saat pertama dibuka -- klik kanan
ikon app > Open > Open lagi untuk izinkan, cukup sekali saja.)

**Linux (.tar.gz):**
```
tar -xzvf HTMLRenderStudio-linux-x64.tar.gz
cd HTMLRenderStudio-linux-x64
chmod +x HTMLRenderStudio
./HTMLRenderStudio
```

## Kalau mau nambah AppImage untuk Linux nanti

File .tar.gz di atas sudah bisa langsung dipakai (portable, tinggal
extract-jalankan). Kalau suatu saat mau bentuk `.AppImage` yang bisa
double-click, itu perlu step tambahan (appimagetool + file .desktop +
icon) -- kabari saja kalau mau saya siapkan workflow tambahan untuk itu.
