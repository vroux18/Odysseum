// Coffre : deviner un code secret en un nombre d'essais limité.
// Classique : symboles colorés, indices « bien placé / mal placé ».
// Cadenas : chiffres, chaque position indique plus haut / plus bas.
(function () {
  'use strict';
  const C = window.Carnet;

  const SYMBOLS = [
    { ch: '●', color: '#e59a9a' }, { ch: '▲', color: '#7fa9cc' }, { ch: '■', color: '#e2bf74' },
    { ch: '◆', color: '#8fbf8a' }, { ch: '★', color: '#b39ddb' }, { ch: '♥', color: '#eda77c' },
    { ch: '✚', color: '#6fb5ad' }
  ];

  function generate(rng, p) {
    const codes = [];
    for (let k = 0; k < 6; k++) {
      const code = [];
      const pool = [...Array(p.symbols).keys()];
      for (let i = 0; i < p.len; i++) {
        if (p.repeats) code.push(rng.int(p.symbols));
        else code.push(pool.splice(rng.int(pool.length), 1)[0]);
      }
      codes.push(code);
    }
    return Object.assign({ codes }, p);
  }

  function params(level, variant) {
    if (variant === 'cadenas') {
      return { variant, len: Math.min(6, 3 + Math.floor((level + 2) / 6)), symbols: 10, repeats: true, tries: 6 };
    }
    return {
      variant: 'classic',
      len: level < 10 ? 4 : 5,
      symbols: Math.min(7, 5 + Math.floor(level / 8)),
      repeats: level >= 5,
      tries: level < 10 ? 8 : 9
    };
  }

  function score(code, guess) {
    let exact = 0;
    const a = {}, b = {};
    code.forEach((v, i) => {
      if (guess[i] === v) exact++;
      else { a[v] = (a[v] || 0) + 1; b[guess[i]] = (b[guess[i]] || 0) + 1; }
    });
    let near = 0;
    Object.keys(a).forEach((k) => { near += Math.min(a[k], b[k] || 0); });
    return { exact, near };
  }

  function create(host, puzzle, api) {
    const isLock = puzzle.variant === 'cadenas';
    const L = puzzle.len;
    let round = 0;
    let code = puzzle.codes[0];
    let rows = []; // essais validés
    let cur = [];
    let locked = new Map(); // positions révélées par indice
    let over = false;

    const box = document.createElement('div');
    box.className = 'coffre' + (isLock ? ' lock' : '');
    box.style.setProperty('--len', L);
    host.appendChild(box);

    const board = document.createElement('div');
    board.className = 'coffre-rows';
    box.appendChild(board);
    const pad = document.createElement('div');
    pad.className = 'coffre-pad';
    box.appendChild(pad);

    const tokenHTML = (v) => {
      if (v == null) return '';
      if (isLock) return '<span class="digit">' + v + '</span>';
      const s = SYMBOLS[v];
      return '<span class="sym" style="color:' + s.color + '">' + s.ch + '</span>';
    };

    function feedbackHTML(guess) {
      if (isLock) {
        return guess.map((g, i) => {
          const t = code[i];
          return '<span class="arrow ' + (g === t ? 'ok' : '') + '">' + (g === t ? '✓' : t > g ? '▲' : '▼') + '</span>';
        }).join('');
      }
      const { exact, near } = score(code, guess);
      let h = '';
      for (let i = 0; i < L; i++) h += '<i class="peg ' + (i < exact ? 'exact' : i < exact + near ? 'near' : '') + '"></i>';
      return h;
    }

    function render() {
      board.innerHTML = '';
      for (let r = 0; r < puzzle.tries; r++) {
        const row = document.createElement('div');
        row.className = 'coffre-row' + (r === rows.length && !over ? ' current' : '');
        const guess = r < rows.length ? rows[r] : r === rows.length ? cur : [];
        let slots = '';
        for (let i = 0; i < L; i++) {
          const v = r === rows.length && locked.has(i) && guess[i] == null ? locked.get(i) : guess[i];
          slots += '<button class="slot" data-i="' + i + '"' + (r !== rows.length ? ' disabled' : '') + '>' + tokenHTML(v) + '</button>';
        }
        row.innerHTML = '<span class="row-num">' + (r + 1) + '</span><div class="slots">' + slots + '</div>' +
          '<div class="fb">' + (r < rows.length ? feedbackHTML(rows[r]) : '') + '</div>';
        board.appendChild(row);
      }
      if (over) {
        const reveal = document.createElement('div');
        reveal.className = 'coffre-reveal';
        reveal.innerHTML = '<span>Le code était</span><div class="slots">' + code.map((v) => '<span class="slot">' + tokenHTML(v) + '</span>').join('') +
          '</div><button class="btn primary" id="coffre-retry">Nouveau code</button>';
        board.appendChild(reveal);
        reveal.querySelector('#coffre-retry').addEventListener('click', () => newCode());
      }
      const curRow = board.querySelector('.coffre-row.current');
      if (curRow) curRow.scrollIntoView({ block: 'nearest' });
    }

    function renderPad() {
      pad.innerHTML = '';
      for (let v = 0; v < puzzle.symbols; v++) {
        const b = document.createElement('button');
        b.className = 'key';
        b.innerHTML = tokenHTML(v);
        b.addEventListener('click', () => put(v));
        pad.appendChild(b);
      }
      const ok = document.createElement('button');
      ok.className = 'key enter';
      ok.textContent = 'OK';
      ok.addEventListener('click', submit);
      pad.appendChild(ok);
    }

    function full() {
      const g = [];
      for (let i = 0; i < L; i++) g.push(cur[i] != null ? cur[i] : locked.get(i));
      return g;
    }

    function put(v) {
      if (over) return;
      for (let i = 0; i < L; i++) {
        if (cur[i] == null && !locked.has(i)) { cur[i] = v; C.sfx.tap(); render(); api.onChange(); return; }
      }
    }

    function submit() {
      if (over) return;
      const g = full();
      if (g.some((v) => v == null)) { C.sfx.error(); return; }
      rows.push(g);
      cur = [];
      const won = g.every((v, i) => v === code[i]);
      if (won) { over = true; render(); api.onWin(); return; }
      C.sfx.place();
      if (rows.length >= puzzle.tries) { over = true; C.sfx.error(); }
      render(); api.onChange();
    }

    function newCode() {
      round = (round + 1) % puzzle.codes.length;
      code = puzzle.codes[round];
      rows = []; cur = []; locked = new Map(); over = false;
      render(); api.onChange();
    }

    board.addEventListener('click', (e) => {
      const s = e.target.closest('.slot');
      if (!s || s.disabled || over) return;
      const i = +s.dataset.i;
      if (cur[i] != null) { cur[i] = undefined; C.sfx.tap(); render(); api.onChange(); }
    });

    render();
    renderPad();

    return {
      status() {
        return over ? 'Coffre verrouillé : essaie un nouveau code' : 'Essai ' + Math.min(rows.length + 1, puzzle.tries) + '/' + puzzle.tries;
      },
      undo() {
        for (let i = L - 1; i >= 0; i--) if (cur[i] != null) { cur[i] = undefined; render(); api.onChange(); return; }
      },
      reset() { cur = []; render(); api.onChange(); },
      hint() {
        if (over) return false;
        for (let i = 0; i < L; i++) {
          if (!locked.has(i)) { locked.set(i, code[i]); cur[i] = undefined; render(); api.onChange(); return true; }
        }
        return false;
      },
      destroy() {}
    };
  }

  C.register({
    id: 'coffre',
    name: 'Coffre',
    tagline: 'Perce le code secret',
    accent: '#b18cff',
    icon: '<svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path d="M8 2h8v2h2v6h-2V4H8v6H6V4h2zM4 10h16v12H4zm7 4v4h2v-4z" fill="currentColor"/></svg>',
    variants: [
      { id: 'classic', name: 'Classique', desc: 'Symboles, indices bien placé / mal placé.' },
      { id: 'cadenas', name: 'Cadenas', desc: 'Chiffres, chaque position dit plus haut ou plus bas.' }
    ],
    rules: {
      classic: [
        'Devine la combinaison secrète de symboles en un nombre d\'essais limité.',
        'Après chaque essai : un témoin <b>plein</b> = un symbole bien placé, un témoin <b>creux</b> = un bon symbole mal placé.',
        'Touche une case de la ligne en cours pour l\'effacer.'
      ],
      cadenas: [
        'Devine le code à chiffres du cadenas.',
        'Sous chaque chiffre : <b>✓</b> s\'il est juste, <b>▲</b> si le bon chiffre est plus grand, <b>▼</b> s\'il est plus petit.',
        'Tu as 6 essais. Un raisonnement par dichotomie aide beaucoup.'
      ]
    },
    params,
    generate,
    create
  });
})();
