const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const { spawn } = require('child_process');
let ffmpegPath = require('ffmpeg-static');
// Saat dipaketkan (asar), binary ffmpeg harus diakses dari luar arsip asar.
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}

const { getRendersDir } = require('./paths');
const PRELOAD_PATH = path.join(__dirname, 'time-override-preload.js');

function resolutionFromSettings(settings) {
  const presets = {
    '1080p': { width: 1920, height: 1080 },
    '2k': { width: 2560, height: 1440 },
    '4k': { width: 3840, height: 2160 },
  };
  if (settings.resolution && presets[settings.resolution]) return presets[settings.resolution];
  return {
    width: parseInt(settings.width, 10) || 1920,
    height: parseInt(settings.height, 10) || 1080,
  };
}

// Hitung bitrate video (kbps) supaya hasil akhir MELEBIHI ukuran minimum yang
// diminta (bukan sekadar "mendekati"). Target MB diperlakukan sebagai batas
// bawah wajib, jadi kita sengaja melebihkan (bukan mengurangi) alokasi bit,
// karena rate-control encoder biasanya sedikit undershoot terutama untuk
// konten sederhana/statis. Kombinasi dengan -minrate di buildFfmpegArgs
// (mode mendekati CBR) yang benar-benar memaksa jumlah bit itu terpakai.
function bitrateForTargetSize(targetSizeMB, durationSec) {
  const OVERSHOOT_MARGIN = 1.18; // sengaja lebih besar ~18% dari target
  const targetBits = targetSizeMB * 8 * 1024 * 1024 * OVERSHOOT_MARGIN;
  const kbps = Math.ceil(targetBits / durationSec / 1000);
  return Math.max(300, kbps); // jangan sampai di bawah ambang yang bikin video hancur
}

