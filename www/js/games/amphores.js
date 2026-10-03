// Amphores : le jeu des paires. Des amphores retournées cachent des motifs grecs ;
// on en retourne deux à la fois : deux motifs identiques (même dessin, même couleur) restent visibles.
// Aux niveaux élevés, des motifs « cousins » (même dessin, autre couleur) brouillent la mémoire.
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
    '<path d="M20 35V13M11 7v7a9 9 0 0 0 18 0V7" class="s"/><path d="M20 4l-3 5h6zM11 4l-2.5 4.5h5zM29 4l-2.5 4.5h5z"/>'
  ];
  // couleurs de motifs : franches, bien distinctes entre elles
  const COLORS = ['#e4579f', '#3d8ee8', '#ef9a1c', '#43a82a', '#8f6fe8', '#e8553d'];

  // amphore du dos des tuiles
  const BACK = '<svg viewBox="0 0 40 40" aria-hidden="true"><path class="am-body" d="M15 5h10v3c0 1.2 1 2.2 2.2 2.8C31 12.8 33 16.8 33 21.5c0 6.8-4.6 11.3-9 13.3V36h-8v-1.2c-4.4-2-9-6.5-9-13.3 0-4.7 2-8.7 5.8-10.7C14 10.2 15 9.2 15 8z"/>' +
    '<path class="am-line" d="M13 13c-4.5-.5-5.5 5-2 7.5M27 13c4.5-.5 5.5 5 2 7.5M9.5 20.5h21M11 25h18"/></svg>';

  // ------------------------------------------------------------------
  // Difficulté (niveaux 1 → 40) : grille de 3×4 à 6×6, motifs cousins, aperçu au début.
  // ------------------------------------------------------------------
  const SIZES = [[3, 4], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6]]; // colonnes × rangées (toujours pair)
  function params(level, variant) {
    level = Math.max(1, level || 1);
    const k = level < 4 ? 0 : level < 9 ? 1 : level < 15 ? 2 : level < 22 ? 3 : level < 30 ? 4 : 5;
    const [cols, rows] = SIZES[k];
    const pairs = cols * rows / 2;
    // motifs cousins : obligatoires au-delà de 12 paires (12 dessins), puis de plus en plus nombreux
    const wanted = level < 10 ? 0 : Math.floor((level - 6) / 4);
    const similar = Math.min(Math.floor(pairs / 2), Math.max(pairs - MOTIFS.length, wanted));
    return {
      variant: variant || 'classic', cols, rows, pairs, similar,
      peek: level <= 6 ? 1700 : level <= 12 ? 900 : 0 // aperçu de toutes les tuiles au départ (ms)
    };
  }

  function generate(rng, p) {
    const shapes = rng.shuffle([...Array(MOTIFS.length).keys()]);
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
    const deck = [];
    motifs.forEach((m, i) => deck.push(i, i));
    rng.shuffle(deck);
    return Object.assign({ motifs, deck }, p);
  }

  const motifSVG = (m) => '<svg viewBox="0 0 40 40" class="amph-mot" aria-hidden="true" style="color:' + COLORS[m.c] + '">' + MOTIFS[m.s] + '</svg>';

  function create(host, puzzle, api) {
    const { cols, rows, deck, motifs } = puzzle;
    const total = deck.length;
    const found = new Array(total).fill(false);
    const seen = new Array(total).fill(0);
    let open = [];       // tuiles retournées non encore appariées (0, 1 ou 2)
    let phase = 'wait';  // wait | peek | play | won
    let dead = false;
    let flipBack = null;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms);
      timers.add(id);
      return id;
    };

    const box = document.createElement('div');
    box.className = 'amph';
    box.style.setProperty('--cols', cols);
    box.style.setProperty('--rows', rows);
    const tiles = deck.map((mi, i) => {
      const b = document.createElement('button');
      b.className = 'amph-tile';
      b.dataset.i = i;
      b.style.setProperty('--k', i);
      b.setAttribute('aria-label', 'Amphore');
      b.innerHTML = '<span class="amph-in"><span class="amph-back">' + BACK + '</span><span class="amph-face">' + motifSVG(motifs[mi]) + '</span></span>';
      box.appendChild(b);
      return b;
    });
    host.appendChild(box);

    // taille des tuiles : la grille tient dans l'hôte
    function fit() {
      const w = (host.clientWidth || 340) - 8;
      // le plateau grandit avec son contenu : on vise la hauteur libre de l'écran de jeu
      const play = host.closest && host.closest('#play');
      const h = Math.max(200, (play && play.clientHeight ? play.clientHeight - 330 : host.clientHeight || 520) - 8);
      const gap = Math.max(6, Math.min(12, w / cols * 0.1));
      const t = Math.floor(Math.min((w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows * 1.0, 96));
      box.style.setProperty('--t', Math.max(36, t) + 'px');
      box.style.setProperty('--gap', gap + 'px');
    }
    fit();
    let ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(host); }

    function render() {
      tiles.forEach((t, i) => {
        t.classList.toggle('open', found[i] || open.includes(i) || phase === 'peek' || t._peek === true);
        t.classList.toggle('found', found[i]);
      });
      box.classList.toggle('peeking', phase === 'peek');
    }

    const pairOf = (i) => deck.findIndex((m, j) => j !== i && m === deck[i]);

    function closeOpen() {
      clearTimeout(flipBack); flipBack = null;
      open = [];
    }

    function flip(i) {
      if (phase === 'peek') { endPeek(); return; } // toucher pendant l'aperçu : on commence tout de suite
      if (phase !== 'play' || found[i] || open.includes(i)) return;
      if (open.length === 2) closeOpen(); // la paire ratée se referme dès qu'on touche ailleurs
      open.push(i);
      seen[i]++;
      C.sfx.tap();
      if (open.length === 2) {
        const [a, b] = open;
        if (deck[a] === deck[b]) {
          found[a] = found[b] = true;
          open = [];
          render();
          [a, b].forEach((k) => { tiles[k].classList.remove('match'); void tiles[k].offsetWidth; tiles[k].classList.add('match'); });
          C.sfx.place();
          api.onChange();
          if (found.every(Boolean)) { phase = 'won'; later(() => api.onWin(), 450); }
          return;
        }
        // ratée : les deux restent visibles un instant, puis se referment
        flipBack = later(() => { open = []; flipBack = null; render(); }, 900);
      }
      render(); api.onChange();
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

    box.addEventListener('click', (e) => {
      const t = e.target.closest('.amph-tile');
      if (t) flip(+t.dataset.i);
    });

    render();
    whenReady(start);

    return {
      status() {
        const n = found.filter(Boolean).length / 2;
        return phase === 'won' ? 'Toutes les paires' : n + ' / ' + puzzle.pairs + ' paires';
      },
      undo() {},
      reset() {
        if (phase === 'won') return;
        closeOpen();
        found.fill(false);
        tiles.forEach((t) => { t._peek = false; });
        phase = 'wait'; render(); api.onChange();
        whenReady(start);
      },
      // résolution directe (outil de test)
      solve() {
        if (phase === 'won') return;
        closeOpen();
        found.fill(true);
        phase = 'won'; render();
        api.onWin();
      },
      // indice : une paire cachée se montre un instant, entourée d'or
      hint() {
        if (phase === 'won') return false;
        if (phase !== 'play') endPeek();
        let a = -1;
        // priorité : compléter la tuile déjà retournée
        if (open.length === 1) a = open[0];
        else {
          // sinon une paire dont une moitié a déjà été vue (le joueur peut s'en servir), sinon la première
          let best = -1;
          for (let i = 0; i < total; i++) {
            if (found[i]) continue;
            const sc = seen[i] + seen[pairOf(i)];
            if (sc > best) { best = sc; a = i; }
          }
        }
        if (a < 0) return false;
        const b = pairOf(a);
        if (open.length === 2) closeOpen();
        [a, b].forEach((k) => { tiles[k]._peek = true; });
        render();
        later(() => { [a, b].forEach((k) => { tiles[k]._peek = false; }); render(); }, 1400);
        return { text: 'Ces deux amphores cachent le même motif.', where: [tiles[a], tiles[b]], why: [] };
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
  const tTile = (x, y, m) => m
    ? '<g transform="translate(' + x + ' ' + y + ')"><rect width="30" height="30" rx="8" fill="#fffaf0" stroke="#d9cfe8" stroke-width="2"/>' +
      '<g class="amph-mot" transform="translate(4 4) scale(.55)" style="color:' + COLORS[m.c] + '">' + MOTIFS[m.s] + '</g></g>'
    : '<g transform="translate(' + x + ' ' + y + ')"><rect width="30" height="30" rx="8" fill="' + A + '"/>' +
      '<g transform="translate(5 5) scale(.5)" fill="#fff" opacity=".85"><path d="M15 5h10v3c0 1.2 1 2.2 2.2 2.8C31 12.8 33 16.8 33 21.5c0 6.8-4.6 11.3-9 13.3V36h-8v-1.2c-4.4-2-9-6.5-9-13.3 0-4.7 2-8.7 5.8-10.7C14 10.2 15 9.2 15 8z"/></g></g>';
  const tFinger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const tArt = (cells, extra) => '<svg viewBox="0 0 120 120" class="tuto-art">' + cells + (extra || '') + '</svg>';
  const owl = { s: 0, c: 0 }, sun = { s: 6, c: 2 }, sunB = { s: 6, c: 1 };
  const tutoGrid = (faces) => faces.map((f, k) => tTile(10 + (k % 3) * 35, 25 + Math.floor(k / 3) * 37, f)).join('');

  C.register({
    id: 'amphores',
    name: 'Amphores',
    tagline: 'Retrouve les paires de motifs',
    accent: '#e4579f',
    icon: '<svg viewBox="0 0 24 24"><path d="M9 3h6v2c3 1.5 4.5 4 4.5 7.5 0 4-3 7-5.5 8V21h-4v-.5C7.5 19.5 4.5 16.5 4.5 12.5 4.5 9 6 6.5 9 5z" fill="currentColor"/></svg>',
    icon24: '<path d="M9.5 3.5h5v1.8c2.8 1.3 4.3 3.8 4.3 7 0 3.8-2.6 6.4-5 7.4v.8h-4.6v-.8c-2.4-1-5-3.6-5-7.4 0-3.2 1.5-5.7 4.3-7z"/><path d="M7.5 11h9M8 14.5h8"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Retourne les amphores deux par deux et retrouve les paires.' }
    ],
    rules: {
      classic: [
        'Touche deux amphores pour voir leurs <b>motifs</b>.',
        'Deux motifs <b>identiques</b> (même dessin, même couleur) restent visibles.',
        'Sinon elles se referment : retiens où était chaque motif.',
        'Trouve <b>toutes les paires</b> pour gagner.'
      ]
    },
    tutorial: [
      { art: tArt(tutoGrid([null, owl, null, null, null, owl]) + tFinger(60, 50) + tFinger(95, 87)),
        text: 'Touche <b>deux amphores</b> pour voir leurs motifs.' },
      { art: tArt(tutoGrid([sun, null, null, null, sun, null]) + '<path d="M52 12l5 5 10-10" fill="none" stroke="#43a82a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'),
        text: 'Deux motifs <b>identiques</b> restent visibles.' },
      { art: tArt(tutoGrid([sun, null, sunB, null, null, null]) + '<path d="M45 18l4-4M49 18l-4-4" stroke="var(--bad-ink)" stroke-width="2.6" stroke-linecap="round"/>'),
        text: 'Attention aux <b>cousins</b> : même dessin, autre couleur.' }
    ],
    params,
    generate,
    create
  });
})();
