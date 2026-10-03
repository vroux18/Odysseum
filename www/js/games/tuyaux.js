// Tuyaux : chaque pièce tourne d'un quart de tour quand on la touche.
// But : raccorder tout le réseau à la source, sans aucun tuyau qui fuit.
// Variante Tore : les tuyaux peuvent passer d'un bord à l'autre.
(function () {
  'use strict';
  const C = window.Carnet;

  // directions : 1 = haut, 2 = droite, 4 = bas, 8 = gauche
  const DIRS = [[1, -1, 0, 4], [2, 0, 1, 8], [4, 1, 0, 1], [8, 0, -1, 2]]; // bit, dr, dc, bit opposé
  const rot = (m) => ((m << 1) | (m >> 3)) & 15; // un quart de tour horaire

  function neighbor(n, wrap, i, dr, dc) {
    let r = Math.floor(i / n) + dr, c = (i % n) + dc;
    if (wrap) { r = (r + n) % n; c = (c + n) % n; } else if (r < 0 || c < 0 || r >= n || c >= n) return -1;
    return r * n + c;
  }

  // arbre couvrant aléatoire (Prim) : un réseau sans boucle qui passe par toutes les cases
  function generate(rng, p) {
    const n = p.n, wrap = p.variant === 'tore';
    const mask = new Uint8Array(n * n);
    const src = Math.floor(n / 2) * n + Math.floor(n / 2);
    const inTree = new Uint8Array(n * n);
    inTree[src] = 1;
    const frontier = [];
    const addEdges = (i) => DIRS.forEach(([bit, dr, dc, opp]) => {
      const j = neighbor(n, wrap, i, dr, dc);
      if (j >= 0 && !inTree[j]) frontier.push([i, j, bit, opp]);
    });
    addEdges(src);
    while (frontier.length) {
      const [i, j, bit, opp] = frontier.splice(rng.int(frontier.length), 1)[0];
      if (inTree[j]) continue;
      // on évite les croix (4 sorties) : peu intéressantes à tourner
      if ([1, 2, 4, 8].filter((b) => mask[i] & b).length >= 3 && rng() < 0.85) { frontier.push([i, j, bit, opp]); continue; }
      mask[i] |= bit; mask[j] |= opp;
      inTree[j] = 1;
      addEdges(j);
    }
    // on mélange l'orientation de chaque pièce
    const turns = new Uint8Array(n * n);
    let changed = 0;
    for (let i = 0; i < n * n; i++) {
      turns[i] = rng.int(4);
      let m = mask[i];
      for (let t = 0; t < turns[i]; t++) m = rot(m);
      if (m !== mask[i]) changed++;
    }
    if (!changed) turns[0] = (turns[0] + 1) % 4;
    return { n, variant: p.variant, wrap, src, solution: Array.from(mask), turns: Array.from(turns) };
  }

  function params(level, variant) {
    const n = Math.min(9, (variant === 'tore' ? 5 : 4) + Math.floor((level - 1) / 5));
    return { n, variant };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n, wrap = puzzle.wrap;
    // état : masque courant de chaque pièce (la solution tournée de `turns` quarts de tour)
    let cur = puzzle.solution.map((m, i) => { let x = m; for (let t = 0; t < puzzle.turns[i]; t++) x = rot(x); return x; });
    const history = [];
    // rotation visuelle fluide : chaque pièce garde l'angle restant au moment du toucher et l'heure de départ ;
    // l'angle restant décroît avec une courbe douce et un très léger rebond à l'arrivée
    const SPIN = 260; // durée d'un quart de tour, en ms
    const spinFrom = new Float32Array(n * n), spinT0 = new Float64Array(n * n);
    const glow = new Float32Array(n * n); // remplissage visuel (0 à 1) de chaque pièce
    const easeOutBack = (x) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    function remaining(i, now) {
      if (!spinFrom[i]) return 0;
      const k = (now - spinT0[i]) / SPIN;
      if (k >= 1) { spinFrom[i] = 0; return 0; }
      return spinFrom[i] * (1 - easeOutBack(k));
    }
    function spin(i) { const now = performance.now(); spinFrom[i] = remaining(i, now) + 1; spinT0[i] = now; }
    let won = false, raf = 0;

    const canvas = document.createElement('canvas');
    canvas.className = 'board-canvas';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let size = 0, cell = 0, pad = 0;

    function resize() {
      const w = Math.min(host.clientWidth, host.clientHeight || Infinity, 520, (puzzle.n || 6) * 76); // cases jamais trop grosses
      // plateau zoomé (C.boardZoom) : plus de pixels pour rester net
      const dpr = Math.min(6, (window.devicePixelRatio || 1) * (C.boardZoom || 1));
      size = w; pad = wrap ? w * 0.05 : 0; cell = (w - pad * 2) / n;
      canvas.style.width = w + 'px'; canvas.style.height = w + 'px';
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    // pièces reliées à la source (par des ouvertures qui se font face)
    function powered() {
      const on = new Uint8Array(n * n);
      const stack = [puzzle.src];
      on[puzzle.src] = 1;
      while (stack.length) {
        const i = stack.pop();
        DIRS.forEach(([bit, dr, dc, opp]) => {
          if (!(cur[i] & bit)) return;
          const j = neighbor(n, wrap, i, dr, dc);
          if (j >= 0 && !on[j] && (cur[j] & opp)) { on[j] = 1; stack.push(j); }
        });
      }
      return on;
    }

    function solved() {
      for (let i = 0; i < n * n; i++) {
        for (const [bit, dr, dc, opp] of DIRS) {
          if (!(cur[i] & bit)) continue;
          const j = neighbor(n, wrap, i, dr, dc);
          if (j < 0 || !(cur[j] & opp)) return false; // tuyau qui fuit
        }
      }
      return powered().every((v) => v); // tout est relié à la source
    }

    // lu sur l'hôte : la teinte du jeu (--game) est posée sur l'écran de partie
    const css = (v) => getComputedStyle(host).getPropertyValue(v).trim();

    // mélange de deux couleurs #rrggbb (k = part de b) : remplissage opaque, sans taches aux raccords
    const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c); if (!m) return null; const v = parseInt(m[1], 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
    const mix = (a, b, k) => { const A = hex(a), B = hex(b); if (!A || !B) return a; return 'rgb(' + A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(',') + ')'; };

    function draw() {
      const frameNow = performance.now();
      const accent = css('--game') || '#d18fc4';
      const outline = css('--ink') || '#d8d4cc'; // trait fin et clair, comme un dessin au trait
      const bg = css('--bg') || '#161b22';
      const on = powered();
      ctx.clearRect(0, 0, size, size);
      // Tore : petites marques aux bords, là où les tuyaux traversent
      if (wrap) {
        ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
        for (let k = 0; k < n; k++) {
          const m = pad + (k + 0.5) * cell;
          [[m, pad * 0.25, m, pad * 0.75], [m, size - pad * 0.75, m, size - pad * 0.25], [pad * 0.25, m, pad * 0.75, m], [size - pad * 0.75, m, size - pad * 0.25, m]]
            .forEach(([x1, y1, x2, y2]) => { ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); });
        }
        ctx.setLineDash([]);
      }
      const w = cell * 0.3;                 // tuyaux larges et creux
      const lw = Math.max(2, cell * 0.045); // contour plus épais et plus clair // épaisseur du contour
      for (let i = 0; i < n * n; i++) {
        const cx = pad + ((i % n) + 0.5) * cell, cy = pad + (Math.floor(i / n) + 0.5) * cell;
        const m = cur[i];
        const deg = [1, 2, 4, 8].filter((b) => m & b).length;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-remaining(i, frameNow) * Math.PI / 2); // la pièce finit de tourner
        const arms = [];
        DIRS.forEach(([bit, dr, dc]) => { if (m & bit) arms.push([dc, dr]); });
        // l'eau arrive en douceur : le niveau de remplissage glisse vers 0 ou 1
        // l'eau avance de proche en proche : une pièce ne se remplit que quand une voisine raccordée est déjà pleine
        let feed = i === puzzle.src;
        if (on[i] && !feed) DIRS.forEach(([bit, dr, dc, opp]) => {
          if (feed || !(m & bit)) return;
          const j = neighbor(n, wrap, i, dr, dc);
          if (j >= 0 && (cur[j] & opp) && glow[j] > 0.75) feed = true;
        });
        if (on[i] && feed) glow[i] += (1 - glow[i]) * 0.085; // remplissage lent, qui coule
        else if (!on[i]) glow[i] += (0 - glow[i]) * 0.14;
        if (Math.abs((on[i] ? 1 : 0) - glow[i]) < 0.02) glow[i] = on[i] ? 1 : 0;
        const lit = glow[i] > 0.5;
        // tuyau « creux » : un trait épais (contour) puis un trait plus fin (intérieur)
        const half = cell * 0.5;
        const stroke = (width, color) => {
          ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
          const bent = arms.length === 2 && (arms[0][0] !== -arms[1][0] || arms[0][1] !== -arms[1][1]);
          if (bent) {
            // coude : un seul tracé, l'angle extérieur s'arrondit
            ctx.beginPath();
            ctx.moveTo(arms[0][0] * half, arms[0][1] * half);
            ctx.arcTo(0, 0, arms[1][0] * half, arms[1][1] * half, cell * 0.1);
            ctx.lineTo(arms[1][0] * half, arms[1][1] * half);
            ctx.stroke();
            return;
          }
          // (on dépasse d'un demi-pixel du bord de la case : pas de couture visible avec la voisine)
          arms.forEach(([dx, dy]) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * (half + 0.6), dy * (half + 0.6)); ctx.stroke(); });
          // jonctions en T ou en croix : chaque angle rentrant s'arrondit (congé), comme un vrai raccord moulé
          if (arms.length >= 3) {
            for (let a = 0; a < arms.length; a++) for (let b = a + 1; b < arms.length; b++) {
              const [ax, ay] = arms[a], [bx, by] = arms[b];
              if (ax * bx + ay * by !== 0) continue; // seulement les bras perpendiculaires
              ctx.beginPath();
              ctx.moveTo(ax * half, ay * half);
              ctx.arcTo(0, 0, bx * half, by * half, cell * 0.36);
              ctx.lineTo(bx * half, by * half);
              ctx.stroke();
            }
          }
          // terminal : un rond, dont l'anneau extérieur reste visible (le tracé large dépasse le fin)
          const r = deg === 1 ? cell * 0.3 + (width - w) / 2 : width / 2;
          ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        };
        ctx.globalAlpha = 0.92;
        stroke(w + lw * 2, outline);
        ctx.globalAlpha = 1;
        stroke(w, bg);
        if (glow[i] > 0) { // l'eau remplit l'intérieur du tuyau (teinte opaque qui monte), le contour reste visible
          stroke(w, mix(bg, accent, glow[i] * 0.85));
        }
        if (i === puzzle.src) { // la source : pleine, avec un œil
          ctx.beginPath(); ctx.arc(0, 0, cell * 0.3 + lw, 0, Math.PI * 2); ctx.globalAlpha = 0.92; ctx.fillStyle = outline; ctx.fill(); ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(0, 0, cell * 0.3, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, cell * 0.11 + lw, 0, Math.PI * 2); ctx.globalAlpha = 0.92; ctx.fillStyle = outline; ctx.fill(); ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(0, 0, cell * 0.11, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill(); // l'œil de la source brille
        } else if (deg === 1 && glow[i] > 0) { // terminal alimenté : la tête s'allume en blanc à mesure que l'eau arrive
          ctx.beginPath(); ctx.arc(0, 0, cell * 0.3, 0, Math.PI * 2); ctx.fillStyle = mix(accent, '#fffaf0', Math.min(1, glow[i])); ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, cell * 0.1, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.globalAlpha = Math.min(1, glow[i]); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
    }

    function animate() {
      draw();
      const on = powered();
      const fading = glow.some((v, i) => v !== (on[i] ? 1 : 0));
      raf = spinFrom.some((v) => v) || fading ? requestAnimationFrame(animate) : 0;
    }

    function turn(i) {
      if (won) return;
      history.push(cur.slice());
      cur[i] = rot(cur[i]);
      spin(i);
      if (!raf) raf = requestAnimationFrame(animate);
      C.sfx.tap();
      check();
    }

    function check() {
      if (solved()) { won = true; draw(); api.onWin(); }
    }

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) * (size / rect.width) - pad, y = (e.clientY - rect.top) * (size / rect.height) - pad;
      const c = Math.floor(x / cell), r = Math.floor(y / cell);
      if (r >= 0 && c >= 0 && r < n && c < n) turn(r * n + c);
    });
    window.addEventListener('resize', resize);
    resize();
    raf = requestAnimationFrame(animate); // le réseau déjà relié se colore en douceur

    // la bonne orientation d'une pièce (les pièces symétriques ont plusieurs bonnes positions)
    const correct = (i) => cur[i] === puzzle.solution[i];

    // Déductions sur les orientations, comme le ferait un joueur : une sortie ne donne jamais dans le vide,
    // une pièce se raccorde à une voisine qui pointe vers elle, ne vise pas une voisine qui lui tourne le dos,
    // et deux bouts ne se branchent pas l'un sur l'autre. fixedAt : ordre dans lequel chaque pièce se fixe.
    function deduce() {
      const N = n * n, shapes = puzzle.solution;
      const deg = (m) => [1, 2, 4, 8].filter((b) => m & b).length;
      const cand = shapes.map((m) => { const out = []; let x = m; for (let t = 0; t < 4; t++) { if (!out.includes(x)) out.push(x); x = rot(x); } return out; });
      const fixedAt = new Int32Array(N).fill(-1);
      const acc = Array.from({ length: N }, () => ({ borders: new Set(), open: new Set(), closed: new Set(), leaf: new Set() }));
      const side = (j, bit) => { let a = 0, b = 0; cand[j].forEach((m) => { if (m & bit) a++; else b++; }); return b === 0 ? 1 : a === 0 ? 0 : -1; };
      let step = 0;
      for (let i = 0; i < N; i++) if (cand[i].length === 1) fixedAt[i] = step++;
      let changed = true, guard = 0;
      while (changed && guard++ < 200) {
        changed = false;
        for (let i = 0; i < N; i++) {
          if (cand[i].length === 1) continue;
          const used = acc[i];
          const keep = cand[i].filter((m) => DIRS.every(([bit, dr, dc, opp]) => {
            const j = neighbor(n, wrap, i, dr, dc);
            if (j < 0) { if (m & bit) { used.borders.add(bit); return false; } return true; }
            const s = side(j, opp);
            if (s === 1 && !(m & bit)) { used.open.add(j); return false; }
            if (s === 0 && (m & bit)) { used.closed.add(j); return false; }
            if ((m & bit) && N > 2 && deg(shapes[i]) === 1 && deg(shapes[j]) === 1) { used.leaf.add(j); return false; }
            return true;
          }));
          if (keep.length && keep.length < cand[i].length) {
            cand[i] = keep; changed = true;
            if (keep.length === 1) fixedAt[i] = step++;
          }
        }
      }
      const reasons = acc.map((a) => ({ borders: [...a.borders], open: [...a.open], closed: [...a.closed], leaf: [...a.leaf] }));
      return { fixedAt, reasons };
    }

    return {
      status() { return ''; },
      undo() { if (history.length) { cur = history.pop(); draw(); api.onChange(); } },
      reset() {
        history.push(cur.slice());
        cur = puzzle.solution.map((m, i) => { let x = m; for (let t = 0; t < puzzle.turns[i]; t++) x = rot(x); return x; });
        draw(); api.onChange();
      },
      hint() {
        if (won) return false;
        const { fixedAt, reasons } = deduce();
        const wrongs = [];
        for (let i = 0; i < n * n; i++) if (!correct(i)) wrongs.push(i);
        if (!wrongs.length) return false;
        // la pièce fausse qui se déduit le plus tôt, sinon un coup de pouce
        const ded = wrongs.filter((i) => fixedAt[i] >= 0).sort((a, b) => fixedAt[a] - fixedAt[b]);
        const i = ded.length ? ded[0] : wrongs[0];
        history.push(cur.slice());
        cur[i] = puzzle.solution[i];
        spin(i);
        if (!raf) raf = requestAnimationFrame(animate);
        check();
        // surlignage : la pièce, les bords et les voisines qui imposent son orientation
        const x0 = (k) => pad + (k % n) * cell, y0 = (k) => pad + Math.floor(k / n) * cell;
        const boxes = [{ x: x0(i) + 2, y: y0(i) + 2, w: cell - 4, h: cell - 4, kind: 'where' }];
        let text;
        if (ded.length) {
          const rs = reasons[i], parts = [];
          const t = Math.max(4, cell * 0.08);
          rs.borders.forEach((bit) => {
            const x = x0(i), y = y0(i);
            boxes.push(bit === 1 ? { x, y: y - t / 2, w: cell, h: t } : bit === 4 ? { x, y: y + cell - t / 2, w: cell, h: t }
              : bit === 8 ? { x: x - t / 2, y, w: t, h: cell } : { x: x + cell - t / 2, y, w: t, h: cell });
            boxes[boxes.length - 1].line = true;
          });
          rs.open.concat(rs.closed, rs.leaf).forEach((j) => boxes.push({ x: x0(j) + 3, y: y0(j) + 3, w: cell - 6, h: cell - 6 }));
          if (rs.borders.length) parts.push('ne s\'ouvre pas vers le bord (trait doré)');
          if (rs.open.length) parts.push('doit rejoindre ' + (rs.open.length > 1 ? 'les voisines qui pointent' : 'la voisine qui pointe') + ' vers elle');
          if (rs.closed.length) parts.push('ne vise pas ' + (rs.closed.length > 1 ? 'les voisines qui lui tournent' : 'la voisine qui lui tourne') + ' le dos');
          if (rs.leaf.length) parts.push('ne se branche pas sur un autre bout de tuyau');
          // deux raisons au plus dans la phrase, pour rester courte (toutes restent surlignées)
          const two = parts.slice(0, 2);
          const list = two.length > 1 ? two[0] + ' et ' + two[1] : two[0] || 'n\'a qu\'une position possible';
          const lit = rs.open.length + rs.closed.length + rs.leaf.length ? ' (voisines surlignées)' : '';
          text = 'La pièce dorée ' + list + lit + '. Une seule position convient.';
        } else {
          text = 'Coup de pouce : pas de déduction simple ici, alors je tourne la pièce dorée dans le bon sens.';
        }
        return Object.assign({ text }, C.hintBoxes(canvas, boxes));
      },
      solve() { history.push(cur.slice()); cur = puzzle.solution.slice(); if (!raf) raf = requestAnimationFrame(animate); check(); },
      redraw: draw,
      resize, // (zoom du plateau : redessin net à la nouvelle échelle)
      destroy() { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); }
    };
  }

  C.register({
    id: 'tuyaux',
    name: 'Tuyaux',
    tagline: 'Raccorde tout le réseau',
    accent: '#d18fc4',
    icon: '',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Raccorde toutes les pièces à la source.' },
      { id: 'tore', name: 'Tore', desc: 'Les tuyaux peuvent passer d\'un bord à l\'autre.' }
    ],
    rules: {
      classic: [
        'Touche une pièce pour la faire <b>tourner</b> d\'un quart de tour.',
        'Relie <b>toutes les pièces</b> à la source : l\'eau coule dans chaque tuyau bien raccordé.',
        'Aucun tuyau ne doit rester ouvert dans le vide.'
      ],
      tore: [
        'Touche une pièce pour la faire <b>tourner</b> d\'un quart de tour.',
        'Les tuyaux peuvent <b>sortir par un bord</b> et revenir par le bord opposé (petits tirets).',
        'Relie toutes les pièces à la source, sans tuyau ouvert : l\'eau doit couler partout.'
      ]
    },
    params,
    generate,
    create
  });
})();
