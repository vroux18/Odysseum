// Odysseum — coquille de l'application : le sentier, les niveaux, les boss, la partie.
// Volontairement silencieuse : pas de chrono, pas de compteur affiché.
(function () {
  'use strict';
  const C = window.Carnet;
  const $ = (sel) => document.querySelector(sel);

  // Teintes douces propres à chaque jeu.
  const ACCENT = {
    flux: '#4f8fd0', reines: '#d0714a', astres: '#d9a441', paves: '#8fa457',
    pixels: '#5fae9f', serpent: '#3d9d90', lumieres: '#e0b04a', coffre: '#958fc4',
    tuyaux: '#c06474'
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
  // - Chaque monde (île) ajoute des mini-jeux : 3 au premier (Flux, Reines, Tuyaux), puis 5, 7, et les 9 au 4e monde.
  // - Un niveau = une petite série de 2 à 3 mini-jeux enchaînés (2 au tout début).
  // - Les nouveaux jeux d'un monde ouvrent ses premiers niveaux (avec leur tutoriel).
  // - La difficulté monte d'île en île et au fil de chaque île.
  // - Le dernier niveau de chaque île est un boss : 4, puis 5 grilles d'affilée, plus
  //   difficiles, mêlant les capacités, de plus en plus souvent en variante.
  // ------------------------------------------------------------------
  const PER = 10;
  const VARIANTS_ON = false; // variantes mises de côté pour l'instant (le code reste prêt)
  const ORDER = ['flux', 'reines', 'tuyaux', 'astres', 'paves', 'pixels', 'serpent', 'lumieres', 'coffre'];
  const POOL_SIZE = [3, 5, 7, 9]; // jeux disponibles dans les mondes 1, 2, 3, 4 et suivants
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
    // montée très progressive : +3 par monde, +1 tous les 2 niveaux ; le boss un cran au-dessus
    const level = boss ? 1 + c * 3 + 6 + c : 1 + c * 3 + Math.floor(k * 0.5);
    const vChance = boss ? Math.min(0.7, 0.25 + c * 0.1) : Math.min(0.55, 0.12 + c * 0.08);
    const steps = ids.map((id, i) => ({ id, variant: pickVariant(id, vChance), level: level + (boss ? 0 : i) }));
    return { L, c, k, boss, id: steps[0].id, accent: ACCENT[steps[0].id], steps };
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
    b.innerHTML = '<span class="go-num">' + (selected + 1) + '</span>'; // le numéro du niveau
    b.setAttribute('aria-label', 'Jouer');
    b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
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
    $('#play-level').textContent = info.free ? (info.focus ? 'concentration' : 'jeu libre') : (info.boss ? 'épreuve · niveau ' : 'niveau ') + (info.L + 1);
    // passage d'un mini-jeu au suivant dans une série : la grille arrive par la droite
    $('#board').classList.toggle('next-step', stepIndex > 0);
    $('#board').classList.remove('leaving');
    $('#play-name').textContent =g.name + (variant !== 'classic' ? ' · ' + variantsOf(g).find((v) => v.id === variant).name : '');
    $('#tools').hidden = true;
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
            // enchaînement rapide dans une série : la grille finie glisse et s'efface, la suivante arrive
            setTimeout(() => host.classList.add('leaving'), 1000);
            setTimeout(() => playStep(info, stepIndex + 1), 1300);
          } else {
            finishLevel(info);
          }
        }
      };
      const inst = g.create(host, puzzle, api);
      // animations : apparition en cascade (en diagonale) et petit rebond au toucher
      const grid = host.querySelector('.cell-grid, .nono');
      if (grid) {
        const n = +getComputedStyle(grid).getPropertyValue('--n') || 1;
        grid.querySelectorAll('.cell, .nono-cell, .bulb').forEach((el, k) => el.style.setProperty('--i', Math.floor(k / n) + (k % n)));
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
        g, variant, inst, info,
        hint() {
          if (!won && inst.hint()) {
            hints++;
            if (info.t0) info.penalty += 10; // compet : chaque indice coûte 10 secondes
          }
        },
        // outil de test temporaire : résout la grille d'un coup (sans XP)
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
      }, 2300);
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
    if (info.t0 && !info.stopped) { info.time = levelTime(info); info.stopped = true; } // le chrono s'arrête à la dernière grille
    // série terminée : récapitulatif de l'XP gagnée par capacité, puis retour à la carte
    finishLevel.timer = setTimeout(() => { if (!screens.play.hidden) showLevelDone(info); }, 1400);
  }

  // Récapitulatif animé : chaque capacité travaillée, son gain d'XP, sa barre qui se remplit.
  // ------------------------- Mode chill / compet -------------------------
  const isCompet = () => C.store.settings.playMode === 'compet';
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
    const txt = 'Odysseum · niveau ' + (info.L + 1) + ' bouclé en ' + C.formatTime(info.time) + '. Tu fais mieux ?';
    const url = 'https://vroux18.github.io/Odysseum/';
    if (navigator.share) {
      navigator.share({ title: 'Odysseum', text: txt, url }).catch(() => { /* partage annulé */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(txt + ' ' + url).then(() => showXp('message copié, colle-le à tes amis', '#5f9fd8')).catch(() => {});
    }
  }

  function showLevelDone(info) {
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
    $('#ld-title').textContent = info.boss ? 'Épreuve réussie' : 'Niveau ' + (info.L + 1);
    box.innerHTML = rows.map((sk, i) => {
      const was = levelFrom(before[sk.id] || 0, 40), now = skillStats(sk);
      const gain = (C.store.xp[sk.id] || 0) - (before[sk.id] || 0);
      const startW = now.level > was.level ? 0 : Math.round(was.frac * 100);
      return '<div class="ld-row" style="--game:' + ACCENT[sk.games[0]] + ';--d:' + (0.35 + i * 0.45) + 's">' +
        '<div class="ld-head"><span>' + sk.name + '</span><b class="ld-gain" data-gain="' + gain + '">+0</b></div>' +
        '<div class="skill-bar"><i style="width:' + startW + '%" data-to="' + Math.round(now.frac * 100) + '"></i></div>' +
        (now.level > was.level ? '<small class="ld-up">niveau ' + now.level + '</small>' : '<small>niv. ' + now.level + '</small>') + '</div>';
    }).join('') || '<p class="ld-none">Sans XP cette fois : les grilles résolues automatiquement n\'en donnent pas.</p>';
    const ov = $('#level-done');
    ov.hidden = false;
    C.sfx.place();
    // les barres se remplissent et les compteurs montent, une capacité après l'autre
    box.querySelectorAll('.ld-row').forEach((row, i) => {
      setTimeout(() => {
        const bar = row.querySelector('.skill-bar i');
        bar.style.width = bar.dataset.to + '%';
        const el = row.querySelector('.ld-gain'), total = +el.dataset.gain, t0 = performance.now();
        const count = (now) => {
          const k = Math.min(1, (now - t0) / 900);
          el.textContent = '+' + Math.round(total * (1 - Math.pow(1 - k, 3))) + ' xp';
          if (k < 1) requestAnimationFrame(count);
        };
        requestAnimationFrame(count);
        if (row.querySelector('.ld-up')) setTimeout(() => { row.classList.add('leveled'); C.sfx.win(); }, 900);
      }, 350 + i * 450);
    });
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
    document.querySelector('.lib-mode').hidden = !VARIANTS_ON;
    document.querySelectorAll('.lib-mode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === libMode));
    const gl = $('#game-list');
    gl.innerHTML = '';
    C.games.forEach((g) => {
      const v = VARIANTS_ON && libMode === 'variant' && g.variants && g.variants[1] ? g.variants[1].id : 'classic';
      const b = document.createElement('button');
      b.className = 'tile';
      b.style.setProperty('--game', ACCENT[g.id]);
      b.innerHTML = '<span class="tile-icon">' + icon(g.id) + '</span><span class="tile-name">' + g.name + '</span>' +
        '<span class="tile-lvl">niv. ' + C.gameData(dataKey(g, v)).level + '</span>';
      b.addEventListener('click', () => startFree(g, v));
      gl.appendChild(b);
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
    { id: 'espace', name: 'Espace', games: ['paves', 'pixels', 'tuyaux'], at: [196, 74],
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
    $('#brain-xp').textContent = p.cur + ' / ' + p.need;
    $('#brain-xp-bar').style.width = Math.round(p.frac * 100) + '%';
    zoomBrain(null, true);
    $('#games-detail').hidden = true;
    $('#brain-band').setAttribute('aria-expanded', 'false');
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
      // la zone de la capacité : touchable, avec ses mini-jeux à l'intérieur (lisibles une fois zoomé)
      const zone = document.createElementNS(ns, 'g');
      zone.setAttribute('class', 'zone');
      zone.dataset.skill = sk.id;
      zone.style.color = accent;
      let inner = '<ellipse class="zone-hit" cx="' + sk.at[0] + '" cy="' + sk.at[1] + '" rx="46" ry="36" fill="' + accent + '"/>' +
        '<text class="zone-name" x="' + sk.at[0] + '" y="' + (sk.at[1] - 24) + '" text-anchor="middle">' + sk.name + '</text>';
      sk.games.forEach((id, k) => {
        const x = sk.at[0] + (k - (sk.games.length - 1) / 2) * 26, y = sk.at[1] + 4;
        inner += '<g class="zone-game" transform="translate(' + (x - 8) + ' ' + (y - 8) + ') scale(.66)">' +
          '<circle cx="12" cy="12" r="15" fill="var(--surface)" stroke="currentColor" stroke-width="1.2"/>' + ICON[id] + '</g>' +
          '<text class="zone-lvl" x="' + x + '" y="' + (y + 20) + '" text-anchor="middle">' + gameLevel(id) + '</text>';
      });
      zone.innerHTML = inner;
      svg.appendChild(zone);
    });
    // capacités : nom, niveau et barre, sans description
    $('#skills').innerHTML = SKILLS.map((sk) => {
      const st = skillStats(sk);
      return '<button class="skill" data-skill="' + sk.id + '" style="--game:' + ACCENT[sk.games[0]] + '"><div class="skill-head"><span>' + sk.name +
        '</span><small>niv. ' + st.level + '</small></div><div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div></button>';
    }).join('');
  }

  // niveau d'un mini-jeu : une marche toutes les 3 grilles réussies
  const gameLevel = (id) => 1 + Math.floor(solvedOf(id) / 3);

  // Zoom animé sur une zone du cerveau (null = vue d'ensemble)
  const BRAIN_VIEW = [0, 0, 320, 250];
  let brainView = BRAIN_VIEW.slice(), brainAnim = 0, zoomed = null;
  function zoomBrain(skillId, instant) {
    const sk = SKILLS.find((s) => s.id === skillId);
    zoomed = sk ? sk.id : null;
    const target = sk ? [sk.at[0] - 75, sk.at[1] - 56, 150, 117] : BRAIN_VIEW;
    const svg = $('#brain-svg');
    svg.classList.toggle('zoomed', !!sk);
    svg.querySelectorAll('.zone').forEach((z) => z.classList.toggle('focus', z.dataset.skill === zoomed));
    $('#brain-back').hidden = !sk;
    $('#skills').hidden = !!sk;
    const panel = $('#zone-panel');
    panel.hidden = !sk;
    if (sk) {
      const st = skillStats(sk);
      panel.style.setProperty('--game', ACCENT[sk.games[0]]);
      panel.innerHTML = '<div class="zp-head"><b>' + sk.name + '</b><small>niv. ' + st.level + ' · ' + st.cur + ' / ' + st.need + ' xp</small></div>' +
        '<div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div>' +
        '<div class="zp-games">' + sk.games.map((id) => '<span class="zp-game" style="--game:' + ACCENT[id] + '">' + icon(id) +
          '<span>' + game(id).name + '</span><small>niv. ' + gameLevel(id) + '</small></span>').join('') + '</div>' +
        '<button class="zp-go" data-skill="' + sk.id + '">activer le mode concentration</button>';
    }
    cancelAnimationFrame(brainAnim);
    if (instant) { brainView = target.slice(); svg.setAttribute('viewBox', brainView.join(' ')); return; }
    const from = brainView.slice(), t0 = performance.now(), D = 700;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      brainView = from.map((v, i) => v + (target[i] - v) * e);
      svg.setAttribute('viewBox', brainView.join(' '));
      if (k < 1) brainAnim = requestAnimationFrame(step);
    };
    brainAnim = requestAnimationFrame(step);
  }

  // détail par mini-jeu (sous le bandeau) : un toucher ramène au cerveau, sur la bonne zone
  function renderGamesDetail() {
    $('#games-detail').innerHTML = ORDER.map((id) => '<button class="gd-game" data-game="' + id + '" style="--game:' + ACCENT[id] + '">' + icon(id) +
      '<span>' + game(id).name + '</span><small>niv. ' + gameLevel(id) + '</small></button>').join('');
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
  document.querySelectorAll('.play-mode button').forEach((b) => b.addEventListener('click', () => {
    C.store.settings.playMode = b.dataset.playMode;
    C.save();
    renderPlayMode();
    C.sfx.tap();
  }));
  renderPlayMode();
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
  // carte du cerveau : une capacité (bouton ou zone) → zoom sur sa zone ; le bandeau → détail par jeu
  $('#skills').addEventListener('click', (e) => {
    const b = e.target.closest('.skill');
    if (b) { zoomBrain(b.dataset.skill); C.sfx.tap(); }
  });
  $('#brain-svg').addEventListener('click', (e) => {
    const z = e.target.closest('.zone');
    if (z && zoomed !== z.dataset.skill) { zoomBrain(z.dataset.skill); C.sfx.tap(); }
  });
  $('#brain-back').addEventListener('click', () => zoomBrain(null));
  $('#zone-panel').addEventListener('click', (e) => {
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
  // « niveau suivant » : retour sur la carte, où l'on voit Ulysse marcher jusqu'à la pierre suivante
  $('#ld-next').addEventListener('click', () => { $('#level-done').hidden = true; goHome(); });

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

  // appli installée depuis Chrome : toujours à jour (voir sw.js) ; inutile dans l'APK
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sans mise en cache, le jeu marche quand même */ });
  }

  initWorld();
  applyTheme();
  applyA11y();
  show('home');
  renderPlay();
  renderBadge();
  if (worldReady) C.world.start();
})();
