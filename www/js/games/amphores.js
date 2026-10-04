// Amphores : le jeu des paires, avec une RÈGLE du jour affichée en haut :
//  - « Identiques » : même dessin ET même couleur (aux niveaux élevés, des cousins : même dessin, autre couleur) ;
//  - « Même dessin » : la couleur ne compte pas (une chouette rose va avec une chouette bleue) ;
//  - « Même couleur » : le dessin ne compte pas (une chouette rose va avec un soleil rose).
// Des amphores spéciales : l'amphore dorée (Œil d'Athéna, visible : un coup d'œil sur tout le plateau,
// au moment choisi) et Méduse (cachée : retournée, elle fait tourner d'un cran les amphores autour d'elle).
// Plus loin, la tempête : après quelques ratés, deux amphores cachées s'échangent sous tes yeux.
// Paires d'affilée : petit « ×2, ×3 » et la note qui monte.
(function () {
  'use strict';
  const C = window.Carnet;

  // ------------------------------------------------------------------
  // Motifs (viewBox 0 0 40 40) : pleins en currentColor, détails blancs (.w), traits (.s)
  // ------------------------------------------------------------------
  const MOTIFS = [
    // chouette d'Athéna
    '<path d="M10 8l4.5 4h11L30 8v15c0 7-4.5 11-10 11S10 30 10 23z"/><circle cx="15.6" cy="18.5" r="4" class="w"/><circle cx="24.4" cy="18.5" r="4" class="w"/>' +
      '<circle cx="15.6" cy="18.5" r="1.8"/><circle cx="24.4" cy="18.5" r="1.8"/><path d="M18.4 23.4 20 26l1.6-2.6z" class="w"/>',
    // rameau d'olivier
    '<path d="M8 33C15 25 23 16 32 7" class="s"/><ellipse cx="13" cy="23" rx="5.2" ry="2.3" transform="rotate(-75 13 23)"/>' +
      '<ellipse cx="19" cy="25" rx="5.2" ry="2.3" transform="rotate(10 19 25)"/><ellipse cx="19" cy="15" rx="5.2" ry="2.3" transform="rotate(-75 19 15)"/>' +
      '<ellipse cx="26" cy="17" rx="5.2" ry="2.3" transform="rotate(10 26 17)"/><circle cx="25" cy="9" r="2.6"/><circle cx="31" cy="13" r="2.6"/>',
    // trirème
    '<path d="M4 23h32l-5 7H9z"/><path d="M19 5v16h-10z"/><path d="M21 7v14h9z"/><path d="M12 30l-2 5M17.5 30l-1 5M22.5 30l1 5M28 30l2 5" class="s"/>',
    // casque grec : cimier, calotte, fente en T
    '<path d="M9 9.5C11 2.5 29 2.5 31 9.5 27 7 13 7 9 9.5z"/><path d="M8 35V21C8 14.5 13.5 11 20 11s12 3.5 12 10v14h-8v-8h-8v8z"/>' +
      '<path d="M12.5 19.5h15v3.2h-5.7V31h-3.6v-8.3h-5.7z" class="w"/>',
    // lyre
    '<path d="M12 7c-4 6-3 14 2 18M28 7c4 6 3 14-2 18" class="s"/><rect x="10.5" y="24" width="19" height="7" rx="2.5"/>' +
      '<path d="M11 11h18M16.5 11v13M20 11v13M23.5 11v13" class="s t"/>',
    // dauphin
    '<path d="M5 25C9 15 19 10 29 13l3.5-4.5 1 6.5c2 1.5 2.5 3.8.5 6-6-2.5-14-1.5-20 6l-1.7-4.3L5 25z"/><circle cx="27.5" cy="16.5" r="1.4" class="w"/>' +
      '<path d="M17 16.5l2-4.5 3 3.5z"/>',
    // soleil
    '<circle cx="20" cy="20" r="7.5"/><path d="M20 4.5v4M20 31.5v4M4.5 20h4M31.5 20h4M9 9l2.8 2.8M28.2 28.2 31 31M9 31l2.8-2.8M28.2 11.8 31 9" class="s"/>',
    // grappe de raisin (Dionysos)
    '<path d="M20 11V5.5l5-2.5" class="s t"/><ellipse cx="27" cy="7" rx="5" ry="2.6" transform="rotate(-25 27 7)"/>' +
      '<circle cx="12.5" cy="15" r="4.2"/><circle cx="20.5" cy="15" r="4.2"/><circle cx="28.5" cy="15" r="4.2"/>' +
      '<circle cx="16.5" cy="22.5" r="4.2"/><circle cx="24.5" cy="22.5" r="4.2"/><circle cx="20.5" cy="30" r="4.2"/>',
    // colonne
    '<path d="M8 6h24v4H8zM11 10h18v3H11zM12 13h16v16H12zM10 29h20v3H10zM8 32h24v3.5H8z"/><path d="M16 15v12M20 15v12M24 15v12" class="s t w2"/>',
    // méandre (clé grecque)
    '<path d="M6 32V9h24v18H15v-10h8" class="s b"/>',
    // croissant de lune
    '<path d="M25 5a15 15 0 1 0 11 24A12.5 12.5 0 0 1 25 5z"/>',
    // trident de Poséidon
    '<path d="M20 35V13M11 7v7a9 9 0 0 0 18 0V7" class="s"/><path d="M20 4l-3 5h6zM11 4l-2.5 4.5h5zM29 4l-2.5 4.5h5z"/>',
    // éclair de Zeus
    '<path d="M24 3 9.5 22.5h9L15 37l16-21.5h-9.2L26 3z"/>',
    // étoile
    '<path d="M20 4.5l4.6 9.6 10.4 1.3-7.6 7.3 1.9 10.4L20 28l-9.3 5.1 1.9-10.4L5 15.4l10.4-1.3z"/>',
    // coquille
    '<path d="M20 6C11 6 5 13 5 21c0 3 1 5.3 3 7h24c2-1.7 3-4 3-7 0-8-6-15-15-15z"/><path d="M20 9.5v17M14 11l2.6 15.5M26 11l-2.6 15.5M9 16.5l4.6 10M31 16.5l-4.6 10" class="s t w2"/>' +
      '<rect x="14.5" y="29" width="11" height="5" rx="2.2"/>',
    // poisson
    '<path d="M4 20c5.5-8.5 14.5-10.5 23-5l7.5-6v22l-7.5-6C18.5 30.5 9.5 28.5 4 20z"/><circle cx="11.5" cy="18.3" r="2" class="w"/>',
    // bouclier rond
    '<circle cx="20" cy="20" r="15.5"/><circle cx="20" cy="20" r="9.5" class="w"/><circle cx="20" cy="20" r="5"/>'
  ];
  const MOTIF_NAMES = ['chouette', 'rameau', 'trirème', 'casque', 'lyre', 'dauphin', 'soleil', 'raisin', 'colonne', 'méandre', 'lune',
    'trident', 'éclair', 'étoile', 'coquille', 'poisson', 'bouclier'];
  // couleurs de motifs : franches, bien distinctes entre elles ; chacune a son symbole (réglage « symboles sur les couleurs »)
  const COLORS = ['#e4579f', '#3d8ee8', '#ef9a1c', '#43a82a', '#8f6fe8', '#e8553d', '#14a89e', '#d6a300'];
  const COLOR_NAMES = ['rose', 'bleu', 'orange', 'vert', 'violet', 'rouge', 'turquoise', 'doré'];
  const GLYPHS = [
    '<circle cx="5" cy="5" r="3.6"/>',
    '<path d="M5 1.2 9 8.6H1z"/>',
    '<rect x="1.6" y="1.6" width="6.8" height="6.8" rx=".6"/>',
    '<path d="M5 .8 9.2 5 5 9.2.8 5z"/>',
    '<path d="M5 .6l1.3 2.9 3.2.3-2.4 2.1.7 3.1L5 7.4 2.2 9l.7-3.1L.5 3.8l3.2-.3z"/>',
    '<path d="M3.7 1h2.6v2.7H9v2.6H6.3V9H3.7V6.3H1V3.7h2.7z"/>',
    '<circle cx="5" cy="5" r="3.2" fill="none" stroke-width="2"/>',
    '<path d="M5 8.8 1 1.4h8z"/>'
  ];

  // amphore du dos des tuiles
  const BACK = '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="am-body" d="M15 5h10v3c0 1.2 1 2.2 2.2 2.8C31 12.8 33 16.8 33 21.5c0 6.8-4.6 11.3-9 13.3V36h-8v-1.2c-4.4-2-9-6.5-9-13.3 0-4.7 2-8.7 5.8-10.7C14 10.2 15 9.2 15 8z"/>' +
    '<path class="am-line" d="M13 13c-4.5-.5-5.5 5-2 7.5M27 13c4.5-.5 5.5 5 2 7.5M9.5 20.5h21M11 25h18"/></svg>';
  // Œil d'Athéna (dos doré, puis face)
  const EYE = '<svg viewBox="0 0 40 40" class="amph-eye" aria-hidden="true"><path d="M3.5 20c5-8.5 11-12 16.5-12s11.5 3.5 16.5 12c-5 8.5-11 12-16.5 12S8.5 28.5 3.5 20z" class="e-white"/>' +
    '<circle cx="20" cy="20" r="7" class="e-iris"/><circle cx="20" cy="20" r="3.2" class="e-pupil"/><circle cx="22.4" cy="17.6" r="1.5" fill="#fff"/></svg>';
  // Méduse : bonne bouille verte, cheveux de serpents
  const MEDUSA = '<svg viewBox="0 0 40 40" class="amph-medusa" aria-hidden="true">' +
    '<path class="md-hair" d="M10 19C5 18 3 13 6 10c1.5 3 3.5 3.5 5.5 2.5M30 19c5-1 7-6 4-9-1.5 3-3.5 3.5-5.5 2.5M14 12c-2.5-4-.5-8 3-8.5.5 3 1.5 4.5 3.5 4.5M26 12c2.5-4 .5-8-3-8.5-.5 3-1.5 4.5-3.5 4.5"/>' +
    '<circle cx="20" cy="22" r="11.5" class="md-face"/><circle cx="15.8" cy="21" r="2.6" fill="#fff"/><circle cx="24.2" cy="21" r="2.6" fill="#fff"/>' +
    '<circle cx="16.3" cy="21.4" r="1.3" class="md-eye"/><circle cx="24.7" cy="21.4" r="1.3" class="md-eye"/><path d="M16.5 27.2q3.5 2.6 7 0" class="md-mouth"/>' +
    '<circle cx="5.6" cy="10" r="1.6" class="md-head"/><circle cx="34.4" cy="10" r="1.6" class="md-head"/><circle cx="17" cy="3.6" r="1.6" class="md-head"/><circle cx="23" cy="3.6" r="1.6" class="md-head"/></svg>';

  const RULES = {
    pareil: { name: 'Identiques', say: 'identiques (même dessin, même couleur)' },
    dessin: { name: 'Même dessin', say: 'du même dessin, peu importe la couleur' },
    couleur: { name: 'Même couleur', say: 'de la même couleur, peu importe le dessin' }
  };
  // petit dessin de la règle (deux formes côte à côte)
  const ruleIcon = (rule) => {
    const a = rule === 'couleur' ? ['#3d8ee8', '#3d8ee8'] : rule === 'dessin' ? ['#e4579f', '#3d8ee8'] : ['#e4579f', '#e4579f'];
    const s2 = rule === 'couleur' ? '<rect x="14" y="2.5" width="9" height="9" rx="1.5" fill="' + a[1] + '"/>' : rule === 'dessin'
      ? '<path d="M18.5 2 23 11h-9z" fill="' + a[1] + '"/>' : '<circle cx="18.5" cy="7" r="4.6" fill="' + a[1] + '"/>';
    const s1 = rule === 'dessin' ? '<path d="M6.5 2 11 11H2z" fill="' + a[0] + '"/>' : '<circle cx="6.5" cy="7" r="4.6" fill="' + a[0] + '"/>';
    return '<svg viewBox="0 0 25 14" class="amph-rule-ic" aria-hidden="true">' + s1 + s2 + '</svg>';
  };

  // ------------------------------------------------------------------
  // Difficulté (niveaux 1 → 40)
  // ------------------------------------------------------------------
  // [jusqu'au niveau, colonnes, rangées, amphores dorées, Méduses]
  const SIZES = [
    [3, 3, 3, 1, 0],   // 4 paires + l'amphore dorée
    [6, 3, 4, 0, 0],   // 6 paires
    [8, 4, 4, 0, 0],   // 8 paires
    [11, 4, 4, 1, 1],  // 7 paires + dorée + Méduse
    [15, 4, 5, 1, 1],  // 9 paires
    [21, 5, 5, 1, 2],  // 11 paires
    [28, 5, 6, 1, 1],  // 14 paires
    [34, 6, 6, 1, 1],  // 17 paires
    [999, 6, 6, 1, 3]  // 16 paires, 3 Méduses
  ];
  function params(level, variant) {
    const L = Math.max(1, Math.round(level || 1));
    const [, cols, rows, eyes, medusas] = SIZES.find((s) => L <= s[0]);
    const pairs = (cols * rows - eyes - medusas) / 2;
    return {
      variant: variant || 'classic', cols, rows, pairs, eyes, medusas,
      // règles possibles (tirées au sort par grille) : d'abord « identiques », puis les deux autres
      rules: L <= 5 ? ['pareil'] : L <= 8 ? ['pareil', 'dessin'] : ['pareil', 'dessin', 'couleur'],
      // motifs cousins (règle « identiques ») : de plus en plus nombreux
      similar: L < 12 ? 0 : Math.min(Math.floor(pairs / 2), Math.floor((L - 8) / 4)),
      // aperçu de toutes les tuiles au départ (ms), généreux au début
      peek: L <= 5 ? 3000 : L <= 10 ? 2200 : L <= 16 ? 1500 : L <= 22 ? 1000 : 0,
      // tempête : après `storm` ratés, `swaps` échanges d'amphores cachées
      storm: L >= 29 ? 3 : L >= 22 ? 4 : 0,
      swaps: L >= 29 ? 2 : 1
    };
  }

  const keyOf = (rule, t) => rule === 'dessin' ? 's' + t.s : rule === 'couleur' ? 'c' + t.c : t.s + ':' + t.c;

  function generate(rng, p) {
    const rule = rng.pick(p.rules);
    const shapes = rng.shuffle([...Array(MOTIFS.length).keys()]);
    const tiles = [];
    const other = (c) => { let d = rng.int(COLORS.length - 1); if (d >= c) d++; return d; };
    if (rule === 'dessin') {
      // un dessin par paire, deux couleurs différentes ; les couleurs se répètent d'une paire à l'autre (leurres)
      for (let k = 0; k < p.pairs; k++) {
        const c = rng.int(COLORS.length);
        tiles.push({ kind: 'pair', s: shapes[k], c }, { kind: 'pair', s: shapes[k], c: other(c) });
      }
    } else if (rule === 'couleur') {
      // une couleur par paire (au-delà de 8 paires, des groupes de 4), deux dessins différents ; dessins répétés (leurres)
      const cols = rng.shuffle([...Array(COLORS.length).keys()]);
      const pool = shapes.slice(0, Math.max(3, Math.ceil(p.pairs * 0.6)));
      for (let k = 0; k < p.pairs; k++) {
        const c = cols[k % cols.length];
        const s1 = rng.pick(pool);
        let s2 = rng.pick(pool);
        while (s2 === s1) s2 = rng.pick(pool);
        tiles.push({ kind: 'pair', s: s1, c }, { kind: 'pair', s: s2, c });
      }
    } else {
      const uniq = p.pairs - p.similar;
      const motifs = [];
      for (let i = 0; i < uniq; i++) motifs.push({ s: shapes[i], c: rng.int(COLORS.length) });
      // cousins : même dessin qu'un motif déjà présent, autre couleur
      for (let i = 0; i < p.similar; i++) {
        const base = motifs[i % uniq];
        const used = motifs.filter((m) => m.s === base.s).map((m) => m.c);
        const free = [...Array(COLORS.length).keys()].filter((c) => !used.includes(c));
        motifs.push({ s: base.s, c: rng.pick(free) });
      }
      motifs.forEach((m) => tiles.push({ kind: 'pair', s: m.s, c: m.c }, { kind: 'pair', s: m.s, c: m.c }));
    }
    for (let i = 0; i < p.eyes; i++) tiles.push({ kind: 'eye' });
    for (let i = 0; i < p.medusas; i++) tiles.push({ kind: 'medusa' });
    const deck = rng.shuffle([...Array(tiles.length).keys()]); // deck[position] = tuile
    return Object.assign({}, p, { rule, tiles, deck });
  }

  const motifSVG = (t) => '<svg viewBox="0 0 40 40" class="amph-mot" aria-hidden="true" style="color:' + COLORS[t.c] + '">' + MOTIFS[t.s] + '</svg>' +
    '<svg viewBox="0 0 10 10" class="amph-cb" aria-hidden="true">' + GLYPHS[t.c] + '</svg>';

  function create(host, puzzle, api) {
    const { cols, rows, tiles: defs, rule } = puzzle;
    const total = defs.length;
    const deck = puzzle.deck.slice();             // deck[position] = tuile
    const posOf = new Array(total);               // posOf[tuile] = position
    deck.forEach((t, pos) => { posOf[t] = pos; });
    const isPair = (t) => defs[t].kind === 'pair';
    const key = (t) => keyOf(rule, defs[t]);
    const found = new Array(total).fill(false);   // paire trouvée, œil utilisé, Méduse pétrifiée
    const seen = new Array(total).fill(0);
    let open = [];       // tuiles retournées non encore appariées (0, 1 ou 2)
    let phase = 'wait';  // wait | peek | play | busy | won
    let combo = 0, misses = 0, dead = false, flipBack = null, revealEnd = null;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
      timers.add(id);
      return id;
    };
    const calm = () => document.documentElement.classList.contains('a11y-motion') ||
      !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // --- construction ---
    const wrap = document.createElement('div');
    wrap.className = 'amph-wrap';
    const hud = document.createElement('div');
    hud.className = 'amph-hud';
    hud.innerHTML = '<span class="amph-rule r-' + rule + '">' + ruleIcon(rule) + '<b>' + RULES[rule].name + '</b></span>' +
      (puzzle.storm ? '<span class="amph-storm" role="img"></span>' : '');
    const stormEl = hud.querySelector('.amph-storm');
    const stormDots = [];
    if (stormEl) for (let k = 0; k < puzzle.storm; k++) { const i = document.createElement('i'); stormEl.appendChild(i); stormDots.push(i); }
    const box = document.createElement('div');
    box.className = 'amph';
    box.style.setProperty('--cols', cols);
    box.style.setProperty('--rows', rows);
    const els = defs.map((d, t) => {
      const b = document.createElement('button');
      b.className = 'amph-tile' + (d.kind !== 'pair' ? ' ' + d.kind : '');
      b.dataset.t = t;
      b.style.setProperty('--k', posOf[t]);
      const face = d.kind === 'eye' ? EYE : d.kind === 'medusa' ? MEDUSA : motifSVG(d);
      b.innerHTML = '<span class="amph-in"><span class="amph-back">' + (d.kind === 'eye' ? EYE : BACK) + '</span><span class="amph-face">' + face + '</span></span>';
      box.appendChild(b);
      return b;
    });
    const place = (t) => { const p = posOf[t]; els[t].style.gridArea = (Math.floor(p / cols) + 1) + ' / ' + (p % cols + 1); };
    defs.forEach((d, t) => place(t));
    wrap.appendChild(hud);
    wrap.appendChild(box);
    host.appendChild(wrap);
    if (rule !== 'pareil') hud.firstChild.classList.add('fresh'); // la règle inhabituelle se signale

    // taille des tuiles : la grille tient dans l'hôte
    function fit() {
      const w = (host.clientWidth || 340) - 8;
      const play = host.closest && host.closest('#play');
      const h = Math.max(200, (play && play.clientHeight ? play.clientHeight - 372 : host.clientHeight || 480) - 8);
      const gap = Math.max(6, Math.min(12, w / cols * 0.1));
      const t = Math.floor(Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows, 96));
      box.style.setProperty('--t', Math.max(36, t) + 'px');
      box.style.setProperty('--gap', gap + 'px');
    }
    fit();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }

    const nameOf = (t) => {
      const d = defs[t];
      if (d.kind === 'eye') return found[t] ? 'Œil d\'Athéna, déjà utilisé' : 'Amphore dorée : l\'Œil d\'Athéna, montre tout un instant';
      if (d.kind === 'medusa') return 'Méduse, pétrifiée';
      return MOTIF_NAMES[d.s] + ' ' + COLOR_NAMES[d.c];
    };
    function render() {
      const peeking = phase === 'peek' || phase === 'reveal';
      els.forEach((b, t) => {
        const d = defs[t];
        const shown = found[t] || open.includes(t) || b._peek === true || (peeking && d.kind !== 'eye');
        b.classList.toggle('open', shown);
        b.classList.toggle('found', found[t]);
        b.setAttribute('aria-label', shown || d.kind === 'eye' ? nameOf(t) : 'Amphore');
      });
      box.classList.toggle('peeking', peeking);
      stormDots.forEach((d, k) => d.classList.toggle('on', k < misses));
      if (stormEl) stormEl.setAttribute('aria-label', 'Tempête : ' + misses + ' raté' + (misses > 1 ? 's' : '') + ' sur ' + puzzle.storm);
    }

    // déplacements animés (Méduse, tempête) : on mesure avant / après, puis chaque tuile glisse de l'un à l'autre
    function relocate(moves, arc) {
      const before = moves.map(([t]) => els[t].getBoundingClientRect());
      moves.forEach(([t, p]) => { posOf[t] = p; deck[p] = t; place(t); });
      if (calm() || !els[0].animate) return;
      moves.forEach(([t], k) => {
        const a = before[k], b = els[t].getBoundingClientRect();
        const dx = a.left - b.left, dy = a.top - b.top;
        if (!dx && !dy) return;
        const lift = arc ? 'translate(' + dx / 2 + 'px,' + (dy / 2 - 18) + 'px) scale(1.12)' : 'translate(' + dx / 2 + 'px,' + dy / 2 + 'px) scale(1.06)';
        els[t].animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: lift, offset: 0.5 }, { transform: 'none' }],
          { duration: arc ? 900 : 650, easing: 'cubic-bezier(.35,.1,.25,1)' });
      });
    }

    const live = (t) => isPair(t) && !found[t];
    const partners = (t) => defs.map((_, u) => u).filter((u) => u !== t && live(u) && key(u) === key(t));

    function closeOpen() {
      clearTimeout(flipBack); flipBack = null;
      open = [];
    }

    // petit « ×2 » qui s'envole d'une paire réussie
    function comboPop(t) {
      if (combo < 2) return;
      const p = document.createElement('b');
      p.className = 'amph-combo';
      p.textContent = '×' + combo;
      const pos = posOf[t];
      p.style.gridArea = (Math.floor(pos / cols) + 1) + ' / ' + (pos % cols + 1);
      box.appendChild(p);
      later(() => p.remove(), 1000);
    }
    // éclats : l'amphore s'ouvre en étincelles
    function burst(t) {
      if (calm()) return;
      const s = document.createElement('span');
      s.className = 'amph-burst';
      s.style.color = defs[t].c != null ? COLORS[defs[t].c] : '';
      for (let k = 0; k < 8; k++) { const i = document.createElement('i'); i.style.setProperty('--a', (k * 45 + 22) + 'deg'); s.appendChild(i); }
      els[t].appendChild(s);
      later(() => s.remove(), 750);
    }

    const won = () => defs.every((d, t) => d.kind !== 'pair' || found[t]);

    function flip(t) {
      if (phase === 'peek') { endPeek(); return; }    // toucher pendant l'aperçu : on commence tout de suite
      if (phase === 'reveal') { endReveal(); return; }
      if (phase !== 'play' || found[t] || open.includes(t)) return;
      const d = defs[t];
      if (open.length === 2) closeOpen(); // la paire ratée se referme dès qu'on touche ailleurs
      if (d.kind === 'eye') { useEye(t); return; }
      open.push(t);
      seen[t]++;
      C.sfx.tap();
      if (d.kind === 'medusa') { medusa(t); return; }
      if (open.length === 2) {
        const [a, b] = open;
        if (key(a) === key(b)) {
          found[a] = found[b] = true;
          open = [];
          combo++;
          render();
          [a, b].forEach((k) => { els[k].classList.remove('match'); void els[k].offsetWidth; els[k].classList.add('match'); burst(k); });
          later(() => [a, b].forEach((k) => els[k].classList.remove('match')), 650);
          comboPop(b);
          C.sfx.place();
          api.onChange();
          if (won()) {
            // victoire : les amphores spéciales restantes se retournent aussi (Méduse, pétrifiée)
            phase = 'won'; found.fill(true); box.classList.add('won');
            later(render, 350);
            later(() => api.onWin(), 500);
          }
          return;
        }
        // ratée : les deux restent visibles un instant, puis se referment
        combo = 0;
        if (puzzle.storm) misses++;
        const storm = puzzle.storm && misses >= puzzle.storm;
        flipBack = later(() => { open = []; flipBack = null; render(); if (storm) tempest(); }, storm ? 900 : 1300);
        if (storm) phase = 'busy';
      }
      render(); api.onChange();
    }

    // l'Œil d'Athéna : toutes les amphores encore cachées se montrent un instant
    function useEye(t) {
      found[t] = true;
      C.sfx.place();
      const hidden = defs.filter((d, u) => !found[u] && d.kind !== 'eye').length;
      phase = 'reveal';
      render(); api.onChange();
      revealEnd = later(endReveal, Math.min(3200, 1200 + 60 * hidden));
    }
    function endReveal() {
      if (phase !== 'reveal') return;
      clearTimeout(revealEnd);
      phase = 'play'; render(); api.onChange();
    }

    // Méduse : les amphores cachées autour d'elle tournent d'un cran (sens des aiguilles d'une montre)
    function medusa(t) {
      phase = 'busy';
      open = [t]; // (la tuile ouverte avant Méduse se referme)
      if (C.sfx.error) C.sfx.error();
      els[t].classList.add('glare');
      render(); api.onChange();
      later(() => {
        open = [];
        const p = posOf[t], r = Math.floor(p / cols), c = p % cols;
        const ring = [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]]
          .map(([dr, dc]) => [r + dr, c + dc]).filter(([y, x]) => y >= 0 && x >= 0 && y < rows && x < cols)
          .map(([y, x]) => y * cols + x).filter((q) => live(deck[q]));
        found[t] = true; // pétrifiée
        render();
        if (ring.length > 1) {
          const moving = ring.map((q) => deck[q]);
          relocate(moving.map((u, k) => [u, ring[(k + 1) % ring.length]]), false);
          box.classList.remove('spin'); void box.offsetWidth; box.classList.add('spin');
        }
        later(() => { els[t].classList.remove('glare'); phase = 'play'; render(); api.onChange(); }, calm() ? 100 : 700);
      }, 750);
    }

    // tempête : des amphores cachées (plutôt déjà vues) s'échangent sous tes yeux
    function tempest() {
      misses = 0;
      const cand = defs.map((_, u) => u).filter((u) => live(u) && !open.includes(u));
      cand.sort((a, b) => (seen[b] ? 1 : 0) - (seen[a] ? 1 : 0) || a - b);
      const pickN = Math.min(cand.length - (cand.length % 2), 2 * puzzle.swaps);
      // (tirage déterministe : on prend les premières vues, en alternant les bords de la liste)
      const chosen = [];
      for (let k = 0; chosen.length < pickN && k < cand.length; k++) chosen.push(cand[k % 2 ? cand.length - 1 - (k >> 1) : k >> 1]);
      const moves = [];
      for (let k = 0; k + 1 < chosen.length; k += 2) {
        const a = chosen[k], b = chosen[k + 1];
        if (key(a) === key(b)) continue;
        moves.push([a, posOf[b]], [b, posOf[a]]);
      }
      wrap.classList.remove('storming'); void wrap.offsetWidth; wrap.classList.add('storming');
      C.sfx.tap();
      if (moves.length) relocate(moves, true);
      later(() => { phase = 'play'; render(); api.onChange(); }, calm() ? 100 : 950);
    }

    // on attend que le tutoriel soit refermé avant l'aperçu
    function rulesOpen() {
      const r = document.querySelector('#rules');
      return !!(r && !r.hidden && getComputedStyle(r).display !== 'none');
    }
    function whenReady(fn) {
      if (rulesOpen()) { later(() => whenReady(fn), 250); return; }
      later(fn, 500);
    }
    function endPeek() {
      if (phase !== 'peek') return;
      phase = 'play'; render(); api.onChange();
    }
    function start() {
      if (puzzle.peek > 0) {
        phase = 'peek'; render();
        later(endPeek, puzzle.peek);
      } else { phase = 'play'; render(); }
      api.onChange();
    }

    // au doigt : dès l'appui (deux tuiles retournées très vite ne se perdent pas) ; au clavier : click
    box.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button > 0) return;
      const b = e.target.closest('.amph-tile');
      if (b) flip(+b.dataset.t);
    });
    box.addEventListener('click', (e) => {
      if (e.detail) return; // (déjà joué au pointerdown)
      const b = e.target.closest('.amph-tile');
      if (b) flip(+b.dataset.t);
    });

    render();
    whenReady(start);

    const eyeLeft = () => defs.findIndex((d, t) => d.kind === 'eye' && !found[t]);
    return {
      // 💬 la méthode : des conseils de mémoire (rien n'est retourné à la place du joueur)
      method: rule === 'dessin' ? 'Ici, seul le dessin compte : une chouette rose va avec une chouette bleue. Oublie les couleurs, retiens les dessins et leur place.'
        : rule === 'couleur' ? 'Ici, seule la couleur compte : une chouette rose va avec un soleil rose. Oublie les dessins, retiens les couleurs et leur place.'
          : 'Retourne les amphores dans l\'ordre, ligne par ligne, et dis tout bas ce que tu vois : « chouette rose, en haut à gauche ».',
      coach(k) {
        if (phase === 'won') return null;
        const order = [...Array(total).keys()].map((p) => deck[p]);
        const fresh = order.find((t) => live(t) && !seen[t]);
        const eye = eyeLeft();
        const hasMedusa = defs.some((d, t) => d.kind === 'medusa' && !found[t]);
        return [
          { text: 'Retourne d\'abord une amphore jamais vue' + (fresh != null ? ', comme celle entourée d\'or' : '') + '. Si son motif te rappelle une amphore déjà vue, va chercher sa jumelle en second.',
            where: fresh != null ? [els[fresh]] : [], why: [] },
          eye >= 0
            ? { text: 'L\'amphore dorée est l\'Œil d\'Athéna : touche-la pour revoir un instant toutes les amphores cachées. Garde-la pour le moment où tu hésites.', where: [els[eye]], why: [] }
            : { text: 'Une paire ratée n\'est pas perdue : elle t\'a montré deux motifs de plus à retenir. Dis-toi leur nom et leur place.', where: [], why: [] },
          hasMedusa
            ? { text: 'Une Méduse se cache ici : si tu la retournes, les amphores autour d\'elle tournent d\'un cran, comme les aiguilles d\'une montre. Suis-les des yeux !', where: [], why: [] }
            : puzzle.storm
              ? { text: 'La tempête guette : après ' + puzzle.storm + ' ratés, des amphores cachées s\'échangent. Suis-les des yeux, et ne retourne pas au hasard.', where: [], why: stormEl ? [stormEl] : [] }
              : { text: rule === 'pareil' && puzzle.similar ? 'Attention aux cousins : même dessin, autre couleur. Retiens le dessin ET la couleur.'
                : 'Les paires d\'affilée font monter la note : essaie d\'enchaîner sans rater !', where: [], why: [] }
        ][k] || null;
      },
      status() {
        const n = defs.filter((d, t) => d.kind === 'pair' && found[t]).length / 2;
        return phase === 'won' ? 'Toutes les paires' : n + ' / ' + puzzle.pairs + ' paires';
      },
      undo() {},
      reset() {
        if (phase === 'won') return;
        closeOpen();
        timers.forEach(clearTimeout); timers.clear(); // (Méduse, tempête ou aperçu en cours : on oublie tout)
        box.querySelectorAll('.amph-combo').forEach((e) => e.remove());
        found.fill(false);
        combo = 0; misses = 0;
        puzzle.deck.forEach((t, pos) => { posOf[t] = pos; deck[pos] = t; place(t); });
        els.forEach((b) => { b._peek = false; b.classList.remove('glare', 'match'); });
        phase = 'wait'; render(); api.onChange();
        whenReady(start);
      },
      // résolution directe (outil de test)
      solve() {
        if (phase === 'won') return;
        closeOpen();
        defs.forEach((d, t) => { if (d.kind === 'pair') found[t] = true; });
        phase = 'won'; render();
        api.onWin();
      },
      // indice : deux amphores qui vont ensemble se montrent un instant, entourées d'or
      hint() {
        if (phase === 'won') return false;
        if (phase === 'peek') endPeek();
        if (phase === 'reveal') endReveal();
        if (phase !== 'play') return false;
        let a = -1;
        // priorité : compléter la tuile déjà retournée
        if (open.length === 1 && isPair(open[0])) a = open[0];
        else {
          // sinon une paire dont une moitié a déjà été vue (le joueur peut s'en servir), sinon la première
          let best = -1;
          for (let t = 0; t < total; t++) {
            if (!live(t)) continue;
            const ps = partners(t);
            const sc = seen[t] + Math.max(0, ...ps.map((u) => seen[u]));
            if (sc > best) { best = sc; a = t; }
          }
        }
        if (a < 0) return false;
        const ps = partners(a);
        const b = ps.reduce((x, u) => (x < 0 || seen[u] > seen[x] ? u : x), -1);
        if (b < 0) return false;
        const one = open.length === 1;
        if (open.length === 2) closeOpen();
        [a, b].forEach((k) => { els[k]._peek = true; });
        render();
        later(() => { [a, b].forEach((k) => { els[k]._peek = false; }); render(); }, 1400);
        const why = rule === 'pareil' ? '' : ' (' + RULES[rule].say + ')';
        return { text: one
          ? 'L\'amphore que tu viens de retourner a sa jumelle' + why + ' : les deux, entourées d\'or, se montrent un instant.'
          : 'Ces deux amphores, entourées d\'or, vont ensemble' + why + ' : elles se montrent un instant, retiens-les !', where: [els[a], els[b]], why: [] };
      },
      redraw() { fit(); },
      destroy() {
        dead = true;
        timers.forEach(clearTimeout); timers.clear();
        if (ro) ro.disconnect();
      }
    };
  }

  // ------------------------------------------------------------------
  // Tutoriel (viewBox 0 0 120 120)
  // ------------------------------------------------------------------
  // (le style des motifs vient de css/games/amphores.css : classe .amph-mot)
  const A = '#e4579f';
  const tTile = (x, y, m) => m === 'eye'
    ? '<g transform="translate(' + x + ' ' + y + ')"><rect width="30" height="30" rx="8" fill="#ffd23f"/><g transform="translate(3 3) scale(.6)">' + EYE.replace(/<\/?svg[^>]*>/g, '') + '</g></g>'
    : m === 'medusa'
      ? '<g transform="translate(' + x + ' ' + y + ')"><rect width="30" height="30" rx="8" fill="#fffaf0" stroke="#d9cfe8" stroke-width="2"/><g class="amph-medusa" transform="translate(3 3) scale(.6)">' + MEDUSA.replace(/<\/?svg[^>]*>/g, '') + '</g></g>'
      : m
        ? '<g transform="translate(' + x + ' ' + y + ')"><rect width="30" height="30" rx="8" fill="#fffaf0" stroke="#d9cfe8" stroke-width="2"/>' +
          '<g class="amph-mot" transform="translate(4 4) scale(.55)" style="color:' + COLORS[m.c] + '">' + MOTIFS[m.s] + '</g></g>'
        : '<g transform="translate(' + x + ' ' + y + ')"><rect width="30" height="30" rx="8" fill="' + A + '"/>' +
          '<g transform="translate(5 5) scale(.5)" fill="#fff" opacity=".85"><path d="M15 5h10v3c0 1.2 1 2.2 2.2 2.8C31 12.8 33 16.8 33 21.5c0 6.8-4.6 11.3-9 13.3V36h-8v-1.2c-4.4-2-9-6.5-9-13.3 0-4.7 2-8.7 5.8-10.7C14 10.2 15 9.2 15 8z"/></g></g>';
  const tFinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const tArt = (cells, extra) => '<svg viewBox="0 0 120 120" class="tuto-art">' + cells + (extra || '') + '</svg>';
  const tCheck = (x, y) => '<path d="M' + x + ' ' + y + 'l5 5 10-10" fill="none" stroke="#43a82a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
  const owl = { s: 0, c: 0 }, owlB = { s: 0, c: 1 }, sunB = { s: 6, c: 1 };
  const tutoGrid = (faces) => faces.map((f, k) => tTile(10 + (k % 3) * 35, 25 + Math.floor(k / 3) * 37, f)).join('');
  const tRule = (rule, x, y) => '<g transform="translate(' + x + ' ' + y + ') scale(.9)">' + ruleIcon(rule).replace('<svg viewBox="0 0 25 14" class="amph-rule-ic" aria-hidden="true">', '').replace('</svg>', '') + '</g>';

  C.register({
    id: 'amphores',
    name: 'Amphores',
    tagline: 'Retrouve les paires, suis la règle',
    accent: '#e4579f',
    icon: '<svg viewBox="0 0 24 24"><path d="M9 3h6v2c3 1.5 4.5 4 4.5 7.5 0 4-3 7-5.5 8V21h-4v-.5C7.5 19.5 4.5 16.5 4.5 12.5 4.5 9 6 6.5 9 5z" fill="currentColor"/></svg>',
    icon24: '<path d="M9.5 3.5h5v1.8c2.8 1.3 4.3 3.8 4.3 7 0 3.8-2.6 6.4-5 7.4v.8h-4.6v-.8c-2.4-1-5-3.6-5-7.4 0-3.2 1.5-5.7 4.3-7z"/><path d="M7.5 11h9M8 14.5h8"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Retourne les amphores deux par deux et retrouve les paires, selon la règle affichée.' }
    ],
    rules: {
      classic: [
        'Touche deux amphores pour voir leurs <b>motifs</b>. Si elles vont ensemble, elles restent ouvertes.',
        'Lis la <b>règle</b> en haut : <b>Identiques</b> (même dessin et même couleur), <b>Même dessin</b> ou <b>Même couleur</b>.',
        'L\'<b>amphore dorée</b> (Œil d\'Athéna) montre toutes les amphores un instant, quand tu veux. <b>Méduse</b>, cachée, fait tourner d\'un cran les amphores autour d\'elle.',
        'Plus loin, la <b>tempête</b> : après quelques ratés, des amphores cachées s\'échangent. Trouve <b>toutes les paires</b> pour gagner !'
      ]
    },
    tutorial: [
      { art: tArt(tutoGrid([null, owl, null, null, 'eye', owl]) + tFinger(60, 50) + tFinger(95, 87)),
        text: 'Touche <b>deux amphores</b> : si elles vont ensemble, elles restent ouvertes. Au début, tout se montre un instant : retiens !' },
      { art: tArt(tutoGrid([owl, null, owlB, null, sunB, null]) + '<path d="M25 23Q60 3 95 23" fill="none" stroke="#43a82a" stroke-width="2.5" stroke-dasharray="4 3"/>' +
          tCheck(53, 12) + tRule('dessin', 49, 104)),
        text: 'Lis la <b>règle</b> en haut : <b>identiques</b>, <b>même dessin</b> (couleur libre) ou <b>même couleur</b> (dessin libre).' },
      { art: tArt(tutoGrid(['eye', null, null, null, 'medusa', null]) + '<path d="M60 47a20 20 0 1 1-14 6" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="3 3"/><path d="M42 50l4 3.5 1-5" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round"/>'),
        text: 'L\'<b>amphore dorée</b> montre tout un instant : garde-la pour quand tu hésites. Gare à <b>Méduse</b> : les amphores autour d\'elle tournent d\'un cran !' }
    ],
    params,
    generate,
    create
  });
})();
