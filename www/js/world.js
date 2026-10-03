// Odysseum — l'archipel en 3D (Three.js r128).
// Huit îlots dans une mer de brume, un par jeu. Chaque grille résolue ajoute une
// pièce au monument de l'île et fait pousser des arbres ; les îles émergent du
// brouillard au fil du jeu. Un petit voyageur vit sur l'archipel et saute de
// pierre en pierre pour rejoindre l'île choisie.
(function () {
  'use strict';
  const C = window.Carnet;

  // nombre total de grilles résolues pour débloquer chaque île (dans l'ordre)
  const UNLOCK = [0, 0, 0, 2, 4, 7, 10, 14];
  const MAX_PIECES = 14;
  const FOG = '#e9eeee';
  const TOP = 0.63; // hauteur du sol des îles

  const World = { ok: false };
  let THREE, renderer, scene, camera, host, raf = 0, running = false, last = 0, simTime = 0;
  let sea, seaPos, seaBase, motes, islands = [], stones = [], links = {}, ripples = [], clouds = [], birds = [];
  let opts = null, focused = -1, overview = 30;
  // caméra en coordonnées orbitales, lissées vers une cible
  const cam = { theta: 0.6, elev: 1.25, radius: 90, tx: 0, ty: 0, tz: 0 };
  const goal = { theta: 0.6, elev: 0.8, radius: 30, tx: 0, ty: 0, tz: 0 };

  function supported() {
    if (!window.THREE) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  const tint = (hex, amount) => new THREE.Color('#fbfaf7').lerp(new THREE.Color(hex), amount);
  const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {}));

  function canvasTexture(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    return new THREE.CanvasTexture(c);
  }
  let glowTex = null, shadowTex = null;
  const glowTexture = () => glowTex || (glowTex = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.3, 'rgba(255,255,255,.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }));
  const shadowTexture = () => shadowTex || (shadowTex = canvasTexture(64, 64, (g) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(60,70,75,.35)');
    grd.addColorStop(1, 'rgba(60,70,75,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }));

  // ------------------------------------------------------------------
  // Décor : ciel, mer, nuages, oiseaux, poussières de lumière
  // ------------------------------------------------------------------
  function makeSky() {
    scene.background = canvasTexture(4, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#d6e3e8');
      grd.addColorStop(0.55, '#eef2f1');
      grd.addColorStop(1, FOG);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    scene.fog = new THREE.Fog(FOG, 30, 82);
  }

  function makeSea() {
    const geo = new THREE.PlaneGeometry(130, 130, 48, 48);
    geo.rotateX(-Math.PI / 2);
    seaPos = geo.attributes.position;
    seaBase = Float32Array.from(seaPos.array);
    sea = new THREE.Mesh(geo, lambert('#cfdcdf'));
    sea.receiveShadow = true;
    scene.add(sea);
  }

  function makeClouds() {
    const mat = lambert('#ffffff', { transparent: true, opacity: 0.9 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const s = 0.9 + Math.random() * 0.9;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
        m.position.set(k * 1.1 - puffs * 0.5, Math.random() * 0.4, (Math.random() - 0.5) * 0.8);
        m.scale.y = 0.55;
        g.add(m);
      }
      g.userData = { a: (i / 7) * Math.PI * 2, r: 16 + Math.random() * 14, y: 8 + Math.random() * 4, speed: 0.008 + Math.random() * 0.01 };
      scene.add(g);
      clouds.push(g);
    }
  }

  function makeBirds() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.5, 0.12); shape.lineTo(0.08, 0.16); shape.lineTo(0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: '#8a9399', side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1;
      b.add(l, r);
      b.userData = { l, r, a: i * 2.1, rad: 13 + i * 3, y: 5.5 + i * 0.8, speed: 0.12 + i * 0.03, phase: i };
      scene.add(b);
      birds.push(b);
    }
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

  // ------------------------------------------------------------------
  // Îles
  // ------------------------------------------------------------------
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
    const fadeMats = [];

    const rock = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(r, r * 0.62, 3, 9, 2), rng, 0.35),
      lambert('#f2efe8', { transparent: true }));
    rock.position.y = -1.0;
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
    fadeMats.push(rock.material);

    const meadow = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(r * 0.9, r * 0.95, 0.16, 9), rng, 0.15),
      lambert(tint(game.accent, 0.25), { transparent: true }));
    meadow.position.y = 0.55;
    meadow.receiveShadow = true;
    group.add(meadow);
    fadeMats.push(meadow.material);

    // galets autour du rivage
    const pebbleMat = lambert('#f3f2ee', { transparent: true });
    fadeMats.push(pebbleMat);
    for (let k = 0; k < 6; k++) {
      const a = rng() * Math.PI * 2;
      const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rng() * 0.22, 0), pebbleMat);
      pebble.position.set(Math.cos(a) * (r + 0.25), 0.02, Math.sin(a) * (r + 0.25));
      pebble.scale.y = 0.6;
      pebble.castShadow = true;
      group.add(pebble);
    }

    const monument = new THREE.Group();
    monument.position.y = TOP;
    group.add(monument);
    const grove = new THREE.Group();
    grove.position.y = TOP;
    group.add(grove);

    // la lumière du jour : un orbe qui flotte tant que la grille du jour n'est pas faite
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: game.accent }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: game.accent, transparent: true, depthWrite: false, opacity: 0.9 }));
    halo.scale.set(1.3, 1.3, 1);
    orb.add(halo);
    orb.position.set(-r * 0.45, 2.4, r * 0.2);
    group.add(orb);

    // ondes qui s'éloignent doucement du rivage
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.05, 48),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(group.position.x, 0.06, group.position.z);
      ring.userData = { base: r * 1.02, offset: k * 2.5 + rng() * 2 };
      scene.add(ring);
      ripples.push({ ring, island: i });
    }

    group.traverse((o) => { o.userData.island = i; });
    scene.add(group);
    return {
      game, group, rock, meadow, monument, grove, orb, angle, r, rng, fadeMats,
      pieces: 0, trees: 0, unlocked: true, fade: 1, phase: rng() * 6.28, drops: [], sprouts: []
    };
  }

  // Forme et position de la k-ième pièce du monument, propre à chaque jeu.
  function piece(id, k, accent) {
    const mat = k % 3 === 2 ? lambert(tint(accent, 0.55)) : lambert('#fbfaf7');
    let geo;
    const pos = new THREE.Vector3(), rot = new THREE.Euler();
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
        let y = 0;
        for (let j = 0; j < k; j++) y += (0.36 - j * 0.016) * 1.45;
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
        pos.set(0, k * 0.16, 0); rot.set(0, k * (Math.PI / 3), 0);
      }
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.rotation.copy(rot);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // Un arbre stylisé : cône pastel sur un petit tronc.
  function tree(isl, k) {
    const g = new THREE.Group();
    const h = 0.55 + isl.rng() * 0.35;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.22 + isl.rng() * 0.08, h, 7), lambert(tint(isl.game.accent, 0.45)));
    crown.position.y = 0.12 + h / 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 5), lambert('#c9b8a3'));
    trunk.position.y = 0.07;
    crown.castShadow = trunk.castShadow = true;
    g.add(crown, trunk);
    // autour du monument, en évitant l'endroit où se tient le voyageur
    const a = isl.angle + 2.2 + k * 1.15 + isl.rng() * 0.4;
    const d = isl.r * (0.5 + isl.rng() * 0.25);
    g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    return g;
  }

  // pierres de gué entre îles voisines débloquées (l'anneau est fermé)
  function makeStones() {
    stones.forEach((s) => scene.remove(s));
    stones = [];
    links = {};
    const n = islands.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = islands[i], b = islands[j];
      if (!a.unlocked || !b.unlocked) continue;
      const pa = a.group.position, pb = b.group.position;
      const d = pa.distanceTo(pb);
      const count = Math.max(2, Math.floor((d - a.r - b.r) / 1.05));
      const list = [];
      for (let k = 1; k <= count; k++) {
        const t = (a.r + (k / (count + 1)) * (d - a.r - b.r)) / d;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.2, 7), lambert('#f7f6f2'));
        s.position.lerpVectors(pa, pb, t);
        s.position.y = 0.02;
        s.userData = { phase: k + i, dip: 0 };
        s.castShadow = s.receiveShadow = true;
        scene.add(s);
        stones.push(s);
        list.push(s);
      }
      links[i + '-' + j] = list;
      links[j + '-' + i] = list.slice().reverse();
    }
  }

  // ------------------------------------------------------------------
  // Le voyageur
  // ------------------------------------------------------------------
  const hero = { group: null, body: null, scarf: null, island: 0, route: null, seg: 0, segT: 0, facing: 0, hop: 0, celebrate: 0 };

  function makeHero() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 10), lambert('#6f767c'));
    cloak.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), new THREE.MeshLambertMaterial({ color: '#f4efe8' }));
    head.position.y = 0.57;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.16, 10), lambert('#e9e3d8'));
    hat.position.y = 0.7;
    const scarfMat = lambert('#e59a9a');
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), scarfMat);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.45;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.03), scarfMat);
    tail.position.set(0.04, 0.38, -0.11);
    tail.rotation.x = 0.5;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.66, 5), lambert('#b9a58c'));
    staff.position.set(0.21, 0.31, 0.06);
    staff.rotation.z = -0.1;
    [cloak, head, hat, scarf, tail, staff].forEach((m) => { m.castShadow = true; body.add(m); });
    g.add(body);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    g.add(shadow);
    g.scale.setScalar(1.3);
    scene.add(g);
    Object.assign(hero, { group: g, body, scarf: scarfMat, shadow, tail });
  }

  // point où le voyageur se tient sur une île (côté caméra, à côté du monument)
  function spot(i) {
    const isl = islands[i];
    const a = isl.angle + 0.55;
    const p = isl.group.position;
    return { x: p.x + Math.cos(a) * isl.r * 0.55, z: p.z + Math.sin(a) * isl.r * 0.55, island: i };
  }
  function edge(i, toward) {
    const a = islands[i].group.position, b = islands[toward].group.position;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const k = islands[i].r * 0.8 / d;
    return { x: a.x + dx * k, z: a.z + dz * k, island: i };
  }
  // hauteur et position vivantes d'un point de passage (les îles et pierres bougent)
  function wpPos(wp) {
    if (wp.stone) return new THREE.Vector3(wp.stone.position.x, wp.stone.position.y + 0.1, wp.stone.position.z);
    return new THREE.Vector3(wp.x, islands[wp.island].group.position.y + TOP, wp.z);
  }

  function placeHero(i) {
    hero.island = i;
    hero.route = null;
    const s = spot(i);
    hero.group.position.copy(wpPos(s));
    hero.scarf.color.copy(new THREE.Color(islands[i].game.accent));
  }

  // itinéraire d'île en île par les pierres, dans le sens le plus court praticable
  function travelTo(dest) {
    const n = islands.length;
    if (dest === hero.island && !hero.route) return;
    const from = hero.route ? hero.route[hero.route.length - 1].island : hero.island;
    if (hero.route) placeHero(from); // on termine instantanément l'ancien trajet
    const tryDir = (dir) => {
      const hops = [];
      let i = from;
      while (i !== dest) {
        const j = (i + dir + n) % n;
        if (!links[i + '-' + j]) return null;
        hops.push([i, j]);
        i = j;
      }
      return hops;
    };
    const fwd = tryDir(1), back = tryDir(-1);
    const hops = !fwd ? back : !back ? fwd : (fwd.length <= back.length ? fwd : back);
    if (!hops) { placeHero(dest); return; }
    const route = [Object.assign({}, spot(from), { x: hero.group.position.x, z: hero.group.position.z })];
    hops.forEach(([i, j]) => {
      route.push(edge(i, j));
      links[i + '-' + j].forEach((s) => route.push({ stone: s, island: -1 }));
      route.push(edge(j, i));
    });
    route.push(spot(dest));
    hero.route = route;
    hero.seg = 0;
    hero.segT = 0;
    hero.dest = dest;
  }

  function updateHero(dt, t) {
    const g = hero.group;
    let moving = false, lift = 0;
    if (hero.route) {
      const a = hero.route[hero.seg], b = hero.route[hero.seg + 1];
      const pa = wpPos(a), pb = wpPos(b);
      const isHop = !!(a.stone || b.stone);
      const dist = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const dur = isHop ? 0.36 : Math.max(0.12, dist / 2.2);
      hero.segT += dt / dur;
      const k = Math.min(1, hero.segT);
      g.position.lerpVectors(pa, pb, k);
      if (isHop) { lift = Math.sin(Math.PI * k) * 0.42; g.position.y += lift; }
      hero.facing = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      moving = true;
      if (hero.segT >= 1) {
        if (b.stone) b.stone.userData.dip = 1;
        hero.seg++;
        hero.segT = 0;
        if (hero.seg >= hero.route.length - 1) {
          hero.island = hero.dest;
          hero.route = null;
        }
      }
    } else {
      // au repos : il suit le léger tangage de son île et regarde la caméra
      g.position.copy(wpPos(spot(hero.island)));
      hero.facing = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    }
    if (hero.celebrate > 0) {
      hero.celebrate = Math.max(0, hero.celebrate - dt * 1.8);
      const jump = Math.sin(Math.PI * (1 - hero.celebrate)) * 0.35;
      g.position.y += jump;
      lift += jump;
    }
    // l'ombre reste au sol et rétrécit pendant les sauts
    hero.shadow.position.y = 0.012 - lift / g.scale.y;
    hero.shadow.scale.setScalar(1 - Math.min(0.5, lift));
    // rotation douce vers la direction voulue
    let d = hero.facing - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * (1 - Math.exp(-dt * 8));
    // respiration / pas
    const step = moving ? Math.abs(Math.sin(t * 11)) * 0.05 : 0;
    hero.body.position.y = step;
    hero.body.scale.y = 1 + (moving ? 0 : Math.sin(t * 2.2) * 0.025);
    hero.body.rotation.z = moving ? Math.sin(t * 11) * 0.06 : 0;
    hero.tail.rotation.x = 0.5 + (moving ? 0.5 + Math.sin(t * 14) * 0.25 : Math.sin(t * 1.5) * 0.1);
    // l'écharpe prend la teinte de l'île où il se trouve
    const isl = islands[hero.route ? hero.dest : hero.island];
    hero.scarf.color.lerp(new THREE.Color(isl.game.accent), 1 - Math.exp(-dt * 2));
  }

  // ------------------------------------------------------------------
  // Progression : pièces, arbres, îles débloquées, orbes du jour
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
          m.userData.delay = 0.9 + isl.drops.length * 0.45;
          isl.drops.push(m);
        }
        isl.pieces++;
      }
      // un arbre toutes les trois grilles, quatre au plus
      const wantTrees = Math.min(4, Math.floor(p.solved / 3));
      while (isl.trees < wantTrees) {
        const tr = tree(isl, isl.trees);
        isl.grove.add(tr);
        if (animate) { tr.scale.setScalar(0.01); isl.sprouts.push(tr); }
        isl.trees++;
      }
    });
    if (unlockedChanged || !stones.length) makeStones();
    if (!islands[hero.island].unlocked) placeHero(0);
  }

  // ------------------------------------------------------------------
  // Boucle d'animation
  // ------------------------------------------------------------------
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    tick(dt, now / 1000);
  }

  function tick(dt, t) {
    simTime = t;
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
      const target = isl.unlocked ? 1 : 0.16;
      isl.fade += (target - isl.fade) * (1 - Math.exp(-dt * 0.8));
      isl.fadeMats.forEach((m) => { m.opacity = isl.fade; });
      isl.monument.visible = isl.grove.visible = isl.unlocked;
      isl.orb.position.y = 2.4 + Math.sin(t * 1.3 + isl.phase) * 0.18;
      // chute des nouvelles pièces
      isl.drops = isl.drops.filter((m) => {
        if (m.userData.delay > 0) { m.userData.delay -= dt; return true; }
        m.userData.v = (m.userData.v || 0) + dt * 14;
        m.position.y -= m.userData.v * dt;
        if (m.position.y <= m.userData.targetY) {
          m.position.y = m.userData.targetY;
          C.sfx.place();
          if (hero.island === islands.indexOf(isl) && !hero.route) hero.celebrate = 1;
          return false;
        }
        return true;
      });
      // les jeunes arbres poussent
      isl.sprouts = isl.sprouts.filter((tr) => {
        const s = Math.min(1, tr.scale.x + dt * 0.8);
        tr.scale.setScalar(s);
        return s < 1;
      });
    });
    ripples.forEach(({ ring, island }) => {
      const isl = islands[island];
      const k = ((t * 0.25 + ring.userData.offset) % 2.5) / 2.5;
      const s = ring.userData.base + k * 1.8;
      ring.scale.set(s, s, 1);
      ring.material.opacity = isl.unlocked ? (1 - k) * 0.45 * Math.min(1, k * 6) : 0;
    });
    stones.forEach((s) => {
      s.userData.dip = Math.max(0, s.userData.dip - dt * 3);
      s.position.y = 0.02 + Math.sin(t * 0.7 + s.userData.phase) * 0.03 - Math.sin(s.userData.dip * Math.PI) * 0.06;
    });
    clouds.forEach((c) => {
      const u = c.userData;
      u.a += dt * u.speed;
      c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
      c.rotation.y = -u.a;
    });
    birds.forEach((b) => {
      const u = b.userData;
      u.a += dt * u.speed;
      b.position.set(Math.cos(u.a) * u.rad, u.y + Math.sin(t * 0.7 + u.phase) * 0.4, Math.sin(u.a) * u.rad);
      b.rotation.y = -u.a;
      const flap = Math.sin(t * 6 + u.phase) * 0.5;
      u.l.rotation.z = flap; u.r.rotation.z = -flap;
    });
    motes.rotation.y = t * 0.01;
    motes.position.y = Math.sin(t * 0.2) * 0.3;

    updateHero(dt, t);

    // caméra : dérive lente au repos ; en voyage elle accompagne le voyageur
    if (focused < 0 && !drag) goal.theta += dt * 0.025;
    if (focused >= 0 && hero.route) {
      goal.tx = hero.group.position.x; goal.ty = 0.9; goal.tz = hero.group.position.z;
    } else if (focused >= 0) {
      const p = islands[focused].group.position;
      goal.tx = p.x; goal.ty = 0.9; goal.tz = p.z;
    }
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
  // Interaction : glisser pour tourner, toucher une île pour y aller
  // ------------------------------------------------------------------
  let drag = null;

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
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
    if (i >= 0) focusIsland(i, true, true); else unfocus(true);
  }

  function focusIsland(i, notify, walk) {
    focused = i;
    goal.radius = 9.5;
    goal.elev = 0.42;
    goal.theta = islands[i].angle; // la caméra se place côté large, regard vers le centre
    if (walk) travelTo(i); else placeHero(i);
    C.sfx.tap();
    try { localStorage.setItem('odysseum.here', String(i)); } catch (e) { /* ignore */ }
    if (notify && opts.onFocus) opts.onFocus(islands[i].game.id);
  }
  function unfocus(notify) {
    if (focused < 0) return;
    focused = -1;
    goal.tx = goal.ty = goal.tz = 0;
    goal.radius = overview;
    goal.elev = 0.8;
    if (notify && opts.onFocus) opts.onFocus(null);
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 50 : 40;
    camera.updateProjectionMatrix();
    overview = w < h ? 44 : 30; // en portrait on recule pour voir tout l'archipel
    if (focused < 0) goal.radius = overview;
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
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    makeSky();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9c6ca', 0.5));
    const sun = new THREE.DirectionalLight('#fff4e6', 0.62);
    sun.position.set(10, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
    scene.add(sun);

    makeSea();
    makeClouds();
    makeBirds();
    makeMotes();
    islands = options.games.map((g, i) => makeIsland(g, i, options.games.length));
    makeHero();
    let here = 0;
    try { here = +(localStorage.getItem('odysseum.here') || 0) || 0; } catch (e) { /* ignore */ }
    placeHero(Math.min(here, islands.length - 1));

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
  World.focus = (id) => { const i = islands.findIndex((x) => x.game.id === id); if (i >= 0) focusIsland(i, false, false); };
  World.unfocus = () => unfocus(false);
  World.go = (id) => { const i = islands.findIndex((x) => x.game.id === id); if (i >= 0) focusIsland(i, false, true); };
  World.debug = () => ({
    island: hero.island, route: hero.route ? hero.route.length : 0, seg: hero.seg,
    pos: hero.group.position.toArray().map((v) => +v.toFixed(2)), stones: stones.length
  });
  World.start = function () {
    if (!World.ok || running) return;
    running = true;
    last = performance.now();
    resize();
    raf = requestAnimationFrame(frame);
  };
  World.stop = function () { running = false; cancelAnimationFrame(raf); };
  // outil de test : avance l'animation de `sec` secondes sans attendre l'écran
  World.advance = function (sec) {
    for (let i = 0; i < sec * 30; i++) tick(1 / 30, simTime + 1 / 30);
  };

  document.addEventListener('visibilitychange', () => {
    if (!World.ok) return;
    if (document.hidden) { if (running) { World.stop(); World._paused = true; } }
    else if (World._paused) { World._paused = false; World.start(); }
  });

  C.world = World;
})();
