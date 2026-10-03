// Odysseum — le monde en 3D (Three.js r128).
// Une chaîne d'îles sans fin. Sur chaque île, un sentier serpente entre PER
// niveaux répartis sur tout le relief ; le dernier est un boss. Battre le boss
// ouvre le portique et fait remonter les pierres de gué vers l'île suivante.
// Chaque île a son ambiance (pinède, ruines, jardin, dunes), ses moutons, ses fleurs.
(function () {
  'use strict';
  const C = window.Carnet;

  const PER = 10;          // niveaux par île (le dernier est le boss)
  const FOG = '#e9eeee';
  const TOP = 0.63;        // hauteur du sol au bord des îles
  const SPACING = 15;      // distance entre deux îles
  const THEMES = ['pinede', 'ruines', 'jardin', 'dunes'];

  const World = { ok: false, PER };
  let THREE, renderer, scene, camera, host, sun, raf = 0, running = false, last = 0, simTime = 0;
  let sea, seaPos, seaBase, motes, clouds = [], birds = [], boat, pulse, marker;
  const chapters = [];
  let opts = null, done = 0, selected = 0, userTheta = 0, holdTheta = 0;
  const cam = { theta: Math.PI + 0.5, elev: 1.1, radius: 70, tx: 0, ty: 0, tz: 0 };
  const goal = { theta: Math.PI + 0.5, elev: 0.62, radius: 12.5, tx: 0, ty: 0.8, tz: 0 };

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
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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

  // Icône du mini-jeu dans une pastille, qui flotte au-dessus de la pierre choisie.
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
      g.fillStyle = 'rgba(255,255,255,.94)';
      g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
      if (boss) { g.strokeStyle = accent; g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 59, 0, Math.PI * 2); g.stroke(); }
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
  // Décor global : ciel, mer, nuages, oiseaux, voilier, poussières de lumière
  // ------------------------------------------------------------------
  function makeSky() {
    scene.background = canvasTexture(4, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#d3e1e7');
      grd.addColorStop(0.5, '#eef2f1');
      grd.addColorStop(1, FOG);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    scene.fog = new THREE.Fog(FOG, 22, 72);
  }

  const SEA_SIZE = 130, SEA_SEG = 48;
  function makeSea() {
    const geo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEG, SEA_SEG);
    geo.rotateX(-Math.PI / 2);
    seaPos = geo.attributes.position;
    seaBase = Float32Array.from(seaPos.array);
    sea = new THREE.Mesh(geo, lambert('#cbdadd'));
    sea.receiveShadow = true;
    scene.add(sea);
  }

  function makeClouds() {
    const mat = lambert('#ffffff', { transparent: true, opacity: 0.92 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const s = 0.9 + Math.random() * 1.0;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), mat);
        m.position.set(k * 1.15 - puffs * 0.5, Math.random() * 0.4, (Math.random() - 0.5) * 0.8);
        m.scale.y = 0.55;
        g.add(m);
      }
      g.userData = { a: (i / 7) * Math.PI * 2, r: 16 + Math.random() * 14, y: 9 + Math.random() * 4, speed: 0.008 + Math.random() * 0.01 };
      scene.add(g);
      clouds.push(g);
    }
  }

  function makeBirds() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0.5, 0.12); shape.lineTo(0.08, 0.16); shape.lineTo(0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({ color: '#8a9399', side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
      r.scale.x = -1;
      b.add(l, r);
      b.userData = { l, r, a: i * 1.6, rad: 9 + i * 2.5, y: 6 + i * 0.7, speed: 0.13 + i * 0.03, phase: i };
      scene.add(b);
      birds.push(b);
    }
  }

  // un petit voilier qui longe l'archipel
  function makeBoat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.28, 0.32, 6, 1), lambert('#d9cbb6'));
    hull.scale.set(1, 1, 0.45);
    hull.position.y = 0.12;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), lambert('#b9a58c'));
    mast.position.y = 0.95;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(0, 1.15); shape.lineTo(0.7, 0.05); shape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: '#fbfaf6', side: THREE.DoubleSide }));
    sail.position.set(0.03, 0.32, 0);
    sail.rotation.y = Math.PI / 2;
    [hull, mast, sail].forEach((m) => { m.castShadow = true; g.add(m); });
    g.scale.setScalar(1.2);
    scene.add(g);
    boat = g;
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
  // Géographie : la chaîne d'îles et leur relief
  // ------------------------------------------------------------------
  function centerOf(c) { return new THREE.Vector3(c * SPACING, 0, Math.sin(c * 1.15) * 7); }
  function radiusOf(c) { return 4.9 + C.makeRng('rayon:' + c)() * 0.6; }
  function flat(v) { v.y = 0; return v.normalize(); }
  function edgeToward(c, other, k) {
    const ctr = centerOf(c);
    return ctr.clone().add(flat(other.clone().sub(ctr)).multiplyScalar(radiusOf(c) * k));
  }
  const entryOf = (c, k) => edgeToward(c, c > 0 ? centerOf(c - 1) : centerOf(c).add(new THREE.Vector3(-SPACING, 0, 0)), k || 0.84);
  const exitOf = (c, k) => edgeToward(c, centerOf(c + 1), k || 0.84);

  // collines : quelques bosses douces qui s'aplatissent vers le rivage
  function heightLocal(ch, x, z) {
    let h = 0;
    ch.hills.forEach((b) => {
      const d2 = (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z);
      h += b.a * Math.exp(-d2 / (2 * b.s * b.s));
    });
    const d = Math.hypot(x, z) / ch.r;
    return TOP + h * (1 - smooth(0.7, 1.0, d)) + Math.sin(x * 2.1 + z * 1.3) * 0.03 * (1 - d);
  }
  // hauteur du sol en coordonnées monde (null au-dessus de l'eau)
  function worldHeight(x, z) {
    for (const ch of chapters) {
      if (!ch) continue;
      const lx = x - ch.group.position.x, lz = z - ch.group.position.z;
      if (Math.hypot(lx, lz) < ch.r) return ch.group.position.y + heightLocal(ch, lx, lz);
    }
    return null;
  }

  function terrain(ch, colors) {
    const R = ch.r, rings = 16, segs = 44;
    const pos = [], col = [], idx = [];
    const push = (x, z, edge) => {
      const y = edge ? TOP : heightLocal(ch, x, z);
      pos.push(x, y, z);
      const t = Math.min(1, Math.max(0, (y - TOP) / 1.3));
      const c = edge ? colors.sand : colors.low.clone().lerp(colors.high, t);
      col.push(c.r, c.g, c.b);
    };
    push(0, 0, false);
    for (let i = 1; i <= rings; i++) {
      const rr = R * (i / rings);
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2 + (i < rings ? (ch.rng() - 0.5) * 0.05 : 0);
        const jr = i < rings ? rr + (ch.rng() - 0.5) * 0.12 : rr;
        push(Math.cos(a) * jr, Math.sin(a) * jr, i >= rings - 1 && i === rings);
      }
    }
    for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
    for (let i = 1; i < rings; i++) {
      const a0 = 1 + (i - 1) * segs, a1 = 1 + i * segs;
      for (let j = 0; j < segs; j++) {
        const j1 = (j + 1) % segs;
        idx.push(a0 + j, a0 + j1, a1 + j);
        idx.push(a0 + j1, a1 + j1, a1 + j);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // ------------------------------------------------------------------
  // Le sentier : des niveaux répartis sur toute l'île, reliés sans se croiser
  // ------------------------------------------------------------------
  function layoutNodes(ch, entry, exit) {
    const rng = ch.rng, R = ch.r;
    const first = entry.clone().multiplyScalar(0.8);
    const last = exit.clone().multiplyScalar(0.72);
    // échantillonnage « au plus loin » pour bien couvrir l'île
    const cands = [];
    while (cands.length < 500) {
      const x = (rng() * 2 - 1) * R * 0.72, z = (rng() * 2 - 1) * R * 0.72;
      if (Math.hypot(x, z) < R * 0.72) cands.push(new THREE.Vector3(x, 0, z));
    }
    const chosen = [first, last];
    while (chosen.length < PER) {
      let best = null, bd = -1;
      cands.forEach((p) => {
        const d = Math.min(...chosen.map((q) => p.distanceTo(q)));
        if (d > bd) { bd = d; best = p; }
      });
      chosen.push(best);
    }
    // ordre : plus proche voisin depuis l'entrée, puis amélioration 2-opt (extrémités fixes)
    const mids = chosen.slice(2);
    const order = [first];
    let cur = first;
    while (mids.length) {
      let bi = 0;
      mids.forEach((p, i) => { if (p.distanceTo(cur) < mids[bi].distanceTo(cur)) bi = i; });
      cur = mids.splice(bi, 1)[0];
      order.push(cur);
    }
    order.push(last);
    const len = (a) => a.reduce((s, p, i) => (i ? s + p.distanceTo(a[i - 1]) : 0), 0);
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < order.length - 2; i++) {
        for (let j = i + 1; j < order.length - 1; j++) {
          const cand = order.slice(0, i).concat(order.slice(i, j + 1).reverse(), order.slice(j + 1));
          if (len(cand) < len(order) - 1e-6) { order.splice(0, order.length, ...cand); improved = true; }
        }
      }
    }
    return order;
  }

  function distToPath(ch, x, z) {
    let best = Infinity;
    const pts = ch.pathPts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
      best = Math.min(best, Math.hypot(a.x + abx * t - x, a.z + abz * t - z));
    }
    return best;
  }

  // ------------------------------------------------------------------
  // Décors : arbres, rochers, colonnes, temple, fleurs, palmiers…
  // ------------------------------------------------------------------
  const PROP = {
    pin(m, rng) {
      const g = new THREE.Group();
      const s = 0.85 + rng() * 0.5;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.25, 5), m('#c4b39c'));
      t.position.y = 0.12;
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 7), m('#97b6a0'));
      a.position.y = 0.5;
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.48, 7), m('#a9c4ad'));
      b.position.y = 0.86;
      g.add(t, a, b);
      g.scale.setScalar(s);
      return g;
    },
    olivier(m, rng) {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.42, 5), m('#bfae96'));
      t.position.y = 0.21; t.rotation.z = (rng() - 0.5) * 0.3;
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), m('#b7c49a'));
      c.position.y = 0.6; c.scale.y = 0.75;
      g.add(t, c);
      g.scale.setScalar(0.8 + rng() * 0.5);
      return g;
    },
    buisson(m, rng) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rng() * 0.1, 0), m(k % 2 ? '#b5cdb0' : '#a6c2a6'));
        b.position.set((rng() - 0.5) * 0.3, 0.12, (rng() - 0.5) * 0.3);
        g.add(b);
      }
      return g;
    },
    rocher(m, rng) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rng() * 0.28, 0), m('#e4e1da'));
      r.position.y = 0.08; r.rotation.set(rng() * 3, rng() * 3, rng() * 3); r.scale.y = 0.7;
      return r;
    },
    colonne(m, rng) {
      const g = new THREE.Group();
      const h = rng() < 0.5 ? 0.35 + rng() * 0.5 : 1.1 + rng() * 0.3;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), m('#f1eee8'));
      base.position.y = 0.04;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, h, 10), m('#f5f3ee'));
      shaft.position.y = 0.08 + h / 2;
      g.add(base, shaft);
      if (h > 1) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), m('#f1eee8'));
        cap.position.y = 0.12 + h;
        g.add(cap);
      } else {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), m('#f5f3ee'));
        drum.rotation.z = Math.PI / 2; drum.position.set(0.32, 0.12, 0.1);
        g.add(drum);
      }
      return g;
    },
    temple(m) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 1.1), m('#efece6'));
      base.position.y = 0.08;
      g.add(base);
      [[-0.55, -0.38], [0.55, -0.38], [-0.55, 0.38], [0.55, 0.38], [0, -0.38], [0, 0.38]].forEach(([x, z]) => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 8), m('#f6f4ef'));
        p.position.set(x, 0.56, z);
        g.add(p);
      });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.1), m('#efece6'));
      roof.position.y = 0.99;
      const pediment = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 3), m('#f3f0ea'));
      pediment.rotation.z = Math.PI / 2; pediment.scale.set(1, 1, 0.38);
      pediment.position.y = 1.18;
      g.add(roof, pediment);
      return g;
    },
    fleurs(m, rng) {
      const g = new THREE.Group();
      const palette = ['#f0c9c4', '#f3e3b8', '#d9cdee', '#ffffff', '#f4d2b6'];
      const col = palette[Math.floor(rng() * palette.length)];
      for (let k = 0; k < 5; k++) {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), m(col));
        f.position.set((rng() - 0.5) * 0.4, 0.06, (rng() - 0.5) * 0.4);
        g.add(f);
      }
      return g;
    },
    touffe(m, rng) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22 + rng() * 0.12, 4), m('#a8bf9f'));
        b.position.set((k - 1) * 0.06, 0.12, (rng() - 0.5) * 0.05);
        b.rotation.z = (k - 1) * 0.3;
        g.add(b);
      }
      return g;
    },
    palmier(m, rng) {
      const g = new THREE.Group();
      let x = 0, y = 0;
      const lean = 0.05 + rng() * 0.05;
      for (let k = 0; k < 5; k++) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.24, 6), m(k % 2 ? '#d8c6a8' : '#cdb998'));
        s.position.set(x, y + 0.12, 0);
        s.rotation.z = -lean * 2;
        g.add(s);
        x += lean; y += 0.23;
      }
      for (let k = 0; k < 6; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.62, 4), m('#a3c09f'));
        const a = (k / 6) * Math.PI * 2;
        leaf.position.set(x + Math.cos(a) * 0.22, y + 0.05, Math.sin(a) * 0.22);
        leaf.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
        leaf.scale.z = 0.35;
        g.add(leaf);
      }
      return g;
    }
  };

  // composition de chaque ambiance : [type, nombre, distance minimale au sentier]
  const SCENES = {
    pinede: [['pin', 16, 0.8], ['rocher', 6, 0.6], ['buisson', 5, 0.6], ['touffe', 12, 0.45], ['fleurs', 6, 0.45]],
    ruines: [['temple', 1, 1.3], ['colonne', 7, 0.7], ['olivier', 7, 0.8], ['rocher', 4, 0.6], ['touffe', 8, 0.45], ['fleurs', 5, 0.45]],
    jardin: [['buisson', 10, 0.6], ['olivier', 6, 0.8], ['fleurs', 18, 0.45], ['touffe', 8, 0.45], ['rocher', 3, 0.6]],
    dunes: [['palmier', 6, 0.8], ['rocher', 9, 0.6], ['touffe', 14, 0.45], ['colonne', 2, 0.7], ['fleurs', 3, 0.45]]
  };

  function decorate(ch, m) {
    const placed = [];
    const theme = THEMES[ch.c % THEMES.length];
    SCENES[theme].forEach(([type, count, clear]) => {
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 40; tries++) {
          const a = ch.rng() * Math.PI * 2;
          const d = Math.sqrt(ch.rng()) * ch.r * (type === 'temple' ? 0.55 : 0.86);
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          if (distToPath(ch, x, z) < clear) continue;
          if (ch.gateLocal.distanceTo(new THREE.Vector3(x, 0, z)) < 1.2) continue;
          const room = type === 'temple' ? 1.4 : type === 'touffe' || type === 'fleurs' ? 0.3 : 0.55;
          if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < room)) continue;
          const obj = PROP[type](m, ch.rng);
          obj.position.set(x, heightLocal(ch, x, z) - 0.02, z);
          obj.rotation.y = ch.rng() * Math.PI * 2;
          obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          ch.group.add(obj);
          placed.push({ x, z });
          break;
        }
      }
    });
    // des moutons sur les îles herbeuses
    if (theme !== 'dunes') {
      for (let k = 0; k < 3; k++) ch.sheep.push(makeSheep(ch, m));
    }
  }

  function makeSheep(ch, m) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), m('#fbfaf6'));
    body.scale.set(1.25, 0.95, 0.95);
    body.position.y = 0.22;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), m('#7d8287'));
    head.position.set(0.25, 0.27, 0);
    [[-0.1, -0.08], [-0.1, 0.08], [0.1, -0.08], [0.1, 0.08]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 4), m('#7d8287'));
      leg.position.set(x, 0.07, z);
      g.add(leg);
    });
    g.add(body, head);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const a = ch.rng() * Math.PI * 2, d = ch.r * (0.3 + ch.rng() * 0.4);
    g.userData = { x: Math.cos(a) * d, z: Math.sin(a) * d, tx: 0, tz: 0, wait: ch.rng() * 4, hop: 0, head };
    g.userData.tx = g.userData.x; g.userData.tz = g.userData.z;
    ch.group.add(g);
    return g;
  }

  function updateSheep(ch, s, dt, t) {
    const u = s.userData;
    const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
    if (d < 0.05) {
      u.wait -= dt;
      u.head.position.y = 0.27 - (Math.sin(t * 2 + u.x) > 0.3 ? 0.1 : 0); // il broute
      if (u.wait <= 0) { // nouvelle destination, pas trop loin, hors du sentier
        for (let k = 0; k < 10; k++) {
          const nx = u.x + (Math.random() - 0.5) * 2.4, nz = u.z + (Math.random() - 0.5) * 2.4;
          if (Math.hypot(nx, nz) < ch.r * 0.78 && distToPath(ch, nx, nz) > 0.45) { u.tx = nx; u.tz = nz; break; }
        }
        u.wait = 2 + Math.random() * 5;
      }
    } else {
      const step = Math.min(d, dt * 0.45);
      u.x += (dx / d) * step; u.z += (dz / d) * step;
      u.hop += dt * 9;
      u.head.position.y = 0.27;
      s.rotation.y = Math.atan2(-dz, dx);
    }
    s.position.set(u.x, heightLocal(ch, u.x, u.z) + (d >= 0.05 ? Math.abs(Math.sin(u.hop)) * 0.05 : 0), u.z);
  }

  // ------------------------------------------------------------------
  // Construction d'une île
  // ------------------------------------------------------------------
  function buildChapter(c) {
    const rng = C.makeRng('ile:' + c);
    const r = radiusOf(c);
    const ctr = centerOf(c);
    const accent = opts.levelInfo(c * PER).accent;
    const group = new THREE.Group();
    group.position.copy(ctr);
    const fadeMats = [];
    const matCache = {};
    // matériaux partagés de l'île (ils s'estompent ensemble dans la brume)
    const m = (hex) => {
      if (!matCache[hex]) { matCache[hex] = lambert(hex, { transparent: true }); fadeMats.push(matCache[hex]); }
      return matCache[hex];
    };

    const ch = { c, group, r, rng, accent, fadeMats, sheep: [], flowers: {}, fade: 0.2, phase: rng() * 6.28, open: 0 };
    // collines
    const theme = THEMES[c % THEMES.length];
    ch.hills = [];
    const nh = theme === 'dunes' ? 5 : 3 + Math.floor(rng() * 2);
    for (let k = 0; k < nh; k++) {
      const a = rng() * Math.PI * 2, d = rng() * r * 0.5;
      ch.hills.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, a: (theme === 'dunes' ? 0.35 : 0.5) + rng() * 0.7, s: 0.9 + rng() * 0.9 });
    }

    const colors = {
      low: theme === 'dunes' ? new THREE.Color('#efe3cc') : tint('#a9c6a6', 0.75).lerp(new THREE.Color(accent), 0.12),
      high: theme === 'dunes' ? new THREE.Color('#f6eedf') : tint('#a9c6a6', 0.45),
      sand: new THREE.Color('#f2ebde')
    };
    const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true });
    fadeMats.push(groundMat);
    const ground = new THREE.Mesh(terrain(ch, colors), groundMat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    ground.userData.ground = c;
    group.add(ground);
    ch.ground = ground;

    // falaises jusqu'à la mer
    const cliffGeo = new THREE.CylinderGeometry(r, r * 0.68, 2.6, 44, 3, true);
    const cp = cliffGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      if (cp.getY(i) < 1.29) { cp.setX(i, cp.getX(i) + (rng() - 0.5) * 0.35); cp.setZ(i, cp.getZ(i) + (rng() - 0.5) * 0.35); }
    }
    cliffGeo.computeVertexNormals();
    const cliff = new THREE.Mesh(cliffGeo, m('#ece6db'));
    cliff.position.y = TOP - 1.3;
    cliff.receiveShadow = true;
    group.add(cliff);

    // plage claire au pied des falaises
    const beachMat = new THREE.MeshLambertMaterial({ color: '#e9ebe4', transparent: true });
    fadeMats.push(beachMat);
    const beach = new THREE.Mesh(new THREE.RingGeometry(r * 0.66, r * 1.03, 44), beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.04;
    group.add(beach);

    // sentier
    const entry = entryOf(c).sub(ctr), exit = exitOf(c).sub(ctr);
    ch.gateLocal = exitOf(c, 0.86).sub(ctr);
    const order = layoutNodes(ch, entry, exit);
    ch.pathPts = order;
    ch.nodes = order.map((p, k) => {
      const boss = k === PER - 1;
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(boss ? 0.44 : 0.29, boss ? 0.5 : 0.33, 0.12, boss ? 12 : 9),
        lambert('#f4f2ed', { transparent: true }));
      mesh.position.set(p.x, heightLocal(ch, p.x, p.z) + 0.04, p.z);
      mesh.receiveShadow = mesh.castShadow = true;
      mesh.userData.level = c * PER + k;
      group.add(mesh);
      return { mesh, local: p };
    });
    // petits pavés le long du sentier, qui suivent le relief
    const dotMat = m('#ece7dc');
    for (let k = 0; k + 1 < order.length; k++) {
      const a = order[k], b = order[k + 1];
      const n = Math.max(1, Math.floor(a.distanceTo(b) / 0.32));
      for (let j = 1; j < n; j++) {
        const p = a.clone().lerp(b, j / n);
        if (j * (a.distanceTo(b) / n) < 0.35 || (n - j) * (a.distanceTo(b) / n) < 0.35) continue;
        const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 6), dotMat);
        dot.position.set(p.x, heightLocal(ch, p.x, p.z) + 0.01, p.z);
        dot.receiveShadow = true;
        group.add(dot);
      }
    }

    // le portique du boss
    const gate = new THREE.Group();
    gate.position.set(ch.gateLocal.x, heightLocal(ch, ch.gateLocal.x, ch.gateLocal.z) - 0.02, ch.gateLocal.z);
    const next = centerOf(c + 1).sub(ctr);
    gate.lookAt(next.x, gate.position.y, next.z);
    const white = lambert('#f7f5f0');
    [-0.7, 0.7].forEach((x) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), white);
      base.position.set(x, 0.05, 0);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.7, 10), white);
      p.position.set(x, 0.95, 0);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), white);
      cap.position.set(x, 1.84, 0);
      [base, p, cap].forEach((o) => { o.castShadow = true; gate.add(o); });
    });
    const lintelMat = lambert('#f7f5f0');
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.2, 0.36), lintelMat);
    lintel.position.y = 1.98;
    const pediment = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.84, 3), lintelMat);
    pediment.rotation.z = Math.PI / 2; pediment.scale.set(1, 1, 0.45);
    pediment.position.y = 2.2;
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8),
      new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    veil.position.y = 0.95;
    [lintel, pediment].forEach((o) => { o.castShadow = true; });
    gate.add(lintel, pediment, veil);
    group.add(gate);
    Object.assign(ch, { gate, veil, lintelMat });

    decorate(ch, m);

    // pierres de gué vers l'île suivante (immergées tant que le boss n'est pas battu)
    ch.stones = [];
    const from = exitOf(c, 1.02), to = entryOf(c + 1, 1.02);
    const d = from.distanceTo(to);
    const count = Math.max(3, Math.floor(d / 1.05));
    for (let k = 1; k <= count; k++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.22, 7), lambert('#f7f6f2'));
      s.position.lerpVectors(from, to, k / (count + 1));
      s.position.z += Math.sin(k * 0.9) * 0.35;
      s.userData = { phase: k + c, dip: 0, raise: 0 };
      s.castShadow = s.receiveShadow = true;
      scene.add(s);
      ch.stones.push(s);
    }

    // ondes autour de l'île
    ch.ripples = [];
    for (let k = 0; k < 2; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.03, 64),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(ctr.x, 0.06, ctr.z);
      ring.userData = { base: r * 1.1, offset: k * 2.5 + rng() * 2 };
      scene.add(ring);
      ch.ripples.push(ring);
    }

    // montagnes lointaines, de part et d'autre de la route
    [-1, 1].forEach((side) => {
      const h = 6 + rng() * 6;
      const mtn = new THREE.Mesh(new THREE.ConeGeometry(7 + rng() * 5, h, 6), lambert('#dfe6e6'));
      mtn.position.set(ctr.x + (rng() - 0.5) * 8, h / 2 - 0.6, ctr.z + side * (30 + rng() * 10));
      mtn.rotation.y = rng() * 3;
      scene.add(mtn);
    });

    scene.add(group);
    chapters[c] = ch;
    return ch;
  }

  // ------------------------------------------------------------------
  // États : niveaux faits / en cours / à venir, fleurs, portes, gué
  // ------------------------------------------------------------------
  function ensureChapters() {
    const need = chapterOf(done) + 1; // l'île suivante attend dans la brume
    for (let c = 0; c <= need; c++) if (!chapters[c]) buildChapter(c);
  }

  function bloom(ch, k, accent, animate) {
    const n = ch.nodes[k];
    const g = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + k;
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), lambert(j % 2 ? tint(accent, 0.7) : '#ffffff'));
      f.position.set(Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48);
      g.add(f);
    }
    g.position.set(n.local.x, heightLocal(ch, n.local.x, n.local.z) + 0.04, n.local.z);
    if (animate) { g.scale.setScalar(0.01); g.userData.grow = true; }
    ch.group.add(g);
    ch.flowers[k] = g;
  }

  function refresh(animate) {
    ensureChapters();
    chapters.forEach((ch) => {
      if (!ch) return;
      ch.nodes.forEach((n, k) => {
        const L = ch.c * PER + k;
        const info = opts.levelInfo(L);
        const mat = n.mesh.material;
        if (L < done) {
          mat.color.copy(tint(info.accent, 0.7)); n.mesh.userData.alpha = 1;
          if (!ch.flowers[k]) bloom(ch, k, info.accent, animate);
        } else if (L === done) { mat.color.set('#ffffff'); n.mesh.userData.alpha = 1; }
        else { mat.color.set('#efece6'); n.mesh.userData.alpha = 0.6; }
      });
      const beaten = done > ch.c * PER + PER - 1;
      if (beaten && !ch.opened) {
        ch.opened = true;
        ch.lintelMat.color.copy(tint(ch.accent, 0.6));
        ch.stones.forEach((s, i) => { s.userData.delay = animate ? 1.0 + i * 0.16 : 0; if (!animate) s.userData.raise = 1; });
      }
    });
  }

  function nodePos(L) {
    const ch = chapters[chapterOf(L)];
    const n = ch.nodes[L % PER];
    return new THREE.Vector3(ch.group.position.x + n.local.x, ch.group.position.y + heightLocal(ch, n.local.x, n.local.z) + 0.1,
      ch.group.position.z + n.local.z);
  }
  function groundPos(c, at) {
    const ch = chapters[c];
    const lx = at.x - ch.group.position.x, lz = at.z - ch.group.position.z;
    return new THREE.Vector3(at.x, ch.group.position.y + heightLocal(ch, lx, lz), at.z);
  }
  // direction du sentier au niveau L (pour placer la caméra derrière le voyageur)
  function pathDir(L) {
    const nextOk = chapters[chapterOf(L + 1)];
    const a = nodePos(Math.max(0, L - 1)), b = nodePos(nextOk ? L + 1 : L);
    const d = b.sub(a); d.y = 0;
    return d.lengthSq() > 0.001 ? d.normalize() : new THREE.Vector3(1, 0, 0);
  }

  // ------------------------------------------------------------------
  // Le voyageur
  // ------------------------------------------------------------------
  // free : endroit où il se promène hors du sentier ({ c, at }), sinon il est sur la pierre `selected`
  const hero = { group: null, route: null, seg: 0, segT: 0, facing: 0, celebrate: 0, wait: 0, free: null };

  // Ulysse, version moderne : silhouette élancée, barbe, tunique sombre, longue cape blanche
  // (clin d'œil à Ulysse 31), lance de voyageur. Proportions adultes, pas de style « mignon ».
  function makeHero() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: '#e9d6c0' });
    const tunicMat = lambert('#4d5862');
    const trouserMat = lambert('#6b737a');
    const bootMat = lambert('#8a7a68');
    const hairMat = lambert('#5a4636');

    // jambes articulées à la hanche (pour la marche)
    const legs = [-0.065, 0.065].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.46, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.42, 7), trouserMat);
      leg.position.y = -0.21;
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.15), bootMat);
      boot.position.set(0, -0.43, 0.025);
      pivot.add(leg, boot);
      body.add(pivot);
      return pivot;
    });
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.42, 10), tunicMat);
    torso.position.y = 0.67;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.04, 10), lambert('#9c8a72'));
    belt.position.y = 0.5;
    const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), lambert('#e59a9a'));
    emblem.position.set(0, 0.76, 0.128);
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), tunicMat);
    shoulders.scale.set(1.15, 0.45, 0.8);
    shoulders.position.y = 0.86;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 8), skin);
    neck.position.y = 0.92;
    const head = new THREE.Group();
    head.position.y = 1.02;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), skin);
    face.scale.set(0.9, 1.08, 0.95);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.set(0, 0.012, -0.008);
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), hairMat);
    beard.position.set(0, -0.022, 0.018);
    head.add(face, hair, beard);
    // longue cape blanche, doublure à la couleur de l'île
    const capeMat = lambert('#f4f2ec', { side: THREE.DoubleSide });
    const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.27, 0.72, 14, 3, true, Math.PI * 0.62, Math.PI * 0.76), capeMat);
    const liningMat = lambert('#e59a9a', { side: THREE.BackSide });
    const lining = new THREE.Mesh(cape.geometry, liningMat);
    lining.scale.setScalar(0.985);
    cape.add(lining);
    const capePivot = new THREE.Group();
    capePivot.position.y = 0.88;
    cape.position.set(0, -0.36, -0.01); // la cape tombe des épaules
    capePivot.add(cape);
    // lance de voyageur
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.25, 5), lambert('#b9a58c'));
    shaft.position.y = 0.62;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 6), lambert('#d8d6d0'));
    tip.position.y = 1.29;
    spear.add(shaft, tip);
    spear.position.set(0.19, 0, 0.05);
    spear.rotation.z = -0.06;
    [torso, belt, emblem, shoulders, neck, capePivot, spear].forEach((o) => body.add(o));
    body.add(head);
    body.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(body);
    const scarfMat = liningMat;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    g.add(shadow);
    g.scale.setScalar(0.95);
    scene.add(g);
    Object.assign(hero, { group: g, body, scarf: scarfMat, shadow, cape: capePivot, legs, head, emblem });
  }

  // point de passage → position vivante (les îles tanguent, les pierres flottent)
  function wpPos(wp) {
    if (wp.level != null) return nodePos(wp.level);
    if (wp.stone) return new THREE.Vector3(wp.stone.position.x, wp.stone.position.y + 0.11, wp.stone.position.z);
    return groundPos(wp.c, wp.at);
  }

  // itinéraire de pierre en pierre ; entre deux îles on passe le portique puis le gué
  function routeBetween(a, b) {
    const route = [{ level: a }];
    const dir = b > a ? 1 : -1;
    for (let L = a; L !== b; L += dir) {
      const n = L + dir;
      if (chapterOf(n) !== chapterOf(L)) {
        const c = Math.min(chapterOf(n), chapterOf(L));
        const leg = [{ c, at: exitOf(c, 0.86) }, { c, at: exitOf(c, 0.98) }]
          .concat(chapters[c].stones.map((s) => ({ stone: s })))
          .concat([{ c: c + 1, at: entryOf(c + 1, 0.98) }]);
        route.push(...(dir > 0 ? leg : leg.reverse()));
      }
      route.push({ level: n });
    }
    return route;
  }

  function nearestNode(c, at) {
    let best = c * PER, bd = Infinity;
    for (let L = c * PER; L < c * PER + PER && L <= done; L++) {
      const p = nodePos(L);
      const d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

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
    route = route.filter((wp, i) => i === 0 || wp.level == null || route[i - 1].level !== wp.level);
    if (route.length < 2) { hero.route = null; return; }
    hero.route = route;
    hero.seg = 0;
    hero.segT = 0;
    hero.wait = delay || 0;
  }

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
    let moving = false, lift = 0, speed = 0;
    if (hero.wait > 0) hero.wait -= dt;
    else if (hero.route) {
      const a = hero.route[hero.seg], b = hero.route[hero.seg + 1];
      const pa = wpPos(a), pb = wpPos(b);
      const hop = !!(a.stone || b.stone); // on saute de pierre en pierre, on marche sur l'île
      const dist = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const dur = hop ? 0.32 + dist * 0.05 : Math.max(0.1, dist / 2.4);
      hero.segT += dt / dur;
      const k = Math.min(1, hero.segT);
      g.position.lerpVectors(pa, pb, k);
      if (hop) {
        lift = Math.sin(Math.PI * k) * (0.3 + dist * 0.06);
        g.position.y += lift;
      } else {
        const h = worldHeight(g.position.x, g.position.z);
        if (h != null) g.position.y = h + 0.02;
      }
      hero.facing = Math.atan2(pb.x - pa.x, pb.z - pa.z);
      moving = true;
      speed = hop ? 0 : 1;
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
      hero.celebrate = Math.max(0, hero.celebrate - dt * 1.6);
      const jump = Math.sin(Math.PI * (1 - hero.celebrate)) * 0.4;
      g.position.y += jump;
      lift += jump;
    }
    hero.shadow.position.y = 0.012 - lift / g.scale.y;
    hero.shadow.scale.setScalar(1 - Math.min(0.5, lift));
    let d = hero.facing - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * (1 - Math.exp(-dt * 8));
    // marche, respiration, cape qui flotte derrière lui
    const w = t * 8.5;
    const stride = speed ? Math.sin(w) * 0.55 : lift > 0.05 ? 0.35 : 0;
    hero.legs[0].rotation.x = stride;
    hero.legs[1].rotation.x = speed ? -stride : -stride * 0.6;
    hero.body.position.y = speed ? Math.abs(Math.cos(w)) * 0.025 : 0;
    hero.body.rotation.x = speed ? 0.06 : 0;
    hero.body.scale.y = 1 + (moving ? 0 : Math.sin(t * 1.8) * 0.012);
    hero.cape.rotation.x = moving ? -0.32 + Math.sin(t * 7) * 0.06 : -0.04 + Math.sin(t * 1.2) * 0.03;
    hero.head.rotation.y = moving ? 0 : Math.sin(t * 0.35) * 0.35;
    const accent = new THREE.Color(opts.levelInfo(selected).accent);
    hero.scarf.color.lerp(accent, 1 - Math.exp(-dt * 2));
    hero.emblem.material.color.lerp(accent, 1 - Math.exp(-dt * 2));
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
      ch.group.position.y = Math.sin(t * 0.5 + ch.phase) * 0.03;
      const reached = done >= ch.c * PER;
      ch.fade += ((reached ? 1 : 0.22) - ch.fade) * (1 - Math.exp(-dt * 0.8));
      ch.fadeMats.forEach((m) => { m.opacity = ch.fade; });
      ch.nodes.forEach((n) => {
        n.mesh.material.opacity = Math.min(ch.fade, n.mesh.userData.alpha == null ? 1 : n.mesh.userData.alpha);
      });
      ch.gate.visible = ch.fade > 0.3;
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
        const k = ((t * 0.22 + ring.userData.offset) % 2.5) / 2.5;
        const s = ring.userData.base + k * 2;
        ring.scale.set(s, s, 1);
        ring.material.opacity = reached ? (1 - k) * 0.45 * Math.min(1, k * 6) : 0;
      });
      Object.values(ch.flowers).forEach((f) => {
        if (f.userData.grow) {
          const s = Math.min(1, f.scale.x + dt * 0.9);
          f.scale.setScalar(s);
          if (s >= 1) f.userData.grow = false;
        }
      });
      ch.sheep.forEach((s) => { s.visible = reached; if (reached) updateSheep(ch, s, dt, t); });
    });

    // la pierre du prochain niveau respire ; l'icône du mini-jeu flotte au-dessus de la pierre choisie
    const cur = chapters[chapterOf(done)] && nodePos(done);
    pulse.visible = !!cur;
    if (cur) {
      const k = (t * 0.6) % 1;
      pulse.position.set(cur.x, cur.y - 0.03, cur.z);
      pulse.scale.setScalar(0.45 + k * 0.75);
      pulse.material.opacity = (1 - k) * 0.7;
      pulse.material.color.set(opts.levelInfo(done).accent);
    }
    const sel = nodePos(selected);
    marker.position.set(sel.x, sel.y + 1.75 + Math.sin(t * 1.6) * 0.08, sel.z);
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
    // le voilier longe l'archipel, au large
    const bx = focus.x + Math.sin(t * 0.045) * 16;
    const bz = Math.sin((bx / SPACING) * 1.15) * 7 + 9.5;
    const nbx = focus.x + Math.sin((t + 0.5) * 0.045) * 16;
    boat.position.set(bx, Math.sin(t * 1.2) * 0.05, bz);
    boat.rotation.y = Math.atan2(nbx - bx, (Math.sin((nbx / SPACING) * 1.15) * 7 + 9.5) - bz) - Math.PI / 2;
    boat.rotation.z = Math.sin(t * 1.1) * 0.06;
    motes.position.set(focus.x, Math.sin(t * 0.2) * 0.3, focus.z);
    motes.rotation.y = t * 0.01;

    updateHero(dt, t);

    // caméra : derrière le voyageur, dans le sens du sentier
    const dir = pathDir(selected);
    if (holdTheta > 0) holdTheta -= dt; else userTheta *= 1 - Math.min(1, dt * 0.4);
    goal.theta = Math.atan2(-dir.z, -dir.x) + 0.55 + userTheta;
    goal.tx = focus.x + dir.x * 1.6; goal.ty = focus.y + 0.2; goal.tz = focus.z + dir.z * 1.6;
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
  // Interaction : glisser pour tourner / zoomer, toucher pour se déplacer
  // ------------------------------------------------------------------
  let drag = null;

  function raycaster(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(v, camera);
    return rc;
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
      goal.elev = 0.45 + ((goal.radius - 7) / 27) * 0.6;
    }
  }
  function onUp(e) {
    if (!drag) return;
    const tap = drag.moved < 8 && performance.now() - drag.t < 400;
    drag = null;
    if (!tap) return;
    const rc = raycaster(e);
    const nodes = [], grounds = [];
    chapters.forEach((ch) => { if (!ch) return; ch.nodes.forEach((n) => nodes.push(n.mesh)); grounds.push(ch.ground); });
    const hitNode = rc.intersectObjects(nodes, false)[0];
    if (hitNode && hitNode.object.userData.level <= done) { travelTo(hitNode.object.userData.level); C.sfx.tap(); return; }
    const hit = rc.intersectObjects(grounds, false)[0];
    if (!hit) return;
    const c = hit.object.userData.ground;
    if (done < c * PER) return; // île encore dans la brume
    // une pierre toute proche du point touché compte comme un choix de niveau
    let best = -1, bd = 0.6;
    chapters[c].nodes.forEach((n) => {
      const w = new THREE.Vector3();
      n.mesh.getWorldPosition(w);
      const d = Math.hypot(w.x - hit.point.x, w.z - hit.point.z);
      if (d < bd && n.mesh.userData.level <= done) { bd = d; best = n.mesh.userData.level; }
    });
    if (best >= 0) { travelTo(best); C.sfx.tap(); return; }
    const ch = chapters[c];
    const lx = hit.point.x - ch.group.position.x, lz = hit.point.z - ch.group.position.z;
    if (Math.hypot(lx, lz) < ch.r * 0.88) wanderTo(c, new THREE.Vector3(hit.point.x, 0, hit.point.z));
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 55 : 42;
    camera.updateProjectionMatrix();
  }

  function setMarker() {
    const info = opts.levelInfo(selected);
    marker.material.map = iconTexture(info.id, info.accent, info.boss);
    marker.material.needsUpdate = true;
    marker.scale.setScalar(info.boss ? 0.95 : 0.75);
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
    scene.add(new THREE.HemisphereLight('#ffffff', '#b9c6ca', 0.52));
    sun = new THREE.DirectionalLight('#fff2e2', 0.64);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
    scene.add(sun, sun.target);

    makeSea();
    makeClouds();
    makeBirds();
    makeBoat();
    makeMotes();

    pulse = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.44, 40),
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

  // Le joueur a progressé : fleurs, porte qui s'ouvre si besoin, puis le voyageur avance.
  World.progress = function (newDone, animate) {
    const crossed = chapterOf(newDone) > chapterOf(done);
    const prevDone = done;
    done = newDone;
    refresh(animate);
    if (animate && newDone > prevDone) {
      hero.celebrate = 1;
      travelTo(newDone, crossed ? 2.6 : 1.0);
    } else {
      selected = Math.min(selected, done);
    }
    setMarker();
  };
  World.select = function (L) { travelTo(Math.min(L, done)); };
  World.selected = () => selected;
  World.start = function () {
    if (!World.ok || running) return;
    running = true;
    last = performance.now();
    resize();
    raf = requestAnimationFrame(frame);
  };
  World.stop = function () { running = false; cancelAnimationFrame(raf); };
  // outils de test
  World.advance = function (sec) { for (let i = 0; i < sec * 30; i++) tick(1 / 30, simTime + 1 / 30); };
  World.wander = (c, dx, dz) => { const p = centerOf(c); wanderTo(c, new THREE.Vector3(p.x + dx, 0, p.z + dz)); };
  World.debug = () => ({ done, selected, free: !!hero.free, route: hero.route ? hero.route.length : 0, chapters: chapters.length,
    pos: hero.group.position.toArray().map((v) => +v.toFixed(2)) });

  document.addEventListener('visibilitychange', () => {
    if (!World.ok) return;
    if (document.hidden) { if (running) { World.stop(); World._paused = true; } }
    else if (World._paused) { World._paused = false; World.start(); }
  });

  C.world = World;
})();
