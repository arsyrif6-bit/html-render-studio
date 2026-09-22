const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { nanoid } = require('nanoid');
const { dialog, shell } = require('electron');
const { createJob, getJob, listJobs, cancelJob } = require('./lib/jobs');
const { getUploadsDir, getRendersDir } = require('./lib/paths');
const { getSettings, saveSettings } = require('./lib/settings');

const app = express();
const PORT = process.env.PORT || 4321;

const UPLOADS_DIR = getUploadsDir();
const RENDERS_DIR = getRendersDir();
[UPLOADS_DIR, RENDERS_DIR].forEach((d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname, 'public')));

// Registry file HTML yang sudah diupload/terhubung: fileId -> { name, entryPath, dir, url, local }
const fileRegistry = new Map();

// ---------- Folder input yang terhubung langsung ----------
let currentInputFolder = null;
const localEntryIndex = new Map(); // entryPath absolut -> fileId (biar rescan tidak duplikat)

// Cari file .html pertama di root/subfolder (dipakai untuk ZIP maupun folder proyek)
function findHtmlRecursive(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) return full;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      const found = findHtmlRecursive(path.join(dir, entry.name));
      if (found) return found;
    }
  }
  return null;
}

// Pindai folder input: .html langsung di root jadi entri satuan; subfolder yang
// berisi .html (mis. proyek Three.js dengan aset) jadi entri gabungan.
function scanInputFolder(folderPath) {
  const results = [];
  let entries;
  try { entries = fs.readdirSync(folderPath, { withFileTypes: true }); } catch (e) { return results; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(folderPath, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      results.push({ name: entry.name, entryPath: full, dir: folderPath });
    } else if (entry.isDirectory() && entry.name !== 'node_modules') {
      const found = findHtmlRecursive(full);
      if (found) results.push({ name: entry.name, entryPath: found, dir: full });
    }
  }
  return results;
}

function registerLocalEntry(item) {
  let fileId = localEntryIndex.get(item.entryPath);
  let isNew = false;
  if (!fileId) {
    fileId = nanoid(10);
    localEntryIndex.set(item.entryPath, fileId);
    isNew = true;
  }
  const relEntry = path.relative(item.dir, item.entryPath).split(path.sep).join('/');
  const url = `/local/${fileId}/${relEntry}`;
  fileRegistry.set(fileId, { name: item.name, entryPath: item.entryPath, dir: item.dir, url, local: true });
  return { fileId, name: item.name, url, isNew };
}

function scanAndRegisterInputFolder(folderPath) {
  return scanInputFolder(folderPath).map(registerLocalEntry);
}

// Sajikan file dari folder lokal yang terhubung (di luar folder data aplikasi)
app.get('/local/:fileId/*', (req, res) => {
  const file = fileRegistry.get(req.params.fileId);
  if (!file || !file.local) return res.status(404).end();
  const rel = req.params[0] || path.basename(file.entryPath);
  const target = path.resolve(path.join(file.dir, rel));
  if (!target.startsWith(path.resolve(file.dir))) return res.status(403).end();
  res.sendFile(target, (err) => { if (err && !res.headersSent) res.status(404).end(); });
});

// Hubungkan folder input: pilih via dialog native
app.post('/api/folder/pick', async (req, res) => {
  try {
    const type = (req.body && req.body.type) || 'input';
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: type === 'output' ? 'Pilih Folder Output Video' : 'Pilih Folder Input HTML',
    });
    if (result.canceled || !result.filePaths.length) return res.json({ canceled: true });
    res.json({ canceled: false, folderPath: result.filePaths[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/folder/input', (req, res) => {
  const { folderPath } = req.body || {};
  if (!folderPath || !fs.existsSync(folderPath)) return res.status(400).json({ error: 'Folder tidak ditemukan.' });
  currentInputFolder = folderPath;
  const files = scanAndRegisterInputFolder(folderPath);
  saveSettings({ inputFolder: folderPath });
  res.json({ folderPath, files });
});

app.get('/api/folder/input/rescan', (req, res) => {
  if (!currentInputFolder || !fs.existsSync(currentInputFolder)) return res.json({ folderPath: null, files: [] });
  const files = scanAndRegisterInputFolder(currentInputFolder);
  res.json({ folderPath: currentInputFolder, files });
});

app.post('/api/folder/output', (req, res) => {
  const { folderPath } = req.body || {};
  if (!folderPath || !fs.existsSync(folderPath)) return res.status(400).json({ error: 'Folder tidak ditemukan.' });
  saveSettings({ outputFolder: folderPath });
  res.json({ ok: true, folderPath });
});

app.post('/api/folder/open', (req, res) => {
  const { folderPath } = req.body || {};
  if (folderPath && fs.existsSync(folderPath)) shell.openPath(folderPath);
  res.json({ ok: true });
});

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
  const merged = saveSettings(req.body || {});
  res.json(merged);
});

