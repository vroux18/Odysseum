// Sirènes : le chant des Sirènes, version Simon.
// Les coquilles chantent une suite de notes ; on la rejoue. Chaque réussite ajoute une note.
// Une erreur ne coûte qu'une perle (3 en tout) ; sans perle, une nouvelle mélodie recommence, en douceur.
(function () {
  'use strict';
  const C = window.Carnet;

  // gammes pentatoniques, montantes dans le sens des aiguilles d'une montre
  const SCALES = {
    4: [72, 76, 79, 84],
    5: [72, 74, 76, 79, 81],
    6: [69, 72, 74, 76, 79, 81]
  };
  // teintes marines : nacre rose, lagon, sable, algue, glycine, corail
  const COLORS = ['#e39bb3', '#79b2cc', '#e2bf74', '#8fbf8a', '#ab97d6', '#eda77c'];
  const LIVES = 3;
  const START = 2; // longueur de départ d'une mélodie

  // ------------------------------------------------------------------
  // Audio : un petit contexte à part (celui du noyau n'est pas exposé),
  // créé une seule fois, coupé si les effets sont désactivés.
  // ------------------------------------------------------------------
  let ctx = null, out = null;
  function audio() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain();
      const soft = ctx.createBiquadFilter();
      soft.type = 'lowpass';
      soft.frequency.value = 2600;
      // écho léger : la grotte des Sirènes
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.28;
      const fb = ctx.createGain(); fb.gain.value = 0.25;
      const wet = ctx.createGain(); wet.gain.value = 0.22;
      out.connect(soft);
      soft.connect(ctx.destination);
      soft.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(wet).connect(ctx.destination);
      // on suit la mise en veille de la page, comme le noyau
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend(); else ctx.resume();
      });
    } catch (e) { ctx = null; }
    return ctx;
  }

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // note pincée, façon lyre : attaque courte, extinction douce
  function note(m, dur) {
    const s = C.store.settings;
    if (!s.sound || !audio()) return;
    try {
      if (ctx.state === 'suspended') ctx.resume();
      const mix = s.mix == null ? 50 : s.mix;
      const vol = 0.07 * Math.min(1, 2 * (1 - mix / 100));
      if (vol <= 0) return;
      const t = ctx.currentTime;
      const f = midi(m);
      [[1, 'triangle', 1], [2, 'sine', 0.22], [3, 'sine', 0.06]].forEach(([mult, type, v]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f * mult, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol * v, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur / mult);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------
  // Difficulté : 4 notes au niveau 1, 12 au niveau 40 ; 5 puis 6 coquilles ;
  // un chant un peu plus rapide au fil des niveaux.
  // ------------------------------------------------------------------
  function params(level, variant) {
    level = Math.max(1, level || 1);
    return {
      variant: variant || 'classic',
      pads: level < 10 ? 4 : level < 25 ? 5 : 6,
      target: Math.min(12, 4 + Math.round((level - 1) * 8 / 39)),
      step: Math.max(400, 660 - level * 6) // ms entre deux notes du chant
    };
  }

  // la suite complète est tirée d'avance : même graine = même chant
  function generate(rng, p) {
    const seqs = [];
    for (let k = 0; k < 4; k++) {
      const seq = [];
      while (seq.length < p.target) {
        const v = rng.int(p.pads);
        const n = seq.length;
        if (n >= 2 && seq[n - 1] === v && seq[n - 2] === v) continue; // jamais trois fois la même
        seq.push(v);
      }
      seqs.push(seq);
    }
    return Object.assign({ seqs }, p);
  }

  // coquille Saint-Jacques : éventail ouvert vers le haut, charnière en bas
  const SHELL = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<path class="sh-body" d="M50 90 L13 44 C8 24 26 8 50 8 C74 8 92 24 87 44 Z"/>' +
    '<path class="sh-ridge" d="M50 88 L22 22M50 88 L35 13M50 88 V9M50 88 L65 13M50 88 L78 22"/>' +
    '<path class="sh-ear" d="M39 84 Q50 80 61 84 L57 93 Q50 95 43 93 Z"/></svg>';

  function create(host, puzzle, api) {
    const n = puzzle.pads;
    const scale = SCALES[n] || SCALES[4];
    const target = puzzle.target;
    let seqIndex = 0;
    let seq = puzzle.seqs[0];
    let len = Math.min(START, target);
    let pos = 0;           // notes déjà rejouées dans le tour en cours
    let lives = LIVES;
    let phase = 'wait';    // wait | listen | turn | pause | won
    let hinted = -1;
    let dead = false;
    const timers = new Set();

    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
      timers.add(id);
      return id;
    };
    const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); };

    // --- construction ---
    const box = document.createElement('div');
    box.className = 'simon n' + n;
    box.style.setProperty('--n', n);
    const ring = document.createElement('div');
    ring.className = 'simon-ring';
    box.appendChild(ring);

    const pads = [];
    for (let i = 0; i < n; i++) {
      const a = -90 + i * 360 / n;
      const b = document.createElement('button');
      b.className = 'simon-pad';
      b.dataset.i = i;
      b.setAttribute('aria-label', 'Coquille ' + (i + 1));
      b.style.setProperty('--a', a + 'deg');
      b.style.setProperty('--c', COLORS[i % COLORS.length]);
      b.style.setProperty('--k', i);
      b.innerHTML = '<span class="simon-shell">' + SHELL + '</span>';
      ring.appendChild(b);
      pads.push(b);
    }

    // centre : la lyre, qui s'illumine quand c'est à toi
    const core = document.createElement('div');
    core.className = 'simon-core';
    core.innerHTML = '<svg viewBox="0 0 24 24" class="simon-lyre" aria-hidden="true">' +
      '<path d="M7 4c-2.5 2-2.5 7 1 9v6h8v-6c3.5-2 3.5-7 1-9"/><path d="M8 7h8M10 7v12M12 7v12M14 7v12M7 19h10"/></svg>' +
      '<div class="simon-lives"></div>';
    ring.appendChild(core);
    const livesEl = core.querySelector('.simon-lives');

    // progression : une perle par note à atteindre, en couronne autour du centre
    const prog = document.createElement('div');
    prog.className = 'simon-prog';
    const dots = [];
    for (let k = 0; k < target; k++) {
      const d = document.createElement('i');
      d.style.setProperty('--a', (-90 + k * 360 / target) + 'deg');
      prog.appendChild(d);
      dots.push(d);
    }
    ring.appendChild(prog);
    host.appendChild(box);

    // taille : tient dans l'hôte, 420 px au plus
    function fit() {
      const w = host.clientWidth || 320;
      const h = host.clientHeight || Infinity;
      const s = Math.max(200, Math.min(w - 8, h - 8, 420));
      box.style.setProperty('--s', s + 'px');
    }
    fit();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }

    function render() {
      box.classList.toggle('turn', phase === 'turn');
      box.classList.toggle('listen', phase === 'listen');
      dots.forEach((d, k) => {
        d.className = k < len ? (phase === 'turn' && k < pos ? 'done' : 'in') : '';
        if (phase === 'won') d.className = 'done';
      });
      livesEl.innerHTML = '';
      for (let k = 0; k < LIVES; k++) {
        const i = document.createElement('i');
        if (k >= lives) i.className = 'lost';
        livesEl.appendChild(i);
      }
      pads.forEach((p, i) => p.classList.toggle('hinted', i === hinted));
    }

    // allume une coquille et fait chanter sa note
    function light(i, ms) {
      const p = pads[i];
      p.classList.remove('lit'); void p.offsetWidth;
      p.classList.add('lit');
      note(scale[i], 1.1);
      clearTimeout(p._off);
      p._off = setTimeout(() => p.classList.remove('lit'), ms);
    }

    // le chant : les notes de la suite, une à une
    function sing(step) {
      clearAll();
      phase = 'listen'; pos = 0; render(); api.onChange();
      step = step || puzzle.step;
      for (let k = 0; k < len; k++) {
        later(() => light(seq[k], step * 0.62), 380 + k * step);
      }
      later(() => { phase = 'turn'; render(); api.onChange(); }, 380 + (len - 1) * step + step * 0.7);
    }

    // on ne chante pas tant que le tutoriel est ouvert
    function rulesOpen() {
      const r = document.querySelector('#rules');
      return !!(r && !r.hidden && getComputedStyle(r).display !== 'none');
    }
    function whenReady(fn) {
      if (rulesOpen()) { later(() => whenReady(fn), 250); return; }
      later(fn, 600);
    }

    function wobble() {
      ring.classList.remove('wobble'); void ring.offsetWidth;
      ring.classList.add('wobble');
      later(() => ring.classList.remove('wobble'), 700);
    }

    function press(i) {
      const p = pads[i];
      if (phase !== 'turn') {
        // pendant le chant, la coquille bouge à peine et reste muette
        p.classList.add('down');
        return;
      }
      p.classList.add('down');
      light(i, 240);
      if (hinted === i) hinted = -1;
      if (i === seq[pos]) {
        pos++;
        if (pos >= len) {
          if (len >= target) {
            phase = 'won'; render();
            later(() => api.onWin(), 350);
            return;
          }
          phase = 'pause'; render(); api.onChange();
          later(() => { len++; sing(); }, 750);
        } else { render(); api.onChange(); }
        return;
      }
      // erreur : tout ondule doucement, puis le chant reprend
      phase = 'pause';
      hinted = -1;
      lives--;
      p.classList.add('miss');
      later(() => p.classList.remove('miss'), 600);
      wobble();
      if (C.sfx.error) C.sfx.error();
      render(); api.onChange();
      if (lives > 0) {
        later(() => sing(), 1300);
      } else {
        // plus de perles : une nouvelle mélodie, qui repart de deux notes
        later(() => {
          seqIndex = (seqIndex + 1) % puzzle.seqs.length;
          seq = puzzle.seqs[seqIndex];
          len = Math.min(START, target);
          lives = LIVES;
          box.classList.remove('renew'); void box.offsetWidth; box.classList.add('renew');
          render();
          later(() => sing(), 900);
        }, 1100);
      }
    }

    const release = (e) => {
      const p = e.target.closest && e.target.closest('.simon-pad');
      (p ? [p] : pads).forEach((x) => x.classList.remove('down'));
    };
    const onDown = (e) => {
      const p = e.target.closest('.simon-pad');
      if (!p) return;
      e.preventDefault();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      else audio();
      press(+p.dataset.i);
    };
    ring.addEventListener('pointerdown', onDown);
    ring.addEventListener('pointerup', release);
    ring.addEventListener('pointerleave', () => pads.forEach((x) => x.classList.remove('down')));
    ring.addEventListener('pointercancel', () => pads.forEach((x) => x.classList.remove('down')));
    // clavier : Entrée / Espace sur une coquille
    ring.addEventListener('keydown', (e) => {
      const p = e.target.closest('.simon-pad');
      if (p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); press(+p.dataset.i); later(() => p.classList.remove('down'), 160); }
    });

    render();
    whenReady(() => sing());

    return {
      status() {
        if (phase === 'won') return 'Chant retenu';
        if (phase === 'turn') return 'À toi · ' + pos + '/' + len + ' (but ' + target + ')';
        if (phase === 'listen') return 'Écoute… ' + len + '/' + target;
        return len + '/' + target;
      },
      undo() {},
      reset() {
        if (phase === 'won') return;
        clearAll();
        seqIndex = 0; seq = puzzle.seqs[0];
        len = Math.min(START, target); pos = 0; lives = LIVES; hinted = -1;
        phase = 'wait'; render(); api.onChange();
        whenReady(() => sing());
      },
      // résolution directe (outil de test)
      solve() {
        if (phase === 'won') return;
        clearAll();
        len = target; pos = target; phase = 'won'; render();
        api.onWin();
      },
      // indice : le chant reprend lentement, puis la prochaine coquille attendue scintille
      hint() {
        if (phase === 'won') return false;
        clearAll();
        const keep = phase === 'turn' ? pos : 0;
        const slow = Math.round(puzzle.step * 1.45);
        phase = 'listen'; hinted = -1; render(); api.onChange();
        for (let k = 0; k < len; k++) later(() => light(seq[k], slow * 0.62), 500 + k * slow);
        later(() => {
          phase = 'turn'; pos = keep; hinted = seq[pos]; render(); api.onChange();
        }, 500 + (len - 1) * slow + slow * 0.7);
        return 'Écoute encore : le chant reprend plus lentement, puis la prochaine note est la coquille qui brille.';
      },
      redraw() { fit(); },
      destroy() {
        dead = true;
        clearAll();
        pads.forEach((p) => clearTimeout(p._off));
        if (ro) ro.disconnect();
      }
    };
  }

  // petits dessins du tutoriel (viewBox 0 0 120 120)
  const tShell = (x, y, a, color, lit) => '<g transform="translate(' + x + ' ' + y + ') rotate(' + (a + 90) + ') scale(.32) translate(-50 -50)">' +
    (lit ? '<circle cx="50" cy="50" r="58" fill="' + color + '" opacity=".25"/>' : '') +
    '<path d="M50 90 L13 44 C8 24 26 8 50 8 C74 8 92 24 87 44 Z" fill="' + color + '" opacity="' + (lit ? 1 : 0.45) + '"/>' +
    '<path d="M50 88 L22 22M50 88 L35 13M50 88 V9M50 88 L65 13M50 88 L78 22" stroke="#fff" stroke-opacity=".55" stroke-width="4" fill="none"/></g>';
  function tRing(litIdx, coreGlow, extra) {
    let s = '<svg viewBox="0 0 120 120" class="tuto-art">';
    if (coreGlow) s += '<circle cx="60" cy="60" r="20" fill="#c7849f" opacity=".22"/>';
    s += '<circle cx="60" cy="60" r="13" fill="var(--surface)" stroke="var(--faint)" stroke-width="1.5"/>';
    if (coreGlow) s += '<circle cx="60" cy="60" r="13" fill="none" stroke="#c7849f" stroke-width="2"/>';
    for (let i = 0; i < 4; i++) {
      const a = -90 + i * 90, r = 36;
      s += tShell(60 + r * Math.cos(a * Math.PI / 180), 60 + r * Math.sin(a * Math.PI / 180), a, COLORS[i], i === litIdx);
    }
    return s + (extra || '') + '</svg>';
  }
  const tNote = (x, y) => '<g fill="var(--muted)" opacity=".8"><circle cx="' + x + '" cy="' + y + '" r="3"/><path d="M' + (x + 2.6) + ' ' + y + 'v-11l5 2" stroke="var(--muted)" stroke-width="1.6" fill="none"/></g>';
  const tFinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const tDots = (k, total, y) => {
    let s = '';
    for (let i = 0; i < total; i++) s += '<circle cx="' + (60 - (total - 1) * 6 + i * 12) + '" cy="' + y + '" r="3.4" fill="' + (i < k ? '#c7849f' : 'var(--faint)') + '"/>';
    return s;
  };

  C.register({
    id: 'simon',
    name: 'Sirènes',
    tagline: 'Retiens le chant des Sirènes',
    accent: '#c7849f',
    icon: '<svg viewBox="0 0 24 24"><path d="M12 20 4.6 10.6C3.6 6.6 7.2 3.6 12 3.6s8.4 3 7.4 7z" fill="currentColor"/></svg>',
    icon24: '<path d="M12 20 4.6 10.6C3.6 6.6 7.2 3.6 12 3.6s8.4 3 7.4 7z"/><path d="M12 19.5 8 5.2M12 19.5l4-14.3M12 19.5V3.8"/><circle cx="12" cy="20" r="1.6" class="f"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Écoute le chant des coquilles et rejoue-le, une note de plus à chaque fois.' }
    ],
    rules: {
      classic: [
        'Les coquilles <b>chantent</b> une suite de notes : écoute et regarde.',
        'Quand le <b>centre s\'illumine</b>, c\'est à toi : rejoue la même suite.',
        'Chaque réussite ajoute <b>une note</b>. Atteins la longueur visée pour gagner.',
        'Une erreur ? Le chant reprend. Après trois, une nouvelle mélodie commence, tout doucement.'
      ]
    },
    tutorial: [
      { art: tRing(1, false, tNote(92, 30) + tNote(102, 44)),
        text: 'Écoute : les coquilles <b>chantent</b> une suite de notes, l\'une après l\'autre.' },
      { art: tRing(2, true, tFinger(60, 96)),
        text: 'Quand le <b>centre s\'illumine</b>, rejoue la même suite en touchant les coquilles.' },
      { art: '<svg viewBox="0 0 120 120" class="tuto-art">' + tDots(3, 4, 40) + tDots(4, 4, 62) +
          '<path d="M52 84h16M60 76v16" stroke="#c7849f" stroke-width="3" stroke-linecap="round"/></svg>',
        text: 'Chaque réussite ajoute <b>une note</b>. Une erreur ? Le chant reprend, sans pression.' }
    ],
    params,
    generate,
    create
  });
})();
