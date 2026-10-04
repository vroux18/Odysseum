// Odysseum — coquille de l'application : le sentier, les niveaux, les boss, la partie.
// Volontairement silencieuse : pas de chrono, pas de compteur affiché.
(function () {
  'use strict';
  const C = window.Carnet;
  const $ = (sel) => document.querySelector(sel);

  // Une seule couleur par capacité, partagée par tous ses jeux (reprise dans css/cartoon.css) :
  // déduction orange, espace vert, anticipation bleu, hypothèses violet, mémoire rose.
  const SK_COL = { logique: '#f2773f', espace: '#4cb82e', anticipation: '#3d8ee8', raisonnement: '#8f7cf0', memoire: '#ff6fb5' };
  // chaque jeu : une nuance de la couleur de sa capacité (même famille, légèrement plus claire ou plus profonde)
  const ACCENT = {
    reines: SK_COL.logique, astres: '#f7a046', demineur: '#e25a3a',
    paves: SK_COL.espace, pixels: '#7ccc3f', tuyaux: '#2f9e5a',
    flux: SK_COL.anticipation, serpent: '#38b3e0', rushhour: '#3466c9',
    lumieres: SK_COL.raisonnement, coffre: '#a98ff5', bataille: '#6f5fd6', oracle: '#7a63e0',
    simon: SK_COL.memoire, amphores: '#e4579f', mosaique: '#ff94cb'
  };
  // Icônes au trait, toutes sur la même grille 24×24.
  const ICON = {
    flux: '<circle cx="5.5" cy="6" r="2.2" class="f"/><circle cx="18.5" cy="18" r="2.2" class="f"/><path d="M5.5 8.2V12a3 3 0 0 0 3 3h7a3 3 0 0 1 3 3"/>',
    reines: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 4v16M4 12h16"/><circle cx="8" cy="8" r="1.7" class="f"/><circle cx="16" cy="16" r="1.7" class="f"/>',
    astres: '<circle cx="8" cy="12" r="3.6" class="f"/><path d="M17.5 7.6a4.4 4.4 0 1 0 0 8.8 3.5 3.5 0 0 1 0-8.8z"/>',
    paves: '<rect x="4" y="4" width="9" height="7" rx="1.6"/><rect x="15" y="4" width="5" height="16" rx="1.6"/><rect x="4" y="13" width="9" height="7" rx="1.6"/>',
    pixels: '<rect x="4" y="4" width="4.5" height="4.5" rx="1" class="f"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1" class="f"/><rect x="15.5" y="4" width="4.5" height="4.5" rx="1"/><rect x="4" y="15.5" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="15.5" width="4.5" height="4.5" rx="1" class="f"/>',
    serpent: '<circle cx="5" cy="5" r="1.6" class="f"/><path d="M5 5h14v4.7H5v4.6h14V19H6.5"/>',
    lumieres: '<circle cx="12" cy="12" r="4" class="f"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
    tuyaux: '<path d="M4 8h6v8h10M14 4v4h6"/><circle cx="10" cy="8" r="2.2" class="f"/>',
    coffre: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4v3M4 12h1.5M18.5 12H20"/>',
    // amphore, quatre tesselles, grille logique cochée
    amphores: '<path d="M9.5 3.5h5v1.8c2.8 1.3 4.3 3.8 4.3 7 0 3.8-2.6 6.4-5 7.4v.8h-4.6v-.8c-2.4-1-5-3.6-5-7.4 0-3.2 1.5-5.7 4.3-7z"/><path d="M7.5 11h9M8 14.5h8"/>',
    mosaique: '<rect x="4" y="4" width="7" height="7" rx="1.6" class="f"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6" class="f"/>',
    oracle: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 4v16"/><path d="M12.5 15.2l1.6 1.6 3.2-3.4"/><path d="M6.2 12.2l1.8 1.8M8 12.2 6.2 14"/>'
  };
  // les mini-jeux ajoutés plus tard apportent leur teinte et leur icône (24×24) en s'enregistrant
  C.games.forEach((g) => {
    if (!ACCENT[g.id] && g.accent) ACCENT[g.id] = g.accent;
    if (!ICON[g.id] && g.icon24) ICON[g.id] = g.icon24;
  });
  const icon = (id) => '<svg viewBox="0 0 24 24">' + ICON[id] + '</svg>';
  // icônes d'interface : Phosphor duotone (MIT), sprite assets/ui/icons.svg
  const UI = (name, extra) => '<svg class="ic' + (extra ? ' ' + extra : '') + '" viewBox="0 0 256 256" aria-hidden="true"><use href="assets/ui/icons.svg#i-' + name + '"/></svg>';
  const TOOL_ICON = {
    fill: UI('square', 'ic-solid'),
    cross: UI('x')
  };

  const game = (id) => C.games.find((g) => g.id === id);
  const variantsOf = (g) => g.variants || [{ id: 'classic', name: 'Classique' }];
  const rulesOf = (g, v) => (Array.isArray(g.rules) ? g.rules : g.rules[v] || g.rules.classic);
  const dataKey = (g, v) => (v === 'classic' ? g.id : g.id + ':' + v);

  // ------------------------------------------------------------------
  // Étoiles (1 à 3) selon le temps : chaque grille a un temps « cible » en secondes,
  // déduit de sa taille ; une série (niveau, boss) additionne ceux de ses grilles.
  // 3★ ≤ cible, 2★ ≤ 2 × cible, sinon 1★ ; chaque astuce retire une étoile (au moins 1).
  // Grille résolue d'office (bouton de test) : 0 étoile, aucun record touché.
  // ------------------------------------------------------------------
  const sq = (n) => (n || 5) * (n || 5);
  const TARGET = {
    reines: (p) => 8 + 0.85 * sq(p.n),                         // 8×8 ≈ 62 s
    flux: (p) => 6 + 0.9 * sq(p.n) + 8 * (p.bridges || 0),     // 7×7 ≈ 50 s
    tuyaux: (p) => 5 + 0.8 * sq(p.n),                          // 6×6 ≈ 34 s
    astres: (p) => 6 + 1.2 * sq(p.n),                          // 6×6 ≈ 49 s
    paves: (p) => 6 + 0.7 * sq(p.n) + 3 * (p.mystery || 0),    // 8×8 ≈ 51 s
    pixels: (p) => 8 + 1.0 * sq(p.n),                          // 10×10 ≈ 108 s
    serpent: (p) => 6 + 0.9 * sq(p.n),                         // 8×8 ≈ 64 s
    lumieres: (p) => 6 + 4 * (p.presses || 4),                 // 12 appuis ≈ 54 s
    coffre: (p) => 10 + 6 * (p.len || 4) + 2 * (p.symbols || 6), // code de 5 parmi 7 ≈ 54 s
    demineur: (p) => 8 + 0.8 * sq(p.n),                        // 9×9 ≈ 73 s
    bataille: (p) => 8 + 1.0 * sq(p.n),                        // 8×8 ≈ 72 s
    rushhour: (p) => 10 + 4 * ((p.band && p.band[0]) || 6),    // 10 coups ≈ 50 s
    // mémoire : chaque tour rejoue le chant (une note de plus), puis le joueur le répète
    simon: (p) => {
      let t = 4;
      for (let l = 2; l <= (p.target || 6); l++) t += l * ((p.step || 600) / 1000 + 0.55) + 1.2;
      return t;
    },
    // paires : ~3,4 s par paire (+ aperçu), un peu plus avec les motifs cousins ; 6 paires ≈ 28 s, 18 paires ≈ 79 s
    amphores: (p) => 6 + 3.4 * (p.pairs || 8) + 1.2 * (p.similar || 0) + (p.peek || 0) / 1000,
    // mosaïque : temps d'affichage + ~1,2 s par tesselle ; 3×3 ≈ 19 s, 6×6 ≈ 59 s
    mosaique: (p) => (p.show || 4000) / 1000 + 4 + 1.2 * sq(p.n) + 1.5 * (p.colors || 3),
    // grille logique : ~1,4 s par case de la grille ; 3×3 ≈ 53 s, 4×4 ≈ 149 s
    oracle: (p) => 15 + 1.4 * (p.n || 4) * (p.n || 4) * (p.k || 3) * ((p.k || 3) - 1) / 2
  };
  const targetTime = (id, p) => Math.max(10, Math.round(TARGET[id] && p ? TARGET[id](p) : 45));
  // repères lisibles : arrondis à 5 s (10 s au-delà d'une minute, 15 s au-delà de trois)
  const niceTime = (t) => { const step = t < 60 ? 5 : t < 180 ? 10 : 15; return Math.max(step, Math.round(t / step) * step); };
  const starMarks = (target) => { const a = niceTime(target); return [a, Math.max(a + 5, niceTime(target * 1.8))]; };
  function starsFor(time, target, hints) {
    const [a, b] = starMarks(target);
    const s = time <= a ? 3 : time <= b ? 2 : 1;
    return Math.max(1, s - (hints || 0));
  }
  // petite rangée de 3 étoiles (dessin vectoriel), les manquantes en gris
  const STAR_D = 'M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z';
  const starRow = (n, cls) => '<span class="' + (cls || 'mini-stars') + '" aria-label="' + n + ' / 3">' +
    [0, 1, 2].map((i) => '<svg viewBox="0 0 24 24" class="' + (i < n ? 'on' : '') + '"><path d="' + STAR_D + '"/></svg>').join('') + '</span>';
  const keepBest = (obj, key, n) => { if (n > (obj[key] || 0)) obj[key] = n; };
  // étoiles d'un niveau de palier : C.store.tierStars[jeu][palier][k]
  function tierStarsOf(id, tierId) {
    const S = (C.store.tierStars = C.store.tierStars || {});
    const g = (S[id] = S[id] || {});
    return (g[tierId] = g[tierId] || {});
  }

  // ------------------------------------------------------------------
  // La quête principale :
  // - Chaque monde (île) ajoute des mini-jeux : 3 au premier (Flux, Reines, Tuyaux), puis 5, 7, et les 9 au 4e monde.
  // - Un niveau = une petite série de 2 à 3 mini-jeux enchaînés (2 au tout début).
  // - Les nouveaux jeux d'un monde ouvrent ses premiers niveaux (avec leur tutoriel).
  // - La difficulté monte d'île en île et au fil de chaque île.
  // - Le dernier niveau de chaque île est un boss : 4, puis 5 grilles d'affilée, plus
  //   difficiles, mêlant les capacités, de plus en plus souvent en variante.
  // ------------------------------------------------------------------
  const PER = 6;
  const VARIANTS_ON = false; // variantes mises de côté pour l'instant (le code reste prêt)
  // ordre d'apparition des mini-jeux dans la quête (un jeu absent est ignoré)
  const ORDER = ['flux', 'reines', 'tuyaux', 'astres', 'paves', 'pixels', 'serpent', 'lumieres', 'coffre',
    'demineur', 'simon', 'amphores', 'mosaique', 'oracle', 'rushhour', 'bataille'].filter((id) => C.games.some((g) => g.id === id));
  // jeux disponibles dans les mondes 1, 2, 3… (les derniers venus — Amphores, Mosaïque, Oracle — et ceux
  // qu'ils décalent restent atteignables grâce aux mondes 7 et 8)
  const POOL_SIZE = [3, 5, 7, 9, 11, 13, 15, 16];
  const poolOf = (c) => ORDER.slice(0, POOL_SIZE[Math.min(c, POOL_SIZE.length - 1)]);

  // Les trois sagas du voyage (mêmes bornes que SAGAS dans world.js) : l'Odyssée (îles 0–29),
  // les Douze Travaux d'Héraclès (30–44), les Argonautes (45–65) ; après, tout recommence.
  const SAGA_LIST = [
    { name: "L'Odyssée", first: 0, emblem: 'ship' },
    { name: 'Les Douze Travaux', first: 30, emblem: 'club' },
    { name: 'Les Argonautes', first: 45, emblem: 'fleece' }
  ];
  const SAGA_ISLES = 66; // îles d'un tour complet
  function sagaOf(c) {
    const i = ((c % SAGA_ISLES) + SAGA_ISLES) % SAGA_ISLES;
    let s = 0;
    while (s + 1 < SAGA_LIST.length && i >= SAGA_LIST[s + 1].first) s++;
    const base = c - i, next = s + 1 < SAGA_LIST.length ? SAGA_LIST[s + 1].first : SAGA_ISLES;
    return Object.assign({ index: s, first: base + SAGA_LIST[s].first, last: base + next - 1 }, SAGA_LIST[s]);
  }
  // Difficulté de la quête (niveau de générateur 1–40 : basique 1–12, difficile 12–25, expert 25–40).
  // Courbe douce, linéaire par morceaux et toujours croissante sur tout le voyage :
  //   l'Odyssée      (niveaux 0–179)   : de 1 à 24
  //   les Travaux    (niveaux 180–269) : de 24 à 32
  //   les Argonautes (niveaux 270–395) : de 32 à 40 (puis 40 au-delà)
  // L'épreuve (boss) d'une île a 2 crans de plus ; plafond 40.
  const CURVE = [[0, 1], [30 * PER - 1, 24], [45 * PER - 1, 32], [SAGA_ISLES * PER - 1, 40]];
  function questLevel(L, boss) {
    let i = 0;
    while (i < CURVE.length - 2 && L > CURVE[i + 1][0]) i++;
    const [a, va] = CURVE[i], [b, vb] = CURVE[i + 1];
    const t = Math.max(0, Math.min(1, (L - a) / (b - a)));
    return Math.min(40, Math.round(va + (vb - va) * t) + (boss ? 2 : 0));
  }

  function levelInfo(L) {
    const c = Math.floor(L / PER), k = L % PER;
    const rng = C.makeRng('sentier:' + L);
    const boss = k === PER - 1;
    const pool = poolOf(c);
    const fresh = c > 0 ? pool.filter((id) => !poolOf(c - 1).includes(id)) : pool.slice(); // nouveaux jeux du monde
    const pickVariant = (id, chance) => {
      const g = game(id);
      // une variante seulement pour un jeu présent depuis au moins un monde
      const known = c > 0 && poolOf(c - 1).includes(id);
      return VARIANTS_ON && g.variants && g.variants[1] && known && rng() < chance ? g.variants[1].id : 'classic';
    };
    const skillOf = (id) => (SKILLS.find((s) => s.games.includes(id)) || {}).id;
    let ids;
    if (boss) {
      const count = c < 2 ? 4 : 5;
      // des jeux différents, si possible de capacités différentes
      const shuffled = rng.shuffle(pool.slice());
      ids = [];
      shuffled.forEach((id) => { if (ids.length < count && !ids.some((x) => skillOf(x) === skillOf(id))) ids.push(id); });
      shuffled.forEach((id) => { if (ids.length < count && !ids.includes(id)) ids.push(id); });
      while (ids.length < count) ids.push(rng.pick(pool));
    } else {
      const count = c === 0 && k < 3 ? 2 : 3;
      ids = [];
      // les premiers niveaux d'un monde présentent ses nouveaux jeux
      if (k * 2 < fresh.length) ids.push(fresh[k * 2]);
      if (k * 2 + 1 < fresh.length) ids.push(fresh[k * 2 + 1]);
      const others = rng.shuffle(pool.slice());
      others.forEach((id) => { if (ids.length < count && !ids.includes(id)) ids.push(id); });
    }
    // difficulté de la quête : voir questLevel (courbe douce sur les trois sagas, épreuve +2, plafond 40)
    const level = questLevel(L, boss);
    const vChance = boss ? Math.min(0.7, 0.25 + c * 0.1) : Math.min(0.55, 0.12 + c * 0.08);
    const steps = ids.map((id) => ({ id, variant: pickVariant(id, vChance), level }));
    return { L, c, k, boss, id: steps[0].id, accent: ACCENT[steps[0].id], steps };
  }

  // ------------------------------------------------------------------
  // MÉGA : pour chaque jeu à grande grille, une catégorie à part entière de 150 niveaux, au-dessus
  // de l'Expert. Le niveau 1 dépasse à peine l'Expert maxi ; les tailles se succèdent à parts égales
  // sur les 150 niveaux (jamais plus d'une rangée d'un coup) ; t (0 → 1 du niveau 1 au 150) fait
  // monter en continu les autres réglages, sans jamais redescendre au changement de taille.
  // Tailles bornées pour des cases ≥ 24 px sur un téléphone de 375 px (plateau ≈ 335 px) sans zoom,
  // et une génération < 1,5 s sur téléphone (≈ 0,4 s au pire sur PC).
  //   jeu       Expert maxi        niveau 1          niveau 150        réglages qui montent avec t
  //   tuyaux    9×9                10×10             13×13             — (la taille seule ; canvas sans écart : 25,8 px)
  //   flux      8×8 · 3 ponts      9×9 · 3 ponts     13×13 · 4 ponts   ponts 3→4 (dès t = ½) ; couleurs 0,8·n → 0,65·n : cases par couleur 11,6 → 21 (tuyaux plus longs)
  //   reines    9×9                10×10             11×11             — (12×12 : génération trop lente ; 11 teintes)
  //   paves     10×10 · aire ≤ 12  11×11 · aire ≤ 12 13×13 · aire ≤ 20 aire maxi 12→20 ; chiffres cachés « ? » 0→3 (dès t = 0,6)
  //   pixels    10×10              11×11             12×12             densité 0,58→0,48 (indices plus morcelés) ; au-delà : cases < 24 px
  //   demineur  9×9 · 20 %         10×10 · 20 %      12×12 · 23 %      écueils 20→23 % ; déductions fines exigées 2→5
  // ------------------------------------------------------------------
  const MEGA_SIZE = 150;
  const MEGA_TRACK = {
    tuyaux: { sizes: [10, 11, 12, 13] },
    flux: { sizes: [9, 10, 11, 12, 13], tune: (p, t, n) => {
      p.bridges = t < 0.5 ? 3 : 4;
      p.colors = Math.max(5, Math.min(12, Math.round(n * (0.8 - 0.15 * t))));
    } },
    reines: { sizes: [10, 11] },
    paves: { sizes: [11, 12, 13], tune: (p, t) => {
      p.maxArea = Math.round(12 + 8 * t);
      p.mystery = t < 0.6 ? 0 : Math.min(3, 1 + Math.floor((t - 0.6) * 6));
    } },
    pixels: { sizes: [11, 12], tune: (p, t) => { p.density = +(0.58 - 0.1 * t).toFixed(3); p.maxGroups = 4; } },
    demineur: { sizes: [10, 11, 12], tune: (p, t, n) => {
      p.mines = Math.floor(n * n * (0.2 + 0.03 * t)); // (arrondi bas : la densité ne recule pas d'une taille à l'autre)
      p.subtle = 2 + Math.floor(3.99 * t);
    } }
  };
  Object.keys(MEGA_TRACK).forEach((id) => { if (!C.games.some((g) => g.id === id)) delete MEGA_TRACK[id]; });
  const MEGA_IDS = Object.keys(MEGA_TRACK);
  const megaT = (k) => (Math.max(1, Math.min(MEGA_SIZE, k)) - 1) / (MEGA_SIZE - 1);
  const megaN = (id, k) => { const s = MEGA_TRACK[id].sizes; return s[Math.min(s.length - 1, Math.floor((Math.max(1, k) - 1) * s.length / MEGA_SIZE))]; };
  function megaParams(id, k) {
    const tr = MEGA_TRACK[id], n = megaN(id, k);
    const p = Object.assign(game(id).params(40, 'classic'), { n, mega: true });
    if (tr.tune) tr.tune(p, megaT(k), n);
    return p;
  }

  // ------------------------------------------------------------------
  // Événements spéciaux : une grille « méga » par île, facultative. Le jeu tourne parmi ceux déjà
  // découverts sur l'île ; la grille reprend un niveau de la catégorie Méga, de plus en plus loin
  // d'île en île. Hors quête : pas de progression du sentier ; XP doublée ; une coupe dorée sur la carte.
  // ------------------------------------------------------------------
  const MEGA = MEGA_IDS.map((id) => ({ id }));
  const EV = (C.store.events = C.store.events || {});
  function eventInfo(c) {
    const cands = MEGA.filter((m) => poolOf(c).includes(m.id));
    const m = (cands.length ? cands : MEGA)[c % (cands.length || MEGA.length)];
    const params = megaParams(m.id, Math.min(MEGA_SIZE, 1 + c * 15));
    const n = params.n;
    const seed = 'event:' + c;
    return { L: -1, c, free: true, event: c, id: m.id, n, accent: ACCENT[m.id], seed,
      steps: [{ id: m.id, variant: 'classic', level: 20 + c * 3, params, seed }] };
  }
  const eventOpen = (c) => J.done >= c * PER;
  // les événements des îles atteintes, et celui de l'île suivante (grisé)
  function eventList() {
    const out = [];
    for (let c = 0; c <= Math.floor(J.done / PER) + 1; c++) {
      const e = eventInfo(c);
      out.push({ c, id: e.id, n: e.n, accent: e.accent, open: eventOpen(c), done: !!(EV[c] && EV[c].done) });
    }
    return out;
  }
  function refreshEvents() { if (worldReady && C.world.setEvents) C.world.setEvents(eventList()); }
  function startEvent(c) {
    if (!eventOpen(c)) return;
    const info = eventInfo(c);
    info.xpStart = Object.assign({}, C.store.xp);
    info.tStart = performance.now();
    ['#library', '#levels', '#brain'].forEach((s) => { const el = $(s); if (el) el.hidden = true; });
    playStep(info, 0);
  }

  const J = (C.store.journey = C.store.journey || { done: 0, selected: 0 });
  let selected = J.done; // Ulysse se tient toujours sur le niveau en cours
  let standing = true; // le voyageur est sur une pierre (sinon il se promène)
  let worldReady = false;

  function initWorld() {
    worldReady = !!(C.world && C.world.init($('#world'), {
      done: J.done,
      selected,
      levelInfo,
      iconSvg: (id) => ICON[id],
      accentOf: (id) => ACCENT[id],
      onEvent: (c) => startEvent(c), // totem d'un événement spécial touché sur la carte
      onSelect: (L) => {
        standing = L != null;
        if (standing) { selected = L; J.selected = L; C.save(); }
        renderPlay();
        maybeSagaCard(L); // arrivée dans une nouvelle saga : carte « changement de monde »
      }
    }));
  }

  // Le bouton unique de l'accueil montre le mini-jeu qui attend sur la pierre choisie.
  function renderPlay() {
    const b = $('#go');
    const info = levelInfo(selected);
    // Ulysse en route : le bouton devient ⏩ « Arriver » (il saute directement à la pierre)
    const walking = worldReady && !standing && C.world.walking && C.world.walking();
    b.classList.toggle('ff', !!walking);
    b.hidden = worldReady && !standing && !walking;
    b.style.setProperty('--game', info.accent);
    b.classList.toggle('boss', info.boss);
    b.classList.toggle('replay', selected < J.done);
    // bouton play ; le numéro du niveau en petite étiquette dessous
    b.innerHTML = walking ? '<svg class="ic" viewBox="0 0 24 24"><path class="f" d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/></svg>' : UI('play');
    const lab = $('#go-label');
    // les mini-jeux qui attendent sur cette pierre, en pastilles de couleur, puis le numéro du niveau
    const ids = info.steps.map((s) => s.id).filter((id, i, a) => a.indexOf(id) === i);
    lab.innerHTML = '<span class="gl-games">' + ids.map((id) => '<i style="--c:' + ACCENT[id] + '"><svg viewBox="0 0 24 24">' + (ICON[id] || '') + '</svg></i>').join('') + '</span>' +
      '<span class="gl-num">' + (info.boss ? 'épreuve · ' : 'niveau ') + (selected + 1) + '</span>';
    lab.hidden = b.hidden;
    // flèches : revenir au niveau d'avant, ou avancer jusqu'au niveau en cours
    $('#prev-level').hidden = b.hidden || selected <= 0;
    $('#next-level').hidden = b.hidden || selected >= J.done;
    b.setAttribute('aria-label', 'Jouer');
    b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    // bandeau flottant du niveau : numéro, étoiles gagnées (ou à gagner), mini-jeux ; le bouton Play posé dessus
    let card = $('#lvcard');
    if (!card) {
      card = document.createElement('button');
      card.id = 'lvcard'; card.className = 'lvcard';
      card.setAttribute('aria-label', 'Voyage : tous les niveaux');
      card.addEventListener('click', (e) => {
        // petites flèches ‹ › autour du numéro : niveau précédent / suivant ; ailleurs : le voyage
        const nav = e.target.closest('.lc-nav');
        if (nav) { e.stopPropagation(); stepLevel(+nav.dataset.d); return; }
        openVoyage();
      });
      $('#home').appendChild(card);
    }
    const won = (J.stars && J.stars[selected]) || 0, past = selected < J.done;
    card.hidden = b.hidden || !!walking;
    card.classList.toggle('boss', info.boss);
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    let isle = ''; // nom de l'île (la liste est définie plus bas : pas encore prête au tout premier affichage)
    try { isle = voyageName(Math.floor(selected / PER)); } catch (e) { /* premier rendu */ }
    // petit emblème de la saga devant le nom de l'île (titre de la saga au survol)
    if (isle) { const sg = sagaOf(Math.floor(selected / PER)); isle = '<i class="lc-saga" title="' + sg.name.replace(/"/g, '') + '">' + sagaEmblem(sg.emblem) + '</i>' + isle; }
    card.innerHTML = '<span class="lc-isle">' + isle + '</span><span class="lc-play-slot"></span>' +
      '<span class="lc-title"><i class="lc-nav" data-d="-1"' + (selected <= 0 ? ' hidden' : '') + '>‹</i>' +
      (info.boss ? 'Épreuve ' : 'Niveau ') + (selected + 1) +
      '<i class="lc-nav" data-d="1"' + (selected >= J.done ? ' hidden' : '') + '>›</i></span>' +
      '<span class="lc-stars' + (past ? '' : ' todo') + '">' + starRow(past ? won : 0, 'lc-st') + '</span>' +
      '<span class="lc-games">' + ids.map((id) => '<span class="lc-chip" style="--c:' + ACCENT[id] + '"><i><svg viewBox="0 0 24 24">' + (ICON[id] || '') + '</svg></i>' + game(id).name + '</span>').join('') + '</span>';
  }

  // ----------------------------- Partie -----------------------------
  let session = null;

  function startLevel(L) {
    const info = levelInfo(L);
    info.xpStart = Object.assign({}, C.store.xp); // pour le récapitulatif de fin de niveau
    info.t0 = performance.now();                   // chrono du mode compet (toute la série)
    info.penalty = 0;
    playStep(info, 0);
  }

  // 3 astuces par grille ; le petit chiffre sur l'ampoule les décompte
  const MAX_HINTS = 3;
  function renderHints(left) {
    $('#hint-left').textContent = left;
    $('#btn-hint').classList.toggle('empty', left <= 0);
    const ex = $('#btn-explain'); if (ex) ex.classList.toggle('empty', left <= 0);
  }

  // bulle d'explication d'une astuce. L'astuce d'un jeu est soit un texte, soit
  // { text, where: [éléments du coup joué], why: [éléments qui le justifient], clear() } :
  // « where » reçoit un anneau doré qui pulse, « why » un surlignage doux ; tout s'efface
  // au prochain geste sur la grille (ou après quelques secondes).
  function clearHintFx() {
    const fx = clearHintFx.cur;
    clearHintFx.cur = null;
    if (!fx) return;
    fx.els.forEach(([el, cls]) => el.classList.remove(cls));
    if (fx.clear) try { fx.clear(); } catch (e) { /* jeu déjà fermé */ }
  }
  function hideTip() {
    clearTimeout(showTip.timer);
    $('#hint-tip').hidden = true;
    clearHintFx();
  }
  function showTip(res, explain) {
    const r = typeof res === 'string' ? { text: res } : res;
    const tip = $('#hint-tip');
    if (!showTip.bound) {
      // le prochain geste du joueur referme l'explication et éteint les surlignages
      showTip.bound = true;
      const later = () => setTimeout(hideTip, 0);
      $('#board').addEventListener('pointerdown', later, true);
      ['#btn-undo', '#btn-reset', '#back'].forEach((s) => { const b = $(s); if (b) b.addEventListener('click', later); });
    }
    clearHintFx();
    // indice direct : pas de phrase, l'astuce se lit sur la grille (anneau doré, surlignages) ;
    // bouton « explication » : la même astuce, avec sa phrase dans une bulle
    tip.textContent = explain && r.text ? r.text : '';
    tip.hidden = !(explain && r.text);
    if (!tip.hidden) { tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in'); }
    const els = [];
    const mark = (list, cls) => (list || []).forEach((el) => {
      if (!el || !el.classList) return;
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      els.push([el, cls]);
    });
    mark(r.why, 'hint-why');
    mark(r.where, 'hint-where');
    clearHintFx.cur = { els, clear: r.clear };
    clearTimeout(showTip.timer);
    showTip.timer = setTimeout(hideTip, explain && r.text ? Math.max(9000, Math.min(16000, r.text.length * 80)) : 7000);
  }
  // Surlignages posés par-dessus un plateau dessiné (canvas) ou une zone de plusieurs cases :
  // boxes = [{ x, y, w, h, kind: 'where' | 'why', round, label }] en pixels CSS relatifs à `ref`.
  // Renvoie { where, why, clear } à fusionner dans l'astuce.
  C.hintBoxes = function (ref, boxes) {
    const host = ref.parentNode;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const rezoom = zoomPause(); // mesures sans le zoom du plateau ; le calque le reprend ensuite
    const hr = host.getBoundingClientRect(), rr = ref.getBoundingClientRect();
    const k = ref.offsetWidth ? rr.width / ref.offsetWidth : 1; // plateau éventuellement mis à l'échelle
    const layer = document.createElement('div');
    layer.className = 'hint-layer';
    layer.style.left = (rr.left - hr.left) + 'px';
    layer.style.top = (rr.top - hr.top) + 'px';
    layer.style.width = rr.width + 'px';
    layer.style.height = rr.height + 'px';
    const out = { where: [], why: [], clear: () => layer.remove() };
    boxes.forEach((b) => {
      const d = document.createElement('i');
      d.className = 'hint-box' + (b.round ? ' round' : '') + (b.line ? ' line' : '');
      d.style.left = b.x * k + 'px'; d.style.top = b.y * k + 'px';
      d.style.width = b.w * k + 'px'; d.style.height = b.h * k + 'px';
      if (b.label) d.textContent = b.label;
      layer.appendChild(d);
      (b.kind === 'where' ? out.where : out.why).push(d);
    });
    host.appendChild(layer);
    if (rezoom) rezoom();
    return out;
  };

  // ------------------------------ Zoom du plateau ------------------------------
  // Grandes grilles (Méga, événements, n ≥ 10) : pincer à deux doigts zoome de 1× à 2,5× et déplace
  // (le milieu des deux doigts suit) ; molette ou ctrl+molette sur ordinateur, autour du curseur.
  // Un seul doigt va toujours au jeu : son appui est retenu ~90 ms, le temps de voir si un second
  // doigt suit (alors c'est un geste de zoom : le jeu ne reçoit rien), puis rejoué tel quel.
  // Le zoom passe par les propriétés CSS `scale` et `translate` des enfants du plateau, qui se
  // composent avec les animations (elles pilotent `transform`) ; getBoundingClientRect et
  // elementFromPoint en tiennent compte, les jeux visent donc toujours la bonne case.
  // Retour à 1× : petit bouton loupe (visible une fois zoomé) ou tape brève à deux doigts.
  // Le contenu reste toujours dans le cadre du plateau (pas de bord vide quand il est plus grand que lui).
  const ZMAX = 2.5, HOLD_MS = 90;
  // un appui rejoué après un toucher très bref arrive quand le doigt est déjà levé : la capture du
  // pointeur demandée par le jeu échouerait (exception) et le toucher serait perdu ; on l'ignore sans bruit
  const capture0 = Element.prototype.setPointerCapture;
  if (capture0) Element.prototype.setPointerCapture = function (id) { try { capture0.call(this, id); } catch (e) { /* pointeur déjà relevé */ } };
  const Z = { host: null, on: false, s: 1, tx: 0, ty: 0, pts: new Map(), hold: null, pinch: null, given: null, own: new WeakSet(), timer: 0 };
  const ZOOM_OUT = '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M7.8 10.5h5.4"/></svg>';
  const zKids = () => [...Z.host.children].filter((el) => !el.classList.contains('zoom-reset'));
  function zoomBox() { // boîte du contenu, en pixels du plateau, sans zoom
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    zKids().forEach((el) => {
      if (getComputedStyle(el).position === 'absolute') return;
      x0 = Math.min(x0, el.offsetLeft); y0 = Math.min(y0, el.offsetTop);
      x1 = Math.max(x1, el.offsetLeft + el.offsetWidth); y1 = Math.max(y1, el.offsetTop + el.offsetHeight);
    });
    return x0 < x1 ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: Z.host.clientWidth, y1: Z.host.clientHeight };
  }
  function zoomClamp() {
    const b = zoomBox(), s = Z.s;
    // contenu plus petit que le cadre : il reste dedans ; plus grand : il le couvre sans laisser de vide
    const lim = (t, a, c, V) => Math.max(Math.min(-s * a, V - s * c), Math.min(Math.max(-s * a, V - s * c), t));
    Z.tx = lim(Z.tx, b.x0, b.x1, Z.host.clientWidth);
    Z.ty = lim(Z.ty, b.y0, b.y1, Z.host.clientHeight);
  }
  function zoomApply() {
    if (!Z.host) return;
    const z = Z.s > 1.001;
    zKids().forEach((el) => {
      if (!z) { el.style.removeProperty('scale'); el.style.removeProperty('translate'); el.style.removeProperty('transform-origin'); return; }
      el.style.transformOrigin = (-el.offsetLeft) + 'px ' + (-el.offsetTop) + 'px'; // origine commune : le coin du plateau
      el.style.scale = String(Z.s);
      el.style.translate = Z.tx + 'px ' + Z.ty + 'px';
    });
    Z.host.classList.toggle('zoomed', z);
    C.boardZoom = z ? Z.s : 1;
    let btn = Z.host.querySelector(':scope > .zoom-reset');
    if (z && !btn) {
      btn = document.createElement('button');
      btn.className = 'zoom-reset';
      btn.setAttribute('aria-label', 'Zoom 1×');
      btn.innerHTML = ZOOM_OUT;
      btn.addEventListener('click', (e) => { e.stopPropagation(); zoomTo(1, 0, 0, true); C.sfx.tap(); });
      Z.host.appendChild(btn);
    }
    if (btn) btn.hidden = !z;
  }
  // zoom vers s en gardant fixe le point (px, py) du cadre
  function zoomTo(s, px, py, ease) {
    s = Math.max(1, Math.min(ZMAX, s));
    Z.tx = px - s * (px - Z.tx) / Z.s; Z.ty = py - s * (py - Z.ty) / Z.s; Z.s = s;
    if (s <= 1.001) { Z.s = 1; Z.tx = 0; Z.ty = 0; }
    zoomClamp();
    if (ease) { Z.host.classList.add('zoom-ease'); clearTimeout(zoomTo.ease); zoomTo.ease = setTimeout(() => Z.host && Z.host.classList.remove('zoom-ease'), 220); }
    zoomApply();
    zoomSettle();
  }
  // geste fini : les plateaux dessinés (canvas) se redessinent nets à la nouvelle échelle
  function zoomSettle() {
    clearTimeout(Z.timer);
    Z.timer = setTimeout(() => { if (session && session.inst && session.inst.resize) { session.inst.resize(); zoomApply(); } }, 180);
  }
  // mesures d'un calque d'astuce : zoom retiré le temps de mesurer, rendu par la fonction renvoyée
  function zoomPause() {
    if (!Z.host || Z.s <= 1.001) return null;
    zKids().forEach((el) => { el.style.removeProperty('scale'); el.style.removeProperty('translate'); });
    return zoomApply;
  }
  function zoomAttach(host, on) {
    Z.host = host; Z.on = !!on; Z.s = 1; Z.tx = 0; Z.ty = 0;
    Z.pts.clear(); Z.pinch = null; Z.given = null;
    if (Z.hold) { clearTimeout(Z.hold.timer); Z.hold = null; }
    host.classList.toggle('zoomable', Z.on);
    zoomApply();
    if (host.zoomBound) return;
    host.zoomBound = true;
    const rel = (e) => { const r = host.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    // rejoue un évènement du doigt retenu, à l'identique, sur sa cible d'origine
    const replay = (e, type) => {
      const ev = new PointerEvent(type || e.type, { bubbles: true, cancelable: true, composed: true,
        pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary, clientX: e.clientX, clientY: e.clientY,
        screenX: e.screenX, screenY: e.screenY, button: e.button, buttons: e.buttons, pressure: e.pressure, width: e.width, height: e.height });
      Z.own.add(ev);
      const t = e.target && e.target.isConnected && host.contains(e.target) ? e.target : host;
      t.dispatchEvent(ev);
    };
    const flush = () => {
      const h = Z.hold;
      if (!h) return;
      Z.hold = null;
      clearTimeout(h.timer);
      Z.given = h.down; // ce doigt appartient désormais au jeu
      replay(h.down);
      h.queue.forEach((e) => replay(e));
    };
    const pinchStart = () => {
      const [a, b] = [...Z.pts.values()];
      Z.pinch = { s0: Z.s, tx0: Z.tx, ty0: Z.ty, d0: Math.max(10, Math.hypot(b[0] - a[0], b[1] - a[1])),
        m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], t0: performance.now(), moved: 0 };
    };
    const pinchMove = () => {
      const p = Z.pinch, v = [...Z.pts.values()];
      if (!p || v.length < 2) return;
      const [a, b] = v, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      p.moved = Math.max(p.moved, Math.abs(d - p.d0), Math.hypot(m[0] - p.m0[0], m[1] - p.m0[1]));
      const s = Math.max(1, Math.min(ZMAX, p.s0 * d / p.d0));
      // le point du contenu qui était sous le milieu des doigts y reste
      Z.s = s;
      Z.tx = m[0] - s * (p.m0[0] - p.tx0) / p.s0;
      Z.ty = m[1] - s * (p.m0[1] - p.ty0) / p.s0;
      if (s <= 1.001) { Z.s = 1; Z.tx = 0; Z.ty = 0; }
      zoomClamp();
      zoomApply();
    };
    host.addEventListener('pointerdown', (e) => {
      if (Z.own.has(e) || !Z.on || e.pointerType === 'mouse' || e.target.closest('.zoom-reset')) return;
      Z.pts.set(e.pointerId, rel(e));
      if (Z.pts.size === 1) {
        // premier doigt : retenu un instant (un second doigt en fera un geste de zoom)
        e.stopImmediatePropagation();
        Z.given = null;
        Z.hold = { down: e, queue: [], x: e.clientX, y: e.clientY, timer: setTimeout(flush, HOLD_MS) };
        return;
      }
      e.stopImmediatePropagation();
      if (Z.pts.size === 2 && !Z.pinch) {
        if (Z.hold) { clearTimeout(Z.hold.timer); Z.hold = null; } // le jeu ne saura rien du premier doigt
        else if (Z.given && Z.pts.has(Z.given.pointerId)) replay(Z.given, 'pointercancel'); // déjà parti au jeu : annulé
        Z.given = null;
        pinchStart();
      }
    }, true);
    host.addEventListener('pointermove', (e) => {
      if (Z.own.has(e) || !Z.pts.has(e.pointerId)) return;
      Z.pts.set(e.pointerId, rel(e));
      if (Z.hold && Z.hold.down.pointerId === e.pointerId) {
        e.stopImmediatePropagation();
        Z.hold.queue.push(e);
        // un glissé franc n'attend pas : le jeu reçoit tout de suite le doigt
        if (Math.hypot(e.clientX - Z.hold.x, e.clientY - Z.hold.y) > 10) flush();
        return;
      }
      if (Z.pinch) { e.stopImmediatePropagation(); pinchMove(); }
    }, true);
    const up = (e) => {
      if (Z.own.has(e) || !Z.pts.has(e.pointerId)) return;
      if (Z.hold && Z.hold.down.pointerId === e.pointerId) { // toucher bref : appui et relâché rejoués ensemble
        e.stopImmediatePropagation();
        Z.hold.queue.push(e);
        flush();
        Z.pts.delete(e.pointerId);
        return;
      }
      Z.pts.delete(e.pointerId);
      if (!Z.pinch) return;
      e.stopImmediatePropagation();
      if (Z.pts.size === 0) {
        const p = Z.pinch;
        Z.pinch = null;
        // tape brève à deux doigts, sans bouger : retour à 1×
        if (performance.now() - p.t0 < 280 && p.moved < 12 && Z.s > 1) zoomTo(1, 0, 0, true);
        else zoomSettle();
      }
    };
    host.addEventListener('pointerup', up, true);
    host.addEventListener('pointercancel', up, true);
    // doigt levé hors du plateau : on l'oublie aussi (sinon le prochain toucher passerait pour un second doigt)
    const lost = (e) => {
      if (Z.own.has(e) || !Z.pts.has(e.pointerId)) return;
      if (Z.hold && Z.hold.down.pointerId === e.pointerId) flush();
      Z.pts.delete(e.pointerId);
      if (!Z.pts.size && Z.pinch) { Z.pinch = null; zoomSettle(); }
    };
    window.addEventListener('pointerup', lost);
    window.addEventListener('pointercancel', lost);
    host.addEventListener('wheel', (e) => {
      if (!Z.on) return;
      e.preventDefault();
      const [x, y] = rel(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // (molette en lignes)
      zoomTo(Z.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)), x, y, !e.ctrlKey);
    }, { passive: false });
    window.addEventListener('resize', () => { if (Z.host && Z.s > 1) zoomTo(1, 0, 0); });
  }

  let playRun = null;
  // « Arrêter » : si de l'XP a été gagnée depuis le début de la partie, petit bilan avant de rentrer
  function stopPlay() {
    const before = (playRun && playRun.xp) || {};
    const gained = SKILLS.some((sk) => (C.store.xp[sk.id] || 0) > (before[sk.id] || 0));
    if (!gained || !$('#level-done').hidden) { goHome(); return; }
    clearTimeout(finishLevel.timer);
    if (session) { session.stop(); session = null; }
    showLevelDone({ summary: true, xpStart: before, steps: [{ id: playRun.id }] });
  }
  function playStep(info, stepIndex) {
    if (session) session.stop();
    const step = info.steps[stepIndex];
    const g = game(step.id);
    const variant = step.variant;

    if (worldReady) C.world.stop();
    if (screens.play.hidden) playRun = { xp: Object.assign({}, C.store.xp), id: step.id }; // début de partie : bilan d'XP au bouton « Arrêter »
    show('play');
    $('#play').style.setProperty('--game', ACCENT[g.id]);
    $('#play').classList.remove('done');
    $('#play').classList.toggle('mega', info.event != null || !!info.mega); // grande grille : cases plus serrées
    zoomAttach($('#board'), false); // (le zoom revient à 1× ; réactivé une fois la grille posée)
    $('#play-icon').innerHTML = icon(g.id);
    $('#play-level').textContent = info.mega ? 'méga · ' + info.mega.k : info.event != null ? 'méga' : info.daily ? 'défi du jour' : info.tier ? info.tier.name.toLowerCase() + ' · ' + info.tier.k : info.free ? (info.focus ? 'concentration' : 'jeu libre') : (info.boss ? 'épreuve · niveau ' : 'niveau ') + (info.L + 1);
    // passage d'un mini-jeu au suivant dans une série : la grille arrive par la droite
    $('#board').classList.toggle('next-step', stepIndex > 0 || !!info.chain || !!info.focus);
    $('#board').classList.remove('leaving');
    $('#play-name').textContent =g.name + (variant !== 'classic' ? ' · ' + variantsOf(g).find((v) => v.id === variant).name : '');
    $('#tools').hidden = true;
    // chrono des étoiles : temps de jeu, temps cible et astuces, cumulés sur toute la série
    if (stepIndex === 0 || !info.run) info.run = { time: 0, target: 0, hints: 0 };
    hideTip();
    $('#win').hidden = true;
    $('#level-done').hidden = true;
    // boss : trois petits points indiquent l'épreuve en cours
    const steps = $('#steps');
    steps.hidden = info.steps.length < 2;
    steps.innerHTML = info.steps.map((s, i) => '<i class="' + (i < stepIndex ? 'past' : i === stepIndex ? 'now' : '') + '"></i>').join('');
    const host = $('#board');
    host.classList.remove('solved');
    host.innerHTML = '<div class="loading"><span></span></div>';

    const rulesKey = dataKey(g, variant) + ':rules';
    if (!C.store.games[rulesKey]) {
      // première fois : tutoriel illustré (seulement la page de variante si le jeu est déjà connu)
      const knowsBase = variant !== 'classic' && !!C.store.games[g.id + ':rules'];
      C.store.games[rulesKey] = 1;
      C.save();
      openTutorial(g, variant, knowsBase);
    }

    setTimeout(() => {
      let seed = step.seed || (info.seed || 'odysseum:' + info.L) + ':' + stepIndex, genLevel = step.level, mark = null;
      // quête et liste des mini-jeux partagent la même progression : une grille de la quête
      // est le prochain niveau du palier en cours de ce jeu (même grille que dans la liste), et la réussir l'y coche
      // (la difficulté suit la quête — step.level, qui monte doucement — et non le palier le plus avancé :
      // sinon l'ouverture d'un palier faisait sauter brutalement la difficulté ; on coche le palier correspondant)
      if (!info.free && variant === 'classic') {
        const t = TIERS.filter((x) => genLevel >= x.from).pop() || TIERS[0];
        const ti = TIERS.indexOf(t), d = tierDone(g.id, t.id);
        if (tierOpen(g.id, ti) && d < TIER_SIZE) mark = { tier: t, k: d + 1 };
      }
      const prm = step.params || g.params(genLevel, variant); // (événement : paramètres « méga »)
      const puzzle = g.generate(C.makeRng(seed), prm);
      const target = targetTime(g.id, prm);
      host.innerHTML = '';
      let elapsed = 0, won = false, tool = 'fill', hints = 0, auto = false;
      const tick = setInterval(() => {
        if (!document.hidden && !won && $('#rules').hidden) elapsed++;
      }, 1000);

      const api = {
        tool: () => tool,
        onChange() {},
        onWin() {
          if (won) return;
          won = true;
          C.sfx.win();
          // succès : une lueur douce monte du fond, aux couleurs du jeu
          const pl = $('#play'); pl.classList.remove('glow'); void pl.offsetWidth; pl.classList.add('glow');
          const d = C.gameData(dataKey(g, variant));
          d.solved++;
          d.totalTime += elapsed;
          gainXp(g, step.level, info.event != null ? 2 : info.daily || info.boss || info.mega ? 1.5 : 1, elapsed, hints, auto);
          info.run.time += elapsed; info.run.target += target; info.run.hints += hints;
          if (mark) {
            tierMark(g.id, mark.tier.id, mark.k);
            // la grille de la quête est aussi un niveau de palier : ses étoiles y comptent
            if (!auto) keepBest(tierStarsOf(g.id, mark.tier.id), mark.k, starsFor(elapsed, target, hints));
          }
          C.save();
          host.classList.add('solved');
          if (stepIndex + 1 < info.steps.length) {
            // boss : la grille suivante arrive après une respiration
            // enchaînement rapide dans une série : la grille finie glisse et s'efface, la suivante arrive
            setTimeout(() => host.classList.add('leaving'), 1000);
            setTimeout(() => playStep(info, stepIndex + 1), 1300);
          } else {
            finishLevel(info);
          }
        }
      };
      const inst = g.create(host, puzzle, api);
      // grandes grilles : pincer pour zoomer (voir « Zoom du plateau »)
      zoomAttach(host, info.event != null || !!info.mega || (prm.n || 0) >= 10);
      renderHints(MAX_HINTS);
      // animations : apparition en cascade (en diagonale) et petit rebond au toucher
      const grid = host.querySelector('.cell-grid, .nono');
      if (grid) {
        const n = +getComputedStyle(grid).getPropertyValue('--n') || 1;
        grid.querySelectorAll('.cell, .nono-cell, .bulb').forEach((el, k) => el.style.setProperty('--i', Math.floor(k / n) + (k % n)));
        // une fois la cascade jouée, la grille est « prête » : effacer une case ne relance plus l'apparition
        setTimeout(() => grid.classList.add('ready'), 2 * n * 18 + 800);
      }
      host.addEventListener('pointerdown', (e) => {
        const t = e.target.closest('.cell, .bulb, .nono-cell');
        if (!t) return;
        // les pièces qui changent de face (Astres, Lumières) se retournent ; les autres rebondissent
        const fx = t.closest('.astres, .lumieres') ? 'flip' : 'pop';
        t.classList.remove('pop', 'flip'); void t.offsetWidth; t.classList.add(fx);
      });

      const tools = $('#tools');
      if (inst.tools) {
        tools.innerHTML = '';
        inst.tools.forEach((t, i) => {
          const b = document.createElement('button');
          b.className = 'ghost-icon tool' + (i === 0 ? ' on' : '');
          b.setAttribute('aria-label', t.label);
          b.innerHTML = TOOL_ICON[t.id] || t.label;
          b.addEventListener('click', () => {
            tool = t.id;
            tools.querySelectorAll('.tool').forEach((x) => x.classList.toggle('on', x === b));
          });
          tools.appendChild(b);
        });
        tool = inst.tools[0].id;
        tools.hidden = false;
      }

      session = {
        g, variant, inst, info, target,
        // (tests) lire ou régler le temps écoulé sur la grille en cours
        elapsed(v) { if (v != null) elapsed = v; return elapsed; },
        hint(explain) {
          if (won || hints >= MAX_HINTS) { C.sfx.error && C.sfx.error(); return; }
          const res = inst.hint();
          if (res) {
            hints++;
            renderHints(MAX_HINTS - hints);
            if (typeof res === 'string' || (res && typeof res === 'object')) showTip(res, explain); // l'astuce montre où (et, sur demande, explique pourquoi)
            if (info.t0) info.penalty += 10; // compet : chaque indice coûte 10 secondes
          }
        },
        // outil de test temporaire : résout la grille d'un coup
        solve() {
          if (won) return;
          auto = true;
          info.assisted = true; // pas de record ni de partage pour une série résolue automatiquement
          if (inst.solve) { inst.solve(); return; }
          for (let i = 0; i < 400 && !won; i++) if (!inst.hint()) break;
        },
        stop() { clearInterval(tick); inst.destroy(); }
      };
    }, 60);
  }

  let pendingProgress = false, pendingWalk = false;
  // Niveau réussi : la grille s'illumine, puis le niveau suivant s'enchaîne tout seul.
  // La carte rattrapera la progression au retour (Ulysse avancera jusqu'à la bonne pierre).
  function finishLevel(info) {
    // étoiles de la série (0 si résolue d'office : rien n'est enregistré)
    const run = info.run || { time: 0, target: 0, hints: 0 };
    info.stars = info.assisted ? 0 : starsFor(run.time, run.target, run.hints);
    if (info.daily) { // défi du jour : jour coché, série de jours, récapitulatif puis retour à la carte
      if (!info.assisted) recordDaily(info.daily, info.stars, run.time);
      C.save();
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) showLevelDone(info); }, 1400);
      return;
    }
    if (info.event != null) { // événement spécial : la coupe est gagnée, récapitulatif puis retour à la carte
      const t = Math.round((performance.now() - (info.tStart || performance.now())) / 1000);
      const prev = EV[info.event] || {};
      EV[info.event] = { done: true, time: info.assisted ? prev.time || null : prev.time ? Math.min(prev.time, t) : t, stars: prev.stars || 0 };
      keepBest(EV[info.event], 'stars', info.stars);
      C.save();
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) showLevelDone(info); }, 1400);
      return;
    }
    if (info.mega) { // niveau Méga : coché, étoiles et meilleur temps gardés, puis le suivant s'enchaîne
      const s = info.steps[0], k = info.mega.k, rec = megaRec(s.id);
      if (k > rec.done) rec.done = k;
      if (!info.assisted) {
        keepBest(rec.stars, k, info.stars);
        if (!rec.best[k] || run.time < rec.best[k]) rec.best[k] = run.time;
      }
      C.save();
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      popStars(info.stars);
      if (k >= MEGA_SIZE) { // le 150e : récapitulatif, puis retour
        finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) showLevelDone(info); }, 1400);
        return;
      }
      setTimeout(() => { if (!screens.play.hidden) $('#board').classList.add('leaving'); }, 1400);
      finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) startMega(s.id, k + 1, true); }, 1700);
      return;
    }
    if (info.tier) { // niveau d'un palier : on le coche et on enchaîne sur le suivant
      const s = info.steps[0];
      tierMark(s.id, info.tier.id, info.tier.k);
      if (!info.assisted) keepBest(tierStarsOf(s.id, info.tier.id), info.tier.k, info.stars);
      C.save();
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      popStars(info.stars); // les étoiles de la grille éclosent un instant au-dessus du plateau
      // enchaînement rapide, comme dans la quête : la grille finie glisse, la suivante arrive
      setTimeout(() => { if (!screens.play.hidden) $('#board').classList.add('leaving'); }, 1400);
      finishLevel.timer = setTimeout(() => {
        if (!screens.play.hidden) startTier(s.id, info.tier.id, Math.min(TIER_SIZE, info.tier.k + 1), true);
      }, 1700);
      return;
    }
    if (info.free) { // jeu libre : on enchaîne sur le niveau suivant du même jeu
      const s = info.steps[0];
      C.gameData(dataKey(game(s.id), s.variant)).level++;
      C.save();
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      setTimeout(() => { if (!screens.play.hidden) $('#board').classList.add('leaving'); }, 900);
      finishLevel.timer = setTimeout(() => {
        if (screens.play.hidden) return;
        if (info.focus) startFocus(SKILLS.find((sk) => sk.id === info.focus)); // focus : un autre jeu de la même capacité
        else startFree(game(s.id), s.variant);
      }, 1200);
      return;
    }
    if (!info.assisted) keepBest((J.stars = J.stars || {}), info.L, info.stars);
    if (info.L === J.done) {
      J.done++;
      pendingProgress = true;
    } else {
      pendingWalk = true; // niveau rejoué : au retour, Ulysse marche jusqu'à la pierre suivante
    }
    const next = info.L + 1;
    selected = next;
    J.selected = next;
    C.save();
    $('#play').classList.add('done');
    clearTimeout(finishLevel.timer);
    if (info.t0 && !info.stopped) { info.time = levelTime(info); info.stopped = true; } // le chrono s'arrête à la dernière grille
    // série terminée : récapitulatif de l'XP gagnée par capacité, puis retour à la carte
    finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) showLevelDone(info); }, 1400);
  }

  // Récapitulatif animé : chaque capacité travaillée, son gain d'XP, sa barre qui se remplit.
  // ------------------------- Mode chill / compet -------------------------
  const isCompet = () => false; // jeu uniquement en mode chill pour l'instant (compet gardé de côté)
  const levelTime = (info) => (performance.now() - info.t0) / 1000 + (info.penalty || 0);
  function renderPlayMode() {
    document.querySelectorAll('.play-mode button').forEach((b) => b.classList.toggle('on', b.dataset.playMode === (isCompet() ? 'compet' : 'chill')));
  }
  // le chrono s'affiche en compet, pendant une série de la quête
  setInterval(() => {
    const t = $('#play-timer');
    const info = session && session.info;
    const on = isCompet() && info && info.t0 && !info.free && !screens.play.hidden;
    t.hidden = !on;
    if (on && !info.stopped) t.textContent = C.formatTime(levelTime(info));
  }, 250);

  function shareTime(info) {
    const txt = 'Odysseus · niveau ' + (info.L + 1) + ' bouclé en ' + C.formatTime(info.time) + '. Tu fais mieux ?';
    const url = 'https://vroux18.github.io/Odysseum/';
    if (navigator.share) {
      navigator.share({ title: 'Odysseus', text: txt, url }).catch(() => { /* partage annulé */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(txt + ' ' + url).then(() => showXp('message copié, colle-le à tes amis', '#5f9fd8')).catch(() => {});
    }
  }

  function showLevelDone(info) {
    // récapitulatif passé (réglage) : les étoiles éclosent un instant, puis retour direct sur la carte
    if (C.store.settings.skipDone && !info.summary) {
      if (info.stars && !info.assisted) popStars(info.stars);
      setTimeout(goHome, 1100);
      return;
    }
    const box = $('#ld-skills');
    // compet : temps de la série, record du niveau, partage
    const ldTime = $('#ld-time');
    const compet = isCompet() && info.t0 && !info.assisted;
    ldTime.hidden = !compet;
    $('#ld-share').hidden = !compet;
    if (compet) {
      if (!info.stopped) { info.time = levelTime(info); info.stopped = true; }
      J.best = J.best || {};
      const prev = J.best[info.L];
      const record = prev == null || info.time < prev;
      if (record) J.best[info.L] = info.time;
      C.save();
      ldTime.innerHTML = '<b>' + C.formatTime(info.time) + '</b>' +
        (record ? '<small class="record">' + (prev == null ? 'premier temps' : 'nouveau record') + '</small>'
          : '<small>record ' + C.formatTime(prev) + '</small>') +
        (info.penalty ? '<small>dont ' + info.penalty + ' s de pénalité (indices)</small>' : '');
      $('#ld-share').onclick = () => shareTime(info);
    }
    const before = info.xpStart || {};
    const rows = SKILLS.filter((sk) => (C.store.xp[sk.id] || 0) > (before[sk.id] || 0));
    $('#ld-title').textContent = info.summary ? 'Bilan de la partie' : info.daily ? game(info.steps[0].id).name : info.event != null || info.mega ? 'Méga ' + game(info.steps[0].id).name : info.boss ? 'Épreuve réussie' : 'Niveau ' + (info.L + 1);
    // trois grosses étoiles sous le titre : elles éclosent une à une (les manquantes restent grises)
    const ldStars = $('#ld-stars');
    const hasStars = info.stars != null && !info.assisted; // résolu d'office (outil de test) : ni étoiles ni chrono
    ldStars.hidden = !hasStars;
    if (hasStars) {
      ldStars.innerHTML = starRow(info.stars, 'big-stars');
      ldStars.querySelectorAll('svg').forEach((s, i) => {
        s.style.setProperty('--d', (0.25 + i * 0.32) + 's');
        if (i < info.stars) setTimeout(() => { if (!$('#level-done').hidden) C.sfx.star && C.sfx.star(i); }, 250 + i * 320 + 180);
      });
    }
    // chrono : le temps mis, sur une piste où sont posés les seuils des étoiles (★★★ puis ★★)
    let clock = $('#ld-clock');
    if (!clock) { clock = document.createElement('div'); clock.id = 'ld-clock'; clock.className = 'ld-clock'; ldStars.after(clock); }
    const run = info.run || {};
    clock.hidden = !(run.time > 0 && run.target > 0) || !!info.assisted;
    if (!clock.hidden) {
      const [m3, m2] = starMarks(run.target); // les mêmes repères que ceux qui donnent les étoiles
      const span = Math.max(m2 * 1.3, run.time * 1.05), pos = (v) => Math.min(100, (v / span) * 100).toFixed(1) + '%';
      const tick = (v, n) => '<i class="ck-tick" style="left:' + pos(v) + '">' + starRow(n, 'ck-stars') + '<em>' + C.formatTime(Math.round(v)) + '</em></i>';
      clock.innerHTML = '<div class="ck-time"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5M12 2.5V5"/></svg><b>' + C.formatTime(Math.round(run.time)) + '</b></div>' +
        '<div class="ck-track"><span class="ck-fill" style="--w:' + pos(run.time) + '"></span>' + tick(m3, 3) + tick(m2, 2) + '</div>';
    }
    // moins de 3 étoiles : proposer de rejouer à côté de « suivant » ; case « ne plus afficher »
    showLevelDone.last = info;
    $('#ld-replay').hidden = !hasStars || info.stars >= 3 || !!info.summary;
    $('#ld-skip').checked = !!C.store.settings.skipDone;
    $('#ld-skip').parentElement.hidden = !!info.summary;
    const delay0 = hasStars ? 1.25 : 0.35; // les lignes d'XP arrivent après les étoiles
    box.innerHTML = rows.map((sk, i) => {
      const was = levelFrom(before[sk.id] || 0, 40), now = skillStats(sk);
      const gain = (C.store.xp[sk.id] || 0) - (before[sk.id] || 0);
      const startW = now.level > was.level ? 0 : Math.round(was.frac * 100);
      // une ligne de registre : emblème de la capacité, nom et niveau, jauge à crans, gain en pièce d'or
      return '<div class="ld-row ld2" style="--game:' + ACCENT[sk.games[0]] + ';--d:' + (delay0 + i * 0.45) + 's">' +
        '<span class="ld-medal"><svg viewBox="0 0 24 24">' + (SKILL_ICON[sk.id] || '') + '</svg></span>' +
        '<div class="ld-mid"><div class="ld-head"><span>' + sk.name + '</span>' +
        (now.level > was.level ? '<small class="ld-up">niveau ' + now.level + '</small>' : '<small>niv. ' + now.level + '</small>') + '</div>' +
        '<div class="skill-bar"><i style="width:' + startW + '%" data-to="' + Math.round(now.frac * 100) + '"></i></div></div>' +
        '<b class="ld-gain" data-gain="' + gain + '">+0</b></div>';
    }).join('');
    const ov = $('#level-done');
    ov.hidden = false;
    C.sfx.place();
    playBurst();
    // les barres se remplissent et les compteurs montent, une capacité après l'autre
    box.querySelectorAll('.ld-row').forEach((row, i) => {
      setTimeout(() => {
        const bar = row.querySelector('.skill-bar i');
        bar.style.width = bar.dataset.to + '%';
        const el = row.querySelector('.ld-gain'), total = +el.dataset.gain, t0 = performance.now();
        const count = (now) => {
          const k = Math.min(1, (now - t0) / 900);
          el.innerHTML = '+' + Math.round(total * (1 - Math.pow(1 - k, 3))) + '<small>xp</small>';
          if (k < 1) requestAnimationFrame(count);
        };
        requestAnimationFrame(count);
        if (row.querySelector('.ld-up')) setTimeout(() => { row.classList.add('leveled'); C.sfx.win(); }, 900);
      }, delay0 * 1000 + i * 450);
    });
  }

  // Éclat doré derrière le laurier (lottie-web, animation maison assets/ui/lottie) ; rien si Lottie absent ou animations réduites.
  let burst = null;
  function playBurst() {
    const host = $('#ld-burst');
    if (!host || !window.lottie) return;
    if (document.documentElement.classList.contains('a11y-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try {
      if (!burst) burst = window.lottie.loadAnimation({ container: host, renderer: 'svg', loop: false, autoplay: false, path: 'assets/ui/lottie/success-burst.json' });
      if (burst.isLoaded) burst.goToAndPlay(0, true);
      else burst.addEventListener('DOMLoaded', () => burst.goToAndPlay(0, true));
    } catch (e) { /* décor seulement */ }
  }

  // Tutoriel illustré : une page = un petit dessin + une phrase ; la flèche avance.
  let tuto = null;
  function openTutorial(g, variant, knowsBase) {
    let pages = C.tutorial ? C.tutorial(g.id, variant, knowsBase) : [];
    if (!pages.length) pages = rulesOf(g, variant).map((r) => ({ art: '', text: r }));
    tuto = { pages, i: 0 };
    $('#rules').style.setProperty('--game', ACCENT[g.id]);
    $('#rules-icon').innerHTML = icon(g.id);
    renderTuto();
    $('#rules').hidden = false;
  }
  function renderTuto() {
    const p = tuto.pages[tuto.i];
    $('#tuto-art').innerHTML = p.art;
    $('#tuto-text').innerHTML = p.text;
    $('#tuto-dots').innerHTML = tuto.pages.length > 1 ? tuto.pages.map((_, i) => '<i class="' + (i === tuto.i ? 'on' : '') + '"></i>').join('') : '';
    $('#rules-close').setAttribute('aria-label', tuto.i < tuto.pages.length - 1 ? 'Suivant' : 'Commencer');
  }
  function nextTuto() {
    if (tuto && tuto.i < tuto.pages.length - 1) { tuto.i++; renderTuto(); C.sfx.tap(); }
    else $('#rules').hidden = true;
  }

  // ------------------------------ Expérience ------------------------------
  // L'XP dépend de la façon de jouer : rapidité, indices utilisés. Pas de notification : le récapitulatif de fin de niveau la montre.
  // mult : 1 niveau ordinaire, 1,5 boss, 2 événement spécial
  function gainXp(g, level, mult, elapsed, hints) {
    const sk = SKILLS.find((s) => s.games.includes(g.id));
    if (!sk) return;
    const base = 10 + Math.floor(level / 2);
    const par = 25 + level * 5;                                   // temps « attendu » en secondes
    const speed = Math.max(0.6, Math.min(1.4, 1.4 - 0.6 * (elapsed / par)));
    const help = Math.max(0.25, 1 - 0.25 * hints);
    const gain = Math.max(1, Math.round(base * speed * help * (+mult || 1)));
    C.store.xp[sk.id] = (C.store.xp[sk.id] || 0) + gain;
    pushRankSoon(); // classement en ligne : envoi groupé ~3 s après le dernier gain
  }
  function showXp(html, accent) {
    const t = $('#xp-toast');
    t.innerHTML = html;
    t.style.setProperty('--game', accent);
    t.hidden = true; void t.offsetWidth; t.hidden = false;
    clearTimeout(showXp.timer);
    showXp.timer = setTimeout(() => { t.hidden = true; }, 2700);
  }

  const screens = { home: $('#home'), play: $('#play') };
  function show(name) {
    Object.entries(screens).forEach(([k, el]) => { el.hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  // Retour au sentier : si un niveau vient d'être franchi, le voyageur avance.
  function goHome() {
    clearTimeout(finishLevel.timer);
    if (session) session.stop();
    session = null;
    show('home');
    if (worldReady) {
      C.world.endConcentrate();
      C.world.start();
      refreshStars(true); // étoiles gagnées : elles montent de la pierre
      if (pendingProgress) {
        C.world.progress(J.done, true);
        standing = false; // le bouton réapparaît à l'arrivée sur la nouvelle pierre
      } else if (pendingWalk && C.world.select) {
        C.world.select(selected); // niveau rejoué : Ulysse rejoint la pierre suivante
        if (C.world.walking && C.world.walking()) standing = false;
      }
      renderPlay(); // en route : bouton ⏩ pour arriver tout de suite
    } else if (pendingProgress) {
      selected = J.done;
    }
    pendingProgress = false;
    pendingWalk = false;
    const pop = $('#pop-stars'); if (pop) pop.hidden = true;
    renderDaily();
    $('#play').classList.remove('mega');
    zoomAttach($('#board'), false);
    refreshEvents(); // une île atteinte ouvre son totem ; un événement réussi devient une coupe
    renderPlay();
    renderBadge();
  }

  // étoiles des niveaux de la quête sur la carte (animate : les nouvelles montent de leur pierre)
  function refreshStars(animate) {
    if (worldReady && C.world.setStars) C.world.setStars(J.stars || {}, !!animate);
  }
  // fin d'une grille de palier (enchaînée, sans récapitulatif) : les étoiles éclosent sur le plateau
  function popStars(n) {
    if (!n) return; // résolu d'office : pas d'étoiles à montrer
    let el = $('#pop-stars');
    if (!el) { el = document.createElement('div'); el.id = 'pop-stars'; el.className = 'pop-stars'; document.body.appendChild(el); } // (hors de #play, qui s'estompe à la fin)
    el.innerHTML = starRow(n, 'big-stars');
    el.querySelectorAll('svg').forEach((s, i) => {
      s.style.setProperty('--d', (0.1 + i * 0.2) + 's');
      if (i < n) setTimeout(() => C.sfx.star && C.sfx.star(i), 100 + i * 200 + 150);
    });
    el.hidden = false;
    clearTimeout(popStars.timer);
    popStars.timer = setTimeout(() => { el.hidden = true; }, 1600);
  }

  // ------------------------------ Défi du jour ------------------------------
  // Une grille par jour (date locale), la même pour tous : jeu tiré par la date, graine « daily:AAAA-MM-JJ ».
  // Difficulté un peu au-dessus de la quête du joueur. Réussi : jour coché, série de jours, XP ×1,5.
  // C.store.daily = { days: { date: { date, stars, time } }, streak, last, best }
  const DAY = (C.store.daily = C.store.daily || {});
  DAY.days = DAY.days || {};
  const dayBefore = (key) => { const [y, m, d] = key.split('-').map(Number); return C.todayKey(new Date(y, m - 1, d - 1)); };
  function dailyInfo(date) {
    date = date || C.todayKey();
    const seed = 'daily:' + date;
    const id = ORDER[C.hashString(seed) % ORDER.length];
    const level = Math.max(8, Math.min(32, levelInfo(J.done).steps[0].level + 5)); // moyen-difficile
    return { L: -1, free: true, daily: date, id, accent: ACCENT[id], seed, steps: [{ id, variant: 'classic', level, seed }] };
  }
  // série en cours : vivante si le dernier défi réussi date d'aujourd'hui ou d'hier
  function dailyStreak() {
    const today = C.todayKey();
    return DAY.last === today || DAY.last === dayBefore(today) ? DAY.streak || 0 : 0;
  }
  function recordDaily(date, stars, time) {
    const prev = DAY.days[date];
    if (!prev) {
      DAY.streak = DAY.last === dayBefore(date) ? (DAY.streak || 0) + 1 : DAY.last === date ? DAY.streak || 1 : 1;
      DAY.last = date;
      DAY.best = Math.max(DAY.best || 0, DAY.streak);
    }
    DAY.days[date] = { date, stars: Math.max(stars, prev ? prev.stars : 0), time: prev && prev.time ? Math.min(prev.time, time) : time };
    // on ne garde que les deux derniers mois
    const keys = Object.keys(DAY.days).sort();
    keys.slice(0, Math.max(0, keys.length - 62)).forEach((k) => delete DAY.days[k]);
  }
  function startDaily() {
    const info = dailyInfo();
    info.xpStart = Object.assign({}, C.store.xp);
    ['#library', '#levels', '#brain'].forEach((s) => { const el = $(s); if (el) el.hidden = true; });
    C.sfx.tap();
    playStep(info, 0);
  }
  const CHECK = '<svg viewBox="0 0 24 24"><path d="M5.5 12.5l4 4 9-9.5"/></svg>';
  const FLAME = '<svg viewBox="0 0 24 24"><path d="M12 2.8c.6 3.4 4.6 5.6 4.6 10.4a4.6 4.6 0 0 1-9.2 0c0-2.2 1-3.6 2.2-4.8.2 1.6.9 2.6 1.9 3 .2-3.3-.6-5.8.5-8.6z"/></svg>';
  // contenu du bouton (et de la rangée de la liste) : icône du jeu, coche + étoiles une fois fait, flamme de la série
  function dailyBadges() {
    const info = dailyInfo(), rec = DAY.days[info.daily], streak = dailyStreak();
    return {
      info, rec, streak,
      html: '<span class="daily-ic" style="color:' + info.accent + '">' + icon(info.id) + '</span>' +
        (rec ? '<i class="daily-check">' + CHECK + '</i>' + starRow(rec.stars, 'mini-stars daily-stars') : '') +
        (streak > 0 ? '<i class="daily-flame">' + FLAME + '<b>' + streak + '</b></i>' : '')
    };
  }
  function renderDaily() {
    const b = $('#open-daily');
    if (!b) return;
    const d = dailyBadges();
    b.innerHTML = d.html;
    b.classList.toggle('done', !!d.rec);
    b.setAttribute('aria-label', 'Défi du jour · ' + game(d.info.id).name);
  }

  // ------------------------ Liste des mini-jeux ------------------------
  let libMode = 'classic';
  try { libMode = localStorage.getItem('odysseum.libmode') || 'classic'; } catch (e) { /* ignore */ }

  function renderLibrary() {
    document.querySelector('.lib-mode').hidden = !VARIANTS_ON;
    document.querySelectorAll('.lib-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === libMode));
    const gl = $('#game-list');
    gl.innerHTML = '';
    // en tête : le défi du jour, petite rangée mise en avant
    const dd = dailyBadges();
    const row = document.createElement('button');
    row.className = 'daily-row' + (dd.rec ? ' done' : '');
    row.setAttribute('aria-label', 'Défi du jour · ' + game(dd.info.id).name);
    // pastille du jeu du jour (couleur pleine), titre, puis étoiles / série, et le bouton Play
    row.style.setProperty('--c', dd.info.accent);
    row.innerHTML = '<span class="dr-ic">' + icon(dd.info.id) + '</span>' +
      '<span class="dr-mid"><b>Défi du jour</b><small>' + game(dd.info.id).name + '</small></span>' +
      '<span class="dr-badges">' + (dd.rec ? starRow(dd.rec.stars, 'mini-stars dr-stars') : '') +
      (dd.streak > 0 ? '<i class="dr-flame">' + FLAME + '<b>' + dd.streak + '</b></i>' : '') + '</span>' +
      '<span class="daily-go">' + (dd.rec ? CHECK : UI('play')) + '</span>';
    row.addEventListener('click', startDaily);
    gl.appendChild(row);
    // rangés par capacité : un petit titre coloré, puis les cartes de ses mini-jeux
    let group = null;
    const byCat = [];
    SKILLS.forEach((sk) => sk.games.forEach((id) => byCat.push([sk, game(id)])));
    C.games.forEach((g) => { if (!byCat.some(([, x]) => x === g)) byCat.push([null, g]); });
    let lastSk;
    byCat.forEach(([sk, g]) => {
      if (sk !== lastSk) {
        lastSk = sk;
        const h = document.createElement('h3');
        h.className = 'lib-cat';
        h.style.setProperty('--game', ACCENT[(sk || { games: [g.id] }).games[0]]);
        h.textContent = sk ? sk.name : 'Autres';
        gl.appendChild(h);
        group = document.createElement('div');
        group.className = 'lib-group';
        gl.appendChild(group);
      }
      const v = VARIANTS_ON && libMode === 'variant' && g.variants && g.variants[1] ? g.variants[1].id : 'classic';
      const b = document.createElement('button');
      b.className = 'tile';
      b.style.setProperty('--game', ACCENT[g.id]);
      b.innerHTML = '<span class="tile-icon">' + icon(g.id) + '</span><span class="tile-name">' + g.name + '</span>' +
        '<span class="tile-lvl">niv. ' + gameLvl(g.id) + '</span>';
      b.addEventListener('click', () => openLevels(g.id));
      group.appendChild(b);
    });
    renderMegaLib(gl);
    renderEventsLib(gl);
  }

  // Catégorie « Méga » : un jeu par carte (150 niveaux chacun), pastille dorée MÉGA, jauge de progression ;
  // verrouillée (cadenas) tant que le palier Expert du jeu n'est pas ouvert. Toucher : bandeau des niveaux, onglet Méga.
  function renderMegaLib(gl) {
    if (!MEGA_IDS.length) return;
    const h = document.createElement('h3');
    h.className = 'lib-cat lib-cat-mega lib-cat-megas';
    h.style.setProperty('--game', '#e2a21f');
    h.textContent = 'Méga';
    gl.appendChild(h);
    const group = document.createElement('div');
    group.className = 'lib-group lib-mega lib-megas';
    gl.appendChild(group);
    MEGA_IDS.forEach((id) => {
      const open = megaOpen(id), done = megaRec(id).done, full = done >= MEGA_SIZE;
      const b = document.createElement('button');
      b.className = 'tile mega-tile mega-cat' + (open ? '' : ' locked') + (full ? ' won' : '');
      b.style.setProperty('--game', open ? ACCENT[id] : '#aab2bb');
      b.style.setProperty('--p', (done / MEGA_SIZE).toFixed(3));
      b.setAttribute('aria-label', 'Méga ' + game(id).name);
      b.innerHTML = '<span class="tile-icon">' + icon(id) + '<i class="mega-badge">méga</i>' +
        (full ? '<i class="mega-cup">' + CUP + '</i>' : '') + '</span>' +
        '<span class="tile-name">' + game(id).name + '</span>' +
        '<span class="tile-lvl">' + (!open ? LOCK : full ? '150' : 'niv. ' + (done + 1)) + '</span>' +
        '<i class="mega-bar"><b></b></i>';
      b.addEventListener('click', () => openLevels(id, 'mega'));
      group.appendChild(b);
    });
  }

  // Catégorie « Événements » en fin de liste : une carte par île (la suivante grisée, verrouillée),
  // icône du jeu dans sa teinte, petite étiquette MÉGA, coupe dorée une fois réussi.
  const CUP = '<svg viewBox="0 0 24 24"><path d="M7 4h10v4a5 5 0 0 1-10 0z" class="f"/><path d="M7 5.5H4.5a3 3 0 0 0 3 4M17 5.5h2.5a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>';
  function renderEventsLib(gl) {
    const list = eventList();
    if (!list.length) return;
    const h = document.createElement('h3');
    // (bien distinct de « Méga » : une grille spéciale par île, rangée sous le nom de l'île, teinte lagon)
    h.className = 'lib-cat lib-cat-event';
    h.style.setProperty('--game', '#1fa3a0');
    h.textContent = 'Défis des îles';
    gl.appendChild(h);
    const group = document.createElement('div');
    group.className = 'lib-group lib-mega lib-events';
    gl.appendChild(group);
    list.forEach((e) => {
      const b = document.createElement('button');
      b.className = 'tile mega-tile event-tile' + (e.open ? '' : ' locked') + (e.done ? ' won' : '');
      b.style.setProperty('--game', e.open ? e.accent : '#aab2bb');
      b.disabled = !e.open;
      let isle = 'Île ' + (e.c + 1);
      try { isle = voyageName(e.c); } catch (err) { /* liste pas encore prête */ }
      b.setAttribute('aria-label', 'Défi de l\'île ' + isle + ' · ' + game(e.id).name);
      b.innerHTML = '<span class="tile-icon">' + icon(e.id) + '<i class="event-badge">île ' + (e.c + 1) + '</i>' +
        (e.done ? '<i class="mega-cup">' + CUP + '</i>' : '') + '</span>' +
        '<span class="tile-name">' + isle + '</span>' +
        '<span class="tile-lvl">' + (e.open ? game(e.id).name + ' ' + e.n + '×' + e.n : LOCK) + '</span>';
      b.addEventListener('click', () => startEvent(e.c));
      group.appendChild(b);
    });
  }

  // Mode focus : on n'enchaîne que les mini-jeux d'une capacité, en alternant jeux et variantes.
  let focusTurn = 0;
  function startFocus(sk) {
    focusTurn++;
    const g = game(sk.games[focusTurn % sk.games.length]);
    const v = VARIANTS_ON && g.variants && g.variants[1] && Math.random() < 0.4 ? g.variants[1].id : 'classic';
    const d = C.gameData(dataKey(g, v));
    $('#brain').hidden = true;
    playStep({ L: -1, free: true, focus: sk.id, seed: 'focus:' + g.id + ':' + v + ':' + d.level, steps: [{ id: g.id, variant: v, level: d.level }] }, 0);
  }

  // ------------------------ Paliers par mini-jeu ------------------------
  // Chaque mini-jeu : 3 paliers de 150 niveaux. Un palier s'ouvre après 20 niveaux du précédent.
  const TIERS = [
    { id: 'basique', name: 'Basique', from: 1, span: 12 },
    { id: 'difficile', name: 'Difficile', from: 12, span: 14 },
    { id: 'expert', name: 'Expert', from: 25, span: 16 }
  ];
  const TIER_SIZE = 150, TIER_UNLOCK = 20;
  const LOCK = UI('lock-simple');
  const tierDone = (id, t) => ((C.store.tiers || {})[id] || {})[t] || 0;
  const tierOpen = (id, k) => k === 0 || tierDone(id, TIERS[k - 1].id) >= TIER_UNLOCK;
  const tierLevel = (t, k) => t.from + Math.floor((k - 1) * t.span / TIER_SIZE); // difficulté réelle du générateur
  const gameProgress = (id) => TIERS.reduce((s, t) => s + tierDone(id, t.id), 0);
  // niveau d'un mini-jeu affiché au joueur (plutôt qu'un compteur) : +1 tous les 5 niveaux réussis
  const gameLvl = (id) => 1 + Math.floor(gameProgress(id) / 5);
  function tierMark(id, tierId, k) {
    C.store.tiers = C.store.tiers || {};
    const d = C.store.tiers[id] = C.store.tiers[id] || {};
    if (k > (d[tierId] || 0)) d[tierId] = k;
    C.save();
  }
  // une fois : les grilles déjà réussies (quête comprise) comptent dans la progression de chaque mini-jeu
  if (!C.store.tiersMigrated) {
    C.store.tiers = C.store.tiers || {};
    C.games.forEach((g) => {
      const solved = variantsOf(g).reduce((s, v) => s + ((C.store.games[dataKey(g, v.id)] || {}).solved || 0), 0);
      const d = C.store.tiers[g.id] = C.store.tiers[g.id] || {};
      d.basique = Math.min(TIER_SIZE, Math.max(d.basique || 0, solved));
    });
    C.store.tiersMigrated = 1;
    C.save();
  }
  // prochain niveau à jouer d'un mini-jeu : le plus haut palier ouvert pas encore terminé
  function nextTier(id) {
    let nx = null;
    TIERS.forEach((t, k) => { const d = tierDone(id, t.id); if (tierOpen(id, k) && d < TIER_SIZE) nx = { tier: t, k: d + 1 }; });
    return nx;
  }
  function startTier(id, tierId, k, chain) {
    if (tierId === 'mega') { startMega(id, k, chain); return; }
    const t = TIERS.find((x) => x.id === tierId);
    $('#levels').hidden = true;
    $('#brain').hidden = true;
    $('#library').hidden = true;
    playStep({ L: -1, free: true, chain: !!chain, tier: { id: tierId, k, name: t.name }, seed: 'palier:' + id + ':' + tierId + ':' + k,
      steps: [{ id, variant: 'classic', level: tierLevel(t, k) }] }, 0);
  }

  // Méga : 150 niveaux par jeu, à la suite (un niveau ouvre le suivant). La catégorie d'un jeu s'ouvre
  // avec son palier Expert. C.store.mega[jeu] = { done: plus haut niveau réussi, stars: { k: 1-3 }, best: { k: secondes } }
  const megaOpen = (id) => !!MEGA_TRACK[id] && tierOpen(id, TIERS.length - 1);
  function megaRec(id) {
    const M = (C.store.mega = C.store.mega || {});
    const r = (M[id] = M[id] || {});
    r.done = r.done || 0; r.stars = r.stars || {}; r.best = r.best || {};
    return r;
  }
  function startMega(id, k, chain) {
    if (!MEGA_TRACK[id]) return;
    k = Math.max(1, Math.min(MEGA_SIZE, k));
    ['#levels', '#brain', '#library'].forEach((s) => { const el = $(s); if (el) el.hidden = true; });
    playStep({ L: -1, free: true, chain: !!chain, mega: { k }, seed: 'mega:' + id + ':' + k,
      steps: [{ id, variant: 'classic', level: 40 + Math.floor(k / 10), params: megaParams(id, k) }] }, 0);
  }

  // Bandeau des niveaux d'un mini-jeu : onglets de palier (+ Méga pour les jeux à grande grille), grille de 150 niveaux
  let lv = null;
  function openLevels(id, tier) {
    let k = 0;
    TIERS.forEach((t, i) => { if (tierOpen(id, i)) k = i; });
    lv = { id, tier: tier === 'mega' && MEGA_TRACK[id] ? 'mega' : TIERS[k].id };
    renderLevels(true);
    $('#levels').hidden = false;
    C.sfx.tap();
  }
  function renderLevels(scroll) {
    const g = game(lv.id);
    const mega = lv.tier === 'mega';
    $('#levels').style.setProperty('--game', ACCENT[lv.id]);
    $('#levels').classList.toggle('lv-mega', mega);
    // en Méga, la petite étiquette donne la taille de la prochaine grille
    const nk = mega ? Math.min(MEGA_SIZE, megaRec(lv.id).done + 1) : 0;
    $('#lv-head').innerHTML = '<span class="lv-icon">' + icon(lv.id) + (mega ? '<i class="mega-badge">méga</i>' : '') + '</span><b>' + g.name + '</b>' +
      '<small>' + (mega ? megaN(lv.id, nk) + '×' + megaN(lv.id, nk) : 'niveau ' + gameLvl(lv.id)) + '</small>';
    const tabs = TIERS.map((t, k) => ({ id: t.id, name: t.name, open: tierOpen(lv.id, k), done: tierDone(lv.id, t.id) }));
    if (MEGA_TRACK[lv.id]) tabs.push({ id: 'mega', name: 'Méga', open: megaOpen(lv.id), done: megaRec(lv.id).done, mega: true });
    $('#lv-tabs').classList.toggle('four', tabs.length > 3);
    $('#lv-tabs').innerHTML = tabs.map((t) =>
      '<button role="tab" data-tier="' + t.id + '" class="' + (t.id === lv.tier ? 'on' : '') + (t.open ? '' : ' locked') + (t.mega ? ' mega-tab' : '') + '">' +
        '<span>' + t.name + '</span><small>' + (!t.open ? LOCK : t.done >= TIER_SIZE ? '✓' : 'niv. ' + (t.done + 1)) + '</small></button>').join('');
    const k = TIERS.findIndex((t) => t.id === lv.tier);
    const done = mega ? megaRec(lv.id).done : tierDone(lv.id, lv.tier), open = mega ? megaOpen(lv.id) : tierOpen(lv.id, k);
    let h = open ? '' : mega ? '<p class="lv-note">' + LOCK + 'Ouvre le palier expert.</p>'
      : '<p class="lv-note">' + LOCK + 'Réussis ' + TIER_UNLOCK + ' niveaux ' + TIERS[k - 1].name.toLowerCase() + ' pour ouvrir ce palier.</p>';
    const tstars = mega ? megaRec(lv.id).stars : tierStarsOf(lv.id, lv.tier);
    for (let i = 1; i <= TIER_SIZE; i++) {
      const st = !open ? 'locked' : i <= done ? 'done' : i === done + 1 ? 'next' : 'locked';
      // niveau réussi : ses meilleures étoiles sous le numéro
      const stars = st === 'done' && tstars[i] ? starRow(tstars[i]) : '';
      // Méga : le premier niveau de chaque taille porte une petite pastille « 11² »
      const n = mega ? megaN(lv.id, i) : 0, up = mega && (i === 1 || megaN(lv.id, i - 1) !== n);
      h += '<button class="lv ' + st + (up ? ' size-up' : '') + '" data-k="' + i + '"' + (up ? ' data-size="' + n + '²"' : '') +
        (st === 'locked' ? ' disabled' : '') + ' style="--i:' + Math.min(i, 40) + '">' + i + stars + '</button>';
    }
    const grid = $('#lv-grid');
    grid.innerHTML = h;
    // reprendre là où on s'est arrêté : le plus haut palier ouvert qui n'est pas terminé (en Méga : le niveau Méga suivant)
    const resume = mega ? (open && done < MEGA_SIZE ? { tier: { id: 'mega', name: 'Méga' }, k: done + 1 } : null) : nextTier(lv.id);
    const fb = $('#lv-focus');
    fb.hidden = !resume;
    if (resume) {
      fb.dataset.tier = resume.tier.id; fb.dataset.k = resume.k;
      fb.innerHTML = (resume.k > 1 ? 'continuer' : 'commencer') + ' · <b>' + resume.tier.name.toLowerCase() + ' ' + resume.k + '</b>';
    }
    if (scroll) {
      const cur = grid.querySelector('.lv.next') || grid.querySelector('.lv.done:last-of-type');
      grid.scrollTop = cur ? Math.max(0, cur.offsetTop - grid.clientHeight / 2) : 0;
    }
  }

  function startFree(g, variant) {
    const d = C.gameData(dataKey(g, variant));
    $('#library').hidden = true;
    playStep({ L: -1, free: true, seed: 'libre:' + g.id + ':' + variant + ':' + d.level, steps: [{ id: g.id, variant, level: d.level }] }, 0);
  }

  // ------------------------ Carte du cerveau ------------------------
  // Chaque faculté se nourrit de deux mini-jeux ; les grilles réussies allument ses neurones.
  // Capacités sollicitées par les jeux, d'après docs/fondements-cognitifs.md :
  // déduction sur contraintes (Gf), traitement visuo-spatial (Gv), planification, test d'hypothèses.
  // Les jauges reflètent la pratique dans le jeu, pas une mesure des capacités.
  const SKILLS = [
    { id: 'logique', name: 'Déduction', games: ['reines', 'astres', 'demineur'], at: [72, 160], r: [50, 56] },
    { id: 'espace', name: 'Espace', games: ['paves', 'pixels', 'tuyaux'], at: [168, 160], r: [50, 56] },
    { id: 'anticipation', name: 'Anticipation', games: ['flux', 'serpent', 'rushhour'], at: [120, 84], r: [80, 48] },
    { id: 'raisonnement', name: 'Hypothèses', games: ['lumieres', 'coffre', 'oracle'], at: [80, 252], r: [52, 48] },
    { id: 'memoire', name: 'Mémoire', games: ['simon', 'amphores', 'mosaique'], at: [164, 254], r: [46, 46] }
  ];
  SKILLS.forEach((sk) => { sk.games = sk.games.filter((id) => C.games.some((g) => g.id === id)); });
  const NODES = 10;
  // emblèmes des capacités (trait 24×24) : loupe, compas, sablier, balance, lyre
  const SKILL_ICON = {
    logique: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M14.6 14.6 20 20"/><path d="M8.5 10.5h4M10.5 8.5v4" opacity=".6"/>',
    espace: '<path d="M12 3v3M12 6l-6 14M12 6l6 14M7.6 16h8.8"/><circle cx="12" cy="6" r="1.6"/>',
    anticipation: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    raisonnement: '<path d="M12 4v16M8 20h8M5 7h14M5 7l-2.5 6h5zM19 7l-2.5 6h5z"/>',
    memoire: '<path d="M7 4c-2 4-2 10 1 15M17 4c2 4 2 10-1 15M7 4c3 1 7 1 10 0M8 19h8M10 7v10M12 7v11M14 7v10"/>'
  };
  const solvedOf = (id) => { const g = game(id); return variantsOf(g).reduce((s, v) => s + C.gameData(dataKey(g, v.id)).solved, 0); };
  // première ouverture avec le système d'XP : on convertit les grilles déjà réussies
  if (!C.store.xp) {
    C.store.xp = {};
    SKILLS.forEach((sk) => { C.store.xp[sk.id] = sk.games.reduce((s, id) => s + solvedOf(id), 0) * 12; });
    C.save();
  }
  // chaque niveau demande un peu plus d'XP que le précédent
  function levelFrom(xp, step) {
    let n = 1, rest = xp;
    while (rest >= step * n) { rest -= step * n; n++; }
    return { level: n, cur: rest, need: step * n, frac: rest / (step * n) };
  }
  const skillStats = (sk) => {
    const xp = C.store.xp[sk.id] || 0;
    const L = levelFrom(xp, 40);
    return Object.assign({ xp }, L, { lit: Math.min(NODES, L.level - 1 + (L.frac >= 0.5 ? 1 : 0)) });
  };
  function playerStats() {
    const total = SKILLS.reduce((s, sk) => s + (C.store.xp[sk.id] || 0), 0);
    return Object.assign({ total }, levelFrom(total, 100));
  }

  function renderBadge() {
    const p = playerStats();
    $('#level-num').textContent = p.level;
    $('#level-ring').setAttribute('stroke-dashoffset', String(144.5 * (1 - p.frac)));
    $('#brain-xp-mini').style.width = Math.round(p.frac * 100) + '%';
  }

  function renderBrain() {
    const p = playerStats();
    $('#brain-level').textContent = p.level;
    $('#brain-xp').textContent = p.cur + ' / ' + p.need;
    $('#brain-xp-bar').style.width = Math.round(p.frac * 100) + '%';
    $('#games-detail').hidden = true;
    $('#brain-band').setAttribute('aria-expanded', 'false');
    const ns = 'http://www.w3.org/2000/svg';
    const root = $('#brain-svg');
    root.innerHTML = '<g id="brain-overview"></g>';
    const svg = root.querySelector('#brain-overview');
    // cerveau vu de dessus : deux hémisphères, quelques circonvolutions discrètes
    const LEFT = 'M119 30C80 22 38 46 30 100C22 160 28 236 52 278C72 310 100 320 119 316Z';
    const RIGHT = 'M121 30C160 22 202 46 210 100C218 160 212 236 188 278C168 310 140 320 121 316Z';
    let html = '<defs><clipPath id="brain-clip"><path d="' + LEFT + '"/><path d="' + RIGHT + '"/></clipPath>';
    SKILLS.forEach((sk) => {
      html += '<radialGradient id="zg-' + sk.id + '"><stop offset="0" stop-color="' + ACCENT[sk.games[0]] + '" stop-opacity=".9"/>' +
        '<stop offset=".7" stop-color="' + ACCENT[sk.games[0]] + '" stop-opacity=".5"/><stop offset="1" stop-color="' + ACCENT[sk.games[0]] + '" stop-opacity="0"/></radialGradient>';
    });
    html += '</defs><path class="hemi" d="' + LEFT + '"/><path class="hemi" d="' + RIGHT + '"/><g clip-path="url(#brain-clip)">';
    // chaque capacité colore sa région, d'autant plus fort que son niveau monte
    SKILLS.forEach((sk) => {
      const st = skillStats(sk);
      html += '<ellipse class="region" cx="' + sk.at[0] + '" cy="' + sk.at[1] + '" rx="' + sk.r[0] + '" ry="' + sk.r[1] + '" fill="url(#zg-' + sk.id + ')" style="opacity:' + Math.min(1, 0.45 + 0.1 * st.level).toFixed(2) + '"/>';
    });
    html += '<path class="gyri" d="M100 50C80 70 98 90 76 108M50 120C70 130 60 150 84 156M40 200C62 196 70 214 92 220M96 262C84 246 104 236 100 214' +
      'M140 50C160 70 142 90 164 108M190 120C170 130 180 150 156 156M200 200C178 196 170 214 148 220M144 262C156 246 136 236 140 214"/></g>';
    SKILLS.forEach((sk) => {
      const st = skillStats(sk);
      const accent = ACCENT[sk.games[0]];
      // lueurs : une petite étoile par palier atteint, en couronne autour de la zone
      const rng = C.makeRng('cerveau:' + sk.id);
      let stars = '';
      for (let i = 0; i < NODES; i++) {
        const a = rng() * Math.PI * 2, d = 0.72 + rng() * 0.22;
        const on = i < st.lit;
        stars += '<circle class="star' + (on ? ' on' : '') + '" cx="' + (sk.at[0] + Math.cos(a) * sk.r[0] * d).toFixed(1) + '" cy="' + (sk.at[1] + Math.sin(a) * sk.r[1] * d).toFixed(1) + '" r="' + (on ? 1.6 : 1) + '" style="--k:' + i + '"/>';
      }
      const tri = sk.games.length === 3;
      const pos = tri && sk.r[0] < 70 ? [[-19, -18], [19, -18], [0, 24]] : sk.games.map((_, k) => [(k - (sk.games.length - 1) / 2) * 32, 0]);
      let inner = '<ellipse class="zone-hit" cx="' + sk.at[0] + '" cy="' + sk.at[1] + '" rx="' + sk.r[0] + '" ry="' + sk.r[1] + '"/>' + stars +
        '<text class="zone-name" x="' + sk.at[0] + '" y="' + (sk.at[1] + (tri && sk.r[0] < 70 ? -38 : -22)) + '" text-anchor="middle">' + sk.name + '</text><g class="zone-games">';
      // ses mini-jeux : médaillons avec un anneau de progression (sur 450 niveaux)
      sk.games.forEach((id, k) => {
        const x = sk.at[0] + pos[k][0], y = sk.at[1] + pos[k][1];
        const pct = Math.round(100 * gameProgress(id) / (TIER_SIZE * TIERS.length));
        inner += '<g class="zone-game" data-game="' + id + '" style="color:' + ACCENT[id] + ';--k:' + k + '">' +
          '<circle class="zg-disc" cx="' + x + '" cy="' + y + '" r="13"/>' +
          '<circle class="zg-track" cx="' + x + '" cy="' + y + '" r="13"/>' +
          '<circle class="zg-ring" cx="' + x + '" cy="' + y + '" r="13" pathLength="100" stroke-dasharray="' + Math.max(pct, 0.01) + ' 100" transform="rotate(-90 ' + x + ' ' + y + ')"/>' +
          '<g transform="translate(' + (x - 7.2) + ' ' + (y - 7.2) + ') scale(.6)">' + ICON[id] + '</g>' +
          '<text class="zg-name" x="' + x + '" y="' + (y + 20) + '" text-anchor="middle">' + game(id).name + '</text>' +
          '<text class="zg-lvl" x="' + x + '" y="' + (y + 25) + '" text-anchor="middle">niv. ' + gameLvl(id) + '</text></g>';
      });
      html += '<g class="zone" data-skill="' + sk.id + '" style="color:' + accent + '">' + inner + '</g></g>';
    });
    svg.innerHTML = html;
    // contour cartoon : le bord extérieur de chaque hémisphère devient une suite de bosses arrondies (la scissure reste droite)
    svg.querySelectorAll('.hemi').forEach((h) => {
      try {
        const outer = h.getTotalLength() - 286; // longueur sans la scissure du milieu (30 → 316)
        const n = Math.max(8, Math.round(outer / 30));
        const pts = [];
        for (let i = 0; i <= n; i++) { const p = h.getPointAtLength(outer * i / n); pts.push([p.x.toFixed(1), p.y.toFixed(1)]); }
        let d = 'M' + pts[0].join(' ');
        for (let i = 1; i <= n; i++) {
          const r = (Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) * 0.58).toFixed(1);
          d += 'A' + r + ' ' + r + ' 0 0 ' + (h === svg.querySelector('.hemi') ? 0 : 1) + ' ' + pts[i].join(' ');
        }
        h.setAttribute('d', d + 'Z');
      } catch (e) { /* géométrie indisponible : on garde le contour lisse */ }
    });
    zoomBrain(null, true);
    // capacités : nom, niveau et barre, sans description
    $('#skills').innerHTML = SKILLS.map((sk) => {
      const st = skillStats(sk);
      return '<button class="skill" data-skill="' + sk.id + '" style="--game:' + ACCENT[sk.games[0]] + '"><div class="skill-head"><span>' + sk.name +
        '</span><small>niv. ' + st.level + '</small></div><div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div>' +
        '<span class="skill-go" data-skill="' + sk.id + '" role="button" aria-label="Concentration : ' + sk.name + '">' + UI('play') + '</span></button>';
    }).join('');
  }

  // ------------------------ Carte du joueur ------------------------
  // La feuille #brain devient une carte de joueur : portrait d'Ulysse (aux couleurs de sa tenue), nom modifiable,
  // niveau global + titre, bilan du voyage en tuiles, capacités (pentagone + barres). Toucher une capacité
  // déplie ses 3 mini-jeux (showZone → #zone-panel) ; un mini-jeu ouvre ses niveaux (openLevels).
  // L'ancienne carte du cerveau reste dans le DOM, cachée (.pc-legacy), pour ne rien casser.
  // titres par tranche de niveau global : un clin d'œil à l'équipage d'Ulysse, pas une mesure
  const RANKS = [[1, 'Mousse'], [3, 'Matelot'], [6, 'Marin'], [10, 'Navigateur'], [15, 'Capitaine'], [20, 'Héros'], [30, 'Légende d\'Ithaque']];
  const rankOf = (lvl) => RANKS.reduce((r, x) => (lvl >= x[0] ? x[1] : r), RANKS[0][1]);
  const profileOf = () => (C.store.profile = C.store.profile || {});
  const playerName = () => String(profileOf().name || '').trim() || 'Ulysse';
  const sumOf = (o) => Object.values(o || {}).reduce((s, v) => s + (+v || 0), 0);
  function playerTotals() {
    let stars = sumOf(J.stars);
    Object.values(C.store.tierStars || {}).forEach((g) => Object.values(g || {}).forEach((t) => { stars += sumOf(t); }));
    const M = C.store.mega || {};
    Object.values(M).forEach((r) => { stars += sumOf(r && r.stars); });
    return {
      stars,
      done: J.done || 0,
      isle: Math.min(VOYAGE_ISLANDS.length, Math.floor((J.done || 0) / PER) + 1), isles: VOYAGE_ISLANDS.length,
      streak: dailyStreak(), best: DAY.best || 0,
      mega: Object.values(M).reduce((s, r) => s + ((r && r.done) || 0), 0),
      trophies: Object.values(EV).filter((e) => e && e.done).length,
      time: Object.values(C.store.games || {}).reduce((s, d) => s + ((d && d.totalTime) || 0), 0) // secondes (grilles réussies)
    };
  }
  // portrait d'Ulysse en buste (viewBox 100) : peau, cheveux + barbe, tunique, cape, coiffe de la tenue choisie
  function avatarSvg() {
    let st = {};
    try { st = crCurrent(); } catch (e) { st = Object.assign({}, skinState()); }
    const opts = skinOptions();
    const col = (cat, id, def) => { const o = (opts[cat] || []).find((x) => x.id === id); return (o && o.color) || def; };
    const skin = col('skin', st.skin || 's2', '#e2b38f'), hair = col('hair', st.hair || 'brun', '#4a3424');
    const tunic = col('tunic', st.tunic || 'egee', '#2f6f9f'), cape = st.cape === 'none' ? null : col('cape', st.cape || 'blanc', '#f4f1ea');
    const acc = st.accessory || 'none';
    const ink = 'stroke="#3a3550" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
    let s = '<svg viewBox="0 0 100 100"><defs><clipPath id="pc-av-clip"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#pc-av-clip)">' +
      '<circle class="pc-av-sky" cx="50" cy="50" r="50"/><path class="pc-av-sea" d="M0 80Q25 74 50 80T100 80V100H0Z"/>' +
      // épaules, tunique, cape sur les épaules
      '<path d="M10 104C12 82 30 72 50 72S88 82 90 104Z" fill="' + tunic + '" ' + ink + '/>' +
      (cape ? '<path d="M16 92C20 80 30 74 38 73L44 84ZM84 92C80 80 70 74 62 73L56 84Z" fill="' + cape + '" ' + ink + '/>' : '') +
      '<path d="M43 64h14v10c-4 4-10 4-14 0Z" fill="' + skin + '" ' + ink + '/>' +
      // visage
      '<circle cx="29.5" cy="47" r="4.6" fill="' + skin + '" ' + ink + '/><circle cx="70.5" cy="47" r="4.6" fill="' + skin + '" ' + ink + '/>' +
      '<circle cx="50" cy="45" r="21" fill="' + skin + '" ' + ink + '/>' +
      // barbe d'Ulysse (couleur des cheveux), puis le sourire
      '<path d="M30 47C30 64 40 73 50 73S70 64 70 47C66 55 60 58 50 58S34 55 30 47Z" fill="' + hair + '" ' + ink + '/>' +
      '<path d="M44 59.5Q50 63.5 56 59.5" fill="none" stroke="#3a3550" stroke-width="2.4" stroke-linecap="round"/>' +
      '<circle cx="42" cy="46" r="2.6" fill="#3a3550"/><circle cx="58" cy="46" r="2.6" fill="#3a3550"/>' +
      '<circle cx="42.8" cy="45.1" r=".9" fill="#fff"/><circle cx="58.8" cy="45.1" r=".9" fill="#fff"/>' +
      '<ellipse cx="36" cy="53" rx="3.6" ry="2.2" fill="#ff7eb0" opacity=".45"/><ellipse cx="64" cy="53" rx="3.6" ry="2.2" fill="#ff7eb0" opacity=".45"/>' +
      // cheveux
      '<path d="M28.5 46C26 29 37 22 50 22S74 29 71.5 46C69 39 65 35 61 34C55 38 45 39 38 35C34 37 30.5 41 28.5 46Z" fill="' + hair + '" ' + ink + '/>';
    if (acc === 'laurel') {
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * (1.08 + i * 0.105), b = Math.PI * (1.92 - i * 0.105);
        [a, b].forEach((t) => { const x = 50 + Math.cos(t) * 22, y = 44 + Math.sin(t) * 19; s += '<ellipse cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="4.4" ry="2.4" transform="rotate(' + (t * 180 / Math.PI + 90).toFixed(0) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')" fill="#6fae3a" stroke="#3a3550" stroke-width="1.6"/>'; });
      }
    } else if (acc === 'band') {
      s += '<path d="M29.5 37C42 31 58 31 70.5 37L70 42C58 37 42 37 30 42Z" fill="#c0392b" ' + ink + '/>';
    } else if (acc === 'helmet') {
      s += '<path d="M27 47C25 28 36 19 50 19S75 28 73 47L66 47 64 38H36L34 47Z" fill="#c9923e" ' + ink + '/>' +
        '<path d="M34 18C40 6 60 6 66 18C60 15 40 15 34 18Z" fill="#c0392b" ' + ink + '/>';
    } else if (acc === 'petasos') {
      s += '<ellipse cx="50" cy="31" rx="33" ry="6.5" fill="#b98a4e" ' + ink + '/><path d="M35 30C35 18 65 18 65 30Z" fill="#b98a4e" ' + ink + '/>';
    }
    return s + '</g><circle cx="50" cy="50" r="48.5" fill="none" stroke="#3a3550" stroke-width="3"/></svg>';
  }
  // pentagone des capacités : une branche par capacité, son emblème au bout
  function radarSvg() {
    const cx = 110, cy = 108, R = 66, n = SKILLS.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const poly = (f) => SKILLS.map((_, i) => pt(i, f(i)).map((v) => v.toFixed(1)).join(',')).join(' ');
    const vals = SKILLS.map((sk) => { const st = skillStats(sk); return st.level - 1 + st.frac; });
    const max = Math.max(4, Math.ceil(Math.max.apply(null, vals) * 1.15));
    let s = '';
    [1, 2 / 3, 1 / 3].forEach((k, j) => { s += '<polygon class="pc-rd-ring' + (j ? '' : ' out') + '" points="' + poly(() => R * k) + '"/>'; });
    SKILLS.forEach((_, i) => { const p = pt(i, R); s += '<line class="pc-rd-axis" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"/>'; });
    s += '<polygon class="pc-rd-val" points="' + poly((i) => R * (0.14 + 0.86 * Math.min(1, vals[i] / max))) + '"/>';
    SKILLS.forEach((sk, i) => {
      const p = pt(i, R * (0.14 + 0.86 * Math.min(1, vals[i] / max)));
      s += '<circle class="pc-rd-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="4" style="--c:var(--sk-' + sk.id + ')"/>';
    });
    SKILLS.forEach((sk, i) => {
      const [x, y] = pt(i, R + 22), st = skillStats(sk);
      s += '<g class="pc-rd-sk" data-skill="' + sk.id + '" style="--c:var(--sk-' + sk.id + ')" role="button" aria-label="' + sk.name + '">' +
        '<circle class="pc-rd-disc" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15"/>' +
        '<g transform="translate(' + (x - 9).toFixed(1) + ' ' + (y - 9).toFixed(1) + ') scale(.75)" class="pc-rd-ic">' + SKILL_ICON[sk.id] + '</g>' +
        '<circle class="pc-rd-badge" cx="' + (x + 12).toFixed(1) + '" cy="' + (y - 11).toFixed(1) + '" r="8.5"/>' +
        '<text class="pc-rd-num" x="' + (x + 12).toFixed(1) + '" y="' + (y - 7.2).toFixed(1) + '" text-anchor="middle">' + st.level + '</text></g>';
    });
    return s;
  }
  // petites icônes des tuiles (24×24)
  const PC_IC = {
    star: '<path class="f" d="' + STAR_D + '"/>',
    flag: '<path d="M6 21V4"/><path class="f" d="M6 4h11l-2.5 4L17 12H6z"/>',
    isle: '<path class="f" d="M2.5 20c2.5-3.2 16.5-3.2 19 0z"/><path d="M10.5 17.5c0-4 1-7 3-9.5"/><path class="f" d="M13.5 8C11 5 7 5 5 7.5c3-.6 5.6-.4 8.5.5zM13.5 8c1.5-3.4 5.5-4.4 7.5-2.3-3 0-5.4.8-7.5 2.3zM13.5 8c-2.4 1-4.2 3.4-4.4 6.4 1.8-2.2 3.2-4.2 4.4-6.4zM13.5 8c2.4.8 4 3 4.2 6-1.4-2-2.8-4-4.2-6z"/>',
    fire: '<path class="f" d="M12 21c-4 0-7-2.7-7-6.5 0-3.4 2.6-5.3 3.6-8.5 1.6 1.4 2.2 3 2.2 4.4 1.2-.8 2.2-2.6 2-5.4 3.5 2.2 6.2 5.6 6.2 9.5 0 3.8-3 6.5-7 6.5z"/>',
    mega: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>',
    trophy: '<path class="f" d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4c0 3 1.5 4.5 3 4.5M17 6h3c0 3-1.5 4.5-3 4.5M12 14v3M8 20h8M9.5 17h5"/>',
    time: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.6 2M10 3h4"/>'
  };
  const fmtTime = (t) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return h ? h + ' h ' + String(m).padStart(2, '0') : Math.max(1, m) + ' min'; };
  function renderProfile() {
    const p = playerStats(), T = playerTotals();
    $('#pc-avatar').innerHTML = avatarSvg();
    $('#pc-name-txt').textContent = playerName();
    $('#pc-title').textContent = rankOf(p.level);
    $('#pc-level').textContent = p.level;
    $('#pc-xp').textContent = p.cur + ' / ' + p.need;
    $('#pc-xp-bar').style.width = Math.round(p.frac * 100) + '%';
    // tuiles : icône, gros chiffre, un mot
    const tiles = [
      ['star', T.stars, 'étoiles', 'var(--k-sun)'],
      ['flag', T.done, 'niveaux', 'var(--k-grass)'],
      ['isle', T.isle + '<small>/' + T.isles + '</small>', 'île', 'var(--k-lagoon)'],
      ['fire', T.streak + (T.best > T.streak ? '<small> · ' + T.best + '</small>' : ''), 'série', 'var(--k-roof)'],
      ['mega', T.mega, 'méga', 'var(--sk-raisonnement)'],
      ['trophy', T.trophies, 'trophées', 'var(--k-sun-dk)']
    ];
    if (T.time >= 60) tiles.push(['time', fmtTime(T.time), 'de jeu', 'var(--k-sky)']);
    $('#pc-stats').innerHTML = tiles.map((t, k) => '<div class="pc-tile' + (k > 5 ? ' wide' : '') + '" style="--c:' + t[3] + ';--k:' + k + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + PC_IC[t[0]] + '</svg>' +
      '<b>' + t[1] + '</b><small>' + t[2] + '</small></div>').join('');
    $('#pc-radar').innerHTML = radarSvg();
    $('#pc-skill-list').innerHTML = SKILLS.map((sk) => {
      const st = skillStats(sk);
      return '<button class="pc-skill" data-skill="' + sk.id + '" style="--c:var(--sk-' + sk.id + ');--game:' + ACCENT[sk.games[0]] + '" aria-expanded="false">' +
        '<span class="pc-sk-ic"><svg viewBox="0 0 24 24" aria-hidden="true">' + SKILL_ICON[sk.id] + '</svg></span>' +
        '<span class="pc-sk-name">' + sk.name + '</span><span class="pc-sk-lvl">' + st.level + '</span>' +
        '<span class="pc-sk-bar"><i style="width:' + Math.max(4, Math.round(st.frac * 100)) + '%"></i></span></button>';
    }).join('');
    // panneau de capacité replié, rangé en fin de liste
    showZone(null);
    $('#pc-skill-list').after($('#zone-panel'));
    // classement : la carte s'ouvre toujours sur la fiche ; on publie ses chiffres puis on affiche son rang
    closeBoard();
    refreshMyRank();
  }

  // ------------------------ Classement en ligne (js/rank.js) ------------------------
  // On publie pseudo, niveau global, XP totale et étoiles ; tout échec réseau reste silencieux.
  const rankStats = () => { const p = playerStats(); return { name: playerName(), level: p.level, xp: p.total, stars: playerTotals().stars }; };
  function pushRank() { return C.rank ? C.rank.push(rankStats()).catch(() => false) : Promise.resolve(false); }
  let rankTimer = 0;
  function pushRankSoon() { clearTimeout(rankTimer); rankTimer = setTimeout(pushRank, 3000); }
  const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  async function refreshMyRank() {
    const el = $('#pc-rank-num');
    $('#pc-rank').hidden = !C.rank;
    if (!C.rank) return;
    $('#pc-rank').classList.add('wait');
    let n = null;
    try { await pushRank(); n = await C.rank.myRank(rankStats()); } catch (e) { n = null; }
    $('#pc-rank').classList.remove('wait');
    el.textContent = n ? '#' + n : '#–';
  }
  const MEDAL = ['#ffc93d', '#c9d2e0', '#e59a5c']; // or, argent, bronze
  function boardRow(r, pos, me) {
    const medal = pos <= 3 ? '<svg class="pc-medal" viewBox="0 0 24 24" style="--m:' + MEDAL[pos - 1] + '"><path d="M7 2h4l1 5-4 1zM17 2h-4l-1 5 4 1z"/><circle cx="12" cy="15" r="6.5"/><text x="12" y="18.2" text-anchor="middle">' + pos + '</text></svg>' : '<span class="pc-pos">' + pos + '</span>';
    return '<li class="pc-row' + (me ? ' me' : '') + '" style="--k:' + Math.min(pos, 20) + '">' + medal +
      '<span class="pc-row-name">' + escHtml(r.name || 'Ulysse') + '</span>' +
      '<span class="pc-row-stars"><svg viewBox="0 0 24 24"><path d="' + STAR_D + '"/></svg>' + (r.stars | 0) + '</span>' +
      '<span class="pc-row-lvl">' + (r.level | 0) + '</span></li>';
  }
  async function loadBoard() {
    const list = $('#pc-board-list');
    list.innerHTML = '<li class="pc-board-msg"><span class="pc-spin"></span></li>';
    try {
      if (!C.rank) throw new Error('hors ligne');
      await pushRank();
      const rows = await C.rank.top(50), me = C.rank.playerId();
      let html = rows.map((r, i) => boardRow(r, i + 1, r.id === me)).join('');
      // hors du top 50 : sa propre ligne en dessous
      if (!rows.some((r) => r.id === me)) {
        const st = rankStats(), n = await C.rank.myRank(st).catch(() => null);
        if (n) html += '<li class="pc-row-gap">⋯</li>' + boardRow(st, n, true);
      }
      list.innerHTML = html || '<li class="pc-board-msg">–</li>';
      const mine = list.querySelector('.pc-row.me');
      if (mine) requestAnimationFrame(() => mine.scrollIntoView({ block: 'nearest' }));
    } catch (e) {
      // hors ligne : un nuage barré et « réessayer »
      list.innerHTML = '<li class="pc-board-msg off"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.4 4.3 4.3 0 0 0 7 18z"/><path d="M4 4l16 16"/></svg>' +
        '<span>Hors ligne</span><button id="pc-board-retry" class="pc-board-retry" aria-label="Réessayer"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/></svg></button></li>';
    }
  }
  function openBoard() {
    $('#brain .pc-sheet').classList.add('board');
    $('#pc-board').hidden = false;
    $('#brain .pc-sheet').scrollTop = 0;
    C.sfx.tap();
    loadBoard();
  }
  function closeBoard() {
    $('#brain .pc-sheet').classList.remove('board');
    $('#pc-board').hidden = true;
  }
  // toucher une capacité (barre ou sommet du pentagone) : ses mini-jeux se déplient juste dessous ; re-toucher replie
  function profileSkill(id) {
    const sk = SKILLS.find((s) => s.id === id);
    if (!sk) return;
    const open = zoomed === id && !$('#zone-panel').hidden;
    showZone(open ? null : sk);
    document.querySelectorAll('.pc-skill').forEach((b) => b.setAttribute('aria-expanded', String(!open && b.dataset.skill === id)));
    if (open) return;
    const row = $('.pc-skill[data-skill="' + id + '"]');
    row.after($('#zone-panel'));
    C.sfx.tap();
    requestAnimationFrame(() => $('#zone-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  // nom du joueur : un toucher le rend modifiable (16 caractères au plus)
  function editPlayerName() {
    const btn = $('#pc-name');
    if (btn.hidden) return;
    const inp = document.createElement('input');
    inp.className = 'pc-name-input'; inp.maxLength = 16; inp.value = playerName();
    inp.setAttribute('aria-label', 'Nom du joueur'); inp.autocomplete = 'off'; inp.spellcheck = false;
    btn.hidden = true;
    btn.after(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (keep) => {
      if (done) return;
      done = true;
      const name = inp.value.replace(/[<>]/g, '').trim().slice(0, 16); // vide → « Ulysse » (le classement exige 1 à 20 caractères)
      const changed = keep && name !== String(profileOf().name || '');
      if (changed) { profileOf().name = name; C.save(); }
      inp.remove(); btn.hidden = false;
      $('#pc-name-txt').textContent = playerName();
      if (changed) pushRank();
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }

  // niveau d'un mini-jeu : une marche toutes les 3 grilles réussies
  const gameLevel = (id) => 1 + Math.floor(solvedOf(id) / 3);

  // Le cerveau est une carte : on la glisse au doigt, on zoome (pincer, molette, toucher une zone).
  // Zoomé, chaque zone dévoile ses mini-jeux ; la zone au centre de la vue s'affiche dessous.
  const BRAIN_W = 240, BRAIN_H = 340, MIN_W = 84;
  let brainView = [0, 0, BRAIN_W, BRAIN_H], brainAnim = 0, zoomed = null;
  // la vue épouse la forme du cadre (plus haut que large sur téléphone) : le cerveau garde ses proportions
  const brainAspect = () => { const r = $('#brain-svg').getBoundingClientRect(); return r.width && r.height ? r.width / r.height : BRAIN_W / BRAIN_H; };
  // vue d'ensemble : tout le cerveau tient dans le cadre, quelle que soit sa forme
  const maxW = () => Math.max(BRAIN_W, BRAIN_H * brainAspect());
  function clampView(v) {
    const w = Math.max(MIN_W, Math.min(maxW(), v[2])), h = w / brainAspect();
    const cx = v[0] + v[2] / 2, cy = v[1] + v[3] / 2;
    const x = w >= BRAIN_W ? (BRAIN_W - w) / 2 : Math.max(0, Math.min(BRAIN_W - w, cx - w / 2));
    const y = h >= BRAIN_H ? (BRAIN_H - h) / 2 : Math.max(0, Math.min(BRAIN_H - h, cy - h / 2));
    return [x, y, w, h];
  }
  function setBrainView(v) {
    brainView = clampView(v);
    const svg = $('#brain-svg');
    svg.setAttribute('viewBox', brainView.join(' '));
    const z = maxW() / brainView[2];
    svg.style.setProperty('--z', z.toFixed(3));
    // la zone la plus proche du centre de la vue devient la zone affichée (dès qu'on a un peu zoomé)
    const cx = brainView[0] + brainView[2] / 2, cy = brainView[1] + brainView[3] / 2;
    let best = null;
    if (z > 1.45) {
      let bd = Infinity;
      SKILLS.forEach((sk) => { const d = Math.hypot(sk.at[0] - cx, sk.at[1] - cy); if (d < bd) { bd = d; best = sk; } });
    }
    showZone(best);
  }
  function showZone(sk) {
    const id = sk ? sk.id : null;
    if (id === zoomed && $('#zone-panel').dataset.for === String(id)) return;
    zoomed = id;
    const svg = $('#brain-svg');
    svg.classList.toggle('zoomed', !!sk);
    svg.querySelectorAll('.zone').forEach((z) => z.classList.toggle('zfocus', z.dataset.skill === zoomed));
    $('#brain-back').hidden = !sk;
    $('#skills').hidden = !!sk;
    const panel = $('#zone-panel');
    panel.hidden = !sk;
    panel.dataset.for = String(id);
    if (!sk) return;
    const st = skillStats(sk);
    panel.style.setProperty('--game', ACCENT[sk.games[0]]);
    panel.innerHTML = '<div class="zp-head"><b>' + sk.name + '</b><small>niv. ' + st.level + ' · ' + st.cur + ' / ' + st.need + ' xp</small></div>' +
      '<div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div>' +
      '<div class="zp-games">' + sk.games.map((id2, k) => '<button class="zp-game" data-game="' + id2 + '" style="--game:' + ACCENT[id2] + ';--k:' + k + '">' + icon(id2) +
        '<span>' + game(id2).name + '</span><small>niv. ' + gameLvl(id2) + '</small></button>').join('') + '</div>' +
      '<button class="zp-go" data-skill="' + sk.id + '">activer le mode concentration</button>';
  }
  // vol animé vers une zone (null = vue d'ensemble)
  function zoomBrain(skillId, instant) {
    const sk = SKILLS.find((s) => s.id === skillId);
    const w = sk ? 132 : maxW(), h = w / brainAspect();
    const target = clampView(sk ? [sk.at[0] - w / 2, sk.at[1] - h / 2 + 6, w, h] : [0, 0, w, h]);
    cancelAnimationFrame(brainAnim);
    if (instant) { setBrainView(target); return; }
    const from = brainView.slice(), t0 = performance.now(), D = 650;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      setBrainView(from.map((v, i) => v + (target[i] - v) * e));
      if (k < 1) brainAnim = requestAnimationFrame(step);
    };
    brainAnim = requestAnimationFrame(step);
  }
  // gestes : glisser pour se déplacer, pincer ou molette pour zoomer, toucher pour choisir
  (function brainGestures() {
    const svg = $('#brain-svg');
    const pts = new Map();
    let moved = 0, pinch = null;
    const unit = () => brainView[2] / svg.getBoundingClientRect().width; // unités de vue par pixel
    const toView = (px, py) => { const r = svg.getBoundingClientRect(); return [brainView[0] + (px - r.left) * unit(), brainView[1] + (py - r.top) * unit()]; };
    function zoomAt(px, py, f) {
      const [vx, vy] = toView(px, py);
      const w = Math.max(MIN_W, Math.min(maxW(), brainView[2] / f)), k = w / brainView[2];
      setBrainView([vx - (vx - brainView[0]) * k, vy - (vy - brainView[1]) * k, w, w / brainAspect()]);
    }
    svg.addEventListener('pointerdown', (e) => {
      cancelAnimationFrame(brainAnim);
      svg.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) moved = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); moved = 99; }
    });
    svg.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1];
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
        pinch = d;
        return;
      }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) setBrainView([brainView[0] - dx * unit(), brainView[1] - dy * unit(), brainView[2], brainView[3]]);
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size || moved > 6 || e.type === 'pointercancel') return;
      // simple toucher : un mini-jeu (zoomé) ouvre ses niveaux, une zone attire la vue
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const gEl = el && el.closest('.zone-game');
      if (gEl && svg.classList.contains('zoomed')) { openLevels(gEl.dataset.game); return; }
      const z = el && el.closest('.zone');
      if (z) { zoomBrain(z.dataset.skill); C.sfx.tap(); }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); cancelAnimationFrame(brainAnim); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  })();

  // détail par mini-jeu (sous le bandeau) : un toucher ramène au cerveau, sur la bonne zone
  function renderGamesDetail() {
    $('#games-detail').innerHTML = ORDER.map((id) => '<button class="gd-game" data-game="' + id + '" style="--game:' + ACCENT[id] + '">' + icon(id) +
      '<span>' + game(id).name + '</span><small>niv. ' + gameLevel(id) + '</small></button>').join('');
  }

  // ------------------------------ Thème ------------------------------
  // Interface : « auto » suit le réglage clair / sombre du téléphone ; « clair » / « sombre » le forcent.
  // La 3D, elle, suit l'heure réelle (aube, jour, heure dorée, crépuscule, nuit), sauf si
  // « Toujours le jour » est coché.
  const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const osDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolvedTheme() {
    const s = C.store.settings.theme || 'auto';
    return s === 'auto' ? (osDark && osDark.matches ? 'dark' : 'light') : s;
  }
  function applyTheme() {
    const th = resolvedTheme();
    document.documentElement.dataset.theme = th;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', th === 'dark' ? '#262d74' : '#5ec3f2');
    if (worldReady && C.world.setTime) C.world.setTime(hourNow(), C.store.settings.dayLock ? 'day' : false);
    if (session && session.inst.redraw) session.inst.redraw();
    document.querySelectorAll('.theme-mode button').forEach((b) => b.classList.toggle('on', b.dataset.themeChoice === (C.store.settings.theme || 'auto')));
    const dl = document.getElementById('opt-daylock');
    if (dl) dl.checked = !!C.store.settings.dayLock;
  }
  if (osDark) { const onOs = () => { if ((C.store.settings.theme || 'auto') === 'auto') applyTheme(); }; if (osDark.addEventListener) osDark.addEventListener('change', onOs); else if (osDark.addListener) osDark.addListener(onOs); }
  { const dl = document.getElementById('opt-daylock'); if (dl) dl.addEventListener('change', (e) => { C.store.settings.dayLock = e.target.checked; C.save(); applyTheme(); }); }
  setInterval(applyTheme, 5 * 60 * 1000); // (la 3D relit aussi l'horloge d'elle-même)
  applyTheme(); // avant le premier affichage, pour éviter un flash

  // --------------------------- Événements ---------------------------
  document.querySelectorAll('.play-mode button').forEach((b) => b.addEventListener('click', () => {
    C.store.settings.playMode = b.dataset.playMode;
    C.save();
    renderPlayMode();
    C.sfx.tap();
  }));
  renderPlayMode();
  function stepLevel(d) {
    const L = Math.max(0, Math.min(J.done, selected + d));
    if (L === selected) return;
    C.sfx.tap();
    // le bandeau montre tout de suite le niveau visé ; Ulysse marche jusqu'à la pierre
    selected = L; J.selected = L; C.save(); standing = true; renderPlay();
    if (worldReady && C.world.select) C.world.select(L);
  }
  $('#prev-level').addEventListener('click', () => stepLevel(-1));
  $('#next-level').addEventListener('click', () => stepLevel(1));

  // Le voyage : toutes les pierres déjà atteintes, île par île (étoiles, épreuves) ;
  // toucher une pierre y téléporte Ulysse pour la rejouer.
  // (mêmes noms que ISLAND_NAMES dans world.js : le voyage d'Ulysse, dans l'ordre d'Homère)
  const VOYAGE_ISLANDS = ['Troie', 'Ismaros', 'Cap Malée', 'Les Lotus', 'Les Chèvres', 'Le Cyclope', 'Éolie', 'Ithaque en vue',
    'Lestrygons', 'Circé', 'Les Ombres', 'Elpénor', 'Les Sirènes', 'Roches Errantes', 'Charybde', 'Thrinacie', 'Le Naufrage',
    'Ogygie', 'Le Radeau', 'La Tempête', 'Nausicaa', 'Alcinoos', 'Les Jeux', 'Le Navire', 'Phorkys', 'Eumée', 'Le Palais',
    'L\'Arc', 'Le Lit d\'olivier', 'Laërte',
    // saga 2 : les Douze Travaux d'Héraclès
    'Thèbes', 'Delphes', 'Lion de Némée', 'Hydre de Lerne', 'Biche de Cérynie', 'Le Sanglier', 'Écuries d\'Augias',
    'Le Stymphale', 'Taureau de Crète', 'Juments de Diomède', 'Les Amazones', 'Bœufs de Géryon', 'Les Hespérides',
    'Cerbère', 'L\'Olympe',
    // saga 3 : les Argonautes
    'Iolcos', 'Lemnos', 'Cyzique', 'Mysie', 'Bébrycie', 'Phinée', 'Symplégades', 'Mariandyniens', 'Île d\'Arès',
    'Colchide', 'Taureaux d\'airain', 'Guerriers semés', 'Toison d\'or', 'Médée', 'L\'Istros', 'Chez Circé', 'Orphée',
    'Phéaciens', 'Libye', 'Talos', 'Retour à Iolcos'];
  // emblèmes des sagas (pictos pleins, 24×24) : voile d'Ulysse, massue d'Héraclès, Toison d'or
  function sagaEmblem(kind) {
    const P = {
      ship: '<path d="M12 2.5v12h7.5zM10.5 5.5L4.5 14.5h6z"/><path d="M2.5 16h19l-3.2 4.6H5.7z"/>',
      club: '<circle cx="16" cy="8" r="5"/><circle cx="12.3" cy="11.6" r="2.4"/><path d="M4.2 21.4L2.6 19.8l8.6-9.4 2.4 2.4z"/><circle cx="19.6" cy="4.4" r="1.4"/>',
      fleece: '<path d="M5.2 7.6C5 5.6 7 4.4 8.6 5.4 9.4 3.6 11.8 3.2 13 4.8c1.6-1.2 3.9-.5 4.2 1.4 2 .2 3 2.3 2 3.9 1.2 1.3.5 3.6-1.3 3.9-.3 1.9-2.4 2.8-4 1.8-1.3 1.3-3.6 1.2-4.6-.4-1.8.5-3.6-.7-3.4-2.6C4.3 12.2 3.8 9.3 5.2 7.6z"/><path d="M7.4 14.5l-.6 6M16.6 14.5l.6 6M11 15.5l-.2 4.5M13.2 15.5l.2 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>'
    };
    return '<svg class="saga-emblem" viewBox="0 0 24 24" aria-hidden="true">' + (P[kind] || P.ship) + '</svg>';
  }
  // Changement de monde : carte plein écran (emblème + titre de la saga), ~2,5 s, un toucher la ferme
  function showSagaCard(c) {
    const sg = sagaOf(c);
    let el = $('#saga-card');
    if (!el) {
      el = document.createElement('div');
      el.id = 'saga-card';
      el.className = 'saga-card';
      el.addEventListener('click', () => hideSagaCard());
      document.body.appendChild(el);
    }
    el.dataset.saga = sg.index;
    el.innerHTML = '<div class="sc-inner">' + sagaEmblem(sg.emblem) + '<b>' + sg.name + '</b><i>' + voyageName(c) + '</i></div>';
    el.hidden = false;
    el.classList.remove('out', 'in'); void el.offsetWidth; el.classList.add('in');
    if (C.sfx && C.sfx.star) [0, 1, 2].forEach((i) => setTimeout(() => C.sfx.star(i), 250 + i * 180));
    clearTimeout(showSagaCard.timer);
    showSagaCard.timer = setTimeout(hideSagaCard, 2500);
  }
  function hideSagaCard() {
    const el = $('#saga-card');
    if (!el || el.hidden) return;
    clearTimeout(showSagaCard.timer);
    el.classList.add('out');
    setTimeout(() => { el.hidden = true; el.classList.remove('in', 'out'); }, 320);
  }
  // à l'arrivée sur la première pierre d'une nouvelle saga (une seule fois par saga)
  function maybeSagaCard(L) {
    if (L == null || L !== J.done || L % PER !== 0) return;
    const c = L / PER;
    if (c === 0 || sagaOf(c).first !== c || (J.sagaSeen || 0) >= c) return;
    J.sagaSeen = c;
    C.save();
    showSagaCard(c);
  }
  const voyageName = (c) => VOYAGE_ISLANDS[c % VOYAGE_ISLANDS.length] + (c >= VOYAGE_ISLANDS.length ? ' ' + (Math.floor(c / VOYAGE_ISLANDS.length) + 1) : '');
  function renderVoyage() {
    const box = $('#vy-list');
    const stars = (J.stars) || {};
    const last = Math.floor(J.done / PER);
    let html = '';
    for (let c = last; c >= 0; c--) { // l'île en cours en haut
      let row = '';
      for (let k = 0; k < PER; k++) {
        const L = c * PER + k, info = levelInfo(L), n = stars[L] || 0;
        const st = L < J.done ? 'done' : L === J.done ? 'now' : 'lock';
        row += '<button class="vy-stone ' + st + (info.boss ? ' boss' : '') + (L === selected ? ' here' : '') + '" data-l="' + L + '"' +
          ' style="--game:' + info.accent + '"' + (st === 'lock' ? ' disabled' : '') + '>' +
          (info.boss ? '<svg class="vy-flag" viewBox="0 0 24 24"><path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/></svg>' : '') +
          '<b>' + (L + 1) + '</b>' +
          (st === 'done' ? '<i class="vy-stars">' + [0, 1, 2].map((s) => '<s class="' + (s < n ? 'on' : '') + '"></s>').join('') + '</i>' : '') +
          '</button>';
      }
      // titre de saga au-dessus de ses îles (la liste va de la plus récente à la plus ancienne)
      const sg = sagaOf(c);
      if (c === last || sg.last === c) html += '<h2 class="vy-saga" data-saga="' + sg.index + '">' + sagaEmblem(sg.emblem) + '<span>' + sg.name + '</span></h2>';
      html += '<section class="vy-isle' + (c === last ? ' cur' : '') + '"><h3>' + voyageName(c) + '</h3><div class="vy-row">' + row + '</div></section>';
    }
    box.innerHTML = html;
  }
  function openVoyage() { renderVoyage(); $('#voyage').hidden = false; C.sfx.tap(); }
  $('#go-label').addEventListener('click', openVoyage);
  $('#vy-list').addEventListener('click', (e) => {
    const b = e.target.closest('.vy-stone');
    if (!b || b.disabled) return;
    const L = +b.dataset.l;
    $('#voyage').hidden = true;
    C.sfx.tap();
    if (worldReady && C.world.select) C.world.select(L); // loin : Ulysse est téléporté sur la pierre
    else { selected = L; J.selected = L; C.save(); renderPlay(); }
  });
  $('#voyage').addEventListener('click', (e) => { if (e.target.id === 'voyage') $('#voyage').hidden = true; });
  // toucher la carte (sans glisser) : on masque les menus, il ne reste que la carte du prochain niveau ; re-toucher les ramène
  {
    const w = $('#world');
    let p0 = null;
    w.addEventListener('pointerdown', (e) => { p0 = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    w.addEventListener('pointerup', (e) => {
      if (!p0) return;
      const moved = Math.hypot(e.clientX - p0.x, e.clientY - p0.y), quick = performance.now() - p0.t < 350;
      p0 = null;
      if (!(moved < 8 && quick) || $('#home').hidden) return;
      // Ulysse marche encore : un toucher le fait courir
      if (worldReady && C.world.walking && C.world.walking()) { C.world.hurry(); return; }
      $('#home').classList.toggle('calm');
    });
  }
  // crédits : depuis les réglages
  $('#open-credits').addEventListener('click', () => { $('#credits').hidden = false; C.sfx.tap(); });
  $('#credits').addEventListener('click', (e) => { if (e.target.id === 'credits') $('#credits').hidden = true; });
  $('#cam-mode').addEventListener('click', () => {
    if (!worldReady) return;
    const mode = C.world.setCameraMode(C.world.cameraMode() === 'free' ? 'follow' : 'free');
    const b = $('#cam-mode');
    b.classList.toggle('on', mode === 'free');
    b.setAttribute('aria-pressed', String(mode === 'free'));
    b.setAttribute('aria-label', mode === 'free' ? 'Recentrer sur Ulysse' : 'Caméra libre');
    C.sfx.tap();
  });
  $('#open-library').addEventListener('click', () => { renderLibrary(); $('#library').hidden = false; });
  $('#library').addEventListener('click', (e) => { if (e.target.id === 'library') $('#library').hidden = true; });
  document.querySelectorAll('.lib-mode button').forEach((b) => b.addEventListener('click', () => {
    libMode = b.dataset.mode;
    try { localStorage.setItem('odysseum.libmode', libMode); } catch (e) { /* ignore */ }
    renderLibrary();
  }));
  // badge de niveau → carte du joueur (l'ancienne carte du cerveau n'est plus dessinée)
  $('#open-brain').addEventListener('click', () => { renderProfile(); $('#brain').hidden = false; $('#brain .pc-sheet').scrollTop = 0; C.sfx.tap(); });
  $('#brain').addEventListener('click', (e) => { if (e.target.id === 'brain') $('#brain').hidden = true; });
  $('#pc-name').addEventListener('click', editPlayerName);
  $('#pc-skill-list').addEventListener('click', (e) => { const b = e.target.closest('.pc-skill'); if (b) profileSkill(b.dataset.skill); });
  $('#pc-radar').addEventListener('click', (e) => { const g = e.target.closest('.pc-rd-sk'); if (g) profileSkill(g.dataset.skill); });
  $('#pc-rank').addEventListener('click', openBoard);
  $('#pc-board-back').addEventListener('click', () => { closeBoard(); C.sfx.tap(); });
  $('#pc-board-list').addEventListener('click', (e) => { if (e.target.closest('#pc-board-retry')) loadBoard(); });
  // le cadre change de taille (rotation, panneau du dessous) : la vue se recadre
  // (seulement si l'ancienne carte est affichée : sinon showZone(null) refermerait le panneau de la carte du joueur)
  if (window.ResizeObserver) new ResizeObserver(() => { const old = $('.pc-legacy'); if (!$('#brain').hidden && !(old && old.hidden)) setBrainView(brainView); }).observe($('#brain-svg'));
  // bandeau des niveaux d'un mini-jeu
  $('#levels').addEventListener('click', (e) => {
    if (e.target.id === 'levels') { $('#levels').hidden = true; return; }
    const tab = e.target.closest('#lv-tabs button');
    if (tab) { lv.tier = tab.dataset.tier; renderLevels(true); C.sfx.tap(); return; }
    const fb = e.target.closest('#lv-focus');
    if (fb) { startTier(lv.id, fb.dataset.tier, +fb.dataset.k); return; }
    const b = e.target.closest('.lv');
    if (b && !b.disabled) startTier(lv.id, lv.tier, +b.dataset.k);
  });
  document.querySelectorAll('.theme-mode button').forEach((b) => b.addEventListener('click', () => {
    C.store.settings.theme = b.dataset.themeChoice;
    C.save();
    applyTheme();
  }));
  $('#go').addEventListener('click', () => {
    if ($('#go').classList.contains('ff')) { C.world.skipWalk(); return; } // ⏩ : arrivée immédiate
    if (worldReady && C.world.walking && C.world.walking()) C.world.skipWalk(); // pas besoin d'attendre qu'il arrive
    startLevel(selected);
  });
  $('#back').addEventListener('click', stopPlay);
  $('#btn-undo').addEventListener('click', () => session && session.inst.undo());
  $('#btn-reset').addEventListener('click', () => session && session.inst.reset());
  $('#btn-hint').addEventListener('click', () => session && session.hint(false));
  $('#btn-explain').addEventListener('click', () => session && session.hint(true));
  $('#btn-autosolve').addEventListener('click', () => session && session.solve());
  $('#hint-tip').addEventListener('click', hideTip);
  $('#btn-rules').addEventListener('click', () => session && openTutorial(session.g, session.variant, false));
  $('#rules-close').addEventListener('click', nextTuto);
  // carte du cerveau : toucher une capacité lance le mode focus
  // carte du cerveau : une capacité (bouton ou zone) → zoom sur sa zone ; le bandeau → détail par jeu
  $('#skills').addEventListener('click', (e) => {
    const go = e.target.closest('.skill-go');
    if (go) { concentrate(SKILLS.find((sk) => sk.id === go.dataset.skill)); return; }
    const b = e.target.closest('.skill');
    if (b) { zoomBrain(b.dataset.skill); C.sfx.tap(); }
  });
  $('#brain-back').addEventListener('click', () => zoomBrain(null));
  $('#zone-panel').addEventListener('click', (e) => {
    const gb = e.target.closest('.zp-game');
    if (gb) { openLevels(gb.dataset.game); return; }
    const b = e.target.closest('.zp-go');
    if (b) concentrate(SKILLS.find((sk) => sk.id === b.dataset.skill));
  });
  $('#brain-band').addEventListener('click', () => {
    const d = $('#games-detail');
    d.hidden = !d.hidden;
    $('#brain-band').setAttribute('aria-expanded', String(!d.hidden));
    if (!d.hidden) { renderGamesDetail(); zoomBrain(null); }
  });
  $('#games-detail').addEventListener('click', (e) => {
    const b = e.target.closest('.gd-game');
    if (!b) return;
    $('#games-detail').hidden = true;
    zoomBrain(SKILLS.find((s) => s.games.includes(b.dataset.game)).id);
  });

  // Activer le mode concentration : Ulysse se prend la tête, la caméra plonge, puis la lumière.
  function concentrate(sk) {
    $('#brain').hidden = true;
    if (!worldReady || screens.home.hidden) { startFocus(sk); return; }
    $('#go').hidden = true;
    const accent = ACCENT[sk.games[0]];
    showXp('mode concentration · <b>' + sk.name.toLowerCase() + '</b>', accent);
    C.world.concentrate(accent, () => {
      const fl = $('#flash');
      fl.style.setProperty('--game', accent);
      fl.hidden = true; void fl.offsetWidth; fl.hidden = false;
      setTimeout(() => startFocus(sk), 420);
      setTimeout(() => { fl.hidden = true; }, 1300);
    }, { games: sk.games });
  }

  // Accessibilité : texte agrandi, contraste renforcé, animations réduites, symboles sur les couleurs
  C.store.settings.a11y = C.store.settings.a11y || {};
  function applyA11y() {
    const a = C.store.settings.a11y;
    ['text', 'contrast', 'motion', 'cb'].forEach((k) => document.documentElement.classList.toggle('a11y-' + k, !!a[k]));
    if (worldReady && C.world.setCalm) C.world.setCalm(!!a.motion);
    if (session && session.inst.redraw) session.inst.redraw();
  }
  document.querySelectorAll('.opt-a11y').forEach((box) => {
    box.checked = !!C.store.settings.a11y[box.dataset.a11y];
    box.addEventListener('change', () => { C.store.settings.a11y[box.dataset.a11y] = box.checked; C.save(); applyA11y(); });
  });
  applyA11y();
  $('#rules').addEventListener('click', (e) => { if (e.target.id === 'rules') $('#rules').hidden = true; });
  $('#win-next').addEventListener('click', goHome);
  // « niveau suivant » : retour sur la carte, où l'on voit Ulysse marcher jusqu'à la pierre suivante
  $('#ld-next').addEventListener('click', () => { $('#level-done').hidden = true; goHome(); });
  // rejouer le même niveau (pour aller chercher les 3 étoiles)
  $('#ld-replay').addEventListener('click', () => {
    const i = showLevelDone.last;
    $('#level-done').hidden = true;
    if (!i) { goHome(); return; }
    if (i.daily) startDaily();
    else if (i.mega) startMega(i.steps[0].id, i.mega.k);
    else if (i.event != null) startEvent(i.event);
    else if (i.L >= 0) startLevel(i.L);
    else goHome();
  });
  // « ne plus afficher » : le récapitulatif est passé (on garde juste les étoiles un instant)
  $('#ld-skip').addEventListener('change', (e) => { C.store.settings.skipDone = e.target.checked; C.save(); const o = $('#opt-ldshow'); if (o) o.checked = !e.target.checked; });
  // réglage inverse : « Bilan de fin de niveau » affiché ou non
  { const o = $('#opt-ldshow'); if (o) { o.checked = !C.store.settings.skipDone; o.addEventListener('change', (e) => { C.store.settings.skipDone = !e.target.checked; C.save(); }); } }

  $('#open-settings').addEventListener('click', () => { $('#settings').hidden = false; });

  // ------------------------------ Voyage d'île en île ------------------------------
  // Bouton en bas : survoler les îles déjà atteintes (et apercevoir la suivante), puis revenir à Ulysse.
  let islandView = -1;
  function renderIslandNav() {
    const nav = $('#island-nav');
    const list = worldReady && C.world.islands ? C.world.islands() : null;
    nav.hidden = !list || list.length < 2;
    if (nav.hidden) return;
    const cur = list.findIndex((i) => i.current);
    const at = islandView < 0 ? cur : islandView;
    const isl = list[at] || list[0];
    $('#island-name').innerHTML = (isl.unlocked ? isl.name : '<span class="lock">?</span> Île inconnue') + (islandView >= 0 && at !== cur ? '<small>revenir à Ulysse</small>' : '');
    $('#island-prev').disabled = at <= 0;
    $('#island-next').disabled = at >= list.length - 1 || !list[at].unlocked;
  }
  function goIsland(d) {
    const list = C.world.islands();
    const cur = list.findIndex((i) => i.current);
    const at = Math.max(0, Math.min(list.length - 1, (islandView < 0 ? cur : islandView) + d));
    islandView = at === cur ? -1 : at;
    if (islandView < 0) { if (C.world.viewHero) C.world.viewHero(); else C.world.setCameraMode('follow'); }
    else C.world.viewIsland(at);
    C.sfx.tap();
    renderIslandNav();
  }
  $('#island-prev').addEventListener('click', () => goIsland(-1));
  $('#island-next').addEventListener('click', () => goIsland(1));
  $('#island-name').addEventListener('click', () => {
    if (islandView < 0) return;
    islandView = -1;
    if (C.world.viewHero) C.world.viewHero(); else C.world.setCameraMode('follow');
    renderIslandNav();
  });
  renderIslandNav();
  setInterval(() => { if (!screens.home.hidden) renderIslandNav(); }, 1500); // Ulysse a pu changer d'île

  // ------------------------------ Garde-robe ------------------------------
  // Les choix viennent du monde 3D (World.skinOptions) ; à défaut, une palette grecque de base.
  const SKIN_PARTS = [
    { id: 'tunic', name: 'Tunique' }, { id: 'cape', name: 'Cape' }, { id: 'hair', name: 'Cheveux' },
    { id: 'skin', name: 'Peau' }, { id: 'accessory', name: 'Coiffe' }, { id: 'weapon', name: 'Arme' }
  ];
  const SKIN_FALLBACK = {
    tunic: [{ id: 'egee', name: 'Égée', color: '#2f5f8a' }, { id: 'terre', name: 'Terre cuite', color: '#c0643a' }, { id: 'olive', name: 'Olive', color: '#7d8a3c' }, { id: 'tyr', name: 'Pourpre', color: '#6d2f5f' }, { id: 'lin', name: 'Lin', color: '#efe6d2' }, { id: 'nuit', name: 'Nuit', color: '#23262e' }],
    cape: [{ id: 'blanc', name: 'Blanc', color: '#f4efe4' }, { id: 'or', name: 'Or', color: '#d4a640' }, { id: 'rouge', name: 'Rouge', color: '#a8392f' }, { id: 'egee', name: 'Égée', color: '#3d74a8' }],
    hair: [{ id: 'brun', name: 'Brun', color: '#4a2f22' }, { id: 'noir', name: 'Noir', color: '#1c1a1a' }, { id: 'blond', name: 'Blond', color: '#c9a25a' }, { id: 'roux', name: 'Roux', color: '#9a4a24' }, { id: 'gris', name: 'Gris', color: '#9a9a96' }],
    skin: [{ id: 's1', name: 'Clair', color: '#f2d3bd' }, { id: 's2', name: 'Doré', color: '#d9a982' }, { id: 's3', name: 'Mat', color: '#b98060' }, { id: 's4', name: 'Brun', color: '#8a5a3c' }, { id: 's5', name: 'Ébène', color: '#5a3a28' }],
    accessory: [{ id: 'none', name: 'Aucune' }, { id: 'laurel', name: 'Laurier' }, { id: 'helmet', name: 'Casque' }, { id: 'band', name: 'Bandeau' }],
    weapon: [{ id: 'spear', name: 'Lance' }, { id: 'staff', name: 'Bâton' }, { id: 'bow', name: 'Arc' }, { id: 'none', name: 'Aucune' }]
  };
  let wdPart = 'tunic';
  const skinOptions = () => (worldReady && C.world.skinOptions && C.world.skinOptions()) || SKIN_FALLBACK;
  const skinState = () => (C.store.settings.skin = C.store.settings.skin || {});
  function applySkin() { if (worldReady && C.world.setSkin) C.world.setSkin(Object.assign({}, skinState())); }
  applySkin(); // la tenue choisie est remise au lancement

  // ---------- Atelier du personnage (plein écran) ----------
  // Ordre des onglets (pastilles rondes illustrées) ; les catégories inconnues suivent.
  const CR_ORDER = ['outfit', 'tunic', 'cape', 'hair', 'skin', 'accessory', 'weapon', 'shield'];
  const CR_NAMES = { outfit: 'Tenue', tunic: 'Tunique', cape: 'Cape', hair: 'Cheveux', skin: 'Peau', accessory: 'Coiffe', weapon: 'Arme', shield: 'Bouclier' };
  // petits dessins (viewBox 48) : .o = rempli + contour encre, .l = trait encre ; couleurs fixes
  // pour les objets (bronze, bois, or), couleur du choix pour les tuiles de teinte
  const crLine = (d, col, w) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w + 2.6) + '" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const CR_NONE = '<circle class="none" cx="24" cy="24" r="13"/><path class="none" d="M15 33 33 15"/>';
  const CR_FACE = (c) => '<circle class="o" cx="24" cy="27" r="11" fill="' + c + '"/><circle cx="20" cy="28.5" r="1.4" fill="#3a3550"/><circle cx="28" cy="28.5" r="1.4" fill="#3a3550"/>';
  const CR_HAIR = (c) => '<path class="o" fill="' + c + '" d="M12.6 27c-1.6-10 4-17 11.4-17s13 7 11.4 17c-1.2-3.6-3.4-6.4-5.6-7.2-3.2 2.4-8.4 3.4-13.4 1.8-2 1.6-3.3 3.4-3.8 5.4z"/>';
  const CR_SHIELD_BASE = { chouette: '#b0402f', poulpe: '#b0402f', oeil: '#e9e1cf', soleil: '#2b2f3a' };
  const CR_SWATCH = {
    tunic: (c) => '<path class="o" fill="' + c + '" d="M17 8 9.5 12l3 8 3-1.5V40h17V18.5l3 1.5 3-8L31 8c-1.5 3-4 4.5-7 4.5S18.5 11 17 8z"/><path d="M15.5 26.5h17" stroke="#e0a83a" stroke-width="3"/>',
    cape: (c) => '<path class="o" fill="' + c + '" d="M15 10c5 3 13 3 18 0l5 28c-7 4-21 4-28 0z"/><path d="M21 14.5l-2 23M27 14.5l2 23" stroke="#000" stroke-opacity=".18" stroke-width="2" stroke-linecap="round"/><circle class="o" cx="15" cy="10" r="2.8" fill="#e0a83a"/><circle class="o" cx="33" cy="10" r="2.8" fill="#e0a83a"/>',
    hair: (c) => CR_FACE('#f1cba7') + CR_HAIR(c),
    skin: (c) => '<circle class="o" cx="24" cy="25" r="13" fill="' + c + '"/><circle cx="19.5" cy="23.5" r="1.6" fill="#3a3550"/><circle cx="28.5" cy="23.5" r="1.6" fill="#3a3550"/>' +
      '<ellipse cx="16.5" cy="28.5" rx="2.6" ry="1.6" fill="#ff7eb0" opacity=".45"/><ellipse cx="31.5" cy="28.5" rx="2.6" ry="1.6" fill="#ff7eb0" opacity=".45"/>' +
      '<path d="M20 29.5c2.4 2.6 5.6 2.6 8 0" fill="none" stroke="#3a3550" stroke-width="2" stroke-linecap="round"/>'
  };
  const crLeaves = (side) => [[10.5, 19, -25], [10.6, 26.5, -5], [13.6, 33, 25], [18.6, 37.6, 55]]
    .map(([x, y, a]) => '<ellipse class="o" cx="' + (side < 0 ? x : 48 - x) + '" cy="' + y + '" rx="2.6" ry="4.6" fill="#7bc043" transform="rotate(' + (side < 0 ? a : -a) + ' ' + (side < 0 ? x : 48 - x) + ' ' + y + ')"/>').join('');
  const CR_ITEM = {
    'accessory:laurel': crLine('M24 40C13 38 8 28 11 15', '#5f8f2e', 2.2) + crLine('M24 40c11-2 16-12 13-25', '#5f8f2e', 2.2) + crLeaves(-1) + crLeaves(1),
    'accessory:helmet': '<path class="o" fill="#d94b3d" d="M13 16c2-8 7-12 11-12s9 4 11 12c-3-3-7-4.5-11-4.5S16 13 13 16z"/>' +
      '<path class="o" fill="#e0a83a" d="M12 34c0-14 5-21.5 12-21.5S36 20 36 34v6h-7v-9.5l-2.5-2h-5l-2.5 2V40h-7z"/><path d="M16 25h5.5M26.5 25H32" stroke="#3a3550" stroke-width="2.6" stroke-linecap="round"/>',
    'accessory:band': CR_FACE('#f1cba7') + CR_HAIR('#6f4b2e') + '<path class="o" fill="#d94b3d" d="M12.6 20.6c7-3 15.8-3 22.8 0l-.4 4.6c-7-2.8-15-2.8-22 0z"/>' + crLine('M35.5 22.6l5 5.4M35.5 22.6l6-1.6', '#d94b3d', 2.2),
    'accessory:petasos': '<ellipse class="o" cx="24" cy="31" rx="19" ry="5.6" fill="#c99a5b"/><path class="o" fill="#b5803f" d="M14 30.5c0-9 4.5-14.5 10-14.5s10 5.5 10 14.5c-6 2-14 2-20 0z"/><path d="M14.6 27c6 1.8 12.8 1.8 18.8 0" stroke="#7a4a1f" stroke-width="2.4" fill="none"/>',
    'weapon:spear': crLine('M10 40 33 16', '#a8743f', 3.6) + '<path class="o" fill="#d6dbe2" d="M30.5 13 42 6l-6.6 11.6z"/>',
    'weapon:staff': crLine('M14 42 29 12c1.6-3.6 6.4-3.2 6.2.6', '#a8743f', 4),
    'weapon:bow': crLine('M17 6c16 5 16 31 0 36', '#a8743f', 3.6) + '<path d="M17 6v36" stroke="currentColor" stroke-width="1.6"/>' + crLine('M9 24h27', '#d6dbe2', 1.8) + '<path class="o" fill="#d6dbe2" d="M35 20.5 41 24l-6 3.5z"/><path d="M9 24l-3-3.4M9 24l-3 3.4" stroke="#d94b3d" stroke-width="2.6" stroke-linecap="round"/>',
    'weapon:sword': '<path class="o" fill="#dfe4ea" d="M24 4.5c4 7 4.6 16 2 25.5h-4c-2.6-9.5-2-18.5 2-25.5z"/>' + crLine('M16.5 31h15', '#e0a83a', 3.6) + crLine('M24 33.5v5', '#7a4a1f', 3.6) + '<circle class="o" cx="24" cy="42" r="2.8" fill="#e0a83a"/>',
    'outfit:voyageur': '<path class="l" d="M15.5 20c0-11 17-11 17 0"/><path class="o" fill="#b5803f" d="M11 20h26v15a5 5 0 0 1-5 5H16a5 5 0 0 1-5-5z"/><path class="o" fill="#c99a5b" d="M11 20h26l-3 8.5H14z"/><rect class="o" x="21.5" y="26" width="5" height="5.5" rx="1.2" fill="#e0a83a"/>',
    'outfit:hoplite': crLine('M8 42 40 8', '#a8743f', 3) + '<circle class="o" cx="24" cy="25" r="14" fill="#e0a83a"/><circle cx="24" cy="25" r="10" fill="#c0643c"/><path d="M19.4 31.5 24 18.5l4.6 13" stroke="#ffe3a1" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    'outfit:roi': '<path class="o" fill="#ffc93d" d="M10 34 8 14l9 8 7-12.5 7 12.5 9-8-2 20z"/><path class="o" fill="#e0a83a" d="M10 34h28v5.5H10z"/><circle cx="24" cy="27" r="2.6" fill="#d94b3d"/><circle cx="16" cy="29" r="1.8" fill="#3d8ee8"/><circle cx="32" cy="29" r="1.8" fill="#3d8ee8"/>',
    'outfit:marin': crLine('M24 14.5V40M16.5 20h15M10 29c1 7 7 11 14 11s13-4 14-11', '#3d8ee8', 3) + '<circle class="o" cx="24" cy="10.5" r="3.6" fill="none"/>' + crLine('M7 31.5l3-3.5 3.5 3M41 31.5l-3-3.5-3.5 3', '#3d8ee8', 2.4),
    'outfit:pelerin': crLine('M31 43 34 7', '#a8743f', 3.6) + crLine('M33.6 15C30 17 28 18 26.5 20', '#7a4a1f', 1.8) + '<circle class="o" cx="24" cy="24.5" r="5.2" fill="#d5a03c"/><circle class="o" cx="24" cy="17.8" r="2.2" fill="#d5a03c"/>' +
      '<path class="o" fill="#f4e4c8" d="M9 40c0-6 3-10 7-10s7 4 7 10z"/><path d="M12 39.5l4-8.6 4 8.6M16 31v8.5" stroke="#c99a5b" stroke-width="1.6" fill="none"/>',
    'outfit:hanger': '<path class="l" d="M24 16.5v-2.2a4 4 0 1 0-4-4"/><path class="l" d="M24 16.5 7.5 30.5c-1.6 1.4-.6 4 1.5 4h30c2.1 0 3.1-2.6 1.5-4z"/>'
  };
  function crShield(m) {
    const base = '<circle class="o" cx="24" cy="24" r="17" fill="#e0b450"/><circle cx="24" cy="24" r="13.2" fill="' + (CR_SHIELD_BASE[m] || '#b0402f') + '"/>';
    const ink = '#1e1b19';
    if (m === 'chouette') return base + '<ellipse cx="24" cy="27.5" rx="6.6" ry="7.6" fill="' + ink + '"/><circle cx="21" cy="21.5" r="3" fill="#efe4c8"/><circle cx="27" cy="21.5" r="3" fill="#efe4c8"/><circle cx="21" cy="21.5" r="1.3" fill="' + ink + '"/><circle cx="27" cy="21.5" r="1.3" fill="' + ink + '"/>';
    if (m === 'poulpe') return base + '<ellipse cx="24" cy="19.5" rx="5" ry="5.6" fill="' + ink + '"/><path d="M20 23.5c-3 4-6 5-7 8M22.5 24.5c-1 4-2 6-3 9M25.5 24.5c1 4 2 6 3 9M28 23.5c3 4 6 5 7 8" stroke="' + ink + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    if (m === 'oeil') return base + '<path d="M13.5 24c6-7 15-7 21 0-6 7-15 7-21 0z" fill="#fff" stroke="' + ink + '" stroke-width="2"/><circle cx="24" cy="24" r="4" fill="#2f6f9f"/><circle cx="24" cy="24" r="1.8" fill="' + ink + '"/>';
    if (m === 'soleil') {
      let r = '';
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); r += 'M' + (24 + c * 7.4).toFixed(1) + ' ' + (24 + s * 7.4).toFixed(1) + 'L' + (24 + c * 10.6).toFixed(1) + ' ' + (24 + s * 10.6).toFixed(1); }
      return base + '<path d="' + r + '" stroke="#ffc93d" stroke-width="2.4" stroke-linecap="round"/><circle cx="24" cy="24" r="5" fill="#ffc93d"/>';
    }
    return base;
  }
  // dessin d'un choix (tuile) : teinte → silhouette colorée ; objet → petite illustration
  function crArt(cat, o) {
    if (o.id === 'none') return CR_NONE;
    if (o.color) return (CR_SWATCH[cat] || ((c) => '<circle class="o" cx="24" cy="24" r="15" fill="' + c + '"/>'))(o.color);
    if (cat === 'shield') return crShield(o.id);
    return CR_ITEM[cat + ':' + o.id] || '<circle class="o" cx="24" cy="24" r="12" fill="#e0a83a"/><text x="24" y="29" text-anchor="middle" font-size="14" font-weight="700" fill="#3a3550">' + (o.name || '?').charAt(0) + '</text>';
  }
  // dessin d'un onglet : la teinte portée (tunique, cape…) ou un objet représentatif
  function crTabArt(cat, opts, cur) {
    if (CR_SWATCH[cat]) {
      const list = opts[cat] || [];
      const o = list.find((x) => x.id === cur[cat] && x.color) || list.find((x) => x.color);
      return CR_SWATCH[cat](o ? o.color : '#c9c2dc');
    }
    if (cat === 'shield') return crShield('chouette');
    return CR_ITEM[{ outfit: 'outfit:hanger', accessory: 'accessory:laurel', weapon: 'weapon:sword' }[cat]] || crArt(cat, (opts[cat] || [{}])[0]);
  }
  const crSvg = (inner) => '<svg class="cr-ico" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
  const CR_CHECK = '<i class="cr-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg></i>';
  // tenue complète en cours : réglages enregistrés, complétés par l'état du monde 3D
  const crCurrent = () => Object.assign({}, (worldReady && C.world.getSkin && C.world.getSkin()) || {}, skinState());
  const crParts = (opts) => Object.keys(opts).filter((k) => Array.isArray(opts[k]) && opts[k].length)
    .sort((a, b) => (CR_ORDER.indexOf(a) + 1 || 99) - (CR_ORDER.indexOf(b) + 1 || 99));
  const crName = (k, opts) => CR_NAMES[k] || (worldReady && C.world.skinLabels && C.world.skinLabels()[k]) || (SKIN_PARTS.find((p) => p.id === k) || {}).name || k;
  let crHistory = [], crLabelT = 0;
  function renderWardrobe(animate) {
    const opts = skinOptions(), cur = crCurrent();
    const parts = crParts(opts);
    if (!parts.includes(wdPart) && parts.length) wdPart = parts[0];
    const tabs = $('#wd-tabs');
    tabs.style.setProperty('--n', parts.length);
    tabs.innerHTML = parts.map((k) => '<button class="cr-tab' + (k === wdPart ? ' on' : '') + '" role="tab" aria-selected="' + (k === wdPart) + '" data-part="' + k + '" aria-label="' + crName(k, opts) + '" title="' + crName(k, opts) + '">' + crSvg(crTabArt(k, opts, cur)) + '</button>').join('');
    const list = opts[wdPart] || [];
    const sel = cur[wdPart] || (list[0] && list[0].id);
    const grid = $('#wd-choices');
    grid.setAttribute('aria-label', crName(wdPart, opts));
    grid.innerHTML = list.map((o, k) => '<button class="cr-tile' + (o.id === sel ? ' on' : '') + '" role="option" aria-selected="' + (o.id === sel) + '" data-id="' + o.id + '" title="' + o.name + '" style="--k:' + (animate ? k : 0) + (animate ? '' : ';animation:none') + '">' +
      '<span class="cr-art">' + crSvg(crArt(wdPart, o)) + CR_CHECK + '</span><span class="cr-name">' + o.name + '</span></button>').join('');
    $('#cr-undo').disabled = !crHistory.length;
  }
  // pastille du choix courant (catégorie · nom), s'efface seule
  function crShowLabel(cat, id) {
    const opts = skinOptions(), o = (opts[cat] || []).find((x) => x.id === id);
    const el = $('#cr-label');
    el.textContent = crName(cat, opts) + ' · ' + (o ? o.name : id);
    el.classList.add('show');
    clearTimeout(crLabelT);
    crLabelT = setTimeout(() => el.classList.remove('show'), 1600);
  }
  // applique une tenue complète (mémorisée) et met l'atelier à jour
  function crApply(next, keepHistory) {
    if (!keepHistory) { crHistory.push(crCurrent()); if (crHistory.length > 40) crHistory.shift(); }
    const st = skinState();
    Object.keys(next).forEach((k) => { st[k] = next[k]; });
    C.save(); applySkin(); renderWardrobe(false);
  }
  // cadrage : Ulysse en pied au-dessus du panneau, sous les boutons du haut
  function crFrame() {
    const ov = $('#wardrobe'), H = ov.clientHeight || window.innerHeight;
    const panel = ov.querySelector('.cr-panel'), top = ov.querySelector('.cr-top');
    return { area: 'top', fullBody: true, frac: Math.max(0.3, Math.min(0.85, panel.offsetTop / H)), pad: Math.min(0.2, (top.offsetTop + top.offsetHeight + 4) / H) };
  }
  function crShowcase() {
    const on = !$('#wardrobe').hidden;
    document.documentElement.classList.toggle('creator-open', on); // (masque l'interface de la carte)
    if (!worldReady || !C.world.showcase) return;
    C.world.showcase(on, on ? crFrame() : undefined);
  }
  $('#open-wardrobe').addEventListener('click', () => {
    if (worldReady && C.world.setCameraMode) C.world.setCameraMode('follow'); // on voit Ulysse pendant l'essayage
    crHistory = [];
    applySkin(); // (le héros porte bien la tenue enregistrée)
    $('#wardrobe').classList.remove('spun');
    $('#cr-label').classList.remove('show');
    renderWardrobe(true);
    $('#wardrobe').hidden = false;
    C.sfx.tap();
  });
  // pendant l'essayage, la caméra montre Ulysse en pied dans le haut de l'écran ; quelle que soit
  // la façon de refermer l'atelier (bouton, Échap, retour Android), la caméra de suivi reprend
  if (window.MutationObserver) new MutationObserver(crShowcase).observe($('#wardrobe'), { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', () => { if (!$('#wardrobe').hidden) crShowcase(); });
  $('#wardrobe').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'wd-done' || btn.id === 'cr-close') { $('#wardrobe').hidden = true; C.sfx.tap(); return; }
    if (btn.id === 'cr-undo') {
      const prev = crHistory.pop();
      if (prev) { crApply(prev, true); C.sfx.tap(); }
      return;
    }
    if (btn.id === 'cr-random') {
      // une tenue au hasard (différente de l'actuelle dans chaque catégorie quand c'est possible)
      const opts = skinOptions(), cur = crCurrent(), next = {};
      crParts(opts).forEach((k) => {
        const pool = opts[k].filter((o) => o.id !== cur[k]);
        const o = (pool.length ? pool : opts[k])[Math.floor(Math.random() * (pool.length || opts[k].length))];
        next[k] = o.id;
      });
      crApply(next);
      btn.classList.remove('roll'); void btn.offsetWidth; btn.classList.add('roll');
      if (worldReady && C.world.cheerHero) C.world.cheerHero();
      C.sfx.place();
      return;
    }
    if (btn.id === 'cr-cheer') {
      if (worldReady && C.world.cheerHero) C.world.cheerHero();
      btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
      C.sfx.tap();
      return;
    }
    if (btn.classList.contains('cr-tab')) {
      if (btn.dataset.part === wdPart) return;
      wdPart = btn.dataset.part; renderWardrobe(true); $('#wd-choices').scrollTop = 0; C.sfx.tap();
      return;
    }
    if (btn.classList.contains('cr-tile')) {
      const id = btn.dataset.id;
      if (crCurrent()[wdPart] === id) { crShowLabel(wdPart, id); return; }
      crApply({ [wdPart]: id });
      crShowLabel(wdPart, id);
      C.sfx.place();
    }
  });
  // un doigt glissé sur la scène fait tourner Ulysse (avec élan au lâcher)
  (() => {
    const stage = $('#cr-stage');
    let drag = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || drag) return;
      drag = { id: e.pointerId, x: e.clientX, t: performance.now(), v: 0 };
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
      stage.classList.add('grab');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now(), dx = e.clientX - drag.x, dt = Math.max(1, now - drag.t);
      const k = 5.4 / Math.max(280, stage.clientWidth); // (≈ un tour pour une largeur d'écran)
      if (worldReady && C.world.spinHero) C.world.spinHero(dx * k);
      // vitesse lissée (rad/s) pour l'élan
      drag.v = drag.v * 0.6 + (dx * k / dt * 1000) * 0.4;
      drag.x = e.clientX; drag.t = now;
      if (Math.abs(dx) > 2) $('#wardrobe').classList.add('spun');
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const idle = performance.now() - drag.t > 90; // doigt immobile avant le lâcher : pas d'élan
      if (worldReady && C.world.spinHero) C.world.spinHero(0, idle ? 0 : drag.v);
      drag = null;
      stage.classList.remove('grab');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  })();
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });
  $('#opt-sound').addEventListener('change', (e) => { C.audio.setSound(e.target.checked); C.sfx.tap(); });
  $('#opt-music').addEventListener('change', (e) => C.audio.setMusic(e.target.checked));
  $('#opt-vibrate').addEventListener('change', (e) => { C.store.settings.vibrate = e.target.checked; C.save(); });
  $('#opt-mix').addEventListener('input', (e) => C.audio.setMix(+e.target.value));
  $('#opt-mix').addEventListener('change', () => C.sfx.tap());
  $('#opt-sound').checked = !!C.store.settings.sound;
  $('#opt-music').checked = !!C.store.settings.music;
  $('#opt-vibrate').checked = !!C.store.settings.vibrate;
  $('#opt-mix').value = C.store.settings.mix;

  // ------------------------------ Premier lancement ------------------------------
  // Une seule fois (C.store.onboarded) : carte « Bienvenue » (nom du joueur), atelier du héros en mode
  // accueil, puis une courte visite guidée à projecteur (voile + découpe arrondie qui suit les vrais boutons).
  // Les joueurs déjà avancés (journey.done > 0) n'y ont pas droit, sauf via « Revoir le tutoriel » (réglages).
  // Tout le DOM est créé ici et retiré en entier à la fin : rien ne reste pour gêner les touchers.
  // Styles : css/onboarding.css.
  const OB = { on: false, creator: false, tour: null, doneTxt: '' };
  const obReduced = () => document.documentElement.classList.contains('a11y-motion') ||
    !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const obNeeded = () => !C.store.onboarded && !((J.done || 0) > 0);
  const obClamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // rectangle visible d'un élément (ou de plusieurs : leur union) ; null si rien n'est à l'écran
  function obRect(el) {
    const list = (Array.isArray(el) ? el : [el]).filter(Boolean);
    let r = null;
    list.forEach((e) => {
      if (e.hidden || e.closest('[hidden]')) return;
      const b = e.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || getComputedStyle(e).visibility === 'hidden') return;
      r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) }
        : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    if (r) { r.width = r.right - r.left; r.height = r.bottom - r.top; }
    return r;
  }
  function obDone() { if (!C.store.onboarded) { C.store.onboarded = true; C.save(); } }
  function startOnboarding() {
    if (OB.on) return;
    OB.on = true;
    obWelcome();
  }
  // petit navire d'Ulysse (même esprit que l'icône) pour la carte d'accueil
  const OB_SHIP = '<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="42" r="36" fill="var(--k-lagoon)" opacity=".28"/>' +
    '<path d="M40 12v40" stroke="#3a3550" stroke-width="3.4" stroke-linecap="round"/><path d="M40 12l11 3.4L40 19z" fill="var(--k-coral)" stroke="#3a3550" stroke-width="2.4" stroke-linejoin="round"/>' +
    '<path d="M25 23q15-3 30 0 5 13-1 25-14 3-28 0-6-12-1-25z" fill="#fffaf0" stroke="#3a3550" stroke-width="3" stroke-linejoin="round"/>' +
    '<path d="M36.5 21.6h7v27.6h-7z" fill="#d94b3d" opacity=".9"/>' +
    '<path d="M16 52h48c-2 9-9 14-18 14H34c-9 0-16-5-18-14z" fill="#c0643a" stroke="#3a3550" stroke-width="3" stroke-linejoin="round"/>' +
    '<circle cx="56" cy="57" r="2" fill="#3a3550"/></svg>';
  // 1. carte « Bienvenue, voyageur ! » : le nom (1 à 16 caractères), puis l'atelier
  function obWelcome() {
    const ov = document.createElement('div');
    ov.className = 'ob-welcome';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'ob-hello');
    ov.innerHTML = '<form class="ob-card" novalidate><span class="ob-crest">' + OB_SHIP + '</span>' +
      '<h2 id="ob-hello" class="ob-hello">Bienvenue, voyageur !</h2>' +
      '<label class="ob-field"><span>Ton nom</span><input id="ob-name" maxlength="16" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="go"></label>' +
      '<button class="ob-go" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2 8.8-9.4"/></svg>Créer mon héros</button></form>';
    document.body.appendChild(ov);
    const inp = ov.querySelector('#ob-name'), go = ov.querySelector('.ob-go');
    const clean = () => inp.value.replace(/[<>]/g, '').trim().slice(0, 16);
    inp.value = playerName();
    const sync = () => { go.disabled = !clean(); };
    inp.addEventListener('input', sync); sync();
    ov.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = clean();
      if (!name) { inp.focus(); return; }
      if (name !== String(profileOf().name || '')) { profileOf().name = name; C.save(); }
      inp.blur();
      C.sfx.tap();
      ov.classList.add('out');
      setTimeout(() => { ov.remove(); obCreator(); }, obReduced() ? 0 : 240);
    });
  }
  // 2. l'atelier du personnage, en mode accueil : titre « Ton héros », dé mis en avant, « C'est parti ! »
  function obCreator() {
    const wd = $('#wardrobe'), done = $('#wd-done'), gap = wd.querySelector('.cr-top .cr-gap');
    OB.creator = true;
    $('#open-wardrobe').click(); // même ouverture que le bouton Tenue (caméra, tenue, rendu)
    wd.classList.add('ob-mode'); wd.classList.remove('ob-rolled');
    if (gap) gap.innerHTML = '<span class="ob-cr-title">Ton héros</span>';
    const t = done.lastChild;
    if (t && t.nodeType === 3) { OB.doneTxt = t.textContent; t.textContent = 'C\'est parti !'; }
  }
  // fin de l'atelier (bouton, retour, Échap…) : on remet l'atelier normal et la visite commence
  function obCreatorDone() {
    const wd = $('#wardrobe'), done = $('#wd-done'), gap = wd.querySelector('.cr-top .cr-gap');
    OB.creator = false;
    wd.classList.remove('ob-mode', 'ob-rolled');
    if (gap) gap.innerHTML = '';
    const t = done.lastChild;
    if (OB.doneTxt && t && t.nodeType === 3) t.textContent = OB.doneTxt;
    setTimeout(obTour, obReduced() ? 250 : 650); // (la caméra revient vers Ulysse)
  }
  $('#cr-random').addEventListener('click', () => $('#wardrobe').classList.add('ob-rolled'));
  if (window.MutationObserver) new MutationObserver(() => { if (OB.creator && $('#wardrobe').hidden) obCreatorDone(); }).observe($('#wardrobe'), { attributes: true, attributeFilter: ['hidden'] });

  // 3. visite guidée : une bulle par élément, « Passer » / « Suivant », points d'étape
  const OB_STEPS = [
    { el: () => $('#lvcard'), txt: 'Voici ton prochain niveau : ses <span class="ob-nw">mini-jeux</span> et tes étoiles.' },
    { el: () => { const n = Array.from(document.querySelectorAll('#lvcard .lc-nav')).filter((x) => !x.hidden); return n.length ? n : $('#lvcard .lc-title'); },
      txt: 'Navigue entre les niveaux déjà atteints.', pad: 6 },
    { el: () => $('#go'), txt: 'Lance le niveau !', pad: 6 },
    { el: () => ['#open-daily', '#open-wardrobe', '#cam-mode', '#open-library'].map((s) => $(s)), txt: 'Tes raccourcis :',
      extra: '<ul class="ob-tabs"><li><b>Défi</b>un défi chaque jour</li><li><b>Tenue</b>change de look</li><li><b>Vue</b>explore l\'île</li><li><b>Jeux</b>mini-jeux et paliers</li></ul>' },
    { el: () => $('#open-brain'), txt: 'Ta carte de joueur et le classement.' }
  ];
  function obTour() {
    let tries = 0;
    const begin = () => {
      if (!OB.on || OB.tour) return;
      // on attend que le bouton Jouer soit posé (Ulysse sur sa pierre, interface de la carte visible)
      if (!obRect($('#go')) && tries++ < 40) { setTimeout(begin, 100); return; }
      const steps = OB_STEPS.filter((s) => obRect(s.el()));
      const ov = document.createElement('div');
      ov.className = 'ob-tour first';
      ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Visite guidée');
      ov.innerHTML = '<i class="ob-hole" aria-hidden="true"></i><div class="ob-tip"><div class="ob-body" aria-live="polite"></div>' +
        '<div class="ob-foot"><span class="ob-dots" aria-hidden="true">' + steps.map(() => '<i></i>').join('') + '</span>' +
        '<button type="button" class="ob-skip">Passer</button><button type="button" class="ob-next">Suivant</button></div></div>';
      document.body.appendChild(ov);
      const T = OB.tour = { ov, steps, i: -1, key: '', raf: 0, timer: 0, ending: false,
        hole: ov.querySelector('.ob-hole'), tip: ov.querySelector('.ob-tip'), body: ov.querySelector('.ob-body'), next: ov.querySelector('.ob-next') };
      ov.addEventListener('click', (e) => {
        if (T.ending) { obClose(); return; }
        if (e.target.closest('.ob-skip')) { C.sfx.tap(); obClose(); return; }
        if (e.target.closest('.ob-next') || !e.target.closest('.ob-tip')) obNext(); // toucher le voile = suivant
      });
      if (!steps.length) { obEnd(); return; }
      obShow(0);
      const tick = () => { if (OB.tour !== T) return; obPlace(); T.raf = requestAnimationFrame(tick); };
      T.raf = requestAnimationFrame(tick);
      requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.remove('first')));
    };
    begin();
  }
  function obShow(i) {
    const T = OB.tour, s = T.steps[i];
    T.i = i;
    T.body.innerHTML = '<p class="ob-txt">' + s.txt + '</p>' + (s.extra || '');
    T.ov.querySelectorAll('.ob-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    T.next.textContent = i === T.steps.length - 1 ? 'Terminer' : 'Suivant';
    T.tip.classList.remove('ob-tip-in'); void T.tip.offsetWidth; T.tip.classList.add('ob-tip-in');
    T.key = '';
    obPlace();
    try { T.next.focus({ preventScroll: true }); } catch (e) { /* rien */ }
  }
  function obNext() {
    const T = OB.tour;
    if (!T || T.ending) return;
    C.sfx.tap();
    if (T.i < T.steps.length - 1) obShow(T.i + 1); else obEnd();
  }
  // place la découpe sur la cible et la bulle au-dessus (ou en dessous), dans les zones sûres ;
  // appelé à chaque image : la découpe suit la cible (rotation, clavier, animation des boutons…)
  function obPlace() {
    const T = OB.tour;
    if (!T || T.ending || T.i < 0) return;
    const s = T.steps[T.i], r = obRect(s.el());
    if (!r) return; // cible momentanément cachée : on garde la dernière position
    const W = window.innerWidth, H = window.innerHeight, p = s.pad == null ? 8 : s.pad;
    const x = r.left - p, y = r.top - p, w = r.width + 2 * p, h = r.height + 2 * p;
    const tw = T.tip.offsetWidth, th = T.tip.offsetHeight;
    const key = [x, y, w, h, W, H, tw, th].map(Math.round).join();
    if (key === T.key) return;
    T.key = key;
    const hs = T.hole.style;
    hs.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    hs.width = w.toFixed(1) + 'px'; hs.height = h.toFixed(1) + 'px';
    hs.borderRadius = Math.min(26, Math.min(w, h) / 2).toFixed(1) + 'px';
    const cs = getComputedStyle(T.ov), m = 12, gap = 16;
    const sa = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    const roomAbove = y - sa.t - m, roomBelow = H - sa.b - m - (y + h);
    const above = roomAbove >= th + gap || roomAbove > roomBelow;
    const ty = obClamp(above ? y - gap - th : y + h + gap, sa.t + m, Math.max(sa.t + m, H - sa.b - m - th));
    const cx = x + w / 2, tx = obClamp(cx - tw / 2, sa.l + m, Math.max(sa.l + m, W - sa.r - m - tw));
    T.tip.style.left = tx.toFixed(1) + 'px'; T.tip.style.top = ty.toFixed(1) + 'px';
    T.tip.classList.toggle('above', above); T.tip.classList.toggle('below', !above);
    T.tip.style.setProperty('--ax', obClamp(cx - tx, 26, tw - 26).toFixed(1) + 'px');
  }
  // fin : « Bon voyage ! » et une petite gerbe de confettis, puis tout disparaît
  function obEnd() {
    const T = OB.tour;
    if (!T || T.ending) return;
    T.ending = true;
    obDone();
    T.ov.classList.add('end');
    T.tip.remove();
    const cols = ['var(--k-sun)', 'var(--k-coral)', 'var(--k-sea)', 'var(--k-grass)', 'var(--k-lagoon)', 'var(--k-roof)'];
    const conf = document.createElement('div');
    conf.className = 'ob-confetti'; conf.setAttribute('aria-hidden', 'true');
    let bits = '';
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + Math.random() * 0.3, d = 110 + Math.random() * 70;
      bits += '<i style="--c:' + cols[k % cols.length] + ';--x:' + (Math.cos(a) * d).toFixed(0) + 'px;--y:' + (Math.sin(a) * d * 0.8 - 30).toFixed(0) + 'px;--r:' +
        Math.round(Math.random() * 540 - 270) + 'deg;--d:' + (Math.random() * 0.12).toFixed(2) + 's"></i>';
    }
    conf.innerHTML = bits;
    const bye = document.createElement('div');
    bye.className = 'ob-bye ob-bye-in'; bye.setAttribute('role', 'status');
    bye.innerHTML = '<b>Bon voyage !</b>';
    T.ov.append(conf, bye);
    C.sfx.win();
    T.timer = setTimeout(obClose, 2200);
  }
  // retire tout (voile, bulle, écouteurs) : les touchers retrouvent la carte aussitôt
  function obClose() {
    const T = OB.tour;
    obDone();
    OB.on = false; OB.tour = null;
    if (!T) return;
    cancelAnimationFrame(T.raf); clearTimeout(T.timer);
    T.ov.classList.add('out');
    setTimeout(() => T.ov.remove(), obReduced() ? 0 : 300);
  }
  document.addEventListener('keydown', (e) => {
    if (!OB.tour) return;
    if (e.key === 'Escape') obClose();
    else if (e.key === 'ArrowRight') obNext();
  });
  document.addEventListener('backbutton', () => { if (OB.tour) obClose(); });
  // réglages : « Revoir le tutoriel » (pour tout le monde, même les joueurs avancés)
  {
    const b = document.createElement('button');
    b.id = 'replay-tour'; b.className = 'credits-btn ob-replay';
    b.innerHTML = '<svg class="ic" viewBox="0 0 256 256" aria-hidden="true"><use href="assets/ui/icons.svg#i-compass"/></svg>Revoir le tutoriel';
    b.addEventListener('click', () => { $('#settings').hidden = true; C.sfx.tap(); setTimeout(startOnboarding, 200); });
    const cr = $('#open-credits');
    if (cr) cr.before(b); else $('#settings .sheet').appendChild(b);
  }
  // sans écran d'intro (cas de secours), l'accueil démarre seul ; sinon embark() s'en charge
  if (!$('#intro') && obNeeded()) setTimeout(startOnboarding, 800);

  // Intro : un toucher pour embarquer (lance la musique), l'écran s'ouvre, la caméra plonge vers Ulysse.
  const intro = $('#intro');
  function embark() {
    if (!intro || intro.classList.contains('leaving')) return;
    C.audio.unlock();
    C.sfx.win(); // un petit accord de départ
    intro.classList.add('leaving');
    if (worldReady && C.world.swoop) C.world.swoop();
    setTimeout(() => { intro.remove(); if (obNeeded()) startOnboarding(); }, 1500); // premier lancement : accueil
  }
  if (intro) {
    // le voilier traverse l'écran jusqu'à droite : quand il sort, le voyage commence.
    // Premier toucher : il hisse les voiles et accélère ; second toucher : on embarque tout de suite.
    const boat = intro.querySelector('.intro-boat');
    let x = -40, speed = 1, target = 1, last = performance.now(), taps = 0;
    const t0 = last;
    const sail = (now) => {
      if (!intro.isConnected || intro.classList.contains('leaving')) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      speed += (target - speed) * Math.min(1, dt * 2.5); // accélération douce
      if (now - t0 > 600) x += 64 * speed * dt;
      const y = 179 + Math.sin(now / 650) * 1.6, rot = Math.sin(now / 900) * 2 - (speed - 1) * 0.8;
      boat.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ')');
      if (x > 400) embark(); else requestAnimationFrame(sail);
    };
    if (boat) requestAnimationFrame(sail);
    const tap = () => {
      C.audio.unlock();
      taps++;
      if (taps === 1 && boat) { target = 6; intro.classList.add('hurry'); C.sfx.tap(); } else embark();
    };
    intro.addEventListener('click', tap);
    intro.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') tap(); });
    intro.focus();
  }

  // Les navigateurs n'autorisent le son qu'après un premier geste.
  document.addEventListener('pointerdown', () => C.audio.unlock(), { once: true });
  // chaque feuille a sa croix de fermeture (en plus du toucher sur le fond) ; le bouton retour Android ferme d'abord la feuille ouverte
  const SHEETS = ['library', 'levels', 'brain', 'settings', 'wardrobe', 'rules', 'voyage', 'credits'];
  SHEETS.forEach((id) => {
    const ov = document.getElementById(id), sheet = ov && ov.querySelector('.sheet');
    if (!sheet || sheet.querySelector('.sheet-close')) return;
    const x = document.createElement('button');
    x.className = 'sheet-close';
    x.setAttribute('aria-label', 'Fermer');
    x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
    x.addEventListener('click', (e) => { e.stopPropagation(); ov.hidden = true; C.sfx.tap(); });
    sheet.prepend(x);
  });
  const openSheet = () => SHEETS.map((id) => document.getElementById(id)).filter((o) => o && !o.hidden).pop();
  document.addEventListener('backbutton', () => {
    const o = openSheet();
    if (o) { o.hidden = true; return; }
    if (!screens.play.hidden) goHome();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const o = openSheet(); if (o) o.hidden = true; } });

  // exposé pour les tests
  window.Odysseum = { levelInfo, journey: J, eventInfo, eventList, startEvent,
    session: () => session, targetTime, starsFor, dailyInfo, startDaily, renderDaily, dailyStreak, refreshStars, startLevel, startTier, openLevels,
    startMega, megaParams, megaN, megaTrack: MEGA_TRACK, megaRec, zoom: Z, zoomTo };
  $('#open-daily').addEventListener('click', startDaily);

  // appli installée depuis Chrome : toujours à jour (voir sw.js) ; inutile dans l'APK
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sans mise en cache, le jeu marche quand même */ });
  }

  initWorld();
  refreshEvents();
  refreshStars(false);
  renderDaily();
  setInterval(() => { if (!screens.home.hidden) renderDaily(); }, 60 * 1000); // minuit passé : nouveau défi
  applyTheme();
  applyA11y();
  show('home');
  renderPlay();
  renderBadge();
  if (worldReady) C.world.start();
})();
