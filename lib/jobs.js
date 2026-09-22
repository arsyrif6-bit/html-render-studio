const { nanoid } = require('nanoid');
const { renderHtmlToVideo } = require('./capture');

// Semua job disimpan di memori (aplikasi ini untuk pemakaian lokal/pribadi).
const jobs = new Map();
const queue = [];
let isProcessing = false;

function createJob({ fileId, fileName, sourcePath, settings }) {
  const id = nanoid(10);
  const job = {
    id,
    fileId,
    fileName,
    sourcePath,
    settings,
    status: 'queued', // queued | rendering | done | error | canceled
    progress: 0,
    totalFrames: 0,
    currentFrame: 0,
    outputPath: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(id, job);
  queue.push(id);
  processQueue();
  return job;
}

function getJob(id) {
  return jobs.get(id);
}

function listJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (job.status === 'queued') {
    job.status = 'canceled';
    const idx = queue.indexOf(id);
    if (idx >= 0) queue.splice(idx, 1);
    return true;
  }
  if (job.status === 'rendering') {
    job.cancelRequested = true;
    return true;
  }
  return false;
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  while (queue.length > 0) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job || job.status === 'canceled') continue;

    job.status = 'rendering';
    job.startedAt = Date.now();
    try {
      await renderHtmlToVideo(job);
      if (job.cancelRequested) {
        job.status = 'canceled';
      } else {
        job.status = 'done';
        job.progress = 1;
      }
    } catch (err) {
      console.error(`Render gagal untuk job ${id}:`, err);
      job.status = 'error';
      job.error = err.message || String(err);
    }
    job.finishedAt = Date.now();
  }
  isProcessing = false;
}

module.exports = { createJob, getJob, listJobs, cancelJob };
