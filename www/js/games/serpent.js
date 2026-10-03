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
        const sol = puzzle.solution[0] === startCell ? puzzle.solution : puzzle.solution.slice().reverse();
        let ok = 0;
        while (ok < path.length && path[ok] === sol[ok]) ok++;
        const box = (c, kind, round) => {
          const m = round ? cell * 0.14 : cell * 0.05;
          return { x: (c % n) * cell + m, y: Math.floor(c / n) * cell + m, w: cell - 2 * m, h: cell - 2 * m, kind, round };
        };
        const finish = (text, boxes) => {
          draw(); api.onChange();
          if (path.length === n * n && num.get(path[path.length - 1]) === K) api.onWin();
          return Object.assign({ text }, C.hintBoxes(canvas, boxes));
        };
        // 1. le tracé s'égare : on le ramène à sa dernière case juste
        if (ok < path.length) {
          history.push(path.slice());
          const lost = path.slice(ok);
          path = sol.slice(0, ok);
          return finish('Le chemin s\'est égaré après la case dorée : les cases surlignées menaient à une impasse. Je le ramène là, repars d\'ici.',
            lost.map((c) => box(c, 'why')).concat([box(path[path.length - 1], 'where', true)]));
        }
        // 2. passages forcés : on avance tant que la case suivante est imposée
        const N = n * n;
        const last = K; // numéro de l'arrivée
        const endCell = [...num.entries()].find(([, v]) => v === last)[0];
        const nbs = (c) => {
          const r = Math.floor(c / n), k = c % n, out = [];
          if (r > 0) out.push(c - n); if (r < n - 1) out.push(c + n); if (k > 0) out.push(c - 1); if (k < n - 1) out.push(c + 1);
          return out.filter((d) => !blocked(c, d));
        };
        const steps = [];
        let reason = null;
        const used = new Set(path);
        let need = nextNeeded();
        for (let guard = 0; guard < 3 && path.length + steps.length < N; guard++) {
          const head = steps.length ? steps[steps.length - 1] : path[path.length - 1];
          // cases où l'on peut aller : libres, et pas un numéro hors de son tour
          const lastStep = path.length + steps.length === N - 1;
          const can = nbs(head).filter((d) => !used.has(d) && (!num.has(d) || num.get(d) === need) && (d !== endCell || lastStep));
          let pick = -1, why = null;
          if (can.length === 1) { pick = can[0]; why = { t: 'only', cells: nbs(head).filter((d) => d !== pick) }; }
          else {
            // une voisine qui n'aurait plus qu'une autre sortie : il faut y passer maintenant, sinon elle devient un cul-de-sac
            for (const d of can) {
              if (d === endCell) continue;
              const exits = nbs(d).filter((e) => e !== head && !used.has(e));
              if (exits.length === 1) { pick = d; why = { t: 'dead', cells: [d], exit: exits[0] }; break; }
            }
          }
          if (pick < 0 || pick !== sol[path.length + steps.length]) break;
          if (!reason) reason = why;
          steps.push(pick); used.add(pick);
          if (num.get(pick) === need) need++;
        }
        history.push(path.slice());
        if (steps.length) {
          const head = path[path.length - 1];
          path = path.concat(steps);
          const boxes = [box(head, 'why', true)];
          let text;
          if (reason.t === 'only') {
            text = 'Depuis le bout du chemin (surligné), une seule case est possible : les autres sont ' +
              (puzzle.variant === 'laby' ? 'déjà parcourues, derrière un mur, ou c\'est l\'arrivée (trop tôt).' : 'déjà parcourues ou portent un numéro qui vient plus tard.');
          } else {
            boxes.push(box(reason.exit, 'why'));
            text = 'La case dorée n\'a plus qu\'une autre sortie (surlignée) : si le chemin n\'y passe pas maintenant, elle deviendra un cul-de-sac.';
          }
          if (steps.length > 1) text += ' La suite est forcée aussi.';
          return finish(text, boxes.concat(steps.map((c, i) => box(c, 'where', i === 0))));
        }
        // 3. aucun passage forcé : coup de pouce vers le prochain numéro
        const add = sol.slice(path.length, path.length + 2);
        path = path.concat(add);
        const target = puzzle.variant === 'laby' ? 'l\'arrivée' : 'le ' + need;
        return finish('Coup de pouce : rien n\'est forcé pour l\'instant. Le chemin continue par les cases dorées, en route vers ' + target + '.',
          add.map((c, i) => box(c, 'where', i === 0)));
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
        'Pars du <b>1</b> et glisse le doigt pour tracer le chemin, case par case, sans diagonale.',
        'Passe par les numéros <b>dans l\'ordre</b> et termine sur le plus grand.',
        'Le chemin passe <b>une seule fois par chaque case</b>. Reviens en arrière pour l\'effacer.'
      ],
      laby: [
        'Pars du <b>point plein</b> et termine sur l\'<b>anneau</b>, en glissant le doigt case par case.',
        'Les <b>murs</b> ne se traversent pas.',
        'Le chemin passe <b>une seule fois par chaque case</b>. Reviens en arrière pour l\'effacer.'
      ]
    },
    params,
    generate,
    create
  });
})();
