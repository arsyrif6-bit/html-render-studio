#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
  echo "============================================"
  echo "  Node.js belum terinstal di komputer ini."
  echo "  Download dulu di: https://nodejs.org"
  echo "  (pilih versi LTS), install, lalu jalankan"
  echo "  file ini lagi."
  echo "============================================"
  read -p "Tekan Enter untuk keluar..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "============================================"
  echo "  Instalasi pertama kali, mohon tunggu..."
  echo "  (butuh koneksi internet, bisa beberapa menit)"
  echo "============================================"
  npm install || { echo "Instalasi gagal."; read -p "Tekan Enter untuk keluar..."; exit 1; }
fi

npm start
