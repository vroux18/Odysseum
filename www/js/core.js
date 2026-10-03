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
  // Audio : tout est synthétisé en WebAudio, aucun fichier à embarquer.
  //   effets  → sfxBus ─────────────────────────┐
  //   musique → musicBus → duck → tone (passe-bas jour/nuit) ┼→ master → compresseur → sortie
  //   les deux envoient une part dans une réverbération (salle de pierre douce) ─┘
  // Le curseur de mixage dose les deux bus ; sound / music les coupent.
  // ------------------------------------------------------------------
  let audioCtx = null, sfxBus = null, musicBus = null, noiseBuf = null, brownBuf = null;
  let duckGain = null, toneFilter = null, master = null, verbIn = null;

  // réponse impulsionnelle de réverbération : bruit stéréo qui s'éteint (≈ 2,6 s), un peu sombre
  function makeImpulse(ctx, sec) {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        lp += (Math.random() * 2 - 1 - lp) * (0.55 - 0.4 * k); // plus la queue avance, plus elle s'assombrit
        d[i] = lp * Math.pow(1 - k, 2.6) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  function ensureAudio() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor(); // filet de sécurité : jamais de pic désagréable
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      master.connect(comp).connect(ctx.destination);
      // réverbération partagée
      verbIn = ctx.createGain();
      const verb = ctx.createConvolver();
      verb.buffer = makeImpulse(ctx, 2.6);
      const verbOut = ctx.createGain();
      verbOut.gain.value = 0.6;
      verbIn.connect(verb).connect(verbOut).connect(master);
      // effets
      sfxBus = ctx.createGain();
      sfxBus.connect(master);
      const sfxSend = ctx.createGain();
      sfxSend.gain.value = 0.22;
      sfxBus.connect(sfxSend).connect(verbIn);
      // musique : atténuée pendant les casse-têtes, plus feutrée la nuit
      musicBus = ctx.createGain();
      duckGain = ctx.createGain();
      toneFilter = ctx.createBiquadFilter();
      toneFilter.type = 'lowpass';
      toneFilter.frequency.value = 5000;
      toneFilter.Q.value = 0.3;
      musicBus.connect(duckGain).connect(toneFilter).connect(master);
      const musicSend = ctx.createGain();
      musicSend.gain.value = 0.5;
      toneFilter.connect(musicSend).connect(verbIn);
      // bruits : blanc (courts éclats) et brun (la mer, en boucle)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      brownBuf = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate);
      const b = brownBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
      // fondu aux bords de la boucle (pas de clic)
      const edge = 2000;
      for (let i = 0; i < edge; i++) { const k = i / edge; b[i] *= k; b[b.length - 1 - i] *= k; }
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

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // panoramique (si le navigateur le permet)
  function panNode(pan) {
    if (!pan || !audioCtx.createStereoPanner) return null;
    const p = audioCtx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }
  function out(node, bus, pan) {
    const p = panNode(pan);
    if (p) node.connect(p).connect(bus); else node.connect(bus);
  }

  function tone(bus, freq, start, dur, type, vol) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.02);
    return o;
  }

  // éclat de bruit filtré (clic de bois, souffle, écume)
  function noise(bus, start, dur, vol, type, freq, q, pan) {
    const s = audioCtx.createBufferSource();
    s.buffer = noiseBuf;
    const f = audioCtx.createBiquadFilter();
    f.type = type || 'highpass';
    f.frequency.value = freq || 1000;
    if (q) f.Q.value = q;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g);
    out(g, bus, pan);
    s.start(start, Math.random() * 1.5);
    s.stop(start + dur + 0.02);
    return f;
  }

  // Corde pincée (lyre / harpe) : triangle + harmoniques sinus, filtre qui se referme vite.
  function pluck(bus, freq, start, vol, dur, bright, pan) {
    dur = dur || 1.6; bright = bright == null ? 1 : bright;
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(Math.min(12000, freq * (4 + 6 * bright)), start);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), start + 0.35);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.004);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, start + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    f.connect(g);
    out(g, bus, pan);
    [[1, 'triangle', 1], [2, 'sine', 0.35], [3.01, 'sine', 0.12]].forEach(([mult, type, v]) => {
      const o = audioCtx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult, start);
      let node = o;
      if (v !== 1) { const h = audioCtx.createGain(); h.gain.value = v; o.connect(h); node = h; }
      node.connect(f);
      o.start(start);
      o.stop(start + (mult > 1 ? dur * 0.5 : dur) + 0.05);
    });
  }

  // Cloche douce : attaque courte, longue extinction, harmonique discrète.
  function bell(bus, freq, start, dur, vol, pan) {
    const g0 = audioCtx.createGain();
    out(g0, bus, pan);
    [[1, 1], [2.01, 0.25], [3.0, 0.08], [4.17, 0.03]].forEach(([mult, v]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq * mult, start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(vol * v, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur / mult);
      o.connect(g).connect(g0);
      o.start(start);
      o.stop(start + dur / mult + 0.05);
    });
  }

  // un effet n'est joué que si le son est actif et le contexte disponible
  function fx(play) {
    if (!store.settings.sound || !ensureAudio()) return;
    try { play(audioCtx.currentTime + 0.005); } catch (e) { console.warn('son', e); } // (jamais bloquant)
  }

  // ------------------------------------------------------------------
  // Musique générative : mode dorien de ré (couleur grecque, ni triste ni sucrée), ~70 bpm.
  // Nappe chaude (dents de scie filtrées), basse ronde, arpèges de lyre qui changent à chaque
  // mesure, mélodie lente une phrase sur deux, ressac de la mer, mouettes de jour, vent la nuit.
  // Les progressions sont tirées au hasard (jamais deux fois la même d'affilée).
  // ------------------------------------------------------------------
  const BPM = 70, BEAT = 60 / BPM, BAR = BEAT * 4;
  const CH = {
    Dm7: [50, 53, 57, 60], Cadd9: [48, 52, 55, 62], Fmaj7: [53, 57, 60, 64], G69: [55, 59, 62, 64],
    Am7: [45, 52, 55, 60], Em7: [52, 55, 59, 62], Bdim: [47, 50, 53, 57]
  };
  const PROGS = [
    ['Dm7', 'Cadd9', 'Fmaj7', 'G69'],
    ['Fmaj7', 'G69', 'Am7', 'Dm7'],
    ['Dm7', 'Am7', 'Cadd9', 'G69'],
    ['Fmaj7', 'Cadd9', 'Dm7', 'Em7'],
    ['Dm7', 'G69', 'Dm7', 'Cadd9']
  ];
  const SCALE = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86]; // ré dorien, deux octaves
  const PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];                       // ré mineur pentatonique
  const music = { timer: null, nextBar: 0, bar: 0, prog: 0, chord: null, phrase: 0, melody: false, mel: 7,
    sea: null, nextSwell: 0, nextGull: 0, nextWind: 0, duck: null, light: 1 };

  // lumière du monde : 1 = plein jour, 0 = nuit (si le monde 3D est là)
  function daylight() {
    try {
      const W = window.Carnet && window.Carnet.world;
      if (W && W.ok && W.lightInfo) return 1 - Math.max(0, Math.min(1, W.lightInfo().night));
    } catch (e) { /* ignore */ }
    return 1;
  }
  // pendant un casse-tête, la musique se fait plus discrète
  function inPuzzle() {
    const p = document.getElementById('play');
    return !!(p && !p.hidden);
  }

  function pad(notes, start, len, light) {
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.5;
    const cut = 520 + 700 * light;
    f.frequency.setValueAtTime(cut * 0.7, start);
    f.frequency.linearRampToValueAtTime(cut, start + len * 0.5);   // la nappe « s'ouvre » lentement
    f.frequency.linearRampToValueAtTime(cut * 0.75, start + len * 1.2);
    const g = audioCtx.createGain();
    const v = 0.022;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(v, start + len * 0.3);
    g.gain.setValueAtTime(v, start + len * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, start + len * 1.25);
    f.connect(g).connect(musicBus);
    notes.forEach((m) => {
      [-7, 7].forEach((det, j) => {
        const o = audioCtx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(midi(m), start);
        o.detune.value = det;
        const pg = audioCtx.createGain();
        pg.gain.value = 0.5;
        const pn = panNode(j ? 0.35 : -0.35);
        if (pn) o.connect(pg).connect(pn).connect(f); else o.connect(pg).connect(f);
        o.start(start);
        o.stop(start + len * 1.3);
      });
    });
    // basse ronde : la fondamentale, une octave plus bas
    const root = notes[0] - 12;
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midi(root), start);
    const bg = audioCtx.createGain();
    bg.gain.setValueAtTime(0.0001, start);
    bg.gain.linearRampToValueAtTime(0.05, start + 0.6);
    bg.gain.setTargetAtTime(0.0001, start + len * 0.7, len * 0.25);
    o.connect(bg).connect(musicBus);
    o.start(start);
    o.stop(start + len * 1.3);
  }

  // une mesure d'arpège de lyre sur l'accord courant
  function arpBar(chord, start, light, density) {
    const tones = SCALE.filter((m) => chord.some((c) => (m - c) % 12 === 0));
    const pool = tones.length >= 3 ? tones : SCALE;
    const top = light > 0.5 ? pool.length : Math.max(3, pool.length - 2); // (la nuit, on monte moins haut)
    const r = Math.random();
    let steps = [];
    if (r > density) {
      // mesure presque vide : une ou deux notes longues
      steps = [[0, pickOf(pool.slice(0, top))]];
      if (Math.random() < 0.5) steps.push([5, pickOf(pool.slice(0, top))]);
    } else {
      const kind = pickOf(['up', 'wave', 'up', 'sparse', 'down']);
      const base = Math.floor(Math.random() * Math.max(1, Math.min(3, top - 4)));
      for (let i = 0; i < 8; i++) {
        let idx;
        if (kind === 'up') idx = base + i;
        else if (kind === 'down') idx = base + 5 - i;
        else if (kind === 'wave') idx = base + [0, 1, 2, 3, 2, 1, 2, 3][i];
        else { if (![0, 3, 5, 6].includes(i)) continue; idx = base + Math.floor(Math.random() * 5); }
        if (idx >= top) idx = 2 * (top - 1) - idx; // (au sommet, l'arpège redescend)
        idx = Math.max(0, Math.min(top - 1, idx));
        if (Math.random() < 0.12 && i > 0) continue; // respiration
        steps.push([i, pool[idx]]);
      }
    }
    steps.forEach(([i, m]) => {
      const t = start + i * BEAT / 2 + rnd(-0.008, 0.012) + (i % 2 ? BEAT * 0.04 : 0); // léger balancement
      const v = (i % 4 === 0 ? 0.038 : 0.028) * rnd(0.8, 1.1);
      pluck(musicBus, midi(m), t, v, 2.2 + light * 0.6, 0.45 + 0.5 * light, rnd(-0.45, 0.45));
    });
  }

  // mélodie lente (une phrase sur deux) : marche aléatoire dans la pentatonique
  function melodyBar(start, light) {
    const rhythm = pickOf([[0, 2, 3], [0, 1.5, 3], [0, 3], [1, 2, 3.5], [0, 2]]);
    rhythm.forEach((b) => {
      music.mel = Math.max(2, Math.min(PENTA.length - 1, music.mel + pickOf([-2, -1, -1, 1, 1, 2, 0])));
      pluck(musicBus, midi(PENTA[music.mel] + (light > 0.4 ? 12 : 0)), start + b * BEAT, 0.03, 3.2, 0.3 + 0.3 * light, rnd(-0.2, 0.2));
    });
  }

  // ressac : bruit brun en boucle, filtré, qui gonfle et retombe comme des vagues
  function startSea() {
    if (music.sea) return;
    const s = audioCtx.createBufferSource();
    s.buffer = brownBuf;
    s.loop = true;
    const f = audioCtx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    const foamF = audioCtx.createBiquadFilter();
    foamF.type = 'bandpass'; foamF.frequency.value = 2200; foamF.Q.value = 0.6;
    const foam = audioCtx.createGain();
    foam.gain.value = 0.0001;
    s.connect(f).connect(g).connect(musicBus);
    s.connect(foamF).connect(foam).connect(musicBus);
    s.start();
    music.sea = { s, f, g, foam };
    music.nextSwell = audioCtx.currentTime + 0.5;
  }
  function stopSea() {
    const sea = music.sea;
    if (!sea) return;
    music.sea = null;
    const t = audioCtx.currentTime;
    sea.g.gain.cancelScheduledValues(t); sea.g.gain.setTargetAtTime(0.0001, t, 0.3);
    sea.foam.gain.cancelScheduledValues(t); sea.foam.gain.setTargetAtTime(0.0001, t, 0.3);
    try { sea.s.stop(t + 1.5); } catch (e) { /* ignore */ }
  }
  function swell(t, light) {
    const sea = music.sea;
    const up = rnd(2.2, 3.4), down = rnd(3.5, 5.5), peak = rnd(0.05, 0.085) * (1.1 - 0.2 * light);
    sea.g.gain.setTargetAtTime(peak, t, up / 3);
    sea.g.gain.setTargetAtTime(peak * 0.25, t + up, down / 3);
    sea.f.frequency.setTargetAtTime(600, t, up / 3);
    sea.f.frequency.setTargetAtTime(330, t + up, down / 3);
    // l'écume siffle doucement quand la vague se brise
    sea.foam.gain.setTargetAtTime(peak * 0.16, t + up * 0.8, 0.4);
    sea.foam.gain.setTargetAtTime(0.0001, t + up + 0.6, 1.2);
    return up + down * 0.7;
  }
  // mouette lointaine (jour) : deux ou trois cris glissés
  function gull(t) {
    const n = 2 + Math.floor(Math.random() * 2), pan = rnd(-0.8, 0.8), base = rnd(1100, 1500);
    for (let i = 0; i < n; i++) {
      const s = t + i * rnd(0.22, 0.34);
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, s);
      o.frequency.linearRampToValueAtTime(base * 1.35, s + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, s + 0.24);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.008, s + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.26);
      const f = audioCtx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = base * 1.1; f.Q.value = 1.2;
      o.connect(f).connect(g);
      out(g, musicBus, pan);
      o.start(s); o.stop(s + 0.3);
    }
  }
  // souffle de vent (surtout la nuit) : bruit en bande étroite qui se déplace
  function wind(t) {
    const dur = rnd(5, 8);
    const s = audioCtx.createBufferSource();
    s.buffer = brownBuf;
    const f = audioCtx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(rnd(300, 450), t);
    f.frequency.linearRampToValueAtTime(rnd(700, 1000), t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(rnd(300, 450), t + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g);
    out(g, musicBus, rnd(-0.6, 0.6));
    s.start(t, Math.random() * 2);
    s.stop(t + dur + 0.1);
  }

  function schedule() {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    if (music.nextBar < now - 0.2) music.nextBar = now + 0.1; // (reprise après une pause)
    // lumière et atténuation suivent doucement le monde et l'écran
    const light = daylight();
    music.light = light;
    const duck = music.duck != null ? music.duck : inPuzzle() ? 0.5 : 1;
    duckGain.gain.setTargetAtTime(duck, now, 1.2);
    toneFilter.frequency.setTargetAtTime(1900 + 3600 * light, now, 2);
    const playing = duck < 0.9;
    while (music.nextBar < now + 1.2) {
      const t = music.nextBar;
      if (music.bar % 8 === 0) { // nouvelle phrase : nouvelle progression
        let p;
        do { p = Math.floor(Math.random() * PROGS.length); } while (p === music.prog && PROGS.length > 1);
        music.prog = p;
        music.phrase++;
        music.melody = music.phrase % 2 === 0 && Math.random() < 0.8;
      }
      if (music.bar % 2 === 0) {
        music.chord = CH[PROGS[music.prog][(music.bar / 2) % 4]];
        pad(music.chord, t, BAR * 2, light);
      }
      // arpèges plus clairsemés la nuit et pendant un casse-tête
      const density = (0.45 + 0.35 * light) * (playing ? 0.6 : 1);
      arpBar(music.chord, t, light, density);
      if (music.melody && !playing && music.bar % 8 >= 2 && music.bar % 8 < 7) melodyBar(t, light);
      music.bar++;
      music.nextBar += BAR;
    }
    if (music.sea) {
      if (music.nextSwell < now + 0.5) music.nextSwell = Math.max(now, music.nextSwell) + swell(Math.max(now, music.nextSwell), light);
      if (music.nextGull < now) {
        if (light > 0.6 && !playing && Math.random() < 0.7) gull(now + 0.3);
        music.nextGull = now + rnd(22, 55);
      }
      if (music.nextWind < now) {
        if (Math.random() < 0.35 + 0.5 * (1 - light)) wind(now + 0.2);
        music.nextWind = now + rnd(18, 40);
      }
    }
  }

  function startMusic() {
    if (music.timer || !store.settings.music || !ensureAudio()) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    music.nextBar = audioCtx.currentTime + 0.15;
    music.bar = 0;
    music.nextGull = audioCtx.currentTime + rnd(8, 20);
    music.nextWind = audioCtx.currentTime + rnd(10, 25);
    startSea();
    music.timer = setInterval(schedule, 250);
    schedule();
  }
  function stopMusic() {
    clearInterval(music.timer);
    music.timer = null;
    if (audioCtx) stopSea();
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
    setMix(v) { store.settings.mix = v; applyMix(); save(); },
    // atténuation forcée de la musique (0..1) ; null = automatique (casse-tête → 0,5)
    duck(v) { music.duck = v == null ? null : Math.max(0, Math.min(1, v)); if (audioCtx && audioCtx.state === 'running') schedule(); },
    // état (outil de test)
    state() {
      return { ctx: audioCtx ? audioCtx.state : 'none', music: !!music.timer, sea: !!music.sea, bar: music.bar,
        prog: music.prog, light: +music.light.toFixed(2), duck: duckGain ? +duckGain.gain.value.toFixed(2) : null,
        tone: toneFilter ? Math.round(toneFilter.frequency.value) : null };
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (!audioCtx) return;
    if (document.hidden) audioCtx.suspend(); else audioCtx.resume();
  });

  function vibrate(ms) {
    if (store.settings.vibrate && navigator.vibrate) navigator.vibrate(ms);
  }

  // place : les poses rapprochées montent la gamme (une petite phrase), puis on repart du bas
  let placeStep = 0, placeAt = 0;

  const sfx = {
    // sons feutrés : jamais agressifs ; le toucher est un petit clic de bois à peine audible,
    // et on n'en joue pas deux à moins de 90 ms d'écart (pas de crépitement en glissant)
    tap: () => {
      const now = Date.now();
      if (now - (sfx.lastTap || 0) < 90) return;
      sfx.lastTap = now;
      fx((t) => {
        noise(sfxBus, t, 0.035, 0.05, 'bandpass', rnd(1600, 2000), 2.5);
        const o = tone(sfxBus, 980, t, 0.05, 'sine', 0.022);
        o.frequency.exponentialRampToValueAtTime(620, t + 0.04);
      });
    },
    // pose réussie : une corde pincée, sur la gamme de la musique
    place: () => {
      const now = Date.now();
      placeStep = now - placeAt < 1300 ? Math.min(PENTA.length - 1, placeStep + 1) : 0;
      placeAt = now;
      fx((t) => {
        pluck(sfxBus, midi(PENTA[placeStep]), t, 0.06, 1.3, 0.7);
        noise(sfxBus, t, 0.02, 0.018, 'bandpass', 2400, 2);
      });
      vibrate(4);
    },
    // erreur : un petit « toc » sourd et grave, pas de buzzer
    error: () => {
      fx((t) => {
        const o = tone(sfxBus, 150, t, 0.26, 'sine', 0.11);
        o.frequency.exponentialRampToValueAtTime(62, t + 0.2);
        noise(sfxBus, t, 0.09, 0.035, 'lowpass', 380);
        pluck(sfxBus, midi(50), t + 0.01, 0.025, 0.5, 0.1);
      });
      vibrate(8);
    },
    // étoile gagnée en fin de niveau : une note qui monte d'une étoile à l'autre (i = 0, 1, 2)
    star: (i) => {
      fx((t) => {
        bell(sfxBus, midi([74, 78, 81][i] || 86), t, 1.6, 0.04, [-0.3, 0, 0.3][i] || 0);
        pluck(sfxBus, midi(([74, 78, 81][i] || 86) + 12), t + 0.04, 0.018, 0.8, 1);
      });
      vibrate(6);
    },
    // victoire : glissando de harpe qui monte, puis un accord de cloches
    win: () => {
      fx((t) => {
        [62, 64, 66, 69, 71, 74, 76, 78, 81].forEach((m, i) => pluck(sfxBus, midi(m), t + i * 0.055, 0.052 - i * 0.002, 1.4, 0.8, -0.5 + i * 0.12));
        [74, 78, 81, 86].forEach((m, i) => bell(sfxBus, midi(m), t + 0.52 + i * 0.03, 2.6, 0.022, (i - 1.5) * 0.2));
      });
      vibrate(15);
    },
    // montée de niveau : petite fanfare (cuivre doux + harpe)
    levelUp: () => {
      fx((t) => {
        const brass = (m, s, d, v) => {
          const f = audioCtx.createBiquadFilter();
          f.type = 'lowpass'; f.Q.value = 1;
          f.frequency.setValueAtTime(400, s); f.frequency.linearRampToValueAtTime(1800, s + 0.08); f.frequency.setTargetAtTime(900, s + 0.1, 0.2);
          const g = audioCtx.createGain();
          g.gain.setValueAtTime(0.0001, s); g.gain.linearRampToValueAtTime(v, s + 0.05); g.gain.setTargetAtTime(0.0001, s + d, 0.12);
          f.connect(g).connect(sfxBus);
          [-6, 6].forEach((det) => {
            const o = audioCtx.createOscillator();
            o.type = 'sawtooth'; o.frequency.value = midi(m); o.detune.value = det;
            o.connect(f); o.start(s); o.stop(s + d + 0.6);
          });
        };
        brass(57, t, 0.14, 0.03);
        brass(62, t + 0.16, 0.14, 0.03);
        [62, 66, 69].forEach((m) => brass(m, t + 0.34, 0.9, 0.022));
        [74, 78, 81, 86].forEach((m, i) => pluck(sfxBus, midi(m), t + 0.34 + i * 0.07, 0.03, 1.6, 0.9, (i - 1.5) * 0.25));
      });
      vibrate(12);
    },
    // concentration : la charge monte (souffle qui s'ouvre, scintillement, arpège qui accélère) ;
    // renvoie une fonction qui la coupe net (explosion, saut ou retour)
    charge: (dur) => {
      let stop = null;
      fx((t) => {
        dur = dur || 2;
        const g = audioCtx.createGain();
        g.gain.value = 1;
        g.connect(sfxBus);
        // souffle qui gonfle et s'éclaircit jusqu'à l'explosion
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuf; src.loop = true;
        const f = audioCtx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 1.4;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(2600, t + dur);
        const ng = audioCtx.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.05, t + dur);
        src.connect(f).connect(ng).connect(g);
        const shimmer = audioCtx.createGain();
        shimmer.gain.setValueAtTime(0.0001, t);
        shimmer.gain.linearRampToValueAtTime(0.02, t + dur);
        shimmer.connect(g);
        const lfo = audioCtx.createOscillator(), lfoG = audioCtx.createGain();
        lfo.frequency.setValueAtTime(5, t); lfo.frequency.linearRampToValueAtTime(14, t + dur);
        lfoG.gain.value = 0.012;
        lfo.connect(lfoG).connect(shimmer.gain);
        const oscs = [lfo, src];
        [0, 7].forEach((iv) => {
          const o = audioCtx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(midi(62 + iv), t);
          o.frequency.exponentialRampToValueAtTime(midi(74 + iv), t + dur);
          o.connect(shimmer);
          oscs.push(o);
        });
        oscs.forEach((o) => { o.start(t); o.stop(t + dur + 0.4); });
        // arpège de lyre qui accélère en montant
        let s = t + 0.15, i = 0, gap = 0.26;
        while (s < t + dur - 0.04 && i < 24) {
          pluck(g, midi(PENTA[Math.min(PENTA.length - 1, i % PENTA.length)] + (i >= PENTA.length ? 12 : 0)), s, 0.022 + i * 0.0012, 0.9, 0.8, (i % 2 ? 0.3 : -0.3));
          s += gap; gap = Math.max(0.06, gap * 0.86); i++;
        }
        stop = () => {
          if (!audioCtx) return;
          const n = audioCtx.currentTime;
          g.gain.cancelScheduledValues(n);
          g.gain.setValueAtTime(g.gain.value, n);
          g.gain.linearRampToValueAtTime(0.0001, n + 0.08);
          oscs.forEach((o) => { try { o.stop(n + 0.1); } catch (e) { /* ignore */ } });
        };
      });
      return stop || (() => {});
    },
    // explosion de lumière : coup sourd et rond, souffle, accord de cloches et paillettes
    burst: () => {
      fx((t) => {
        const o = tone(sfxBus, 110, t, 0.9, 'sine', 0.1);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.6);
        const f = noise(sfxBus, t, 1.1, 0.06, 'lowpass', 3500, 0.7);
        f.frequency.exponentialRampToValueAtTime(300, t + 1);
        [62, 69, 74, 78, 81].forEach((m, i) => bell(sfxBus, midi(m + 12), t + 0.02 + i * 0.012, 2.8, 0.02, (i - 2) * 0.25));
        for (let i = 0; i < 7; i++) pluck(sfxBus, midi(pickOf([86, 88, 90, 93, 95, 98])), t + 0.08 + i * rnd(0.04, 0.08), 0.012, 0.6, 1, rnd(-0.8, 0.8));
      });
      vibrate(20);
    },
    // souffle de plongée (entrée dans un niveau) ou de retour (sortie)
    whoosh: (inward) => {
      fx((t) => {
        const f = noise(sfxBus, t, inward ? 0.7 : 0.9, 0.09, 'bandpass', inward ? 400 : 2200, 1.2);
        f.frequency.exponentialRampToValueAtTime(inward ? 2400 : 380, t + (inward ? 0.6 : 0.85));
      });
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
