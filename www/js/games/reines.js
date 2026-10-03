// Reines : une couronne par ligne, par colonne et par zone de couleur ;
// deux couronnes ne se touchent jamais, même en diagonale.
(function () {
  'use strict';
  const C = window.Carnet;

  // voiles pastel très légers
  // pastels mats, bien distincts les uns des autres (esprit « Rois » d'Almanac)
  // céramique grecque : terre cuite, bleu égéen, or, olive, vert de mer, lie-de-vin, marbre…
  const REGION_COLORS = ['#e08a62', '#7fa8cf', '#e3b65a', '#a8b46a', '#6cb8ae',
    '#c97b85', '#ece6d6', '#a39dcb', '#d4b48a', '#9cc4d8'];
  // couronne pleine, bien lisible sur toutes les couleurs
  const CROWN = '<svg class="crown" viewBox="0 0 24 24"><path d="M3 8.5 7.2 12 12 5l4.8 7L21 8.5 19.2 18H4.8z" fill="#15191e" stroke="#15191e" stroke-width="1.2" stroke-linejoin="round"/></svg>';

  // Interdit entre deux couronnes de lignes voisines (hors même colonne) :
  // classique = se toucher, cavaliers = être à un saut de cavalier.
  function forbidden(variant, dr, dc) {
    dc = Math.abs(dc);
    if (variant === 'cavaliers') return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
    return dr === 1 && dc <= 1;
  }
  function okWithPrev(variant, cols, r, c) {
    if (r > 0 && forbidden(variant, 1, cols[r - 1] - c)) return false;
    if (r > 1 && forbidden(variant, 2, cols[r - 2] - c)) return false;
    return true;
  }

  function placeQueens(n, rng, variant) {
    const cols = new Array(n);
    const used = new Uint8Array(n);
    const rec = (r) => {
      if (r === n) return true;
      for (const c of rng.shuffle([...Array(n).keys()])) {
        if (used[c]) continue;
        if (!okWithPrev(variant, cols, r, c)) continue;
        used[c] = 1; cols[r] = c;
        if (rec(r + 1)) return true;
        used[c] = 0;
      }
      return false;
    };
    rec(0);
    return cols;
  }

  function growRegions(n, cols, rng) {
    const region = new Int16Array(n * n).fill(-1);
    const frontier = [];
    const pushNb = (cell, id) => {
      const r = Math.floor(cell / n), c = cell % n;
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([a, b]) => {
        if (a >= 0 && b >= 0 && a < n && b < n && region[a * n + b] < 0) frontier.push([a * n + b, id]);
      });
    };
    cols.forEach((c, r) => { region[r * n + c] = r; });
    cols.forEach((c, r) => pushNb(r * n + c, r));
    while (frontier.length) {
      const i = rng.int(frontier.length);
      const [cell, id] = frontier[i];
      frontier[i] = frontier[frontier.length - 1];
      frontier.pop();
      if (region[cell] >= 0) continue;
      region[cell] = id;
      pushNb(cell, id);
    }
    return region;
  }

  function countSolutions(n, region, limit, variant) {
    let count = 0;
    const usedCol = new Uint8Array(n), usedReg = new Uint8Array(n);
    const cols = new Array(n);
    const rec = (r) => {
      if (r === n) { count++; return count >= limit; }
      for (let c = 0; c < n; c++) {
        const reg = region[r * n + c];
        if (usedCol[c] || usedReg[reg]) continue;
        if (!okWithPrev(variant, cols, r, c)) continue;
        usedCol[c] = 1; usedReg[reg] = 1; cols[r] = c;
        if (rec(r + 1)) return true;
        usedCol[c] = 0; usedReg[reg] = 0;
      }
      return false;
    };
    rec(0);
    return count;
  }

  function generate(rng, p) {
    let fallback = null;
    for (let t = 0; t < 400; t++) {
      const cols = placeQueens(p.n, rng, p.variant);
      const region = growRegions(p.n, cols, rng);
      const puzzle = { n: p.n, variant: p.variant, region: Array.from(region), solution: cols };
      if (!fallback) fallback = puzzle;
      if (countSolutions(p.n, region, 2, p.variant) === 1) return puzzle;
    }
    return fallback;
  }

  function params(level, variant) {
    return { n: Math.min(9, (variant === 'cavaliers' ? 6 : 4) + Math.floor((level - 1) / 5)), variant };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    // 0 vide, 1 croix, 2 couronne
    let state = new Uint8Array(n * n);
    const history = [];
    const palette = C.makeRng('palette' + n).shuffle(REGION_COLORS.slice());

    const grid = document.createElement('div');
    grid.className = 'cell-grid reines';
    grid.style.setProperty('--n', n);
    host.appendChild(grid);

    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      const r = Math.floor(i / n), c = i % n;
      const reg = puzzle.region[i];
      d.style.background = palette[reg % palette.length];
      // bordures épaisses entre zones
      // frontières de zones : un seul trait épais entre deux zones (le cadre fait le tour)
      if (r > 0 && puzzle.region[i - n] !== reg) d.classList.add('bt');
      if (c > 0 && puzzle.region[i - 1] !== reg) d.classList.add('bl');
      d.dataset.i = i;
      grid.appendChild(d);
      cells.push(d);
    }

    function conflicts() {
      const bad = new Set();
      const q = [];
      state.forEach((v, i) => { if (v === 2) q.push(i); });
      for (let a = 0; a < q.length; a++) {
        for (let b = a + 1; b < q.length; b++) {
          const i = q[a], j = q[b];
          const ri = Math.floor(i / n), ci = i % n, rj = Math.floor(j / n), cj = j % n;
          if (ri === rj || ci === cj || puzzle.region[i] === puzzle.region[j] ||
            forbidden(puzzle.variant, Math.abs(ri - rj), ci - cj)) { bad.add(i); bad.add(j); }
        }
      }
      return { bad, queens: q.length };
    }

    // cases rendues impossibles par les couronnes posées : marquées d'office d'un point
    function blocked() {
      const out = new Uint8Array(n * n);
      state.forEach((v, q) => {
        if (v !== 2) return;
        const rq = Math.floor(q / n), cq = q % n;
        for (let i = 0; i < n * n; i++) {
          if (i === q) continue;
          const r = Math.floor(i / n), c = i % n;
          if (r === rq || c === cq || puzzle.region[i] === puzzle.region[q] || forbidden(puzzle.variant, Math.abs(r - rq), c - cq)) out[i] = 1;
        }
      });
      return out;
    }

    function render() {
      const { bad } = conflicts();
      const auto = blocked();
      cells.forEach((d, i) => {
        const v = state[i];
        const k = v === 2 ? 'c' : v === 1 || auto[i] ? 'm' : '';
        if (d.dataset.k !== k) { d.dataset.k = k; d.innerHTML = k === 'c' ? CROWN : k === 'm' ? '<span class="mark"></span>' : ''; } // seul le symbole qui change s'anime
        d.classList.toggle('bad', bad.has(i));
      });
    }

    let down = null;
    function cellAt(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return el && el.closest('.cell') && grid.contains(el) ? +el.closest('.cell').dataset.i : -1;
    }
    grid.addEventListener('pointerdown', (e) => {
      const i = cellAt(e);
      if (i < 0) return;
      grid.setPointerCapture(e.pointerId);
      down = { start: i, dragging: false, snapshot: state.slice() };
    });
    grid.addEventListener('pointermove', (e) => {
      if (!down) return;
      const i = cellAt(e);
      if (i < 0) return;
      if (!down.dragging && i !== down.start) {
        down.dragging = true;
        if (state[down.start] === 0) state[down.start] = 1;
      }
      if (down.dragging && state[i] === 0) { state[i] = 1; render(); }
    });
    const up = () => {
      if (!down) return;
      if (!down.dragging) {
        const i = down.start;
        state[i] = (state[i] + 1) % 3;
        if (state[i] === 2) C.sfx.place(); else C.sfx.tap();
      }
      history.push(down.snapshot);
      down = null;
      render();
      api.onChange();
      const { bad, queens } = conflicts();
      if (queens === n && bad.size === 0) api.onWin();
      else if (bad.size) C.sfx.error();
    };
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', up);

    render();

    return {
      status() {
        const { queens } = conflicts();
        return 'Couronnes ' + queens + '/' + n;
      },
      undo() { if (history.length) { state = history.pop(); render(); api.onChange(); } },
      reset() { history.push(state.slice()); state = new Uint8Array(n * n); render(); api.onChange(); },
      hint() {
        history.push(state.slice());
        // retire d'abord une couronne mal placée, sinon en pose une juste
        for (let i = 0; i < n * n; i++) {
          if (state[i] === 2 && puzzle.solution[Math.floor(i / n)] !== i % n) {
            state[i] = 0; render(); api.onChange();
            return 'Cette couronne empêche de compléter une autre région : retire-la.';
          }
        }
        // on cherche une couronne qui se déduit : seule case libre de sa région, de sa ligne ou de sa colonne
        const block = blocked();
        const free = (i) => state[i] !== 2 && !block[i];
        let pick = -1, why = '';
        for (let r = 0; r < n && pick < 0; r++) {
          const i = r * n + puzzle.solution[r];
          if (state[i] === 2) continue;
          const reg = puzzle.region[i], c = i % n;
          let inReg = 0, inRow = 0, inCol = 0;
          for (let j = 0; j < n * n; j++) {
            if (!free(j)) continue;
            if (puzzle.region[j] === reg) inReg++;
            if (Math.floor(j / n) === r) inRow++;
            if (j % n === c) inCol++;
          }
          if (inReg === 1) { pick = i; why = 'Dans cette région, c\'est la seule case que les autres couronnes laissent libre.'; }
          else if (inRow === 1) { pick = i; why = 'Sur cette ligne, toutes les autres cases sont déjà prises par une colonne, une région ou un voisinage.'; }
          else if (inCol === 1) { pick = i; why = 'Dans cette colonne, c\'est la seule case encore possible.'; }
        }
        if (pick < 0) {
          for (let r = 0; r < n && pick < 0; r++) { const i = r * n + puzzle.solution[r]; if (state[i] !== 2) pick = i; }
          why = 'Essaie cette couronne : regarde ensuite quelles cases elle rend impossibles autour d\'elle.';
        }
        if (pick >= 0) {
          const i = pick;
          {
            state[i] = 2; render(); api.onChange();
            const { bad, queens } = conflicts();
            if (queens === n && bad.size === 0) api.onWin();
            return why;
          }
        }
        return false;
      },
      destroy() {}
    };
  }

  C.register({
    id: 'reines',
    name: 'Reines',
    tagline: 'Une couronne par ligne, colonne et zone',
    accent: '#ffb27a',
    icon: '<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path d="M1 4h2v2h1v1h1V5h1V3h1V2h2v1h1v2h1v2h1V6h1V4h2v9H1z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Les couronnes ne se touchent jamais.' },
      { id: 'cavaliers', name: 'Cavaliers', desc: 'Elles peuvent se toucher, mais jamais à un saut de cavalier.' }
    ],
    rules: {
      classic: [
        'Place une <b>couronne</b> dans chaque ligne, chaque colonne et chaque zone de couleur.',
        'Deux couronnes ne peuvent pas se toucher, même en diagonale.',
        'Touche une case : une fois pour un repère, deux fois pour une reine. Glisse le doigt pour poser plusieurs repères.'
      ],
      cavaliers: [
        'Place une <b>couronne</b> dans chaque ligne, chaque colonne et chaque zone de couleur.',
        'Deux couronnes peuvent se toucher en diagonale, mais <b>jamais à un saut de cavalier</b> (2 cases d\'un côté, 1 de l\'autre).',
        'Touche une case : une fois pour un repère, deux fois pour une reine.'
      ]
    },
    params,
    generate,
    create
  });
})();
