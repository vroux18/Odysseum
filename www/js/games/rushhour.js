// Port (Rush Hour) : le navire d'Ulysse doit quitter un port encombré.
// Grille 6×6, la passe s'ouvre sur le bord droit de la 3e rangée.
// Chaque bateau ne glisse que dans son axe ; on ne peut pas les faire se chevaucher.
// Génération : placement aléatoire, puis exploration complète (BFS) de toutes les
// positions atteignables ; on garde une position dont la solution la plus courte
// tombe dans la fourchette de difficulté du niveau.
(function () {
  'use strict';
  const C = window.Carnet;

  const N = 6, EXIT = 2; // rangée de la sortie (3e rangée)
  const GOAL = N - 2;    // colonne du navire quand il touche la passe

  // couleurs des barques, avec leur nom (au féminin : « la barque verte »)
  const COLORS = [
    { c: '#79b27a', n: 'verte' }, { c: '#6b9bd6', n: 'bleue' }, { c: '#e3bd52', n: 'jaune' },
    { c: '#9a85c9', n: 'violette' }, { c: '#e397b2', n: 'rose' }, { c: '#3fa89e', n: 'turquoise' },
    { c: '#e8925a', n: 'orange' }, { c: '#98a1a7', n: 'grise' }, { c: '#a87c5a', n: 'brune' },
    { c: '#c2a3dc', n: 'lilas' }, { c: '#a2a855', n: 'olive' }, { c: '#c99a48', n: 'ocre' }
  ];
  const HERO = '#c4473a', GOLD = '#ecc56c';
  const DIST = ['', 'd\'une case', 'de deux cases', 'de trois cases', 'de quatre cases'];

  // ------------------------------------------------------------------
  // Moteur : un état = la position (0 à 4) de chaque bateau le long de son axe.
  // ------------------------------------------------------------------
  function makeSolver(boats) {
    const B = boats.length;
    const len = boats.map((b) => b.len), hor = boats.map((b) => b.hor), line = boats.map((b) => b.line);
    const occ = new Uint8Array(N * N);
    function fill(s) {
      occ.fill(255);
      for (let i = 0; i < B; i++) {
        for (let k = 0; k < len[i]; k++) occ[hor[i] ? line[i] * N + s[i] + k : (s[i] + k) * N + line[i]] = i;
      }
    }
    // limites de glissement d'un bateau (l'occupation doit être à jour)
    function range(s, i) {
      let lo = s[i], hi = s[i];
      if (hor[i]) {
        const row = line[i] * N;
        while (lo > 0 && occ[row + lo - 1] === 255) lo--;
        while (hi + len[i] < N && occ[row + hi + len[i]] === 255) hi++;
      } else {
        const col = line[i];
        while (lo > 0 && occ[(lo - 1) * N + col] === 255) lo--;
        while (hi + len[i] < N && occ[(hi + len[i]) * N + col] === 255) hi++;
      }
      return [lo, hi];
    }
    // chaque coup possible : un bateau glisse d'une ou plusieurs cases (un coup = un glissement)
    function each(s, cb) {
      fill(s);
      for (let i = 0; i < B; i++) {
        const [lo, hi] = range(s, i);
        for (let q = lo; q <= hi; q++) if (q !== s[i]) cb(i, q);
      }
    }
    function key(s) { let k = 0; for (let i = B - 1; i >= 0; i--) k = k * 5 + s[i]; return k; }
    return { B, fill, range, each, key, occ };
  }

  // ------------------------------------------------------------------
  // Moteur rapide pour la génération et les indices : un état tient dans un entier
  // (chiffre en base 5 = position de chaque bateau, 13 bateaux au plus), table de
  // hachage maison, voisins calculés à la volée (clé voisine = clé ± écart × 5^i).
  // ------------------------------------------------------------------
  const MAXB = 13;
  const POW5 = [1]; for (let i = 1; i <= MAXB; i++) POW5.push(POW5[i - 1] * 5);
  const HBITS = 14, HSIZE = 1 << HBITS, HMASK = HSIZE - 1;
  const hKeys = new Int32Array(HSIZE), hIdx = new Int32Array(HSIZE);
  const CAP = 2500; // au-delà, le bassin est trop « ouvert » : on abandonne cette disposition
  function hClear() { hKeys.fill(-1); }
  function hGet(k) {
    let h = Math.imul(k, 0x9e3779b1) >>> (32 - HBITS);
    for (;;) { const v = hKeys[h]; if (v === -1) return -1; if (v === k) return hIdx[h]; h = (h + 1) & HMASK; }
  }
  function hPut(k, i) {
    let h = Math.imul(k, 0x9e3779b1) >>> (32 - HBITS);
    while (hKeys[h] !== -1) h = (h + 1) & HMASK;
    hKeys[h] = k; hIdx[h] = i;
  }

  function makeEngine(boats) {
    const B = boats.length;
    const len = new Int8Array(B), hor = new Int8Array(B), line = new Int8Array(B);
    boats.forEach((b, i) => { len[i] = b.len; hor[i] = b.hor ? 1 : 0; line[i] = b.line; });
    const cellAt = (i, p) => (hor[i] ? line[i] * N + p : p * N + line[i]);
    // masques d'occupation (deux moitiés de 18 cases) pour chaque bateau et chaque position
    const mLo = new Int32Array(B * 5), mHi = new Int32Array(B * 5);
    for (let i = 0; i < B; i++) {
      for (let p = 0; p + len[i] <= N; p++) {
        for (let k = 0; k < len[i]; k++) {
          const c = cellAt(i, p + k);
          if (c < 18) mLo[i * 5 + p] |= 1 << c; else mHi[i * 5 + p] |= 1 << (c - 18);
        }
      }
    }
    const pos = new Int8Array(B);
    function decode(key) { for (let i = 0; i < B; i++) { const p = key % 5; pos[i] = p; key = (key - p) / 5; } return pos; }
    function encode(s) { let k = 0; for (let i = B - 1; i >= 0; i--) k = k * 5 + s[i]; return k; }
    // appelle cb(clé voisine) pour chaque coup possible depuis `key`
    function neighbors(key, cb) {
      decode(key);
      let lo = 0, hi = 0;
      for (let i = 0; i < B; i++) { lo |= mLo[i * 5 + pos[i]]; hi |= mHi[i * 5 + pos[i]]; }
      for (let i = 0; i < B; i++) {
        const p = pos[i], w = POW5[i];
        for (let q = p - 1; q >= 0; q--) {
          const c = cellAt(i, q);
          if (c < 18 ? (lo >> c) & 1 : (hi >> (c - 18)) & 1) break;
          cb(key + (q - p) * w);
        }
        for (let q = p + 1; q + len[i] <= N; q++) {
          const c = cellAt(i, q + len[i] - 1);
          if (c < 18 ? (lo >> c) & 1 : (hi >> (c - 18)) & 1) break;
          cb(key + (q - p) * w);
        }
      }
    }
    return { B, decode, encode, neighbors };
  }

  // toutes les positions atteignables depuis `startKey`, et leur distance à la sortie
  // (le navire est le bateau n°0 : sa position est la clé modulo 5)
  const EDGES = new Int32Array(CAP * 4 * MAXB), OFF = new Int32Array(CAP + 1); // graphe du bassin, réutilisé
  function explore(E, startKey) {
    hClear();
    const keys = new Int32Array(CAP);
    let n = 1, e = 0, over = false;
    keys[0] = startKey; hPut(startKey, 0);
    const add = (k) => {
      if (over) return;
      let j = hGet(k);
      if (j < 0) {
        if (n >= CAP) { over = true; return; }
        j = n; hPut(k, n); keys[n++] = k;
      }
      EDGES[e++] = j;
    };
    for (let h = 0; h < n && !over; h++) { OFF[h] = e; E.neighbors(keys[h], add); }
    if (over) return null;
    OFF[n] = e;
    // les coups sont réversibles : BFS à partir de toutes les positions gagnantes
    const dist = new Int16Array(n).fill(-1), queue = new Int32Array(n);
    let qn = 0, maxd = -1;
    for (let k = 0; k < n; k++) if (keys[k] % 5 === GOAL) { dist[k] = 0; queue[qn++] = k; }
    if (qn) maxd = 0;
    for (let h = 0; h < qn; h++) {
      const x = queue[h], d = dist[x] + 1;
      for (let a = OFF[x], b = OFF[x + 1]; a < b; a++) {
        const j = EDGES[a];
        if (dist[j] < 0) { dist[j] = d; if (d > maxd) maxd = d; queue[qn++] = j; }
      }
    }
    return { n, keys, dist, maxd };
  }

  // plus court chemin depuis une position (pour l'indice et la résolution) : liste d'états
  function shortest(boats, start) {
    const E = makeEngine(boats);
    const s0 = E.encode(start);
    const toState = (k) => Uint8Array.from(E.decode(k));
    if (s0 % 5 === GOAL) return [toState(s0)];
    hClear();
    const keys = [s0], parent = [-1];
    hPut(s0, 0);
    let found = -1, h = 0;
    const add = (k) => {
      if (found >= 0 || hGet(k) >= 0 || keys.length >= HSIZE / 2) return;
      hPut(k, keys.length); keys.push(k); parent.push(h);
      if (k % 5 === GOAL) found = keys.length - 1;
    };
    for (; h < keys.length && found < 0; h++) E.neighbors(keys[h], add);
    if (found < 0) return null;
    const path = [];
    for (let k = found; k >= 0; k = parent[k]) path.unshift(toState(keys[k]));
    return path;
  }

  // une barque de plus, au hasard sur des cases libres (false si aucune place trouvée)
  function addBoat(rng, boats, pos, p3) {
    const occ = new Uint8Array(N * N);
    boats.forEach((b, i) => { for (let k = 0; k < b.len; k++) occ[b.hor ? b.line * N + pos[i] + k : (pos[i] + k) * N + b.line] = 1; });
    for (let tries = 0; tries < 40; tries++) {
      const len = rng() < p3 ? 3 : 2;
      const hor = rng() < 0.5;
      const line = rng.int(N);
      if (hor && line === EXIT) continue; // une barque couchée sur la rangée de sortie fermerait la passe pour toujours
      const p = rng.int(N - len + 1);
      let free = true;
      for (let k = 0; k < len && free; k++) if (occ[hor ? line * N + p + k : (p + k) * N + line]) free = false;
      if (!free) continue;
      boats.push({ len, hor, line });
      pos.push(p);
      return true;
    }
    return false;
  }

  // évalue une disposition : profondeur maximale de son bassin d'états, et l'état le plus profond
  function evaluate(boats, pos, hiCap) {
    const E = makeEngine(boats);
    const res = explore(E, E.encode(pos));
    if (!res || res.maxd < 1) return { score: -1 };
    const d = Math.min(hiCap, res.maxd);
    const cands = [];
    for (let k = 0; k < res.n; k++) if (res.dist[k] === d) cands.push(res.keys[k]);
    return { score: d, cands, E };
  }

  // Génération par « escalade » : on part d'un placement aléatoire, on remplace, ajoute ou
  // retire une barque à partir de la position la plus difficile, et on garde la mutation
  // si la solution la plus courte ne raccourcit pas. Tout dépend du seul rng : déterministe.
  function generate(rng, p) {
    const [lo, hi] = p.band;
    let boats, pos, ev, stall = 0, best = null;
    const fresh = () => {
      boats = [{ len: 2, hor: true, line: EXIT }]; pos = [rng.int(GOAL)];
      for (let k = 0; k < p.count; k++) addBoat(rng, boats, pos, p.p3);
      ev = evaluate(boats, pos, hi);
      stall = 0;
    };
    fresh();
    for (let it = 0; it < p.evals && ev.score < lo; it++) {
      // l'escalade piétine : on garde le meilleur résultat et on repart d'un nouveau port
      if (stall > 45) { if (!best || ev.score > best.ev.score) best = { boats, ev }; fresh(); continue; }
      stall++;
      // repartir de l'état le plus difficile trouvé jusqu'ici
      let nb = boats.map((b) => Object.assign({}, b));
      let np = ev.score >= 0 ? Array.from(ev.E.decode(rng.pick(ev.cands))) : pos.slice();
      const r = rng();
      const others = nb.length - 1;
      const room = nb.length < Math.min(MAXB, p.count + 4);
      if (((r < 0.25 || ev.score < 0) && room) || others < 2) {
        addBoat(rng, nb, np, p.p3);
      } else if (r < 0.35 && others > 3) {
        const i = 1 + rng.int(others); nb.splice(i, 1); np.splice(i, 1);
      } else {
        const i = 1 + rng.int(others); nb.splice(i, 1); np.splice(i, 1);
        if (!addBoat(rng, nb, np, p.p3)) continue;
      }
      const ev2 = evaluate(nb, np, hi);
      if (ev2.score >= ev.score) { if (ev2.score > ev.score) stall = 0; boats = nb; pos = np; ev = ev2; }
    }
    if (best && best.ev.score > ev.score) { boats = best.boats; ev = best.ev; }
    if (ev.score < 1) { // filet de sécurité (ne devrait jamais servir)
      return { boats: [{ len: 2, hor: true, line: EXIT, bow: 1, color: -1 }, { len: 3, hor: false, line: 4, bow: 1, color: 0 }], start: [0, 1], min: 2 };
    }
    const start = Array.from(ev.E.decode(rng.pick(ev.cands)));
    boats.forEach((b, i) => { b.bow = i === 0 ? 1 : (rng() < 0.5 ? 1 : -1); b.color = i - 1; });
    return { boats, start, min: ev.score };
  }

  // niveau 1 : 3-4 coups ; niveau 40 : 17-21 coups
  function params(level) {
    const t = Math.max(0, Math.min(1, (level - 1) / 39));
    let lo = Math.round(3 + 14 * t), hi = lo + 1 + Math.round(3 * t), count = Math.round(5 + 6 * t);
    if (level <= 12) {
      // débuts en douceur : 2-3 coups et 3 barques au niveau 1, puis on rejoint la courbe au niveau 12
      lo = Math.min(lo, 2 + Math.floor((level - 1) * 5 / 11));
      hi = Math.min(hi, lo + 1 + (level >= 9 ? 1 : 0));
      count = Math.min(count, 3 + Math.floor(level / 3));
    }
    return {
      band: [lo, hi],
      count,                              // nombre de barques autour du navire au départ
      p3: 0.2 + 0.2 * t,                  // part des grandes barques (3 cases)
      evals: 320                          // budget d'évaluations (borne de temps)
    };
  }

  // ------------------------------------------------------------------
  // Dessin d'une coque vue de dessus (repère horizontal : longueur L, largeur W, proue à droite)
  // ------------------------------------------------------------------
  function hullPath(L, W, x0, y0) {
    x0 = x0 || 0; y0 = y0 || 0;
    const r = W * 0.32, nose = Math.min(W * 0.85, L * 0.4);
    const f = (v) => +v.toFixed(2);
    const X = (v) => f(x0 + v), Y = (v) => f(y0 + v);
    return 'M' + X(r) + ' ' + Y(0) + 'H' + X(L - nose) +
      'C' + X(L - nose * 0.3) + ' ' + Y(0) + ' ' + X(L) + ' ' + Y(W * 0.32) + ' ' + X(L) + ' ' + Y(W / 2) +
      'C' + X(L) + ' ' + Y(W * 0.68) + ' ' + X(L - nose * 0.3) + ' ' + Y(W) + ' ' + X(L - nose) + ' ' + Y(W) +
      'H' + X(r) + 'Q' + X(0) + ' ' + Y(W) + ' ' + X(0) + ' ' + Y(W - r) + 'V' + Y(r) + 'Q' + X(0) + ' ' + Y(0) + ' ' + X(r) + ' ' + Y(0) + 'Z';
  }
  // contenu SVG d'un bateau (coque, pont, bande, mât) dans le repère horizontal
  function boatBody(L, W, color, hero) {
    const e = W * 0.16;
    let s = '<path d="' + hullPath(L, W) + '" fill="' + color + '"/>';
    s += '<path d="' + hullPath(L - 2 * e, W - 2 * e, e, e) + '" fill="#fff" opacity="' + (hero ? '.16' : '.22') + '"/>';
    s += '<rect x="' + (W * 0.42).toFixed(2) + '" y="0" width="' + (W * 0.2).toFixed(2) + '" height="' + W.toFixed(2) + '" fill="' + (hero ? GOLD : '#000') + '" opacity="' + (hero ? '1' : '.13') + '"/>';
    if (hero) {
      // le navire d'Ulysse : une ligne d'or le long du pont et l'œil peint à la proue
      s += '<path d="M' + (W * 0.62).toFixed(2) + ' ' + (W / 2).toFixed(2) + 'H' + (L - W * 0.9).toFixed(2) + '" stroke="' + GOLD + '" stroke-width="' + (W * 0.09).toFixed(2) + '" stroke-linecap="round"/>';
      s += '<circle cx="' + (L - W * 0.55).toFixed(2) + '" cy="' + (W / 2).toFixed(2) + '" r="' + (W * 0.1).toFixed(2) + '" fill="' + GOLD + '"/>';
      // grande voile blanche gonflée, vue d'en haut : on reconnaît le navire d'Ulysse au premier coup d'œil
      const sx = (L * 0.3).toFixed(2), bx = (L * 0.5).toFixed(2);
      s += '<path class="rh-sail" d="M' + sx + ' ' + (W * 0.02).toFixed(2) + 'Q' + bx + ' ' + (W / 2).toFixed(2) + ' ' + sx + ' ' + (W * 0.98).toFixed(2) + 'Z" fill="#fff" stroke="' + GOLD + '" stroke-width="' + (W * 0.05).toFixed(2) + '"/>';
      s += '<circle cx="' + sx + '" cy="' + (W / 2).toFixed(2) + '" r="' + (W * 0.09).toFixed(2) + '" fill="#8a5d3b"/>';
      // les rames, rangées le long de la coque : elles n'apparaissent qu'au départ (classe .sail)
      const oh = (W * 0.34).toFixed(2), ow = (W * 0.075).toFixed(2);
      [0.34, 0.5].forEach((t, k) => {
        const x = (L * t).toFixed(2);
        s += '<line class="rh-oar up" style="--o:' + k + '" x1="' + x + '" y1="0" x2="' + x + '" y2="-' + oh + '" stroke="#8a5d3b" stroke-width="' + ow + '" stroke-linecap="round"/>';
        s += '<line class="rh-oar down" style="--o:' + k + '" x1="' + x + '" y1="' + W.toFixed(2) + '" x2="' + x + '" y2="' + (W + +oh).toFixed(2) + '" stroke="#8a5d3b" stroke-width="' + ow + '" stroke-linecap="round"/>';
      });
    } else {
      s += '<circle cx="' + (L * 0.62).toFixed(2) + '" cy="' + (W / 2).toFixed(2) + '" r="' + (W * 0.11).toFixed(2) + '" fill="#fff" opacity=".55"/>';
    }
    return s;
  }
  // orientation : couché ou debout, proue d'un côté ou de l'autre
  function boatGroup(L, W, hor, bow, color, hero) {
    let t = '';
    if (!hor) t += 'translate(' + W.toFixed(2) + ' 0) rotate(90) ';
    if (bow < 0) t += 'translate(' + L.toFixed(2) + ' 0) scale(-1 1)';
    return '<g transform="' + t.trim() + '">' + boatBody(L, W, color, hero) + '</g>';
  }

  // ------------------------------------------------------------------
  // Partie
  // ------------------------------------------------------------------
  function create(host, puzzle, api) {
    const boats = puzzle.boats, B = boats.length;
    const S = makeSolver(boats);
    let cur = Uint8Array.from(puzzle.start);
    let history = [], moves = 0, won = false, drag = null;
    let size = 0, pad = 0, cell = 0, gapM = 0;

    const root = document.createElement('div');
    root.className = 'rh enter';
    setTimeout(() => root.classList.remove('enter'), 1600);
    const sea = document.createElement('div');
    sea.className = 'rh-sea';
    for (let k = 0; k < N * N; k++) { const d = document.createElement('i'); d.className = 'rh-spot'; sea.appendChild(d); }
    const gap = document.createElement('div');
    gap.className = 'rh-exit';
    root.appendChild(sea);
    root.appendChild(gap);
    const els = boats.map((b, i) => {
      const el = document.createElement('div');
      el.className = 'rh-boat' + (i === 0 ? ' hero' : '');
      el.style.setProperty('--k', i);
      el.dataset.i = i;
      root.appendChild(el);
      return el;
    });
    host.appendChild(root);

    const colorOf = (i) => (i === 0 ? HERO : COLORS[boats[i].color % COLORS.length].c);

    function xy(i, p) {
      const b = boats[i];
      const m = cell * 0.07;
      return b.hor ? [pad + p * cell + m, pad + b.line * cell + m] : [pad + b.line * cell + m, pad + p * cell + m];
    }
    function setPos(i, p) {
      const [x, y] = xy(i, p);
      els[i].style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
    }
    function render() { for (let i = 0; i < B; i++) setPos(i, cur[i]); }

    function resize() {
      // on mesure l'hôte sans le plateau, pour qu'il puisse aussi regrandir
      root.style.position = 'absolute';
      const w = Math.min(host.clientWidth || 360, host.clientHeight || Infinity, 520, N * 76);
      root.style.position = '';
      size = Math.floor(w); pad = Math.round(size * 0.05); cell = (size - 2 * pad) / N;
      gapM = cell * 0.07;
      root.style.width = size + 'px'; root.style.height = size + 'px';
      root.style.setProperty('--pad', pad + 'px');
      root.style.setProperty('--cell', cell + 'px');
      gap.style.top = (pad + EXIT * cell + gapM) + 'px';
      gap.style.height = (cell - 2 * gapM) + 'px';
      boats.forEach((b, i) => {
        const L = b.len * cell - 2 * gapM, W = cell - 2 * gapM;
        const w2 = b.hor ? L : W, h2 = b.hor ? W : L;
        els[i].style.width = w2 + 'px'; els[i].style.height = h2 + 'px';
        els[i].innerHTML = '<svg viewBox="0 0 ' + w2.toFixed(2) + ' ' + h2.toFixed(2) + '" width="' + w2.toFixed(2) + '" height="' + h2.toFixed(2) + '">' +
          boatGroup(L, W, b.hor, b.bow, colorOf(i), i === 0) + '</svg>';
      });
      // repositionnement sans ressort
      root.classList.add('still');
      render();
      if (won) sailAway(true);
      void root.offsetWidth;
      root.classList.remove('still');
    }

    // --- fin de partie : le navire prend la mer (purement visuel, l'état est déjà gagné) ---
    // Chronologie (ms après la victoire) :
    //   0     le navire se ramasse (léger recul), les rames sortent
    //   180   il s'élance, accélère en s'allongeant ; sillage d'écume et ronds dans l'eau
    //   ~250  la vague passe sous les barques, qui tanguent l'une après l'autre
    //   300   une lumière dorée glisse sur le quai
    //   600   les feux de la passe s'allument, l'eau scintille à la sortie
    //   ~1100 le navire a franchi la passe et s'efface
    //   900-2200  deux mouettes s'envolent, l'écume se dissipe (arrière-plan apaisé)
    const SAIL_AT = 180;
    const timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    const calm = () => document.documentElement.classList.contains('a11y-motion') ||
      !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let fxUnder = null, fxOver = null;
    function clearFx() {
      if (fxUnder) fxUnder.remove();
      if (fxOver) fxOver.remove();
      fxUnder = fxOver = null;
    }
    function fx(layer, cls, x, y, extra) {
      const e = document.createElement('i');
      e.className = cls;
      e.style.left = x.toFixed(1) + 'px'; e.style.top = y.toFixed(1) + 'px';
      if (extra) Object.keys(extra).forEach((k) => e.style.setProperty(k, extra[k]));
      layer.appendChild(e);
      return e;
    }
    function sailAway(now) {
      const el = els[0];
      el.classList.add('sail');
      if (calm()) return; // mouvement réduit : le navire s'efface simplement sur place
      const [, y] = xy(0, GOAL);
      const go = () => { el.style.transform = 'translate3d(' + (size + cell * 0.6).toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)'; };
      if (now) { clearFx(); go(); return; }
      later(go, SAIL_AT);
      celebrate();
    }
    function celebrate() {
      clearFx();
      const [x0, y0] = xy(0, GOAL);
      const W = cell - 2 * gapM, L = 2 * cell - 2 * gapM;
      const rowY = pad + EXIT * cell, midY = y0 + W / 2;
      const travel = size + cell * 0.6 - x0;
      fxUnder = document.createElement('div'); fxUnder.className = 'rh-fx';
      fxOver = document.createElement('div'); fxOver.className = 'rh-fx over';
      root.insertBefore(fxUnder, els[0]); // sous les bateaux, sur l'eau
      root.appendChild(fxOver);

      // le sillage : il s'étire derrière le navire, au même rythme que lui
      const wake = fx(fxUnder, 'rh-wake', x0, rowY);
      wake.style.width = travel.toFixed(1) + 'px';
      wake.style.height = cell.toFixed(1) + 'px';
      later(() => wake.classList.add('go'), SAIL_AT);

      // ronds dans l'eau : à la poupe, puis au bout des rames de part et d'autre
      // (f = part du trajet parcourue à cet instant, pour suivre l'accélération)
      [[120, 0, 0], [330, 0.1, -1], [380, 0.12, 1], [560, 0.3, 0], [700, 0.45, -1], [740, 0.48, 1], [880, 0.7, 0]].forEach(([t, f, side]) => {
        const rx = x0 + travel * f + (side ? L * 0.42 : W * 0.1);
        const ry = midY + side * W * 0.78;
        later(() => fx(fxUnder, 'rh-ripple' + (side ? ' small' : ''), rx, ry), t);
      });

      // la vague du départ fait tanguer les barques, de gauche à droite
      for (let i = 1; i < B; i++) {
        const b = boats[i];
        const cx = (b.hor ? cur[i] + b.len / 2 : b.line + 0.5);
        const cy = (b.hor ? b.line + 0.5 : cur[i] + b.len / 2);
        const near = Math.abs(cy - (EXIT + 0.5));
        const svg = els[i].firstElementChild;
        if (!svg) continue;
        svg.style.setProperty('--bd', Math.round(220 + cx * 95 + near * 40) + 'ms');
        svg.style.setProperty('--amp', (1 / (1 + near * 0.45)).toFixed(2));
        svg.style.setProperty('--dir', b.hor ? 1 : -1);
      }
      root.classList.add('wave');

      // lumière dorée qui balaie le quai
      fx(fxOver, 'rh-shine', 0, 0);

      // l'eau scintille dans la passe
      const gx = size - pad * 0.55, gy = rowY + cell / 2;
      [[0, -0.32, 0], [0.5, 0.22, 1], [-0.45, 0.05, 2], [0.15, -0.05, 3], [-0.2, 0.36, 4]].forEach(([dx, dy, k]) => {
        fx(fxOver, 'rh-glint', gx + dx * pad * 1.4, gy + dy * cell, { '--g': k });
      });

      // deux mouettes s'envolent au-dessus de la passe
      const gull = '<svg viewBox="0 0 14 6"><path d="M1 4.6Q4 .6 7 3.6Q10 .6 13 4.6"/></svg>';
      const g1 = fx(fxOver, 'rh-gull', size - pad - cell * 0.9, rowY - cell * 0.15, { '--s': 1 });
      const g2 = fx(fxOver, 'rh-gull', size - pad - cell * 0.35, rowY + cell * 0.35, { '--s': 0.8, '--gd': '160ms' });
      g1.innerHTML = gull; g2.innerHTML = gull;
      g1.style.width = g2.style.width = (cell * 0.36).toFixed(1) + 'px';

      // une fois tout apaisé, on retire les effets
      later(() => { root.classList.remove('wave'); clearFx(); }, 2600);
    }

    function checkWin() {
      if (won || cur[0] !== GOAL) return;
      won = true;
      root.classList.add('won');
      sailAway(false);
      api.onWin();
    }

    function commit(i, q, sound) {
      if (q === cur[i]) { setPos(i, q); return false; }
      history.push({ s: cur.slice(), moves });
      cur[i] = q;
      moves++;
      setPos(i, q);
      if (sound !== false) C.sfx.place();
      api.onChange();
      checkWin();
      return true;
    }

    // --- glisser un bateau ---
    const soft = (x) => 0.22 * x / (x + 0.35); // petite résistance élastique au-delà des limites
    function onDown(e) {
      if (won || drag) return;
      const el = e.target.closest('.rh-boat');
      if (!el || !root.contains(el)) return;
      e.preventDefault();
      const i = +el.dataset.i;
      S.fill(cur);
      const [lo, hi] = S.range(cur, i);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      drag = { i, el, id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: cur[i], lo, hi, f: cur[i] };
      el.classList.add('drag');
      C.sfx.tap();
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const b = boats[drag.i];
      const rect = root.getBoundingClientRect();
      const scale = rect.width ? size / rect.width : 1;
      const d = ((b.hor ? e.clientX - drag.x0 : e.clientY - drag.y0) * scale) / cell;
      let f = drag.p0 + d;
      if (f < drag.lo) f = drag.lo - soft(drag.lo - f);
      if (f > drag.hi) f = drag.hi + soft(f - drag.hi);
      drag.f = f;
      setPos(drag.i, f);
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const { i, el, lo, hi, f } = drag;
      drag = null;
      el.classList.remove('drag');
      const q = Math.max(lo, Math.min(hi, Math.round(f)));
      commit(i, q);
    }
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', resize);
    resize();

    // --- explications de l'indice ---
    // la barque à bouger est entourée d'or, celle qu'elle gêne est surlignée (pas de nom de couleur : plusieurs se ressemblent)
    const nameOf = (i) => (i === 0 ? 'le navire d\'Ulysse' : 'la ' + (boats[i].len === 3 ? 'grande ' : '') + 'barque dorée');
    const otherOf = (j) => (j === 0 ? 'le navire d\'Ulysse' : 'la barque surlignée');
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const diff = (a, b) => { for (let i = 0; i < B; i++) if (a[i] !== b[i]) return i; return -1; };
    function cellsOf(i, from, to) { // cases balayées par le bateau i entre deux positions
      const b = boats[i], out = new Set();
      for (let p = Math.min(from, to); p <= Math.max(from, to) + b.len - 1; p++) out.add(b.hor ? b.line * N + p : p * N + b.line);
      return out;
    }
    // la barque i barre-t-elle la route du navire vers la passe ?
    const blocks = (s, i) => i > 0 && !boats[i].hor && boats[i].line > s[0] + 1 && s[i] <= EXIT && s[i] + boats[i].len - 1 >= EXIT;
    function verb(i, d) {
      const k = DIST[Math.abs(d)];
      if (boats[i].hor) return 'fais-la glisser ' + k + (d < 0 ? ' vers la gauche' : ' vers la droite');
      return (d < 0 ? 'fais-la monter ' : 'fais-la descendre ') + k;
    }
    // renvoie la phrase et ce qu'elle désigne comme « surligné » : la passe, ou le bateau à qui l'on fait de la place
    function explain(path) {
      const a = path[0], b = path[1];
      const i = diff(a, b), d = b[i] - a[i];
      const j = path[2] ? diff(path[1], path[2]) : -1;
      const next = j >= 0 && j !== i ? [els[j]] : [];
      if (i === 0) {
        if (b[0] === GOAL) return { text: 'La voie est libre : glisse le navire d\'Ulysse jusqu\'à la passe (surlignée), et il prend la mer !', why: [gap] };
        if (d > 0) return { text: 'Avance le navire d\'Ulysse ' + DIST[d] + ' vers la passe : il libère de la place derrière lui.', why: [] };
        return { text: 'Recule le navire d\'Ulysse ' + DIST[-d] + ' : il dégage sa rangée pour laisser passer un autre bateau.', why: [] };
      }
      if (blocks(a, i) && !blocks(b, i)) return { text: cap(nameOf(i)) + ' barre la route vers la passe (surlignée) : ' + verb(i, d) + ' pour ouvrir le passage.', why: [gap] };
      if (next.length) {
        const before = cellsOf(i, a[i], a[i]), after = cellsOf(i, b[i], b[i]);
        const swept = cellsOf(j, path[1][j], path[2][j]);
        let frees = false;
        before.forEach((c) => { if (!after.has(c) && swept.has(c)) frees = true; });
        if (frees) return { text: cap(nameOf(i)) + ' gêne ' + otherOf(j) + ' : ' + verb(i, d) + ' pour lui faire de la place.', why: next };
      }
      if (blocks(b, i)) return { text: cap(nameOf(i)) + ' barre la route vers la passe (surlignée) : ' + verb(i, d) + ', c\'est un premier pas pour dégager la route.', why: [gap] };
      return { text: 'Commence par ' + nameOf(i) + ' : ' + verb(i, d) + '. C\'est le début du chemin le plus court.', why: [] };
    }

    return {
      status() { return moves ? moves + (moves > 1 ? ' coups' : ' coup') : ''; },
      undo() {
        if (won || drag || !history.length) return;
        const h = history.pop();
        cur = h.s; moves = h.moves;
        render(); C.sfx.tap(); api.onChange();
      },
      reset() {
        if (won || drag) return;
        if (cur.every((v, i) => v === puzzle.start[i])) return;
        history.push({ s: cur.slice(), moves });
        cur = Uint8Array.from(puzzle.start); moves = 0;
        render(); api.onChange();
      },
      hint() {
        if (won || drag) return false;
        const path = shortest(boats, cur);
        if (!path || path.length < 2) return false;
        // pourquoi : la passe, ou le bateau à qui l'on fait de la place (coup suivant), selon la phrase
        const { text, why } = explain(path);
        const i = diff(path[0], path[1]);
        C.act(() => commit(i, path[1][i]));
        return { text, where: [els[i]], why };
      },
      // 💬 la méthode : partir de la passe et remonter la chaîne des barques qui gênent
      method: 'Pars de la passe : quelles barques barrent la route du navire ? Pour chacune, cherche où elle peut aller, et qui la gêne à son tour.',
      // outil de test : on joue d'un coup toute la solution la plus courte
      solve() {
        if (won) return;
        if (drag) { drag.el.classList.remove('drag'); drag = null; }
        const path = shortest(boats, cur);
        if (!path) return;
        history.push({ s: cur.slice(), moves });
        cur = Uint8Array.from(path[path.length - 1]);
        moves += path.length - 1;
        render(); api.onChange();
        checkWin();
      },
      redraw: resize,
      destroy() { window.removeEventListener('resize', resize); timers.forEach(clearTimeout); }
    };
  }

  // ------------------------------------------------------------------
  // Tutoriel : petits ports dessinés (viewBox 120×120)
  // ------------------------------------------------------------------
  const T0 = 18, TC = 14; // origine et taille d'une case dans les dessins
  function tBoat(r, c, len, hor, color, bow, hero, op) {
    const m = 1, L = len * TC - 2 * m, W = TC - 2 * m;
    const x = T0 + c * TC + m, y = T0 + r * TC + m;
    return '<g transform="translate(' + x + ' ' + y + ')"' + (op ? ' opacity="' + op + '"' : '') + '>' + boatGroup(L, W, hor, bow, color, hero) + '</g>';
  }
  function tPort(inner) {
    let s = '<svg viewBox="0 0 120 120" class="tuto-art"><g stroke="none">' +
      '<rect x="10" y="10" width="100" height="100" rx="12" fill="var(--rh-quay)"/>' +
      '<rect x="' + T0 + '" y="' + T0 + '" width="84" height="84" rx="7" fill="var(--rh-sea)"/>' +
      '<rect x="100" y="' + (T0 + EXIT * TC + 1) + '" width="12" height="' + (TC - 2) + '" fill="var(--rh-sea)"/>';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      s += '<rect x="' + (T0 + c * TC + 2) + '" y="' + (T0 + r * TC + 2) + '" width="' + (TC - 4) + '" height="' + (TC - 4) + '" rx="3" fill="var(--rh-spot)"/>';
    }
    return s + inner + '</g></svg>';
  }
  const tFinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const tArrow = (d) => '<path d="' + d + '" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
  const G1 = COLORS[0].c, G3 = COLORS[2].c;
  const TUTORIAL = [
    { art: tPort(tBoat(EXIT, 1, 2, true, HERO, 1, true) + tBoat(1, 4, 2, false, G1, 1) + tBoat(0, 1, 2, true, G3, 1) +
        tArrow('M104 ' + (T0 + EXIT * TC + 7) + 'h10m-3 -3l3 3l-3 3')),
      text: 'Fais sortir le <b>navire d\'Ulysse</b>, rouge à voile blanche, par la <b>passe</b> à droite du port.' },
    // la barque verte descend (sa position de départ reste en transparence) : la passe se dégage
    { art: tPort(tBoat(EXIT, 1, 2, true, HERO, 1, true) + tBoat(1, 4, 2, false, G1, 1, false, 0.28) + tBoat(3, 4, 2, false, G1, 1) +
        tBoat(0, 1, 2, true, G3, 1) + tArrow('M' + (T0 + 5.5 * TC) + ' ' + (T0 + 1.4 * TC) + 'v' + (TC * 1.8) + 'm-3 -3l3 3l3 -3') +
        tFinger(T0 + 4.5 * TC, T0 + 4.1 * TC)),
      text: 'Glisse un bateau du doigt : il ne bouge que <b>dans son axe</b>, et ne passe jamais sur un autre.' },
    { art: tPort(tBoat(EXIT, 4, 2, true, HERO, 1, true) + tBoat(3, 4, 2, false, G1, 1) + tBoat(0, 1, 2, true, G3, 1) +
        tArrow('M' + (T0 + 1.2 * TC) + ' ' + (T0 + EXIT * TC + 5) + 'h' + (TC * 2.2)) + tArrow('M' + (T0 + 1.6 * TC) + ' ' + (T0 + EXIT * TC + 9) + 'h' + (TC * 1.6))),
      text: 'Trouve l\'ordre des manœuvres qui <b>libère la passe</b>, et le navire prend la mer.' }
  ];

  C.register({
    id: 'rushhour',
    name: 'Port',
    tagline: 'Libère la passe du navire',
    accent: '#b8864a',
    icon: '<svg viewBox="0 0 24 24"><path d="M5 9.5h7.5l3.5 2.5-3.5 2.5H5A2 2 0 0 1 3 12.5v-1A2 2 0 0 1 5 9.5z" fill="currentColor"/><path d="M19 3.5a2 2 0 0 1 2 2V16l-2 3-2-3V5.5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    icon24: '<path d="M5 9.5h7.5l3.5 2.5-3.5 2.5H5A2 2 0 0 1 3 12.5v-1A2 2 0 0 1 5 9.5z" class="f"/><path d="M19 3.5a2 2 0 0 1 2 2V16l-2 3-2-3V5.5a2 2 0 0 1 2-2z"/><path d="M3 20.5h8"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Fais sortir le navire d\'Ulysse du port encombré.' }
    ],
    rules: {
      classic: [
        'Fais sortir le <b>navire d\'Ulysse</b>, rouge à voile blanche, par la <b>passe</b> du bord droit.',
        'Glisse un bateau du doigt : il ne bouge que <b>dans son axe</b>, en avant ou en arrière.',
        'Les bateaux ne se chevauchent pas : trouve l\'ordre des manœuvres qui libère le passage.'
      ]
    },
    tutorial: TUTORIAL,
    params,
    generate,
    create
  });
})();
