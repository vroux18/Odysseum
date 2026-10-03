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
      // méga : pas plus de p.maxGroups indices sur une ligne (la colonne d'indices reste étroite, cases ≥ 24 px)
      if (p.maxGroups && t < 250 && rows.some((r) => r.length > p.maxGroups)) continue;
      last = { n, variant: p.variant, rows, cols, solution: Array.from(g) };
      if (lineSolvable(n, rows, cols)) return last;
    }
    return last;
  }

  function params(level, variant) {
    const n = Math.min(10, (variant === 'miroir' ? 6 : 4) + Math.floor((level - 1) / 4));
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
        if (won) return false;
        const ord = (k) => k + (k === 1 ? 're' : 'e');
        const lineCells = (axis, k) => [...Array(n)].map((_, j) => (axis === 'row' ? k * n + j : j * n + k));
        const lineName = (axis, k) => 'la ' + ord(k + 1) + (axis === 'row' ? ' ligne' : ' colonne');
        const clueEl = (axis, k) => (axis === 'row' ? rowEls[k] : colEls[k]);
        const apply = (list) => {
          history.push(state.slice());
          list.forEach(([i, v]) => { state[i] = v ? 1 : 2; if (mirror) state[twin(i)] = state[i]; });
          render(); api.onChange(); check();
        };
        // 1. une case fausse (pleine au lieu de vide, ou croix sur une case pleine) : on la corrige
        for (let i = 0; i < n * n; i++) {
          const want = puzzle.solution[i];
          if ((state[i] === 1 && !want) || (state[i] === 2 && want)) {
            apply([[i, want]]);
            const r = Math.floor(i / n), c = i % n;
            return { text: want ? 'Cette croix est de trop : les nombres de sa ligne et de sa colonne (surlignés) veulent une case pleine ici. Je la corrige.'
              : 'Cette case ne doit pas être pleine : les nombres de sa ligne et de sa colonne (surlignés) veulent du vide ici. Je la corrige.',
              where: [cells[i]], why: [rowEls[r], colEls[mirror && c >= Math.ceil(n / 2) ? n - 1 - c : c]] };
          }
        }
        // 2. résolution ligne par ligne : on cherche la ligne (ou colonne) dont les indices forcent des cases
        const known = (i) => (state[i] === 1 ? 1 : state[i] === 2 ? 0 : -1);
        const lines = [];
        for (let k = 0; k < n; k++) lines.push(['row', k]);
        for (let k = 0; k < (mirror ? Math.ceil(n / 2) : n); k++) lines.push(['col', k]);
        const found = [];
        lines.forEach(([axis, k]) => {
          const idx = lineCells(axis, k);
          const clues = axis === 'row' ? puzzle.rows[k] : puzzle.cols[k];
          const cur = idx.map(known);
          const res = solveLine(clues, cur);
          if (!res) return;
          const forced = [];
          res.forEach((v, j) => { if (cur[j] === -1 && v !== -1 && v === puzzle.solution[idx[j]]) forced.push([idx[j], v]); });
          if (!forced.length) return;
          const sum = clues.reduce((a, b) => a + b, 0);
          const fresh = cur.every((v) => v === -1);
          const filled = cur.filter((v) => v === 1).length;
          let kind, score;
          if (sum === 0) { kind = 'zero'; score = 0; }
          else if (filled === sum) { kind = 'done'; score = 1; }
          else if (fresh && sum + clues.length - 1 === n) { kind = 'full'; score = 2; }
          else if (fresh) { kind = 'overlap'; score = 3; }
          else { kind = 'mixed'; score = 4; }
          found.push({ axis, k, idx, clues, forced, kind, score: score * 100 - forced.length });
        });
        if (found.length) {
          found.sort((a, b) => a.score - b.score);
          const f = found[0];
          const name = lineName(f.axis, f.k), Name = name.charAt(0).toUpperCase() + name.slice(1);
          const cl = f.clues.join(' ');
          const nFill = f.forced.filter(([, v]) => v).length, nEmpty = f.forced.length - nFill;
          const what = nFill && nEmpty ? 'les cases dorées sont imposées (pleines ou vides)' : nFill ? (nFill > 1 ? 'les cases dorées sont pleines' : 'la case dorée est pleine') : (nEmpty > 1 ? 'les cases dorées sont vides' : 'la case dorée est vide');
          const span = f.axis === 'row' ? 'largeur' : 'hauteur';
          let text;
          if (f.kind === 'zero') text = Name + ' a pour nombre 0 : aucune case pleine, tout est vide.';
          else if (f.kind === 'done') text = Name + ' a déjà tous ses blocs (' + cl + ') : ses autres cases sont vides.';
          else if (f.kind === 'full') text = f.clues.length === 1 ? 'Le bloc de ' + cl + ' de ' + name + ' remplit toute la ' + span + ' : toutes ses cases sont pleines.' : 'Les blocs ' + cl + ' de ' + name + ', avec une case vide entre chacun, prennent toute la ' + span + ' : tout est imposé.';
          else if (f.kind === 'overlap') text = f.clues.length === 1
            ? 'Le bloc de ' + cl + ' de ' + name + ' est si long que, où qu\'on le place, il couvre toujours ' + (nFill > 1 ? 'les cases dorées' : 'la case dorée') + '.'
            : 'Les blocs ' + cl + ' de ' + name + ' laissent peu de jeu : où qu\'on les place, ' + what + '.';
          else text = 'Avec les cases déjà trouvées, où qu\'on place ' + (f.clues.length === 1 ? 'le bloc de ' : 'les blocs ') + cl + ' de ' + name + ', ' + what + '.';
          apply(f.forced.map(([i, v]) => [i, v]));
          return { text, where: f.forced.map(([i]) => cells[i]), why: [clueEl(f.axis, f.k)].concat(f.idx.filter((i) => !f.forced.some(([j]) => j === i)).map((i) => cells[i])) };
        }
        // 3. rien de simple : coup de pouce sur la première case encore inconnue
        for (let i = 0; i < n * n; i++) {
          if (known(i) !== -1) continue;
          const want = puzzle.solution[i];
          apply([[i, want]]);
          return { text: 'Coup de pouce : aucune ligne ne force de case pour l\'instant. La case dorée est ' + (want ? 'pleine' : 'vide') + '.', where: [cells[i]], why: [] };
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
        'Les nombres donnent, dans l\'ordre, la taille des <b>blocs de cases pleines</b> de chaque ligne et colonne.',
        'Entre deux blocs, il y a au moins une case vide.',
        'Outil <b>■</b> pour remplir, outil <b>×</b> pour barrer une case vide. Touche ou glisse en ligne droite ; retouche pour effacer.',
        'Un petit dessin apparaît à la fin !'
      ],
      miroir: [
        'Le dessin est <b>symétrique</b> : chaque case posée se recopie de l\'autre côté du miroir.',
        'Seules les colonnes de gauche ont leurs nombres ; celles de droite (⇆) en sont le reflet.',
        'Les nombres donnent, dans l\'ordre, la taille des <b>blocs de cases pleines</b>, avec au moins une case vide entre deux blocs.',
        'Outil <b>■</b> pour remplir, outil <b>×</b> pour barrer. Touche ou glisse en ligne droite ; retouche pour effacer.'
      ]
    },
    params,
    generate,
    create
  });
})();
