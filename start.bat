@echo off
title HTML Render Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo ============================================
  echo   Node.js belum terinstal di komputer ini.
  echo   Download dulu di: https://nodejs.org
  echo   ^(pilih versi LTS^), install, lalu jalankan
  echo   file ini lagi.
  echo ============================================
  pause
  exit /b
)

if not exist node_modules (
  echo ============================================
  echo   Instalasi pertama kali, mohon tunggu...
  echo   ^(butuh koneksi internet, bisa beberapa menit^)
  echo ============================================
  call npm install
  if errorlevel 1 (
    echo.
    echo Instalasi gagal. Cek pesan error di atas.
    pause
    exit /b
  )
)

call npm start
