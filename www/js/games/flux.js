// Flux : relier les points de même couleur, remplir toute la grille.
// Les cases « pont » laissent deux tuyaux se croiser (un horizontal, un vertical).
(function () {
  'use strict';
  const C = window.Carnet;

  // pastels posés, assez distincts les uns des autres
  const COLORS = ['#e59a9a', '#7fa9cc', '#e2bf74', '#8fbf8a', '#b39ddb', '#eda77c',
    '#6fb5ad', '#d595bd', '#a9b878', '#8f9fd9', '#d9c46a', '#b3a08f'];

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // haut, bas, gauche, droite

  // --- Graphe : une case normale = 1 nœud, une case pont = 2 nœuds (h et v). ---
  function buildGraph(n, bridges, wrap) {
    const total = n * n;
    const bridgeIdx = new Map();
    bridges.forEach((c, i) => bridgeIdx.set(c, i));
    const nodeCount = total + bridges.length;
    const vnode = (c) => total + bridgeIdx.get(c);
    // nœud de la case c utilisé quand on y entre/sort selon l'axe (vertical = true)
    const nodeAt = (c, vertical) => (bridgeIdx.has(c) && vertical ? vnode(c) : c);
    const cellOf = (node) => (node < total ? node : bridges[node - total]);
    const adj = Array.from({ length: nodeCount }, () => []);
    for (let r = 0; r < n; r++) {
      for (let col = 0; col < n; col++) {
        const c = r * n + col;
        // droite
        if (col + 1 < n) {
          const a = nodeAt(c, false), b = nodeAt(c + 1, false);
          adj[a].push(b); adj[b].push(a);
        }
        // bas
        if (r + 1 < n) {
          const a = nodeAt(c, true), b = nodeAt(c + n, true);
          adj[a].push(b); adj[b].push(a);
        }
      }
    }
    // Tore : les bords opposés communiquent par des tunnels.
    if (wrap) {
      for (let k = 0; k < n; k++) {
        const left = k * n, right = k * n + n - 1;
        adj[nodeAt(right, false)].push(nodeAt(left, false));
        adj[nodeAt(left, false)].push(nodeAt(right, false));
        const top = k, bottom = (n - 1) * n + k;
        adj[nodeAt(bottom, true)].push(nodeAt(top, true));
        adj[nodeAt(top, true)].push(nodeAt(bottom, true));
      }
    }
    const isBridgeNode = (node) => node >= total || bridgeIdx.has(node);
    return { n, total, nodeCount, adj, nodeAt, cellOf, bridgeIdx, isBridgeNode, vnode };
  }

  // Chemin hamiltonien par DFS (heuristique de Warnsdorff + budget).
  function hamiltonian(g, rng) {
    // Beaucoup d'essais courts valent mieux que de longues recherches.
    for (let attempt = 0; attempt < 300; attempt++) {
      const visited = new Uint8Array(g.nodeCount);
      const path = [];
      let budget = g.nodeCount * 6;
      let start;
      do { start = rng.int(g.total); } while (g.isBridgeNode(start));
      const deg = (v) => g.adj[v].reduce((s, w) => s + (visited[w] ? 0 : 1), 0);
      const dfs = (v) => {
        visited[v] = 1; path.push(v);
        if (path.length === g.nodeCount) return true;
        if (--budget < 0) return false;
        const next = rng.shuffle(g.adj[v].filter((w) => !visited[w]))
          .map((w) => [w, deg(w)])
          .sort((a, b) => a[1] - b[1]);
        for (const [w] of next) {
          if (dfs(w)) return true;
          if (budget < 0) return false;
        }
        visited[v] = 0; path.pop();
        return false;
      };
      if (dfs(start)) return path;
    }
    return null;
  }

  // Mélange par « backbite » : garde un chemin hamiltonien, le rend aléatoire.
  function backbite(g, path, rng, moves) {
    const pos = new Int32Array(g.nodeCount);
    path.forEach((v, i) => { pos[v] = i; });
    for (let m = 0; m < moves; m++) {
      if (rng() < 0.5) { path.reverse(); path.forEach((v, i) => { pos[v] = i; }); }
      const last = path.length - 1;
      const end = path[last];
      const nb = rng.pick(g.adj[end]);
      if (nb === path[last - 1]) continue;
      const i = pos[nb];
      // inverse path[i+1 .. last]
      let a = i + 1, b = last;
      while (a < b) {
        const t = path[a]; path[a] = path[b]; path[b] = t;
        pos[path[a]] = a; pos[path[b]] = b;
        a++; b--;
      }
    }
    return path;
  }

  function chooseBridges(n, count, rng) {
    const out = [];
    let guard = 0;
    while (out.length < count && guard++ < 200) {
      const r = 1 + rng.int(n - 2), c = 1 + rng.int(n - 2);
      const cell = r * n + c;
      const ok = out.every((o) => Math.abs(Math.floor(o / n) - r) + Math.abs((o % n) - c) > 2);
      if (ok) out.push(cell);
    }
    return out;
  }

  function generate(rng, p) {
    for (let tries = 0; tries < 40; tries++) {
      const bridges = chooseBridges(p.n, p.bridges, rng);
      const g = buildGraph(p.n, bridges, p.variant === 'tore');
      let path = hamiltonian(g, rng);
      if (!path) continue;
      path = backbite(g, path, rng, g.nodeCount * 30);
      let fix = 0;
      while ((g.isBridgeNode(path[0]) || g.isBridgeNode(path[path.length - 1])) && fix++ < 500) {
        backbite(g, path, rng, 5);
      }
      if (g.isBridgeNode(path[0]) || g.isBridgeNode(path[path.length - 1])) continue;

      const segs = cut(g, path, p.colors, rng);
      if (!segs) continue;
      // Un pont doit être traversé par deux couleurs différentes.
      const bridgeOk = bridges.every((b) => {
        const s1 = segs.findIndex((s) => s.includes(b));
        const s2 = segs.findIndex((s) => s.includes(g.vnode(b)));
        return s1 !== s2;
      });
      if (!bridgeOk) continue;
      rng.shuffle(segs);
      return {
        n: p.n,
        variant: p.variant,
        bridges,
        endpoints: segs.map((s) => [s[0], s[s.length - 1]]),
        solution: segs
      };
    }
    // Repli : sans pont.
    return generate(rng, Object.assign({}, p, { bridges: 0 }));
  }

  function cut(g, path, k, rng) {
    const L = path.length;
    const minLen = 3;
    for (let t = 0; t < 400; t++) {
      // tailles aléatoires >= minLen dont la somme vaut L
      const sizes = new Array(k).fill(minLen);
      let rest = L - k * minLen;
      if (rest < 0) return null;
      while (rest > 0) { sizes[rng.int(k)]++; rest--; }
      const segs = [];
      let i = 0, ok = true;
      for (const s of sizes) {
        const seg = path.slice(i, i + s);
        i += s;
        if (g.isBridgeNode(seg[0]) || g.isBridgeNode(seg[seg.length - 1])) { ok = false; break; }
        // deux extrémités côte à côte = trop trivial pour les longs tuyaux
        segs.push(seg);
      }
      if (ok) return segs;
    }
    return null;
  }

  function params(level, variant) {
    const n = Math.min(9, 5 + Math.floor((level - 1) / 8));
    let bridges = level < 3 ? 0 : Math.min(3, 1 + Math.floor((level - 3) / 12));
    if (variant === 'tore') bridges = level < 6 ? 0 : 1;
    const colors = Math.max(3, Math.min(COLORS.length, n - 1 + (level % 3)));
    return { n, bridges, colors, variant };
  }

  // --------------------------- Interface ---------------------------
  function create(host, puzzle, api) {
    const n = puzzle.n;
    const wrap = puzzle.variant === 'tore';
    const g = buildGraph(n, puzzle.bridges, wrap);
    const K = puzzle.endpoints.length;
    const endpointColor = new Int16Array(g.nodeCount).fill(-1);
    puzzle.endpoints.forEach(([a, b], k) => { endpointColor[a] = k; endpointColor[b] = k; });
    const adjSet = g.adj.map((l) => new Set(l));

    let paths = Array.from({ length: K }, () => []);
    let history = [];
    let drag = null; // { color, snapshot }

    const canvas = document.createElement('canvas');
    canvas.className = 'board-canvas';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let size = 0, cell = 0;

    function resize() {
      const w = Math.min(host.clientWidth, host.clientHeight || Infinity, 520); // tient dans l'espace libre
      const dpr = window.devicePixelRatio || 1;
      size = w;
      cell = w / n;
      canvas.style.width = w + 'px';
      canvas.style.height = w + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(w * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    const isComplete = (k) => {
      const p = paths[k];
      if (p.length < 2) return false;
      const [a, b] = puzzle.endpoints[k];
      return (p[0] === a && p[p.length - 1] === b) || (p[0] === b && p[p.length - 1] === a);
    };

    function owners() {
      const own = new Int16Array(g.nodeCount).fill(-1);
      paths.forEach((p, k) => p.forEach((v) => { own[v] = k; }));
      return own;
    }

    // Pendant un tracé, les autres tuyaux sont coupés là où le tracé actif passe,
    // et retrouvent leur forme si on revient en arrière.
    function applyCuts() {
      if (!drag) return;
      const active = new Set(paths[drag.color]);
      drag.snapshot.forEach((p, k) => {
        if (k === drag.color) return;
        const idx = p.findIndex((v) => active.has(v));
        paths[k] = idx === -1 ? p.slice() : p.slice(0, idx);
      });
    }

    function cellFromEvent(e) {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let c = Math.floor(x / (rect.width / n)), r = Math.floor(y / (rect.height / n));
      // Tore : glisser juste au-delà d'un bord ressort de l'autre côté
      if (wrap && drag && r >= -1 && c >= -1 && r <= n && c <= n) {
        r = (r + n) % n; c = (c + n) % n;
      }
      if (r < 0 || c < 0 || r >= n || c >= n) return -1;
      return r * n + c;
    }

    // écart entre deux cases, en tenant compte des tunnels du tore
    function delta(from, to) {
      let dr = Math.floor(to / n) - Math.floor(from / n);
      let dc = (to % n) - (from % n);
      if (wrap && Math.abs(dr) === n - 1) dr = -Math.sign(dr);
      if (wrap && Math.abs(dc) === n - 1) dc = -Math.sign(dc);
      return [dr, dc];
    }

    function onDown(e) {
      const c = cellFromEvent(e);
      if (c < 0) return;
      canvas.setPointerCapture(e.pointerId);
      const own = owners();
      let color = -1, node = -1;
      if (endpointColor[c] >= 0) {
        color = endpointColor[c];
        node = c;
        history.push(paths.map((p) => p.slice()));
        drag = { color, snapshot: paths.map((p) => p.slice()) };
        paths[color] = [c];
      } else {
        const candidates = g.bridgeIdx.has(c) ? [c, g.vnode(c)] : [c];
        for (const v of candidates) if (own[v] >= 0) { node = v; color = own[v]; break; }
        if (color < 0) return;
        history.push(paths.map((p) => p.slice()));
        drag = { color, snapshot: paths.map((p) => p.slice()) };
        const p = paths[color];
        paths[color] = p.slice(0, p.indexOf(node) + 1);
      }
      drag.lastCell = c;
      C.sfx.tap();
      applyCuts();
      draw();
    }

    function stepTo(target) {
      const k = drag.color;
      const p = paths[k];
      const lastNode = p[p.length - 1];
      const lastCell = g.cellOf(lastNode);
      const [dr, dc] = delta(lastCell, target);
      if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
      const cand = g.nodeAt(target, dr !== 0);
      // retour en arrière sur son propre tuyau
      const own = p.indexOf(cand);
      if (own >= 0) { paths[k] = p.slice(0, own + 1); return true; }
      if (!adjSet[lastNode].has(cand)) return false;
      if (isComplete(k)) return false;
      if (endpointColor[cand] >= 0 && endpointColor[cand] !== k) return false;
      if (endpointColor[cand] === k && cand === p[0]) return false;
      p.push(cand);
      if (isComplete(k)) C.sfx.place();
      return true;
    }

    function onMove(e) {
      if (!drag) return;
      const c = cellFromEvent(e);
      if (c < 0 || c === drag.lastCell) return;
      // déplacements rapides : on interpole case par case en ligne droite
      const p = paths[drag.color];
      let from = g.cellOf(p[p.length - 1]);
      const tr = Math.floor(c / n), tc = c % n;
      const [ddr, ddc] = delta(from, c);
      if (Math.abs(ddr) + Math.abs(ddc) === 1) stepTo(c);
      let guard = 0;
      while (from !== c && guard++ < 2 * n) {
        const q0 = paths[drag.color];
        from = g.cellOf(q0[q0.length - 1]);
        if (from === c) break;
        const fr = Math.floor(from / n), fc = from % n;
        let next;
        if (fr !== tr && (fc === tc || Math.abs(tr - fr) >= Math.abs(tc - fc))) next = (fr + Math.sign(tr - fr)) * n + fc;
        else next = fr * n + fc + Math.sign(tc - fc);
        if (!stepTo(next)) break;
        const q = paths[drag.color];
        from = g.cellOf(q[q.length - 1]);
      }
      drag.lastCell = c;
      applyCuts();
      draw();
      api.onChange();
    }

    function onUp() {
      if (!drag) return;
      const changed = JSON.stringify(drag.snapshot) !== JSON.stringify(paths);
      if (!changed) history.pop();
      drag = null;
      draw();
      api.onChange();
      checkWin();
    }

    function checkWin() {
      for (let k = 0; k < K; k++) if (!isComplete(k)) return;
      const own = owners();
      for (let v = 0; v < g.nodeCount; v++) if (own[v] < 0) return;
      api.onWin();
    }

    function center(node) {
      const c = g.cellOf(node);
      return [(c % n + 0.5) * cell, (Math.floor(c / n) + 0.5) * cell];
    }

    function css(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

    function draw() {
      const bg = css('--board') || '#fbf7ef';
      const line = css('--grid-line') || '#e2d9c8';
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);

      const own = owners();
      // teinte des cases remplies
      for (let c = 0; c < n * n; c++) {
        if (g.bridgeIdx.has(c)) continue;
        if (own[c] >= 0) {
          ctx.fillStyle = COLORS[own[c]] + '22';
          ctx.fillRect((c % n) * cell, Math.floor(c / n) * cell, cell, cell);
        }
      }
      // grille
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      for (let i = 0; i <= n; i++) {
        const x = Math.round(i * cell) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(size, x); ctx.stroke();
      }
      // ponts vides : petits rails
      puzzle.bridges.forEach((b) => {
        const x = (b % n) * cell, y = Math.floor(b / n) * cell;
        ctx.strokeStyle = css('--faint') || '#d8dcdb';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, cell * 0.05);
        const m = cell * 0.22;
        ctx.beginPath();
        ctx.moveTo(x + m, y + cell * 0.3); ctx.lineTo(x + cell - m, y + cell * 0.3);
        ctx.moveTo(x + m, y + cell * 0.7); ctx.lineTo(x + cell - m, y + cell * 0.7);
        ctx.stroke();
      });

      // Tore : flèches des tunnels sur les bords
      // Tore : petits demi-cercles aux bords, comme des ouvertures
      if (wrap) {
        ctx.fillStyle = css('--faint') || '#d8dcdb';
        const t = Math.max(3, cell * 0.07);
        for (let k = 0; k < n; k++) {
          const m = (k + 0.5) * cell;
          [[m, 0], [m, size], [0, m], [size, m]].forEach(([x, y]) => {
            ctx.beginPath(); ctx.arc(x, y, t, 0, Math.PI * 2); ctx.fill();
          });
        }
      }

      const lw = cell * 0.26;
      const strokePath = (p, k) => {
        if (p.length < 2) return;
        ctx.strokeStyle = COLORS[k];
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        p.forEach((v, i) => {
          const [x, y] = center(v);
          if (i === 0) { ctx.moveTo(x, y); return; }
          const prev = g.cellOf(p[i - 1]), cur = g.cellOf(v);
          const [px, py] = center(p[i - 1]);
          const jumpX = Math.abs((cur % n) - (prev % n)) === n - 1;
          const jumpY = Math.abs(Math.floor(cur / n) - Math.floor(prev / n)) === n - 1;
          if (wrap && (jumpX || jumpY)) {
            // sortie par un bord, entrée par le bord opposé
            const ex = jumpX ? (x < px ? size : 0) : px, ey = jumpY ? (y < py ? size : 0) : py;
            ctx.lineTo(ex, ey);
            ctx.moveTo(jumpX ? size - ex : x, jumpY ? size - ey : y);
          }
          ctx.lineTo(x, y);
        });
        ctx.stroke();
      };
      paths.forEach(strokePath);

      // tuyaux horizontaux redessinés par-dessus aux ponts, avec une ombre
      puzzle.bridges.forEach((b) => {
        const k = own[b];
        if (k < 0) return;
        const [x, y] = center(b);
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = bg;
        ctx.lineWidth = lw + cell * 0.14;
        ctx.beginPath(); ctx.moveTo(x - cell * 0.32, y); ctx.lineTo(x + cell * 0.32, y); ctx.stroke();
        ctx.strokeStyle = COLORS[k];
        ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x - cell * 0.5, y); ctx.lineTo(x + cell * 0.5, y); ctx.stroke();
        ctx.restore();
      });

      // extrémités
      puzzle.endpoints.forEach(([a, b], k) => {
        [a, b].forEach((v) => {
          const [x, y] = center(v);
          ctx.fillStyle = COLORS[k];
          ctx.beginPath(); ctx.arc(x, y, cell * 0.3, 0, Math.PI * 2); ctx.fill();
          if (isComplete(k)) {
            ctx.fillStyle = 'rgba(255,255,255,.85)';
            ctx.beginPath(); ctx.arc(x, y, cell * 0.08, 0, Math.PI * 2); ctx.fill();
          }
        });
      });
    }

    function status() {
      const done = paths.filter((_, k) => isComplete(k)).length;
      const own = owners();
      let filled = 0;
      for (let v = 0; v < g.nodeCount; v++) if (own[v] >= 0) filled++;
      return 'Tuyaux ' + done + '/' + K + ' · Rempli ' + Math.round((100 * filled) / g.nodeCount) + ' %';
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', resize);
    resize();

    return {
      status,
      undo() {
        if (!history.length) return;
        paths = history.pop();
        draw(); api.onChange();
      },
      reset() {
        history.push(paths.map((p) => p.slice()));
        paths = Array.from({ length: K }, () => []);
        draw(); api.onChange();
      },
      hint() {
        // Pose le premier tuyau qui ne correspond pas à la solution.
        for (let k = 0; k < K; k++) {
          const sol = puzzle.solution[k];
          const same = JSON.stringify(paths[k]) === JSON.stringify(sol) ||
            JSON.stringify(paths[k]) === JSON.stringify(sol.slice().reverse());
          if (same) continue;
          history.push(paths.map((p) => p.slice()));
          drag = { color: k, snapshot: paths.map((p) => p.slice()) };
          paths[k] = sol.slice();
          applyCuts();
          drag = null;
          draw(); api.onChange(); checkWin();
          return true;
        }
        return false;
      },
      redraw: draw,
      destroy() { window.removeEventListener('resize', resize); }
    };
  }

  C.register({
    id: 'flux',
    name: 'Flux',
    tagline: 'Relie les couleurs, traverse les ponts',
    accent: '#4da3ff',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M2 3h6v6H2zM16 15h6v6h-6zM8 5h6v2H8zM12 7h2v10h-2zM12 15h4v2h-4z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Ponts', desc: 'Les tuyaux se croisent sur les ponts.' },
      { id: 'tore', name: 'Tore', desc: 'Les bords communiquent : sors à droite, reviens à gauche.' }
    ],
    rules: {
      classic: [
        'Relie chaque paire de carrés de même couleur par un tuyau.',
        'Les tuyaux ne se croisent pas, sauf sur un <b>pont</b> : un tuyau le traverse à l\'horizontale, un autre à la verticale.',
        'Remplis <b>toute</b> la grille pour gagner.'
      ],
      tore: [
        'Relie chaque paire de carrés de même couleur et remplis toute la grille.',
        'La grille est un <b>tore</b> : un tuyau qui sort par un bord ressort par le bord opposé, comme dans un tunnel.',
        'Pour passer le tunnel, fais glisser ton doigt juste au-delà du bord.'
      ]
    },
    params,
    generate,
    create
  });
})();
