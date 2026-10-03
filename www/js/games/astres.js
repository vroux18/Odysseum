// Astres : remplir la grille de soleils et de lunes.
// Jamais trois identiques côte à côte, autant de chaque par ligne et colonne,
// et les signes = / × entre deux cases imposent identique / différent.
(function () {
  'use strict';
  const C = window.Carnet;
  const SUN = 1, MOON = 2;

  // soleil : disque sable ; lune : croissant bleu brume
  // symboles foncés posés sur des pastilles colorées (soleil doré, lune bleue)
  // soleil rayonnant et croissant de lune, clairs sur leur pastille colorée
  const SUN_SVG = '<svg viewBox="0 0 24 24" class="glyph-sun"><circle cx="12" cy="12" r="4.8" fill="#fffaf0"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M5.4 18.6l1.8-1.8M16.8 7.2l1.8-1.8" stroke="#fffaf0" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
  const MOON_SVG = '<svg viewBox="0 0 24 24" class="glyph-moon"><path d="M15.2 3.6a8.6 8.6 0 1 0 5.2 14.9A7 7 0 0 1 15.2 3.6z" fill="#f4f7ff"/><circle cx="18.2" cy="6.4" r="1" fill="#f4f7ff"/></svg>';

  // triples alignés en diagonale passant par la case i
  function diagTriples(n, i) {
    const r = Math.floor(i / n), c = i % n, out = [];
    [[1, 1], [1, -1]].forEach(([dr, dc]) => {
      for (let k = -2; k <= 0; k++) {
        const cells = [];
        for (let m = k; m < k + 3; m++) {
          const y = r + m * dr, x = c + m * dc;
          if (y < 0 || x < 0 || y >= n || x >= n) break;
          cells.push(y * n + x);
        }
        if (cells.length === 3) out.push(cells);
      }
    });
    return out;
  }

  function makeChecker(n, edges, diag) {
    const half = n / 2;
    const edgesOf = Array.from({ length: n * n }, () => []);
    edges.forEach((e) => { edgesOf[e.a].push(e); edgesOf[e.b].push(e); });

    // Vérifie la validité locale après avoir rempli la case i.
    function okAt(g, i) {
      const r = Math.floor(i / n), c = i % n;
      for (const line of [[...Array(n)].map((_, k) => r * n + k), [...Array(n)].map((_, k) => k * n + c)]) {
        let s = 0, m = 0;
        for (let k = 0; k < n; k++) {
          const v = g[line[k]];
          if (v === SUN) s++; else if (v === MOON) m++;
          if (k >= 2 && v && v === g[line[k - 1]] && v === g[line[k - 2]]) return false;
        }
        if (s > half || m > half) return false;
      }
      for (const e of edgesOf[i]) {
        const va = g[e.a], vb = g[e.b];
        if (va && vb && (e.same ? va !== vb : va === vb)) return false;
      }
      if (diag) {
        for (const [a, b, c] of diagTriples(n, i)) if (g[a] && g[a] === g[b] && g[a] === g[c]) return false;
      }
      return true;
    }
    return okAt;
  }

  function solveCount(n, givens, edges, limit, rng, diag) {
    const okAt = makeChecker(n, edges, diag);
    const g = Uint8Array.from(givens);
    let count = 0;
    let found = null;
    const order = [];
    for (let i = 0; i < n * n; i++) if (!g[i]) order.push(i);
    const rec = (k) => {
      if (k === order.length) { count++; if (!found) found = g.slice(); return count >= limit; }
      const i = order[k];
      const vals = rng && rng() < 0.5 ? [MOON, SUN] : [SUN, MOON];
      for (const v of vals) {
        g[i] = v;
        if (okAt(g, i) && rec(k + 1)) return true;
      }
      g[i] = 0;
      return false;
    };
    rec(0);
    return { count, found };
  }

  function generate(rng, p) {
    const n = p.n;
    const diag = p.variant === 'diagonales';
    const full = solveCount(n, new Uint8Array(n * n), [], 1, rng, diag).found;
    // signes entre cases voisines
    const pairs = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c + 1 < n) pairs.push([i, i + 1]);
      if (r + 1 < n) pairs.push([i, i + n]);
    }
    const edges = rng.shuffle(pairs).slice(0, p.edges)
      .map(([a, b]) => ({ a, b, same: full[a] === full[b] }));

    const givens = full.slice();
    const order = rng.shuffle([...Array(n * n).keys()]);
    for (const i of order) {
      const keep = givens[i];
      givens[i] = 0;
      if (solveCount(n, givens, edges, 2, null, diag).count !== 1) givens[i] = keep;
    }
    // niveaux faciles : quelques indices en plus
    const empties = rng.shuffle([...Array(n * n).keys()].filter((i) => !givens[i]));
    empties.slice(0, p.extra).forEach((i) => { givens[i] = full[i]; });
    return { n, variant: p.variant, givens: Array.from(givens), edges, solution: Array.from(full) };
  }

  function params(level, variant) {
    return {
      n: level < 4 ? 4 : 6, variant, // 4×4 pour commencer
      edges: (variant === 'diagonales' ? 2 : 4) + (level % 4) + Math.min(4, Math.floor(level / 10)),
      extra: Math.max(0, 6 - Math.floor(level / 3))
    };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    let state = Uint8Array.from(puzzle.givens);
    const history = [];

    const wrap = document.createElement('div');
    wrap.className = 'cell-grid astres';
    wrap.style.setProperty('--n', n);
    host.appendChild(wrap);

    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const d = document.createElement('div');
      d.className = 'cell' + (puzzle.givens[i] ? ' given' : '');
      d.dataset.i = i;
      wrap.appendChild(d);
      cells.push(d);
    }
    const markers = puzzle.edges.map((e) => {
      const m = document.createElement('div');
      m.className = 'edge-mark';
      const ra = Math.floor(e.a / n), ca = e.a % n;
      const horizontal = e.b === e.a + 1;
      m.style.left = ((horizontal ? ca + 1 : ca + 0.5) / n) * 100 + '%';
      m.style.top = ((horizontal ? ra + 0.5 : ra + 1) / n) * 100 + '%';
      m.innerHTML = e.same ? '<svg viewBox="0 0 12 12"><path d="M3 4.6h6M3 7.4h6"/></svg>' : '<svg viewBox="0 0 12 12"><path d="M3.8 3.8l4.4 4.4M8.2 3.8 3.8 8.2"/></svg>'; // = même symbole, × symbole inverse
      m.classList.add(e.same ? 'same' : 'diff');
      wrap.appendChild(m);
      return m;
    });

    function errors() {
      const bad = new Set();
      const badEdges = new Set();
      const half = n / 2;
      const lines = [];
      for (let r = 0; r < n; r++) lines.push([...Array(n)].map((_, k) => r * n + k));
      for (let c = 0; c < n; c++) lines.push([...Array(n)].map((_, k) => k * n + c));
      lines.forEach((line) => {
        let s = 0, m = 0;
        line.forEach((i, k) => {
          const v = state[i];
          if (v === SUN) s++; else if (v === MOON) m++;
          if (k >= 2 && v && v === state[line[k - 1]] && v === state[line[k - 2]]) {
            bad.add(i); bad.add(line[k - 1]); bad.add(line[k - 2]);
          }
        });
        if (s > half) line.forEach((i) => { if (state[i] === SUN) bad.add(i); });
        if (m > half) line.forEach((i) => { if (state[i] === MOON) bad.add(i); });
      });
      if (puzzle.variant === 'diagonales') {
        for (let i = 0; i < n * n; i++) {
          diagTriples(n, i).forEach(([a, b, c]) => {
            if (state[a] && state[a] === state[b] && state[a] === state[c]) { bad.add(a); bad.add(b); bad.add(c); }
          });
        }
      }
      puzzle.edges.forEach((e, k) => {
        const va = state[e.a], vb = state[e.b];
        if (va && vb && (e.same ? va !== vb : va === vb)) { badEdges.add(k); bad.add(e.a); bad.add(e.b); }
      });
      return { bad, badEdges };
    }

    function render() {
      const { bad, badEdges } = errors();
      cells.forEach((d, i) => {
        const k = String(state[i] || '');
        if (d.dataset.k !== k) { d.dataset.k = k; d.innerHTML = state[i] === SUN ? SUN_SVG : state[i] === MOON ? MOON_SVG : ''; } // seul le symbole qui change s'anime
        d.classList.toggle('sun', state[i] === SUN);
        d.classList.toggle('moon', state[i] === MOON);
        d.classList.toggle('bad', bad.has(i));
      });
      markers.forEach((m, k) => m.classList.toggle('bad', badEdges.has(k)));
    }

    function check() {
      if (state.some((v) => !v)) return;
      const { bad } = errors();
      if (bad.size === 0) api.onWin();
    }

    wrap.addEventListener('click', (e) => {
      const d = e.target.closest('.cell');
      if (!d) return;
      const i = +d.dataset.i;
      if (puzzle.givens[i]) return;
      history.push(state.slice());
      state[i] = (state[i] + 1) % 3;
      C.sfx.tap();
      render();
      api.onChange();
      if (errors().bad.has(i)) C.sfx.error();
      check();
    });

    render();

    return {
      status() {
        const filled = state.filter((v) => v).length;
        return 'Rempli ' + filled + '/' + n * n;
      },
      undo() { if (history.length) { state = history.pop(); render(); api.onChange(); } },
      reset() { history.push(state.slice()); state = Uint8Array.from(puzzle.givens); render(); api.onChange(); },
      hint() {
        const wrong = [], empty = [];
        state.forEach((v, i) => {
          if (v && v !== puzzle.solution[i]) wrong.push(i);
          else if (!v) empty.push(i);
        });
        const name = (v, pl) => (v === SUN ? 'soleil' : 'lune') + (pl ? 's' : '');
        const un = (v) => (v === SUN ? 'un soleil' : 'une lune');
        const ord = (k) => k + (k === 1 ? 're' : 'e');
        const rowOf = (i) => Math.floor(i / n), colOf = (i) => i % n;
        const rowCells = (r) => [...Array(n)].map((_, k) => r * n + k), colCells = (c) => [...Array(n)].map((_, k) => k * n + c);
        const put = (i, v, text, why) => {
          history.push(state.slice());
          state[i] = v;
          render(); api.onChange(); check();
          return { text, where: [cells[i]], why: why.map((x) => (typeof x === 'number' ? cells[x] : x)) };
        };
        if (wrong.length) {
          const i = wrong[0], v = puzzle.solution[i];
          const { bad } = errors();
          if (bad.has(i)) {
            // on montre ce qui coince autour de cette case
            const r = rowOf(i), c = colOf(i);
            const near = [...bad].filter((j) => j !== i && (rowOf(j) === r || colOf(j) === c));
            return put(i, v, 'Cette case enfreint une règle (trois pareils, trop de ' + name(state[i], true) + ' ou un signe) : c\'est ' + un(v) + ' qu\'il faut.', near);
          }
          return put(i, v, 'Cette case mène à une impasse plus loin : c\'est ' + un(v) + '. Je la corrige.', []);
        }
        // une case qui se déduit d'une règle simple, avec sa raison et ce qui la justifie
        const half = n / 2;
        const reason = (i, rule) => {
          const v = puzzle.solution[i], o = v === SUN ? MOON : SUN;
          const r = rowOf(i), c = colOf(i);
          if (rule === 'three') {
            const lines = [[rowCells(r), 'ligne'], [colCells(c), 'colonne']];
            if (puzzle.variant === 'diagonales') {
              diagTriples(n, i).forEach((t) => lines.push([t, 'diagonale']));
            }
            for (const [line, word] of lines) {
              const k = line.indexOf(i), at = (d) => (k + d >= 0 && k + d < line.length ? state[line[k + d]] : 0);
              let pair = null;
              if (at(-1) === o && at(-2) === o) pair = [line[k - 1], line[k - 2]];
              else if (at(1) === o && at(2) === o) pair = [line[k + 1], line[k + 2]];
              else if (at(-1) === o && at(1) === o) pair = [line[k - 1], line[k + 1]];
              if (pair) return {
                text: (pair[0] === line[k - 1] && pair[1] === line[k + 1] ? 'Cette case est coincée entre deux ' : 'Cette case est collée à deux ') + name(o, true) +
                  ' (en ' + word + ') : un troisième ferait trois à la suite, interdit. Ici, c\'est ' + un(v) + '.', why: pair };
            }
          }
          if (rule === 'sign') {
            for (let k = 0; k < puzzle.edges.length; k++) {
              const e = puzzle.edges[k];
              const other = e.a === i ? e.b : e.b === i ? e.a : -1;
              if (other < 0 || !state[other]) continue;
              return { text: e.same ? 'Le signe = qui brille veut deux symboles identiques : sa voisine est ' + un(state[other]) + ', donc ici aussi.'
                : 'Le × qui brille veut deux symboles différents : sa voisine est ' + un(state[other]) + ', donc ici c\'est ' + un(v) + '.', why: [other, markers[k]] };
            }
          }
          if (rule === 'count') {
            const row = rowCells(r), col = colCells(c);
            if (row.filter((j) => state[j] === o).length === half) return { text: 'La ' + ord(r + 1) + ' ligne a déjà ses ' + half + ' ' + name(o, true) + ' (la moitié) : les cases vides restantes sont des ' + name(v, true) + '.', why: row.filter((j) => state[j] === o) };
            if (col.filter((j) => state[j] === o).length === half) return { text: 'La ' + ord(c + 1) + ' colonne a déjà ses ' + half + ' ' + name(o, true) + ' (la moitié) : les cases vides restantes sont des ' + name(v, true) + '.', why: col.filter((j) => state[j] === o) };
          }
          return null;
        };
        for (const rule of ['three', 'sign', 'count']) {
          for (const i of empty) {
            const res = reason(i, rule);
            if (res) return put(i, puzzle.solution[i], res.text, res.why);
          }
        }
        const i = empty[0];
        if (i === undefined) return false;
        return put(i, puzzle.solution[i], 'Coup de pouce : ici c\'est ' + un(puzzle.solution[i]) + '. Pas de règle simple pour l\'instant ; pense que chaque ligne et colonne a autant de soleils que de lunes.', []);
      },
      destroy() {}
    };
  }

  C.register({
    id: 'astres',
    name: 'Astres',
    tagline: 'Équilibre soleils et lunes',
    accent: '#ff8c42',
    icon: '<svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="M2 3h3v1h1v3H5v1H2V7H1V4h1zM8 2h3v1h-2v1H8v3h1v1h2v1H8V8H7V3h1z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Pas trois identiques en ligne ou en colonne.' },
      { id: 'diagonales', name: 'Diagonales', desc: 'La règle des trois s\'applique aussi en diagonale.' }
    ],
    rules: {
      classic: [
        'Remplis chaque case avec un <b>soleil</b> ou une <b>lune</b> (touche pour alterner).',
        'Jamais plus de deux symboles identiques côte à côte, horizontalement ou verticalement.',
        'Chaque ligne et chaque colonne contient autant de soleils que de lunes.',
        '<b>=</b> entre deux cases : symboles identiques. <b>×</b> : symboles différents.'
      ],
      diagonales: [
        'Remplis chaque case avec un <b>soleil</b> ou une <b>lune</b>, autant de chaque par ligne et par colonne.',
        'Jamais trois symboles identiques alignés, <b>y compris en diagonale</b>.',
        '<b>=</b> entre deux cases : symboles identiques. <b>×</b> : symboles différents.'
      ]
    },
    params,
    generate,
    create
  });
})();
