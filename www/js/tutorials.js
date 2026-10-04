// Tutoriels illustrés : quelques pages courtes par mini-jeu, chacune avec un petit
// exemple dessiné. Une page de plus pour la variante.
(function () {
  'use strict';
  const C = window.Carnet;

  // --- petits outils de dessin (viewBox 0 0 120 120) ---
  const A = '#e59a9a', B = '#7fa9cc', Y = '#e2bf74', G = '#8fbf8a';
  const svg = (body) => '<svg viewBox="0 0 120 120" class="tuto-art">' + body + '</svg>';
  function grid(n, opt) {
    opt = opt || {};
    const s = 96 / n;
    let out = '<rect x="12" y="12" width="96" height="96" rx="10" fill="var(--board)" stroke="var(--line)"/>';
    for (let i = 1; i < n; i++) {
      out += '<line x1="' + (12 + i * s) + '" y1="12" x2="' + (12 + i * s) + '" y2="108" stroke="var(--grid-line)"/>';
      out += '<line x1="12" y1="' + (12 + i * s) + '" x2="108" y2="' + (12 + i * s) + '" stroke="var(--grid-line)"/>';
    }
    return out;
  }
  const cx = (n, c) => 12 + (c + 0.5) * (96 / n);
  const fillCell = (n, r, c, color, op) => '<rect x="' + (12 + c * 96 / n + 1) + '" y="' + (12 + r * 96 / n + 1) + '" width="' + (96 / n - 2) +
    '" height="' + (96 / n - 2) + '" rx="3" fill="' + color + '" opacity="' + (op || 1) + '"/>';
  const dot = (n, r, c, color, rad) => '<circle cx="' + cx(n, c) + '" cy="' + cx(n, r) + '" r="' + (rad || 96 / n * 0.3) + '" fill="' + color + '"/>';
  const path = (n, cells, color, w) => '<polyline fill="none" stroke="' + color + '" stroke-width="' + (w || 96 / n * 0.26) +
    '" stroke-linecap="round" stroke-linejoin="round" points="' + cells.map(([r, c]) => cx(n, c) + ',' + cx(n, r)).join(' ') + '"/>';
  const text = (n, r, c, t, color) => '<text x="' + cx(n, c) + '" y="' + (cx(n, r) + 5) + '" text-anchor="middle" font-size="' + (96 / n * 0.42) +
    '" font-family="Jost, sans-serif" fill="' + (color || 'var(--ink)') + '">' + t + '</text>';
  const cross = (x, y) => '<path d="M' + (x - 9) + ' ' + (y - 9) + 'l18 18M' + (x + 9) + ' ' + (y - 9) + 'l-18 18" stroke="var(--bad-ink)" stroke-width="3" stroke-linecap="round"/>';
  const sun = (n, r, c) => '<circle cx="' + cx(n, c) + '" cy="' + cx(n, r) + '" r="' + (96 / n * 0.28) + '" fill="#e6c98c"/>';
  const moon = (n, r, c) => {
    const x = cx(n, c), y = cx(n, r), s = 96 / n * 0.3;
    return '<path d="M' + (x + s * 0.3) + ' ' + (y - s) + 'a' + s + ' ' + s + ' 0 1 0 ' + (s * 0.75) + ' ' + (s * 1.6) + 'a' + (s * 0.8) + ' ' + (s * 0.8) + ' 0 0 1 ' + (-s * 0.75) + ' ' + (-s * 1.6) + 'z" fill="#9db8d4"/>';
  };
  const finger = (x, y) => '<g opacity=".75"><circle cx="' + x + '" cy="' + y + '" r="7" fill="var(--ink)" opacity=".18"/><circle cx="' + x + '" cy="' + y + '" r="3" fill="var(--ink)"/></g>';

  const T = {};

  T.flux = {
    steps: [
      { art: svg(grid(4) + path(4, [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], A) + dot(4, 0, 0, A) + dot(4, 2, 2, A) + dot(4, 0, 3, B) + dot(4, 3, 3, B) + finger(cx(4, 2), cx(4, 2))),
        text: 'Glisse le doigt d\'un point à l\'autre pour relier <b>les deux points de même couleur</b>.' },
      { art: svg(grid(4) + path(4, [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], A) + path(4, [[0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]], B) +
          path(4, [[1, 1], [1, 2]], Y) + path(4, [[3, 0], [3, 1], [3, 2]], G) +
          dot(4, 0, 0, A) + dot(4, 2, 2, A) + dot(4, 0, 1, B) + dot(4, 3, 3, B) + dot(4, 1, 1, Y) + dot(4, 1, 2, Y) + dot(4, 3, 0, G) + dot(4, 3, 2, G)),
        text: 'Relie toutes les paires et <b>remplis toute la grille</b>. Les tuyaux ne se croisent pas.' },
      { art: svg(grid(3) + '<rect x="45" y="45" width="30" height="30" fill="none" stroke="var(--faint)" stroke-dasharray="3 3"/>' +
          path(3, [[0, 1], [1, 1], [2, 1]], B) + '<line x1="44" y1="60" x2="76" y2="60" stroke="var(--board)" stroke-width="13"/>' +
          path(3, [[1, 0], [1, 1], [1, 2]], A) + dot(3, 1, 0, A) + dot(3, 1, 2, A) + dot(3, 0, 1, B) + dot(3, 2, 1, B)),
        text: 'Sur un <b>pont</b>, deux tuyaux peuvent se croiser : l\'un à l\'horizontale, l\'autre à la verticale.' }
    ],
    variants: {
      tore: { art: svg(grid(4) + path(4, [[1, 2], [1, 3]], A) + '<line x1="96" y1="' + cx(4, 1) + '" x2="112" y2="' + cx(4, 1) + '" stroke="' + A + '" stroke-width="6" stroke-linecap="round"/>' +
          '<line x1="8" y1="' + cx(4, 1) + '" x2="' + cx(4, 0) + '" y2="' + cx(4, 1) + '" stroke="' + A + '" stroke-width="6" stroke-linecap="round"/>' + dot(4, 1, 2, A) + dot(4, 1, 0, A) +
          '<path d="M108 30 q8 -10 0 -18M12 30 q-8 -10 0 -18" fill="none" stroke="var(--muted)" stroke-width="1.5"/>'),
        text: '<b>Variante Tore</b> : les bords communiquent. Un tuyau qui sort à droite ressort à gauche (glisse juste au-delà du bord).' }
    }
  };

  T.reines = {
    steps: [
      { art: svg(grid(4) + fillCell(4, 0, 0, '#f3dcd7') + fillCell(4, 0, 1, '#f3dcd7') + fillCell(4, 1, 0, '#f3dcd7') +
          fillCell(4, 0, 2, '#d9e6ef') + fillCell(4, 0, 3, '#d9e6ef') + fillCell(4, 1, 3, '#d9e6ef') +
          fillCell(4, 1, 1, '#e2ecd8') + fillCell(4, 1, 2, '#e2ecd8') + fillCell(4, 2, 1, '#e2ecd8') + fillCell(4, 2, 2, '#e2ecd8') + fillCell(4, 2, 0, '#e2ecd8') +
          [[3, 0], [3, 1], [3, 2], [3, 3], [2, 3]].map(([r, c]) => fillCell(4, r, c, '#f4ead2')).join('') +
          dot(4, 0, 1, 'var(--ink)', 7) + dot(4, 1, 3, 'var(--ink)', 7) + dot(4, 2, 0, 'var(--ink)', 7) + dot(4, 3, 2, 'var(--ink)', 7)),
        text: 'Place <b>une couronne par ligne, par colonne et par zone de couleur</b>.' },
      { art: svg(grid(4) + dot(4, 1, 1, 'var(--ink)', 7) + dot(4, 2, 2, 'var(--bad-ink)', 7) + cross(cx(4, 2) + 14, cx(4, 2) - 14)),
        text: 'Deux couronnes <b>ne se touchent jamais</b>, même en diagonale. Les cases qu\'une couronne interdit se pointent toutes seules.' },
      { art: svg(grid(3) + dot(3, 1, 0, 'var(--muted)', 4) + dot(3, 1, 2, 'var(--ink)', 9) + finger(cx(3, 0) + 8, cx(3, 1) + 8) +
          '<text x="' + cx(3, 0) + '" y="104" text-anchor="middle" font-size="9" fill="var(--muted)">1 toucher</text>' +
          '<text x="' + cx(3, 2) + '" y="104" text-anchor="middle" font-size="9" fill="var(--muted)">2 touchers</text>'),
        text: 'Touche une fois pour un <b>point</b>, deux fois pour une <b>couronne</b>. Glisse pour pointer plusieurs cases ; pars d\'un point pour les effacer.' }
    ],
    variants: {
      cavaliers: { art: svg(grid(4) + dot(4, 0, 0, 'var(--ink)', 7) + dot(4, 1, 2, 'var(--bad-ink)', 7) +
          '<path d="M' + cx(4, 0) + ' ' + cx(4, 0) + 'H' + cx(4, 2) + 'V' + cx(4, 1) + '" fill="none" stroke="var(--bad-ink)" stroke-dasharray="3 3"/>' + dot(4, 1, 1, 'var(--ink)', 7)),
        text: '<b>Variante Cavaliers</b> : les couronnes peuvent se toucher, mais jamais à un <b>saut de cavalier</b> (2 cases puis 1).' }
    }
  };

  T.astres = {
    steps: [
      { art: svg(grid(4) + sun(4, 1, 0) + moon(4, 1, 1) + sun(4, 1, 2) + moon(4, 1, 3)),
        text: 'Remplis la grille de <b>carrés</b> et de <b>ronds</b> : autant de chaque par ligne et par colonne.' },
      { art: svg(grid(4) + sun(4, 1, 0) + sun(4, 1, 1) + sun(4, 1, 2) + '<line x1="16" y1="' + cx(4, 1) + '" x2="80" y2="' + cx(4, 1) + '" stroke="var(--bad-ink)" stroke-width="2"/>'),
        text: 'Jamais <b>trois pareils</b> à la suite, en ligne comme en colonne.' },
      { art: svg(grid(4) + sun(4, 1, 1) + sun(4, 1, 2) + text(4, 1, 1.5, '=', 'var(--muted)') + sun(4, 2, 1) + moon(4, 2, 2) + text(4, 2, 1.5, '×', 'var(--muted)')),
        text: '<b>=</b> : les deux cases sont pareilles. <b>×</b> : elles sont différentes. Touche une case : carré, puis rond, puis vide.' }
    ],
    variants: {
      diagonales: { art: svg(grid(4) + moon(4, 0, 0) + moon(4, 1, 1) + moon(4, 2, 2) + '<line x1="20" y1="20" x2="78" y2="78" stroke="var(--bad-ink)" stroke-width="2"/>'),
        text: '<b>Variante Diagonales</b> : jamais trois pareils à la suite, <b>même en diagonale</b>.' }
    }
  };

  T.paves = {
    steps: [
      { art: svg(grid(4) + '<rect x="15" y="15" width="42" height="42" rx="6" fill="#d9e6ef"/>' + text(4, 0.5, 0.5, '4') + text(4, 2, 3, '3') + finger(57, 57)),
        text: 'Glisse le doigt pour tracer un <b>rectangle</b> autour d\'un nombre : il doit avoir autant de cases que ce nombre.' },
      { art: svg(grid(4) + '<rect x="15" y="15" width="42" height="42" rx="6" fill="#d9e6ef"/><rect x="63" y="15" width="42" height="18" rx="6" fill="#f3dcd7"/>' +
          '<rect x="87" y="39" width="18" height="66" rx="6" fill="#e2ecd8"/><rect x="15" y="63" width="66" height="42" rx="6" fill="#f4ead2"/><rect x="63" y="39" width="18" height="18" rx="6" fill="#ebe2f1"/>' +
          text(4, 0.5, 0.5, '4') + text(4, 0, 2.5, '2') + text(4, 2, 3, '3') + text(4, 2.5, 1, '6') + text(4, 1, 2, '1')),
        text: 'Chaque rectangle contient <b>un seul nombre</b>, et toute la grille doit être couverte. Touche un rectangle pour l\'effacer.' }
    ],
    variants: {
      mystere: { art: svg(grid(4) + text(4, 1, 1, '?', 'var(--muted)') + text(4, 2, 3, '3')),
        text: '<b>Variante Mystère</b> : un <b>?</b> cache la taille de son rectangle. Déduis-la à partir des autres.' }
    }
  };

  T.pixels = {
    steps: [
      { art: svg('<text x="20" y="62" font-size="11" fill="var(--muted)" text-anchor="middle">3 1</text>' +
          [0, 1, 2, 3, 4].map((c) => '<rect x="' + (32 + c * 16) + '" y="50" width="15" height="15" rx="2" fill="' + (c < 3 || c === 4 ? 'var(--game)' : 'var(--soft)') + '"/>').join('')),
        text: 'Les nombres indiquent les <b>blocs de cases pleines</b> d\'une ligne ou d\'une colonne, dans l\'ordre.' },
      { art: svg('<text x="20" y="62" font-size="11" fill="var(--muted)" text-anchor="middle">3 1</text>' +
          [0, 1, 2, 3, 4].map((c) => '<rect x="' + (32 + c * 16) + '" y="50" width="15" height="15" rx="2" fill="' + (c === 3 ? 'var(--soft)' : 'var(--game)') + '"/>').join('') +
          '<path d="M' + (32 + 3 * 16 + 4) + ' 54l7 7M' + (32 + 3 * 16 + 11) + ' 54l-7 7" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round"/>'),
        text: 'Entre deux blocs, au moins une case vide. Outil <b>■</b> pour remplir, outil <b>×</b> pour barrer une case vide.' }
    ],
    variants: {
      miroir: { art: svg(grid(4) + fillCell(4, 1, 0, 'var(--game)') + fillCell(4, 1, 3, 'var(--game)', 0.5) + '<line x1="60" y1="8" x2="60" y2="112" stroke="var(--muted)" stroke-dasharray="4 3"/>'),
        text: '<b>Variante Miroir</b> : le dessin est symétrique. Chaque case posée se recopie de l\'autre côté, et seules les colonnes de gauche ont leurs nombres.' }
    }
  };

  T.serpent = {
    steps: [
      { art: svg(grid(3) + path(3, [[0, 0], [0, 1], [0, 2], [1, 2], [1, 1], [1, 0], [2, 0], [2, 1], [2, 2]], '#8cbfb8', 7) +
          dot(3, 0, 0, 'var(--board)', 9) + text(3, 0, 0, '1') + dot(3, 1, 1, 'var(--board)', 9) + text(3, 1, 1, '2') + dot(3, 2, 2, 'var(--board)', 9) + text(3, 2, 2, '3')),
        text: 'Pars du <b>1</b> et glisse le doigt : un seul chemin, qui passe par <b>toutes les cases</b>, une seule fois.' },
      { art: svg(grid(3) + text(3, 0, 0, '1') + text(3, 1, 1, '2') + text(3, 2, 2, '3')),
        text: 'Passe par les nombres <b>dans l\'ordre</b> et termine sur le plus grand. Reviens en arrière pour effacer.' }
    ],
    variants: {
      laby: { art: svg(grid(3) + '<line x1="44" y1="44" x2="44" y2="108" stroke="var(--muted)" stroke-width="3" stroke-linecap="round"/>' + dot(3, 0, 0, '#8cbfb8', 8) +
          '<circle cx="' + cx(3, 2) + '" cy="' + cx(3, 2) + '" r="8" fill="none" stroke="#8cbfb8" stroke-width="2"/>'),
        text: '<b>Variante Labyrinthe</b> : un départ (point plein), une arrivée (anneau) et des <b>murs</b> infranchissables.' }
    }
  };

  // Lumières : un petit ciel de nuit 3×3, étoiles dorées, anneaux de la constellation
  const lSky = '<rect x="10" y="10" width="100" height="100" rx="22" fill="#5450b6"/>';
  const lStar = (r, c, col, s) => '<path transform="translate(' + cx(3, c) + ' ' + cx(3, r) + ') scale(' + (s || 1) * 0.72 + ')" ' +
    'd="M0-16l4.7 9.6 10.5 1.5-7.6 7.4 1.8 10.5L0 8.1l-9.4 4.9 1.8-10.5-7.6-7.4 10.5-1.5z" fill="' + col + '" stroke="' + col + '" stroke-width="3" stroke-linejoin="round"/>';
  const lDot = (r, c) => '<circle cx="' + cx(3, c) + '" cy="' + cx(3, r) + '" r="2.6" fill="#fff" opacity=".4"/>';
  const lRing = (r, c, solid) => '<circle cx="' + cx(3, c) + '" cy="' + cx(3, r) + '" r="13" fill="none" stroke="#ffd23f" stroke-width="2.5"' + (solid ? '' : ' stroke-dasharray="4 3"') + '/>';
  const lSkyOf = (lit, rings, stray) => {
    let out = lSky;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const k = r * 3 + c, ring = rings.includes(k), on = lit.includes(k), st = (stray || []).includes(k);
      if (ring) out += lRing(r, c, on);
      out += on ? lStar(r, c, '#ffd23f') : st ? lStar(r, c, '#efe6ff', 0.8) : lDot(r, c);
    }
    return out;
  };
  T.lumieres = {
    steps: [
      { art: svg(lSkyOf([1, 3, 4, 5, 7], []) + finger(cx(3, 1) + 7, cx(3, 1) + 9)),
        text: 'Touche une case : <b>elle et ses 4 voisines</b> s\'allument ou s\'éteignent.' },
      { art: svg(lSkyOf([0, 1], [0, 1, 3], [8])),
        text: 'Allume <b>exactement les étoiles cerclées d\'or</b> : la constellation. Éteins les étoiles en trop.' },
      { art: svg(lSkyOf([0, 1, 3], [0, 1, 3]) + '<path d="M28 28H60M28 28V60" stroke="#ffe89a" stroke-width="2.5" stroke-linecap="round"/>' +
          '<circle cx="60" cy="4.5" r="3.6" fill="#ffd23f" stroke="#e8a400" stroke-width="2"/>' + finger(cx(3, 0) + 7, cx(3, 0) + 9)),
        text: 'Les points en haut : le <b>nombre de coups</b> de la solution la plus courte. Un défi en plus, pas une obligation.' }
    ],
    variants: {
      croix: { art: svg(lSkyOf([0, 2, 4, 6, 8], []) + finger(cx(3, 1) + 7, cx(3, 1) + 9)),
        text: '<b>Variante Croix</b> : chaque appui inverse la case et ses <b>4 voisines en diagonale</b>.' }
    }
  };

  T.coffre = {
    steps: [
      { art: svg([0, 1, 2, 3].map((i) => '<circle cx="' + (22 + i * 22) + '" cy="50" r="9" fill="var(--soft)"/><text x="' + (22 + i * 22) + '" y="55" text-anchor="middle" font-size="12" fill="' +
          [A, B, Y, G][i] + '">' + ['●', '▲', '■', '◆'][i] + '</text>').join('') +
          '<circle cx="40" cy="80" r="4" fill="var(--ink)"/><circle cx="54" cy="80" r="4" fill="none" stroke="var(--ink)"/><circle cx="68" cy="80" r="4" fill="none" stroke="var(--faint)"/><circle cx="82" cy="80" r="4" fill="none" stroke="var(--faint)"/>'),
        text: 'Devine le <b>code secret</b>. Après chaque essai : témoin plein = bien placé, témoin creux = bon symbole mal placé.' },
      { art: svg('<path d="M44 61l11 11 22-24" fill="none" stroke="var(--game)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
        text: 'Compose ton code avec les symboles du bas, puis valide avec <b>✓</b>. Touche une case pour la vider. Le nombre d\'essais est limité.' }
    ],
    variants: {
      expert: { art: svg([0, 1, 2, 3, 4].map((i) => '<circle cx="' + (16 + i * 22) + '" cy="56" r="9" fill="var(--soft)"/><text x="' + (16 + i * 22) + '" y="61" text-anchor="middle" font-size="12" fill="' +
          [A, A, Y, B, G][i] + '">' + ['●', '●', '■', '▲', '◆'][i] + '</text>').join('')),
        text: '<b>Variante Expert</b> : 5 symboles parmi 7, et un symbole peut revenir <b>plusieurs fois</b>.' }
    }
  };

  // Tuyaux : pièces à faire tourner
  const pipe = (x, y, dirs, color, lit) => {
    const s = 26, arms = { u: [0, -1], r: [1, 0], d: [0, 1], l: [-1, 0] };
    let out = '';
    dirs.split('').forEach((k) => {
      const [dx, dy] = arms[k];
      out += '<line x1="' + x + '" y1="' + y + '" x2="' + (x + dx * s / 2) + '" y2="' + (y + dy * s / 2) + '" stroke="' + color + '" stroke-width="10"/>' +
        '<line x1="' + x + '" y1="' + y + '" x2="' + (x + dx * s / 2) + '" y2="' + (y + dy * s / 2) + '" stroke="' + (lit ? color : 'var(--bg)') + '" stroke-width="6"/>';
    });
    if (dirs.length === 1) out += '<circle cx="' + x + '" cy="' + y + '" r="7" fill="' + color + '"/>';
    return out;
  };
  T.tuyaux = {
    steps: [
      { art: svg(pipe(47, 60, 'r', 'var(--game)', true) + pipe(73, 60, 'ul', 'var(--muted)') +
          '<path d="M86 40a14 14 0 1 1-4-10" fill="none" stroke="var(--muted)" stroke-width="1.5"/><path d="M82 26l1 5-5 0" fill="none" stroke="var(--muted)" stroke-width="1.5"/>' + finger(73, 60)),
        text: 'Touche une pièce pour la faire <b>tourner</b> d\'un quart de tour.' },
      { art: svg(pipe(34, 60, 'r', 'var(--game)', true) + pipe(60, 60, 'lrd', 'var(--game)', true) + pipe(86, 60, 'l', 'var(--game)', true) + pipe(60, 86, 'u', 'var(--game)', true) +
          '<circle cx="34" cy="60" r="3" fill="var(--bg)"/>'),
        text: 'Relie <b>toutes les pièces à la source</b> : l\'eau coule dans les tuyaux raccordés. Aucun tuyau ne doit rester ouvert.' }
    ],
    variants: {
      tore: { art: svg(pipe(24, 60, 'l', 'var(--game)', true) + pipe(96, 60, 'r', 'var(--game)', true) +
          '<path d="M8 50v20M112 50v20" stroke="var(--muted)" stroke-dasharray="2 3"/>'),
        text: '<b>Variante Tore</b> : un tuyau peut sortir par un bord et revenir par le bord opposé.' }
    }
  };

  // pages à montrer : tout le tutoriel, ou seulement la page de variante si le jeu est déjà connu
  C.tutorial = function (id, variant, knowsBase) {
    const g = C.games.find((x) => x.id === id);
    const t = T[id] || (g && g.tutorial ? { steps: g.tutorial } : null); // un jeu peut apporter ses propres pages
    if (!t) return [];
    const v = variant !== 'classic' && t.variants && t.variants[variant];
    if (v && knowsBase) return [v];
    return v ? t.steps.concat([v]) : t.steps;
  };
})();