// ---------- Upload manual (tetap tersedia) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = path.join(UPLOADS_DIR, '_incoming');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => cb(null, `${nanoid(8)}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

// Upload satu atau beberapa file HTML (masing-masing jadi entri terpisah untuk bulk render)
app.post('/api/upload/html', upload.array('files'), (req, res) => {
  const results = [];
  for (const file of req.files) {
    const fileId = nanoid(10);
    const destDir = path.join(UPLOADS_DIR, fileId);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, 'index.html');
    fs.renameSync(file.path, destPath);
    fileRegistry.set(fileId, {
      name: file.originalname,
      entryPath: destPath,
      dir: destDir,
      url: `/uploads/${fileId}/index.html`,
    });
    results.push({ fileId, name: file.originalname, url: `/uploads/${fileId}/index.html` });
  }
  res.json({ files: results });
});

// Upload ZIP berisi HTML + aset (gambar/js/css) dengan path relatif dijaga
app.post('/api/upload/zip', upload.single('file'), (req, res) => {
  try {
    const fileId = nanoid(10);
    const destDir = path.join(UPLOADS_DIR, fileId);
    fs.mkdirSync(destDir, { recursive: true });
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(destDir, true);
    fs.unlinkSync(req.file.path);

    const entryPath = findHtmlRecursive(destDir);
    if (!entryPath) return res.status(400).json({ error: 'Tidak ada file .html ditemukan di dalam ZIP.' });

    const relUrl = path.relative(UPLOADS_DIR, entryPath).split(path.sep).join('/');
    fileRegistry.set(fileId, {
      name: req.file.originalname,
      entryPath,
      dir: destDir,
      url: `/uploads/${relUrl}`,
    });
    res.json({ files: [{ fileId, name: req.file.originalname, url: `/uploads/${relUrl}` }] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/files', (req, res) => {
  res.json(Array.from(fileRegistry.entries()).map(([fileId, f]) => ({ fileId, name: f.name, url: f.url })));
});

// Buat job render untuk satu atau beberapa file (bulk) dengan settings yang sama
app.post('/api/render', (req, res) => {
  const { fileIds, settings } = req.body;
  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return res.status(400).json({ error: 'fileIds kosong.' });
  }
  if (!settings || !settings.fps || !settings.duration || !settings.format) {
    return res.status(400).json({ error: 'settings tidak lengkap (fps, duration, format wajib diisi).' });
  }

  const createdJobs = [];
  for (const fileId of fileIds) {
    const file = fileRegistry.get(fileId);
    if (!file) continue;
    const baseUrl = `http://localhost:${PORT}${file.url}`;
    const job = createJob({
      fileId,
      fileName: file.name,
      sourcePath: baseUrl,
      settings,
    });
    createdJobs.push(job);
  }
  res.json({ jobs: createdJobs.map(serializeJob) });
});

app.get('/api/jobs', (req, res) => {
  res.json(listJobs().map(serializeJob));
});

app.get('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job tidak ditemukan.' });
  res.json(serializeJob(job));
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const ok = cancelJob(req.params.id);
  res.json({ ok });
});

app.get('/api/jobs/:id/download', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== 'done' || !job.outputPath) {
    return res.status(404).json({ error: 'File render belum siap.' });
  }
  res.download(job.outputPath);
});

function serializeJob(job) {
  return {
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    progress: job.progress,
    currentFrame: job.currentFrame,
    totalFrames: job.totalFrames,
    error: job.error,
    settings: job.settings,
    outputPath: job.outputPath,
    savedToFolder: job.savedToFolder || null,
    downloadUrl: job.status === 'done' ? `/api/jobs/${job.id}/download` : null,
  };
}

// Coba nyalakan server di `port`; kalau port itu sudah dipakai (mis. instance
// lama masih nyangkut), coba beberapa port berikutnya secara berurutan
// alih-alih langsung crash dengan EADDRINUSE.
function listenWithFallback(port, attemptsLeft) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => {
      console.log(`\n  HTML Render Studio jalan di: http://localhost:${port}\n`);
      resolve({ server, port });
    });
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
        server.close(() => {});
        resolve(listenWithFallback(port + 1, attemptsLeft - 1));
      } else if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} sedang dipakai dan sudah dicoba beberapa port berikutnya, semuanya penuh.`));
      } else {
        reject(err);
      }
    });
  });
}

function start(port = PORT) {
  // Kalau ada folder input tersimpan dari sesi sebelumnya, langsung terhubung lagi.
  const saved = getSettings();
  if (saved.inputFolder && fs.existsSync(saved.inputFolder)) {
    currentInputFolder = saved.inputFolder;
    scanAndRegisterInputFolder(saved.inputFolder);
  }
  return listenWithFallback(port, 10).then(({ port: actualPort }) => actualPort);
}

// Bisa dijalankan berdiri sendiri (node server.js) untuk keperluan development,
// atau di-require oleh main.js saat berjalan sebagai aplikasi Electron.
if (require.main === module) {
  start();
}

module.exports = { app, start, PORT };
