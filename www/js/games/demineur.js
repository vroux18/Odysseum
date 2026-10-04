// Démineur : des écueils (ceux de Charybde) se cachent sous la mer.
// Chaque nombre dit combien d'écueils touchent sa case ; tout se déduit, sans jamais deviner.
// Heurter un écueil n'arrête pas la partie : l'erreur est marquée, on continue.
(function () {
  'use strict';
  const C = window.Carnet;

  // fanion élégant et petit rocher affleurant
  const FLAG = '<svg class="pennant" viewBox="0 0 24 24"><path d="M8.5 4v16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '<path d="M9 4.6 18.5 8.4 9 12.2z" fill="var(--game, #c27b5a)" stroke="none"/><path d="M5.5 20.2h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const REEF = '<svg class="rock" viewBox="0 0 24 24"><path d="M3.5 17.5 7 11.2l2.6 1.8L13.4 6l3.4 5.4 3.7 6.1z" fill="currentColor" stroke="none"/>' +
    '<path d="M2.8 20.2q2.3-1.5 4.6 0t4.6 0 4.6 0 4.6 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".55"/></svg>';

  // voisins (8 directions), mis en cache par taille
  const NB = {};
  function neighbors(n) {
    if (NB[n]) return NB[n];
    const out = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, l = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const y = r + dr, x = c + dc;
        if (y >= 0 && x >= 0 && y < n && x < n) l.push(y * n + x);
      }
      out.push(l);
    }
    return (NB[n] = out);
  }
  const numbers = (n, mine) => neighbors(n).map((l, i) => (mine[i] ? -1 : l.reduce((s, j) => s + mine[j], 0)));

  // ouvre une case ; un 0 ouvre ses voisines en cascade. st : 0 inconnu, 1 ouvert, 2 écueil connu.
  // Renvoie les cases ouvertes avec leur distance au point de départ (pour l'animation).
  function flood(st, i, num, nb, open) {
    const out = [];
    if (st[i] === open) return out;
    st[i] = open;
    const q = [[i, 0]];
    while (q.length) {
      const [a, d] = q.shift();
      out.push([a, d]);
      if (num[a] !== 0) continue;
      nb[a].forEach((b) => { if (st[b] === 0) { st[b] = open; q.push([b, d + 1]); } });
    }
    return out;
  }

  // Une déduction sûre à partir de ce qui est visible (st : 0 inconnu, 1 ouvert, 2 écueil connu).
  // Règle simple (un seul nombre), puis règle d'inclusion (deux nombres qui partagent des cases).
  function findMove(n, num, st, singleOnly) {
    const nb = neighbors(n);
    const cons = [];
    for (let i = 0; i < n * n; i++) {
      if (st[i] !== 1) continue;
      const U = nb[i].filter((j) => st[j] === 0);
      if (!U.length) continue;
      const r = num[i] - nb[i].filter((j) => st[j] === 2).length;
      cons.push({ i, U, r });
    }
    for (const k of cons) {
      if (k.r === 0) return { kind: 'safe', cells: k.U, src: [k.i], rule: 'single', r: 0 };
      if (k.r === k.U.length) return { kind: 'mine', cells: k.U, src: [k.i], rule: 'single', r: k.r };
    }
    if (singleOnly) return null; // premiers niveaux : seulement la règle d'un seul nombre
    for (const a of cons) {
      for (const b of cons) {
        if (a === b || a.U.length >= b.U.length || !a.U.every((x) => b.U.includes(x))) continue;
        const D = b.U.filter((x) => !a.U.includes(x)), rd = b.r - a.r;
        if (rd === 0) return { kind: 'safe', cells: D, src: [a.i, b.i], rule: 'subset', ra: a.r, rd };
        if (rd === D.length) return { kind: 'mine', cells: D, src: [a.i, b.i], rule: 'subset', ra: a.r, rd };
      }
    }
    return null;
  }

  // déroule toutes les déductions ; renvoie l'état final
  // déroule toutes les déductions ; renvoie le nombre de recours à la règle d'inclusion (plus subtile)
  function runSolver(n, num, st, singleOnly) {
    const nb = neighbors(n);
    let subtle = 0;
    for (let mv = findMove(n, num, st, singleOnly); mv; mv = findMove(n, num, st, singleOnly)) {
      if (mv.rule === 'subset') subtle++;
      if (mv.kind === 'safe') mv.cells.forEach((c) => flood(st, c, num, nb, 1));
      else mv.cells.forEach((c) => { st[c] = 2; });
    }
    return subtle;
  }
  const unresolved = (st, mine) => { let k = 0; for (let i = 0; i < st.length; i++) if (!mine[i] && st[i] !== 1) k++; return k; };

  function generate(rng, p) {
    const n = p.n, N = n * n, nb = neighbors(n);
    let best = null;
    for (let t = 0; t < 120; t++) {
      // départ à l'intérieur : la case et ses voisines sont sûres, une petite zone s'ouvre d'elle-même
      const start = (1 + rng.int(n - 2)) * n + 1 + rng.int(n - 2);
      const forbid = new Set([start].concat(nb[start]));
      const pool = rng.shuffle([...Array(N).keys()].filter((i) => !forbid.has(i)));
      const mine = new Array(N).fill(0);
      pool.slice(0, p.mines).forEach((i) => { mine[i] = 1; });
      const num = numbers(n, mine);
      const st = new Uint8Array(N);
      const first = flood(st, start, num, nb, 1).length;
      const subtle = runSolver(n, num, st, p.single);
      const left = unresolved(st, mine);
      // on préfère une zone de départ modeste, pour qu'il reste à réfléchir,
      // et, passé les premiers niveaux, au moins une déduction croisée entre deux nombres
      const roomy = first <= Math.ceil((N - p.mines) * 0.5) || t > 70;
      const deep = subtle >= p.subtle || t > 50;
      if (left === 0 && roomy && deep) return { n, mines: mine, opens: [start] };
      if (!best || left < best.left) best = { mine, num, start, left };
    }
    // repli (rare) : on ouvre d'office quelques cases sûres en bordure jusqu'à ce que tout se déduise
    const { mine, num, start } = best;
    const opens = [start];
    const st = new Uint8Array(N);
    flood(st, start, num, nb, 1);
    runSolver(n, num, st, p.single);
    while (unresolved(st, mine)) {
      const edge = [];
      for (let i = 0; i < N; i++) if (!mine[i] && st[i] === 0 && nb[i].some((j) => st[j] === 1)) edge.push(i);
      const i = edge.length ? rng.pick(edge) : [...Array(N).keys()].find((j) => !mine[j] && st[j] === 0);
      opens.push(i);
      flood(st, i, num, nb, 1);
      runSolver(n, num, st, p.single);
    }
    return { n, mines: mine, opens };
  }

  // 5×5 et 4 écueils au début, 9×9 et 15 écueils vers le niveau 33-40
  function params(level) {
    // débuts en douceur : 5×5 avec 3 puis 4 écueils, puis 6×6 ; jusqu'au niveau 8,
    // tout se résout avec la seule règle d'un nombre (jamais de déduction croisée)
    if (level <= 12) {
      const n = level <= 8 ? 5 : 6;
      const mines = level <= 4 ? 3 : level <= 8 ? 4 : level <= 10 ? 5 : 6;
      return { n, mines, subtle: level < 12 ? 0 : 1, single: level <= 8 };
    }
    const n = Math.min(9, 5 + Math.floor((level - 1) / 8));
    const d = Math.min(0.2, 0.16 + 0.03 * (level - 1) / 39);
    return { n, mines: Math.round(n * n * d), subtle: level < 6 ? 0 : level < 20 ? 1 : 2 };
  }

  function create(host, puzzle, api) {
    const n = puzzle.n, N = n * n, nb = neighbors(n);
    const mine = puzzle.mines;
    const num = numbers(n, mine);
    const total = mine.reduce((s, v) => s + v, 0);
    // 0 caché, 1 fanion, 2 ouvert, 3 écueil heurté
    const initial = new Uint8Array(N);
    puzzle.opens.forEach((o) => flood(initial, o, num, nb, 2));
    let state = initial.slice();
    let mistakes = 0, won = false, wrecked = false;
    const history = [];

    const grid = document.createElement('div');
    grid.className = 'cell-grid demineur';
    grid.style.setProperty('--n', n);
    host.appendChild(grid);
    const cells = [];
    for (let i = 0; i < N; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.i = i;
      grid.appendChild(d);
      cells.push(d);
    }

    // ne touche qu'aux cases qui changent ; delay : case -> rang dans la cascade
    function render(delay) {
      cells.forEach((d, i) => {
        const s = state[i];
        const k = s === 0 ? 'h' : s === 1 ? 'f' : s === 3 ? 'r' : 'n' + num[i];
        if (d.dataset.k === k) return;
        d.style.setProperty('--d', (delay && delay.has(i) ? Math.min(delay.get(i), 14) * 38 : 0) + 'ms');
        d.dataset.k = k;
        d.classList.toggle('open', s === 2);
        d.classList.toggle('flag', s === 1);
        d.classList.toggle('reef', s === 3);
        if (s === 2) d.dataset.v = num[i]; else delete d.dataset.v;
        d.innerHTML = s === 1 ? FLAG : s === 3 ? REEF : s === 2 && num[i] > 0 ? '<span class="num">' + num[i] + '</span>' : '';
      });
    }

    const safeLeft = () => { let k = 0; for (let i = 0; i < N; i++) if (!mine[i] && state[i] !== 2) k++; return k; };
    function check() {
      if (won || safeLeft()) return;
      won = true;
      // tous les écueils restants se signalent d'eux-mêmes
      for (let i = 0; i < N; i++) if (mine[i] && state[i] === 0) state[i] = 1;
      render();
      api.onWin();
    }

    // ouvre une case ou des cases ; renvoie le nombre d'écueils heurtés
    function open(list) {
      const delay = new Map();
      let hits = 0;
      const st = state; // 0 et 1 comptent comme fermés pour la cascade
      list.forEach((i) => {
        if (st[i] !== 0) return;
        if (mine[i]) { st[i] = 3; hits++; delay.set(i, 0); return; }
        // cascade : distance depuis la case touchée
        const tmp = new Uint8Array(N);
        for (let j = 0; j < N; j++) tmp[j] = st[j] === 0 ? 0 : 1;
        flood(tmp, i, num, nb, 2).forEach(([a, dd]) => { if (st[a] === 0) { st[a] = 2; if (!delay.has(a)) delay.set(a, dd); } });
      });
      render(delay);
      if (hits) {
        mistakes += hits;
        C.sfx.error();
        list.forEach((i) => {
          if (state[i] !== 3) return;
          const d = cells[i];
          d.classList.remove('hit', 'pop'); void d.offsetWidth; d.classList.add('hit');
          setTimeout(() => d.classList.remove('hit'), 700);
        });
        wreck();
      } else if (delay.size) {
        if (delay.size > 1) C.sfx.place(); else C.sfx.tap();
      }
      return hits;
    }

    // naufrage : tous les écueils apparaissent, puis on propose de reprendre avant le choc ou de recommencer
    let wreckBox = null;
    function wreck() {
      wrecked = true;
      grid.classList.add('wrecked');
      for (let i = 0; i < N; i++) if (mine[i] && state[i] !== 3) cells[i].classList.add('reveal-reef');
      wreckBox = document.createElement('div');
      wreckBox.className = 'dm-wreck';
      wreckBox.innerHTML = '<p><b>Écueil !</b> Ton navire a heurté Charybde.</p>' +
        '<div><button class="dm-undo">Revenir avant le choc</button><button class="dm-restart">Recommencer</button></div>';
      setTimeout(() => { if (wreckBox) grid.appendChild(wreckBox); }, 650);
      wreckBox.querySelector('.dm-undo').addEventListener('click', (e) => { e.stopPropagation(); unwreck(); if (history.length) state = history.pop(); render(); api.onChange(); });
      wreckBox.querySelector('.dm-restart').addEventListener('click', (e) => { e.stopPropagation(); unwreck(); history.length = 0; state = initial.slice(); render(); api.onChange(); C.sfx.tap(); });
    }
    function unwreck() {
      wrecked = false;
      grid.classList.remove('wrecked');
      cells.forEach((d) => d.classList.remove('reveal-reef'));
      if (wreckBox) { wreckBox.remove(); wreckBox = null; }
    }

    function act(i, long) {
      if (won || wrecked) return;
      const flagMode = long || (api.tool && api.tool() === 'cross');
      const s = state[i];
      if (flagMode) {
        if (s !== 0 && s !== 1) return;
        history.push(state.slice());
        state[i] = s === 1 ? 0 : 1;
        render();
        s === 1 ? C.sfx.tap() : C.sfx.place();
      } else if (s === 0) {
        history.push(state.slice());
        open([i]);
      } else if (s === 2 && num[i] > 0) {
        // toucher un nombre déjà satisfait par ses fanions ouvre le reste autour
        const flags = nb[i].filter((j) => state[j] === 1 || state[j] === 3).length;
        const hidden = nb[i].filter((j) => state[j] === 0);
        if (flags !== num[i] || !hidden.length) return;
        history.push(state.slice());
        open(hidden);
      } else return;
      api.onChange();
      check();
    }

    // toucher = action de l'outil ; appui long = fanion
    let press = null;
    const cellAt = (e) => {
      const el = e.target.closest('.cell');
      return el && grid.contains(el) ? +el.dataset.i : -1;
    };
    grid.addEventListener('pointerdown', (e) => {
      const i = cellAt(e);
      if (i < 0 || won) return;
      press = { i, x: e.clientX, y: e.clientY, long: false };
      press.timer = setTimeout(() => {
        if (!press || press.i !== i) return;
        press.long = true;
        if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) try { navigator.vibrate(12); } catch (err) { /* sans vibreur */ }
        act(i, true);
      }, 430);
    });
    grid.addEventListener('pointermove', (e) => {
      if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(press.timer); press = null; }
    });
    grid.addEventListener('pointerup', () => {
      if (!press) return;
      clearTimeout(press.timer);
      if (!press.long) act(press.i, false);
      press = null;
    });
    grid.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; });
    grid.addEventListener('contextmenu', (e) => e.preventDefault());

    // surligne brièvement les nombres qui justifient une astuce
    function showWhy(src) {
      src.forEach((i) => {
        const d = cells[i];
        d.classList.remove('why'); void d.offsetWidth; d.classList.add('why');
        setTimeout(() => d.classList.remove('why'), 2400);
      });
    }

    render();

    return {
      tools: [{ id: 'fill', label: 'Sonder' }, { id: 'cross', label: 'Marquer' }],
      // 💬 la méthode : compter autour des nombres, des sûrs aux écueils
      method: 'Regarde chaque nombre et compte ses cases cachées. S\'il a déjà tous ses écueils, le reste autour est sûr. S\'il a juste autant de cases cachées que d\'écueils, ce sont tous des écueils.',
      status() {
        const flags = state.reduce((s, v) => s + (v === 1 || v === 3 ? 1 : 0), 0);
        return 'Écueils ' + flags + '/' + total + (mistakes ? ' · heurtés ' + mistakes : '');
      },
      undo() {
        if (wrecked) unwreck();
        if (!history.length || won) return;
        state = history.pop();
        render(); api.onChange();
      },
      reset() {
        if (wrecked) unwreck();
        if (won) return;
        history.push(state.slice());
        state = initial.slice();
        render(); api.onChange();
      },
      solve() {
        if (wrecked) unwreck();
        if (won) return;
        history.push(state.slice());
        for (let i = 0; i < N; i++) if (mine[i] && state[i] === 0) state[i] = 1;
        // la mer se retire depuis les cases déjà ouvertes
        const dist = new Map(), q = [];
        for (let i = 0; i < N; i++) if (state[i] === 2) { dist.set(i, 0); q.push(i); }
        while (q.length) {
          const a = q.shift();
          nb[a].forEach((b) => { if (!dist.has(b)) { dist.set(b, dist.get(a) + 1); q.push(b); } });
        }
        for (let i = 0; i < N; i++) if (!mine[i]) state[i] = 2;
        render(dist);
        C.sfx.place();
        check();
      },
      hint() {
        if (won) return false;
        if (wrecked) { unwreck(); if (history.length) state = history.pop(); render(); api.onChange(); }
        // un fanion posé sur une case sûre fausse tout : on le retire d'abord
        for (let i = 0; i < N; i++) {
          if (state[i] === 1 && !mine[i]) {
            C.act(() => { history.push(state.slice()); state[i] = 0; render(); api.onChange(); });
            return { text: 'Ce fanion est mal placé : il n\'y a pas d\'écueil sous cette case. Je le retire.', where: [cells[i]], why: [] };
          }
        }
        const st = new Uint8Array(N);
        for (let i = 0; i < N; i++) st[i] = state[i] === 2 ? 1 : state[i] === 3 || state[i] === 1 ? 2 : 0;
        const mv = findMove(n, num, st);
        if (!mv) return false;
        const target = mv.cells[0];
        const ka = num[mv.src[0]], kb = mv.src[1] != null ? num[mv.src[1]] : 0;
        // les deux nombres d'une déduction croisée : celui qui « place » et celui qui conclut
        let why;
        // déduction croisée : « L'écueil du 1 qui brille est aussi autour du 2… » (deux nombres égaux : « de l'autre 1 »)
        const deB = ka === kb ? 'de l\'autre ' + kb : 'du ' + kb, theB = ka === kb ? 'l\'autre ' + kb : 'le ' + kb;
        const last = mv.ra < ka; // une partie de ses écueils a déjà son fanion : on parle des « derniers »
        const shared = mv.rule === 'subset' ? (mv.ra === 1 ? (last ? 'Le dernier écueil du ' : 'L\'écueil du ') + ka + ' qui brille est'
          : 'Les ' + mv.ra + (last ? ' derniers' : '') + ' écueils du ' + ka + ' qui brille sont') + ' aussi autour ' + deB : '';
        if (mv.kind === 'safe') {
          why = mv.rule === 'single'
            ? (ka === 1 ? 'Le 1 qui brille a déjà son écueil : ses autres cases cachées sont sûres. J\'ouvre la case dorée.'
              : 'Le ' + ka + ' qui brille a déjà ses ' + ka + ' écueils : ses autres cases cachées sont sûres. J\'ouvre la case dorée.')
            : shared + ', qui n\'en attend pas d\'autre : ' + (mv.cells.length > 1 ? 'ses autres cases cachées, dont la dorée, sont sûres.' : 'sa dernière case cachée, la dorée, est sûre.');
        } else {
          why = mv.rule === 'single'
            ? (mv.cells.length === 1 ? 'Le ' + ka + ' qui brille n\'a plus qu\'une case cachée pour son écueil : la dorée. J\'y plante un fanion.'
              : 'Le ' + ka + ' qui brille a juste autant de cases cachées que d\'écueils à trouver : ce sont tous des écueils, dont la dorée.')
            : shared + ', mais ' + theB + ' en attend ' + mv.rd + ' de plus : ' + (mv.cells.length > 1 ? 'ses autres cases cachées, dont la dorée, sont des écueils.' : 'sa dernière case cachée, la dorée, est un écueil.');
        }
        C.act(() => {
          history.push(state.slice());
          if (mv.kind === 'safe') open([target]);
          else { state[target] = 1; render(); C.sfx.place(); }
          api.onChange();
          check();
        });
        return { text: why, where: [cells[target]], why: mv.src.map((s) => cells[s]) };
      },
      destroy() { if (press) clearTimeout(press.timer); }
    };
  }

  // --- tutoriel (dessins 120×120, même esprit que les autres) ---
  const SEA = '#9fc3d3', SAND = 'var(--tile)';
  const tg = (n, cellsFn) => {
    const s = 96 / n;
    let out = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = cellsFn(r, c);
      const x = 12 + c * s + 2, y = 12 + r * s + 2, w = s - 4;
      out += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + w + '" rx="6" fill="' + (v === 'h' || v === 'f' || v === 'x' ? SEA : SAND) + '"' +
        (v === 'x' ? ' stroke="var(--bad)" stroke-width="2.5"' : '') + '/>';
      const cx = x + w / 2, cy = y + w / 2;
      if (typeof v === 'number' && v > 0) out += '<text x="' + cx + '" y="' + (cy + w * 0.17) + '" text-anchor="middle" font-size="' + (w * 0.5) + '" font-family="Jost, sans-serif" font-weight="600" fill="' + ['', '#3f7fbf', '#4f9a6a', '#c4622d'][v] + '">' + v + '</text>';
      if (v === 'f') out += '<path d="M' + (cx - 4) + ' ' + (cy + 9) + 'V' + (cy - 9) + '" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><path d="M' + (cx - 3.5) + ' ' + (cy - 9) + 'l11 4.5-11 4.5z" fill="#c27b5a"/>';
      if (v === 'r' || v === 'x') out += '<path d="M' + (cx - 10) + ' ' + (cy + 6) + 'l5-9 3.5 2.5 4.5-8 7 14.5z" fill="var(--ink)" opacity=".8"/>';
    }
    return out;
  };
  const art = (body) => '<svg viewBox="0 0 120 120" class="tuto-art" style="stroke:none">' + body + '</svg>';
  const fingerAt = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';
  const T1 = [[1, 1, 1], [1, 'r', 1], [1, 1, 1]];
  const T2 = [[0, 1, 'h'], [0, 1, 'h'], [0, 1, 1]];
  const T3 = [[1, 'f', 1], [1, 1, 1], [0, 0, 0]];
  const TUTORIAL = [
    { art: art(tg(3, (r, c) => T1[r][c])),
      text: 'Chaque nombre dit combien d\'<b>écueils</b> se cachent dans les 8 cases qui l\'entourent.' },
    { art: art(tg(3, (r, c) => T2[r][c]) + fingerAt(92, 28)),
      text: 'Touche une case de mer pour la <b>sonder</b>. Ici, le 1 en bas à droite ne voit qu\'une case cachée : c\'est l\'écueil. Celle du haut est sûre.' },
    { art: art(tg(3, (r, c) => T3[r][c])),
      text: 'Pour planter un <b>fanion</b> sur un écueil, appuie longuement ou choisis l\'outil <b>×</b>. Un nombre qui a tous ses fanions ouvre ses autres cases d\'un toucher.' },
    { art: art(tg(3, (r, c) => (r === 1 && c === 1 ? 'x' : r === 0 ? 'h' : 1))),
      text: 'Ouvre toutes les cases sûres. <b>Tout se déduit</b>, sans deviner. Heurter un écueil fait chavirer : tu peux revenir avant le choc ou recommencer.' }
  ];

  C.register({
    id: 'demineur',
    name: 'Démineur',
    tagline: 'Évite les écueils de Charybde',
    accent: '#c27b5a',
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 17V7" stroke="currentColor" stroke-width="2"/><path d="M10 7l6.5 3-6.5 3z" fill="currentColor"/></svg>',
    icon24: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 16.5V7.5"/><path d="M10.3 7.6 16 10l-5.7 2.4z" class="f"/>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Des nombres, des écueils cachés, et rien à deviner.' }
    ],
    rules: {
      classic: [
        'Chaque nombre dit combien d\'<b>écueils</b> touchent sa case, diagonales comprises.',
        'Touche une case pour la <b>sonder</b>. Appui long, ou outil <b>×</b>, pour planter un fanion sur un écueil.',
        'Touche un nombre qui a tous ses fanions : ses autres cases s\'ouvrent d\'un coup.',
        'Ouvre <b>toutes les cases sûres</b>. Tout se déduit, sans deviner ; après un choc, tu peux revenir en arrière.'
      ]
    },
    tutorial: TUTORIAL,
    params,
    generate,
    create
  });
})();
