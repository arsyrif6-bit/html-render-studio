const state = {
  files: [],        // { fileId, name, url }
  selectedId: null,
  resolution: '1080p',
  fps: 30,
  format: 'mp4',
  quality: 'medium',
  inputFolder: null,
  outputFolder: null,
  watchFolder: false,
};

const el = (id) => document.getElementById(id);

const fileList = el('fileList');
const fileCount = el('fileCount');
const previewFrame = el('previewFrame');
const previewEmpty = el('previewEmpty');
const previewMeta = el('previewMeta');
const estRow = el('estRow');
const jobList = el('jobList');
const jobCount = el('jobCount');
const recDot = el('recDot');
const statusText = el('statusText');
const inputFolderPath = el('inputFolderPath');
const outputFolderPath = el('outputFolderPath');

// ---------- Berkas: helper tambah tanpa duplikat ----------
function addFiles(list) {
  let added = 0;
  list.forEach((f) => {
    if (!state.files.some((x) => x.fileId === f.fileId)) {
      state.files.push({ fileId: f.fileId, name: f.name, url: f.url });
      added++;
    }
  });
  if (added) renderFileList();
  if (!state.selectedId && state.files.length) selectFile(state.files[0].fileId);
  return added;
}

// ---------- Upload manual ----------
el('inputHtml').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const res = await fetch('/api/upload/html', { method: 'POST', body: fd });
  const data = await res.json();
  addFiles(data.files);
  e.target.value = '';
});

el('inputZip').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/upload/zip', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  addFiles(data.files);
  e.target.value = '';
});

// ---------- Folder input (terhubung langsung) ----------
let watchIntervalId = null;

el('pickInputBtn').addEventListener('click', async () => {
  const pick = await fetch('/api/folder/pick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'input' }),
  }).then((r) => r.json());
  if (pick.canceled || !pick.folderPath) return;
  await connectInputFolder(pick.folderPath);
});

el('rescanInputBtn').addEventListener('click', () => rescanInputFolder(true));

el('watchFolderToggle').addEventListener('change', (e) => {
  state.watchFolder = e.target.checked;
  if (state.watchFolder) {
    if (!watchIntervalId) watchIntervalId = setInterval(() => rescanInputFolder(false), 3000);
  } else if (watchIntervalId) {
    clearInterval(watchIntervalId);
    watchIntervalId = null;
  }
});

async function connectInputFolder(folderPath) {
  const res = await fetch('/api/folder/input', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  state.inputFolder = data.folderPath;
  inputFolderPath.textContent = data.folderPath;
  addFiles(data.files);
}

async function rescanInputFolder(manual) {
  const res = await fetch('/api/folder/input/rescan');
  const data = await res.json();
  if (!data.folderPath) return;
  const added = addFiles(data.files);
  if (manual && added === 0) {
    statusText.textContent = 'tidak ada berkas baru';
    setTimeout(() => { if (!jobsActive()) statusText.textContent = 'idle'; }, 1500);
  }
}

function jobsActive() {
  return recDot.classList.contains('active');
}

// ---------- Folder output ----------
el('pickOutputBtn').addEventListener('click', async () => {
  const pick = await fetch('/api/folder/pick', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'output' }),
  }).then((r) => r.json());
  if (pick.canceled || !pick.folderPath) return;
  const res = await fetch('/api/folder/output', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: pick.folderPath }),
  }).then((r) => r.json());
  if (res.error) { alert(res.error); return; }
  state.outputFolder = pick.folderPath;
  outputFolderPath.textContent = pick.folderPath;
});

el('openOutputBtn').addEventListener('click', () => {
  const folder = state.outputFolder;
  if (!folder) { alert('Belum ada folder output yang dipilih.'); return; }
  fetch('/api/folder/open', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath: folder }),
  });
});

// ---------- Muat pengaturan tersimpan saat aplikasi dibuka ----------
(async function loadSettings() {
  const s = await fetch('/api/settings').then((r) => r.json()).catch(() => ({}));
  if (s.outputFolder) {
    state.outputFolder = s.outputFolder;
    outputFolderPath.textContent = s.outputFolder;
  }
  if (s.inputFolder) {
    state.inputFolder = s.inputFolder;
    inputFolderPath.textContent = s.inputFolder;
    rescanInputFolder(false);
  }
  const filesRes = await fetch('/api/files').then((r) => r.json()).catch(() => []);
  if (filesRes.length) addFiles(filesRes);
})();

function renderFileList() {
  fileCount.textContent = state.files.length;
  fileList.innerHTML = '';
  state.files.forEach((f) => {
    const li = document.createElement('li');
    li.className = 'file-item' + (f.fileId === state.selectedId ? ' selected' : '');
    li.innerHTML = `<span class="fname" title="${f.name}">${f.name}</span><button class="remove" title="Hapus">✕</button>`;
    li.querySelector('.fname').addEventListener('click', () => selectFile(f.fileId));
    li.querySelector('.remove').addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.files = state.files.filter((x) => x.fileId !== f.fileId);
      if (state.selectedId === f.fileId) state.selectedId = null;
      renderFileList();
      updatePreview();
    });
    fileList.appendChild(li);
  });
}

function selectFile(fileId) {
  state.selectedId = fileId;
  renderFileList();
  updatePreview();
}

function updatePreview() {
  const f = state.files.find((x) => x.fileId === state.selectedId);
  if (!f) {
    previewFrame.src = 'about:blank';
    previewEmpty.style.display = 'flex';
    previewMeta.textContent = '—';
    return;
  }
  previewEmpty.style.display = 'none';
  previewFrame.src = f.url;
  previewMeta.textContent = f.name;
}

