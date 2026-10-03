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
    if (variant === 'expert') { // Mastermind expert : code plus long, plus de symboles, répétitions
      return { variant: 'classic', len: 5, symbols: 7, repeats: true, tries: level < 20 ? 10 : 9 };
    }
    return {
      variant: 'classic',
      len: level < 4 ? 3 : level < 12 ? 4 : 5,          // code de 3 symboles pour commencer
      symbols: level < 4 ? 4 : Math.min(7, 5 + Math.floor(level / 8)),
      repeats: level >= 6,
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
    let fresh = -1;      // case qui vient de recevoir un jeton
    let freshRow = false; // un essai vient d'être validé : ses témoins apparaissent

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

    // jeton : pastille de couleur pleine avec un gros symbole foncé
    const tokenHTML = (v) => {
      if (v == null) return '';
      if (isLock) return '<span class="digit">' + v + '</span>';
      const s = SYMBOLS[v];
      return '<span class="chip" style="--c:' + s.color + '"><i>' + s.ch + '</i></span>'; // la couleur suffit ; le symbole reste pour le mode daltonien
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
      for (let i = 0; i < L; i++) h += '<i class="peg ' + (i < exact ? 'exact' : i < exact + near ? 'near' : '') + '" style="--k:' + i + '"></i>';
      return h;
    }

    // on n'affiche que les essais joués et l'essai en cours ; les essais restants sont de petits points
    function render() {
      board.innerHTML = '';
      // plateau fixe, comme le vrai Mastermind : toutes les rangées d'essais sont là dès le départ,
      // rien ne bouge quand on joue (les rangées à venir restent en pointillés)
      const shown = over ? rows.length : puzzle.tries;
      for (let r = 0; r < shown; r++) {
        const row = document.createElement('div');
        row.className = 'coffre-row' + (r === rows.length && !over ? ' current' : '') + (r > rows.length ? ' future' : '') + (freshRow && r === rows.length - 1 ? ' fresh' : '');
        const guess = r < rows.length ? rows[r] : r === rows.length ? cur : [];
        let slots = '';
        for (let i = 0; i < L; i++) {
          const v = r === rows.length && locked.has(i) && guess[i] == null ? locked.get(i) : guess[i];
          const isNew = r === rows.length && i === fresh;
          slots += '<button class="slot' + (v == null ? ' empty' : '') + (isNew ? ' new' : '') + '" data-i="' + i + '"' + (r !== rows.length ? ' disabled' : '') + '>' + tokenHTML(v) + '</button>';
        }
        row.innerHTML = '<div class="slots">' + slots + '</div>' +
          '<div class="fb">' + (r < rows.length ? feedbackHTML(rows[r]) : '') + '</div>';
        board.appendChild(row);
      }
      const left = 0; // les essais restants sont les rangées en pointillés
      if (left > 0) {
        const rest = document.createElement('div');
        rest.className = 'coffre-left';
        rest.setAttribute('aria-label', left + ' essais restants');
        rest.innerHTML = '<i></i>'.repeat(left);
        board.appendChild(rest);
      }
      if (over) {
        const reveal = document.createElement('div');
        reveal.className = 'coffre-reveal';
        reveal.innerHTML = '<span>Le code était</span><div class="slots">' + code.map((v) => '<span class="slot">' + tokenHTML(v) + '</span>').join('') +
          '</div><button class="btn primary" id="coffre-retry">Nouveau code</button>';
        board.appendChild(reveal);
        reveal.querySelector('#coffre-retry').addEventListener('click', () => newCode());
      }
      fresh = -1; freshRow = false;
      const curRow = board.querySelector('.coffre-row.current');

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
      // effacer le dernier jeton, puis valider : mêmes dimensions que les jetons
      const del = document.createElement('button');
      del.className = 'key tool-key';
      del.setAttribute('aria-label', 'Effacer');
      del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 6h10v12H9l-5-6z"/><path d="M12 10l4 4M16 10l-4 4"/></svg>';
      del.addEventListener('click', () => {
        for (let i = L - 1; i >= 0; i--) if (cur[i] != null) { cur[i] = undefined; C.sfx.tap(); render(); return; }
      });
      pad.appendChild(del);
      const ok = document.createElement('button');
      ok.className = 'key tool-key enter';
      ok.setAttribute('aria-label', 'Valider');
      ok.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
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
        if (cur[i] == null && !locked.has(i)) { cur[i] = v; fresh = i; C.sfx.tap(); render(); api.onChange(); return; }
      }
    }

    function submit() {
      if (over) return;
      const g = full();
      if (g.some((v) => v == null)) { C.sfx.error(); return; }
      rows.push(g);
      cur = [];
      freshRow = true;
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
      // résolution directe (outil de test) : on tape le bon code
      solve() {
        if (over) newCode();
        cur = code.slice();
        submit();
      },
      hint() {
        if (over) return false;
        const free = [...Array(L).keys()].filter((i) => !locked.has(i));
        if (!free.length) return false;
        const ord = (k) => k + (k === 1 ? 're' : 'e'), ordM = (k) => k + (k === 1 ? 'er' : 'e');
        const nameOf = (v) => (isLock ? String(v) : SYMBOLS[v].ch);
        const rowEls = () => [...board.querySelectorAll('.coffre-row')];
        const reveal = (i) => { locked.set(i, code[i]); cur[i] = undefined; render(); api.onChange(); };
        const slotEl = (i) => { const row = board.querySelector('.coffre-row.current'); return row ? row.querySelectorAll('.slot')[i] : null; };

        if (isLock) {
          // Cadenas : chaque flèche borne le chiffre de sa position
          let best = null;
          free.forEach((i) => {
            let lo = 0, hi = 9, loR = -1, hiR = -1;
            rows.forEach((g, r) => {
              if (code[i] > g[i] && g[i] + 1 > lo) { lo = g[i] + 1; loR = r; }
              if (code[i] < g[i] && g[i] - 1 < hi) { hi = g[i] - 1; hiR = r; }
              if (code[i] === g[i]) { lo = hi = code[i]; loR = hiR = r; }
            });
            const used = [loR, hiR].filter((r) => r >= 0);
            const span = hi - lo;
            if (!best || span < best.span) best = { i, lo, hi, span, used };
          });
          const { i, lo, hi, span, used } = best;
          reveal(i);
          const els = rowEls();
          const why = used.map((r) => els[r] && els[r].querySelectorAll('.arrow')[i]).filter(Boolean);
          let text;
          if (!rows.length) text = 'Coup de pouce : le ' + ordM(i + 1) + ' chiffre est ' + code[i] + '. Ensuite, chaque flèche te dira « plus haut » ou « plus bas » pour sa position.';
          else if (span === 0) text = 'Les flèches surlignées ne laissent qu\'un seul choix pour le ' + ordM(i + 1) + ' chiffre' + (lo > 0 ? ' : plus que ' + (lo - 1) : '') + (hi < 9 ? (lo > 0 ? ', ' : ' : ') + 'moins que ' + (hi + 1) : '') + '. C\'est donc ' + code[i] + '.';
          else if (!used.length) text = 'Coup de pouce : le ' + ordM(i + 1) + ' chiffre est ' + code[i] + '.';
          else text ='Les flèches surlignées disent que le ' + ordM(i + 1) + ' chiffre est entre ' + lo + ' et ' + hi + '. C\'est ' + code[i] + ' ; astuce : vise toujours le milieu de l\'intervalle.';
          return { text, where: [slotEl(i)], why };
        }

        // Classique : codes encore compatibles avec tous les témoins
        const S = puzzle.symbols;
        const total = Math.pow(S, L);
        const fits = (c, rs) => rs.every((r) => { const s = score(c, rows[r]), t = score(code, rows[r]); return s.exact === t.exact && s.near === t.near; });
        const all = [...Array(rows.length).keys()];
        const poss = [];
        if (rows.length && total <= 20000) {
          const c = new Array(L).fill(0);
          for (let k = 0; k < total; k++) {
            let x = k;
            for (let i = 0; i < L; i++) { c[i] = x % S; x = Math.floor(x / S); }
            if (!puzzle.repeats && new Set(c).size < L) continue;
            if ([...locked].some(([i, v]) => c[i] !== v)) continue;
            if (fits(c, all)) poss.push(c.slice());
          }
        }
        // 1. une position où tous les codes possibles ont le même symbole : c'est une vraie déduction
        const forced = free.find((i) => poss.length && poss.every((c) => c[i] === code[i]));
        if (forced !== undefined) {
          // les essais vraiment utiles à cette déduction (on retire ceux dont on peut se passer)
          let need = all.slice();
          for (const r of all) {
            const keep = need.filter((x) => x !== r);
            const ok = poss.length < 4000 && keep.length && (() => {
              const c = new Array(L).fill(0);
              for (let k = 0; k < total; k++) {
                let x = k;
                for (let i = 0; i < L; i++) { c[i] = x % S; x = Math.floor(x / S); }
                if (!puzzle.repeats && new Set(c).size < L) continue;
                if ([...locked].some(([i, v]) => c[i] !== v)) continue;
                if (c[forced] !== code[forced] && fits(c, keep)) return false;
              }
              return true;
            })();
            if (ok) need = keep;
          }
          reveal(forced);
          const els = rowEls();
          const text = (need.length > 1 ? 'Les témoins des essais surlignés' : 'Les témoins de l\'essai surligné') + ' ne laissent qu\'une possibilité pour la ' + ord(forced + 1) + ' case : ' + nameOf(code[forced]) + '. Je le pose.';
          return { text, where: [slotEl(forced)], why: need.map((r) => els[r]).filter(Boolean) };
        }
        // 2. pas de certitude : on révèle une case et on rappelle ce que disent les témoins
        const i = free[0];
        reveal(i);
        const els = rowEls();
        const blank = rows.findIndex((g) => { const s = score(code, g); return s.exact + s.near === 0; });
        let text = 'Coup de pouce : la ' + ord(i + 1) + ' case est ' + nameOf(code[i]) + '. ';
        if (blank >= 0) text += 'Regarde l\'essai surligné : aucun témoin allumé, donc aucun de ses symboles n\'est dans le code.';
        else if (rows.length) text += 'Compare tes essais : un témoin plein = bon symbole bien placé, un creux = bon symbole mal placé.';
        else text += 'Fais un premier essai avec des symboles variés : les témoins te guideront.';
        return { text, where: [slotEl(i)], why: blank >= 0 && els[blank] ? [els[blank]] : [] };
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
      { id: 'expert', name: 'Expert', desc: 'Code de 5 symboles parmi 7, répétitions possibles.' }
    ],
    rules: {
      classic: [
        'Devine la combinaison secrète de symboles en un nombre d\'essais limité.',
        'Après chaque essai : un témoin <b>plein</b> = un symbole bien placé, un témoin <b>creux</b> = un bon symbole mal placé.',
        'Touche une case de la ligne en cours pour l\'effacer.'
      ],
      expert: [
        'Le même Mastermind, en plus exigeant : <b>5 symboles</b> à trouver parmi 7.',
        'Un même symbole peut apparaître <b>plusieurs fois</b> dans le code.',
        'Témoin plein = bien placé, témoin creux = bon symbole mal placé.'
      ]
    },
    params,
    generate,
    create
  });
})();
