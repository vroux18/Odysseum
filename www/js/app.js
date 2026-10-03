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
      const seed = 'odysseum:' + info.L + ':' + stepIndex;
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
  }

  // --------------------------- Événements ---------------------------
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
  show('home');
  renderPlay();
  if (worldReady) C.world.start();
})();
