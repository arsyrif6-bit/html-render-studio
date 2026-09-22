// Preload ini dijalankan Electron SEBELUM script apapun di halaman HTML jalan
// (contextIsolation dimatikan khusus untuk window render, jadi kode ini
// langsung menimpa objek global di dunia yang sama dengan halaman).
//
// Tujuannya: bikin waktu di browser "beku" dan bisa digerakkan manual per
// frame (lewat window.__setVirtualTime), supaya requestAnimationFrame,
// Date.now(), performance.now(), setTimeout/setInterval, dan CSS
// animation/transition semua ikut waktu virtual itu -- bukan waktu asli
// mesin. Ini yang bikin hasil render presisi sesuai FPS/durasi berapapun
// kecepatan komputernya, dan sinkron persis dengan animasi aslinya.
//
// CATATAN PENTING (bug lama yang diperbaiki di sini):
// Sebelumnya kode ini men-set `Animation.currentTime` tiap frame TAPI tidak
// pernah men-`pause()` animasi-nya. Menurut spesifikasi Web Animations,
// men-set currentTime pada animasi yang statusnya masih "running" TIDAK
// menghentikannya -- animasi itu tetap jalan mengikuti jam asli di antara
// dua pemanggilan __setVirtualTime. Karena proses screenshot per frame
// (executeJavaScript + capture) makan waktu nyata yang tidak konsisten
// (beda-beda tiap frame, apalagi di resolusi tinggi/komputer lambat),
// animasi CSS jadi terus "nyelonong" maju sendiri di antara frame dengan
// kecepatan tidak menentu -- inilah penyebab utama hasil video yang kacau/
// tidak sinkron dengan animasi HTML aslinya. Fix-nya: begitu sebuah animasi
// terdeteksi, langsung di-pause supaya benar-benar cuma bergerak saat kita
// yang menggerakkannya.
(() => {
  window.__vtime = 0;
  window.__rafCallbacks = [];

  window.requestAnimationFrame = (cb) => {
    window.__rafCallbacks.push(cb);
    return window.__rafCallbacks.length;
  };
  window.cancelAnimationFrame = () => {};
  window.__flushRAF = (t) => {
    const callbacks = window.__rafCallbacks;
    window.__rafCallbacks = [];
    callbacks.forEach((cb) => { try { cb(t); } catch (e) {} });
  };

  const OriginalDate = Date;
  class FakeDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) super(window.__vtime);
      else super(...args);
    }
    static now() { return window.__vtime; }
  }
  window.Date = FakeDate;

  performance.now = () => window.__vtime;

  // ---- Virtualisasi setTimeout/setInterval ----
  // Banyak animasi HTML (terutama yang tidak pakai requestAnimationFrame)
  // digerakkan lewat setTimeout/setInterval biasa. Kalau timer ini dibiarkan
  // jalan dengan jam asli, urutannya bisa meleset dari waktu virtual per
  // frame yang sedang kita render, bikin hasil video tidak sinkron. Di sini
  // timer diubah jadi murni virtual: hanya "meletus" saat waktu virtual
  // sudah dimajukan melewati jadwalnya (dipicu dari __setVirtualTime).
  let timerSeq = 1;
  const pendingTimers = new Map(); // id -> { fireAt, interval, cb, args, cleared }

  window.setTimeout = (cb, delay = 0, ...args) => {
    const id = timerSeq++;
    pendingTimers.set(id, { fireAt: window.__vtime + Math.max(0, delay), interval: null, cb, args, cleared: false });
    return id;
  };
  window.setInterval = (cb, delay = 0, ...args) => {
    const id = timerSeq++;
    const iv = Math.max(1, delay);
    pendingTimers.set(id, { fireAt: window.__vtime + iv, interval: iv, cb, args, cleared: false });
    return id;
  };
  window.clearTimeout = (id) => { const t = pendingTimers.get(id); if (t) t.cleared = true; pendingTimers.delete(id); };
  window.clearInterval = window.clearTimeout;

  function flushTimers(ms) {
    // Batas pengaman supaya interval super pendek tidak bikin loop tak
    // berujung kalau lompatan waktu antar-frame besar (mis. FPS rendah).
    let guard = 0;
    let firedSomething = true;
    while (firedSomething && guard < 10000) {
      firedSomething = false;
      for (const [id, t] of Array.from(pendingTimers.entries())) {
        if (t.cleared) { pendingTimers.delete(id); continue; }
        if (t.fireAt <= ms) {
          firedSomething = true;
          guard++;
          try { t.cb(...t.args); } catch (e) {}
          if (t.cleared) { pendingTimers.delete(id); continue; }
          if (t.interval != null) {
            t.fireAt += t.interval;
          } else {
            pendingTimers.delete(id);
          }
        }
      }
    }
  }

  // ---- CSS Animations / Transitions (Web Animations API) ----
  const pausedAnimations = new WeakSet();

  function syncAnimations(ms) {
    if (!document.getAnimations) return;
    let list;
    try { list = document.getAnimations(); } catch (e) { return; }
    list.forEach((a) => {
      try {
        if (!pausedAnimations.has(a)) {
          // Baru ketemu: paksa pause supaya berhenti mengikuti jam asli,
          // baru setelah itu posisinya kita atur manual tiap frame.
          a.pause();
          pausedAnimations.add(a);
        }
        a.currentTime = ms;
      } catch (e) {}
    });
  }

  window.__setVirtualTime = (ms) => {
    window.__vtime = ms;
    flushTimers(ms);
    syncAnimations(ms);
  };
})();
