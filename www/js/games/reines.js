// Reines : une couronne par ligne, par colonne et par zone de couleur ;
// deux couronnes ne se touchent jamais, même en diagonale.
(function () {
  'use strict';
  const C = window.Carnet;

  // voiles pastel très légers
  // pastels mats, bien distincts les uns des autres (esprit « Rois » d'Almanac)
  // céramique grecque : terre cuite, bleu égéen, or, olive, vert de mer, lie-de-vin, marbre…
  // zones franches (charte Émeraude) : terre cuite, ciel, miel, prairie, lagon, rose, crème, lavande, sable, azur
  const REGION_COLORS = ['#f59a72', '#78b0ee', '#f5c95a', '#8fd17a', '#58c9b9',
    '#f290b2', '#f3ead6', '#b09cf0', '#e6b47c', '#8dcdf2'];
  const EXTRA_COLORS = ['#d39ae8', '#7edb9c']; // pourpre clair, vert d'eau (grandes grilles)
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
    // régions plus équilibrées : le plus souvent, on fait grandir une des plus petites
    // (sinon une couronne reste vite enfermée dans une région d'une seule case)
    const size = new Array(n).fill(1);
    while (frontier.length) {
      let i = rng.int(frontier.length);
      if (rng() < 0.75) {
        let min = Infinity;
        frontier.forEach(([cell, id]) => { if (region[cell] < 0 && size[id] < min) min = size[id]; });
        const small = [];
        frontier.forEach(([cell, id], k) => { if (region[cell] < 0 && size[id] === min) small.push(k); });
        if (small.length) i = small[rng.int(small.length)];
      }
      const [cell, id] = frontier[i];
      frontier[i] = frontier[frontier.length - 1];
      frontier.pop();
      if (region[cell] >= 0) continue;
      region[cell] = id;
      size[id]++;
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

  // grille « facile » : se résout entièrement par des évidences (une région, une ligne ou une colonne
  // qui n'a plus qu'une case possible), sans raisonnement en chaîne — pour les tout premiers niveaux
  function easySolvable(n, region, variant) {
    const open = new Uint8Array(n * n).fill(1);
    let placed = 0;
    const place = (i) => {
      const r = Math.floor(i / n), c = i % n;
      for (let j = 0; j < n * n; j++) {
        const rj = Math.floor(j / n), cj = j % n;
        if (rj === r || cj === c || region[j] === region[i] || forbidden(variant, Math.abs(rj - r), cj - c)) open[j] = 0;
      }
      placed++;
    };
    for (let guard = 0; guard < n * 4 && placed < n; guard++) {
      let found = -1;
      const groups = [];
      for (let k = 0; k < n; k++) { groups.push((i) => region[i] === k, (i) => Math.floor(i / n) === k, (i) => i % n === k); }
      for (const inG of groups) {
        const cand = [];
        for (let i = 0; i < n * n; i++) if (open[i] && inG(i)) cand.push(i);
        if (cand.length === 1) { found = cand[0]; break; }
      }
      if (found < 0) return false;
      place(found);
    }
    return placed === n;
  }

  // régions d'une seule case : elles donnent la réponse d'office (trop facile) — on les évite
  function singles(n, region) {
    const size = new Array(n).fill(0);
    region.forEach((k) => { size[k]++; });
    return size.filter((s) => s === 1).length;
  }

  function generate(rng, p) {
    let fallback = null, best = null, bestS = 99;
    for (let t = 0; t < (p.easy ? 1500 : 600); t++) {
      const cols = placeQueens(p.n, rng, p.variant);
      const region = growRegions(p.n, cols, rng);
      const puzzle = { n: p.n, variant: p.variant, region: Array.from(region), solution: cols };
      if (!fallback) fallback = puzzle;
      const s = singles(p.n, region);
      if (s >= bestS) continue; // on garde la grille unique qui a le moins de cases seules
      if (countSolutions(p.n, region, 2, p.variant) !== 1) continue;
      if (p.easy && !easySolvable(p.n, region, p.variant)) continue;
      best = puzzle; bestS = s;
      if (s === 0) return puzzle;
    }
    return best || fallback;
  }

  function params(level, variant) {
    // premiers niveaux : grilles qui se résolvent par simples évidences (voir easySolvable),
    // sans être données d'office par des régions d'une seule case (voir generate)
    return { n: Math.min(9, (variant === 'cavaliers' ? 6 : 4) + Math.floor((level - 1) / 5)), variant, easy: level <= 12 };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    // 0 vide, 1 croix, 2 couronne
    let state = new Uint8Array(n * n);
    // case vidée à la main (couronne retirée) : elle reste vraiment vide, sans point automatique
    let cleared = new Uint8Array(n * n);
    const history = [];
    // (méga 11×11 : une 11e teinte, ajoutée seulement au-delà de 10 pour ne rien changer aux grilles connues)
    const palette = C.makeRng('palette' + n).shuffle((n > 10 ? REGION_COLORS.concat(EXTRA_COLORS) : REGION_COLORS).slice());

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
        const k = v === 2 ? 'c' : v === 1 || (auto[i] && !cleared[i]) ? 'm' : '';
        if (d.dataset.k !== k) { d.dataset.k = k; d.innerHTML = k === 'c' ? CROWN : k === 'm' ? '<span class="mark"></span>' : ''; } // seul le symbole qui change s'anime
        d.classList.toggle('bad', bad.has(i));
      });
    }

    // instantané pour l'annulation : l'état ET les points effacés (cleared)
    const snap = () => { const s = state.slice(); s.cl = cleared.slice(); return s; };
    let down = null;
    function cellAt(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      return el && el.closest('.cell') && grid.contains(el) ? +el.closest('.cell').dataset.i : -1;
    }
    grid.addEventListener('pointerdown', (e) => {
      const i = cellAt(e);
      if (i < 0) return;
      grid.setPointerCapture(e.pointerId);
      down = { start: i, dragging: false, snapshot: snap(), auto: blocked() }; // l'annulation rend aussi les points effacés
    });
    grid.addEventListener('pointermove', (e) => {
      if (!down) return;
      const i = cellAt(e);
      if (i < 0) return;
      // glisser depuis une case vide pose des points ; glisser depuis un point les efface (couronnes intactes)
      const shown = (j) => state[j] === 1 || (state[j] === 0 && !cleared[j] && down.auto[j]);
      const paint = (j) => {
        if (down.erase) { if (shown(j)) { state[j] = 0; cleared[j] = 1; } }
        else if (state[j] === 0) { state[j] = 1; cleared[j] = 0; }
      };
      if (!down.dragging && i !== down.start) {
        down.dragging = true;
        down.erase = shown(down.start);
        paint(down.start);
      }
      if (down.dragging) { paint(i); render(); }
    });
    const up = () => {
      if (!down) return;
      if (!down.dragging) {
        const i = down.start;
        // une case déjà pointée d'office passe directement à la couronne (sinon le toucher semblerait sans effet)
        if (state[i] === 0 && !cleared[i] && blocked()[i]) state[i] = 2;
        else state[i] = (state[i] + 1) % 3;
        cleared[i] = state[i] === 0 ? 1 : 0; // toucher une couronne vide complètement la case
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
    // toucher interrompu (geste du système) : rien n'est joué, un glissé en cours est annulé
    grid.addEventListener('pointercancel', () => {
      if (!down) return;
      if (down.dragging) { state = down.snapshot; cleared = down.snapshot.cl; }
      down = null;
      render();
    });

    render();

    return {
      // 💬 la méthode : partir de la région la plus coincée, et écarter ce que chaque couronne bloque
      method: 'Commence par la région la plus petite ou la plus coincée : sa couronne a peu de places. Chaque couronne écarte sa ligne, sa colonne, sa région' +
        (puzzle.variant === 'cavaliers' ? ' et les cases à un saut de cavalier.' : ' et les 8 cases qui l\'entourent.'),
      status() {
        const { queens } = conflicts();
        return 'Couronnes ' + queens + '/' + n;
      },
      undo() { if (history.length) { state = history.pop(); if (state.cl) cleared = state.cl; render(); api.onChange(); } },
      reset() { history.push(snap()); state = new Uint8Array(n * n); cleared = new Uint8Array(n * n); render(); api.onChange(); },
      hint() {
        const N = n * n;
        const rowOf = (i) => Math.floor(i / n), colOf = (i) => i % n;
        const isSol = (i) => puzzle.solution[rowOf(i)] === colOf(i);
        // (pas de nom de couleur : les teintes changent selon le thème ; la zone citée est toujours surlignée)
        const regName = () => 'la région surlignée';
        const units = [];
        for (let g = 0; g < n; g++) units.push({ kind: 'reg', id: g, cells: [...Array(N).keys()].filter((i) => puzzle.region[i] === g) });
        for (let r = 0; r < n; r++) units.push({ kind: 'row', id: r, cells: [...Array(n)].map((_, c) => r * n + c) });
        for (let c = 0; c < n; c++) units.push({ kind: 'col', id: c, cells: [...Array(n)].map((_, r) => r * n + c) });
        const uName = (u) => u.kind === 'reg' ? regName(u.id) : u.kind === 'row' ? 'la ligne surlignée' : 'la colonne surlignée';
        const touch = puzzle.variant === 'cavaliers' ? 'à un saut de cavalier' : 'collées';
        const crownsOn = () => { const q = []; state.forEach((v, i) => { if (v === 2) q.push(i); }); return q; };
        const done = () => { render(); api.onChange(); const { bad, queens } = conflicts(); if (queens === n && bad.size === 0) api.onWin(); };

        // 1. une couronne fausse : on la retire, en montrant ce qu'elle empêche si possible
        for (let i = 0; i < N; i++) {
          if (state[i] !== 2 || isSol(i)) continue;
          const { bad } = conflicts();
          let why = [], text;
          if (bad.has(i)) {
            why = crownsOn().filter((j) => j !== i && bad.has(j));
            text = 'Cette couronne en gêne une autre (surlignée) : même ligne, colonne ou région, ou ' + touch + '. Je la retire.';
          } else {
            const blk = blocked();
            const dead = units.find((u) => !u.cells.some((j) => state[j] === 2) && u.cells.every((j) => blk[j]));
            if (dead) { why = dead.cells; text = 'Avec cette couronne, ' + uName(dead) + ' n\'a plus aucune case libre pour la sienne. Je la retire.'; }
            else text = 'Cette couronne n\'est pas à sa place : elle mène à une impasse un peu plus loin. Je la retire.';
          }
          C.act(() => { history.push(snap()); state[i] = 0; cleared[i] = 1; done(); });
          return { text, where: [cells[i]], why: why.map((j) => cells[j]) };
        }

        // cases encore possibles : ni bloquées par une couronne, ni écartées (par une astuce ou une croix juste)
        const blk = blocked();
        const free = (i) => state[i] !== 2 && !blk[i] && !(state[i] === 1 && !isSol(i));
        const freeIn = (u) => u.cells.filter(free);
        const open = units.filter((u) => !u.cells.some((j) => state[j] === 2));

        // 2. une ligne, une colonne ou une région n'a plus qu'une case possible : la couronne y va
        const order = ['reg', 'row', 'col'];
        for (const kind of order) {
          for (const u of open) {
            if (u.kind !== kind) continue;
            const f = freeIn(u);
            if (f.length !== 1 || !isSol(f[0])) continue;
            const i = f[0];
            C.act(() => { history.push(snap()); state[i] = 2; done(); });
            const text = u.cells.length === 1 ? 'Cette région n\'a qu\'une case : sa couronne y va forcément. Regarde tout ce qu\'elle écarte.'
              : 'Dans ' + uName(u) + ', toutes les autres cases sont écartées : sa couronne va forcément sur la case dorée.';
            return { text, where: [cells[i]], why: u.cells.filter((j) => j !== i).map((j) => cells[j]) };
          }
        }

        // 3. une région tient toute dans une seule ligne (ou colonne) : le reste de cette ligne est barré
        const mark = (list, text, why) => {
          C.act(() => {
            history.push(snap());
            list.forEach((j) => { state[j] = 1; cleared[j] = 0; });
            render(); api.onChange();
          });
          return { text, where: list.map((j) => cells[j]), why: why.map((j) => cells[j]) };
        };
        for (const u of open) {
          const f = freeIn(u);
          if (!f.length) continue;
          for (const [axis, of, word] of [['row', rowOf, 'ligne'], ['col', colOf, 'colonne']]) {
            if (u.kind === axis) continue;
            const k = of(f[0]);
            if (!f.every((j) => of(j) === k)) continue;
            const line = units.find((v) => v.kind === axis && v.id === k);
            const out = line.cells.filter((j) => free(j) && !u.cells.includes(j) && state[j] !== 1);
            if (u.kind === 'reg' && out.length) {
              return mark(out, 'Les cases libres de la région surlignée sont toutes sur une même ' + word + ' : sa couronne y sera. Le reste de cette ' + word + ' (cases dorées) est écarté.', f);
            }
          }
          // une ligne dont toutes les cases possibles sont dans une seule région : le reste de la région est barré
          if (u.kind !== 'reg') {
            const g = puzzle.region[f[0]];
            if (f.every((j) => puzzle.region[j] === g)) {
              const out = units[g].cells.filter((j) => free(j) && !u.cells.includes(j) && state[j] !== 1);
              if (out.length) return mark(out, 'Les cases libres de cette ' + (u.kind === 'row' ? 'ligne' : 'colonne') + ' (surlignées) sont toutes dans une même région : sa couronne sera là. Le reste de la région (cases dorées) est écarté.', f);
            }
          }
        }

        // 4. une case qui viderait une ligne, une colonne ou une région si on y posait une couronne
        for (let i = 0; i < N; i++) {
          if (!free(i) || state[i] === 1) continue;
          const ri = rowOf(i), ci = colOf(i);
          const hits = (j) => j === i || rowOf(j) === ri || colOf(j) === ci || puzzle.region[j] === puzzle.region[i] || forbidden(puzzle.variant, Math.abs(rowOf(j) - ri), colOf(j) - ci);
          const dead = open.find((u) => !u.cells.includes(i) && freeIn(u).length && freeIn(u).every(hits));
          if (dead && !isSol(i)) {
            return mark([i], 'Une couronne sur la case dorée écarterait toutes les cases libres de ' + uName(dead) + ' : la case dorée est donc exclue.', freeIn(dead));
          }
        }

        // 5. pas de déduction simple : un coup de pouce honnête
        for (let r = 0; r < n; r++) {
          const i = r * n + puzzle.solution[r];
          if (state[i] === 2) continue;
          C.act(() => { history.push(snap()); state[i] = 2; done(); });
          return { text: 'Coup de pouce : rien n\'est forcé pour l\'instant, alors je pose une couronne sur la case dorée. Regarde les cases qu\'elle écarte.', where: [cells[i]], why: [] };
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
        'Deux couronnes ne se touchent jamais, <b>même en diagonale</b>.',
        'Touche une case : une fois pour un <b>point</b>, deux fois pour une couronne. Les cases qu\'une couronne interdit se pointent toutes seules.',
        'Glisse le doigt pour pointer plusieurs cases ; pars d\'un point pour les effacer.'
      ],
      cavaliers: [
        'Place une <b>couronne</b> dans chaque ligne, chaque colonne et chaque zone de couleur.',
        'Deux couronnes peuvent se toucher, mais <b>jamais à un saut de cavalier</b> (2 cases d\'un côté, 1 de l\'autre).',
        'Touche une case : une fois pour un <b>point</b>, deux fois pour une couronne. Les cases interdites se pointent toutes seules.',
        'Glisse le doigt pour pointer plusieurs cases ; pars d\'un point pour les effacer.'
      ]
    },
    params,
    generate,
    create
  });
})();
