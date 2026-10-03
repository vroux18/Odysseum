// L'archipel : l'accueil en 3D (Three.js).
// Huit îlots dans une mer de brume, un par jeu. Chaque grille résolue ajoute
// une pièce au monument de l'île ; les îles émergent du brouillard au fil du jeu.
(function () {
  'use strict';
  const C = window.Carnet;

  // nombre total de grilles résolues pour débloquer chaque île (dans l'ordre)
  const UNLOCK = [0, 0, 0, 2, 4, 7, 10, 14];
  const MAX_PIECES = 14;
  const SKY = '#eef1f0';

  const World = { ok: false };
  let THREE, renderer, scene, camera, host, raf = 0, running = false, last = 0;
  let sea, seaPos, seaBase, motes, islands = [], stones = [];
  let opts = null, focused = -1;
  // caméra en coordonnées orbitales, lissées vers une cible
  const cam = { theta: 0.6, elev: 1.15, radius: 70, tx: 0, ty: 0, tz: 0 };
  const goal = { theta: 0.6, elev: 0.72, radius: 30, tx: 0, ty: 0, tz: 0 };

  function supported() {
    if (!window.THREE) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  const tint = (hex, amount) => new THREE.Color('#fbfaf7').lerp(new THREE.Color(hex), amount);

  // ------------------------------------------------------------------
  // Construction de la scène
  // ------------------------------------------------------------------
  function makeSea() {
    const geo = new THREE.PlaneGeometry(120, 120, 46, 46);
    geo.rotateX(-Math.PI / 2);
    seaPos = geo.attributes.position;
    seaBase = Float32Array.from(seaPos.array);
    const mat = new THREE.MeshLambertMaterial({ color: '#e6eced', flatShading: true });
    sea = new THREE.Mesh(geo, mat);
    sea.receiveShadow = true;
    scene.add(sea);
  }

  function jitterGeometry(geo, rng, amount) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setX(i, p.getX(i) + (rng() - 0.5) * amount);
      p.setZ(i, p.getZ(i) + (rng() - 0.5) * amount);
    }
    geo.computeVertexNormals();
    return geo;
  }

  function makeIsland(game, i, n) {
    const rng = C.makeRng('ile:' + game.id);
    const angle = (i / n) * Math.PI * 2 + 0.25;
    const dist = i % 2 ? 11.5 : 8.2;
    const r = 1.9 + rng() * 0.6;
    const group = new THREE.Group();
    group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

    const rock = new THREE.Mesh(
      jitterGeometry(new THREE.CylinderGeometry(r, r * 0.62, 3, 9, 2), rng, 0.35),
      new THREE.MeshLambertMaterial({ color: '#f6f5f1', flatShading: true, transparent: true })
    );
    rock.position.y = -1.0;
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);

    const meadow = new THREE.Mesh(
      jitterGeometry(new THREE.CylinderGeometry(r * 0.9, r * 0.95, 0.16, 9), rng, 0.15),
      new THREE.MeshLambertMaterial({ color: tint(game.accent, 0.25), flatShading: true, transparent: true })
    );
    meadow.position.y = 0.55;
    meadow.receiveShadow = true;
    group.add(meadow);

    // galets autour du rivage
    for (let k = 0; k < 5; k++) {
      const a = rng() * Math.PI * 2;
      const s = 0.18 + rng() * 0.22;
      const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0),
        new THREE.MeshLambertMaterial({ color: '#f3f2ee', flatShading: true, transparent: true }));
      pebble.position.set(Math.cos(a) * (r + 0.25), 0.02, Math.sin(a) * (r + 0.25));
      pebble.scale.y = 0.6;
      pebble.castShadow = true;
      group.add(pebble);
    }

    const monument = new THREE.Group();
    monument.position.y = 0.63;
    group.add(monument);

    // la lumière du jour : un orbe qui flotte tant que la grille du jour n'est pas faite
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: game.accent }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: game.accent, transparent: true, depthWrite: false, opacity: 0.9 }));
    halo.scale.set(1.3, 1.3, 1);
    orb.add(halo);
    orb.position.set(r * 0.55, 2.4, 0);
    group.add(orb);

    group.traverse((o) => { o.userData.island = i; });
    scene.add(group);
    return {
      game, group, rock, meadow, monument, orb, angle, r,
      pieces: 0, unlocked: true, fade: 1, phase: rng() * 6.28,
      drops: []
    };
  }

  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    return glowTex;
  }

  // Forme et position de la k-ième pièce du monument, propre à chaque jeu.
  function piece(id, k, accent) {
    const light = new THREE.MeshLambertMaterial({ color: '#fbfaf7', flatShading: true });
    const tinted = new THREE.MeshLambertMaterial({ color: tint(accent, 0.55), flatShading: true });
    const mat = k % 3 === 2 ? tinted : light;
    let geo, pos = new THREE.Vector3(), rot = new THREE.Euler();
    switch (id) {
      case 'reines': { // tour de blocs qui tourne sur elle-même
        const s = 0.62 - k * 0.025;
        geo = new THREE.BoxGeometry(s, 0.26, s);
        pos.set(0, 0.13 + k * 0.27, 0); rot.set(0, k * 0.22, 0);
        break;
      }
      case 'astres': { // cairn de galets ronds
        const s = 0.36 - k * 0.016;
        geo = new THREE.IcosahedronGeometry(s, 1);
        let y = 0; for (let j = 0; j < k; j++) y += (0.36 - j * 0.016) * 1.45;
        pos.set(Math.sin(k * 1.7) * 0.05, s * 0.8 + y, Math.cos(k * 1.3) * 0.05);
        break;
      }
      case 'paves': { // dalles empilées en quinconce
        geo = new THREE.BoxGeometry(0.95 - k * 0.03, 0.12, 0.5);
        pos.set(0, 0.06 + k * 0.13, 0); rot.set(0, (k % 2) * Math.PI / 2 + k * 0.05, 0);
        break;
      }
      case 'pixels': { // pyramide de voxels
        const layer = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 4][k];
        const slot = [[-1, -1], [1, -1], [-1, 1], [1, 1]][k % 4];
        const sp = 0.3 - layer * 0.04;
        geo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
        pos.set(layer >= 3 ? 0 : slot[0] * sp * 0.5, 0.14 + layer * 0.28, layer >= 3 ? 0 : slot[1] * sp * 0.5);
        break;
      }
      case 'serpent': { // hélice de perles
        geo = new THREE.SphereGeometry(0.15, 12, 10);
        const a = k * 0.85;
        pos.set(Math.cos(a) * 0.45, 0.15 + k * 0.16, Math.sin(a) * 0.45);
        break;
      }
      case 'lumieres': { // colonne de lanternes
        geo = new THREE.CylinderGeometry(0.2, 0.24, 0.3, 8);
        pos.set(0, 0.15 + k * 0.31, 0);
        break;
      }
      case 'coffre': { // anneaux de plus en plus fins
        geo = new THREE.TorusGeometry(0.5 - k * 0.025, 0.06, 6, 24);
        pos.set(0, 0.06 + k * 0.13, 0); rot.set(Math.PI / 2, 0, 0);
        break;
      }
      default: { // flux : arches croisées
        geo = new THREE.TorusGeometry(0.5 - k * 0.02, 0.07, 6, 20, Math.PI);
        pos.set(0, 0.0 + k * 0.16, 0); rot.set(0, k * (Math.PI / 3), 0);
      }
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.copy(rot);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  function makeMotes() {
    const count = 140;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 50;
      p[i * 3 + 1] = Math.random() * 9 + 0.5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    motes = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, map: glowTexture(), color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false
    }));
    scene.add(motes);
  }

  // pierres de gué entre îles voisines débloquées
  function makeStones() {
    stones.forEach((s) => scene.remove(s));
    stones = [];
    for (let i = 0; i + 1 < islands.length; i++) {
      const a = islands[i], b = islands[i + 1];
      if (!a.unlocked || !b.unlocked) continue;
      const pa = a.group.position, pb = b.group.position;
      const d = pa.distanceTo(pb);
      const count = Math.max(2, Math.floor((d - a.r - b.r) / 1.1));
      for (let k = 1; k <= count; k++) {
        const t = (a.r + (k / (count + 1)) * (d - a.r - b.r)) / d;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.2, 7),
          new THREE.MeshLambertMaterial({ color: '#f7f6f2', flatShading: true }));
        s.position.lerpVectors(pa, pb, t);
        s.position.y = 0.02;
        s.userData.phase = k + i;
        s.castShadow = true;
        scene.add(s);
        stones.push(s);
      }
    }
  }

  // ------------------------------------------------------------------
  // Progression : pièces, îles débloquées, orbes du jour
  // ------------------------------------------------------------------
  function update(progress, animate) {
    const total = progress.reduce((s, p) => s + p.solved, 0);
    let unlockedChanged = false;
    islands.forEach((isl, i) => {
      const p = progress[i];
      const wasUnlocked = isl.unlocked;
      isl.unlocked = total >= UNLOCK[i];
      if (isl.unlocked !== wasUnlocked) unlockedChanged = true;
      if (isl.unlocked && !wasUnlocked && animate) isl.fade = 0.15; // émerge doucement
      isl.orb.visible = isl.unlocked && !p.daily;
      isl.meadow.material.color.copy(tint(isl.game.accent, 0.22 + Math.min(1, p.solved / 12) * 0.45));

      const want = Math.min(MAX_PIECES, p.solved);
      while (isl.pieces < want) {
        const m = piece(isl.game.id, isl.pieces, isl.game.accent);
        isl.monument.add(m);
        if (animate) {
          m.userData.targetY = m.position.y;
          m.position.y += 5 + isl.drops.length * 1.2;
          m.userData.delay = isl.drops.length * 0.35;
          isl.drops.push(m);
        }
        isl.pieces++;
      }
    });
    if (unlockedChanged || !stones.length) makeStones();
  }

  // ------------------------------------------------------------------
  // Boucle d'animation
  // ------------------------------------------------------------------
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    const t = now / 1000;

    // houle
    for (let i = 0; i < seaPos.count; i++) {
      const x = seaBase[i * 3], z = seaBase[i * 3 + 2];
      seaPos.setY(i, Math.sin(x * 0.25 + t * 0.6) * 0.09 + Math.cos(z * 0.3 + t * 0.45) * 0.08 - 0.05);
    }
    seaPos.needsUpdate = true;
    sea.geometry.computeVertexNormals();

    islands.forEach((isl) => {
      isl.group.position.y = Math.sin(t * 0.5 + isl.phase) * 0.04;
      // brume : les îles verrouillées restent des silhouettes
      const target = isl.unlocked ? 1 : 0.18;
      isl.fade += (target - isl.fade) * (1 - Math.exp(-dt * 0.8));
      isl.group.traverse((o) => { if (o.material && o.material.transparent !== undefined && o !== isl.orb && !(o.isSprite)) { o.material.transparent = true; o.material.opacity = isl.fade; } });
      isl.monument.visible = isl.unlocked;
      isl.orb.position.y = 2.4 + Math.sin(t * 1.3 + isl.phase) * 0.18;
      // chute des nouvelles pièces
      isl.drops = isl.drops.filter((m) => {
        if (m.userData.delay > 0) { m.userData.delay -= dt; return true; }
        m.userData.v = (m.userData.v || 0) + dt * 14;
        m.position.y -= m.userData.v * dt;
        if (m.position.y <= m.userData.targetY) {
          m.position.y = m.userData.targetY;
          C.sfx.place();
          return false;
        }
        return true;
      });
    });
    stones.forEach((s) => { s.position.y = 0.02 + Math.sin(t * 0.7 + s.userData.phase) * 0.03; });
    motes.rotation.y = t * 0.01;
    motes.position.y = Math.sin(t * 0.2) * 0.3;

    // caméra : dérive lente au repos, glissement doux vers la cible
    if (focused < 0 && !drag) goal.theta += dt * 0.025;
    const k = 1 - Math.exp(-dt * 2.2);
    Object.keys(cam).forEach((key) => { cam[key] += (goal[key] - cam[key]) * k; });
    const ce = Math.cos(cam.elev);
    camera.position.set(
      cam.tx + Math.cos(cam.theta) * ce * cam.radius,
      cam.ty + Math.sin(cam.elev) * cam.radius,
      cam.tz + Math.sin(cam.theta) * ce * cam.radius
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------------
  // Interaction : glisser pour tourner, toucher une île pour s'en approcher
  // ------------------------------------------------------------------
  let drag = null;
  const ray = () => new THREE.Raycaster();

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = ray();
    rc.setFromCamera(v, camera);
    const hits = rc.intersectObjects(islands.map((i) => i.group), true);
    for (const h of hits) {
      const i = h.object.userData.island;
      if (i != null && islands[i].unlocked) return i;
    }
    return -1;
  }

  function onDown(e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, theta: goal.theta, elev: goal.elev };
    renderer.domElement.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 8) {
      goal.theta = drag.theta + dx * 0.006;
      if (focused < 0) goal.elev = Math.max(0.35, Math.min(1.25, drag.elev + dy * 0.004));
    }
  }
  function onUp(e) {
    if (!drag) return;
    const tap = drag.moved < 8 && performance.now() - drag.t < 400;
    drag = null;
    if (!tap) return;
    const i = pick(e);
    if (i >= 0) focusIsland(i, true); else unfocus(true);
  }

  function focusIsland(i, notify) {
    focused = i;
    const isl = islands[i];
    const p = isl.group.position;
    goal.tx = p.x; goal.ty = 0.9; goal.tz = p.z;
    goal.radius = 9;
    goal.elev = 0.42;
    goal.theta = isl.angle; // la caméra se place côté large, regard vers le centre
    C.sfx.tap();
    if (notify && opts.onFocus) opts.onFocus(isl.game.id);
  }
  function unfocus(notify) {
    if (focused < 0) return;
    focused = -1;
    goal.tx = goal.ty = goal.tz = 0;
    goal.radius = 30;
    goal.elev = 0.72;
    if (notify && opts.onFocus) opts.onFocus(null);
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // en portrait on recule un peu pour voir tout l'archipel
    camera.fov = w < h ? 52 : 40;
    camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------
  World.init = function (container, options) {
    if (!supported()) return false;
    THREE = window.THREE;
    host = container;
    opts = options;
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'world-canvas';
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 22, 62);
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

    scene.add(new THREE.HemisphereLight('#ffffff', '#d9e2e4', 0.75));
    const sun = new THREE.DirectionalLight('#fff7ec', 0.55);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    sun.shadow.radius = 4;
    scene.add(sun);

    makeSea();
    makeMotes();
    islands = options.games.map((g, i) => makeIsland(g, i, options.games.length));

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => { drag = null; });
    window.addEventListener('resize', resize);
    resize();
    World.ok = true;
    return true;
  };

  World.update = update;
  World.focus = (id) => { const i = islands.findIndex((x) => x.game.id === id); if (i >= 0) focusIsland(i, false); };
  World.unfocus = () => unfocus(false);
  World.start = function () {
    if (!World.ok || running) return;
    running = true;
    last = performance.now();
    resize();
    raf = requestAnimationFrame(frame);
  };
  World.stop = function () { running = false; cancelAnimationFrame(raf); };

  document.addEventListener('visibilitychange', () => {
    if (!World.ok) return;
    if (document.hidden) { if (running) { World.stop(); World._paused = true; } }
    else if (World._paused) { World._paused = false; World.start(); }
  });

  C.world = World;
})();
