// Mosaïque : un petit motif de tesselles s'affiche quelques secondes, puis s'efface ;
// on le repeint de mémoire en choisissant une couleur dans la palette et en touchant les cases.
// Quand toutes les cases sont peintes, la mosaïque se vérifie : les tesselles fausses frémissent doucement.
(function () {
  'use strict';
  const C = window.Carnet;

  // tesselles : terre cuite, mer, or, olive, violet nuit
  const COLORS = ['#ee7a4d', '#3d8ee8', '#ffc22e', '#4cb82e', '#6c5fc7'];
  const GLYPHS = ['●', '▲', '■', '◆', '★']; // un symbole par couleur (réglage « symboles sur les couleurs »)

  // ------------------------------------------------------------------
  // Difficulté (niveaux 1 → 40) : taille 3×3 → 6×6, 2 → 5 couleurs, affichage plus court,
  // motifs symétriques (4 quarts, puis miroir) au début, libres ensuite.
  // ------------------------------------------------------------------
  function params(level, variant) {
    level = Math.max(1, level || 1);
    // débuts en douceur (niveaux 1-12) : 3×3 plus longtemps, 4 quarts symétriques jusqu'au niveau 7,
    // et un modèle affiché plus longtemps ; on rejoint la courbe au niveau 12
    const easy = level <= 12;
    const n = easy ? (level <= 5 ? 3 : level <= 11 ? 4 : 5) : level < 24 ? 5 : 6;
    const colors = easy ? (level <= 3 ? 2 : level <= 9 ? 3 : 4) : level < 18 ? 4 : 5;
    // symétrie : quatre quarts → miroir vertical → miroir (axe au hasard) → libre (5×5) → miroir au hasard (6×6)
    const sym = easy ? (level <= 7 ? 'quad' : 'mirror') : level < 14 ? 'mirror' : level < 18 ? 'axis' : n <= 5 ? 'none' : 'axis';
    const per = Math.max(95, 300 - level * 5, easy ? 420 - level * 15 : 0); // ms par tesselle
    return {
      variant: variant || 'classic', n, colors, sym,
      show: Math.round(1000 + n * n * per + colors * 150)
    };
  }

  function generate(rng, p) {
    const n = p.n, K = p.colors;
    let grid = null;
    for (let tries = 0; tries < 60; tries++) {
      // couleur de fond plus fréquente : la mosaïque a un motif lisible
      const bg = rng.int(K);
      const pick = () => (rng() < 0.38 ? bg : rng.int(K));
      const g = [];
      for (let i = 0; i < n * n; i++) g.push(pick());
      // une passe de lissage : des taches plutôt qu'un bruit
      const sm = g.slice();
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (rng() < 0.45) continue;
          const cnt = new Array(K).fill(0);
          [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([y, x]) => { if (y >= 0 && y < n && x >= 0 && x < n) cnt[g[y * n + x]]++; });
          const best = cnt.indexOf(Math.max(...cnt));
          if (cnt[best] >= 3) sm[r * n + c] = best;
        }
      }
      // symétrie
      const axis = p.sym === 'axis' ? (rng() < 0.5 ? 'v' : 'h') : 'v';
      const out = [];
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          let y = r, x = c;
          if (p.sym === 'quad') { y = Math.min(r, n - 1 - r); x = Math.min(c, n - 1 - c); }
          else if (p.sym === 'mirror' || (p.sym === 'axis' && axis === 'v')) x = Math.min(c, n - 1 - c);
          else if (p.sym === 'axis') y = Math.min(r, n - 1 - r);
          out.push(sm[y * n + x]);
        }
      }
      // toutes les couleurs présentes, aucune n'écrase les autres
      const cnt = new Array(K).fill(0);
      out.forEach((v) => cnt[v]++);
      if (cnt.some((v) => v === 0) || Math.max(...cnt) > n * n * 0.62) continue;
      grid = out;
      break;
    }
    if (!grid) grid = [...Array(n * n).keys()].map((i) => i % K); // filet de sécurité
    return Object.assign({ grid }, p);
  }

  function create(host, puzzle, api) {
    const n = puzzle.n, K = puzzle.colors, truth = puzzle.grid;
    const paint = new Array(n * n).fill(-1);
    const wrong = new Set();
    const history = [];
    let sel = 0;
    let phase = 'wait'; // wait | show | paint | won
    let peekOn = false;
    let dead = false;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
      timers.add(id);
      return id;
    };
    const clearAll = () => { timers.forEach(clearTimeout); timers.clear(); };

    const box = document.createElement('div');
    box.className = 'mos';
    box.style.setProperty('--n', n);
    // sablier : une barre qui se vide pendant l'affichage du modèle
    const bar = document.createElement('div');
    bar.className = 'mos-bar';
    bar.innerHTML = '<i></i>';
    const board = document.createElement('div');
    board.className = 'mos-board';
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.className = 'mos-cell';
      b.dataset.i = i;
      b.style.setProperty('--k', Math.floor(i / n) + (i % n));
      b.setAttribute('aria-label', 'Tesselle');
      board.appendChild(b);
      cells.push(b);
    }
    const pal = document.createElement('div');
    pal.className = 'mos-pal';
    const swatches = [];
    for (let k = 0; k < K; k++) {
      const s = document.createElement('button');
      s.className = 'mos-sw';
      s.style.setProperty('--c', COLORS[k]);
      s.dataset.g = GLYPHS[k % GLYPHS.length];
      s.setAttribute('aria-label', 'Couleur ' + (k + 1));
      s.addEventListener('click', () => { sel = k; C.sfx.tap(); render(); });
      pal.appendChild(s);
      swatches.push(s);
    }
    box.appendChild(bar);
    box.appendChild(board);
    box.appendChild(pal);
    host.appendChild(box);

    function fit() {
      const w = (host.clientWidth || 340) - 16;
      // le plateau grandit avec son contenu : on vise la hauteur libre de l'écran de jeu
      const play = host.closest && host.closest('#play');
      const h = Math.max(240, (play && play.clientHeight ? play.clientHeight - 330 : host.clientHeight || 560) - 16);
      const palH = Math.min(64, Math.max(48, w / 6));
      const side = Math.floor(Math.min(w, h - palH - 40, 400));
      box.style.setProperty('--side', Math.max(180, side) + 'px');
      box.style.setProperty('--sw', palH + 'px');
    }
    fit();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }

    function render() {
      const showing = phase === 'show' || phase === 'won' || peekOn;
      box.classList.toggle('showing', phase === 'show');
      box.classList.toggle('painting', phase === 'paint');
      cells.forEach((c, i) => {
        const v = showing ? truth[i] : paint[i];
        c.style.setProperty('--c', v >= 0 ? COLORS[v] : 'transparent');
        c.dataset.g = v >= 0 ? GLYPHS[v % GLYPHS.length] : ''; // accessibilité : symbole par couleur (réglage « symboles »)
        c.classList.toggle('on', v >= 0);
        c.classList.toggle('off', !showing && wrong.has(i));
        c.classList.toggle('ghost', peekOn && phase === 'paint');
      });
      swatches.forEach((s, k) => s.classList.toggle('sel', k === sel));
    }

    // le modèle s'affiche, la barre se vide, puis les tesselles s'effacent
    function showModel(ms) {
      phase = 'show';
      bar.firstChild.style.transition = 'none';
      bar.firstChild.style.transform = 'scaleX(1)';
      void bar.offsetWidth;
      bar.firstChild.style.transition = 'transform ' + ms + 'ms linear';
      bar.firstChild.style.transform = 'scaleX(0)';
      render(); api.onChange();
      later(hideModel, ms);
    }
    function hideModel() {
      if (phase !== 'show') return;
      clearAll();
      phase = 'paint';
      bar.firstChild.style.transition = 'none';
      bar.firstChild.style.transform = 'scaleX(0)';
      box.classList.remove('wipe'); void box.offsetWidth; box.classList.add('wipe');
      later(() => box.classList.remove('wipe'), 500 + 2 * n * 22 + 100);
      render(); api.onChange();
    }

    function rulesOpen() {
      const r = document.querySelector('#rules');
      return !!(r && !r.hidden && getComputedStyle(r).display !== 'none');
    }
    function whenReady(fn) {
      if (rulesOpen()) { later(() => whenReady(fn), 250); return; }
      later(fn, 450);
    }

    // vérification dès que toutes les cases sont peintes
    function check() {
      if (paint.some((v) => v < 0)) return;
      wrong.clear();
      paint.forEach((v, i) => { if (v !== truth[i]) wrong.add(i); });
      if (!wrong.size) {
        phase = 'won'; render();
        board.classList.add('done');
        later(() => api.onWin(), 500);
        return;
      }
      C.sfx.error();
      board.classList.remove('nudge'); void board.offsetWidth; board.classList.add('nudge');
      render();
    }

    function put(i, v, record) {
      if (paint[i] === v) return false;
      if (record) history.push([i, paint[i]]);
      paint[i] = v;
      wrong.delete(i);
      const c = cells[i];
      c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
      return true;
    }

    // peinture : toucher pose la couleur choisie ; retoucher la même couleur efface ; glisser peint d'affilée
    let drag = null;
    function touch(i, first) {
      if (phase !== 'paint') return;
      let v = sel;
      if (first) drag = paint[i] === sel ? -1 : sel;
      v = drag;
      if (put(i, v, true)) { C.sfx.tap(); render(); api.onChange(); if (v >= 0) check(); }
    }
    board.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.mos-cell');
      if (phase === 'show') { hideModel(); return; } // toucher pendant l'affichage : on passe à la peinture
      if (!c) return;
      e.preventDefault();
      touch(+c.dataset.i, true);
    });
    board.addEventListener('pointermove', (e) => {
      if (drag == null) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const c = el && el.closest && el.closest('.mos-cell');
      if (c && board.contains(c)) touch(+c.dataset.i, false);
    });
    const stop = () => { drag = null; };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);

    render();
    whenReady(() => showModel(puzzle.show));

    return {
      status() {
        if (phase === 'won') return 'Mosaïque reconstituée';
        if (phase === 'show') return 'Retiens le motif';
        return paint.filter((v) => v >= 0).length + ' / ' + (n * n);
      },
      undo() {
        if (phase !== 'paint' || !history.length) return;
        const [i, v] = history.pop();
        put(i, v, false);
        render(); api.onChange();
      },
      reset() {
        if (phase !== 'paint') return;
        paint.fill(-1); wrong.clear(); history.length = 0;
        render(); api.onChange();
      },
      // résolution directe (outil de test)
      solve() {
        if (phase === 'won') return;
        clearAll();
        peekOn = false;
        truth.forEach((v, i) => { paint[i] = v; });
        phase = 'paint';
        check();
      },
      // indice : le modèle réapparaît un instant en transparence, et une tesselle à corriger s'entoure d'or
      hint() {
        if (phase === 'won' || phase === 'wait') return false; // (avant l'affichage du modèle : rien à montrer)
        if (phase === 'show') hideModel();
        if (phase !== 'paint') { clearAll(); phase = 'paint'; }
        const firstBad = paint.findIndex((v, i) => v !== truth[i]);
        if (firstBad < 0) return false;
        peekOn = true; render();
        later(() => { peekOn = false; render(); }, Math.max(1400, Math.round(puzzle.show * 0.45)));
        // de préférence une tesselle déjà fausse, sinon la première vide
        const bad = wrong.size ? [...wrong][0] : firstBad;
        return { text: paint[bad] >= 0
          ? 'Le modèle réapparaît un instant : la tesselle dorée n\'a pas la bonne couleur.'
          : 'Le modèle réapparaît un instant : regarde bien la couleur de la tesselle dorée.', where: [cells[bad]], why: [] };
      },
      redraw() { fit(); },
      destroy() {
        dead = true;
        clearAll();
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
        if (ro) ro.disconnect();
      }
    };
  }

  // ------------------------------------------------------------------
  // Tutoriel (viewBox 0 0 120 120)
  // ------------------------------------------------------------------
  const MODEL = [0, 1, 0, 1, 2, 1, 0, 1, 0];
  function tMos(vals, extra) {
    let s = '<svg viewBox="0 0 120 120" class="tuto-art"><rect x="18" y="14" width="84" height="84" rx="12" fill="#efe6d6"/>';
    vals.forEach((v, i) => {
      const x = 23 + (i % 3) * 25.5, y = 19 + Math.floor(i / 3) * 25.5;
      s += '<rect x="' + x + '" y="' + y + '" width="22" height="22" rx="5" fill="' + (v >= 0 ? COLORS[v] : '#fffaf0') + '"' +
        (v === -2 ? ' stroke="#e0463a" stroke-width="2.5" stroke-dasharray="4 3"' : '') + '/>';
    });
    return s + (extra || '') + '</svg>';
  }
  const tFinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const tPal = (sel) => [0, 1, 2].map((k) => '<circle cx="' + (42 + k * 18) + '" cy="110" r="' + (k === sel ? 7.5 : 6) + '" fill="' + COLORS[k] + '"' +
    (k === sel ? ' stroke="#fff" stroke-width="2.5"' : '') + '/>').join('');

  C.register({
    id: 'mosaique',
    name: 'Mosaïque',
    tagline: 'Repeins la mosaïque de mémoire',
    accent: '#ff94cb',
    icon: '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="currentColor"/></svg>',
    icon24: '<rect x="4" y="4" width="7" height="7" rx="1.6" class="f"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6" class="f"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Retiens la mosaïque, puis repeins-la de mémoire.' }
    ],
    rules: {
      classic: [
        'Une <b>mosaïque</b> s\'affiche quelques secondes : retiens-la (touche-la pour commencer plus tôt).',
        'Choisis une <b>couleur</b> en bas, puis touche ou glisse sur les cases pour les peindre.',
        'Retouche une case avec la même couleur pour l\'effacer.',
        'Quand tout est peint, les tesselles <b>fausses</b> frémissent : corrige-les.'
      ]
    },
    tutorial: [
      { art: tMos(MODEL, '<rect x="30" y="104" width="60" height="5" rx="2.5" fill="var(--faint)"/><rect x="30" y="104" width="34" height="5" rx="2.5" fill="#ff94cb"/>'),
        text: 'Retiens la <b>mosaïque</b> avant qu\'elle s\'efface (touche-la pour commencer plus tôt).' },
      { art: tMos([0, 1, 0, -1, -1, -1, -1, -1, -1], tPal(1) + tFinger(48, 55)),
        text: 'Choisis une <b>couleur</b>, puis touche ou glisse sur les cases pour les peindre. Retouche une case pour l\'effacer.' },
      { art: tMos([0, 1, 0, 1, -2, 1, 0, 1, 0]),
        text: 'Une tesselle <b>fausse</b> frémit : corrige-la.' }
    ],
    params,
    generate,
    create
  });
})();
