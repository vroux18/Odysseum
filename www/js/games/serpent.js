// Serpent : tracer un seul chemin qui passe par toutes les cases,
// en visitant les numéros dans l'ordre. Variante Labyrinthe : seulement
// le départ et l'arrivée, mais des murs bloquent certains passages.
(function () {
  'use strict';
  const C = window.Carnet;

  function generate(rng, p) {
    const n = p.n;
    const path = C.gridPath(n, n, rng);
    const L = path.length;
    const checkpoints = new Map();
    let walls = [];
    if (p.variant === 'laby') {
      checkpoints.set(path[0], 1);
      checkpoints.set(path[L - 1], 2);
      // murs sur une partie des passages que la solution n'emprunte pas
      const used = new Set();
      for (let i = 0; i + 1 < L; i++) {
        const a = Math.min(path[i], path[i + 1]), b = Math.max(path[i], path[i + 1]);
        used.add(a + ':' + b);
      }
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
        const i = r * n + c;
        if (c + 1 < n && !used.has(i + ':' + (i + 1)) && rng() < p.wallRate) walls.push([i, i + 1]);
        if (r + 1 < n && !used.has(i + ':' + (i + n)) && rng() < p.wallRate) walls.push([i, i + n]);
      }
    } else {
      const idx = new Set([0, L - 1]);
      while (idx.size < p.k) idx.add(1 + rng.int(L - 2));
      [...idx].sort((a, b) => a - b).forEach((pos, k) => checkpoints.set(path[pos], k + 1));
    }
    return { n, variant: p.variant, checkpoints: [...checkpoints.entries()], walls, solution: path };
  }

  function params(level, variant) {
    const n = Math.min(8, 4 + Math.floor((level - 1) / 6));
    if (variant === 'laby') return { n, variant, wallRate: Math.max(0.45, 0.85 - level * 0.01) };
    const k = Math.max(4, Math.round(n * n * Math.max(0.12, 0.32 - level * 0.006)));
    return { n, variant, k };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    const num = new Map(puzzle.checkpoints);
    const K = Math.max(...num.values());
    const startCell = [...num.entries()].find(([, v]) => v === 1)[0];
    const wallSet = new Set(puzzle.walls.map(([a, b]) => a + ':' + b));
    const blocked = (a, b) => wallSet.has(Math.min(a, b) + ':' + Math.max(a, b));
    let path = [startCell];
    const history = [];
    let dragging = false;

    const canvas = document.createElement('canvas');
    canvas.className = 'board-canvas';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let size = 0, cell = 0;

    function resize() {
      const w = Math.min(host.clientWidth, host.clientHeight || Infinity, 520, (puzzle.n || 6) * 76); // cases jamais trop grosses // tient dans l'espace libre
      const dpr = window.devicePixelRatio || 1;
      size = w; cell = w / n;
      canvas.style.width = w + 'px'; canvas.style.height = w + 'px';
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const nextNeeded = () => {
      let k = 1;
      path.forEach((c) => { if (num.get(c) === k) k++; });
      return k;
    };

    function cellAt(e) {
      const rect = canvas.getBoundingClientRect();
      const c = Math.floor(((e.clientX - rect.left) / rect.width) * n);
      const r = Math.floor(((e.clientY - rect.top) / rect.height) * n);
      return r < 0 || c < 0 || r >= n || c >= n ? -1 : r * n + c;
    }

    function step(t) {
      const last = path[path.length - 1];
      const d = Math.abs(Math.floor(t / n) - Math.floor(last / n)) + Math.abs((t % n) - (last % n));
      if (d !== 1 || blocked(last, t)) return false;
      const at = path.indexOf(t);
      if (at >= 0) { path = path.slice(0, at + 1); return true; }
      if (num.has(t) && num.get(t) !== nextNeeded()) { C.sfx.error(); return false; }
      path.push(t);
      if (num.has(t)) C.sfx.place();
      return true;
    }

    canvas.addEventListener('pointerdown', (e) => {
      const c = cellAt(e);
      if (c < 0) return;
      const at = path.indexOf(c);
      if (at < 0) return;
      canvas.setPointerCapture(e.pointerId);
      history.push(path.slice());
      path = path.slice(0, at + 1);
      dragging = true;
      C.sfx.tap();
      draw(); api.onChange();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const c = cellAt(e);
      if (c < 0 || c === path[path.length - 1]) return;
      let guard = 0;
      while (path[path.length - 1] !== c && guard++ < 2 * n) {
        const last = path[path.length - 1];
        const lr = Math.floor(last / n), lc = last % n, tr = Math.floor(c / n), tc = c % n;
        const next = lr !== tr && (lc === tc || Math.abs(tr - lr) >= Math.abs(tc - lc))
          ? (lr + Math.sign(tr - lr)) * n + lc : lr * n + lc + Math.sign(tc - lc);
        if (!step(next)) break;
      }
      draw(); api.onChange();
    });
    const up = () => {
      if (!dragging) return;
      dragging = false;
      if (history.length && JSON.stringify(history[history.length - 1]) === JSON.stringify(path)) history.pop();
      if (path.length === n * n && num.get(path[path.length - 1]) === K) api.onWin();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const css = (v) => getComputedStyle(document.body).getPropertyValue(v).trim();
    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }
    const ctr = (c) => [(c % n + 0.5) * cell, (Math.floor(c / n) + 0.5) * cell];

    function draw() {
      const bg = css('--bg'), tile = css('--tile'), ink = css('--ink'), muted = css('--muted'), accent = '#4fb5a6';
      ctx.clearRect(0, 0, size, size);
      // cases en tuiles arrondies ; les cases visitées prennent la teinte du chemin
      const gap = Math.max(2, cell * 0.06), rad = cell * 0.18;
      const visited = new Map(path.map((c, i) => [c, i]));
      for (let c = 0; c < n * n; c++) {
        const x = (c % n) * cell + gap / 2, y = Math.floor(c / n) * cell + gap / 2;
        ctx.fillStyle = tile;
        roundRect(ctx, x, y, cell - gap, cell - gap, rad); ctx.fill();
        if (visited.has(c)) {
          ctx.fillStyle = accent + (visited.get(c) === path.length - 1 ? '66' : '33');
          roundRect(ctx, x, y, cell - gap, cell - gap, rad); ctx.fill();
        }
      }
      // chemin pixel (angles droits)
      if (path.length > 1) {
        ctx.strokeStyle = accent; ctx.lineWidth = cell * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        path.forEach((c, i) => { const [x, y] = ctr(c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      // murs
      ctx.strokeStyle = muted; ctx.lineWidth = Math.max(2.5, cell * 0.06); ctx.lineCap = 'round';
      puzzle.walls.forEach(([a, b]) => {
        const r = Math.floor(a / n), c = a % n;
        ctx.beginPath();
        if (b === a + 1) { ctx.moveTo((c + 1) * cell, r * cell + 3); ctx.lineTo((c + 1) * cell, (r + 1) * cell - 3); }
        else { ctx.moveTo(c * cell + 3, (r + 1) * cell); ctx.lineTo((c + 1) * cell - 3, (r + 1) * cell); }
        ctx.stroke();
      });
      // numéros : pastilles rondes ; en Labyrinthe, un point plein (départ) et un anneau (arrivée)
      num.forEach((v, c) => {
        const [x, y] = ctr(c);
        const done = path.includes(c);
        if (puzzle.variant === 'laby') {
          ctx.fillStyle = v === 1 || done ? accent : bg;
          ctx.strokeStyle = accent; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, cell * 0.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          return;
        }
        ctx.fillStyle = done ? accent : bg;
        ctx.strokeStyle = done ? accent : muted; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, cell * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = done ? bg : ink;
        ctx.font = '400 ' + Math.round(cell * 0.3) + 'px Jost, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(v), x, y + 1);
      });
    }

    window.addEventListener('resize', resize);
    resize();

    return {
      status() { return 'Cases ' + path.length + '/' + n * n; },
      undo() { if (history.length) { path = history.pop(); draw(); api.onChange(); } },
      reset() { history.push(path.slice()); path = [startCell]; draw(); api.onChange(); },
      hint() {
        // prolonge (ou corrige) le tracé de quelques cases selon la solution
        const sol = puzzle.solution[0] === startCell ? puzzle.solution : puzzle.solution.slice().reverse();
        let ok = 0;
        while (ok < path.length && path[ok] === sol[ok]) ok++;
        history.push(path.slice());
        path = sol.slice(0, Math.min(sol.length, ok + 3));
        draw(); api.onChange();
        if (path.length === n * n) api.onWin();
        return 'Le chemin doit filer par ici pour rejoindre le prochain numéro sans s\'enfermer dans un coin.';
      },
      redraw: draw,
      destroy() { window.removeEventListener('resize', resize); }
    };
  }

  C.register({
    id: 'serpent',
    name: 'Serpent',
    tagline: 'Un seul chemin pour tout parcourir',
    accent: '#3ee6d6',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M3 3h14v4H7v2h12v12H5v-4h10v-4H3z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Passe par les numéros dans l\'ordre.' },
      { id: 'laby', name: 'Labyrinthe', desc: 'Juste un départ, une arrivée et des murs.' }
    ],
    rules: {
      classic: [
        'Pars du <b>1</b> et trace un chemin case par case, sans diagonale.',
        'Passe par les numéros dans l\'ordre croissant et termine sur le plus grand.',
        'Le chemin doit passer <b>une seule fois par chaque case</b>.'
      ],
      laby: [
        'Pars de <b>GO</b> et termine sur l\'<b>étoile</b>.',
        'Les murs épais ne se traversent pas.',
        'Le chemin doit passer <b>une seule fois par chaque case</b>.'
      ]
    },
    params,
    generate,
    create
  });
})();
