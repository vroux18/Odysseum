// Lumières : chaque appui inverse une case et un motif autour d'elle.
// But : tout éteindre. Variante Croix : le motif touche les diagonales.
(function () {
  'use strict';
  const C = window.Carnet;

  const PATTERNS = {
    classic: [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]],
    croix: [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]
  };

  function press(state, n, i, pattern) {
    const r = Math.floor(i / n), c = i % n;
    pattern.forEach(([dr, dc]) => {
      const y = r + dr, x = c + dc;
      if (y >= 0 && x >= 0 && y < n && x < n) state[y * n + x] ^= 1;
    });
  }

  function generate(rng, p) {
    const n = p.n;
    const pattern = PATTERNS[p.variant] || PATTERNS.classic;
    for (;;) {
      const state = new Uint8Array(n * n);
      const presses = rng.shuffle([...Array(n * n).keys()]).slice(0, p.presses);
      presses.forEach((i) => press(state, n, i, pattern));
      if (state.some((v) => v)) return { n, variant: p.variant, start: Array.from(state), presses };
    }
  }

  function params(level, variant) {
    const n = Math.min(7, 3 + Math.floor((level + 2) / 6)); // 3×3 pour commencer
    return { n, variant, presses: Math.min(Math.floor(n * n / 2), 2 + Math.floor(level / 2)) };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n;
    const pattern = PATTERNS[puzzle.variant] || PATTERNS.classic;
    let state = Uint8Array.from(puzzle.start);
    // appuis du joueur (parité) : sert aux indices
    let mine = new Uint8Array(n * n);
    let moves = 0;
    const history = [];

    const grid = document.createElement('div');
    grid.className = 'cell-grid lumieres';
    grid.style.setProperty('--n', n);
    host.appendChild(grid);
    const cells = [];
    for (let i = 0; i < n * n; i++) {
      const b = document.createElement('button');
      b.className = 'bulb';
      b.dataset.i = i;
      b.setAttribute('aria-label', 'Case ' + (i + 1));
      grid.appendChild(b);
      cells.push(b);
    }

    function render() {
      cells.forEach((b, i) => b.classList.toggle('on', !!state[i]));
    }

    function doPress(i) {
      history.push({ state: state.slice(), mine: mine.slice(), moves });
      press(state, n, i, pattern);
      mine[i] ^= 1;
      moves++;
      C.sfx.tap();
      cells[i].classList.remove('pulse'); void cells[i].offsetWidth; cells[i].classList.add('pulse');
      render(); api.onChange();
      if (state.every((v) => !v)) api.onWin();
    }

    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.bulb');
      if (b) doPress(+b.dataset.i);
    });

    render();

    return {
      status() {
        const on = state.reduce((a, b) => a + b, 0);
        return 'Allumées ' + on + ' · Coups ' + moves + ' (objectif ' + puzzle.presses.length + ')';
      },
      undo() {
        if (!history.length) return;
        const h = history.pop();
        state = h.state; mine = h.mine; moves = h.moves;
        render(); api.onChange();
      },
      reset() {
        history.push({ state: state.slice(), mine: mine.slice(), moves });
        state = Uint8Array.from(puzzle.start); mine = new Uint8Array(n * n); moves = 0;
        render(); api.onChange();
      },
      // résolution directe (outil de test) : on joue tous les appuis restants
      solve() {
        const need = new Uint8Array(n * n);
        puzzle.presses.forEach((i) => { need[i] ^= 1; });
        for (let i = 0; i < n * n; i++) if (need[i] ^ mine[i]) doPress(i);
      },
      hint() {
        // les appuis restants = appuis du puzzle XOR appuis du joueur
        const need = new Uint8Array(n * n);
        puzzle.presses.forEach((i) => { need[i] ^= 1; });
        for (let i = 0; i < n * n; i++) {
          if (need[i] ^ mine[i]) {
            cells[i].classList.add('hinted');
            setTimeout(() => cells[i].classList.remove('hinted'), 1600);
            return true;
          }
        }
        return false;
      },
      destroy() {}
    };
  }

  C.register({
    id: 'lumieres',
    name: 'Lumières',
    tagline: 'Éteins toute la grille',
    accent: '#ffd23f',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M9 2h6v2h2v2h2v6h-2v2h-2v2H9v-2H7v-2H5V6h2V4h2zM9 18h6v2H9zM10 21h4v2h-4z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Chaque appui inverse la case et ses 4 voisines.' },
      { id: 'croix', name: 'Croix', desc: 'Chaque appui inverse la case et ses 4 diagonales.' }
    ],
    rules: {
      classic: [
        'Touche une ampoule : elle et ses <b>4 voisines</b> (haut, bas, gauche, droite) changent d\'état.',
        'Éteins <b>toutes</b> les ampoules.',
        'L\'objectif de coups est indicatif : fais mieux si tu peux.'
      ],
      croix: [
        'Touche une ampoule : elle et ses <b>4 voisines en diagonale</b> changent d\'état.',
        'Éteins <b>toutes</b> les ampoules.',
        'Astuce : une case n\'influence que les cases de sa « couleur » de damier.'
      ]
    },
    params,
    generate,
    create
  });
})();
