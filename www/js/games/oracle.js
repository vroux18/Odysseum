// L'Oracle : grille logique « qui va avec quoi », tout en icônes.
// Des catégories (dieux, objets, lieux, rang) ; chaque dieu a un objet, un lieu, un rang.
// Les cartes de l'Oracle relient deux icônes : = (ensemble), ≠ (jamais ensemble),
// ↔ (rangs voisins), ··› (le premier est quelque part avant le second).
// On coche la grille (✗ puis ✓) ; un ✓ barre tout seul le reste de sa ligne et de sa colonne (réglable).
// Le générateur ajoute des cartes jusqu'à ce que le moteur de déduction résolve tout :
// la solution est donc unique ET atteignable sans deviner ; l'astuce rejoue ce même moteur.
(function () {
  'use strict';
  const C = window.Carnet;

  // ------------------------------------------------------------------
  // Icônes (24×24, trait) par catégorie : couleur du trait, teinte du fond
  // ------------------------------------------------------------------
  const CATS = {
    god: { col: '#d99300', bg: '#fff1c7', items: [
      '<path d="M6 5l3 2.5h6L18 5v8c0 4-2.7 7-6 7s-6-3-6-7z"/><circle cx="9.6" cy="11.2" r="1.7" class="f"/><circle cx="14.4" cy="11.2" r="1.7" class="f"/>', // chouette
      '<path d="M12 21V7M7 4v4.5a5 5 0 0 0 10 0V4M12 3.5V7"/>', // trident
      '<path d="M13.5 3 6.5 13h5l-1.5 8 7.5-10.5h-5z" class="f"/>', // foudre
      '<circle cx="12" cy="12" r="3.6" class="f"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>', // soleil
      '<circle cx="9.3" cy="10" r="2.3" class="f"/><circle cx="14.7" cy="10" r="2.3" class="f"/><circle cx="12" cy="14.4" r="2.3" class="f"/><circle cx="12" cy="18.8" r="2" class="f"/><path d="M12 7.6V4l3-1"/>' // raisin
    ] },
    obj: { col: '#ea6232', bg: '#ffe4d6', items: [
      '<path d="M9.5 3.5h5M10.5 3.5v2.2C8 7 6.5 9.5 6.5 12.5c0 3.8 2.6 6.3 5.5 7.5 2.9-1.2 5.5-3.7 5.5-7.5 0-3-1.5-5.5-4-6.8V3.5M7 11h10"/>', // amphore
      '<path d="M8 4c-2.5 3.5-2 9 1.5 11.5M16 4c2.5 3.5 2 9-1.5 11.5M8 15.5h8l-.8 4.5H8.8zM7.2 7.5h9.6M10.6 7.5v8M13.4 7.5v8"/>', // lyre
      '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" class="f"/>', // bouclier
      '<path d="M5.5 19.5V13C5.5 8.5 8.5 5.5 12 5.5s6.5 3 6.5 7.5v6.5h-4V14h-5v5.5z"/><path d="M6.5 6.5C8.5 2.6 15.5 2.6 17.5 6.5"/>', // casque
      '<path d="M7 3.5c7 3 7 14 0 17M7 3.5v17M4.5 12H19m-2.5-2.5L19 12l-2.5 2.5"/>' // arc
    ] },
    place: { col: '#2b82dc', bg: '#dcecff', items: [
      '<path d="M3.5 9 12 4.5 20.5 9zM6.2 10v7.5M10 10v7.5M14 10v7.5M17.8 10v7.5M3.5 20h17"/>', // temple
      '<path d="M2.5 19.5 9 8l3.5 5.5L15 10l6.5 9.5z"/>', // montagne
      '<path d="M3.5 15h17l-3 4.5h-11zM12 15V3.5L18 12h-6"/>', // navire
      '<path d="M3 19.5c3-1.6 6-1.6 9 0s6 1.6 9 0M7 16.5c.8-2.5 2.8-3.5 5-3.5s4.2 1 5 3.5M12 13c0-3.5.7-6 2.5-8M14.5 5c-2 0-3.8.8-4.8 2.6M14.5 5c2 0 3.7.9 4.3 2.6"/>', // île
      '<path d="M12 3c-3 4.5-4.6 9-4.6 13.2h9.2C16.6 12 15 7.5 12 3zM12 16.2V21M9 21h6"/>' // cyprès
    ] },
    order: { col: '#7058e0', bg: '#ebe6ff', items: null } // rang : faces de dé, 1 à 5 points
  };
  const PIPS = [[[12, 12]], [[8, 8], [16, 16]], [[7, 7], [12, 12], [17, 17]], [[8, 8], [16, 8], [8, 16], [16, 16]], [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]]];
  const pipsSVG = (k) => PIPS[k].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="2.3" class="f"/>').join('');

  // ------------------------------------------------------------------
  // Difficulté (niveaux 1 → 40)
  // 1–5 : 3 catégories × 3 (dieux, objets, lieux), cartes = et ≠
  // 6–11 : 3 × 4 avec le rang (cartes ↔ et ··›)
  // 12–31 : 4 × 4 (dieux, objets, lieux, rang), moins de cartes « = » au fil des niveaux
  // 32–40 : 3 × 5 avec le rang, cartes surtout indirectes
  // ------------------------------------------------------------------
  function params(level, variant) {
    level = Math.max(1, level || 1);
    let cats, n, mix;
    // début très doux : deux familles seulement (une seule petite grille), surtout des « = »
    if (level <= 3) { cats = ['god', 'obj']; n = 3; mix = { eq: 3, neq: 1, next: 0, left: 0 }; }
    else if (level <= 6) { cats = ['god', 'obj']; n = 4; mix = { eq: 2.5, neq: 1.5, next: 0, left: 0 }; }
    else if (level <= 9) { cats = ['god', 'obj', 'place']; n = 3; mix = { eq: 3, neq: 2, next: 0, left: 0 }; }
    else if (level <= 13) { cats = ['god', 'obj', 'order']; n = 4; mix = { eq: 2, neq: 2, next: 1, left: 1 }; }
    else if (level <= 20) { cats = ['god', 'obj', 'place', 'order']; n = 4; mix = { eq: 1.5, neq: 2, next: 1.2, left: 1.2 }; }
    else if (level <= 31) { cats = ['god', 'obj', 'place', 'order']; n = 4; mix = { eq: 0.8, neq: 2, next: 1.5, left: 1.5 }; }
    else { cats = ['god', 'obj', 'order']; n = 5; mix = { eq: 0.6, neq: 2, next: 1.6, left: 1.6 }; }
    return {
      variant: variant || 'classic', cats, k: cats.length, n, mix,
      trim: level < 7 ? 0 : level < 12 ? 0.5 : 1 // part des cartes superflues retirées (plus = plus dur)
    };
  }

  // ------------------------------------------------------------------
  // Moteur : une grille par paire de catégories (a < b), N×N cases : 0 inconnu, 1 oui, -1 non
  // ------------------------------------------------------------------
  function mkState(K, N, O) {
    const G = {};
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) G[a * K + b] = new Int8Array(N * N);
    return { K, N, O, G };
  }
  const getv = (S, a, x, b, y) => (a < b ? S.G[a * S.K + b][x * S.N + y] : S.G[b * S.K + a][y * S.N + x]);
  const setv = (S, a, x, b, y, v) => { if (a < b) S.G[a * S.K + b][x * S.N + y] = v; else S.G[b * S.K + a][y * S.N + x] = v; };
  const copyState = (S) => { const T = mkState(S.K, S.N, S.O); for (const k in S.G) T.G[k].set(S.G[k]); return T; };
  const sameState = (S, T) => { for (const k in S.G) { const a = S.G[k], b = T.G[k]; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; } return true; };
  const complete = (S) => { for (const k in S.G) if (S.G[k].includes(0)) return false; return true; };

  // Déductions, des plus simples aux plus fines. emit(d) renvoie true pour s'arrêter (astuce : une seule).
  // d = { a, x, b, y, v, clues: [indices de cartes], cells: [[a, x, b, y], …] (cases qui justifient) }
  function deduce(S, clues, emit) {
    const { K, N, O } = S;
    const g = (a, x, b, y) => getv(S, a, x, b, y);
    // 1. lecture directe des cartes (et : deux icônes d'une carte ↔ / ··› ne vont jamais ensemble)
    for (let i = 0; i < clues.length; i++) {
      const q = clues[i], ca = q.a[0], xa = q.a[1], cb = q.b[0], xb = q.b[1];
      if (ca === cb || g(ca, xa, cb, xb) !== 0) continue;
      if (emit({ a: ca, x: xa, b: cb, y: xb, v: q.t === 'eq' ? 1 : -1, clues: [i], cells: [], kind: 'card', t: q.t })) return true;
    }
    // 2. une seule case ✓ par ligne et par colonne de chaque grille
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
      const M = S.G[a * K + b];
      for (let line = 0; line < 2; line++) {
        for (let p = 0; p < N; p++) {
          let yes = -1; const unk = [], nos = [];
          for (let q = 0; q < N; q++) {
            const v = line ? M[q * N + p] : M[p * N + q];
            if (v === 1) yes = q; else if (v === 0) unk.push(q); else nos.push(q);
          }
          const cell = (q) => (line ? [a, q, b, p] : [a, p, b, q]);
          if (yes >= 0) {
            for (const q of unk) { const c = cell(q); if (emit({ a: c[0], x: c[1], b: c[2], y: c[3], v: -1, clues: [], cells: [cell(yes)], kind: 'yes', line })) return true; }
          } else if (unk.length === 1) {
            const c = cell(unk[0]);
            if (emit({ a: c[0], x: c[1], b: c[2], y: c[3], v: 1, clues: [], cells: nos.map(cell), kind: 'last', line })) return true;
          }
        }
      }
    }
    // 3. transitivité : A = B, et B (≠ ou =) C  ⇒  A (≠ ou =) C
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
      if (a === b) continue;
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        if (g(a, x, b, y) !== 1) continue;
        for (let c = 0; c < K; c++) {
          if (c === a || c === b) continue;
          for (let z = 0; z < N; z++) {
            const v2 = g(b, y, c, z);
            if (v2 !== 0 && g(a, x, c, z) === 0 && emit({ a, x, b: c, y: z, v: v2, clues: [], cells: [[a, x, b, y], [b, y, c, z]], kind: 'trans' })) return true;
          }
        }
      }
    }
    // 4. cartes de rang : chaque rang encore possible doit trouver un partenaire compatible
    if (O >= 0) {
      const ranks = (c, x) => { const r = []; for (let o = 0; o < N; o++) if (c === O ? o === x : g(c, x, O, o) !== -1) r.push(o); return r; };
      for (let i = 0; i < clues.length; i++) {
        const q = clues[i];
        if (q.t !== 'next' && q.t !== 'left') continue;
        const rel = q.t === 'next' ? (u, v) => Math.abs(u - v) === 1 : (u, v) => u < v;
        const [c1, x1] = q.a, [c2, x2] = q.b;
        const P1 = ranks(c1, x1), P2 = ranks(c2, x2);
        const noCells = (c, x) => { const r = []; if (c === O) return r; for (let o = 0; o < N; o++) if (g(c, x, O, o) === -1) r.push([c, x, O, o]); return r; };
        if (c1 !== O) for (const o of P1) {
          if (g(c1, x1, O, o) === 0 && !P2.some((p) => rel(o, p)) &&
            emit({ a: c1, x: x1, b: O, y: o, v: -1, clues: [i], cells: noCells(c2, x2), kind: 'rank', t: q.t, first: true })) return true;
        }
        if (c2 !== O) for (const o of P2) {
          if (g(c2, x2, O, o) === 0 && !P1.some((p) => rel(p, o)) &&
            emit({ a: c2, x: x2, b: O, y: o, v: -1, clues: [i], cells: noCells(c1, x1), kind: 'rank', t: q.t, first: false })) return true;
        }
      }
    }
    // 5. élimination croisée : A et C ne peuvent se rejoindre par aucun B  ⇒  A ≠ C
    for (let a = 0; a < K; a++) for (let c = a + 1; c < K; c++) {
      for (let b = 0; b < K; b++) {
        if (b === a || b === c) continue;
        for (let x = 0; x < N; x++) for (let z = 0; z < N; z++) {
          if (g(a, x, c, z) !== 0) continue;
          let ok = true;
          for (let y = 0; y < N && ok; y++) if (g(a, x, b, y) !== -1 && g(b, y, c, z) !== -1) ok = false;
          if (!ok) continue;
          const cells = [];
          for (let y = 0; y < N; y++) cells.push(g(a, x, b, y) === -1 ? [a, x, b, y] : [b, y, c, z]);
          if (emit({ a, x, b: c, y: z, v: -1, clues: [], cells, kind: 'cross' })) return true;
        }
      }
    }
    return false;
  }

  // phrase d'explication d'une déduction (la case jouée est entourée d'or, ses raisons surlignées)
  function explainOracle(d) {
    const mark = d.v === 1 ? '✓' : '✗';
    if (d.fallback) return 'Coup de pouce : rien de simple ici, alors je coche ✓ la case dorée.';
    if (d.kind === 'card') {
      if (d.t === 'eq') return 'La carte = surlignée dit que ces deux icônes vont ensemble : ✓ sur la case dorée.';
      if (d.t === 'neq') return 'La carte ≠ surlignée dit que ces deux icônes ne vont jamais ensemble : ✗ sur la case dorée.';
      return 'La carte ' + (d.t === 'next' ? '↔' : '··›') + ' surlignée place ces deux icônes à des rangs différents : elles ne vont pas ensemble, ✗.';
    }
    // grille (a < b) : la catégorie 0 est en lignes, les autres paires ont la plus petite catégorie en colonnes
    const word = (d.line === 0) === (d.a === 0) ? 'ligne' : 'colonne';
    if (d.kind === 'yes') return 'Sa ' + word + ' a déjà un ✓ (surligné), et il n\'y en a qu\'un par ' + word + ' : ✗ sur la case dorée.';
    if (d.kind === 'last') return 'Toutes les autres cases de sa ' + word + ' sont barrées (surlignées) : il ne reste que la case dorée, ✓.';
    if (d.kind === 'trans') return d.v === 1
      ? 'Ces deux icônes vont avec la même troisième (cases surlignées) : elles vont donc ensemble, ✓.'
      : 'L\'une va avec une troisième icône, qui ne va pas avec l\'autre (cases surlignées) : ✗ sur la case dorée.';
    if (d.kind === 'rank') {
      const ko = d.cells.length ? ' (✗ surlignés)' : '';
      if (d.t === 'next') return 'Carte ↔ surlignée : à ce rang, l\'autre icône n\'aurait aucun rang voisin possible' + ko + '. ✗ sur la case dorée.';
      return 'Carte ··› surlignée : à ce rang, l\'autre icône ne pourrait pas venir ' + (d.first ? 'après' : 'avant') + ko + '. ✗ sur la case dorée.';
    }
    if (d.kind === 'cross') return 'Aucune icône de l\'autre catégorie ne peut relier ces deux-là (✗ surlignés) : elles ne vont pas ensemble, ✗.';
    return 'Les cartes et cases surlignées imposent ' + mark + ' sur la case dorée.';
  }

  // applique toutes les déductions jusqu'au point fixe
  function propagate(S, clues) {
    let changed = true, guard = 0;
    while (changed && guard++ < 400) {
      changed = false;
      deduce(S, clues, (d) => {
        if (getv(S, d.a, d.x, d.b, d.y) === 0) { setv(S, d.a, d.x, d.b, d.y, d.v); changed = true; }
        return false;
      });
    }
    return S;
  }

  // ------------------------------------------------------------------
  // Génération : solution au hasard, puis cartes jusqu'à résolution complète par déduction,
  // puis retrait des cartes superflues.
  // ------------------------------------------------------------------
  function buildOnce(rng, p) {
    const K = p.k, N = p.n, O = p.cats.indexOf('order');
    // ent[c][x] = entité (= dieu) de l'objet x de la catégorie c ; item[c][e] l'inverse
    const item = [], ent = [];
    for (let c = 0; c < K; c++) {
      const perm = c === 0 ? [...Array(N).keys()] : rng.shuffle([...Array(N).keys()]);
      item.push(perm);
      const inv = new Array(N);
      perm.forEach((x, e) => { inv[x] = e; });
      ent.push(inv);
    }
    const rank = (c, x) => (c === O ? x : item[O][ent[c][x]]);
    const truth = mkState(K, N, O);
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) setv(truth, a, x, b, y, ent[a][x] === ent[b][y] ? 1 : -1);
    }
    // toutes les cartes vraies possibles, tirées au hasard pondéré par type
    const pool = [];
    const add = (t, a, b) => { const w = p.mix[t]; if (w > 0) pool.push({ t, a, b, key: -Math.log(1 - rng()) / w }); };
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
        if (ent[a][x] === ent[b][y]) add('eq', [a, x], [b, y]);
        else add('neq', [a, x], [b, y]);
      }
    }
    if (O >= 0) {
      const its = [];
      for (let c = 0; c < K; c++) if (c !== O) for (let x = 0; x < N; x++) its.push([c, x]);
      for (let i = 0; i < its.length; i++) for (let j = 0; j < its.length; j++) {
        if (i === j) continue;
        const A = its[i], B = its[j];
        if (ent[A[0]][A[1]] === ent[B[0]][B[1]]) continue;
        const ra = rank(A[0], A[1]), rb = rank(B[0], B[1]);
        if (i < j && Math.abs(ra - rb) === 1) add('next', A, B);
        if (ra < rb) add('left', A, B);
      }
    }
    pool.sort((u, v) => u.key - v.key);
    let clues = [];
    let S = mkState(K, N, O);
    for (const cand of pool) {
      const before = copyState(S);
      clues.push({ t: cand.t, a: cand.a, b: cand.b });
      propagate(S, clues);
      if (sameState(S, before)) clues.pop(); // carte sans effet pour l'instant : on l'écarte
      if (complete(S)) break;
    }
    // retrait des cartes superflues (du dernier ajout vers le premier)
    for (let i = clues.length - 1; i >= 0; i--) {
      if (rng() >= p.trim) continue;
      const test = clues.slice(0, i).concat(clues.slice(i + 1));
      if (complete(propagate(mkState(K, N, O), test))) clues = test;
    }
    const final = propagate(mkState(K, N, O), clues);
    const ok = complete(final) && sameState(final, truth);
    return { clues: rng.shuffle(clues), item, ent, truth, ok };
  }

  function generate(rng, p) {
    const N = p.n;
    // icônes tirées dans chaque catégorie (le rang garde ses dés 1..N dans l'ordre)
    const icons = p.cats.map((cat) => (cat === 'order' ? [...Array(N).keys()] : rng.shuffle([...Array(5).keys()]).slice(0, N)));
    let best = null, last = null;
    const tries = p.trim >= 1 ? 2 : 1;
    for (let t = 0; (t < tries || !best) && t < 8; t++) {
      const r = last = buildOnce(rng, p);
      if (!r.ok) continue; // (ne devrait jamais arriver : le moteur ne fait que des déductions sûres)
      if (!best || r.clues.length < best.clues.length) best = r;
    }
    best = best || last;
    return Object.assign({ clues: best.clues, sol: best.ent, icons }, p);
  }

  // résolution complète (tests) : la grille de vérité à partir de la solution
  function truthOf(pz) {
    const K = pz.k, N = pz.n, S = mkState(K, N, pz.cats.indexOf('order'));
    for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
      for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) setv(S, a, x, b, y, pz.sol[a][x] === pz.sol[b][y] ? 1 : -1);
    }
    return S;
  }

  // nombre de solutions (recherche exhaustive, pour vérifier l'unicité dans les tests)
  function countSolutions(pz, limit) {
    const K = pz.k, N = pz.n, O = pz.cats.indexOf('order');
    const perms = [];
    (function rec(arr, used) {
      if (arr.length === N) { perms.push(arr.slice()); return; }
      for (let i = 0; i < N; i++) if (!used[i]) { used[i] = true; arr.push(i); rec(arr, used); arr.pop(); used[i] = false; }
    })([], []);
    // perm[c][e] = objet de la catégorie c pour l'entité e
    const cur = [[...Array(N).keys()]];
    let count = 0;
    const entOf = (c, x) => cur[c].indexOf(x);
    const rankOf = (e) => (O >= 0 ? cur[O][e] : 0);
    function ok() {
      return pz.clues.every((q) => {
        const ea = entOf(q.a[0], q.a[1]), eb = entOf(q.b[0], q.b[1]);
        if (q.t === 'eq') return ea === eb;
        if (q.t === 'neq') return ea !== eb;
        if (ea === eb) return false;
        const ra = rankOf(ea), rb = rankOf(eb);
        return q.t === 'next' ? Math.abs(ra - rb) === 1 : ra < rb;
      });
    }
    (function rec(c) {
      if (count >= limit) return;
      if (c === K) { if (ok()) count++; return; }
      for (const pm of perms) { cur[c] = pm; rec(c + 1); if (count >= limit) return; }
      cur.length = c;
    })(1);
    return count;
  }

  // ------------------------------------------------------------------
  // Affichage
  // ------------------------------------------------------------------
  const badge = (pz, c, x, cls) => {
    const cat = CATS[pz.cats[c]];
    const glyph = pz.cats[c] === 'order' ? pipsSVG(x) : cat.items[pz.icons[c][x]];
    return '<span class="orc-b' + (cls ? ' ' + cls : '') + '" style="--bc:' + cat.col + ';--bb:' + cat.bg + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + glyph + '</svg></span>';
  };
  const SYM = {
    eq: '<svg viewBox="0 0 24 24" class="orc-sym eq"><path d="M5 9h14M5 15h14"/></svg>',
    neq: '<svg viewBox="0 0 24 24" class="orc-sym neq"><path d="M5 9h14M5 15h14M15.5 4.5l-7 15"/></svg>',
    next: '<svg viewBox="0 0 24 24" class="orc-sym next"><path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>',
    left: '<svg viewBox="0 0 24 24" class="orc-sym left"><circle cx="4.5" cy="12" r="1.6" class="f"/><circle cx="9.5" cy="12" r="1.6" class="f"/><path d="M14 6.5l5.5 5.5-5.5 5.5"/></svg>'
  };
  const MARK_NO = '<svg viewBox="0 0 24 24" class="orc-m"><path d="M7.5 7.5l9 9M16.5 7.5l-9 9"/></svg>';
  const MARK_YES = '<svg viewBox="0 0 24 24" class="orc-m"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg>';

  function create(host, puzzle, api) {
    const K = puzzle.k, N = puzzle.n, O = puzzle.cats.indexOf('order');
    const clues = puzzle.clues;
    const truth = truthOf(puzzle);
    // marques posées par le joueur (0 rien, 1 ✓, -1 ✗) ; les ✗ automatiques sont déduites à l'affichage
    const marks = mkState(K, N, O);
    const history = [];
    const used = new Set(); // cartes que le joueur a rangées (estompées)
    let autoX = C.store.settings.oracleAuto !== false;
    let won = false;

    const rowCats = [0];
    for (let c = K - 1; c >= 2; c--) rowCats.push(c);
    const colCats = [];
    for (let c = 1; c < K; c++) colCats.push(c);

    const box = document.createElement('div');
    box.className = 'orc';
    const clueBox = document.createElement('div');
    clueBox.className = 'orc-clues';
    const clueEls = clues.map((q, i) => {
      const d = document.createElement('button');
      d.className = 'orc-clue t-' + q.t;
      d.dataset.i = i;
      d.innerHTML = badge(puzzle, q.a[0], q.a[1]) + SYM[q.t] + badge(puzzle, q.b[0], q.b[1]);
      clueBox.appendChild(d);
      return d;
    });
    const grid = document.createElement('div');
    grid.className = 'orc-grid';
    box.appendChild(clueBox);
    box.appendChild(grid);
    host.appendChild(box);

    // bascule ✗ automatiques, dans le coin vide de la grille
    const auto = document.createElement('button');
    auto.className = 'orc-auto';
    auto.setAttribute('aria-label', 'Croix automatiques');
    auto.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4.5 12.5l3 3 6-6.5" class="ok"/><path d="M15 15l4 4M19 15l-4 4M15.5 4.5l3 3M18.5 4.5l-3 3"/></svg>';
    auto.addEventListener('click', () => {
      autoX = !autoX;
      C.store.settings.oracleAuto = autoX; C.save();
      C.sfx.tap(); render(); check();
    });

    // cases : clé canonique (a < b)
    const cellEls = {};
    const keyOf = (a, x, b, y) => (a < b ? a + ':' + x + ':' + b + ':' + y : b + ':' + y + ':' + a + ':' + x);
    const blocks = [];
    rowCats.forEach((r, ri) => colCats.forEach((c, ci) => {
      if (r !== 0 && c >= r) return;
      const bl = document.createElement('div');
      bl.className = 'orc-block';
      grid.appendChild(bl);
      blocks.push({ el: bl, ri, ci });
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const b = document.createElement('button');
        b.className = 'orc-cell' + (j < N - 1 ? ' r' : '') + (i < N - 1 ? ' d' : '');
        // ligne : objet i de la catégorie r ; colonne : objet j de la catégorie c
        b.dataset.k = keyOf(r, i, c, j);
        b._pos = { ri, ci, i, j };
        grid.appendChild(b);
        cellEls[b.dataset.k] = b;
      }
    }));
    const heads = [];
    colCats.forEach((c, ci) => { for (let j = 0; j < N; j++) { const h = document.createElement('span'); h.className = 'orc-h col'; h.innerHTML = badge(puzzle, c, j); h._pos = { ci, j }; grid.appendChild(h); heads.push(h); } });
    rowCats.forEach((r, ri) => { for (let i = 0; i < N; i++) { const h = document.createElement('span'); h.className = 'orc-h row'; h.innerHTML = badge(puzzle, r, i); h._pos = { ri, i }; grid.appendChild(h); heads.push(h); } });
    grid.appendChild(auto);
    const cellEl = (a, x, b, y) => cellEls[keyOf(a, x, b, y)];

    // mise en page : tailles calculées pour tenir dans l'hôte (cartes au-dessus, grille dessous)
    let cs = 30;
    function fit() {
      const W = Math.max(260, (host.clientWidth || 340) - 8);
      // le plateau grandit avec son contenu : on vise la hauteur libre de l'écran de jeu
      const play = host.closest && host.closest('#play');
      // (pas la hauteur de l'hôte elle-même, qui suit le contenu : elle ferait grossir la grille en boucle)
      const H = Math.max(320, (play && play.clientHeight ? play.clientHeight - 300 : host.clientHeight || 560) - 8);
      const nb = K - 1;
      let pick = 18;
      for (let s = 46; s >= 18; s--) {
        const bg = Math.max(4, Math.round(s * 0.2)), g0 = 5;
        const gw = Math.round(s * 0.92) + g0 + nb * N * s + (nb - 1) * bg;
        if (gw > W) continue;
        const bs = Math.round(Math.min(34, Math.max(21, s * 0.8)));
        const cw = bs * 2.72 + 18, ch = bs + 14; // (carte : 2 icônes + signe + marges, voir oracle.css)
        const per = Math.max(1, Math.floor((W + 6) / (cw + 6)));
        const ch2 = Math.ceil(clues.length / per) * (ch + 6);
        if (gw + ch2 + 14 <= H) { pick = s; break; }
      }
      cs = pick;
      const hs = Math.round(cs * 0.92), bg = Math.max(4, Math.round(cs * 0.2)), g0 = 5;
      const X = (ci, j) => hs + g0 + ci * (N * cs + bg) + j * cs;
      const gw = hs + g0 + nb * N * cs + (nb - 1) * bg;
      grid.style.width = gw + 'px';
      grid.style.height = gw + 'px';
      box.style.setProperty('--cs', cs + 'px');
      box.style.setProperty('--bs', Math.round(Math.min(34, Math.max(21, cs * 0.8))) + 'px');
      box.style.setProperty('--gw', gw + 'px');
      const place = (el, x, y, w, h) => { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; };
      blocks.forEach(({ el, ri, ci }) => place(el, X(ci, 0) - 3, X(ri, 0) - 3, N * cs + 6, N * cs + 6));
      Object.values(cellEls).forEach((el) => { const p = el._pos; place(el, X(p.ci, p.j), X(p.ri, p.i), cs, cs); });
      heads.forEach((h) => {
        const p = h._pos;
        if (p.ci != null) place(h, X(p.ci, p.j), 0, cs, hs); else place(h, 0, X(p.ri, p.i), hs, cs);
      });
      place(auto, 2, 2, hs - 4, hs - 4);
    }
    fit();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }

    // une ligne ou une colonne de la grille porte-t-elle déjà un ✓ ?
    function hasYes(a, x, b, y) {
      for (let q = 0; q < N; q++) {
        if (q !== y && getv(marks, a, x, b, q) === 1) return true;
        if (q !== x && getv(marks, a, q, b, y) === 1) return true;
      }
      return false;
    }
    // valeur vue par le joueur (✗ automatiques comprises)
    function shown(a, x, b, y) {
      const m = getv(marks, a, x, b, y);
      if (m !== 0) return m;
      return autoX && hasYes(a, x, b, y) ? -2 : 0;
    }
    function render() {
      for (const k in cellEls) {
        const [a, x, b, y] = k.split(':').map(Number);
        const v = shown(a, x, b, y);
        const el = cellEls[k];
        if (el._v === v) continue;
        el._v = v;
        el.classList.toggle('yes', v === 1);
        el.classList.toggle('no', v === -1);
        el.classList.toggle('auto', v === -2);
        el.innerHTML = v === 1 ? MARK_YES : v ? MARK_NO : '';
      }
      auto.classList.toggle('on', autoX);
      clueEls.forEach((el, i) => el.classList.toggle('used', used.has(i)));
    }

    function setMark(a, x, b, y, v, record) {
      const prev = getv(marks, a, x, b, y);
      if (prev === v) return;
      if (record !== false) history.push([a, x, b, y, prev]);
      setv(marks, a, x, b, y, v);
    }

    function check() {
      if (won) return;
      for (const k in truth.G) {
        const T = truth.G[k], M = marks.G[k];
        for (let i = 0; i < T.length; i++) if ((T[i] === 1) !== (M[i] === 1)) return;
      }
      won = true;
      box.classList.add('won');
      setTimeout(() => api.onWin(), 450);
    }

    grid.addEventListener('click', (e) => {
      const el = e.target.closest('.orc-cell');
      if (!el || won) return;
      const [a, x, b, y] = el.dataset.k.split(':').map(Number);
      const v = shown(a, x, b, y);
      // vide → ✗ → ✓ → vide (une ✗ automatique passe directement à ✓)
      const next = v === 0 ? -1 : v === 1 ? 0 : 1;
      setMark(a, x, b, y, next);
      if (next === 1) C.sfx.place(); else C.sfx.tap();
      el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      render(); api.onChange(); check();
    });
    clueBox.addEventListener('click', (e) => {
      const el = e.target.closest('.orc-clue');
      if (!el) return;
      const i = +el.dataset.i;
      if (used.has(i)) used.delete(i); else used.add(i);
      C.sfx.tap(); render();
    });

    render();

    return {
      status() {
        if (won) return 'L\'Oracle a parlé';
        let n = 0;
        for (const k in marks.G) n += marks.G[k].filter((v) => v === 1).length;
        return n + ' / ' + (N * K * (K - 1) / 2) + ' ✓';
      },
      undo() {
        if (won || !history.length) return;
        const [a, x, b, y, v] = history.pop();
        setv(marks, a, x, b, y, v);
        render(); api.onChange();
      },
      reset() {
        if (won) return;
        for (const k in marks.G) marks.G[k].fill(0);
        history.length = 0; used.clear();
        render(); api.onChange();
      },
      // résolution directe (outil de test)
      solve() {
        if (won) return;
        for (const k in truth.G) marks.G[k].set(truth.G[k]);
        render(); check();
      },
      // astuce : corrige d'abord une marque fausse, sinon pose la prochaine case forcée
      // et surligne les cartes / cases qui la justifient
      hint() {
        if (won) return false;
        for (const k in cellEls) {
          const [a, x, b, y] = k.split(':').map(Number);
          const m = getv(marks, a, x, b, y), t = getv(truth, a, x, b, y);
          if (m !== 0 && m !== t) {
            setMark(a, x, b, y, 0);
            render(); api.onChange();
            return { text: m === 1 ? 'Ce ✓ est faux : ces deux icônes ne vont pas ensemble. Je l\'efface.' : 'Cette ✗ est fausse : ces deux icônes vont ensemble. Je l\'efface.', where: [cellEls[k]], why: [] };
          }
        }
        // état vu par le joueur (✗ automatiques comprises)
        const S = mkState(K, N, O);
        for (const k in cellEls) {
          const [a, x, b, y] = k.split(':').map(Number);
          const v = shown(a, x, b, y);
          setv(S, a, x, b, y, v === -2 ? -1 : v);
        }
        let d = null;
        deduce(S, clues, (dd) => { d = dd; return true; });
        if (!d) {
          // filet de sécurité (ne devrait pas arriver) : une case ✓ de la solution
          for (const k in cellEls) {
            const [a, x, b, y] = k.split(':').map(Number);
            if (getv(truth, a, x, b, y) === 1 && getv(marks, a, x, b, y) !== 1) { d = { a, x, b: b, y, v: 1, clues: [], cells: [], fallback: true }; break; }
          }
          if (!d) return false;
        }
        setMark(d.a, d.x, d.b, d.y, d.v);
        if (d.v === 1) C.sfx.place(); else C.sfx.tap();
        render(); api.onChange(); check();
        const why = d.clues.map((i) => clueEls[i]).concat(d.cells.slice(0, 10).map((c) => cellEl(c[0], c[1], c[2], c[3]))).filter(Boolean);
        return { text: explainOracle(d), where: [cellEl(d.a, d.x, d.b, d.y)], why };
      },
      redraw() { fit(); },
      destroy() { if (ro) ro.disconnect(); }
    };
  }

  // ------------------------------------------------------------------
  // Tutoriel (viewBox 0 0 120 120)
  // ------------------------------------------------------------------
  const tB = (cat, k, x, y, s) => {
    const c = CATS[cat];
    s = s || 22;
    return '<g transform="translate(' + x + ' ' + y + ')"><rect width="' + s + '" height="' + s + '" rx="' + s * 0.28 + '" fill="' + c.bg + '"/>' +
      '<g class="orc-tg" transform="translate(' + s * 0.12 + ' ' + s * 0.12 + ') scale(' + (s * 0.76 / 24) + ')" style="color:' + c.col + '">' + (cat === 'order' ? pipsSVG(k) : c.items[k]) + '</g></g>';
  };
  const tSym = (t, x, y) => '<g class="orc-tg" transform="translate(' + x + ' ' + y + ') scale(.8)" style="color:var(--ink)">' + SYM[t].replace(/<\/?svg[^>]*>/g, '') + '</g>';
  const tCard = (y, a, t, b) => '<rect x="22" y="' + y + '" width="76" height="30" rx="10" fill="#fff" stroke="#d9cfe8" stroke-width="2"/>' + tB(a[0], a[1], 28, y + 4) + tSym(t, 50, y + 5) + tB(b[0], b[1], 70, y + 4);
  const tMini = (marksArr) => {
    // petite grille 3×3 : dieux (lignes) × objets (colonnes)
    let s = '';
    for (let j = 0; j < 3; j++) s += tB('obj', j, 44 + j * 22, 52, 18);
    for (let i = 0; i < 3; i++) s += tB('god', i, 20, 74 + i * 15, 14);
    s += '<rect x="42" y="72" width="66" height="47" rx="6" fill="#fff" stroke="#d9cfe8" stroke-width="2"/>';
    marksArr.forEach((m, k) => {
      const i = Math.floor(k / 3), j = k % 3, cx = 53 + j * 22, cy = 80 + i * 15;
      if (m === 1) s += '<path d="M' + (cx - 5) + ' ' + cy + 'l3.5 3.5 6.5-7" fill="none" stroke="#7058e0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
      if (m === -1) s += '<path d="M' + (cx - 3.5) + ' ' + (cy - 3.5) + 'l7 7M' + (cx + 3.5) + ' ' + (cy - 3.5) + 'l-7 7" stroke="#b9b0cf" stroke-width="2" stroke-linecap="round"/>';
    });
    return s;
  };
  const tArt = (body) => '<svg viewBox="0 0 120 120" class="tuto-art">' + body + '</svg>';
  const tFinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';

  C.register({
    id: 'oracle',
    name: 'L\'Oracle',
    tagline: 'Déchiffre les signes de l\'Oracle',
    accent: '#7a63e0',
    icon: '<svg viewBox="0 0 24 24"><path d="M12 3a7 7 0 0 1 7 7c0 3-2 5-4 6v3H9v-3c-2-1-4-3-4-6a7 7 0 0 1 7-7z" fill="currentColor"/></svg>',
    icon24: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 4v16"/><path d="M12.5 15.2l1.6 1.6 3.2-3.4"/><path d="M6.2 12.2l1.8 1.8M8 12.2 6.2 14"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Grille logique en icônes : relie chaque dieu à son objet, son lieu, son rang.' }
    ],
    rules: {
      classic: [
        'Chaque <b>dieu</b> a un seul objet, un seul lieu et un seul rang (les dés).',
        'Les <b>cartes</b> : = vont ensemble, ≠ jamais ensemble, ↔ rangs voisins, ··› la première icône passe avant la seconde.',
        'Touche une case : <b>✗</b>, puis <b>✓</b>, puis vide. Un ✓ barre tout seul sa ligne et sa colonne (bouton du coin pour l\'activer ou non).',
        'Touche une carte pour l\'estomper quand tu n\'en as plus besoin.'
      ]
    },
    tutorial: [
      { art: tArt(tCard(10, ['god', 0], 'eq', ['obj', 0]) + tMini([1, -1, -1, -1, 0, 0, -1, 0, 0])),
        text: 'Carte <b>=</b> : ces deux icônes vont ensemble. Coche ✓ leur case : le reste de sa ligne et de sa colonne se barre tout seul.' },
      { art: tArt(tCard(10, ['god', 1], 'neq', ['obj', 2]) + tMini([1, -1, -1, -1, 0, -1, -1, 0, 0]) + tFinger(97, 95)),
        text: 'Carte <b>≠</b> : jamais ensemble. Touche une case : <b>✗</b>, puis <b>✓</b>, puis vide. Touche une carte pour l\'estomper.' },
      { art: tArt(tCard(10, ['god', 0], 'next', ['god', 1]) + tCard(46, ['god', 2], 'left', ['god', 0]) +
          [0, 1, 2].map((k) => tB('order', k, 30 + k * 22, 88, 18)).join('')),
        text: 'Les dés donnent le <b>rang</b> : ↔ rangs voisins, ··› la première icône passe avant la seconde.' }
    ],
    params,
    generate,
    create,
    // (outils de test)
    _test: { countSolutions, truthOf, propagate, mkState, complete }
  });
})();