// ---------- Settings chips ----------
document.querySelectorAll('#resChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#resChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.resolution = chip.dataset.res;
    updateEstimate();
  });
});
document.querySelectorAll('#formatChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#formatChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.format = chip.dataset.format;
    syncTransparentToggle();
    updateEstimate();
  });
});

// Latar transparan cuma berlaku untuk MOV+Alpha (MP4/H.264 tidak punya
// kanal alpha), jadi toggle-nya dikunci & dimatikan otomatis di format lain
// supaya tidak ada ekspektasi transparansi yang tidak akan pernah muncul.
function syncTransparentToggle() {
  const toggle = el('transparentToggle');
  const isAlpha = state.format === 'mov-alpha';
  toggle.disabled = !isAlpha;
  if (!isAlpha) toggle.checked = false;
}
syncTransparentToggle();
document.querySelectorAll('#qualityChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#qualityChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.quality = chip.dataset.quality;
  });
});
document.querySelectorAll('#fpsChips .chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#fpsChips .chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.fps = parseInt(chip.dataset.fps, 10);
    updateEstimate();
  });
});

el('durationInput').addEventListener('input', updateEstimate);
el('sizeLimitInput').addEventListener('input', updateEstimate);
el('sizeLimitToggle').addEventListener('change', updateEstimate);

function updateEstimate() {
  const duration = parseFloat(el('durationInput').value) || 0;
  const totalFrames = Math.round(duration * state.fps);
  let text = `≈ ${totalFrames} frame akan dirender (${state.fps} FPS × ${duration}s)`;
  if (el('sizeLimitToggle').checked && state.format === 'mp4') {
    const mb = parseFloat(el('sizeLimitInput').value) || 0;
    if (mb > 0) text += ` · minimal ${mb}MB`;
  }
  estRow.textContent = text;
}
updateEstimate();

function currentSettings() {
  return {
    resolution: state.resolution,
    fps: state.fps,
    duration: parseFloat(el('durationInput').value) || 5,
    format: state.format,
    transparent: el('transparentToggle').checked,
    quality: state.quality,
    targetSizeMB: (el('sizeLimitToggle').checked && state.format === 'mp4')
      ? (parseFloat(el('sizeLimitInput').value) || null) : null,
    outputFolder: state.outputFolder || null,
  };
}

// ---------- Render actions ----------
let pendingBatch = null; // { ids:Set, autoOpen:bool }

el('renderOneBtn').addEventListener('click', () => {
  if (!state.selectedId) { alert('Pilih berkas dulu di panel kiri.'); return; }
  submitRender([state.selectedId]);
});

el('renderAllBtn').addEventListener('click', () => {
  if (!state.files.length) { alert('Belum ada berkas untuk dirender.'); return; }
  submitRender(state.files.map((f) => f.fileId));
});

async function submitRender(fileIds) {
  const settings = currentSettings();
  const res = await fetch('/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds, settings }),
  });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  pendingBatch = {
    ids: new Set(data.jobs.map((j) => j.id)),
    autoOpen: el('autoOpenToggle').checked && !!state.outputFolder,
  };
  pollJobs();
}

// ---------- Job polling ----------
async function pollJobs() {
  const res = await fetch('/api/jobs');
  const jobs = await res.json();
  renderJobs(jobs);
  const anyActive = jobs.some((j) => j.status === 'queued' || j.status === 'rendering');
  recDot.classList.toggle('active', anyActive);
  statusText.textContent = anyActive ? 'rendering…' : 'idle';

  if (pendingBatch) {
    const relevant = jobs.filter((j) => pendingBatch.ids.has(j.id));
    const allDone = relevant.length > 0 && relevant.every((j) => ['done', 'error', 'canceled'].includes(j.status));
    if (allDone) {
      if (pendingBatch.autoOpen) {
        fetch('/api/folder/open', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: state.outputFolder }),
        });
      }
      pendingBatch = null;
    }
  }

  if (anyActive) setTimeout(pollJobs, 700);
}
pollJobs();
setInterval(pollJobs, 4000); // jaga-jaga kalau polling aktif berhenti

function renderJobs(jobs) {
  jobCount.textContent = `${jobs.length} job`;
  if (!jobs.length) {
    jobList.innerHTML = '<div class="empty-note">Belum ada proses render.</div>';
    return;
  }
  jobList.innerHTML = '';
  jobs.forEach((j) => {
    const pct = Math.round((j.progress || 0) * 100);
    const div = document.createElement('div');
    div.className = 'job-item';
    const savedNote = j.status === 'done' && j.savedToFolder
      ? `<div class="job-saved">✓ tersimpan di ${j.savedToFolder}</div>` : '';
    div.innerHTML = `
      <div class="job-top">
        <span class="job-name">${j.fileName}</span>
        <span class="job-badge ${j.status}">${labelStatus(j.status)}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="job-bottom">
        <span class="job-meta">${j.currentFrame}/${j.totalFrames || '—'} frame · ${j.settings.resolution} · ${j.settings.fps}fps · ${j.settings.format}</span>
        ${j.status === 'done' && !j.savedToFolder ? `<a class="job-download" href="${j.downloadUrl}">Unduh</a>` : ''}
      </div>
      ${savedNote}
      ${j.error ? `<div class="job-error-text">${j.error}</div>` : ''}
    `;
    jobList.appendChild(div);
  });
}

function labelStatus(s) {
  return { queued: 'antre', rendering: 'merender', done: 'selesai', error: 'gagal', canceled: 'dibatalkan' }[s] || s;
}
