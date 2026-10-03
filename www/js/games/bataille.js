// Bataille navale : le touché-coulé en solitaire, devenu casse-tête d'hypothèses.
// Une flotte de trières est cachée ; les nombres au bord comptent les cases de navire
// de chaque ligne et colonne. Les tirs sont comptés : on déduit avant de tirer.
(function () {
  'use strict';
  const C = window.Carnet;

  // ------------------------------------------------------------------
  // Progression : la mer s'agrandit et la flotte grossit ; la marge de tirs se resserre.
  // [niveau de départ, taille, flotte]
  // ------------------------------------------------------------------
  const STAGES = [
    [1, 5, [2, 1, 1]],
    [4, 5, [3, 2, 1]],
    [8, 6, [3, 2, 1, 1]],
    [13, 6, [3, 2, 2, 1]],
    [19, 7, [3, 2, 2, 1, 1]],
    [25, 7, [4, 3, 2, 1, 1]],
    [32, 8, [4, 3, 2, 2, 1, 1]],
    [40, 8, [4, 3, 3, 2, 2, 1, 1]]
  ];

  function params(level) {
    let s = STAGES[0];
    STAGES.forEach((t) => { if (level >= t[0]) s = t; });
    // tirs en plus de ce qu'il faut à un joueur méthodique (simulé) : 7 au début, 5 au niveau 40
    // (la marge fixe se resserre, une petite part proportionnelle à la flotte la complète)
    const cells = s[2].reduce((a, b) => a + b, 0);
    const extra = Math.max(3, Math.round(7 - (level - 1) * 0.1)) + Math.floor(cells / 7);
    return { variant: 'classic', n: s[1], lens: s[2].slice(), extra };
  }

  // ------------------------------------------------------------------
  // Placements possibles d'un navire (mis en cache par taille de grille)
  // ------------------------------------------------------------------
  const PL = {};
  function placements(n) {
    if (PL[n]) return PL[n];
    const out = {};
    for (let L = 1; L <= 4; L++) {
      const arr = [];
      [true, false].forEach((h) => {
        if (L === 1 && !h) return;
        for (let r = 0; r < n; r++) {
          for (let c = 0; c < n; c++) {
            if (h ? c + L > n : r + L > n) continue;
            const cells = [];
            for (let k = 0; k < L; k++) cells.push(h ? r * n + c + k : (r + k) * n + c);
            // voisinage (diagonales comprises) : aucun autre navire n'a le droit d'y être
            const nb = [];
            const r1 = h ? r + 1 : r + L, c1 = h ? c + L : c + 1;
            for (let y = r - 1; y <= r1; y++) {
              for (let x = c - 1; x <= c1; x++) {
                if (y < 0 || x < 0 || y >= n || x >= n) continue;
                const i = y * n + x;
                if (cells.indexOf(i) < 0) nb.push(i);
              }
            }
            arr.push({ cells, nb, h, r, c, L });
          }
        }
      });
      out[L] = arr;
    }
    PL[n] = out;
    return out;
  }

  function placeFleet(n, lens, rng) {
    const P = placements(n);
    for (let t = 0; t < 600; t++) {
      const occ = new Uint8Array(n * n); // 1 navire, 2 voisinage interdit
      const ships = [];
      let ok = true;
      for (const L of lens) {
        const cand = P[L].filter((p) => p.cells.every((i) => !occ[i]));
        if (!cand.length) { ok = false; break; }
        const p = rng.pick(cand);
        p.cells.forEach((i) => { occ[i] = 1; });
        p.nb.forEach((i) => { if (!occ[i]) occ[i] = 2; });
        ships.push({ len: L, cells: p.cells.slice(), h: p.h });
      }
      if (ok) return ships;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Déductions à partir de ce que le joueur sait.
  // know[i] : 0 inconnu, 1 eau (raté), 2 touché, 4 coulé.
  // Renvoie l'état déduit k (1 eau certaine, 3 navire certain), la raison de chaque
  // déduction, leur ordre, et la « densité » : combien de placements passent par chaque case.
  // ------------------------------------------------------------------
  const isShip = (v) => v === 2 || v === 3 || v === 4;

  function analyze(n, rows, cols, lens, know, sunkLens) {
    const N = n * n, P = placements(n);
    const k = Int8Array.from(know);
    const rem = lens.slice();
    sunkLens.forEach((L) => { const j = rem.indexOf(L); if (j >= 0) rem.splice(j, 1); });
    const Ls = [...new Set(rem)];
    const why = new Map();
    const order = [];
    let cover = new Int32Array(N);
    const inRow = new Int32Array(n), inCol = new Int32Array(n);
    const set = (i, v, reason) => {
      if (k[i] !== 0) return false;
      k[i] = v;
      why.set(i, reason);
      order.push(i);
      if (v === 3) { inRow[(i / n) | 0]++; inCol[i % n]++; }
      return true;
    };

    for (let pass = 0; pass < 40; pass++) {
      inRow.fill(0); inCol.fill(0);
      for (let i = 0; i < N; i++) if (isShip(k[i])) { inRow[(i / n) | 0]++; inCol[i % n]++; }
      // chaînes de cases touchées, pas encore coulées
      const chainOf = new Int32Array(N).fill(-1);
      const chains = [];
      for (let i = 0; i < N; i++) {
        if (k[i] !== 2 || chainOf[i] >= 0) continue;
        const id = chains.length, cells = [i];
        chainOf[i] = id;
        for (let q = 0; q < cells.length; q++) {
          const x = cells[q], r = (x / n) | 0, c = x % n;
          [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([y, z]) => {
            if (y < 0 || z < 0 || y >= n || z >= n) return;
            const j = y * n + z;
            if (k[j] === 2 && chainOf[j] < 0) { chainOf[j] = id; cells.push(j); }
          });
        }
        chains.push({ cells, inter: null });
      }

      cover = new Int32Array(N);
      for (const L of Ls) {
        for (const p of P[L]) {
          let bad = false, fresh = false, own = 0;
          for (const i of p.cells) {
            const v = k[i];
            if (v === 1 || v === 4) { bad = true; break; }
            if (v !== 2) fresh = true; // au moins une case pas encore touchée (sinon il serait coulé)
            if (isShip(v)) own++;
          }
          if (bad || !fresh) continue;
          for (const i of p.nb) if (isShip(k[i])) { bad = true; break; }
          if (bad) continue;
          // les nombres du bord ne doivent pas être dépassés
          if (p.h) {
            if (inRow[p.r] - own + L > rows[p.r]) continue;
            for (const i of p.cells) if (inCol[i % n] - (isShip(k[i]) ? 1 : 0) + 1 > cols[i % n]) { bad = true; break; }
          } else {
            if (inCol[p.c] - own + L > cols[p.c]) continue;
            for (const i of p.cells) { const r = (i / n) | 0; if (inRow[r] - (isShip(k[i]) ? 1 : 0) + 1 > rows[r]) { bad = true; break; } }
          }
          if (bad) continue;
          for (const i of p.cells) cover[i]++;
          // une chaîne touchée : on garde ce que tous ses placements possibles ont en commun
          const seen = [];
          for (const i of p.cells) {
            const ch = chainOf[i];
            if (ch < 0 || seen.indexOf(ch) >= 0) continue;
            seen.push(ch);
            const o = chains[ch];
            if (!o.inter) o.inter = p.cells.slice();
            else o.inter = o.inter.filter((x) => p.cells.indexOf(x) >= 0);
          }
        }
      }

      let changed = false;
      for (let i = 0; i < N; i++) if (k[i] === 0 && !cover[i]) changed = set(i, 1, { t: 'nofit' }) || changed;
      chains.forEach((o) => {
        if (o.inter) o.inter.forEach((i) => { if (k[i] === 0) changed = set(i, 3, { t: 'chain', from: o.cells }) || changed; });
      });
      // une ligne qui n'a plus que juste assez de cases libres pour ses navires
      for (let r = 0; r < n; r++) {
        const need = rows[r] - inRow[r];
        if (need <= 0) continue;
        const free = [];
        for (let c = 0; c < n; c++) if (k[r * n + c] === 0) free.push(r * n + c);
        if (free.length === need) free.forEach((i) => { changed = set(i, 3, { t: 'row', need }) || changed; });
      }
      for (let c = 0; c < n; c++) {
        const need = cols[c] - inCol[c];
        if (need <= 0) continue;
        const free = [];
        for (let r = 0; r < n; r++) if (k[r * n + c] === 0) free.push(r * n + c);
        if (free.length === need) free.forEach((i) => { changed = set(i, 3, { t: 'col', need }) || changed; });
      }
      if (!changed) break;
    }
    return { k, why, order, cover };
  }

  // Tir sur une mer : met à jour know / sunk, renvoie 'miss' | 'hit' | 'sunk'.
  function shoot(sea, owner, know, sunk, i) {
    const s = owner[i];
    if (s < 0) { know[i] = 1; return 'miss'; }
    know[i] = 2;
    const ship = sea.ships[s];
    if (ship.cells.every((j) => know[j] === 2)) {
      ship.cells.forEach((j) => { know[j] = 4; });
      sunk[s] = 1;
      return 'sunk';
    }
    return 'hit';
  }

  const ownerOf = (n, ships) => {
    const o = new Int16Array(n * n).fill(-1);
    ships.forEach((s, k) => s.cells.forEach((i) => { o[i] = k; }));
    return o;
  };
  const sunkLensOf = (sea, sunk) => sea.ships.filter((_, k) => sunk[k]).map((s) => s.len);

  // Joueur méthodique simulé : tire sur les cases certaines, sinon sur la plus « dense ».
  // Son nombre de ratés fixe le nombre de tirs accordés.
  function simulate(n, sea, lens) {
    const N = n * n, owner = ownerOf(n, sea.ships);
    const know = new Int8Array(N), sunk = new Uint8Array(sea.ships.length);
    let misses = 0, shots = 0;
    while (sunk.some((v) => !v) && shots < N) {
      const a = analyze(n, sea.rows, sea.cols, lens, know, sunkLensOf(sea, sunk));
      let pick = -1;
      for (const i of a.order) if (a.k[i] === 3 && know[i] === 0) { pick = i; break; }
      if (pick < 0) {
        let best = -1;
        for (let i = 0; i < N; i++) if (a.k[i] === 0 && a.cover[i] > best) { best = a.cover[i]; pick = i; }
      }
      if (pick < 0) break;
      shots++;
      if (shoot(sea, owner, know, sunk, pick) === 'miss') misses++;
    }
    return misses;
  }

  function makeSea(n, lens, extra, rng) {
    const ships = placeFleet(n, lens, rng);
    const rows = new Array(n).fill(0), cols = new Array(n).fill(0);
    ships.forEach((s) => s.cells.forEach((i) => { rows[(i / n) | 0]++; cols[i % n]++; }));
    const sea = { ships, rows, cols };
    const cells = lens.reduce((a, b) => a + b, 0);
    sea.shots = Math.min(n * n, cells + simulate(n, sea, lens) + extra);
    return sea;
  }

  function generate(rng, p) {
    const seed = rng.int(1e9);
    return Object.assign({ seed, sea: makeSea(p.n, p.lens, p.extra, rng) }, p);
  }

  // ------------------------------------------------------------------
  // Dessins : trière (vue de côté, proue à droite), flamme, icône
  // ------------------------------------------------------------------
  function shipInner(L) {
    const W = L * 10, m = W / 2;
    let s = '<g stroke="none">';
    for (let x = 5; x <= W - 5; x += 3) s += '<path d="M' + x + ' 6.8l-1.3 2.5" stroke="#6b3a22" stroke-width=".7" stroke-linecap="round" fill="none"/>';
    s += '<path d="M' + m + ' 4.6V1" stroke="#6b3a22" stroke-width=".6" fill="none"/>';
    s += '<path d="M' + (m - 2.4) + ' 1.2h4.8l-.5 2.7h-3.8z" fill="#f4ecdb"/>';
    s += '<path d="M1.3 2.4Q2.1 4.6 4.2 4.6H' + (W - 3) + 'L' + (W - 0.5) + ' 5.9L' + (W - 3.2) + ' 7.2H4.6Q1.9 7.2 1.3 2.4Z" fill="#a0532d"/>';
    s += '<path d="M4.8 5.5H' + (W - 3.8) + '" stroke="#e9c46e" stroke-width=".55" fill="none"/>';
    s += '<circle cx="' + (W - 3.3) + '" cy="5.6" r=".5" fill="#fffaf0"/></g>';
    return s;
  }
  const FLAME = '<svg class="bn-flame" viewBox="0 0 24 24"><g stroke="none"><path d="M12 2.5c1.2 3.6 5.6 5.4 5.6 10.4A5.6 5.6 0 0 1 6.4 13c0-2.3 1.1-3.8 2.3-4.8.2 1.6 1 2.6 2 2.9C10.5 8.6 10.6 5.4 12 2.5z" fill="#e8743b"/>' +
    '<path d="M12.2 10.2c.8 1.9 3 2.8 3 5a3.2 3.2 0 0 1-6.4.1c0-1.3.7-2.1 1.4-2.6.2.8.6 1.2 1.1 1.4-.2-1.4-.1-2.8.9-3.9z" fill="#f7c95a"/>' +
    '<path d="M4 20.5 7 18.6M20 20.5l-3-1.9M12 21.5v-1.6" stroke="#8a4a2b" stroke-width="1.4" stroke-linecap="round"/></g></svg>';

  // ------------------------------------------------------------------
  // Partie
  // ------------------------------------------------------------------
  function create(host, puzzle, api) {
    const n = puzzle.n, N = n * n, lens = puzzle.lens;
    let round = 0;
    let sea, owner, know, sunk, marks, shotsUsed, over, won;
    const history = []; // repères d'eau uniquement : un tir ne se reprend pas

    const wrap = document.createElement('div');
    wrap.className = 'bataille-wrap';
    wrap.style.setProperty('--n', n);
    host.appendChild(wrap);

    const corner = document.createElement('div');
    corner.className = 'bn-corner';
    wrap.appendChild(corner);
    const colsEl = document.createElement('div');
    colsEl.className = 'bn-cols';
    wrap.appendChild(colsEl);
    const rowsEl = document.createElement('div');
    rowsEl.className = 'bn-rows';
    wrap.appendChild(rowsEl);
    const colClues = [], rowClues = [];
    for (let k = 0; k < n; k++) {
      const a = document.createElement('span'); colsEl.appendChild(a); colClues.push(a);
      const b = document.createElement('span'); rowsEl.appendChild(b); rowClues.push(b);
    }

    const grid = document.createElement('div');
    grid.className = 'cell-grid bataille';
    grid.style.setProperty('--n', n);
    wrap.appendChild(grid);
    const cells = [];
    for (let i = 0; i < N; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      // placement explicite : les silhouettes des navires peuvent ainsi s'étendre sur plusieurs cases
      d.style.gridRow = ((i / n) | 0) + 1;
      d.style.gridColumn = (i % n) + 1;
      grid.appendChild(d);
      cells.push(d);
    }

    const foot = document.createElement('div');
    foot.className = 'bn-foot';
    wrap.appendChild(foot);
    const fleetEl = document.createElement('div');
    fleetEl.className = 'bn-fleet';
    foot.appendChild(fleetEl);
    const shotsEl = document.createElement('div');
    shotsEl.className = 'bn-shots';
    foot.appendChild(shotsEl);
    const endEl = document.createElement('div');
    endEl.className = 'bn-end';
    endEl.hidden = true;
    endEl.innerHTML = '<span>Plus de tirs : la mer garde sa flotte.</span><button class="btn primary">Nouvelle mer</button>';
    wrap.appendChild(endEl);
    endEl.querySelector('button').addEventListener('click', () => { C.sfx.tap(); newSea(); });

    let fleetPips = [], shotDots = [], overlays = [];

    function load(s) {
      sea = s;
      owner = ownerOf(n, sea.ships);
      know = new Int8Array(N);
      sunk = new Uint8Array(sea.ships.length);
      marks = new Uint8Array(N);
      shotsUsed = 0; over = false; won = false;
      history.length = 0;
      overlays.forEach((o) => o.remove());
      overlays = [];
      for (let k = 0; k < n; k++) { colClues[k].textContent = sea.cols[k]; rowClues[k].textContent = sea.rows[k]; }
      // flotte à trouver : une petite silhouette par navire
      fleetEl.innerHTML = '';
      fleetPips = sea.ships.map((s) => {
        const p = document.createElement('span');
        p.className = 'bn-pip';
        p.innerHTML = '<i></i>'.repeat(s.len);
        fleetEl.appendChild(p);
        return p;
      });
      shotsEl.innerHTML = '';
      shotDots = [];
      for (let k = 0; k < sea.shots; k++) { const d = document.createElement('i'); shotsEl.appendChild(d); shotDots.push(d); }
      shotsEl.setAttribute('aria-label', sea.shots + ' tirs');
      endEl.hidden = true;
      wrap.classList.remove('over');
    }

    function newSea() {
      round++;
      load(makeSea(n, lens, puzzle.extra, C.makeRng(puzzle.seed + ':mer:' + round)));
      render();
      api.onChange();
    }

    function shipOverlay(s, ghost) {
      const d = document.createElement('div');
      d.className = 'bn-ship' + (ghost ? ' ghost' : '');
      const r = (s.cells[0] / n) | 0, c = s.cells[0] % n, W = s.len * 10;
      d.style.gridRow = (r + 1) + ' / span ' + (s.h ? 1 : s.len);
      d.style.gridColumn = (c + 1) + ' / span ' + (s.h ? s.len : 1);
      d.innerHTML = s.h
        ? '<svg viewBox="0 0 ' + W + ' 10">' + shipInner(s.len) + '</svg>'
        : '<svg viewBox="0 0 10 ' + W + '"><g transform="translate(10 0) rotate(90)">' + shipInner(s.len) + '</g></svg>';
      d.classList.add(s.h ? 'h' : 'v');
      grid.appendChild(d);
      overlays.push(d);
      return d;
    }

    // eau certaine autour d'un navire coulé (les navires ne se touchent jamais)
    function autoWater() {
      const out = new Uint8Array(N);
      sea.ships.forEach((s, k) => {
        if (!sunk[k]) return;
        s.cells.forEach((i) => {
          const r = (i / n) | 0, c = i % n;
          for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) {
            if (y >= 0 && x >= 0 && y < n && x < n && owner[y * n + x] < 0) out[y * n + x] = 1;
          }
        });
      });
      return out;
    }

    function render() {
      const auto = autoWater();
      cells.forEach((d, i) => {
        const v = know[i];
        let key = '';
        if (v === 4) key = 's';
        else if (v === 2) key = 'h';
        else if (v === 1) key = 'o';
        else if (over && owner[i] >= 0) key = 'g';
        else if (auto[i]) key = 'a';
        else if (marks[i]) key = 'w';
        if (d.dataset.k === key) return; // seules les cases qui changent sont redessinées
        d.dataset.k = key;
        d.className = d.className.replace(/\b(open|hit|sunk|ghostc|auto|marked)\b/g, '').replace(/\s+/g, ' ').trim();
        if (key === 'o') {
          d.classList.add('open');
          d.innerHTML = '<span class="bn-splash"><i></i><i></i></span><span class="bn-drop"></span>';
        } else if (key === 'h') {
          d.classList.add('hit');
          d.innerHTML = '<span class="bn-burst"></span><span class="bn-hit">' + FLAME + '</span>';
        } else if (key === 's') {
          d.classList.add('sunk');
          d.innerHTML = '';
        } else if (key === 'g') {
          d.classList.add('ghostc');
          d.innerHTML = '';
        } else if (key === 'a') {
          d.classList.add('auto');
          d.innerHTML = '<span class="bn-dot"></span>';
        } else if (key === 'w') {
          d.classList.add('marked');
          d.innerHTML = '<span class="bn-dot"></span>';
        } else d.innerHTML = '';
      });
      // nombres du bord : estompés quand toutes leurs cases de navire sont trouvées
      const hr = new Int32Array(n), hc = new Int32Array(n);
      for (let i = 0; i < N; i++) if (know[i] === 2 || know[i] === 4) { hr[(i / n) | 0]++; hc[i % n]++; }
      for (let k = 0; k < n; k++) {
        rowClues[k].classList.toggle('done', hr[k] >= sea.rows[k]);
        colClues[k].classList.toggle('done', hc[k] >= sea.cols[k]);
      }
      fleetPips.forEach((p, k) => p.classList.toggle('sunk', !!sunk[k]));
      shotDots.forEach((d, k) => d.classList.toggle('used', k < shotsUsed));
      // silhouettes : navires coulés, et toute la flotte quand les tirs sont épuisés
      sea.ships.forEach((s, k) => {
        const has = overlays.find((o) => o.dataset.ship === String(k));
        if (sunk[k] && (!has || has.classList.contains('ghost'))) {
          if (has) { has.remove(); overlays.splice(overlays.indexOf(has), 1); }
          shipOverlay(s, false).dataset.ship = k;
        } else if (!sunk[k] && over && !has) shipOverlay(s, true).dataset.ship = k;
      });
      endEl.hidden = !over;
      wrap.classList.toggle('over', over);
    }

    function fire(i) {
      shotsUsed++;
      marks[i] = 0;
      const res = shoot(sea, owner, know, sunk, i);
      if (res === 'miss') C.sfx.tap();
      else C.sfx.place();
      if (sunk.every((v) => v)) {
        won = true;
        render(); api.onChange(); api.onWin();
        return res;
      }
      if (shotsUsed >= sea.shots) { over = true; setTimeout(() => C.sfx.error(), 350); }
      render(); api.onChange();
      return res;
    }

    function act(i) {
      if (over || won || know[i] !== 0) return;
      const mode = api.tool ? api.tool() : 'fill';
      if (mode === 'cross' || marks[i]) {
        // repère d'eau : gratuit, on le pose ou on l'enlève
        history.push(marks.slice());
        marks[i] = marks[i] ? 0 : 1;
        C.sfx.tap(); render(); api.onChange();
        return;
      }
      if (autoWater()[i]) { C.sfx.tap(); return; } // collée à un navire coulé : forcément de l'eau
      fire(i);
    }

    grid.addEventListener('click', (e) => {
      const d = e.target.closest('.cell');
      if (!d || !grid.contains(d)) return;
      act(+d.dataset.i);
    });

    load(puzzle.sea);
    render();

    const dirText = (t, from) => {
      const tr = (t / n) | 0, tc = t % n;
      const rs = from.map((i) => (i / n) | 0), cs = from.map((i) => i % n);
      if (rs.every((r) => r === tr)) return tc > Math.max(...cs) ? 'vers la droite' : 'vers la gauche';
      if (cs.every((c) => c === tc)) return tr > Math.max(...rs) ? 'vers le bas' : 'vers le haut';
      return 'par ici';
    };

    return {
      tools: [{ id: 'fill', label: 'Tirer' }, { id: 'cross', label: 'Repère d\'eau' }],
      status() {
        if (won) return 'Flotte coulée';
        if (over) return 'Plus de tirs : essaie une nouvelle mer';
        const s = sunk.reduce((a, b) => a + b, 0);
        return 'Coulés ' + s + '/' + sunk.length + ' · ' + (sea.shots - shotsUsed) + ' tirs';
      },
      undo() { if (history.length) { marks = history.pop(); render(); api.onChange(); } },
      reset() {
        // efface les repères ; les tirs, eux, restent tirés
        if (!marks.some((v) => v)) return;
        history.push(marks.slice());
        marks = new Uint8Array(N);
        render(); api.onChange();
      },
      // outil de test : toute la flotte coule d'un coup
      solve() {
        if (won) return;
        over = false;
        sea.ships.forEach((s, k) => { s.cells.forEach((i) => { know[i] = 4; }); sunk[k] = 1; });
        won = true;
        render(); api.onChange(); api.onWin();
      },
      hint() {
        if (over || won) return false;
        // un repère d'eau posé sur un navire : on l'enlève d'abord
        for (let i = 0; i < N; i++) {
          if (marks[i] && owner[i] >= 0) {
            history.push(marks.slice());
            marks[i] = 0; render(); api.onChange();
            return 'Ce repère d\'eau est de trop : rien n\'interdit encore un navire à cet endroit.';
          }
        }
        const a = analyze(n, sea.rows, sea.cols, lens, know, sunkLensOf(sea, sunk));
        for (const i of a.order) {
          if (a.k[i] !== 3 || know[i] !== 0) continue;
          const w = a.why.get(i);
          let txt;
          if (w.t === 'row' || w.t === 'col') {
            const line = w.t === 'row' ? 'cette ligne' : 'cette colonne';
            txt = w.need === 1
              ? 'Il manque encore 1 case de navire dans ' + line + ', et il ne reste qu\'une seule place possible : tire ici.'
              : 'Il manque encore ' + w.need + ' cases de navire dans ' + line + ', et il ne reste que ' + w.need + ' places possibles : tire ici.';
          } else {
            txt = 'Ce navire touché n\'est pas coulé : il continue forcément ' + dirText(i, w.from) + ', il n\'a pas la place de l\'autre côté.';
          }
          fire(i);
          return txt;
        }
        // pas de certitude : on prolonge un navire touché, sinon la case la plus probable
        let pick = -1, best = -1, ext = false;
        for (let i = 0; i < N; i++) {
          if (know[i] !== 0 || owner[i] < 0) continue;
          const r = (i / n) | 0, c = i % n;
          const nextToHit = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([y, x]) => y >= 0 && x >= 0 && y < n && x < n && know[y * n + x] === 2);
          const score = a.cover[i] + (nextToHit ? 1e6 : 0);
          if (score > best) { best = score; pick = i; ext = nextToHit; }
        }
        if (pick < 0) return false;
        fire(pick);
        return ext
          ? 'Ce navire touché n\'est pas coulé : prolonge-le, ici. Plusieurs sens étaient possibles, celui-ci était le bon.'
          : 'Pas de certitude pour l\'instant : c\'est la case où les navires restants ont le plus de façons de passer. Une bonne hypothèse.';
      },
      destroy() {}
    };
  }

  // ------------------------------------------------------------------
  // Tutoriel (viewBox 120×120) : grille 4×4 de cases de 19 px, origine (30, 30)
  // ------------------------------------------------------------------
  const TS = '#a9cfdc', TO = '#e3eef0';
  const tsvg = (b) => '<svg viewBox="0 0 120 120" class="tuto-art"><g stroke="none">' + b + '</g></svg>';
  const tx = (c) => 30 + c * 21, ty = tx;
  const tsea = (special) => {
    let s = '';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += '<rect x="' + tx(c) + '" y="' + ty(r) + '" width="19" height="19" rx="4" fill="' + ((special && special[r * 4 + c]) || TS) + '"/>';
    return s;
  };
  const TROWS = [2, 0, 1, 1], TCOLS = [1, 2, 0, 1];
  const tcounts = () => TROWS.map((v, r) => '<text x="21" y="' + (ty(r) + 14) + '" text-anchor="middle" font-size="11" font-family="Jost, sans-serif" fill="var(--ink)">' + v + '</text>').join('') +
    TCOLS.map((v, c) => '<text x="' + (tx(c) + 9.5) + '" y="23" text-anchor="middle" font-size="11" font-family="Jost, sans-serif" fill="var(--ink)">' + v + '</text>').join('');
  const tflame = (r, c) => '<g transform="translate(' + (tx(c) + 1.5) + ' ' + (ty(r) + 1.5) + ') scale(.67)">' + FLAME.replace('<svg class="bn-flame" viewBox="0 0 24 24">', '').replace('</svg>', '') + '</g>';
  const tmiss = (r, c) => '<circle cx="' + (tx(c) + 9.5) + '" cy="' + (ty(r) + 9.5) + '" r="3" fill="none" stroke="#5f8fa8" stroke-width="1.5"/>' +
    '<circle cx="' + (tx(c) + 9.5) + '" cy="' + (ty(r) + 9.5) + '" r="7" fill="none" stroke="#5f8fa8" stroke-width="1" opacity=".45"/>';
  const tfinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const tship = '<g transform="translate(30 30) scale(2)">' + shipInner(2) + '</g>';
  const TUTORIAL = [
    { art: tsvg(tsea() + tcounts()),
      text: 'Une <b>flotte</b> est cachée sous la mer. Les nombres au bord comptent les <b>cases de navire</b> de chaque ligne et colonne.' },
    { art: tsvg(tsea({ 6: TO }) + tcounts() + tmiss(1, 2) + tflame(0, 0) + tfinger(tx(0) + 16, ty(0) + 16)),
      text: 'Touche une case pour <b>tirer</b> : des ronds dans l\'eau si c\'est raté, une flamme si c\'est <b>touché</b>.' },
    { art: tsvg(tsea({ 0: '#7fb0c2', 1: '#7fb0c2' }) + tcounts() + '<rect x="26" y="26" width="67" height="46" rx="7" fill="none" stroke="var(--muted)" stroke-dasharray="3 3"/>' + tship),
      text: 'Un navire entièrement touché est <b>coulé</b>. Les navires ne se touchent jamais, <b>même en diagonale</b>.' },
    { art: tsvg([0, 1, 2, 3, 4, 5, 6, 7].map((k) => '<circle cx="' + (25 + k * 10) + '" cy="60" r="3.2" fill="' + (k < 3 ? 'var(--faint)' : '#3f7fa6') + '"/>').join('')),
      text: 'Les <b>tirs sont comptés</b> (les petits points) : déduis avant de tirer. L\'outil <b>croix</b> pose un repère d\'eau, gratuit.' }
  ];

  C.register({
    id: 'bataille',
    name: 'Bataille navale',
    tagline: 'Touché, coulé : déduis où dort la flotte',
    accent: '#3f7fa6',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h16.5l-2.8 4H7.2z" fill="currentColor"/><path d="M12 14V4.5"/><path d="M12 5.5 17 11h-5"/></svg>',
    icon24: '<path d="M4 13.5h16.5l-2.8 4H7.2z" class="f"/><path d="M12 13.5V4"/><path d="M12 5l5 5.5h-5"/><path d="M3 21c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Une flotte cachée, des nombres au bord, des tirs comptés.' }
    ],
    rules: {
      classic: [
        'Une <b>flotte</b> est cachée dans la grille. Les nombres au bord indiquent combien de <b>cases de navire</b> compte chaque ligne et chaque colonne.',
        'Touche une case pour <b>tirer</b> : des ronds dans l\'eau = raté, une flamme = touché. Un navire entièrement touché est <b>coulé</b>.',
        'Les navires sont droits et <b>ne se touchent jamais</b>, même en diagonale.',
        'Les tirs sont <b>comptés</b> : coule toute la flotte avant d\'en manquer. L\'outil croix pose un repère d\'eau, gratuit.'
      ]
    },
    tutorial: TUTORIAL,
    params,
    generate,
    create
  });
})();
