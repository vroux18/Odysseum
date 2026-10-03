// Odysseum — le monde en 3D (Three.js r128).
// Un sentier de pierres traverse une chaîne d'îles sans fin. Chaque pierre est un
// niveau (un mini-jeu) ; chaque île compte PER niveaux dont le dernier est un boss.
// Battre le boss ouvre la porte de l'île et fait remonter les pierres de gué vers
// l'île suivante. Le voyageur avance de pierre en pierre.
(function () {
  'use strict';
  const C = window.Carnet;

  const PER = 10;          // niveaux par île (le dernier est le boss)
  const FOG = '#e9eeee';
  const TOP = 0.63;        // hauteur du sol des îles
  const SPACING = 11;      // distance entre deux îles

  const World = { ok: false, PER };
  let THREE, renderer, scene, camera, host, sun, raf = 0, running = false, last = 0, simTime = 0;
  let sea, seaPos, seaBase, motes, clouds = [], birds = [], pulse, marker;
  const chapters = [];
  let opts = null, done = 0, selected = 0, userTheta = 0, holdTheta = 0;
  const cam = { theta: Math.PI + 0.5, elev: 1.1, radius: 70, tx: 0, ty: 0, tz: 0 };
  const goal = { theta: Math.PI + 0.5, elev: 0.6, radius: 12, tx: 0, ty: 0.6, tz: 0 };

  function supported() {
    if (!window.THREE) return false;
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch (e) { return false; }
  }

  const tint = (hex, amount) => new THREE.Color('#fbfaf7').lerp(new THREE.Color(hex), amount);
  const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, extra || {}));
  const chapterOf = (L) => Math.floor(L / PER);

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

  // Icône du mini-jeu dessinée dans une pastille, pour flotter au-dessus du sentier.
  const iconCache = {};
  function iconTexture(id, accent, boss) {
    const key = id + (boss ? ':boss' : '');
    if (iconCache[key]) return iconCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    const paintDisc = () => {
      g.clearRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,.92)';
      g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
      if (boss) {
        g.strokeStyle = accent; g.lineWidth = 3;
        g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
      }
    };
    paintDisc();
    const inner = (opts.iconSvg(id) || '').replace(/class="f"/g, 'fill="' + accent + '" stroke="none"');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128" fill="none" stroke="' + accent +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    const img = new Image();
    img.onload = () => { paintDisc(); g.drawImage(img, 34, 34, 60, 60); tex.needsUpdate = true; };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    iconCache[key] = tex;
    return tex;
  }

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
    scene.fog = new THREE.Fog(FOG, 18, 60);
  }

  const SEA_SIZE = 110, SEA_SEG = 44;
  function makeSea() {
    const geo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEG, SEA_SEG);
    geo.rotateX(-Math.PI / 2);
    seaPos = geo.attributes.position;
    seaBase = Float32Array.from(seaPos.array);
    sea = new THREE.Mesh(geo, lambert('#cfdcdf'));
    sea.receiveShadow = true;
    scene.add(sea);
  }

  function makeClouds() {
    const mat = lambert('#ffffff', { transparent: true, opacity: 0.9 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const s = 0.9 + Math.random() * 0.9;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
        m.position.set(k * 1.1 - puffs * 0.5, Math.random() * 0.4, (Math.random() - 0.5) * 0.8);
        m.scale.y = 0.55;
        g.add(m);
      }
      g.userData = { a: (i / 6) * Math.PI * 2, r: 14 + Math.random() * 12, y: 8 + Math.random() * 4, speed: 0.01 + Math.random() * 0.01 };
      scene.add(g);
      clouds.push(g);
    }
  }

  function makeBirds() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.5, 0.12); shape.lineTo(0.08, 0.16); shape.lineTo(0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: '#8a9399', side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1;
      b.add(l, r);
      b.userData = { l, r, a: i * 2.1, rad: 9 + i * 3, y: 5 + i * 0.8, speed: 0.15 + i * 0.03, phase: i };
      scene.add(b);
      birds.push(b);
    }
  }

  function makeMotes() {
    const count = 120;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (Math.random() - 0.5) * 40;
      p[i * 3 + 1] = Math.random() * 8 + 0.5;
      p[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    motes = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.12, map: glowTexture(), color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false
    }));
    scene.add(motes);
  }

  // ------------------------------------------------------------------
  // Géographie : la chaîne d'îles
  // ------------------------------------------------------------------
  function centerOf(c) { return new THREE.Vector3(c * SPACING, 0, Math.sin(c * 1.15) * 5.5); }
  function radiusOf(c) { return 3.3 + C.makeRng('rayon:' + c)() * 0.5; }
  function flat(v) { v.y = 0; return v.normalize(); }
  function entryOf(c) {
    const ctr = centerOf(c);
    const prev = c > 0 ? centerOf(c - 1) : ctr.clone().add(new THREE.Vector3(-SPACING, 0, 0));
    return ctr.clone().add(flat(prev.sub(ctr)).multiplyScalar(radiusOf(c) * 0.8));
  }
  function exitOf(c) {
    const ctr = centerOf(c);
    return ctr.clone().add(flat(centerOf(c + 1).sub(ctr)).multiplyScalar(radiusOf(c) * 0.8));
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

  function buildChapter(c) {
    const rng = C.makeRng('ile:' + c);
    const r = radiusOf(c);
    const ctr = centerOf(c);
    const accent = opts.levelInfo(c * PER).accent;
    const group = new THREE.Group();
    group.position.copy(ctr);
    const fadeMats = [];

    const rock = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(r, r * 0.62, 3, 12, 2), rng, 0.4),
      lambert('#f2efe8', { transparent: true }));
    rock.position.y = -1.0;
    rock.castShadow = rock.receiveShadow = true;
    const meadow = new THREE.Mesh(jitterGeometry(new THREE.CylinderGeometry(r * 0.92, r * 0.96, 0.16, 12), rng, 0.18),
      lambert(tint(accent, 0.3), { transparent: true }));
    meadow.position.y = 0.55;
    meadow.receiveShadow = true;
    group.add(rock, meadow);
    fadeMats.push(rock.material, meadow.material);

    const pebbleMat = lambert('#f3f2ee', { transparent: true });
    fadeMats.push(pebbleMat);
    for (let k = 0; k < 9; k++) {
      const a = rng() * Math.PI * 2;
      const pebble = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rng() * 0.25, 0), pebbleMat);
      pebble.position.set(Math.cos(a) * (r + 0.25), 0.02, Math.sin(a) * (r + 0.25));
      pebble.scale.y = 0.6;
      pebble.castShadow = true;
      group.add(pebble);
    }

    // le sentier : une courbe en S de l'entrée vers la sortie de l'île
    const entry = entryOf(c).sub(ctr), exit = exitOf(c).sub(ctr);
    const perp = new THREE.Vector3(-(exit.z - entry.z), 0, exit.x - entry.x).normalize();
    const flip = c % 2 ? -1 : 1;
    const nodes = [];
    const dotMat = lambert('#e7e3da', { transparent: true });
    fadeMats.push(dotMat);
    for (let k = 0; k < PER; k++) {
      const t = 0.03 + (k / (PER - 1)) * 0.86;
      const local = entry.clone().lerp(exit, t).add(perp.clone().multiplyScalar(Math.sin(t * Math.PI * 2) * r * 0.3 * flip));
      const boss = k === PER - 1;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(boss ? 0.42 : 0.27, boss ? 0.46 : 0.3, 0.1, boss ? 10 : 8),
        lambert('#f4f2ed', { transparent: true }));
      mesh.position.set(local.x, TOP + 0.03, local.z);
      mesh.receiveShadow = mesh.castShadow = true;
      mesh.userData.level = c * PER + k;
      group.add(mesh);
      nodes.push({ mesh, local });
    }
    // petits points de sentier entre les pierres
    for (let k = 0; k + 1 < PER; k++) {
      for (let j = 1; j <= 2; j++) {
        const p = nodes[k].local.clone().lerp(nodes[k + 1].local, j / 3);
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 6), dotMat);
        dot.position.set(p.x, TOP + 0.01, p.z);
        group.add(dot);
      }
    }

    // la porte du boss, au bout du sentier
    const gate = new THREE.Group();
    gate.position.set(exit.x, TOP, exit.z);
    gate.lookAt(new THREE.Vector3(centerOf(c + 1).x, TOP, centerOf(c + 1).z).sub(ctr));
    const pillarMat = lambert('#f7f5f0');
    const lintelMat = lambert('#f7f5f0');
    [-0.62, 0.62].forEach((x) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.2), pillarMat);
      p.position.set(x, 0.85, 0);
      p.castShadow = true;
      gate.add(p);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.3), lintelMat);
    lintel.position.y = 1.78;
    lintel.castShadow = true;
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 1.6),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    veil.position.y = 0.85;
    gate.add(lintel, veil);
    group.add(gate);

    // pierres de gué vers l'île suivante (immergées tant que le boss n'est pas battu)
    const stones = [];
    const from = exitOf(c), to = entryOf(c + 1);
    const d = from.distanceTo(to);
    const count = Math.max(3, Math.floor(d / 1.0));
    for (let k = 1; k <= count; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.22, 7), lambert('#f7f6f2'));
      s.position.lerpVectors(from, to, k / (count + 1));
      s.userData = { phase: k + c, dip: 0, raise: 0 };
      s.castShadow = s.receiveShadow = true;
      scene.add(s);
      stones.push(s);
    }

    // ondes autour de l'île
    const ripples = [];
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.04, 48),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ctr.x, 0.06, ctr.z);
      ring.userData = { base: r * 1.02, offset: k * 2.5 + rng() * 2 };
      scene.add(ring);
      ripples.push(ring);
    }

    const grove = new THREE.Group();
    grove.position.y = TOP;
    group.add(grove);

    scene.add(group);
    const ch = {
      c, group, r, rng, accent, nodes, gate, veil, lintel, lintelMat, stones, ripples, grove, fadeMats,
      fade: 0.2, phase: rng() * 6.28, trees: 0, sprouts: [], open: 0
    };
    chapters[c] = ch;
    return ch;
  }

  function tree(ch) {
    const g = new THREE.Group();
    const h = 0.55 + ch.rng() * 0.4;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.22 + ch.rng() * 0.1, h, 7), lambert(tint(ch.accent, 0.45)));
    crown.position.y = 0.12 + h / 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 5), lambert('#c9b8a3'));
    trunk.position.y = 0.07;
    crown.castShadow = trunk.castShadow = true;
    g.add(crown, trunk);
    // loin du sentier
    for (let tries = 0; tries < 30; tries++) {
      const a = ch.rng() * Math.PI * 2, d = ch.r * (0.35 + ch.rng() * 0.45);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (ch.nodes.every((n) => Math.hypot(n.local.x - x, n.local.z - z) > 0.75)) { g.position.set(x, 0, z); break; }
    }
    return g;
  }

  // ------------------------------------------------------------------
  // États : niveaux faits / en cours / à venir, portes, pierres de gué
  // ------------------------------------------------------------------
  function ensureChapters() {
    const need = chapterOf(done) + 1; // l'île suivante attend dans la brume
    for (let c = 0; c <= need; c++) if (!chapters[c]) buildChapter(c);
  }

  function refresh(animate) {
    ensureChapters();
    chapters.forEach((ch) => {
      if (!ch) return;
      ch.nodes.forEach((n, k) => {
        const L = ch.c * PER + k;
        const info = opts.levelInfo(L);
        const m = n.mesh.material;
        if (L < done) { m.color.copy(tint(info.accent, 0.65)); n.mesh.userData.alpha = 1; }
        else if (L === done) { m.color.set('#ffffff'); n.mesh.userData.alpha = 1; }
        else { m.color.set('#f1efe9'); n.mesh.userData.alpha = 0.55; }
      });
      const beaten = done > ch.c * PER + PER - 1;
      if (beaten && !ch.opened) {
        ch.opened = true;
        ch.lintelMat.color.copy(tint(ch.accent, 0.6));
        ch.stones.forEach((s, i) => { s.userData.delay = animate ? 0.9 + i * 0.18 : 0; if (!animate) s.userData.raise = 1; });
      }
      const wantTrees = Math.min(4, Math.floor(Math.max(0, Math.min(PER, done - ch.c * PER)) / 3));
      while (ch.trees < wantTrees) {
        const tr = tree(ch);
        ch.grove.add(tr);
        if (animate) { tr.scale.setScalar(0.01); ch.sprouts.push(tr); }
        ch.trees++;
      }
    });
  }

  function nodePos(L) {
    const ch = chapters[chapterOf(L)];
    const n = ch.nodes[L % PER];
    return new THREE.Vector3(ch.group.position.x + n.local.x, ch.group.position.y + TOP + 0.08, ch.group.position.z + n.local.z);
  }
  function groundPos(c, worldVec) {
    return new THREE.Vector3(worldVec.x, chapters[c].group.position.y + TOP, worldVec.z);
  }
  // direction du sentier au niveau L (pour placer la caméra derrière le voyageur)
  function pathDir(L) {
    const a = nodePos(Math.max(0, L - 1)), b = nodePos(L + 1 < (chapters.length) * PER && chapters[chapterOf(L + 1)] ? L + 1 : L);
    const d = b.sub(a); d.y = 0;
    return d.lengthSq() > 0.001 ? d.normalize() : new THREE.Vector3(1, 0, 0);
  }

  // ------------------------------------------------------------------
  // Le voyageur
  // ------------------------------------------------------------------
  // free : endroit où il se promène hors du sentier ({ c, at }), sinon il est sur la pierre `selected`
  const hero = { group: null, body: null, scarf: null, route: null, seg: 0, segT: 0, facing: 0, celebrate: 0, wait: 0, free: null };

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
    g.scale.setScalar(1.15);
    scene.add(g);
    Object.assign(hero, { group: g, body, scarf: scarfMat, shadow, tail });
  }

  // point de passage → position vivante (les îles tanguent, les pierres flottent)
  function wpPos(wp) {
    if (wp.level != null) return nodePos(wp.level);
    if (wp.stone) return new THREE.Vector3(wp.stone.position.x, wp.stone.position.y + 0.11, wp.stone.position.z);
    return groundPos(wp.c, wp.at);
  }

  // itinéraire de pierre en pierre ; entre deux îles on passe la porte puis le gué
  function routeBetween(a, b) {
    const route = [{ level: a }];
    const dir = b > a ? 1 : -1;
    for (let L = a; L !== b; L += dir) {
      const n = L + dir;
      if (chapterOf(n) !== chapterOf(L)) {
        const c = Math.min(chapterOf(n), chapterOf(L));
        const leg = [{ c, at: exitOf(c) }]
          .concat(chapters[c].stones.map((s) => ({ stone: s })))
          .concat([{ c: c + 1, at: entryOf(c + 1) }]);
        route.push(...(dir > 0 ? leg : leg.reverse()));
      }
      route.push({ level: n });
    }
    return route;
  }

  // pierre la plus proche d'un point, parmi les niveaux accessibles d'une île
  function nearestNode(c, at) {
    let best = c * PER, bd = Infinity;
    for (let L = c * PER; L < c * PER + PER && L <= done; L++) {
      const p = nodePos(L);
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

  // point de départ d'un trajet : la pierre où l'on se tient, ou l'endroit où l'on se promène
  function startLeg() {
    if (hero.route) { // un trajet en cours : on repart de là où il mène
      const end = hero.route[hero.route.length - 1];
      hero.route = null;
      if (end.level != null) { selected = end.level; hero.free = null; } else hero.free = { c: end.c, at: end.at };
    }
    if (!hero.free) return { route: [{ level: selected }], node: selected };
    const n = nearestNode(hero.free.c, hero.free.at);
    return { route: [{ c: hero.free.c, at: hero.free.at.clone() }, { level: n }], node: n };
  }

  function go(route, delay) {
    // on retire les doublons consécutifs (même pierre)
    route = route.filter((wp, i) => i === 0 || wp.level == null || route[i - 1].level !== wp.level);
    if (route.length < 2) { hero.route = null; return; }
    hero.route = route;
    hero.seg = 0;
    hero.segT = 0;
    hero.wait = delay || 0;
  }

  // aller jusqu'à la pierre d'un niveau
  function travelTo(L, delay) {
    const s = startLeg();
    if (Math.abs(L - s.node) > 14 || !chapters[chapterOf(L)]) { // trop loin : on y va directement
      hero.route = null; hero.free = null; selected = L;
      setMarker();
      if (opts.onSelect) opts.onSelect(L);
      return;
    }
    go(s.route.concat(routeBetween(s.node, L).slice(1)), delay);
  }

  // se promener librement jusqu'à un point du sol d'une île
  function wanderTo(c, at) {
    const s = startLeg();
    const here = hero.free ? hero.free.c : chapterOf(s.node);
    if (c === here) {
      go([s.route[0], { c, at }]); // même île : on y va tout droit
    } else {
      const target = nearestNode(c, at);
      const first = hero.free ? s.route : [{ level: s.node }];
      go(first.concat(routeBetween(s.node, target).slice(1)).concat([{ c, at }]));
    }
    if (opts.onSelect) opts.onSelect(null);
  }

  function updateHero(dt, t) {
    const g = hero.group;
    let moving = false, lift = 0;
    if (hero.wait > 0) hero.wait -= dt;
    else if (hero.route) {
      const a = hero.route[hero.seg], b = hero.route[hero.seg + 1];
      const pa = wpPos(a), pb = wpPos(b);
      // on marche sur le sol ; on saute de pierre en pierre
      const isWalk = !(a.stone || b.stone) && !(a.level != null && b.level != null);
      const dist = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const dur = isWalk ? Math.max(0.15, dist / 2.2) : 0.3 + dist * 0.05;
      hero.segT += dt / dur;
      const k = Math.min(1, hero.segT);
      g.position.lerpVectors(pa, pb, k);
      if (!isWalk) { lift = Math.sin(Math.PI * k) * (0.28 + dist * 0.06); g.position.y += lift; }
      hero.facing = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      moving = true;
      if (hero.segT >= 1) {
        if (b.stone) b.stone.userData.dip = 1;
        if (b.level != null) C.sfx.tap();
        hero.seg++;
        hero.segT = 0;
        if (hero.seg >= hero.route.length - 1) {
          const end = hero.route[hero.route.length - 1];
          hero.route = null;
          if (end.level != null) {
            hero.free = null;
            selected = end.level;
            setMarker();
            if (opts.onSelect) opts.onSelect(selected);
          } else {
            hero.free = { c: end.c, at: end.at };
          }
        }
      }
    }
    if (!moving) {
      g.position.copy(hero.free ? groundPos(hero.free.c, hero.free.at) : nodePos(selected));
      hero.facing = Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z);
    }
    if (hero.celebrate > 0) {
      hero.celebrate = Math.max(0, hero.celebrate - dt * 1.8);
      const jump = Math.sin(Math.PI * (1 - hero.celebrate)) * 0.35;
      g.position.y += jump;
      lift += jump;
    }
    hero.shadow.position.y = 0.012 - lift / g.scale.y;
    hero.shadow.scale.setScalar(1 - Math.min(0.5, lift));
    let d = hero.facing - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * (1 - Math.exp(-dt * 8));
    const step = moving ? Math.abs(Math.sin(t * 11)) * 0.04 : 0;
    hero.body.position.y = step;
    hero.body.scale.y = 1 + (moving ? 0 : Math.sin(t * 2.2) * 0.025);
    hero.body.rotation.z = moving ? Math.sin(t * 11) * 0.06 : 0;
    hero.tail.rotation.x = 0.5 + (moving ? 0.5 + Math.sin(t * 14) * 0.25 : Math.sin(t * 1.5) * 0.1);
    hero.scarf.color.lerp(new THREE.Color(opts.levelInfo(selected).accent), 1 - Math.exp(-dt * 2));
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
    const focus = hero.group.position;

    // la mer suit la caméra par pas de maille (sans faire glisser la houle)
    const cell = SEA_SIZE / SEA_SEG;
    sea.position.set(Math.round(cam.tx / cell) * cell, 0, Math.round(cam.tz / cell) * cell);
    for (let i = 0; i < seaPos.count; i++) {
      const x = seaBase[i * 3] + sea.position.x, z = seaBase[i * 3 + 2] + sea.position.z;
      seaPos.setY(i, Math.sin(x * 0.25 + t * 0.6) * 0.09 + Math.cos(z * 0.3 + t * 0.45) * 0.08 - 0.05);
    }
    seaPos.needsUpdate = true;
    sea.geometry.computeVertexNormals();

    chapters.forEach((ch) => {
      if (!ch) return;
      ch.group.position.y = Math.sin(t * 0.5 + ch.phase) * 0.04;
      const reached = done >= ch.c * PER;
      ch.fade += ((reached ? 1 : 0.22) - ch.fade) * (1 - Math.exp(-dt * 0.8));
      ch.fadeMats.forEach((m) => { m.opacity = ch.fade; });
      ch.nodes.forEach((n) => {
        n.mesh.material.opacity = Math.min(ch.fade, n.mesh.userData.alpha == null ? 1 : n.mesh.userData.alpha);
      });
      ch.grove.visible = reached;
      ch.gate.visible = ch.fade > 0.3;
      // la porte s'ouvre : le voile se dissipe
      if (ch.opened) ch.open = Math.min(1, ch.open + dt * 0.6);
      ch.veil.material.opacity = 0.32 * (1 - ch.open) * (0.85 + Math.sin(t * 2) * 0.15);
      ch.veil.visible = ch.open < 1;
      ch.stones.forEach((s) => {
        const u = s.userData;
        if (ch.opened) {
          if (u.delay > 0) u.delay -= dt;
          else u.raise = Math.min(1, u.raise + dt * 1.4);
        }
        u.dip = Math.max(0, u.dip - dt * 3);
        const ease = 1 - Math.pow(1 - u.raise, 3);
        s.position.y = -1.3 + ease * 1.32 + Math.sin(t * 0.7 + u.phase) * 0.03 * ease - Math.sin(u.dip * Math.PI) * 0.06;
        s.visible = u.raise > 0;
      });
      ch.ripples.forEach((ring) => {
        const k = ((t * 0.25 + ring.userData.offset) % 2.5) / 2.5;
        const s = ring.userData.base + k * 1.8;
        ring.scale.set(s, s, 1);
        ring.material.opacity = reached ? (1 - k) * 0.45 * Math.min(1, k * 6) : 0;
      });
      ch.sprouts = ch.sprouts.filter((tr) => {
        const s = Math.min(1, tr.scale.x + dt * 0.8);
        tr.scale.setScalar(s);
        return s < 1;
      });
    });

    // la pierre du prochain niveau respire ; l'icône du mini-jeu flotte au-dessus de la pierre choisie
    const cur = chapters[chapterOf(done)] && nodePos(done);
    pulse.visible = !!cur;
    if (cur) {
      const k = (t * 0.6) % 1;
      pulse.position.set(cur.x, cur.y - 0.02, cur.z);
      pulse.scale.setScalar(0.4 + k * 0.7);
      pulse.material.opacity = (1 - k) * 0.7;
      pulse.material.color.set(opts.levelInfo(done).accent);
    }
    const sel = nodePos(selected);
    marker.position.set(sel.x, sel.y + 1.55 + Math.sin(t * 1.6) * 0.08, sel.z);
    marker.material.opacity += ((hero.route || hero.free ? 0 : 1) - marker.material.opacity) * (1 - Math.exp(-dt * 5));

    clouds.forEach((c) => {
      const u = c.userData;
      u.a += dt * u.speed;
      c.position.set(focus.x + Math.cos(u.a) * u.r, u.y, focus.z + Math.sin(u.a) * u.r);
      c.rotation.y = -u.a;
    });
    birds.forEach((b) => {
      const u = b.userData;
      u.a += dt * u.speed;
      b.position.set(focus.x + Math.cos(u.a) * u.rad, u.y + Math.sin(t * 0.7 + u.phase) * 0.4, focus.z + Math.sin(u.a) * u.rad);
      b.rotation.y = -u.a;
      const flap = Math.sin(t * 6 + u.phase) * 0.5;
      u.l.rotation.z = flap; u.r.rotation.z = -flap;
    });
    motes.position.set(focus.x, Math.sin(t * 0.2) * 0.3, focus.z);
    motes.rotation.y = t * 0.01;

    updateHero(dt, t);

    // caméra : derrière le voyageur, dans le sens du sentier
    const dir = pathDir(selected);
    if (holdTheta > 0) holdTheta -= dt; else userTheta *= 1 - Math.min(1, dt * 0.4);
    goal.theta = Math.atan2(-dir.z, -dir.x) + 0.55 + userTheta;
    goal.tx = focus.x + dir.x * 1.6; goal.ty = 0.7; goal.tz = focus.z + dir.z * 1.6;
    const k = 1 - Math.exp(-dt * 2);
    let dth = goal.theta - cam.theta;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    cam.theta += dth * k;
    ['elev', 'radius', 'tx', 'ty', 'tz'].forEach((key) => { cam[key] += (goal[key] - cam[key]) * k; });
    const ce = Math.cos(cam.elev);
    camera.position.set(
      cam.tx + Math.cos(cam.theta) * ce * cam.radius,
      cam.ty + Math.sin(cam.elev) * cam.radius,
      cam.tz + Math.sin(cam.theta) * ce * cam.radius
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    sun.position.set(cam.tx + 10, 18, cam.tz + 8);
    sun.target.position.set(cam.tx, 0, cam.tz);
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------------
  // Interaction : glisser pour tourner / zoomer, toucher une pierre franchie
  // ------------------------------------------------------------------
  let drag = null;

  function pick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(v, camera);
    const meshes = [];
    chapters.forEach((ch) => ch && ch.nodes.forEach((n) => meshes.push(n.mesh)));
    const hit = rc.intersectObjects(meshes, false)[0];
    if (hit) return hit.object.userData.level;
    // tolérance : la pierre la plus proche du point touché sur le sol
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP);
    const p = new THREE.Vector3();
    if (!rc.ray.intersectPlane(plane, p)) return -1;
    let best = -1, bd = 0.55;
    meshes.forEach((m) => {
      const w = new THREE.Vector3();
      m.getWorldPosition(w);
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bd) { bd = d; best = m.userData.level; }
    });
    return best;
  }

  function onDown(e) {
    drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, theta: userTheta, radius: goal.radius };
    renderer.domElement.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved > 8) {
      userTheta = drag.theta + dx * 0.006;
      holdTheta = 3;
      goal.radius = Math.max(7, Math.min(34, drag.radius + dy * 0.04));
      goal.elev = 0.45 + (goal.radius - 7) / 27 * 0.6;
    }
  }
  function onUp(e) {
    if (!drag) return;
    const tap = drag.moved < 8 && performance.now() - drag.t < 400;
    drag = null;
    if (!tap) return;
    const L = pick(e);
    if (L >= 0 && L <= done) { travelTo(L); C.sfx.tap(); return; }
    // sinon : promenade libre sur le sol d'une île déjà atteinte
    const p = groundPoint(e);
    if (!p) return;
    chapters.forEach((ch) => {
      if (!ch || done < ch.c * PER) return;
      const d = Math.hypot(p.x - ch.group.position.x, p.z - ch.group.position.z);
      if (d < ch.r * 0.85) wanderTo(ch.c, new THREE.Vector3(p.x, 0, p.z));
    });
  }

  function groundPoint(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(v, camera);
    const p = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), p) ? p : null;
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 55 : 42;
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
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    makeSky();
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9c6ca', 0.5));
    sun = new THREE.DirectionalLight('#fff4e6', 0.62);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    scene.add(sun, sun.target);

    makeSea();
    makeClouds();
    makeBirds();
    makeMotes();

    pulse = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
    pulse.rotation.x = -Math.PI / 2;
    scene.add(pulse);
    marker = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    marker.scale.set(0.75, 0.75, 1);
    scene.add(marker);

    done = options.done || 0;
    selected = Math.min(options.selected != null ? options.selected : done, done);
    refresh(false);
    makeHero();
    setMarker();

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

  function setMarker() {
    const info = opts.levelInfo(selected);
    marker.material.map = iconTexture(info.id, info.accent, info.boss);
    marker.material.needsUpdate = true;
    marker.scale.setScalar(info.boss ? 0.95 : 0.75);
  }

  // Le joueur a progressé : la porte s'ouvre si besoin, puis le voyageur avance.
  World.progress = function (newDone, animate) {
    const crossed = chapterOf(newDone) > chapterOf(done);
    const prevDone = done;
    done = newDone;
    refresh(animate);
    if (animate && newDone > prevDone) {
      hero.celebrate = 1;
      travelTo(newDone, crossed ? 2.4 : 0.9);
    } else {
      selected = Math.min(selected, done);
    }
    setMarker();
  };
  World.select = function (L) { travelTo(Math.min(L, done)); setMarker(); };
  World.selected = () => selected;
  World.start = function () {
    if (!World.ok || running) return;
    running = true;
    last = performance.now();
    resize();
    raf = requestAnimationFrame(frame);
  };
  World.stop = function () { running = false; cancelAnimationFrame(raf); };
  World.refreshMarker = setMarker;
  // outils de test
  World.advance = function (sec) { for (let i = 0; i < sec * 30; i++) tick(1 / 30, simTime + 1 / 30); };
  World.wander = (c, dx, dz) => { const p = centerOf(c); wanderTo(c, new THREE.Vector3(p.x + dx, 0, p.z + dz)); };
  World.debug = () => ({ done, selected, free: !!hero.free, route: hero.route ? hero.route.length : 0, seg: hero.seg, chapters: chapters.length,
    pos: hero.group.position.toArray().map((v) => +v.toFixed(2)) });

  document.addEventListener('visibilitychange', () => {
    if (!World.ok) return;
    if (document.hidden) { if (running) { World.stop(); World._paused = true; } }
    else if (World._paused) { World._paused = false; World.start(); }
  });

  C.world = World;
})();
