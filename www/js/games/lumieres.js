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
    // premiers niveaux : des appuis dont les zones ne se chevauchent pas (chaque motif se lit à l'œil)
    const area = (i) => {
      const r = Math.floor(i / n), c = i % n, out = [];
      pattern.forEach(([dr, dc]) => { const y = r + dr, x = c + dc; if (y >= 0 && x >= 0 && y < n && x < n) out.push(y * n + x); });
      return out;
    };
    for (let t = 0; ; t++) {
      const state = new Uint8Array(n * n);
      const presses = rng.shuffle([...Array(n * n).keys()]).slice(0, p.presses);
      if (p.apart && t < 200) {
        const seen = new Set();
        if (presses.some((i) => area(i).some((j) => seen.has(j) || !seen.add(j)))) continue;
      }
      presses.forEach((i) => press(state, n, i, pattern));
      if (state.some((v) => v)) return { n, variant: p.variant, start: Array.from(state), presses };
    }
  }

  function params(level, variant) {
    if (level <= 12) {
      // débuts en douceur mais courts : 3×3 jusqu'au niveau 3, 4×4 dès le 4, 5×5 dès le 8
      const n = level <= 3 ? 3 : level <= 7 ? 4 : 5;
      return { n, variant, presses: 1 + Math.floor((level - 1) * 7 / 11), apart: level <= 8 };
    }
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

    let won = false;
    function doPress(i) {
      if (won) return; // grille finie : plus de coups
      history.push({ state: state.slice(), mine: mine.slice(), moves });
      press(state, n, i, pattern);
      mine[i] ^= 1;
      moves++;
      C.sfx.tap();
      cells[i].classList.remove('pulse'); void cells[i].offsetWidth; cells[i].classList.add('pulse');
      render(); api.onChange();
      if (state.every((v) => !v)) { won = true; api.onWin(); }
    }

    // au doigt : dès l'appui (un « click » se perd parfois sur deux touchers rapides) ; au clavier : click
    grid.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary || e.button > 0) return;
      const b = e.target.closest('.bulb');
      if (b) doPress(+b.dataset.i);
    });
    grid.addEventListener('click', (e) => {
      if (e.detail) return; // (déjà joué au pointerdown)
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
        const area = (i) => {
          const r = Math.floor(i / n), c = i % n, out = [];
          pattern.forEach(([dr, dc]) => { const y = r + dr, x = c + dc; if (y >= 0 && x >= 0 && y < n && x < n) out.push(y * n + x); });
          return out;
        };
        // parmi les appuis encore utiles, celui qui éteint le plus d'ampoules d'un coup
        let best = -1, bestScore = -Infinity;
        for (let i = 0; i < n * n; i++) {
          if (!(need[i] ^ mine[i])) continue;
          const a = area(i), off = a.filter((j) => state[j]).length, on = a.length - off;
          if (off - on > bestScore) { bestScore = off - on; best = i; }
        }
        if (best < 0) return false;
        const a = area(best), off = a.filter((j) => state[j]).length, on = a.length - off;
        const what = puzzle.variant === 'croix' ? 'elle et ses voisines en diagonale (surlignées)' : 'elle et ses voisines (surlignées)';
        let text = 'Touche la case dorée : ' + what + ' vont s\'inverser. ';
        text += off && !on ? (off > 1 ? off + ' lumières s\'éteignent d\'un coup !' : 'Une lumière s\'éteint, aucune ne s\'allume.')
          : off > on ? off + ' s\'éteignent, ' + on + ' s\'allume' + (on > 1 ? 'nt' : '') + ' : c\'est un pas vers le noir complet.'
          : 'Ça en rallume, mais cet appui fait partie de la solution.';
        return { text, where: [cells[best]], why: a.filter((j) => j !== best).map((j) => cells[j]) };
      },
      // 💬 la méthode : repérer les motifs entiers, puis « chasser » les lumières de haut en bas
      method: puzzle.variant === 'croix'
        ? 'Repère les X allumés : touche leur centre, ils s\'éteignent d\'un coup. Un appui ne touche que les cases de sa couleur de damier.'
        : n <= 3
          ? 'Un appui inverse une croix : la case et ses 4 voisines. Repère les croix allumées et touche leur centre ; sinon, touche sous chaque lumière pour la chasser vers le bas.'
          : 'Chasse les lumières de haut en bas : pour chaque lumière allumée, touche la case juste en dessous. Elle s\'éteint, et la ligne du haut reste noire.',
      coach() {
        if (won) return null;
        const need = new Uint8Array(n * n);
        puzzle.presses.forEach((i) => { need[i] ^= 1; });
        const area = (i) => {
          const r = Math.floor(i / n), c = i % n, out = [];
          pattern.forEach(([dr, dc]) => { const y = r + dr, x = c + dc; if (y >= 0 && x >= 0 && y < n && x < n) out.push(y * n + x); });
          return out;
        };
        const step = (i, text, why) => ({ text, where: [cells[i]], why: why.filter((j) => j !== i).map((j) => cells[j]), play: () => doPress(i) });
        const shape = puzzle.variant === 'croix' ? 'un X' : 'une croix';
        // 1. un motif entier allumé (croix ou X) : un seul appui l'éteint
        for (let i = 0; i < n * n; i++) {
          const a = area(i);
          if (!(need[i] ^ mine[i]) || a.length < 3 || !a.every((j) => state[j])) continue;
          return step(i, 'Ces ' + a.length + ' lumières forment ' + shape + ' : touche son centre (case dorée), elles s\'éteignent toutes d\'un coup.', a);
        }
        if (puzzle.variant !== 'croix') {
          // 2. la chasse : la première lumière allumée au-dessus de la dernière ligne, on touche dessous
          for (let i = 0; i < n * (n - 1); i++) {
            if (!state[i]) continue;
            return step(i + n, 'La lumière juste au-dessus de la case dorée est allumée : touche la case dorée. Celle du dessus s\'éteint, et rien ne bouge plus haut.', [i]);
          }
          // 3. il ne reste que la dernière ligne : elle se règle depuis la ligne du haut, puis on rechasse
          const top = [...Array(n).keys()].find((c) => need[c] ^ mine[c]);
          if (top != null) {
            const last = [...Array(n).keys()].map((c) => (n - 1) * n + c).filter((j) => state[j]);
            return step(top, 'Il ne reste que la dernière ligne (surlignée) : elle se règle par le haut. Touche la case dorée, puis chasse à nouveau vers le bas.', last);
          }
        }
        // 4. sinon : l'appui utile qui éteint le plus de lumières
        let best = -1, bestScore = -Infinity;
        for (let i = 0; i < n * n; i++) {
          if (!(need[i] ^ mine[i])) continue;
          const a = area(i), off = a.filter((j) => state[j]).length;
          if (2 * off - a.length > bestScore) { bestScore = 2 * off - a.length; best = i; }
        }
        if (best < 0) return null;
        const a = area(best), off = a.filter((j) => state[j]).length;
        return step(best, 'Touche la case dorée : les cases surlignées s\'inversent. ' + (off * 2 > a.length ? 'Ça éteint plus de lumières que ça n\'en allume.' : 'Ça en rallume un peu, mais cet appui fait partie de la solution.'), a);
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
        'Touche une lumière : elle et ses <b>4 voisines</b> (haut, bas, gauche, droite) s\'allument ou s\'éteignent.',
        '<b>Éteins toutes</b> les lumières pour gagner.',
        'L\'objectif de coups, affiché en haut, est un défi en plus : pas une obligation.'
      ],
      croix: [
        'Touche une lumière : elle et ses <b>4 voisines en diagonale</b> s\'allument ou s\'éteignent.',
        '<b>Éteins toutes</b> les lumières pour gagner.',
        'Astuce : un appui ne touche que les cases de sa couleur de damier.'
      ]
    },
    params,
    generate,
    create
  });
})();
