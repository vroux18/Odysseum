// Pixels : un picross. Les nombres indiquent les blocs de cases pleines
// de chaque ligne et colonne ; la grille révèle un petit sprite.
(function () {
  'use strict';
  const C = window.Carnet;

  function cluesOf(line) {
    const out = [];
    let run = 0;
    line.forEach((v) => { if (v) run++; else if (run) { out.push(run); run = 0; } });
    if (run) out.push(run);
    return out.length ? out : [0];
  }

  // Toutes les dispositions compatibles avec ce qui est déjà connu (-1 inconnu).
  function solveLine(clues, cur) {
    const n = cur.length;
    const blocks = clues[0] === 0 ? [] : clues;
    const canFill = new Uint8Array(n), canEmpty = new Uint8Array(n);
    const line = new Uint8Array(n);
    let any = false;
    const rec = (b, start) => {
      if (b === blocks.length) {
        for (let i = start; i < n; i++) if (cur[i] === 1) return;
        for (let i = start; i < n; i++) line[i] = 0;
        any = true;
        for (let i = 0; i < n; i++) { if (line[i]) canFill[i] = 1; else canEmpty[i] = 1; }
        return;
      }
      const len = blocks[b];
      let rest = 0;
      for (let k = b + 1; k < blocks.length; k++) rest += blocks[k] + 1;
      for (let s = start; s + len + rest <= n; s++) {
        let ok = true;
        for (let i = start; i < s && ok; i++) if (cur[i] === 1) ok = false;
        for (let i = s; i < s + len && ok; i++) if (cur[i] === 0) ok = false;
        if (s + len < n && cur[s + len] === 1) ok = false;
        if (ok) {
          for (let i = start; i < s; i++) line[i] = 0;
          for (let i = s; i < s + len; i++) line[i] = 1;
          if (s + len < n) line[s + len] = 0;
          rec(b + 1, s + len + 1);
        }
        if (cur[s] === 1) break; // un bloc ne peut pas commencer après une case pleine laissée
      }
    };
    rec(0, 0);
    if (!any) return null;
    return cur.map((v, i) => (canFill[i] && !canEmpty[i] ? 1 : !canFill[i] && canEmpty[i] ? 0 : v));
  }

  function lineSolvable(n, rows, cols) {
    const g = new Array(n * n).fill(-1);
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < n; r++) {
        const cur = g.slice(r * n, r * n + n);
        const res = solveLine(rows[r], cur);
        if (!res) return false;
        res.forEach((v, c) => { if (g[r * n + c] !== v) { g[r * n + c] = v; changed = true; } });
      }
      for (let c = 0; c < n; c++) {
        const cur = [...Array(n)].map((_, r) => g[r * n + c]);
        const res = solveLine(cols[c], cur);
        if (!res) return false;
        res.forEach((v, r) => { if (g[r * n + c] !== v) { g[r * n + c] = v; changed = true; } });
      }
    }
    return g.every((v) => v !== -1);
  }

  // Sprite symétrique, lissé par un automate cellulaire.
  function sprite(n, density, rng, sym) {
    let g = new Uint8Array(n * n);
    const half = Math.ceil(n / 2);
    for (let r = 0; r < n; r++) for (let c = 0; c < (sym ? half : n); c++) {
      const v = rng() < density ? 1 : 0;
      g[r * n + c] = v;
      if (sym) g[r * n + (n - 1 - c)] = v;
    }
    const smooth = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      let s = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const y = r + dr, x = c + dc;
        if (y >= 0 && x >= 0 && y < n && x < n) s += g[y * n + x];
      }
      smooth[r * n + c] = s >= 5 ? 1 : s <= 2 ? 0 : g[r * n + c];
    }
    return smooth;
  }

  function generate(rng, p) {
    const n = p.n;
    let last = null;
    const mirror = p.variant === 'miroir';
    for (let t = 0; t < 300; t++) {
      const g = sprite(n, p.density, rng, mirror || rng() < 0.5);
      const filled = g.reduce((a, b) => a + b, 0);
      if (filled < n * n * 0.3) continue;
      const rows = [...Array(n)].map((_, r) => cluesOf(Array.from(g.slice(r * n, r * n + n))));
      const cols = [...Array(n)].map((_, c) => cluesOf([...Array(n)].map((_, r) => g[r * n + c])));
      last = { n, variant: p.variant, rows, cols, solution: Array.from(g) };
      if (lineSolvable(n, rows, cols)) return last;
    }
    return last;
  }

  function params(level, variant) {
    const n = Math.min(10, (variant === 'miroir' ? 6 : 5) + Math.floor((level - 1) / 5));
    return { n, variant, density: 0.55 + (level % 3) * 0.03 };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    const mirror = puzzle.variant === 'miroir';
    const twin = (i) => Math.floor(i / n) * n + (n - 1 - (i % n));
    let state = new Uint8Array(n * n); // 0 vide, 1 plein, 2 croix
    const history = [];
    let won = false;

    const wrap = document.createElement('div');
    wrap.className = 'nono';
    wrap.style.setProperty('--n', n);
    host.appendChild(wrap);

    const corner = document.createElement('div');
    corner.className = 'nono-corner';
    wrap.appendChild(corner);
    const colEls = puzzle.cols.map((cl, c) => {
      const d = document.createElement('div');
      d.className = 'nono-col';
      // Miroir : seule la moitié gauche des colonnes est indiquée
      if (mirror && c >= Math.ceil(n / 2)) { d.classList.add('mirrored'); d.innerHTML = '<span>⇆</span>'; }
      else d.innerHTML = cl.map((v) => '<span>' + v + '</span>').join('');
      wrap.appendChild(d);
      return d;
    });
    const rowEls = [];
    const cells = [];
    for (let r = 0; r < n; r++) {
      const rc = document.createElement('div');
      rc.className = 'nono-row';
      rc.innerHTML = puzzle.rows[r].map((v) => '<span>' + v + '</span>').join('');
      wrap.appendChild(rc);
      rowEls.push(rc);
      for (let c = 0; c < n; c++) {
        const d = document.createElement('div');
        d.className = 'nono-cell';
        if (c % 5 === 4 && c < n - 1) d.classList.add('sep-r');
        if (mirror && c === Math.floor(n / 2) - 1 && n % 2 === 0) d.classList.add('axis');
        if (r % 5 === 4 && r < n - 1) d.classList.add('sep-b');
        d.dataset.i = r * n + c;
        wrap.appendChild(d);
        cells.push(d);
      }
    }

    const filledLine = (idx) => cluesOf(idx.map((i) => (state[i] === 1 ? 1 : 0))).join(',');
    function render() {
      cells.forEach((d, i) => {
        d.classList.toggle('on', state[i] === 1);
        d.classList.toggle('x', state[i] === 2);
      });
      for (let r = 0; r < n; r++) {
        const idx = [...Array(n)].map((_, c) => r * n + c);
        rowEls[r].classList.toggle('ok', filledLine(idx) === puzzle.rows[r].join(','));
      }
      for (let c = 0; c < n; c++) {
        const idx = [...Array(n)].map((_, r) => r * n + c);
        colEls[c].classList.toggle('ok', filledLine(idx) === puzzle.cols[c].join(','));
      }
    }

    function check() {
      for (let i = 0; i < n * n; i++) if ((state[i] === 1 ? 1 : 0) !== puzzle.solution[i]) return;
      won = true;
      wrap.classList.add('solved');
      api.onWin();
    }

    let paint = null;
    const cellAt = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const d = el && el.closest('.nono-cell');
      return d && wrap.contains(d) ? +d.dataset.i : -1;
    };
    wrap.addEventListener('pointerdown', (e) => {
      const i = cellAt(e);
      if (i < 0 || won) return;
      wrap.setPointerCapture(e.pointerId);
      history.push(state.slice());
      const mode = api.tool ? api.tool() : 'fill';
      const target = mode === 'fill' ? (state[i] === 1 ? 0 : 1) : (state[i] === 2 ? 0 : 2);
      paint = { target, axis: null, start: i };
      state[i] = target;
      if (mirror) state[twin(i)] = target;
      target === 1 ? C.sfx.place() : C.sfx.tap();
      render();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!paint) return;
      const i = cellAt(e);
      if (i < 0 || state[i] === paint.target) return;
      // on peint en ligne droite depuis la première case
      const sr = Math.floor(paint.start / n), sc = paint.start % n;
      const r = Math.floor(i / n), c = i % n;
      if (!paint.axis) paint.axis = r === sr ? 'row' : c === sc ? 'col' : null;
      if ((paint.axis === 'row' && r !== sr) || (paint.axis === 'col' && c !== sc) || !paint.axis) return;
      state[i] = paint.target;
      if (mirror) state[twin(i)] = paint.target;
      render();
    });
    const up = () => { if (!paint) return; paint = null; api.onChange(); check(); };
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);

    render();

    return {
      tools: [{ id: 'fill', label: 'Remplir' }, { id: 'cross', label: 'Croix' }],
      status() {
        const done = rowEls.filter((e) => e.classList.contains('ok')).length;
        return 'Lignes justes ' + done + '/' + n;
      },
      undo() { if (history.length) { state = history.pop(); render(); api.onChange(); } },
      reset() { history.push(state.slice()); state = new Uint8Array(n * n); render(); api.onChange(); },
      hint() {
        for (let i = 0; i < n * n; i++) {
          const want = puzzle.solution[i];
          const have = state[i] === 1 ? 1 : 0;
          if (want !== have || (want === 0 && state[i] === 0)) {
            if (want === 0 && state[i] === 2) continue;
            history.push(state.slice());
            state[i] = want ? 1 : 2;
            if (mirror) state[twin(i)] = state[i];
            render(); api.onChange(); check();
            return true;
          }
        }
        return false;
      },
      destroy() {}
    };
  }

  C.register({
    id: 'pixels',
    name: 'Pixels',
    tagline: 'Révèle le sprite caché',
    accent: '#ff5d8f',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M7 3h2v2H7zM15 3h2v2h-2zM5 5h14v2H5zM3 7h4v2H3zM9 7h6v2H9zM17 7h4v2h-4zM3 9h18v4H3zM5 13h2v2H5zM17 13h2v2h-2zM7 15h4v2H7zM13 15h4v2h-4z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Tous les indices, sprites libres.' },
      { id: 'miroir', name: 'Miroir', desc: 'Sprite symétrique : chaque case se recopie de l\'autre côté.' }
    ],
    rules: {
      classic: [
        'Les nombres donnent la taille des blocs de cases <b>pleines</b> dans chaque ligne et colonne, dans l\'ordre.',
        'Entre deux blocs, il y a au moins une case vide.',
        'Choisis l\'outil <b>Remplir</b> ou <b>Croix</b>, puis touche ou glisse en ligne droite. Un sprite apparaît à la fin.'
      ],
      miroir: [
        'Comme un picross, mais le sprite est <b>symétrique</b> : chaque case posée se recopie dans le miroir.',
        'Seules les colonnes de gauche ont leurs indices ; celles de droite (⇆) en sont le reflet.',
        'Les nombres donnent la taille des blocs de cases pleines, dans l\'ordre.'
      ]
    },
    params,
    generate,
    create
  });
})();
