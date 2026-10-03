// Odysseum — coquille de l'application : le sentier, les niveaux, les boss, la partie.
// Volontairement silencieuse : pas de chrono, pas de compteur affiché.
(function () {
  'use strict';
  const C = window.Carnet;
  const $ = (sel) => document.querySelector(sel);

  // Teintes douces propres à chaque jeu.
  const ACCENT = {
    flux: '#8fb3cf', reines: '#d4a59c', astres: '#d6bb84', paves: '#9dbea4',
    pixels: '#b4aad4', serpent: '#8cbfb8', lumieres: '#dcc283', coffre: '#a6b2c1'
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
  // Le parcours : chaque île introduit un mini-jeu, puis mélange ceux découverts.
  // Le dernier niveau de chaque île est un boss : trois grilles d'affilée.
  // ------------------------------------------------------------------
  const PER = 10;
  const ORDER = ['flux', 'reines', 'astres', 'paves', 'pixels', 'serpent', 'lumieres', 'coffre'];

  function levelInfo(L) {
    const c = Math.floor(L / PER), k = L % PER;
    const rng = C.makeRng('sentier:' + L);
    const featured = ORDER[c % ORDER.length];
    const known = ORDER.slice(0, Math.min(ORDER.length, c + 1));
    const boss = k === PER - 1;
    const base = 1 + Math.floor(L * 0.5);
    const pickVariant = (id, chance) => {
      const g = game(id);
      // une variante seulement pour un jeu déjà connu depuis au moins une île
      const ok = g.variants && g.variants[1] && (ORDER.indexOf(id) < c || c >= ORDER.length);
      return ok && rng() < chance ? g.variants[1].id : 'classic';
    };
    const vChance = c >= 2 ? 0.3 : 0;
    let steps;
    if (boss) {
      const others = known.filter((id) => id !== featured);
      const ids = [featured, others.length ? rng.pick(others) : featured, featured];
      steps = ids.map((id) => ({ id, variant: pickVariant(id, c >= 2 ? 0.5 : 0), level: base + 6 }));
    } else {
      const id = k === 0 || rng() < 0.45 ? featured : rng.pick(known);
      steps = [{ id, variant: pickVariant(id, vChance), level: base }];
    }
    return { L, c, k, boss, id: steps[0].id, accent: ACCENT[boss ? featured : steps[0].id], steps };
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
    if (!C.store.games[rulesKey]) { C.store.games[rulesKey] = 1; C.save(); openRules(g, variant); }

    setTimeout(() => {
      const seed = (info.seed || 'odysseum:' + info.L) + ':' + stepIndex;
      const puzzle = g.generate(C.makeRng(seed), g.params(step.level, variant));
      host.innerHTML = '';
      let elapsed = 0, won = false, tool = 'fill';
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
        hint() { if (!won) inst.hint(); },
        // outil de test temporaire : résout la grille d'un coup
        solve() {
          if (won) return;
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
      finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) startFree(game(s.id), s.variant); }, 1600);
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

  function openRules(g, variant) {
    $('#rules-icon').innerHTML = icon(g.id);
    $('#rules-icon').style.setProperty('--game', ACCENT[g.id]);
    $('#rules-list').innerHTML = rulesOf(g, variant).map((r) => '<li>' + r + '</li>').join('');
    $('#rules').hidden = false;
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

  function startFree(g, variant) {
    const d = C.gameData(dataKey(g, variant));
    $('#library').hidden = true;
    playStep({ L: -1, free: true, seed: 'libre:' + g.id + ':' + variant + ':' + d.level, steps: [{ id: g.id, variant, level: d.level }] }, 0);
  }

  // ------------------------ Carte du cerveau ------------------------
  // Chaque faculté se nourrit de deux mini-jeux ; les grilles réussies allument ses neurones.
  const SKILLS = [
    { id: 'logique', name: 'Logique', games: ['reines', 'astres'], at: [108, 92] },
    { id: 'espace', name: 'Espace', games: ['paves', 'pixels'], at: [196, 74] },
    { id: 'anticipation', name: 'Anticipation', games: ['flux', 'serpent'], at: [132, 160] },
    { id: 'raisonnement', name: 'Raisonnement', games: ['lumieres', 'coffre'], at: [240, 128] }
  ];
  const NODES = 10;
  const solvedOf = (id) => { const g = game(id); return variantsOf(g).reduce((s, v) => s + C.gameData(dataKey(g, v.id)).solved, 0); };
  const skillStats = (sk) => {
    const solved = sk.games.reduce((s, id) => s + solvedOf(id), 0);
    return { solved, level: 1 + Math.floor(solved / 5), frac: (solved % 5) / 5, lit: Math.min(NODES, Math.floor(solved / 2)) };
  };
  function playerStats() {
    const total = C.games.reduce((s, g) => s + solvedOf(g.id), 0);
    return { total, level: 1 + Math.floor(total / 8), frac: (total % 8) / 8 };
  }

  function renderBadge() {
    const p = playerStats();
    $('#level-num').textContent = p.level;
    $('#level-ring').setAttribute('stroke-dashoffset', String(144.5 * (1 - p.frac)));
  }

  function renderBrain() {
    const p = playerStats();
    $('#brain-level').textContent = p.level;
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
      return '<div class="skill" style="--game:' + ACCENT[sk.games[0]] + '"><div class="skill-head"><span>' + sk.name +
        '</span><small>' + st.level + '</small></div><div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div></div>';
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
  $('#btn-rules').addEventListener('click', () => session && openRules(session.g, session.variant));
  $('#rules-close').addEventListener('click', () => { $('#rules').hidden = true; });
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
  show('home');
  renderPlay();
  renderBadge();
  if (worldReady) C.world.start();
})();
