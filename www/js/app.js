// Odysseum — coquille de l'application : le sentier, les niveaux, les boss, la partie.
// Volontairement silencieuse : pas de chrono, pas de compteur affiché.
(function () {
  'use strict';
  const C = window.Carnet;
  const $ = (sel) => document.querySelector(sel);

  // Teintes douces propres à chaque jeu.
  const ACCENT = {
    flux: '#5f9fd8', reines: '#e8887a', astres: '#eeb043', paves: '#5fb8a5',
    pixels: '#9b84e0', serpent: '#4fb5a6', lumieres: '#efbd45', coffre: '#7f95c4'
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
    coffre: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 4v3M4 12h1.5M18.5 12H20"/>'
  };
  const icon = (id) => '<svg viewBox="0 0 24 24">' + ICON[id] + '</svg>';
  const TOOL_ICON = {
    fill: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" class="f"/></svg>',
    cross: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>'
  };

  const game = (id) => C.games.find((g) => g.id === id);
  const variantsOf = (g) => g.variants || [{ id: 'classic', name: 'Classique' }];
  const rulesOf = (g, v) => (Array.isArray(g.rules) ? g.rules : g.rules[v] || g.rules.classic);
  const dataKey = (g, v) => (v === 'classic' ? g.id : g.id + ':' + v);

  // ------------------------------------------------------------------
  // La quête principale :
  // - Chaque monde (île) ajoute des mini-jeux : 3 au premier, puis 5, 6, et les 8 au 4e monde.
  // - Un niveau = une petite série de 2 à 3 mini-jeux enchaînés (2 au tout début).
  // - Les nouveaux jeux d'un monde ouvrent ses premiers niveaux (avec leur tutoriel).
  // - La difficulté monte d'île en île et au fil de chaque île.
  // - Le dernier niveau de chaque île est un boss : 4, puis 5 grilles d'affilée, plus
  //   difficiles, mêlant les capacités, de plus en plus souvent en variante.
  // ------------------------------------------------------------------
  const PER = 10;
  const ORDER = ['flux', 'reines', 'astres', 'paves', 'pixels', 'serpent', 'lumieres', 'coffre'];
  const POOL_SIZE = [3, 5, 6, 8]; // jeux disponibles dans les mondes 1, 2, 3, 4 et suivants
  const poolOf = (c) => ORDER.slice(0, POOL_SIZE[Math.min(c, POOL_SIZE.length - 1)]);

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
      return g.variants && g.variants[1] && known && rng() < chance ? g.variants[1].id : 'classic';
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
    // montée très progressive : +3 par monde, +1 tous les 2 niveaux ; le boss un cran au-dessus
    const level = boss ? 1 + c * 3 + 6 + c : 1 + c * 3 + Math.floor(k * 0.5);
    const vChance = boss ? Math.min(0.7, 0.25 + c * 0.1) : Math.min(0.55, 0.12 + c * 0.08);
    const steps = ids.map((id, i) => ({ id, variant: pickVariant(id, vChance), level: level + (boss ? 0 : i) }));
    return { L, c, k, boss, id: steps[0].id, accent: ACCENT[steps[0].id], steps };
  }

  const J = (C.store.journey = C.store.journey || { done: 0, selected: 0 });
  let selected = Math.min(J.selected || 0, J.done);
  let standing = true; // le voyageur est sur une pierre (sinon il se promène)
  let worldReady = false;

  function initWorld() {
    worldReady = !!(C.world && C.world.init($('#world'), {
      done: J.done,
      selected,
      levelInfo,
      iconSvg: (id) => ICON[id],
      onSelect: (L) => {
        standing = L != null;
        if (standing) { selected = L; J.selected = L; C.save(); }
        renderPlay();
      }
    }));
  }

  // Le bouton unique de l'accueil montre le mini-jeu qui attend sur la pierre choisie.
  function renderPlay() {
    const b = $('#go');
    const info = levelInfo(selected);
    b.hidden = worldReady && !standing;
    b.style.setProperty('--game', info.accent);
    b.classList.toggle('boss', info.boss);
    b.classList.toggle('replay', selected < J.done);
    b.innerHTML = icon(info.id);
    b.setAttribute('aria-label', 'Jouer');
    b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
  }

  // ----------------------------- Partie -----------------------------
  let session = null;

  function startLevel(L) {
    const info = levelInfo(L);
    playStep(info, 0);
  }

  function playStep(info, stepIndex) {
    if (session) session.stop();
    const step = info.steps[stepIndex];
    const g = game(step.id);
    const variant = step.variant;

    if (worldReady) C.world.stop();
    show('play');
    $('#play').style.setProperty('--game', ACCENT[g.id]);
    $('#play').classList.remove('done');
    $('#play-icon').innerHTML = icon(g.id);
    $('#play-name').textContent = g.name + (variant !== 'classic' ? ' · ' + variantsOf(g).find((v) => v.id === variant).name : '');
    $('#tools').hidden = true;
    $('#win').hidden = true;
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
      const seed = (info.seed || 'odysseum:' + info.L) + ':' + stepIndex;
      const puzzle = g.generate(C.makeRng(seed), g.params(step.level, variant));
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
          const d = C.gameData(dataKey(g, variant));
          d.solved++;
          d.totalTime += elapsed;
          gainXp(g, step.level, !!info.boss, elapsed, hints, auto);
          C.save();
          host.classList.add('solved');
          if (stepIndex + 1 < info.steps.length) {
            // boss : la grille suivante arrive après une respiration
            setTimeout(() => playStep(info, stepIndex + 1), 1500);
          } else {
            finishLevel(info);
          }
        }
      };
      const inst = g.create(host, puzzle, api);

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
        g, variant, inst, info,
        hint() { if (!won && inst.hint()) hints++; },
        // outil de test temporaire : résout la grille d'un coup (sans XP)
        solve() {
          if (won) return;
          auto = true;
          if (inst.solve) { inst.solve(); return; }
          for (let i = 0; i < 400 && !won; i++) if (!inst.hint()) break;
        },
        stop() { clearInterval(tick); inst.destroy(); }
      };
    }, 60);
  }

  let pendingProgress = false;
  // Niveau réussi : la grille s'illumine, puis le niveau suivant s'enchaîne tout seul.
  // La carte rattrapera la progression au retour (Ulysse avancera jusqu'à la bonne pierre).
  function finishLevel(info) {
    if (info.free) { // jeu libre : on enchaîne sur le niveau suivant du même jeu
      const s = info.steps[0];
      C.gameData(dataKey(game(s.id), s.variant)).level++;
      C.save();
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      finishLevel.timer = setTimeout(() => {
        if (screens.play.hidden) return;
        if (info.focus) startFocus(SKILLS.find((sk) => sk.id === info.focus)); // focus : un autre jeu de la même capacité
        else startFree(game(s.id), s.variant);
      }, 1600);
      return;
    }
    if (info.L === J.done) {
      J.done++;
      pendingProgress = true;
    }
    const next = info.L + 1;
    selected = next;
    J.selected = next;
    C.save();
    $('#play').classList.add('done');
    clearTimeout(finishLevel.timer);
    finishLevel.timer = setTimeout(() => {
      if (!screens.play.hidden) startLevel(next);
    }, 1600);
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
  // L'XP dépend de la façon de jouer : rapidité, indices utilisés ; l'autosolve n'en donne pas.
  function gainXp(g, level, boss, elapsed, hints, auto) {
    const sk = SKILLS.find((s) => s.games.includes(g.id));
    if (!sk || auto) return;
    const base = 10 + Math.floor(level / 2);
    const par = 25 + level * 5;                                   // temps « attendu » en secondes
    const speed = Math.max(0.6, Math.min(1.4, 1.4 - 0.6 * (elapsed / par)));
    const help = Math.max(0.25, 1 - 0.25 * hints);
    const gain = Math.max(1, Math.round(base * speed * help * (boss ? 1.5 : 1)));
    const before = skillStats(sk).level;
    C.store.xp[sk.id] = (C.store.xp[sk.id] || 0) + gain;
    const after = skillStats(sk).level;
    showXp('+' + gain + ' <b>' + sk.name.toLowerCase() + '</b>' + (after > before ? ' · niveau ' + after : ''), ACCENT[sk.games[0]]);
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
      if (pendingProgress) {
        C.world.progress(J.done, true);
        standing = false; // le bouton réapparaît à l'arrivée sur la nouvelle pierre
      }
    } else if (pendingProgress) {
      selected = J.done;
    }
    pendingProgress = false;
    renderPlay();
    renderBadge();
  }

  // ------------------------ Liste des mini-jeux ------------------------
  let libMode = 'classic';
  try { libMode = localStorage.getItem('odysseum.libmode') || 'classic'; } catch (e) { /* ignore */ }

  function renderLibrary() {
    document.querySelectorAll('.lib-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === libMode));
    const gl = $('#game-list');
    gl.innerHTML = '';
    C.games.forEach((g) => {
      const v = libMode === 'variant' && g.variants && g.variants[1] ? g.variants[1].id : 'classic';
      const b = document.createElement('button');
      b.className = 'tile';
      b.style.setProperty('--game', ACCENT[g.id]);
      b.innerHTML = '<span class="tile-icon">' + icon(g.id) + '</span><span class="tile-name">' + g.name.toLowerCase() + '</span>' +
        '<span class="tile-lvl">' + C.gameData(dataKey(g, v)).level + '</span>';
      b.addEventListener('click', () => startFree(g, v));
      gl.appendChild(b);
    });
  }

  // Mode focus : on n'enchaîne que les mini-jeux d'une capacité, en alternant jeux et variantes.
  let focusTurn = 0;
  function startFocus(sk) {
    focusTurn++;
    const g = game(sk.games[focusTurn % sk.games.length]);
    const v = g.variants && g.variants[1] && Math.random() < 0.4 ? g.variants[1].id : 'classic';
    const d = C.gameData(dataKey(g, v));
    $('#brain').hidden = true;
    playStep({ L: -1, free: true, focus: sk.id, seed: 'focus:' + g.id + ':' + v + ':' + d.level, steps: [{ id: g.id, variant: v, level: d.level }] }, 0);
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
    { id: 'logique', name: 'Déduction', games: ['reines', 'astres'], at: [108, 92],
      desc: 'Tirer des certitudes des règles, une case après l\'autre, sans jamais deviner.' },
    { id: 'espace', name: 'Espace', games: ['paves', 'pixels'], at: [196, 74],
      desc: 'Se représenter les formes et la place qu\'elles occupent avant de les tracer.' },
    { id: 'anticipation', name: 'Anticipation', games: ['flux', 'serpent'], at: [132, 160],
      desc: 'Prévoir plusieurs coups à l\'avance pour ne pas se fermer de chemin.' },
    { id: 'raisonnement', name: 'Hypothèses', games: ['lumieres', 'coffre'], at: [240, 128],
      desc: 'Proposer une idée, l\'éprouver, et retenir ce que chaque essai révèle.' }
  ];
  const NODES = 10;
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
  }

  function renderBrain() {
    const p = playerStats();
    $('#brain-level').textContent = p.level;
    $('#brain-xp').textContent = p.cur + ' / ' + p.need + ' xp';
    $('#brain-xp-bar').style.width = Math.round(p.frac * 100) + '%';
    const ns = 'http://www.w3.org/2000/svg';
    const svg = $('#brain-svg');
    svg.innerHTML =
      // silhouette du cerveau (profil) et quelques circonvolutions
      '<path class="outline" d="M62 150C40 112 60 62 110 52C132 26 190 26 212 46C252 40 286 72 280 112C300 142 280 182 246 186C236 206 200 212 186 196L170 206C150 216 130 206 124 190C94 200 62 186 62 150Z"/>' +
      '<path class="outline" d="M186 196C190 214 194 228 200 240" />' +
      '<path class="outline" opacity=".5" d="M150 40C140 70 160 90 150 120M210 60C190 80 215 100 200 130M95 120C120 128 130 110 160 125M180 150C200 140 220 160 245 150"/>';
    SKILLS.forEach((sk) => {
      const st = skillStats(sk);
      const accent = ACCENT[sk.games[0]];
      const rng = C.makeRng('cerveau:' + sk.id);
      const pts = [];
      while (pts.length < NODES) {
        const a = rng() * Math.PI * 2, d = 8 + rng() * 30;
        const x = sk.at[0] + Math.cos(a) * d * 1.2, y = sk.at[1] + Math.sin(a) * d * 0.85;
        if (pts.every((q) => Math.hypot(q[0] - x, q[1] - y) > 11)) pts.push([x, y]);
      }
      // du centre vers l'extérieur : les premiers neurones s'allument d'abord
      pts.sort((a, b) => Math.hypot(a[0] - sk.at[0], a[1] - sk.at[1]) - Math.hypot(b[0] - sk.at[0], b[1] - sk.at[1]));
      const glow = document.createElementNS(ns, 'circle');
      glow.setAttribute('cx', sk.at[0]); glow.setAttribute('cy', sk.at[1]); glow.setAttribute('r', 40);
      glow.setAttribute('fill', accent);
      glow.setAttribute('class', 'glow' + (st.lit ? ' on' : ''));
      glow.style.opacity = st.lit ? String(0.08 + 0.3 * st.lit / NODES) : '0';
      svg.appendChild(glow);
      pts.forEach((p1, i) => {
        // chaque neurone se relie à ses deux plus proches voisins
        pts.map((p2, j) => [j, Math.hypot(p1[0] - p2[0], p1[1] - p2[1])]).filter(([j]) => j !== i)
          .sort((a, b) => a[1] - b[1]).slice(0, 2).forEach(([j]) => {
            if (j < i) return;
            const l = document.createElementNS(ns, 'line');
            l.setAttribute('x1', p1[0]); l.setAttribute('y1', p1[1]); l.setAttribute('x2', pts[j][0]); l.setAttribute('y2', pts[j][1]);
            l.setAttribute('stroke', accent);
            l.setAttribute('class', 'link' + (i < st.lit && j < st.lit ? ' on' : ''));
            svg.appendChild(l);
          });
      });
      pts.forEach((pt, i) => {
        const c = document.createElementNS(ns, 'circle');
        c.setAttribute('cx', pt[0]); c.setAttribute('cy', pt[1]); c.setAttribute('r', i < st.lit ? 3.4 : 2.4);
        c.setAttribute('fill', i < st.lit ? accent : 'var(--faint)');
        c.setAttribute('class', 'node' + (i < st.lit ? ' on' : ''));
        svg.appendChild(c);
      });
    });
    $('#skills').innerHTML = SKILLS.map((sk) => {
      const st = skillStats(sk);
      return '<button class="skill" data-skill="' + sk.id + '" aria-label="Activer le mode concentration : ' + sk.name + '" style="--game:' + ACCENT[sk.games[0]] + '"><div class="skill-head"><span>' + sk.name +
        '</span><small>niv. ' + st.level + '</small></div><p class="skill-desc">' + sk.desc + '</p><div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div>' +
        '<small class="skill-xp">' + st.cur + ' / ' + st.need + ' xp <span class="focus-go">concentration →</span></small></button>';
    }).join('');
  }

  // ------------------------------ Thème ------------------------------
  // « auto » suit l'heure : l'interface passe en sombre la nuit, comme l'archipel.
  const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
  const isNightHour = (h) => h < 6 || h >= 20.5;
  function resolvedTheme() {
    const s = C.store.settings.theme || 'auto';
    return s === 'auto' ? (isNightHour(hourNow()) ? 'dark' : 'light') : s;
  }
  function applyTheme() {
    const t = resolvedTheme();
    document.documentElement.dataset.theme = t;
    // la 3D suit l'heure réelle ; le mode sombre choisi force la nuit
    if (worldReady && C.world.setTime) C.world.setTime(hourNow(), (C.store.settings.theme || 'auto') === 'dark');
    if (session && session.inst.redraw) session.inst.redraw();
    document.querySelectorAll('.theme-mode button').forEach((b) => b.classList.toggle('on', b.dataset.themeChoice === (C.store.settings.theme || 'auto')));
  }
  setInterval(applyTheme, 5 * 60 * 1000); // la lumière avance avec l'heure
  applyTheme(); // avant le premier affichage, pour éviter un flash

  // --------------------------- Événements ---------------------------
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
  $('#open-brain').addEventListener('click', () => { renderBrain(); $('#brain').hidden = false; });
  $('#brain').addEventListener('click', (e) => { if (e.target.id === 'brain') $('#brain').hidden = true; });
  document.querySelectorAll('.theme-mode button').forEach((b) => b.addEventListener('click', () => {
    C.store.settings.theme = b.dataset.themeChoice;
    C.save();
    applyTheme();
  }));
  $('#go').addEventListener('click', () => startLevel(selected));
  $('#back').addEventListener('click', goHome);
  $('#btn-undo').addEventListener('click', () => session && session.inst.undo());
  $('#btn-reset').addEventListener('click', () => session && session.inst.reset());
  $('#btn-hint').addEventListener('click', () => session && session.hint());
  $('#btn-autosolve').addEventListener('click', () => session && session.solve());
  $('#btn-rules').addEventListener('click', () => session && openTutorial(session.g, session.variant, false));
  $('#rules-close').addEventListener('click', nextTuto);
  // carte du cerveau : toucher une capacité lance le mode focus
  $('#skills').addEventListener('click', (e) => {
    const b = e.target.closest('.skill');
    if (b) concentrate(SKILLS.find((sk) => sk.id === b.dataset.skill));
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
    });
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

  $('#open-settings').addEventListener('click', () => { $('#settings').hidden = false; });
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

  // Les navigateurs n'autorisent le son qu'après un premier geste.
  document.addEventListener('pointerdown', () => C.audio.unlock(), { once: true });
  document.addEventListener('backbutton', () => { if (!screens.play.hidden) goHome(); });

  // exposé pour les tests
  window.Odysseum = { levelInfo, journey: J };

  initWorld();
  applyTheme();
  applyA11y();
  show('home');
  renderPlay();
  renderBadge();
  if (worldReady) C.world.start();
})();
