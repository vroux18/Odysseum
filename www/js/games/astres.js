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
  // symboles cartoon : un soleil rieur aux joues roses, une lune qui somnole avec son étoile
  // version épurée : deux symboles très simples, foncés sur tuile pastel — un carré au trait (vert) et un rond plein (bleu)
  // (les noms SUN / MOON restent ceux de la logique du jeu)
  const SUN_SVG = '<svg viewBox="0 0 24 24" class="gl-sun"><rect class="core" x="4.5" y="4.5" width="15" height="15" rx="4"/></svg>';
  const MOON_SVG = '<svg viewBox="0 0 24 24" class="gl-moon"><circle class="crescent" cx="12" cy="12" r="8"/></svg>';

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
    // premiers niveaux : la grille doit se finir avec les seules règles simples de l'indice
    // (trois à la suite, signe, moitié pleine) ; sinon on dévoile une case bloquante et on recommence
    if (p.easy) {
      for (let guard = 0; guard < n * n; guard++) {
        const stuck = simpleFill(n, givens, edges, diag, full);
        if (!stuck.length) break;
        const i = stuck[Math.floor(rng() * stuck.length)];
        givens[i] = full[i];
      }
    }
    return { n, variant: p.variant, givens: Array.from(givens), edges, solution: Array.from(full) };
  }

  // Remplit la grille avec les règles simples (celles de hint()) ; renvoie les cases restées vides.
  function simpleFill(n, givens, edges, diag, sol) {
    const g = Uint8Array.from(givens), half = n / 2;
    const row = (r) => [...Array(n)].map((_, k) => r * n + k), col = (c) => [...Array(n)].map((_, k) => k * n + c);
    const deducible = (i) => {
      const v = sol[i], o = v === SUN ? MOON : SUN, r = Math.floor(i / n), c = i % n;
      const lines = [row(r), col(c)];
      if (diag) diagTriples(n, i).forEach((t) => lines.push(t));
      for (const line of lines) {
        const k = line.indexOf(i), at = (d) => (k + d >= 0 && k + d < line.length ? g[line[k + d]] : 0);
        if ((at(-1) === o && at(-2) === o) || (at(1) === o && at(2) === o) || (at(-1) === o && at(1) === o)) return true;
      }
      for (const e of edges) {
        const other = e.a === i ? e.b : e.b === i ? e.a : -1;
        if (other >= 0 && g[other]) return true;
      }
      return row(r).filter((j) => g[j] === o).length === half || col(c).filter((j) => g[j] === o).length === half;
    };
    for (let moved = true; moved;) {
      moved = false;
      for (let i = 0; i < n * n; i++) if (!g[i] && deducible(i)) { g[i] = sol[i]; moved = true; }
    }
    const out = [];
    for (let i = 0; i < n * n; i++) if (!g[i]) out.push(i);
    return out;
  }

  function params(level, variant) {
    if (level <= 12) {
      // débuts en douceur : 4×4 bien garni et beaucoup de signes, puis 6×6 avec des indices qui diminuent
      const small = level <= 5;
      return {
        n: small ? 4 : 6, variant,
        edges: (variant === 'diagonales' ? 2 : 4) + (small ? 3 : 2) + (level % 3),
        extra: small ? 6 - Math.floor(level / 4) : Math.max(2, 8 - Math.floor(level / 2)),
        easy: true
      };
    }
    return {
      n: 6, variant,
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
      const zone = new Set(); // toute la zone fautive (ligne ou colonne entière, trio, paire) : teintée de rouge
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
            [i, line[k - 1], line[k - 2]].forEach((j) => { bad.add(j); zone.add(j); });
          }
        });
        if (s > half) line.forEach((i) => { zone.add(i); if (state[i] === SUN) bad.add(i); });
        if (m > half) line.forEach((i) => { zone.add(i); if (state[i] === MOON) bad.add(i); });
      });
      if (puzzle.variant === 'diagonales') {
        for (let i = 0; i < n * n; i++) {
          diagTriples(n, i).forEach(([a, b, c]) => {
            if (state[a] && state[a] === state[b] && state[a] === state[c]) [a, b, c].forEach((j) => { bad.add(j); zone.add(j); });
          });
        }
      }
      puzzle.edges.forEach((e, k) => {
        const va = state[e.a], vb = state[e.b];
        if (va && vb && (e.same ? va !== vb : va === vb)) { badEdges.add(k); bad.add(e.a); bad.add(e.b); zone.add(e.a); zone.add(e.b); }
      });
      return { bad, badEdges, zone };
    }

    function render() {
      const { bad, badEdges, zone } = errors();
      cells.forEach((d, i) => {
        d.classList.toggle('zone', zone.has(i));
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

    // dès le contact du doigt (un « click » se perd parfois au téléphone, surtout en tapant deux fois vite)
    wrap.style.touchAction = 'manipulation';
    wrap.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button > 0) return;
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
      // 💬 la méthode : border les paires, puis compter la moitié par ligne
      method: 'Cherche les paires : jamais trois pareils à la suite, alors une paire se borde avec l\'autre symbole. Puis compte : chaque ligne a autant de carrés que de ronds.' +
        (puzzle.edges.length ? ' Les signes = et × relient deux cases voisines.' : ''),
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
        // symboles affichés : un carré (SUN) et un rond (MOON), tous deux masculins
        const name = (v, pl) => (v === SUN ? 'carré' : 'rond') + (pl ? 's' : '');
        const un = (v) => (v === SUN ? 'un carré' : 'un rond');
        const rowOf = (i) => Math.floor(i / n), colOf = (i) => i % n;
        const rowCells = (r) => [...Array(n)].map((_, k) => r * n + k), colCells = (c) => [...Array(n)].map((_, k) => k * n + c);
        const put = (i, v, text, why) => {
          C.act(() => {
            history.push(state.slice());
            state[i] = v;
            render(); api.onChange(); check();
          });
          return { text, where: [cells[i]], why: why.map((x) => (typeof x === 'number' ? cells[x] : x)) };
        };
        if (wrong.length) {
          const i = wrong[0], v = puzzle.solution[i];
          const { bad } = errors();
          if (bad.has(i)) {
            // on montre ce qui coince autour de cette case
            const r = rowOf(i), c = colOf(i);
            const near = [...bad].filter((j) => j !== i && (rowOf(j) === r || colOf(j) === c));
            return put(i, v, 'Cette case enfreint une règle (voir les cases surlignées) : trois pareils, trop de ' + name(state[i], true) + ' ou un signe. Il faut ' + un(v) + '.', near);
          }
          return put(i, v, 'Cette case mène à une impasse un peu plus loin : il faut ' + un(v) + '. Je la corrige.', []);
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
              const fem = false; // (carré et rond sont masculins)
              if (pair) return {
                text: (pair[0] === line[k - 1] && pair[1] === line[k + 1] ? 'Entre deux ' : 'Juste à côté de deux ') + name(o, true) + (fem ? ' surlignées' : ' surlignés') +
                  (word === 'diagonale' ? ' (en diagonale)' : '') + ', ' + (fem ? 'une troisième' : 'un troisième') + ' ferait trois à la suite : ici, c\'est ' + un(v) + '.', why: pair };
            }
          }
          if (rule === 'sign') {
            for (let k = 0; k < puzzle.edges.length; k++) {
              const e = puzzle.edges[k];
              const other = e.a === i ? e.b : e.b === i ? e.a : -1;
              if (other < 0 || !state[other]) continue;
              return { text: e.same ? 'Le signe = qui brille veut deux symboles pareils : la case voisine est ' + un(state[other]) + ', donc ici aussi.'
                : 'Le signe × qui brille veut deux symboles différents : la case voisine est ' + un(state[other]) + ', donc ici c\'est ' + un(v) + '.', why: [other, markers[k]] };
            }
          }
          if (rule === 'count') {
            const row = rowCells(r), col = colCells(c);
            const full = (word) => 'Cette ' + word + ' a déjà ses ' + half + ' ' + name(o, true) + ' (surlignés), soit la moitié : ses cases vides sont des ' + name(v, true) + '. Ici, c\'est ' + un(v) + '.';
            if (row.filter((j) => state[j] === o).length === half) return { text: full('ligne'), why: row.filter((j) => state[j] === o) };
            if (col.filter((j) => state[j] === o).length === half) return { text: full('colonne'), why: col.filter((j) => state[j] === o) };
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
        return put(i, puzzle.solution[i], 'Coup de pouce : aucune règle simple ne s\'applique encore, alors je te donne cette case. Ici, c\'est ' + un(puzzle.solution[i]) + '.', []);
      },
      destroy() {}
    };
  }

  C.register({
    id: 'astres',
    name: 'Astres',
    tagline: 'Équilibre carrés et ronds',
    accent: '#ff8c42',
    icon: '<svg viewBox="0 0 12 12" shape-rendering="crispEdges"><path d="M2 3h3v1h1v3H5v1H2V7H1V4h1zM8 2h3v1h-2v1H8v3h1v1h2v1H8V8H7V3h1z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Pas trois identiques en ligne ou en colonne.' },
      { id: 'diagonales', name: 'Diagonales', desc: 'La règle des trois s\'applique aussi en diagonale.' }
    ],
    rules: {
      classic: [
        'Remplis chaque case d\'un <b>carré</b> ou d\'un <b>rond</b> : touche une fois pour le carré, deux fois pour le rond, trois pour vider.',
        'Jamais <b>trois pareils</b> à la suite, en ligne comme en colonne.',
        'Chaque ligne et chaque colonne a <b>autant de carrés que de ronds</b>.',
        '<b>=</b> entre deux cases : les mêmes. <b>×</b> : différents.'
      ],
      diagonales: [
        'Remplis chaque case d\'un <b>carré</b> ou d\'un <b>rond</b> : touche une fois pour le carré, deux fois pour le rond, trois pour vider.',
        'Jamais <b>trois pareils</b> à la suite, <b>même en diagonale</b>.',
        'Chaque ligne et chaque colonne a <b>autant de carrés que de ronds</b>.',
        '<b>=</b> entre deux cases : les mêmes. <b>×</b> : différents.'
      ]
    },
    params,
    generate,
    create
  });
})();
