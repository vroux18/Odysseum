// Pavés : découper la grille en rectangles ; chacun contient un seul nombre,
// égal à son nombre de cases.
(function () {
  'use strict';
  const C = window.Carnet;

  // Teintes semi-transparentes : lisibles sur fond clair comme sombre.
  const FILLS = ['#6cb8ae', '#e08a62', '#e3b65a', '#7fa8cf', '#a39dcb', '#a8b46a', '#d4b48a', '#c97b85'];

  function partition(n, maxArea, rng) {
    const owner = new Int16Array(n * n).fill(-1);
    const rects = [];
    for (let i = 0; i < n * n; i++) {
      if (owner[i] >= 0) continue;
      const r0 = Math.floor(i / n), c0 = i % n;
      // largeur max libre sur la ligne
      let maxW = 0;
      while (c0 + maxW < n && owner[r0 * n + c0 + maxW] < 0) maxW++;
      const options = [];
      for (let w = 1; w <= maxW; w++) {
        for (let h = 1; r0 + h <= n; h++) {
          let free = true;
          for (let c = c0; c < c0 + w && free; c++) if (owner[(r0 + h - 1) * n + c] >= 0) free = false;
          if (!free) break;
          const area = w * h;
          if (area > maxArea) break;
          if (area >= 2) options.push([w, h]); // jamais de pavé d'une seule case
        }
      }
      const [w, h] = options.length ? rng.pick(options) : [1, 1];
      const id = rects.length;
      for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) owner[r * n + c] = id;
      rects.push({ r: r0, c: c0, w, h });
    }
    return rects;
  }

  function solveCount(n, clues, limit) {
    // clues: [{cell, value}] ; candidats = rectangles contenant exactement cet indice
    const clueAt = new Int16Array(n * n).fill(-1);
    clues.forEach((k, idx) => { clueAt[k.cell] = idx; });
    const cands = clues.map((k, idx) => {
      const list = [];
      const kr = Math.floor(k.cell / n), kc = k.cell % n;
      // indice mystère : toutes les tailles sont possibles
      const sizes = [];
      for (let w = 1; w <= n; w++) for (let h = 1; h <= n; h++) {
        if (k.hidden ? w * h <= 16 : w * h === k.value) sizes.push([w, h]);
      }
      for (const [w, h] of sizes) {
        for (let r = kr - h + 1; r <= kr; r++) for (let c = kc - w + 1; c <= kc; c++) {
          if (r < 0 || c < 0 || r + h > n || c + w > n) continue;
          let ok = true;
          const cells = [];
          for (let y = r; y < r + h && ok; y++) for (let x = c; x < c + w; x++) {
            const cc = y * n + x;
            if (clueAt[cc] >= 0 && clueAt[cc] !== idx) { ok = false; break; }
            cells.push(cc);
          }
          if (ok) list.push(cells);
        }
      }
      return list;
    });
    // Couverture exacte : on prend toujours la première case libre
    // et on essaie chaque rectangle candidat qui la couvre.
    const byCell = Array.from({ length: n * n }, () => []);
    cands.forEach((list, k) => list.forEach((cells) => cells.forEach((c) => byCell[c].push([k, cells]))));
    const used = new Uint8Array(n * n);
    const placed = new Uint8Array(clues.length);
    let count = 0;
    const rec = (from) => {
      let cell = from;
      while (cell < n * n && used[cell]) cell++;
      if (cell === n * n) { count++; return count >= limit; }
      for (const [k, cells] of byCell[cell]) {
        if (placed[k] || cells.some((c) => used[c])) continue;
        placed[k] = 1;
        cells.forEach((c) => { used[c] = 1; });
        if (rec(cell + 1)) return true;
        cells.forEach((c) => { used[c] = 0; });
        placed[k] = 0;
      }
      return false;
    };
    rec(0);
    return count;
  }

  function generate(rng, p) {
    let fallback = null;
    for (let t = 0; t < 150; t++) {
      const rects = partition(p.n, p.maxArea, rng);
      if (rects.some((rc) => rc.w * rc.h === 1)) continue; // une case isolée forcée : on recommence
      const clues = rects.map((rc) => {
        const y = rc.r + rng.int(rc.h), x = rc.c + rng.int(rc.w);
        return { cell: y * p.n + x, value: rc.w * rc.h };
      });
      const puzzle = { n: p.n, clues, solution: rects };
      if (!fallback) fallback = puzzle;
      if (solveCount(p.n, clues, 2) === 1) {
        // variante Mystère : on masque des nombres tant que la solution reste unique
        let hidden = 0;
        for (const k of rng.shuffle(clues.slice())) {
          if (hidden >= p.mystery) break;
          k.hidden = true;
          if (solveCount(p.n, clues, 2) === 1) hidden++; else k.hidden = false;
        }
        return puzzle;
      }
    }
    return fallback;
  }

  function params(level, variant) {
    const n = Math.min(variant === 'mystere' ? 8 : 10, 4 + Math.floor((level - 1) / 5));
    return { n, maxArea: Math.min(12, 3 + Math.floor(level / 3)), mystery: variant === 'mystere' ? 2 + Math.floor(level / 4) : 0 };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    let rects = [];
    const history = [];
    const clueAt = new Map(puzzle.clues.map((k) => [k.cell, k.hidden ? -1 : k.value]));

    const grid = document.createElement('div');
    grid.className = 'cell-grid paves';
    grid.style.setProperty('--n', n);
    host.appendChild(grid);

    for (let i = 0; i < n * n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.style.gridRow = Math.floor(i / n) + 1;
      d.style.gridColumn = (i % n) + 1;
      d.dataset.i = i;
      grid.appendChild(d);
    }
    const layer = document.createElement('div');
    layer.className = 'rect-layer';
    layer.style.setProperty('--n', n);
    grid.appendChild(layer);
    const clueLayer = document.createElement('div');
    clueLayer.className = 'rect-layer clue-layer';
    clueLayer.style.setProperty('--n', n);
    grid.appendChild(clueLayer);
    puzzle.clues.forEach((k) => {
      const d = document.createElement('div');
      d.className = 'clue';
      d.style.gridRow = Math.floor(k.cell / n) + 1;
      d.style.gridColumn = (k.cell % n) + 1;
      d.textContent = k.hidden ? '?' : k.value;
      if (k.hidden) d.classList.add('mystery');
      d.dataset.cell = k.cell;
      clueLayer.appendChild(d);
    });

    const cellsOf = (rc) => {
      const out = [];
      for (let y = rc.r; y < rc.r + rc.h; y++) for (let x = rc.c; x < rc.c + rc.w; x++) out.push(y * n + x);
      return out;
    };
    const valid = (rc) => {
      const cl = cellsOf(rc).filter((c) => clueAt.has(c));
      if (cl.length !== 1) return false;
      const v = clueAt.get(cl[0]);
      return v === -1 || v === rc.w * rc.h;
    };
    const overlap = (a, b) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w;

    let preview = null;
    const rectEls = new Map(); // clé r,c,w,h -> élément : un rectangle déjà posé ne rejoue pas son apparition
    let previewEl = null;
    function render() {
      // un chiffre posé sur un rectangle coloré passe en foncé, pour rester lisible
      clueLayer.querySelectorAll('.clue').forEach((d) => {
        const c = +d.dataset.cell, r = Math.floor(c / n), col = c % n;
        d.classList.toggle('on-fill', rects.some((rc) => valid(rc) && r >= rc.r && r < rc.r + rc.h && col >= rc.c && col < rc.c + rc.w));
      });
      let color = 0;
      const keep = new Set();
      rects.forEach((rc) => {
        const key = rc.r + ',' + rc.c + ',' + rc.w + ',' + rc.h;
        keep.add(key);
        let d = rectEls.get(key);
        if (!d) {
          d = document.createElement('div');
          d.style.gridRow = (rc.r + 1) + ' / span ' + rc.h;
          d.style.gridColumn = (rc.c + 1) + ' / span ' + rc.w;
          rectEls.set(key, d);
          layer.insertBefore(d, previewEl);
        }
        const ok = valid(rc);
        d.className = 'rect' + (ok ? '' : ' invalid');
        d.style.background = ok ? FILLS[color++ % FILLS.length] : '';
      });
      rectEls.forEach((d, key) => { if (!keep.has(key)) { d.remove(); rectEls.delete(key); } });
      if (preview) {
        if (!previewEl) { previewEl = document.createElement('div'); previewEl.className = 'rect preview'; layer.appendChild(previewEl); }
        previewEl.style.gridRow = (preview.r + 1) + ' / span ' + preview.h;
        previewEl.style.gridColumn = (preview.c + 1) + ' / span ' + preview.w;
        previewEl.dataset.size = preview.w * preview.h;
      } else if (previewEl) { previewEl.remove(); previewEl = null; }
    }

    function cellAt(e) {
      const rect = grid.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * n);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
      return [Math.max(0, Math.min(n - 1, r)), Math.max(0, Math.min(n - 1, c))];
    }

    let start = null;
    grid.addEventListener('pointerdown', (e) => {
      grid.setPointerCapture(e.pointerId);
      start = cellAt(e);
      preview = { r: start[0], c: start[1], w: 1, h: 1 };
      render();
    });
    grid.addEventListener('pointermove', (e) => {
      if (!start) return;
      const [r, c] = cellAt(e);
      preview = { r: Math.min(r, start[0]), c: Math.min(c, start[1]), w: Math.abs(c - start[1]) + 1, h: Math.abs(r - start[0]) + 1 };
      render();
    });
    const up = () => {
      if (!start) return;
      const rc = preview;
      start = null; preview = null;
      history.push(rects.slice());
      if (rc.w === 1 && rc.h === 1) {
        // simple toucher : efface le rectangle dessous, sinon pose une case seule
        const hit = rects.findIndex((x) => overlap(x, rc));
        if (hit >= 0) { rects.splice(hit, 1); C.sfx.tap(); }
        else { rects.push(rc); C.sfx.place(); }
      } else {
        rects = rects.filter((x) => !overlap(x, rc));
        rects.push(rc);
        if (valid(rc)) C.sfx.place(); else C.sfx.tap();
      }
      render();
      api.onChange();
      check();
    };
    grid.addEventListener('pointerup', up);
    // geste interrompu (second doigt pour zoomer, appel système) : le rectangle en cours est abandonné
    grid.addEventListener('pointercancel', () => { if (!start) return; start = null; preview = null; render(); });

    function check() {
      const covered = rects.reduce((s, rc) => s + rc.w * rc.h, 0);
      if (covered === n * n && rects.every(valid)) api.onWin();
    }

    render();

    return {
      status() {
        const covered = rects.reduce((s, rc) => s + rc.w * rc.h, 0);
        return 'Couvert ' + Math.round((100 * covered) / (n * n)) + ' %';
      },
      undo() { if (history.length) { rects = history.pop(); render(); api.onChange(); } },
      reset() { history.push(rects.slice()); rects = []; render(); api.onChange(); },
      hint() {
        const same = (a, b) => a.r === b.r && a.c === b.c && a.w === b.w && a.h === b.h;
        const inside = (rc, cell) => { const r = Math.floor(cell / n), c = cell % n; return r >= rc.r && r < rc.r + rc.h && c >= rc.c && c < rc.c + rc.w; };
        const clueEl = (cell) => clueLayer.querySelector('.clue[data-cell="' + cell + '"]');
        const cellEl = (i) => grid.children[i];
        const label = (k) => (k.hidden ? 'Le ?' : 'Le ' + k.value);
        // zone surlignée : un cadre posé dans le calque des rectangles, sous les nombres
        const areas = [];
        const area = (rc) => {
          const d = document.createElement('div');
          d.className = 'hint-area';
          d.style.gridRow = (rc.r + 1) + ' / span ' + rc.h;
          d.style.gridColumn = (rc.c + 1) + ' / span ' + rc.w;
          layer.appendChild(d);
          areas.push(d);
          return d;
        };
        const clear = () => areas.forEach((d) => d.remove());
        const solFor = (k) => puzzle.solution.find((s) => inside(s, k.cell));

        // 1. un rectangle qui ne fait pas partie de la solution : on l'enlève
        const wrong = rects.find((x) => !puzzle.solution.some((s) => same(s, x)));
        if (wrong) {
          history.push(rects.slice());
          rects = rects.filter((x) => x !== wrong);
          render(); api.onChange();
          const nums = puzzle.clues.filter((k) => inside(wrong, k.cell));
          let text;
          if (!nums.length) text = 'Ce rectangle ne contient aucun nombre : il en faut un, et un seul, par rectangle. Je l\'enlève.';
          else if (nums.length > 1) text = 'Ce rectangle contient ' + nums.length + ' nombres (surlignés) : un seul par rectangle. Je l\'enlève.';
          else if (!nums[0].hidden && nums[0].value !== wrong.w * wrong.h) text = 'Ce rectangle fait ' + (wrong.w * wrong.h) + ' cases, mais son nombre (surligné) dit ' + nums[0].value + '. Je l\'enlève.';
          else if (nums[0].hidden) text = 'Ce rectangle n\'est pas celui du ? : il empêcherait de placer les autres. Je l\'enlève.';
          else text = 'Bonne taille, mais pas la bonne forme ni la bonne place : il empêcherait de placer les autres. Je l\'enlève.';
          return { text, where: [area(wrong)], why: nums.map((k) => clueEl(k.cell)), clear };
        }

        // 2. déductions : pour chaque nombre, les rectangles encore possibles (comme le solveur)
        const known = rects.slice(); // tous justes à ce stade
        const takenBy = new Int16Array(n * n).fill(-1);
        known.forEach((rc, k) => cellsOf(rc).forEach((c) => { takenBy[c] = k; }));
        const open = puzzle.clues.filter((k) => !known.some((rc) => inside(rc, k.cell)));
        const cands = new Map();
        open.forEach((k) => {
          const kr = Math.floor(k.cell / n), kc = k.cell % n, list = [];
          for (let w = 1; w <= n; w++) for (let h = 1; h <= n; h++) {
            if (k.hidden ? w * h > 16 || w * h < 2 : w * h !== k.value) continue;
            for (let r = kr - h + 1; r <= kr; r++) for (let c = kc - w + 1; c <= kc; c++) {
              if (r < 0 || c < 0 || r + h > n || c + w > n) continue;
              const rc = { r, c, w, h };
              const cs = cellsOf(rc);
              if (cs.some((x) => takenBy[x] >= 0 || (x !== k.cell && clueAt.has(x)))) continue;
              list.push(rc);
            }
          }
          cands.set(k, list);
        });
        const place = (k, rc, text, why) => {
          history.push(rects.slice());
          rects = rects.filter((x) => !overlap(x, rc));
          rects.push(Object.assign({}, rc));
          render(); api.onChange(); check();
          return { text, where: [area(rc)], why: [clueEl(k.cell)].concat(why || []), clear };
        };
        // 2a. un nombre qui n'a plus qu'une forme possible
        for (const k of open) {
          const list = cands.get(k), sol = solFor(k);
          if (list.length !== 1 || !same(list[0], sol)) continue;
          const rc = list[0];
          // les nombres et rectangles voisins qui interdisent les autres formes
          const blockers = [];
          for (let w = 1; w <= n; w++) for (let h = 1; h <= n; h++) {
            if (k.hidden || w * h !== k.value) continue;
            const kr = Math.floor(k.cell / n), kc = k.cell % n;
            for (let r = kr - h + 1; r <= kr; r++) for (let c = kc - w + 1; c <= kc; c++) {
              if (r < 0 || c < 0 || r + h > n || c + w > n) continue;
              cellsOf({ r, c, w, h }).forEach((x) => { if (x !== k.cell && clueAt.has(x) && !blockers.includes(x)) blockers.push(x); });
            }
          }
          const why = blockers.slice(0, 6).map(clueEl);
          return place(k, rc, label(k) + ' n\'a plus qu\'une forme possible, le cadre doré : les autres sortiraient de la grille' +
            (blockers.length ? ', prendraient un autre nombre (surligné)' : '') + ' ou mordraient sur un rectangle posé.', why);
        }
        // 2b. une case vide qu'un seul nombre peut atteindre : ce nombre doit la couvrir
        for (let x = 0; x < n * n; x++) {
          if (takenBy[x] >= 0) continue;
          const who = open.filter((k) => cands.get(k).some((rc) => inside(rc, x)));
          if (who.length !== 1) continue;
          const k = who[0];
          const list = cands.get(k).filter((rc) => inside(rc, x));
          if (list.length !== 1 || !same(list[0], solFor(k))) continue;
          return place(k, list[0], 'Seul ' + label(k).toLowerCase() + ' peut atteindre la case surlignée, et une seule de ses formes passe par elle : le cadre doré.', [cellEl(x)]);
        }

        // 3. pas de déduction simple : coup de pouce sur le nombre le moins libre
        const k = open.slice().sort((a, b) => cands.get(a).length - cands.get(b).length)[0];
        if (!k) return false;
        const rc = solFor(k);
        const nb = cands.get(k).length;
        return place(k, rc, 'Coup de pouce : rien n\'est forcé pour l\'instant. ' + label(k) + ' prend cette forme (cadre doré)' + (nb > 1 ? ', parmi ' + nb + ' possibles.' : '.'), []);
      },
      destroy() {}
    };
  }

  C.register({
    id: 'paves',
    name: 'Pavés',
    tagline: 'Découpe la grille en rectangles',
    accent: '#7cf06b',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M2 2h12v9H2z" fill="currentColor"/><path d="M16 2h6v20h-6z" fill="currentColor" opacity=".6"/><path d="M2 13h12v9H2z" fill="currentColor" opacity=".8"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Chaque rectangle porte sa taille.' },
      { id: 'mystere', name: 'Mystère', desc: 'Certains nombres sont cachés derrière un « ? ».' }
    ],
    rules: {
      classic: [
        'Découpe toute la grille en <b>rectangles</b>.',
        'Chaque rectangle contient <b>un seul nombre</b>, égal à son nombre de cases.',
        'Glisse le doigt d\'un coin à l\'autre pour tracer un rectangle. Touche-le pour l\'effacer.'
      ],
      mystere: [
        'Découpe toute la grille en <b>rectangles</b>, avec un seul nombre dans chacun.',
        'Le nombre donne la taille du rectangle. Un <b>?</b> la cache : à toi de la déduire.',
        'Glisse le doigt d\'un coin à l\'autre pour tracer un rectangle. Touche-le pour l\'effacer.'
      ]
    },
    params,
    generate,
    create
  });
})();