function buildFfmpegArgs(job, outputPath, width, height, overrideKbps) {
  const fps = job.settings.fps;
  const duration = job.settings.duration;
  const format = job.settings.format; // 'mp4' | 'mov-alpha'
  const quality = job.settings.quality || 'medium';
  const crfMap = { high: '16', medium: '21', low: '28' };
  const targetSizeMB = parseFloat(job.settings.targetSizeMB);

  const args = ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0'];

  if (format === 'mov-alpha') {
    // ProRes+alpha tidak mendukung target bitrate presisi seperti H.264; tetap qscale bawaan.
    args.push('-c:v', 'prores_ks', '-pix_fmt', 'yuva444p10le', '-profile:v', '4', '-vendor', 'ap10');
  } else if ((overrideKbps || (targetSizeMB && targetSizeMB > 0)) && duration > 0) {
    const kbps = overrideKbps || bitrateForTargetSize(targetSizeMB, duration);
    job.appliedBitrateKbps = kbps;
    args.push(
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
      // -minrate sama dengan -b:v => encoder dipaksa mode mendekati CBR
      // (mengisi bit filler kalau perlu) supaya ukuran file TIDAK jatuh di
      // bawah target, bukan cuma "mendekati" seperti sebelumnya.
      '-b:v', `${kbps}k`, '-minrate', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.45)}k`,
      '-bufsize', `${Math.round(kbps * 2)}k`
    );
  } else {
    args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', crfMap[quality] || '18', '-preset', 'medium');
  }

  args.push('-vf', `scale=${width}:${height}:flags=lanczos`);
  args.push('-r', String(fps));
  args.push(outputPath);
  return args;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Menunggu satu frame OSR baru dan mengembalikan gambarnya (NativeImage).
// Dengan animasi CSS yang sekarang benar-benar di-pause (lihat
// time-override-preload.js), tidak ada lagi paint "nyasar" dari jam asli di
// latar belakang, jadi event 'paint' berikutnya sudah pasti hasil dari
// invalidate() ini. Sebagai jaga-jaga tambahan (mis. tab dilempar ke latar
// belakang oleh OS/GPU sedang sibuk), ada retry dengan timeout supaya proses
// tidak nge-hang selamanya dan malah dilaporkan "error".
function captureOneFrame(win, attempt = 1) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onPaint = (_event, _dirty, image) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(image);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      win.webContents.removeListener('paint', onPaint);
      if (attempt < 5 && !win.isDestroyed()) {
        captureOneFrame(win, attempt + 1).then(resolve, reject);
      } else {
        reject(new Error('Timeout menunggu frame render (paint) dari halaman HTML.'));
      }
    }, 4000);
    win.webContents.once('paint', onPaint);
    win.webContents.invalidate();
  });
}

function sanitizeFileName(name) {
  return (name || 'render').replace(/\.[^/.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'render';
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// Tentukan folder & nama file output. Kalau user sudah pilih folder output
// langsung (di laptop), file dirender langsung ke sana. Kalau tidak, jatuh
// ke folder data aplikasi seperti biasa (lewat tombol Unduh).
function resolveOutputPath(job) {
  const ext = job.settings.format === 'mov-alpha' ? 'mov' : 'mp4';
  const base = sanitizeFileName(job.fileName);
  const fileName = `${base}_${job.settings.resolution || 'custom'}_${job.settings.fps}fps_${timestamp()}.${ext}`;

  const outputFolder = job.settings.outputFolder;
  if (outputFolder && fs.existsSync(outputFolder)) {
    return { outputPath: path.join(outputFolder, fileName), savedToFolder: outputFolder };
  }
  const rendersDir = getRendersDir();
  if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
  return { outputPath: path.join(rendersDir, fileName), savedToFolder: null };
}

// Re-encode file MP4 yang sudah jadi ke bitrate lebih tinggi kalau ukurannya
// masih di bawah target minimum. Transcode dari video yang sudah ada jauh
// lebih cepat daripada merender ulang HTML dari nol, dan cukup untuk
// menjamin ukuran akhir memenuhi permintaan user.
function bumpOutputSize(outputPath, targetSizeMB, duration) {
  return new Promise((resolve, reject) => {
    const targetBytes = targetSizeMB * 1024 * 1024;
    let actual;
    try { actual = fs.statSync(outputPath).size; } catch (e) { return resolve(); }
    if (actual >= targetBytes) return resolve();

    const bumpedKbps = Math.max(
      300,
      Math.ceil((targetBytes * 8) / duration / 1000 * 1.25) // ekstra 25% dari kekurangan
    );
    const tmpPath = outputPath + '.bump.mp4';
    const args = [
      '-y', '-i', outputPath,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium',
      '-b:v', `${bumpedKbps}k`, '-minrate', `${bumpedKbps}k`, '-maxrate', `${Math.round(bumpedKbps * 1.45)}k`,
      '-bufsize', `${Math.round(bumpedKbps * 2)}k`,
      '-c:a', 'copy',
      tmpPath,
    ];
    const ffmpeg = spawn(ffmpegPath, args);
    let ffmpegErr = '';
    ffmpeg.stderr.on('data', (d) => { ffmpegErr += d.toString(); });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
        return reject(new Error(`FFmpeg (bump ukuran) keluar dengan kode ${code}: ${ffmpegErr.slice(-800)}`));
      }
      try {
        fs.renameSync(tmpPath, outputPath);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function renderHtmlToVideo(job) {
  const { width, height } = resolutionFromSettings(job.settings);
  const fps = job.settings.fps;
  const duration = job.settings.duration;
  const format = job.settings.format;
  // Transparansi cuma valid untuk MOV+Alpha (ProRes 4444). Untuk MP4/H.264
  // yang tidak punya kanal alpha, memaksa window transparan cuma bikin area
  // "kosong" jadi hitam solid tak terduga saat di-flatten ffmpeg -- jadi
  // toggle "Latar transparan" sengaja diabaikan di luar mode MOV+Alpha.
  const transparent = format === 'mov-alpha' && !!job.settings.transparent;
  job.totalFrames = Math.max(1, Math.round(fps * duration));

  const { outputPath, savedToFolder } = resolveOutputPath(job);
  job.savedToFolder = savedToFolder;

  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent,
    backgroundColor: transparent ? '#00000000' : '#FFFFFFFF',
    webPreferences: {
      offscreen: true,
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      preload: PRELOAD_PATH,
    },
  });

  const ffmpeg = spawn(ffmpegPath, buildFfmpegArgs(job, outputPath, width, height));
  let ffmpegErr = '';
  ffmpeg.stderr.on('data', (d) => { ffmpegErr += d.toString(); });
  const ffmpegDone = new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg keluar dengan kode ${code}: ${ffmpegErr.slice(-800)}`));
    });
  });

  try {
    await new Promise((resolve, reject) => {
      win.webContents.once('did-finish-load', resolve);
      win.webContents.once('did-fail-load', (_e, _code, desc) => reject(new Error(`Gagal memuat HTML: ${desc}`)));
      win.loadURL(job.sourcePath);
    });

    // Beri waktu script halaman (mis. inisialisasi Three.js) untuk siap.
    await delay(80);

    const frameIntervalMs = 1000 / fps;

    for (let i = 0; i < job.totalFrames; i++) {
      if (job.cancelRequested) break;
      const t = i * frameIntervalMs;
      await win.webContents.executeJavaScript(
        `window.__setVirtualTime(${t}); window.__flushRAF(${t});`
      );

      const image = await captureOneFrame(win);
      const buffer = image.toPNG();

      await new Promise((resolve, reject) => {
        ffmpeg.stdin.write(buffer, (err) => (err ? reject(err) : resolve()));
      });

      job.currentFrame = i + 1;
      job.progress = job.currentFrame / job.totalFrames;
    }

    ffmpeg.stdin.end();
    await ffmpegDone;

    if (!job.cancelRequested) {
      job.outputPath = outputPath;

      // Jaring pengaman terakhir: kalau target ukuran minimum diminta tapi
      // hasil rate-control encoder masih kurang (mis. konten sangat
      // sederhana/statis), transcode cepat sekali lagi ke bitrate lebih
      // tinggi supaya ukuran akhir benar-benar >= target yang diminta.
      const targetSizeMB = parseFloat(job.settings.targetSizeMB);
      if (format !== 'mov-alpha' && targetSizeMB && targetSizeMB > 0) {
        try {
          await bumpOutputSize(outputPath, targetSizeMB, duration);
        } catch (err) {
          console.error('Gagal menaikkan ukuran file ke target minimum:', err.message);
        }
      }
    }
  } finally {
    if (!win.isDestroyed()) win.destroy();
    if (!ffmpeg.killed) { try { ffmpeg.kill('SIGKILL'); } catch (e) {} }
  }
}

module.exports = { renderHtmlToVideo };
