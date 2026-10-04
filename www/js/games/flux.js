// Flux : relier les points de même couleur, remplir toute la grille.
// Les cases « pont » laissent deux tuyaux se croiser (un horizontal, un vertical).
(function () {
  'use strict';
  const C = window.Carnet;

  // pastels posés, assez distincts les uns des autres
  const COLORS = ['#d0714a', '#4f8fd0', '#d9a441', '#7f9a46', '#8f7fc8', '#e08a3c',
    '#3d9d90', '#c06474', '#a9b85a', '#5f7fd0', '#c9a23a', '#9c7a5c'];

  const GLYPHS =['●', '▲', '■', '◆', '★', '✚', '♥', '✿', '◐', '✕', '☾', '◇'];
  const DIRS =[[-1, 0], [1, 0], [0, -1], [0, 1]]; // haut, bas, gauche, droite

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
  function hamiltonian(g, rng, attempts) {
    // Beaucoup d'essais courts valent mieux que de longues recherches.
    for (let attempt = 0; attempt < (attempts || 300); attempt++) {
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

  function parityOk(n, bridges) {
    let d = (n * n) % 2; // cases « paires » (r + c pair) moins cases impaires
    bridges.forEach((c) => { d += (Math.floor(c / n) + (c % n)) % 2 ? -1 : 1; });
    return Math.abs(d) <= 1;
  }

  function generate(rng, p) {
    if (!p.easy) return generateOne(rng, p);
    // premiers niveaux : on garde une grille qui se trace entièrement par passages forcés
    // (les deux premières règles de l'indice), sans jamais de coup de pouce
    let last = null;
    for (let t = 0; t < 300; t++) { // (un essai coûte moins d'une milliseconde sur ces petites grilles)
      last = generateOne(rng, p);
      if (forcedSolvable(last)) return last;
    }
    return last;
  }

  // Simule les règles 1 et 2 de hint() depuis une grille vide : vrai si elles suffisent à tout tracer.
  function forcedSolvable(pz) {
    const g = buildGraph(pz.n, pz.bridges, pz.variant === 'tore');
    const K = pz.endpoints.length;
    const endpointColor = new Int16Array(g.nodeCount).fill(-1);
    pz.endpoints.forEach(([a, b], k) => { endpointColor[a] = k; endpointColor[b] = k; });
    const paths = Array.from({ length: K }, () => []);
    const owner = new Int16Array(g.nodeCount).fill(-1);
    const complete = (k) => { const p = paths[k]; return p.length > 1 && endpointColor[p[p.length - 1]] === k && p[0] !== p[p.length - 1]; };
    const set = (k, list) => { paths[k].forEach((v) => { owner[v] = -1; }); paths[k] = list.slice(); list.forEach((v) => { owner[v] = k; }); };
    const taken = (v, k) => (endpointColor[v] >= 0 && endpointColor[v] !== k) || (owner[v] >= 0 && owner[v] !== k);
    for (let guard = 0; guard < g.nodeCount * 2; guard++) {
      const todo = [...Array(K).keys()].filter((k) => !complete(k));
      if (!todo.length) return true;
      const two = todo.find((k) => pz.solution[k].length === 2);
      if (two !== undefined) { set(two, pz.solution[two]); continue; }
      // comme hint() : parmi tous les passages forcés, celui qui avance le plus
      let best = null;
      for (const k of todo) {
        const sol = pz.solution[k];
        const starts = paths[k].length ? [paths[k][0]] : pz.endpoints[k];
        for (const start of starts) {
          const ref = sol[0] === start ? sol : sol.slice().reverse();
          const pre = paths[k].length ? paths[k] : [start];
          const chain = pre.slice(), seen = new Set(pre);
          for (;;) {
            const v = chain[chain.length - 1];
            const free = g.adj[v].filter((w) => !seen.has(w) && !taken(w, k));
            if (free.length !== 1) break;
            chain.push(free[0]); seen.add(free[0]);
            if (endpointColor[free[0]] === k) break;
          }
          if (chain.length <= pre.length || chain.some((v, i) => ref[i] !== v)) continue;
          const gain = chain.length - pre.length;
          if (!best || gain > best.gain) best = { k, chain, gain };
        }
      }
      if (!best) return false;
      set(best.k, best.chain);
    }
    return false;
  }

  function generateOne(rng, p) {
    for (let tries = 0; tries < 40; tries++) {
      let bridges = chooseBridges(p.n, p.bridges, rng);
      // méga : le graphe est biparti (damier) et la seconde moitié d'un pont a la couleur de sa case ;
      // un chemin qui passe partout n'existe que si les deux couleurs s'équilibrent à une case près
      if (p.mega) for (let q = 0; q < 60 && !parityOk(p.n, bridges); q++) bridges = chooseBridges(p.n, p.bridges, rng);
      const g = buildGraph(p.n, bridges, p.variant === 'tore');
      // méga : peu d'essais par jeu de ponts (un mauvais placement de ponts ne se rattrape pas, autant en tirer d'autres)
      let path = hamiltonian(g, rng, p.mega ? 20 : 300);
      if (!path) continue;
      path = backbite(g, path, rng, g.nodeCount * 30);
      let fix = 0;
      while ((g.isBridgeNode(path[0]) || g.isBridgeNode(path[path.length - 1])) && fix++ < 500) {
        backbite(g, path, rng, 5);
      }
      if (g.isBridgeNode(path[0]) || g.isBridgeNode(path[path.length - 1])) continue;

      // Un pont doit être traversé par deux couleurs différentes.
      const bridgeOk = (segs) => bridges.every((b) => {
        const s1 = segs.findIndex((s) => s.includes(b));
        const s2 = segs.findIndex((s) => s.includes(g.vnode(b)));
        return s1 !== s2;
      });
      // méga : plusieurs découpes du même chemin avant d'en chercher un autre (le chemin coûte cher,
      // la découpe presque rien) ; les grilles ordinaires gardent exactement leur tirage d'origine
      let segs = null;
      for (let c = 0; c < (p.mega ? 30 : 1) && !segs; c++) {
        const s = cut(g, path, p.colors, rng);
        if (s && bridgeOk(s)) segs = s;
      }
      if (!segs) continue;
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
    return generateOne(rng, Object.assign({}, p, { bridges: 0 }));
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
    // débuts tout doux : 4×4, puis une rangée de plus tous les 5 niveaux
    // départ très doux : 4×4 à 3 couleurs, la grille grandit tous les 8 niveaux, les ponts n'arrivent qu'au niveau 16
    const n = Math.min(9, 4 + Math.floor((level - 1) / 8));
    let bridges = level < 16 ? 0 : Math.min(3, 1 + Math.floor((level - 16) / 12));
    if (variant === 'tore') bridges = level < 16 ? 0 : 1;
    const colors = Math.max(3, Math.min(COLORS.length, n - 2 + (level % 2)));
    // jusqu'au niveau 12 : grille entièrement traçable par passages forcés (voir forcedSolvable) ;
    // des tuyaux courts (plus de couleurs) se laissent presque tous deviner de proche en proche
    if (level <= 12) {
      const small = level <= 6;
      return { n: small ? 4 : 5, bridges: 0, colors: small ? (level <= 2 ? 5 : 4) : (level <= 8 ? 6 : 5), variant, easy: true };
    }
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
      const w = Math.min(host.clientWidth, host.clientHeight || Infinity, 520, (puzzle.n || 6) * 76); // cases jamais trop grosses // tient dans l'espace libre
      // plateau zoomé (C.boardZoom) : plus de pixels pour rester net
      const dpr = Math.min(6, (window.devicePixelRatio || 1) * (C.boardZoom || 1));
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
    function roundRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    }

    function draw() {
      const bg = css('--bg') || '#f5f2ec';
      const tile = css('--tile') || '#e8e2d8';
      ctx.clearRect(0, 0, size, size);

      const own = owners();
      // cases en tuiles arrondies ; les cases traversées prennent la teinte du tuyau
      const gap = Math.max(2, cell * 0.06), rad = cell * 0.18;
      for (let c = 0; c < n * n; c++) {
        const x = (c % n) * cell + gap / 2, y = Math.floor(c / n) * cell + gap / 2;
        ctx.fillStyle = tile;
        roundRect(ctx, x, y, cell - gap, cell - gap, rad);
        ctx.fill();
        if (!g.bridgeIdx.has(c) && own[c] >= 0) {
          ctx.fillStyle = COLORS[own[c]] + '3a';
          roundRect(ctx, x, y, cell - gap, cell - gap, rad);
          ctx.fill();
        }
      }
      // vraie grille : on recouvre les interstices par un quadrillage foncé continu, cadre arrondi autour
      {
        const ink = css('--k-ink') || '#3a3550', lw = Math.max(1.5, cell * 0.035), S = n * cell;
        ctx.save();
        roundRect(ctx, 0, 0, S, S, rad * 0.7); ctx.clip(); // coins du plateau arrondis
        ctx.fillStyle = tile;
        for (let c = 0; c < n * n; c++) { // combler les interstices entre tuiles
          const x = (c % n) * cell, y = Math.floor(c / n) * cell;
          if (g.bridgeIdx.has(c) || own[c] < 0) { ctx.fillRect(x, y, cell, cell); }
          else { ctx.fillStyle = tile; ctx.fillRect(x, y, cell, cell); ctx.fillStyle = COLORS[own[c]] + '3a'; ctx.fillRect(x, y, cell, cell); ctx.fillStyle = tile; }
        }
        ctx.strokeStyle = ink; ctx.globalAlpha = 0.28; ctx.lineWidth = lw; // lignes intérieures discrètes
        ctx.beginPath();
        for (let k = 1; k < n; k++) { ctx.moveTo(k * cell, 0); ctx.lineTo(k * cell, S); ctx.moveTo(0, k * cell); ctx.lineTo(S, k * cell); }
        ctx.stroke();
        ctx.globalAlpha = 0.85; // cadre extérieur bien net
        roundRect(ctx, lw / 2, lw / 2, S - lw, S - lw, rad * 0.7);
        ctx.lineWidth = lw * 1.4; ctx.stroke();
        ctx.restore();
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
          if (document.documentElement.classList.contains('a11y-cb')) {
            // accessibilité : un symbole par couleur, pour ne pas dépendre des teintes
            ctx.fillStyle = 'rgba(255,255,255,.95)';
            ctx.font = Math.round(cell * 0.32) + 'px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(GLYPHS[k % GLYPHS.length], x, y + 1);
          } else if (isComplete(k)) {
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
        const solOf = (k) => puzzle.solution[k];
        const done = (k) => { const s = JSON.stringify(paths[k]); return s === JSON.stringify(solOf(k)) || s === JSON.stringify(solOf(k).slice().reverse()); };
        const todo = [...Array(K).keys()].filter((k) => !done(k));
        if (!todo.length) return false;
        // nœuds sûrement pris : les tuyaux déjà justes et toutes les extrémités
        const solColor = new Int16Array(g.nodeCount).fill(-1);
        puzzle.solution.forEach((s, k) => s.forEach((v) => { solColor[v] = k; }));
        const taken = (v, k) => {
          if (endpointColor[v] >= 0 && endpointColor[v] !== k) return true;
          return paths.some((p, q) => q !== k && p.includes(v) && solColor[v] === q);
        };
        const cellBox = (node, kind, round) => {
          const c = g.cellOf(node), m = round ? cell * 0.12 : cell * 0.04;
          return { x: (c % n) * cell + m, y: Math.floor(c / n) * cell + m, w: cell - 2 * m, h: cell - 2 * m, kind, round };
        };
        const apply = (k, list) => {
          history.push(paths.map((p) => p.slice()));
          drag = { color: k, snapshot: paths.map((p) => p.slice()) };
          paths[k] = list.slice();
          applyCuts();
          drag = null;
          draw(); api.onChange(); checkWin();
        };
        // (pas de nom de couleur : certaines teintes se ressemblent ; les points cités sont entourés d'or)
        // 1. deux points voisins : on les relie directement
        for (const k of todo) {
          if (solOf(k).length !== 2) continue;
          apply(k, solOf(k));
          return Object.assign({ text: 'Les deux points entourés d\'or sont de la même couleur et se touchent : il suffit de les relier.' },
            C.hintBoxes(canvas, solOf(k).map((v) => cellBox(v, 'where', true))));
        }
        // 2. un point qui n'a qu'une sortie libre : on suit le chemin tant qu'il est forcé
        let best = null;
        for (const k of todo) {
          const sol = solOf(k);
          // un début déjà juste, tracé depuis une extrémité : on ne repart que de celle-là (sinon on l'effacerait)
          const p0 = paths[k], refOf = (s) => (sol[0] === s ? sol : sol.slice().reverse());
          const anchor = p0.length > 1 && puzzle.endpoints[k].includes(p0[0]) && p0[1] === refOf(p0[0])[1] ? p0[0] : -1;
          for (const start of puzzle.endpoints[k]) {
            if (anchor >= 0 && start !== anchor) continue;
            const ref = refOf(start);
            // on repart du bout déjà juste du tuyau tracé par le joueur, s'il y en a un
            const p = paths[k];
            let pre = [start];
            if (p[0] === start) { let m = 0; while (m < p.length && p[m] === ref[m]) m++; if (m > 0) pre = p.slice(0, m); }
            const chain = pre.slice(), seen = new Set(pre);
            let blockers = null;
            if (endpointColor[chain[chain.length - 1]] === k && chain.length > 1) continue;
            for (;;) {
              const v = chain[chain.length - 1];
              const free = g.adj[v].filter((w) => !seen.has(w) && !taken(w, k));
              if (chain.length === pre.length) blockers = g.adj[v].filter((w) => !free.includes(w) && !seen.has(w));
              if (free.length !== 1) break;
              const w = free[0];
              chain.push(w); seen.add(w);
              if (endpointColor[w] === k) break;
            }
            if (chain.length <= pre.length || chain.some((v, i) => ref[i] !== v)) continue;
            const gain = chain.length - pre.length;
            if (!best || gain > best.gain) best = { k, chain, blockers, head: pre[pre.length - 1], fresh: pre.length === 1, gain, pre: pre.length };
          }
        }
        if (best) {
          const { k, chain, blockers, head, fresh, gain } = best;
          const full = endpointColor[chain[chain.length - 1]] === k;
          apply(k, chain);
          // seul le point de départ est entouré : le tuyau tracé se voit déjà (encadrer chaque case brouillait tout,
          // surtout quand le tuyau est jaune comme le surlignage)
          const where = [cellBox(head, 'where', true)];
          const why = (blockers || []).map((v) => cellBox(v, 'why'));
          const corner = fresh && g.adj[head].length < 4 && !wrap;
          const who = fresh ? 'Le point entouré d\'or' : 'Le bout du tuyau, entouré d\'or,';
          const text = who + ' n\'a qu\'une sortie libre' + (corner ? ' : il est contre le bord' + (why.length ? ' et ses autres voisines (surlignées) sont prises' : '') : why.length ? ' : ses autres voisines (surlignées) sont prises' : '') +
            '. ' + (full ? 'Le tuyau suit les passages forcés jusqu\'à son autre point.' : 'Le tuyau avance donc ' + (gain > 1 ? 'de ' + gain + ' cases, toutes forcées.' : 'd\'une case.'));
          return Object.assign({ text }, C.hintBoxes(canvas, why.concat(where)));
        }
        // 3. pas de passage forcé : coup de pouce, le tuyau le plus court
        const k = todo.slice().sort((a, b) => solOf(a).length - solOf(b).length)[0];
        apply(k, solOf(k));
        const ends = puzzle.endpoints[k];
        return Object.assign({ text: 'Coup de pouce : rien n\'est forcé pour l\'instant. Voici le tuyau le plus court qui reste, entre les deux points entourés d\'or.' },
          C.hintBoxes(canvas, ends.map((v) => cellBox(v, 'where', true))));
      },
      redraw: draw,
      resize, // (zoom du plateau : redessin net à la nouvelle échelle)
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
        'Glisse le doigt d\'un point à l\'autre pour relier chaque paire de <b>points de même couleur</b>.',
        'Les tuyaux ne se croisent pas, sauf sur un <b>pont</b> : l\'un passe à l\'horizontale, l\'autre à la verticale.',
        'Remplis <b>toute</b> la grille pour gagner.'
      ],
      tore: [
        'Glisse le doigt d\'un point à l\'autre pour relier chaque paire de <b>points de même couleur</b>, et remplis toute la grille.',
        'Les bords communiquent : un tuyau qui sort par un bord <b>ressort par le bord opposé</b>, comme dans un tunnel.',
        'Pour passer, glisse le doigt juste au-delà du bord.'
      ]
    },
    params,
    generate,
    create
  });
})();
