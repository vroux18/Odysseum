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
  // ordre d'apparition des mini-jeux dans la quête (un jeu absent est ignoré)
  const ORDER = ['flux', 'reines', 'tuyaux', 'astres', 'paves', 'pixels', 'serpent', 'lumieres', 'coffre',
    'demineur', 'simon', 'rushhour', 'bataille'].filter((id) => C.games.some((g) => g.id === id));
  const POOL_SIZE = [3, 5, 7, 9, 11, 13]; // jeux disponibles dans les mondes 1, 2, 3, 4, 5, 6 et suivants
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
      accentOf: (id) => ACCENT[id],
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
    // bouton play ; le numéro du niveau en petite étiquette dessous
    b.innerHTML = UI('play');
    const lab = $('#go-label');
    lab.textContent = (info.boss ? 'épreuve · ' : 'niveau ') + (selected + 1);
    lab.hidden = b.hidden;
    // flèches : revenir au niveau d'avant, ou avancer jusqu'au niveau en cours
    $('#prev-level').hidden = b.hidden || selected <= 0;
    $('#next-level').hidden = b.hidden || selected >= J.done;
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

  // 3 astuces par grille ; le petit chiffre sur l'ampoule les décompte
  const MAX_HINTS = 3;
  function renderHints(left) {
    $('#hint-left').textContent = left;
    $('#btn-hint').classList.toggle('empty', left <= 0);
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
  function showTip(res) {
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
    tip.textContent = r.text || '';
    tip.hidden = !r.text;
    tip.classList.remove('in'); void tip.offsetWidth; tip.classList.add('in');
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
    // le temps de lire : plus long pour une explication plus longue
    showTip.timer = setTimeout(hideTip, Math.max(7000, Math.min(12000, (r.text || '').length * 70)));
  }
  // Surlignages posés par-dessus un plateau dessiné (canvas) ou une zone de plusieurs cases :
  // boxes = [{ x, y, w, h, kind: 'where' | 'why', round, label }] en pixels CSS relatifs à `ref`.
  // Renvoie { where, why, clear } à fusionner dans l'astuce.
  C.hintBoxes = function (ref, boxes) {
    const host = ref.parentNode;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
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
    return out;
  };

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
    $('#play-level').textContent = info.tier ? info.tier.name.toLowerCase() + ' · ' + info.tier.k : info.free ? (info.focus ? 'concentration' : 'jeu libre') : (info.boss ? 'épreuve · niveau ' : 'niveau ') + (info.L + 1);
    // passage d'un mini-jeu au suivant dans une série : la grille arrive par la droite
    $('#board').classList.toggle('next-step', stepIndex > 0 || !!info.chain || !!info.focus);
    $('#board').classList.remove('leaving');
    $('#play-name').textContent =g.name + (variant !== 'classic' ? ' · ' + variantsOf(g).find((v) => v.id === variant).name : '');
    $('#tools').hidden = true;
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
      let seed = (info.seed || 'odysseum:' + info.L) + ':' + stepIndex, genLevel = step.level, mark = null;
      // quête et liste des mini-jeux partagent la même progression : une grille de la quête
      // est le prochain niveau du palier en cours de ce jeu (même grille que dans la liste), et la réussir l'y coche
      if (!info.free && variant === 'classic') {
        const nx = nextTier(g.id);
        if (nx) { mark = nx; genLevel = tierLevel(nx.tier, nx.k); seed = 'palier:' + g.id + ':' + nx.tier.id + ':' + nx.k; }
      }
      const puzzle = g.generate(C.makeRng(seed), g.params(genLevel, variant));
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
          gainXp(g, step.level, !!info.boss, elapsed, hints, auto);
          if (mark) tierMark(g.id, mark.tier.id, mark.k);
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
        g, variant, inst, info,
        hint() {
          if (won || hints >= MAX_HINTS) { C.sfx.error && C.sfx.error(); return; }
          const res = inst.hint();
          if (res) {
            hints++;
            renderHints(MAX_HINTS - hints);
            if (typeof res === 'string' || (res && typeof res === 'object')) showTip(res); // l'astuce montre où, explique pourquoi
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

  let pendingProgress = false;
  // Niveau réussi : la grille s'illumine, puis le niveau suivant s'enchaîne tout seul.
  // La carte rattrapera la progression au retour (Ulysse avancera jusqu'à la bonne pierre).
  function finishLevel(info) {
    if (info.tier) { // niveau d'un palier : on le coche et on enchaîne sur le suivant
      const s = info.steps[0];
      tierMark(s.id, info.tier.id, info.tier.k);
      $('#play').classList.add('done');
      clearTimeout(finishLevel.timer);
      // enchaînement rapide, comme dans la quête : la grille finie glisse, la suivante arrive
      setTimeout(() => { if (!screens.play.hidden) $('#board').classList.add('leaving'); }, 900);
      finishLevel.timer = setTimeout(() => {
        if (!screens.play.hidden) startTier(s.id, info.tier.id, Math.min(TIER_SIZE, info.tier.k + 1), true);
      }, 1200);
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
      // une ligne de registre : emblème de la capacité, nom et niveau, jauge à crans, gain en pièce d'or
      return '<div class="ld-row ld2" style="--game:' + ACCENT[sk.games[0]] + ';--d:' + (0.35 + i * 0.45) + 's">' +
        '<span class="ld-medal"><svg viewBox="0 0 24 24">' + (SKILL_ICON[sk.id] || '') + '</svg></span>' +
        '<div class="ld-mid"><div class="ld-head"><span>' + sk.name + '</span>' +
        (now.level > was.level ? '<small class="ld-up">niveau ' + now.level + '</small>' : '<small>niv. ' + now.level + '</small>') + '</div>' +
        '<div class="skill-bar"><i style="width:' + startW + '%" data-to="' + Math.round(now.frac * 100) + '"></i></div></div>' +
        '<b class="ld-gain" data-gain="' + gain + '">+0</b></div>';
    }).join('') || '<p class="ld-none">Sans XP cette fois : les grilles résolues automatiquement n\'en donnent pas.</p>';
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
      }, 350 + i * 450);
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
  function gainXp(g, level, boss, elapsed, hints) {
    const sk = SKILLS.find((s) => s.games.includes(g.id));
    if (!sk) return;
    const base = 10 + Math.floor(level / 2);
    const par = 25 + level * 5;                                   // temps « attendu » en secondes
    const speed = Math.max(0.6, Math.min(1.4, 1.4 - 0.6 * (elapsed / par)));
    const help = Math.max(0.25, 1 - 0.25 * hints);
    const gain = Math.max(1, Math.round(base * speed * help * (boss ? 1.5 : 1)));
    C.store.xp[sk.id] = (C.store.xp[sk.id] || 0) + gain;
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
    const t = TIERS.find((x) => x.id === tierId);
    $('#levels').hidden = true;
    $('#brain').hidden = true;
    $('#library').hidden = true;
    playStep({ L: -1, free: true, chain: !!chain, tier: { id: tierId, k, name: t.name }, seed: 'palier:' + id + ':' + tierId + ':' + k,
      steps: [{ id, variant: 'classic', level: tierLevel(t, k) }] }, 0);
  }

  // Bandeau des niveaux d'un mini-jeu : onglets de palier, grille de 150 niveaux
  let lv = null;
  function openLevels(id) {
    let k = 0;
    TIERS.forEach((t, i) => { if (tierOpen(id, i)) k = i; });
    lv = { id, tier: TIERS[k].id };
    renderLevels(true);
    $('#levels').hidden = false;
    C.sfx.tap();
  }
  function renderLevels(scroll) {
    const g = game(lv.id);
    $('#levels').style.setProperty('--game', ACCENT[lv.id]);
    $('#lv-head').innerHTML = '<span class="lv-icon">' + icon(lv.id) + '</span><b>' + g.name + '</b><small>niveau ' + gameLvl(lv.id) + '</small>';
    $('#lv-tabs').innerHTML = TIERS.map((t, k) => {
      const open = tierOpen(lv.id, k);
      return '<button role="tab" data-tier="' + t.id + '" class="' + (t.id === lv.tier ? 'on' : '') + (open ? '' : ' locked') + '">' +
        '<span>' + t.name + '</span><small>' + (!open ? LOCK : tierDone(lv.id, t.id) >= TIER_SIZE ? '✓' : 'niv. ' + (tierDone(lv.id, t.id) + 1)) + '</small></button>';
    }).join('');
    const k = TIERS.findIndex((t) => t.id === lv.tier);
    const done = tierDone(lv.id, lv.tier), open = tierOpen(lv.id, k);
    let h = open ? '' : '<p class="lv-note">' + LOCK + 'Réussis ' + TIER_UNLOCK + ' niveaux ' + TIERS[k - 1].name.toLowerCase() + ' pour ouvrir ce palier.</p>';
    for (let i = 1; i <= TIER_SIZE; i++) {
      const st = !open ? 'locked' : i <= done ? 'done' : i === done + 1 ? 'next' : 'locked';
      h += '<button class="lv ' + st + '" data-k="' + i + '"' + (st === 'locked' ? ' disabled' : '') + ' style="--i:' + Math.min(i, 40) + '">' + i + '</button>';
    }
    const grid = $('#lv-grid');
    grid.innerHTML = h;
    const sk = SKILLS.find((s) => s.games.includes(lv.id));
    // reprendre là où on s'est arrêté : le plus haut palier ouvert qui n'est pas terminé
    const resume = nextTier(lv.id);
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
    { id: 'logique', name: 'Déduction', games: ['reines', 'astres', 'demineur'], at: [72, 160], r: [50, 56],
      desc: 'Tirer des certitudes des règles, une case après l\'autre, sans jamais deviner.' },
    { id: 'espace', name: 'Espace', games: ['paves', 'pixels', 'tuyaux'], at: [168, 160], r: [50, 56],
      desc: 'Se représenter les formes et la place qu\'elles occupent avant de les tracer.' },
    { id: 'anticipation', name: 'Anticipation', games: ['flux', 'serpent', 'rushhour'], at: [120, 84], r: [80, 48],
      desc: 'Prévoir plusieurs coups à l\'avance pour ne pas se fermer de chemin.' },
    { id: 'raisonnement', name: 'Hypothèses', games: ['lumieres', 'coffre', 'bataille'], at: [80, 252], r: [52, 48],
      desc: 'Proposer une idée, l\'éprouver, et retenir ce que chaque essai révèle.' },
    { id: 'memoire', name: 'Mémoire', games: ['simon'], at: [164, 254], r: [46, 46],
      desc: 'Retenir une suite qui s\'allonge et la restituer dans l\'ordre.' }
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
      html += '<radialGradient id="zg-' + sk.id + '"><stop offset="0" stop-color="' + ACCENT[sk.games[0]] + '" stop-opacity=".55"/>' +
        '<stop offset=".7" stop-color="' + ACCENT[sk.games[0]] + '" stop-opacity=".18"/><stop offset="1" stop-color="' + ACCENT[sk.games[0]] + '" stop-opacity="0"/></radialGradient>';
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
    svg.innerHTML = html;    zoomBrain(null, true);
    // capacités : nom, niveau et barre, sans description
    $('#skills').innerHTML = SKILLS.map((sk) => {
      const st = skillStats(sk);
      return '<button class="skill" data-skill="' + sk.id + '" style="--game:' + ACCENT[sk.games[0]] + '"><div class="skill-head"><span>' + sk.name +
        '</span><small>niv. ' + st.level + '</small></div><div class="skill-bar"><i style="width:' + Math.round(st.frac * 100) + '%"></i></div>' +
        '<span class="skill-go" data-skill="' + sk.id + '" role="button" aria-label="Concentration : ' + sk.name + '">' + UI('play') + '</span></button>';
    }).join('');
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
  function stepLevel(d) {
    const L = Math.max(0, Math.min(J.done, selected + d));
    if (L === selected) return;
    C.sfx.tap();
    if (worldReady && C.world.select) C.world.select(L); // Ulysse marche jusqu'à la pierre
    else { selected = L; J.selected = L; C.save(); renderPlay(); }
  }
  $('#prev-level').addEventListener('click', () => stepLevel(-1));
  $('#next-level').addEventListener('click', () => stepLevel(1));
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
  $('#open-brain').addEventListener('click', () => { renderBrain(); $('#brain').hidden = false; zoomBrain(null, true); });
  $('#brain').addEventListener('click', (e) => { if (e.target.id === 'brain') $('#brain').hidden = true; });
  // le cadre change de taille (rotation, panneau du dessous) : la vue se recadre
  if (window.ResizeObserver) new ResizeObserver(() => { if (!$('#brain').hidden) setBrainView(brainView); }).observe($('#brain-svg'));
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
  $('#go').addEventListener('click', () => startLevel(selected));
  $('#back').addEventListener('click', goHome);
  $('#btn-undo').addEventListener('click', () => session && session.inst.undo());
  $('#btn-reset').addEventListener('click', () => session && session.inst.reset());
  $('#btn-hint').addEventListener('click', () => session && session.hint());
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
  function renderWardrobe() {
    const opts = skinOptions(), st = skinState();
    // toutes les catégories fournies par le monde 3D (tenue, bouclier…), avec leur nom français
    const labels = Object.assign({ outfit: 'Tenue', shield: 'Bouclier' }, opts.labels || {});
    const parts = Object.keys(opts).filter((k) => Array.isArray(opts[k]) && opts[k].length)
      .map((k) => ({ id: k, name: (SKIN_PARTS.find((p) => p.id === k) || {}).name || labels[k] || k }));
    if (!parts.some((p) => p.id === wdPart) && parts.length) wdPart = parts[0].id;
    $('#wd-tabs').innerHTML = parts
      .map((p) => '<button role="tab" data-part="' + p.id + '" class="' + (p.id === wdPart ? 'on' : '') + '">' + p.name + '</button>').join('');
    const list = opts[wdPart] || [];
    const cur = st[wdPart] || (list[0] && list[0].id);
    $('#wd-choices').innerHTML = list.map((o, k) => o.color
      ? '<button class="wd-swatch' + (o.id === cur ? ' on' : '') + '" data-id="' + o.id + '" style="--c:' + o.color + ';--k:' + k + '" aria-label="' + o.name + '"><i></i><span>' + o.name + '</span></button>'
      : '<button class="wd-chip' + (o.id === cur ? ' on' : '') + '" data-id="' + o.id + '" style="--k:' + k + '">' + o.name + '</button>').join('');
  }
  $('#open-wardrobe').addEventListener('click', () => {
    if (worldReady && C.world.setCameraMode) C.world.setCameraMode('follow'); // on voit Ulysse pendant l'essayage
    renderWardrobe();
    $('#wardrobe').hidden = false;
    C.sfx.tap();
  });
  $('#wardrobe').addEventListener('click', (e) => {
    if (e.target.id === 'wardrobe' || e.target.id === 'wd-done') { $('#wardrobe').hidden = true; return; }
    const tab = e.target.closest('#wd-tabs button');
    if (tab) { wdPart = tab.dataset.part; renderWardrobe(); C.sfx.tap(); return; }
    const pick = e.target.closest('.wd-swatch, .wd-chip');
    if (pick) { skinState()[wdPart] = pick.dataset.id; C.save(); applySkin(); renderWardrobe(); C.sfx.place(); }
  });
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

  // Intro : un toucher pour embarquer (lance la musique), l'écran s'ouvre, la caméra plonge vers Ulysse.
  const intro = $('#intro');
  function embark() {
    if (!intro || intro.classList.contains('leaving')) return;
    C.audio.unlock();
    C.sfx.win(); // un petit accord de départ
    intro.classList.add('leaving');
    if (worldReady && C.world.swoop) C.world.swoop();
    setTimeout(() => intro.remove(), 1500);
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
  const SHEETS = ['library', 'levels', 'brain', 'settings', 'wardrobe', 'rules'];
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
