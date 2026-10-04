// Lumières : les constellations. Chaque appui inverse une croix de cases (la case et ses 4 voisines ;
// variante Croix : ses 4 diagonales). But : allumer EXACTEMENT la constellation, dont les étoiles sont
// marquées d'un anneau doré ; les autres cases restent éteintes.
// Les grilles sont fabriquées à partir de k appuis : le nombre de coups visé (« en 4 coups ») est exact,
// car on calcule la plus courte solution (algèbre modulo 2). Au fil des niveaux : étoiles errantes à
// éteindre, plateaux en croix, en anneau, en losange, cases scellées (on ne peut pas les toucher) et phare
// (il inverse toute sa ligne et toute sa colonne).
(function () {
  'use strict';
  const C = window.Carnet;

  const PATTERNS = {
    classic: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
    croix: [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]
  };

  // ------------------------------------------------------------------
  // Formes de plateau : 1 = case présente
  // ------------------------------------------------------------------
  function shapeMask(n, shape) {
    const m = new Uint8Array(n * n).fill(1);
    const set0 = (r, c) => { m[r * n + c] = 0; };
    if (shape === 'octo') { set0(0, 0); set0(0, n - 1); set0(n - 1, 0); set0(n - 1, n - 1); }
    else if (shape === 'croix') {
      const k = Math.floor(n / 3);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if ((r < k || r >= n - k) && (c < k || c >= n - k)) set0(r, c);
      }
    } else if (shape === 'anneau') {
      const k = n >= 7 ? 3 : n % 2 ? 1 : 2, a = (n - k) / 2;
      for (let r = a; r < a + k; r++) for (let c = a; c < a + k; c++) set0(r, c);
    } else if (shape === 'losange') {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        if (Math.abs(2 * r - (n - 1)) + Math.abs(2 * c - (n - 1)) > n + (n % 2 ? -1 : 1)) set0(r, c);
      }
    }
    return m;
  }

  // zones d'effet de chaque case (indices des cases présentes touchées par un appui)
  function areasOf(n, mask, pattern, phare) {
    const out = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, a = [];
      if (!mask[i]) { out.push(a); continue; }
      if (i === phare) {
        // le phare : toute sa ligne et toute sa colonne
        for (let x = 0; x < n; x++) if (mask[r * n + x]) a.push(r * n + x);
        for (let y = 0; y < n; y++) if (y !== r && mask[y * n + c]) a.push(y * n + c);
      } else {
        pattern.forEach(([dr, dc]) => {
          const y = r + dr, x = c + dc;
          if (y >= 0 && x >= 0 && y < n && x < n && mask[y * n + x]) a.push(y * n + x);
        });
      }
      out.push(a);
    }
    return out;
  }

  // ------------------------------------------------------------------
  // Plus courte solution (modulo 2) : quelles cases toucher pour inverser exactement `diff` ?
  // Variables = cases qu'on peut toucher ; équations = cases présentes. Pivot de Gauss sur des
  // mots de 32 bits, puis on parcourt le noyau (code de Gray) pour garder la solution la plus légère.
  // ------------------------------------------------------------------
  const pop32 = (x) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  const popW = (b) => { let s = 0; for (let j = 0; j < b.length; j++) s += pop32(b[j]); return s; };
  const ctz = (g) => { let k = 0; while (!(g & 1)) { g >>>= 1; k++; } return k; };

  function solveMin(sys, diff) {
    const { vars, eqs, W, hits } = sys;
    const rows = eqs.map((e, k) => {
      const b = new Uint32Array(W);
      hits[k].forEach((v) => { b[v >> 5] |= 1 << (v & 31); });
      return { b, r: diff[e] ? 1 : 0 };
    });
    const piv = [];
    let r = 0;
    for (let v = 0; v < vars.length && r < rows.length; v++) {
      const w = v >> 5, m = 1 << (v & 31);
      let p = -1;
      for (let k = r; k < rows.length; k++) if (rows[k].b[w] & m) { p = k; break; }
      if (p < 0) continue;
      const t = rows[r]; rows[r] = rows[p]; rows[p] = t;
      for (let k = 0; k < rows.length; k++) {
        if (k === r || !(rows[k].b[w] & m)) continue;
        for (let j = 0; j < W; j++) rows[k].b[j] ^= rows[r].b[j];
        rows[k].r ^= rows[r].r;
      }
      piv.push(v); r++;
    }
    for (let k = r; k < rows.length; k++) if (rows[k].r) return null; // inaccessible
    const isPiv = new Uint8Array(vars.length);
    piv.forEach((v) => { isPiv[v] = 1; });
    const x0 = new Uint32Array(W);
    piv.forEach((v, k) => { if (rows[k].r) x0[v >> 5] |= 1 << (v & 31); });
    const basis = [];
    for (let f = 0; f < vars.length; f++) {
      if (isPiv[f]) continue;
      const b = new Uint32Array(W);
      b[f >> 5] |= 1 << (f & 31);
      piv.forEach((v, k) => { if (rows[k].b[f >> 5] & (1 << (f & 31))) b[v >> 5] |= 1 << (v & 31); });
      basis.push(b);
    }
    let best = x0.slice(), bw = popW(x0);
    const xor = (a, b) => { for (let j = 0; j < W; j++) a[j] ^= b[j]; };
    if (basis.length <= 14) {
      const cur = x0.slice();
      for (let g = 1; g < (1 << basis.length); g++) {
        xor(cur, basis[ctz(g)]);
        const w = popW(cur);
        if (w < bw) { bw = w; best = cur.slice(); }
      }
    } else {
      // (très grand noyau : amélioration gloutonne)
      for (let again = true; again;) {
        again = false;
        basis.forEach((b) => { const t = best.slice(); xor(t, b); const w = popW(t); if (w < bw) { bw = w; best = t; again = true; } });
      }
    }
    const presses = [];
    for (let v = 0; v < vars.length; v++) if (best[v >> 5] & (1 << (v & 31))) presses.push(vars[v]);
    return { presses, weight: bw };
  }

  function makeSystem(n, mask, areas, sealed) {
    const vars = [], eqs = [], idx = new Map();
    for (let i = 0; i < n * n; i++) {
      if (!mask[i]) continue;
      eqs.push(i);
      if (!sealed.includes(i)) { idx.set(i, vars.length); vars.push(i); }
    }
    const pos = new Map(eqs.map((e, k) => [e, k]));
    const hits = eqs.map(() => []);
    vars.forEach((v, k) => areas[v].forEach((e) => hits[pos.get(e)].push(k)));
    return { vars, eqs, hits, W: Math.ceil(vars.length / 32) || 1 };
  }

  // ------------------------------------------------------------------
  // Difficulté (niveaux 1 → 40)
  // ------------------------------------------------------------------
  // [jusqu'au niveau, côté, appuis, errantes, scellées, phare, sans chevauchement, formes]
  const LEVELS = [
    [1, 3, 1, 0, 0, 0, 1, ['carre']],
    [2, 3, 2, 0, 0, 0, 1, ['carre']],
    [4, 4, 2, 0, 0, 0, 1, ['carre']],
    [5, 4, 3, 0, 0, 0, 0, ['carre']],
    [7, 5, 3, 0, 0, 0, 0, ['carre']],
    [8, 5, 4, 0, 0, 0, 0, ['carre', 'octo']],
    [10, 5, 4, 1, 0, 0, 0, ['carre', 'octo']],
    [12, 5, 5, 1, 0, 0, 0, ['octo', 'anneau', 'carre']],
    [15, 6, 5, 1, 0, 0, 0, ['carre', 'croix', 'octo']],
    [18, 6, 5, 1, 1, 0, 0, ['croix', 'anneau', 'octo', 'losange']],
    [22, 6, 6, 2, 2, 0, 0, ['croix', 'anneau', 'octo', 'losange']],
    [27, 7, 6, 2, 2, 0, 0, ['croix', 'anneau', 'octo', 'losange']],
    [32, 7, 7, 2, 2, 1, 0, ['croix', 'anneau', 'octo', 'losange', 'carre']],
    [99, 7, 8, 2, 3, 1, 0, ['croix', 'anneau', 'octo', 'losange', 'carre']]
  ];
  function params(level, variant) {
    const L = Math.max(1, Math.round(level || 1));
    const [, n, presses, stray, sealed, phare, apart, shapes] = LEVELS.find((t) => L <= t[0]);
    return { n, variant: variant || 'classic', presses, stray, sealed, phare: L >= 30 ? phare : 0, apart: !!apart, shapes };
  }

  function generate(rng, p) {
    const n = p.n, pattern = PATTERNS[p.variant] || PATTERNS.classic;
    let best = null;
    for (let t = 0; t < 60; t++) {
      const shape = rng.pick(p.shapes);
      const mask = shapeMask(n, shape);
      const present = [...Array(n * n).keys()].filter((i) => mask[i]);
      const phare = p.phare ? rng.pick(present) : -1;
      const areas = areasOf(n, mask, pattern, phare);
      // les appuis de la solution (distincts, hors phare la plupart du temps)
      const pool = rng.shuffle(present.slice());
      const P = [];
      const used = new Set();
      if (phare >= 0 && rng() < 0.6) { P.push(phare); areas[phare].forEach((j) => used.add(j)); }
      for (const i of pool) {
        if (P.length >= p.presses) break;
        if (i === phare || P.includes(i)) continue;
        if (p.apart && t < 50 && areas[i].some((j) => used.has(j))) continue;
        P.push(i); areas[i].forEach((j) => used.add(j));
      }
      if (P.length < p.presses) continue;
      // cases scellées : des voisines des appuis (elles changent), jamais un appui ni le phare
      const near = [...used].filter((j) => !P.includes(j) && j !== phare);
      const sealed = rng.shuffle(near).slice(0, p.sealed);
      // ciel de départ (croix errantes) et constellation
      const start = new Uint8Array(n * n), goal = new Uint8Array(n * n);
      const order = rng.shuffle(P.slice());
      order.forEach((i, k) => areas[i].forEach((j) => { (k < p.stray ? start : goal)[j] ^= 1; }));
      const lit = (s) => s.reduce((a, b) => a + b, 0);
      if (lit(goal) < Math.min(3, p.presses + 1) || (p.stray && !lit(start))) continue;
      const diff = start.map((v, i) => v ^ goal[i]);
      if (!lit(diff)) continue;
      const sys = makeSystem(n, mask, areas, sealed);
      const sol = solveMin(sys, diff);
      if (!sol) continue;
      const cand = { n, variant: p.variant, shape, mask: Array.from(mask), phare, sealed, start: Array.from(start), goal: Array.from(goal),
        par: sol.weight, solution: sol.presses };
      if (!best || cand.par > best.par) best = cand;
      if (cand.par >= p.presses) break; // la solution la plus courte a bien le nombre de coups voulu
    }
    return best;
  }

  // petit dessin d'étoile (viewBox 0 0 40 40)
  const STAR = '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="lum-st" d="M20 4.5c1 0 1.7.6 2.1 1.5l3.4 7.4 8 .9c2 .2 2.7 2.6 1.2 3.9l-6 5.4 1.7 7.9c.4 2-1.7 3.4-3.4 2.4L20 29.8l-7 4.1c-1.7 1-3.8-.4-3.4-2.4l1.7-7.9-6-5.4c-1.5-1.3-.8-3.7 1.2-3.9l8-.9 3.4-7.4c.4-.9 1.1-1.5 2.1-1.5z"/></svg>';
  const LOCK = '<svg class="lum-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none"/></svg>';
  const BEAM = '<svg class="lum-beam" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="3.2"/></svg>';

  function create(host, puzzle, api) {
    const { n, mask, phare, sealed, goal } = puzzle;
    const pattern = PATTERNS[puzzle.variant] || PATTERNS.classic;
    const areas = areasOf(n, mask, pattern, phare);
    const sys = makeSystem(n, mask, areas, sealed);
    const isSealed = new Uint8Array(n * n);
    sealed.forEach((i) => { isSealed[i] = 1; });
    let state = Uint8Array.from(puzzle.start);
    let moves = 0, won = false, dead = false;
    const history = [];
    const timers = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
    const calm = () => document.documentElement.classList.contains('a11y-motion') ||
      !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // --- construction ---
    const box = document.createElement('div');
    box.className = 'lum' + (puzzle.variant === 'croix' ? ' x' : '');
    box.style.setProperty('--n', n);
    box.innerHTML = '<div class="lum-hud"><span class="lum-par" role="img"></span><b class="lum-extra" aria-hidden="true"></b></div>' +
      '<div class="lum-sky"><svg class="lum-lines" aria-hidden="true"></svg><div class="lum-grid"></div></div>';
    const parEl = box.querySelector('.lum-par'), extraEl = box.querySelector('.lum-extra');
    const sky = box.querySelector('.lum-sky'), grid = box.querySelector('.lum-grid'), lines = box.querySelector('.lum-lines');
    const dots = [];
    for (let k = 0; k < puzzle.par; k++) { const d = document.createElement('i'); parEl.appendChild(d); dots.push(d); }
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      if (!mask[i]) { cells.push(null); continue; }
      const b = document.createElement('button');
      b.className = 'lum-cell' + (goal[i] ? ' goal' : '') + (isSealed[i] ? ' seal' : '') + (i === phare ? ' phare' : '');
      b.dataset.i = i;
      b.style.gridArea = (r + 1) + ' / ' + (c + 1);
      b.style.setProperty('--d', (r + c) * 26 + 'ms');
      b.innerHTML = '<span class="lum-ring"></span><span class="lum-star">' + STAR + '</span>' + (isSealed[i] ? LOCK : '') + (i === phare ? BEAM : '');
      grid.appendChild(b);
      cells.push(b);
    }
    host.appendChild(box);

    function fit() {
      const w = (host.clientWidth || 340) - 8;
      const play = host.closest && host.closest('#play');
      const h = Math.max(220, (play && play.clientHeight ? play.clientHeight - 340 : host.clientHeight || 520) - 8);
      const gap = n >= 7 ? 5 : 7, pad = 12;
      const t = Math.floor(Math.min((w - 2 * pad - gap * (n - 1)) / n, (h - 2 * pad - gap * (n - 1)) / n, 78));
      box.style.setProperty('--t', Math.max(34, t) + 'px');
      box.style.setProperty('--gap', gap + 'px');
      box.style.setProperty('--pad', pad + 'px');
    }
    fit();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }

    const label = (i) => {
      const r = Math.floor(i / n) + 1, c = i % n + 1;
      return 'Ligne ' + r + ', colonne ' + c + ' : ' + (state[i] ? 'allumée' : 'éteinte') + (goal[i] ? ', étoile de la constellation' : '') +
        (isSealed[i] ? ', scellée' : '') + (i === phare ? ', phare' : '');
    };
    function render() {
      cells.forEach((b, i) => {
        if (!b) return;
        b.classList.toggle('on', !!state[i]);
        b.classList.toggle('ok', !!state[i] && !!goal[i]);
        b.classList.toggle('stray', !!state[i] && !goal[i]);
        b.setAttribute('aria-label', label(i));
      });
      dots.forEach((d, k) => d.classList.toggle('used', k < moves));
      const extra = moves - puzzle.par;
      extraEl.textContent = extra > 0 ? '+' + extra : '';
      box.classList.toggle('over', extra > 0);
      parEl.setAttribute('aria-label', 'Objectif : ' + puzzle.par + ' coup' + (puzzle.par > 1 ? 's' : '') + ' · joués : ' + moves);
    }

    const solved = () => cells.every((b, i) => !b || state[i] === goal[i]);

    // victoire : la constellation se relie (arbre couvrant le plus court entre ses étoiles), les étoiles scintillent
    function celebrate() {
      const pts = [];
      cells.forEach((b, i) => { if (b && goal[i]) pts.push(i); });
      const t = parseFloat(getComputedStyle(box).getPropertyValue('--t')) || 50;
      const gap = parseFloat(getComputedStyle(box).getPropertyValue('--gap')) || 6;
      const at = (i) => [(i % n) * (t + gap) + t / 2, Math.floor(i / n) * (t + gap) + t / 2];
      const size = n * t + (n - 1) * gap;
      lines.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      // Prim : on relie de proche en proche
      const inT = [pts[0]], segs = [];
      const rest = new Set(pts.slice(1));
      while (rest.size) {
        let bd = Infinity, ba = -1, bb = -1;
        inT.forEach((a) => rest.forEach((b) => {
          const [x1, y1] = at(a), [x2, y2] = at(b), d = (x1 - x2) ** 2 + (y1 - y2) ** 2;
          if (d < bd) { bd = d; ba = a; bb = b; }
        }));
        segs.push([ba, bb]); inT.push(bb); rest.delete(bb);
      }
      lines.innerHTML = segs.map(([a, b], k) => {
        const [x1, y1] = at(a), [x2, y2] = at(b), len = Math.hypot(x2 - x1, y2 - y1);
        return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="--len:' + len.toFixed(1) + ';--k:' + k + '"/>';
      }).join('');
      box.classList.add('won');
      if (moves <= puzzle.par) { box.classList.add('perfect'); extraEl.textContent = 'Parfait !'; }
    }

    function flash(i) {
      const a = areas[i];
      const [r0, c0] = [Math.floor(i / n), i % n];
      a.forEach((j) => {
        const b = cells[j];
        const dist = Math.abs(Math.floor(j / n) - r0) + Math.abs(j % n - c0);
        b.style.setProperty('--w', dist * 45 + 'ms');
        b.classList.remove('wave'); void b.offsetWidth; b.classList.add('wave');
      });
    }

    function doPress(i, quiet) {
      if (won || !cells[i]) return;
      if (isSealed[i]) {
        // scellée : on ne peut pas la toucher ; elle change seulement avec ses voisines
        const b = cells[i];
        b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope');
        if (C.sfx.error) C.sfx.error();
        return;
      }
      history.push({ state: state.slice(), moves });
      areas[i].forEach((j) => { state[j] ^= 1; });
      moves++;
      if (!quiet) C.sfx.tap();
      flash(i);
      render(); api.onChange();
      if (solved()) {
        won = true;
        celebrate();
        C.sfx.place();
        later(() => api.onWin(), calm() ? 150 : 650);
      }
    }

    // au doigt : dès l'appui ; au clavier : click
    grid.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button > 0) return;
      const b = e.target.closest('.lum-cell');
      if (b) doPress(+b.dataset.i);
    });
    grid.addEventListener('click', (e) => {
      if (e.detail) return; // (déjà joué au pointerdown)
      const b = e.target.closest('.lum-cell');
      if (b) doPress(+b.dataset.i);
    });

    render();

    // --- le coup suivant (astuce et 💬) : un appui de la plus courte solution, avec sa raison ---
    function nextMove() {
      if (won) return null;
      const diff = state.map((v, i) => v ^ goal[i]);
      const sol = solveMin(sys, diff);
      if (!sol || !sol.presses.length) return null;
      const wrong = (j) => state[j] !== goal[j];
      const score = (i) => { const a = areas[i], fix = a.filter(wrong).length; return { fix, spoil: a.length - fix }; };
      let pick = sol.presses.find((i) => areas[i].length >= 3 && areas[i].every(wrong));
      let kind = 'whole';
      if (pick == null) {
        pick = sol.presses.find((i) => areas[i].some((j) => isSealed[j] && wrong(j)));
        kind = 'seal';
      }
      if (pick == null) {
        kind = 'best';
        let bs = -Infinity;
        sol.presses.forEach((i) => { const s = score(i), v = s.fix - s.spoil; if (v > bs) { bs = v; pick = i; } });
      }
      const { fix, spoil } = score(pick);
      const left = sol.weight;
      const what = pick === phare ? 'le phare inverse toute sa ligne et toute sa colonne'
        : puzzle.variant === 'croix' ? 'elle et ses voisines en diagonale s\'inversent' : 'elle et ses 4 voisines s\'inversent';
      let text;
      if (kind === 'whole') {
        text = 'Les ' + areas[pick].length + ' cases surlignées sont toutes fausses : touche la case dorée, ' + what + ' et tout se corrige d\'un coup.';
      } else if (kind === 'seal') {
        const s = areas[pick].find((j) => isSealed[j] && wrong(j));
        text = 'La case au cadenas ne se touche pas : seule une voisine peut ' + (goal[s] ? 'l\'allumer' : 'l\'éteindre') + '. Touche la case dorée, elle fait partie de la solution.';
      } else {
        text = 'Touche la case dorée : ' + what + '. ' + fix + ' case' + (fix > 1 ? 's' : '') + ' se corrige' + (fix > 1 ? 'nt' : '') +
          (spoil ? ', ' + spoil + ' se dérange' + (spoil > 1 ? 'nt' : '') + ' pour l\'instant' : '') + '.';
      }
      text += left > 1 ? ' Encore ' + left + ' coups au plus court.' : ' C\'est le dernier coup !';
      return { i: pick, text, where: [cells[pick]], why: areas[pick].filter((j) => j !== pick).map((j) => cells[j]) };
    }

    return {
      status() {
        return won ? 'Constellation allumée' : 'Coups ' + moves + ' (objectif ' + puzzle.par + ')';
      },
      undo() {
        if (won || !history.length) return;
        const h = history.pop();
        state = h.state; moves = h.moves;
        render(); api.onChange();
      },
      reset() {
        if (won) return;
        history.push({ state: state.slice(), moves });
        state = Uint8Array.from(puzzle.start); moves = 0;
        render(); api.onChange();
      },
      // résolution directe (outil de test) : on joue la plus courte solution restante
      solve() {
        const diff = state.map((v, i) => v ^ goal[i]);
        const sol = solveMin(sys, diff);
        if (sol) sol.presses.forEach((i) => doPress(i, true));
      },
      // indice : la case à toucher (rien n'est joué), ses voisines surlignées
      hint() {
        const m = nextMove();
        if (!m) return false;
        return { text: m.text, where: m.where, why: m.why };
      },
      // 💬 la méthode : décomposer le dessin en croix
      method: puzzle.variant === 'croix'
        ? 'Chaque appui inverse un X : la case et ses 4 diagonales. Cherche les X entiers dans le dessin et touche leur centre ; là où deux X se recouvrent, la case s\'éteint.'
        : 'Chaque appui inverse une croix : la case et ses 4 voisines. Cherche les croix entières parmi les cases fausses et touche leur centre ; là où deux croix se recouvrent, la case s\'éteint.',
      coach(k) {
        if (won || k > 2) return null;
        const m = nextMove();
        if (!m) return null;
        return { text: m.text, where: m.where, why: m.why, play: () => doPress(m.i) };
      },
      redraw() { fit(); },
      destroy() {
        dead = true;
        timers.forEach(clearTimeout); timers.clear();
        if (ro) ro.disconnect();
      }
    };
  }

  C.register({
    id: 'lumieres',
    name: 'Lumières',
    tagline: 'Allume la constellation',
    accent: '#ffd23f',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M9 2h6v2h2v2h2v6h-2v2h-2v2H9v-2H7v-2H5V6h2V4h2zM9 18h6v2H9zM10 21h4v2h-4z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Chaque appui inverse la case et ses 4 voisines.' },
      { id: 'croix', name: 'Croix', desc: 'Chaque appui inverse la case et ses 4 diagonales.' }
    ],
    rules: {
      classic: [
        'Touche une case : elle et ses <b>4 voisines</b> (haut, bas, gauche, droite) s\'allument ou s\'éteignent.',
        'Allume <b>exactement</b> les étoiles cerclées d\'or : la constellation. Les autres cases restent éteintes (éteins les étoiles en trop).',
        'Les points en haut : le nombre de coups de la solution la plus courte. Un défi en plus, pas une obligation.',
        'Plus loin : une case au <b>cadenas</b> ne se touche pas (seules ses voisines la changent) ; le <b>phare</b> inverse toute sa ligne et sa colonne.'
      ],
      croix: [
        'Touche une case : elle et ses <b>4 voisines en diagonale</b> s\'allument ou s\'éteignent.',
        'Allume <b>exactement</b> les étoiles cerclées d\'or ; les autres cases restent éteintes.',
        'Astuce : un appui ne touche que les cases de sa couleur de damier.',
        'Les points en haut : le nombre de coups de la solution la plus courte.'
      ]
    },
    params,
    generate,
    create
  });
})();
