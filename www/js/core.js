// Utilitaires partagés : hasard déterministe, sauvegarde, helpers.
(function () {
  'use strict';

  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  // Générateur pseudo-aléatoire mulberry32 : même graine = même puzzle.
  function makeRng(seed) {
    let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    const rng = function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (n) => Math.floor(rng() * n);
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    return rng;
  }

  const STORE_KEY = 'odysseum.v1';

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* stockage indisponible */ }
    return {};
  }

  let store = loadStore();
  store.games = store.games || {};
  store.daily = store.daily || {};
  store.streak = store.streak || { count: 0, last: null };
  store.settings = store.settings || { sound: true, vibrate: true };

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
  }

  function gameData(id) {
    if (!store.games[id]) store.games[id] = { level: 1, solved: 0, best: null, totalTime: 0 };
    return store.games[id];
  }

  function todayKey(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  if (store.settings.music == null) store.settings.music = true;
  if (store.settings.mix == null) store.settings.mix = 50;

  // ------------------------------------------------------------------
  // Audio : deux bus (effets / musique) et un curseur de mixage.
  // Tout est synthétisé, aucun fichier audio à embarquer.
  // ------------------------------------------------------------------
  let audioCtx = null, sfxBus = null, musicBus = null, noiseBuf = null;

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sfxBus = audioCtx.createGain();
      musicBus = audioCtx.createGain();
      // espace sonore : filtre doux + écho léger, partagé par effets et musique
      const soft = audioCtx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 2400;
      const delay = audioCtx.createDelay(2);
      delay.delayTime.value = 0.42;
      const fb = audioCtx.createGain();
      fb.gain.value = 0.38;
      const wet = audioCtx.createGain();
      wet.gain.value = 0.35;
      sfxBus.connect(soft);
      musicBus.connect(soft);
      soft.connect(audioCtx.destination);
      soft.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(wet).connect(audioCtx.destination);
      noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.5, audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyMix();
    } catch (e) { audioCtx = null; }
    return audioCtx;
  }

  // mix 0 = que les effets, 50 = les deux à fond, 100 = que la musique
  function applyMix() {
    if (!audioCtx) return;
    const m = store.settings.mix / 100;
    const t = audioCtx.currentTime;
    sfxBus.gain.setTargetAtTime(store.settings.sound ? Math.min(1, 2 * (1 - m)) : 0, t, 0.05);
    musicBus.gain.setTargetAtTime(store.settings.music ? Math.min(1, 2 * m) * 0.9 : 0, t, 0.3);
  }

  function tone(bus, freq, start, dur, type, vol) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.02);
    return o;
  }

  function noise(bus, start, dur, vol, hp) {
    const s = audioCtx.createBufferSource();
    s.buffer = noiseBuf;
    const f = audioCtx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(start);
    s.stop(start + dur + 0.02);
  }

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Cloche douce : attaque courte, longue extinction, harmonique discrète.
  function bell(bus, freq, start, dur, vol) {
    [[1, 1], [2.01, 0.25], [3.0, 0.08]].forEach(([mult, v]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * mult, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(vol * v, start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur / mult);
      o.connect(g).connect(bus);
      o.start(start);
      o.stop(start + dur + 0.05);
    });
  }

  function chime(freq, dur, vol) {
    if (!store.settings.sound || !ensureAudio()) return;
    try { bell(sfxBus, freq, audioCtx.currentTime, dur, vol); } catch (e) { /* ignore */ }
  }

  // --- Nappe ambiante générative : accords lents + cloches espacées ---
  const CHORDS = [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 52]]; // Cmaj7 Am7 Fmaj7 G6
  const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
  const music = { timer: null, chord: 0, nextChord: 0, nextBell: 0 };

  function pad(notes, start, len) {
    notes.forEach((m, i) => {
      [0, 4].forEach((detune) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = detune ? 'triangle' : 'sine';
        o.frequency.setValueAtTime(midi(m + (i === 0 ? -12 : 0)), start);
        o.detune.value = detune;
        const v = detune ? 0.012 : 0.03;
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(v, start + len * 0.35);
        g.gain.linearRampToValueAtTime(v * 0.8, start + len * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, start + len * 1.25);
        o.connect(g).connect(musicBus);
        o.start(start);
        o.stop(start + len * 1.3);
      });
    });
  }

  function schedule() {
    const now = audioCtx.currentTime;
    const len = 10;
    while (music.nextChord < now + 1.5) {
      pad(CHORDS[music.chord % CHORDS.length], music.nextChord, len);
      music.chord++;
      music.nextChord += len;
    }
    while (music.nextBell < now + 1.5) {
      if (Math.random() < 0.75) bell(musicBus, midi(PENTA[Math.floor(Math.random() * PENTA.length)]), music.nextBell, 4.5, 0.035);
      music.nextBell += 2.5 + Math.random() * 4.5;
    }
  }

  function startMusic() {
    if (music.timer || !store.settings.music || !ensureAudio()) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    music.nextChord = audioCtx.currentTime + 0.1;
    music.nextBell = audioCtx.currentTime + 3;
    music.timer = setInterval(schedule, 400);
  }
  function stopMusic() {
    clearInterval(music.timer);
    music.timer = null;
  }

  const audio = {
    // à appeler sur un geste de l'utilisateur (règle des navigateurs)
    unlock() {
      if (!ensureAudio()) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (store.settings.music) startMusic();
    },
    setSound(on) { store.settings.sound = on; applyMix(); save(); },
    setMusic(on) { store.settings.music = on; applyMix(); if (on) startMusic(); else stopMusic(); save(); },
    setMix(v) { store.settings.mix = v; applyMix(); save(); }
  };

  document.addEventListener('visibilitychange', () => {
    if (!audioCtx) return;
    if (document.hidden) audioCtx.suspend(); else audioCtx.resume();
  });

  function vibrate(ms) {
    if (store.settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
  }

  const sfx = {
    // carillons feutrés, jamais agressifs
    tap: () => { chime(midi(84), 0.5, 0.025); },
    place: () => { chime(midi(79), 1.4, 0.045); vibrate(5); },
    error: () => { chime(midi(62), 0.9, 0.03); vibrate(12); },
    win: () => {
      [72, 76, 79, 83, 84].forEach((m, i) => setTimeout(() => chime(midi(m), 3, 0.05), i * 220));
      vibrate(15);
    }
  };

  // Chemin passant une fois par chaque case d'une grille w×h :
  // serpentin de départ puis mélange par « backbite ».
  function gridPath(w, h, rng) {
    const path = [];
    for (let r = 0; r < h; r++) {
      for (let k = 0; k < w; k++) path.push(r * w + (r % 2 ? w - 1 - k : k));
    }
    const pos = new Int32Array(w * h);
    path.forEach((v, i) => { pos[v] = i; });
    const nbs = (v) => {
      const r = Math.floor(v / w), c = v % w, out = [];
      if (r > 0) out.push(v - w);
      if (r < h - 1) out.push(v + w);
      if (c > 0) out.push(v - 1);
      if (c < w - 1) out.push(v + 1);
      return out;
    };
    const moves = w * h * 40;
    for (let m = 0; m < moves; m++) {
      if (rng() < 0.5) { path.reverse(); path.forEach((v, i) => { pos[v] = i; }); }
      const last = path.length - 1;
      const nb = rng.pick(nbs(path[last]));
      if (nb === path[last - 1]) continue;
      let a = pos[nb] + 1, b = last;
      while (a < b) {
        const t = path[a]; path[a] = path[b]; path[b] = t;
        pos[path[a]] = a; pos[path[b]] = b;
        a++; b--;
      }
    }
    return path;
  }

  window.Carnet = {
    makeRng, hashString, store, save, gameData, todayKey, formatTime, sfx, gridPath, audio,
    games: [],
    register(game) { this.games.push(game); }
  };
})();
