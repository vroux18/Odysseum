// Coquille de l'application : accueil, rituel du jour, variantes, réglages, partie.
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

  const DAILY_LEVEL = { flux: 20, reines: 25, astres: 24, paves: 22, pixels: 18, serpent: 18, lumieres: 16, coffre: 12 };
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const variantsOf = (g) => g.variants || [{ id: 'classic', name: 'Classique' }];
  const variantFor = (g, mode) => (mode === 'variant' && variantsOf(g)[1] ? variantsOf(g)[1].id : 'classic');
  const rulesOf = (g, v) => (Array.isArray(g.rules) ? g.rules : g.rules[v] || g.rules.classic);
  const dataKey = (g, v) => (v === 'classic' ? g.id : g.id + ':' + v);

  // Le rituel du jour alterne les règles d'un jour à l'autre.
  function dailyVariant(g) {
    const vs = variantsOf(g);
    const dayNum = Math.floor(new Date(C.todayKey() + 'T12:00:00').getTime() / 86400000);
    return vs[(dayNum + C.hashString(g.id)) % vs.length].id;
  }

  let mode = 'classic';
  try { mode = localStorage.getItem('carnet.mode') || 'classic'; } catch (e) { /* ignore */ }

  const screens = { home: $('#home'), play: $('#play') };
  function show(name) {
    Object.entries(screens).forEach(([k, el]) => { el.hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  // ------------------------------ Accueil ------------------------------
  function renderHome() {
    const now = new Date();
    $('#today').textContent = now.getDate() + ' ' + MONTHS[now.getMonth()];
    const daily = C.store.daily[C.todayKey()] || {};

    // anneau du jour : un point par jeu, plein quand la grille du jour est faite
    const ring = $('#ring');
    ring.querySelectorAll('.dot').forEach((d) => d.remove());
    C.games.forEach((g, i) => {
      const a = (i / C.games.length) * Math.PI * 2 - Math.PI / 2;
      const b = document.createElement('button');
      b.className = 'dot' + (daily[g.id] != null ? ' done' : '');
      b.style.setProperty('--game', ACCENT[g.id]);
      b.style.left = 50 + 46 * Math.cos(a) + '%';
      b.style.top = 50 + 46 * Math.sin(a) + '%';
      b.setAttribute('aria-label', g.name + ' du jour');
      b.addEventListener('click', () => startGame(g, { daily: true, variant: dailyVariant(g) }));
      ring.appendChild(b);
    });

    document.querySelectorAll('.switch-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));

    const gl = $('#game-list');
    gl.innerHTML = '';
    C.games.forEach((g) => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.style.setProperty('--game', ACCENT[g.id]);
      b.innerHTML = '<span class="tile-icon">' + icon(g.id) + '</span><span class="tile-name">' + g.name.toLowerCase() + '</span>';
      b.addEventListener('click', () => startGame(g, { daily: false, variant: variantFor(g, mode) }));
      gl.appendChild(b);
    });

    $('#opt-sound').checked = !!C.store.settings.sound;
    $('#opt-music').checked = !!C.store.settings.music;
    $('#opt-vibrate').checked = !!C.store.settings.vibrate;
    $('#opt-mix').value = C.store.settings.mix;
  }

  // ----------------------------- Partie -----------------------------
  let session = null;

  function startGame(game, opts) {
    if (session) session.stop();
    const variant = opts.variant || 'classic';
    const data = C.gameData(dataKey(game, variant));
    const level = opts.daily ? DAILY_LEVEL[game.id] : data.level;
    const seed = opts.daily ? 'day:' + C.todayKey() + ':' + game.id : 'lvl:' + game.id + ':' + variant + ':' + level;

    show('play');
    $('#play').style.setProperty('--game', ACCENT[game.id]);
    $('#play-icon').innerHTML = icon(game.id);
    $('#tools').hidden = true;
    $('#win').hidden = true;
    $('#play').classList.remove('done');
    const host = $('#board');
    host.classList.remove('solved');
    host.innerHTML = '<div class="loading"><span></span></div>';

    const rulesKey = dataKey(game, variant) + ':rules';
    if (!C.store.games[rulesKey]) { C.store.games[rulesKey] = 1; C.save(); openRules(game, variant); }

    setTimeout(() => {
      const puzzle = game.generate(C.makeRng(seed), game.params(level, variant));
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
          finish(game, opts, variant, level, elapsed);
        }
      };
      const inst = game.create(host, puzzle, api);

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
        game, opts, variant, inst,
        hint() { if (!won) inst.hint(); },
        stop() { clearInterval(tick); inst.destroy(); }
      };
    }, 60);
  }

  function finish(game, opts, variant, level, elapsed) {
    const data = C.gameData(dataKey(game, variant));
    data.solved++;
    data.totalTime += elapsed;
    if (data.best == null || elapsed < data.best) data.best = elapsed;
    if (opts.daily) {
      const t = C.todayKey();
      C.store.daily[t] = C.store.daily[t] || {};
      if (C.store.daily[t][game.id] == null) C.store.daily[t][game.id] = elapsed;
    } else if (level === data.level) {
      data.level++;
    }
    C.save();
    $('#board').classList.add('solved');
    $('#play').classList.add('done');
    setTimeout(() => {
      $('#win-next').hidden = !!opts.daily;
      $('#win').hidden = false;
    }, 900);
  }

  function openRules(game, variant) {
    $('#rules-icon').innerHTML = icon(game.id);
    $('#rules-icon').style.setProperty('--game', ACCENT[game.id]);
    $('#rules-list').innerHTML = rulesOf(game, variant).map((r) => '<li>' + r + '</li>').join('');
    $('#rules').hidden = false;
  }

  function goHome() { if (session) session.stop(); session = null; renderHome(); show('home'); }

  // --------------------------- Événements ---------------------------
  document.querySelectorAll('.switch-mode button').forEach((b) => {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      try { localStorage.setItem('carnet.mode', mode); } catch (e) { /* ignore */ }
      renderHome();
    });
  });
  $('#back').addEventListener('click', goHome);
  $('#btn-undo').addEventListener('click', () => session && session.inst.undo());
  $('#btn-reset').addEventListener('click', () => session && session.inst.reset());
  $('#btn-hint').addEventListener('click', () => session && session.hint());
  $('#btn-rules').addEventListener('click', () => session && openRules(session.game, session.variant));
  $('#rules-close').addEventListener('click', () => { $('#rules').hidden = true; });
  $('#rules').addEventListener('click', (e) => { if (e.target.id === 'rules') $('#rules').hidden = true; });
  $('#win-home').addEventListener('click', goHome);
  $('#win-next').addEventListener('click', () => startGame(session.game, { daily: false, variant: session.variant }));

  $('#open-settings').addEventListener('click', () => { $('#settings').hidden = false; });
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });
  $('#opt-sound').addEventListener('change', (e) => { C.audio.setSound(e.target.checked); C.sfx.tap(); });
  $('#opt-music').addEventListener('change', (e) => C.audio.setMusic(e.target.checked));
  $('#opt-vibrate').addEventListener('change', (e) => { C.store.settings.vibrate = e.target.checked; C.save(); });
  $('#opt-mix').addEventListener('input', (e) => C.audio.setMix(+e.target.value));
  $('#opt-mix').addEventListener('change', () => C.sfx.tap());

  // Les navigateurs n'autorisent le son qu'après un premier geste.
  document.addEventListener('pointerdown', () => C.audio.unlock(), { once: true });
  document.addEventListener('backbutton', () => { if (!screens.play.hidden) goHome(); });

  renderHome();
  show('home');
})();
