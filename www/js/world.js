// Odysseum — le monde en 3D (Three.js r128).
// Une chaîne d'îles sans fin. Sur chaque île, un sentier serpente entre PER
// niveaux répartis sur tout le relief ; le dernier est un boss. Battre le boss
// ouvre le portique et fait remonter les pierres de gué vers l'île suivante.
// Style dessin animé, ensoleillé : chaque île suit un épisode de l'Odyssée (Troie, les
// Cicones, les Lotophages…) avec son village, son bosquet et son monument.
(function () {
  'use strict';
  const C = window.Carnet;

  const PER = 6;           // niveaux par île (le dernier est le boss)
  const FOG = '#c4ecfb';   // brume bleu ciel de l'horizon
  const TOP = 0.63;        // hauteur du sol au bord des îles
  const SPACING = 15;      // distance entre deux îles

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

  // Rendu « linéaire » : les couleurs sont écrites en sRGB (hex) et converties en espace
  // linéaire pour l'éclairage ; la sortie est ré-encodée en sRGB, sans tone mapping
  // (les couleurs franches du dessin animé restent vives).
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const setLin = (color, hex) => color.set(hex).convertSRGBToLinear();
  const tint = (hex, amount) => new THREE.Color('#fbfaf7').lerp(new THREE.Color(hex), amount).convertSRGBToLinear();
  // Matériau de base « cartoon » : ombrage en aplats (MeshToonMaterial + dégradé à 3 marches),
  // ombres portées colorées par la lumière du ciel. (roughness/metalness sont ignorés.)
  const stdMats = [];
  let envBoost = 1, toonRamp = null;
  function rampTexture() {
    if (toonRamp) return toonRamp;
    // trois paliers : ombre douce, mi-teinte, pleine lumière
    toonRamp = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.generateMipmaps = false;
    toonRamp.needsUpdate = true;
    return toonRamp;
  }
  const toonMat = (params) => {
    const p = Object.assign({}, params);
    ['roughness', 'metalness', 'flatShading', 'envMapIntensity'].forEach((k) => { delete p[k]; });
    const hex = p.color;
    delete p.color;
    p.gradientMap = rampTexture();
    const mat = new THREE.MeshToonMaterial(p);
    if (hex != null) { if (hex.isColor) mat.color.copy(hex); else setLin(mat.color, hex); }
    stdMats.push(mat);
    return mat;
  };
  const lambert = (color, extra) => toonMat(Object.assign({ color }, extra || {}));
  const OUTLINE = false; // contour encré du héros (non retenu : coûteux sur téléphone)
  const chapterOf = (L) => Math.floor(L / PER);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function canvasTexture(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  // Textures discrètes générées par le code (aucune image à charger).
  // Elles se multiplient avec la couleur du matériau : blanc = neutre, gris = grain.
  const texCache = {};
  let seaTex = null;
  function texture(kind, rep, repX, repY) {
    const key = kind + ':' + rep + ':' + (repX || '') + ':' + (repY || '');
    if (texCache[key]) return texCache[key];
    const S = 256;
    const r = C.makeRng('texture:' + kind);
    const tex = canvasTexture(S, S, (g) => {
      g.fillStyle = kind === 'eau' ? '#e2e8ea' : '#ffffff';
      g.fillRect(0, 0, S, S);
      const dots = (count, size, alpha, light) => {
        for (let i = 0; i < count; i++) {
          g.fillStyle = light ? 'rgba(255,255,255,' + alpha * (0.5 + r()) + ')' : 'rgba(40,45,40,' + alpha * (0.5 + r()) + ')';
          const s = size * (0.5 + r());
          g.fillRect(r() * S, r() * S, s, s);
        }
      };
      if (kind === 'herbe') {
        dots(900, 3, 0.05);
        // petits brins d'herbe
        g.lineWidth = 1.2;
        for (let i = 0; i < 260; i++) {
          const x = r() * S, y = r() * S, h = 3 + r() * 6;
          g.strokeStyle = 'rgba(30,60,30,' + (0.06 + r() * 0.08) + ')';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - h); g.stroke();
        }
      } else if (kind === 'sable') {
        dots(2200, 1.6, 0.06);
        dots(400, 1.6, 0.4, true);
      } else if (kind === 'pierre') {
        dots(700, 2.5, 0.06);
        for (let i = 0; i < 12; i++) { // fines fissures
          g.strokeStyle = 'rgba(40,40,40,.08)'; g.lineWidth = 1;
          let x = r() * S, y = r() * S;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
          g.stroke();
        }
      } else if (kind === 'roche') {
        // strates horizontales
        for (let y = 0; y < S; y += 6 + r() * 10) {
          g.fillStyle = 'rgba(60,55,50,' + (0.03 + r() * 0.07) + ')';
          g.fillRect(0, y, S, 2 + r() * 4);
        }
        dots(500, 2, 0.06);
      } else if (kind === 'eau') {
        // reflets de vagues
        g.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
          const x = r() * S, y = r() * S, w = 10 + r() * 28;
          g.strokeStyle = 'rgba(255,255,255,' + (0.5 + r() * 0.5) + ')';
          g.lineWidth = 1.2 + r() * 1.5;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke();
        }
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX || rep, repY || rep);
    if (renderer) tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    if (kind === 'eau') seaTex = tex;
    texCache[key] = tex;
    return tex;
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
    tex.encoding = THREE.sRGBEncoding;
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
  let dayBg, nightBg, hemi, cloudMat, moon, isDark = false;
  const mountains = [];
  function makeSky() {
    const gradient = (stops) => canvasTexture(4, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      stops.forEach(([k, c]) => grd.addColorStop(k, c));
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    dayBg = gradient([[0, '#5ec3f2'], [0.55, '#a9e3fb'], [1, FOG]]);
    nightBg = dayBg;
    scene.background = dayBg;
    scene.fog = new THREE.Fog(FOG, 30, 85);
    // (la lune n'est plus utilisée : l'archipel reste ensoleillé ; l'objet reste pour l'API)
    moon = new THREE.Object3D();
    moon.visible = false;
  }

  // ------------------------------------------------------------------
  // Lumière : un grand soleil de dessin animé, toujours joyeux. Le mode sombre choisi
  // (setTime(…, true)) donne une fin d'après-midi dorée, jamais une nuit noire.
  // ------------------------------------------------------------------
  // sea = [eau du large, eau du lagon autour des îles]
  const MOMENTS = {
    jour: { sky: ['#5ec3f2', '#a9e3fb', FOG], fog: FOG, sea: ['#1d9be0', '#3fe0d0'], hemi: ['#d8f1ff', '#ffe7c4', 0.62],
      sun: ['#fff6e0', 0.78], cloud: ['#ffffff', 1], mtn: '#ffffff', motes: ['#ffffff', 0.7, 0.1], night: 0, env: 0 },
    dore: { sky: ['#7cb8f0', '#ffd9a8', '#ffe9c9'], fog: '#ffe6c6', sea: ['#2a8fd6', '#52d8c8'], hemi: ['#ffe9d2', '#ffd6b0', 0.62],
      sun: ['#ffd9a0', 0.8], cloud: ['#fff3e6', 1], mtn: '#fff1e2', motes: ['#ffe9b8', 0.85, 0.12], night: 0, env: 0 }
  };
  MOMENTS.nuit = MOMENTS.dore; MOMENTS.aube = MOMENTS.jour; MOMENTS.crepuscule = MOMENTS.dore;
  const SUN_K = 1, HEMI_K = 1;
  let envMap = null;
  let calm = false;
  let cine = null; // séquence « mode concentration » en cours
  let lightHour = 12, forceNight = false, skyKey = '', mtnColor = '#ffffff';

  function mix(a, b, k) {
    if (typeof a === 'number') return a + (b - a) * k;
    if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], k));
    return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
  }
  function paletteAt() { return forceNight ? MOMENTS.dore : MOMENTS.jour; }

  function applyLight() {
    const p = paletteAt(lightHour);
    const key = p.sky.join();
    if (key !== skyKey) { // le dégradé du ciel n'est redessiné que s'il change
      skyKey = key;
      if (scene.background && scene.background.dispose && scene.background !== dayBg) scene.background.dispose();
      scene.background = p === MOMENTS.jour ? dayBg : canvasTexture(4, 256, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, p.sky[0]); grd.addColorStop(0.55, p.sky[1]); grd.addColorStop(1, p.sky[2]);
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      });
    }
    setLin(scene.fog.color, p.fog);
    if (sea.material.userData.deep) {
      setLin(sea.material.userData.deep.value, p.sea[0]);
      setLin(sea.material.userData.shallow.value, p.sea[1]);
      sea.material.userData.spark.value = 1;
    }
    setLin(hemi.color, p.hemi[0]); setLin(hemi.groundColor, p.hemi[1]);
    hemi.intensity = p.hemi[2] * HEMI_K;
    setLin(sun.color, p.sun[0]); sun.intensity = p.sun[1] * SUN_K;
    setLin(cloudMat.color, p.cloud[0]); cloudMat.opacity = p.cloud[1];
    mtnColor = p.mtn;
    mountains.forEach((m) => setLin(m.material.color, p.mtn));
    setLin(motes.material.color, p.motes[0]); motes.material.opacity = p.motes[1]; motes.material.size = p.motes[2];
    isDark = false;
  }

  // soleil haut, de trois quarts : ombres courtes et nettes, comme dans un dessin animé
  function sunOffset() {
    return forceNight ? new THREE.Vector3(12, 11, 6) : new THREE.Vector3(7, 16, 9);
  }

  const SEA_SIZE = 130, SEA_SEG = 48;
  function makeSea() {
    const geo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEG, SEA_SEG);
    geo.rotateX(-Math.PI / 2);
    // Mer « lagon » : houle calculée dans le shader, eau turquoise peu profonde autour des
    // îles, liseré d'écume animé au pied des plages, reflets du soleil et du ciel.
    const seaMat = toonMat({ color: '#ffffff', roughness: 0.32 });
    const U = seaMat.userData;
    U.time = { value: 0 };
    U.deep = { value: lin('#1d9be0') };
    U.shallow = { value: lin('#3fe0d0') };
    U.isl = { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 0, -99, 0)) };
    U.spark = { value: 1 };
    seaMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.time; sh.uniforms.deep = U.deep; sh.uniforms.shallow = U.shallow; sh.uniforms.isl = U.isl;
      sh.vertexShader = 'uniform float uTime;\nvarying vec3 vW;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', [
          'vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;',
          'float a1 = wp0.x * 0.25 + uTime * 0.6, a2 = wp0.z * 0.3 + uTime * 0.45;',
          'float wv = sin(a1) * 0.09 + cos(a2) * 0.08 - 0.05;',
          'vec3 objectNormal = normalize(vec3(-cos(a1) * 0.0225, 1.0, sin(a2) * 0.024));'
        ].join('\n'))
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.y += wv; vW = wp0;');
      sh.uniforms.uSpark = U.spark;
      sh.fragmentShader = 'uniform float uTime;\nuniform float uSpark;\nuniform vec3 deep;\nuniform vec3 shallow;\nuniform vec4 isl[6];\nvarying vec3 vW;\n' + sh.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', [
          'float near = 99.0;',
          'for (int i = 0; i < 6; i++) { vec4 s = isl[i]; near = min(near, length(vW.xz - s.xy) - s.z + (1.0 - s.w) * 2.5); }',
          'float sh = 1.0 - smoothstep(0.0, 3.4, near);',
          'vec3 base = mix(deep, shallow, sh * sh);',
          // profondeur : le bleu se fonce au large
          'base = mix(base, deep * vec3(0.72, 0.8, 0.9), smoothstep(5.0, 16.0, near) * 0.7);',
          'vec2 p = vW.xz; float t = uTime;',
          // caustiques dans le lagon
          'float cA = sin(p.x * 3.7 + sin(p.y * 2.3 + t * 0.8) * 1.6 + t * 0.6);',
          'float cB = sin(p.y * 4.1 + sin(p.x * 2.7 - t * 0.7) * 1.6 - t * 0.5);',
          'float caus = pow(1.0 - abs(cA * cB), 7.0);',
          'base += vec3(0.75, 0.95, 0.9) * caus * 0.14 * sh;',
          'float n = sin(p.x * 3.1 + t * 1.3) * sin(p.y * 2.7 - t * 1.1);',
          'float foam = smoothstep(0.32, 0.0, abs(near - 0.12 - 0.08 * sin(t * 0.8 + n))) * (0.65 + 0.35 * n);',
          'float foam2 = smoothstep(0.1, 0.0, abs(near - 0.75 - 0.25 * sin(t * 0.6 + n * 0.5))) * 0.3 * (0.5 + 0.5 * n);',
          // moutons au large : petites crêtes d'écume qui naissent et s'effacent
          'float wc = sin(p.x * 0.9 + t * 0.4) * sin(p.y * 1.13 - t * 0.33) * sin((p.x + p.y) * 0.71 + t * 0.52);',
          'float caps = smoothstep(0.72, 0.86, wc) * smoothstep(5.0, 10.0, near) * smoothstep(0.2, 1.0, sin(p.x * 7.0 + p.y * 5.0));',
          'base = mix(base, vec3(0.95), clamp(foam + foam2 + caps * 0.12, 0.0, 1.0));',
          // paillettes de soleil
          'vec2 g2 = p + vec2(sin(p.y * 0.73 + t * 0.3), cos(p.x * 0.61 - t * 0.25)) * 1.7;',
          'float gl = pow(max(0.0, sin(g2.x * 13.0 + t * 2.1) * sin(g2.y * 11.0 - t * 1.7)), 30.0) * smoothstep(0.55, 0.95, sin(p.x * 0.45 + p.y * 0.31 + t * 0.2) * 0.5 + 0.5);',
          'base += vec3(1.0, 0.97, 0.88) * gl * 0.35 * uSpark * (1.0 - smoothstep(4.0, 14.0, near));',
          'vec4 diffuseColor = vec4(base, opacity);'
        ].join('\n'))
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + [
          // vagues : quatre trains de houle croisés (normales perturbées, sans texture)
          'vec2 q = vW.xz; float tt = uTime; vec2 gw = vec2(0.0);',
          'gw += vec2(0.8, 0.6) * cos(dot(q, vec2(0.8, 0.6)) * 2.1 + tt * 1.3) * 0.025;',
          'gw += vec2(-0.5, 0.85) * cos(dot(q, vec2(-0.5, 0.85)) * 3.3 + tt * 1.7) * 0.018;',
          'gw += vec2(0.95, -0.3) * cos(dot(q, vec2(0.95, -0.3)) * 5.7 + tt * 2.3) * 0.0;',
          'gw += vec2(-0.2, -1.0) * cos(dot(q, vec2(-0.2, -1.0)) * 9.1 + tt * 3.1) * 0.0;',
          'normal = normalize(normal + (viewMatrix * vec4(gw.x, 0.0, gw.y, 0.0)).xyz);'
        ].join('\n'));
    };
    sea = new THREE.Mesh(geo, seaMat);
    sea.receiveShadow = true;
    scene.add(sea);
  }

  // gros nuages de coton, hauts dans le ciel (un seul maillage par nuage)
  function makeClouds() {
    const mat = cloudMat = toonMat({ color: '#ffffff', vertexColors: true, transparent: true, opacity: 1, emissive: lin('#9fb8c8').multiplyScalar(0.35), fog: false });
    const puff = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 7; i++) {
      const parts = [];
      const puffs = 4 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const s = k === Math.floor(puffs / 2) ? 1.7 : 1.0 + Math.random() * 0.5;
        parts.push({ geo: puff, color: '#ffffff', m: M4(k * 1.3 - puffs * 0.62, s * 0.25, (Math.random() - 0.5) * 0.9, 0, s, s * 0.8, s) });
      }
      parts.push({ geo: puff, color: '#f2f8fc', m: M4(0, -0.1, 0, 0, puffs * 0.75, 0.5, 1.3) }); // dessous plat
      const g = new THREE.Mesh(mergeParts(parts), mat);
      g.userData = { a: (i / 7) * Math.PI * 2, r: 26 + Math.random() * 12, y: 14 + Math.random() * 4, speed: 0.006 + Math.random() * 0.008 };
      scene.add(g);
      clouds.push(g);
    }
  }

  // goélands blancs qui planent au-dessus de l'archipel
  function makeBirds() {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.quadraticCurveTo(0.25, 0.16, 0.5, 0.08); shape.lineTo(0.12, 0.17); shape.lineTo(0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape);
    const gull = new THREE.MeshBasicMaterial({ color: lin('#ffffff'), side: THREE.DoubleSide });
    const tip = new THREE.MeshBasicMaterial({ color: lin('#5d6f80'), side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, i === 2 ? tip : gull), r = new THREE.Mesh(wingGeo, i === 2 ? tip : gull);
      r.scale.x = -1;
      b.add(l, r);
      b.userData = { l, r, a: i * 1.6, rad: 7 + (i % 4) * 2.5 + i * 0.6, y: 3.6 + (i % 3) * 1.4, speed: (0.11 + i * 0.025) * (i % 2 ? -1 : 1), phase: i };
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
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), toonMat({ color: '#fbfaf6', side: THREE.DoubleSide }));
    sail.position.set(0.03, 0.32, 0);
    sail.rotation.y = Math.PI / 2;
    [hull, mast, sail].forEach((m) => { m.castShadow = true; g.add(m); });
    g.scale.setScalar(1.2);
    scene.add(g);
    boat = g;
  }

  // la mer vivante : dauphins qui sautent de temps en temps, barques de pêche qui dérivent
  const sea2 = { dolphins: [], boats: [], splash: [], next: 5, jump: null };
  function nearIsland(x, z, k) {
    return chapters.some((ch) => ch && Math.hypot(x - ch.group.position.x, z - ch.group.position.z) < ch.r * (k || 1.3));
  }
  function makeSeaLife() {
    const parts = [];
    const body = new THREE.SphereGeometry(1, 14, 10);
    parts.push({ geo: body, color: '#6f8796', m: M4(0, 0, 0, 0, 0.11, 0.1, 0.46) });
    parts.push({ geo: body, color: '#dfe5e6', m: M4(0, -0.035, 0.02, 0, 0.085, 0.07, 0.38) });
    parts.push({ geo: new THREE.ConeGeometry(0.05, 0.14, 6), color: '#5f7786', m: M4(0, 0.13, -0.05, 0, 0.5, 1, 1.4, -0.5) });
    parts.push({ geo: new THREE.BoxGeometry(0.26, 0.015, 0.08), color: '#5f7786', m: M4(0, 0, -0.47) });
    parts.push({ geo: new THREE.ConeGeometry(0.03, 0.12, 6), color: '#6f8796', m: M4(0, -0.01, 0.5, 0, 1, 1, 1, Math.PI / 2) });
    const geo = mergeParts(parts);
    const mat = toonMat({ color: '#ffffff', vertexColors: true, roughness: 0.45 });
    for (let k = 0; k < 2; k++) {
      const d = new THREE.Mesh(geo, mat);
      d.visible = false;
      d.castShadow = true;
      scene.add(d);
      sea2.dolphins.push(d);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.75, 32),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      scene.add(ring);
      sea2.splash.push(ring);
    }
    ['#3a6ea8', '#b4493a', '#2f8a80'].forEach((hull, i) => {
      const b = fishingBoat(hull);
      b.scale.setScalar(1.15);
      b.userData = { a: i * 2.1, r: 9 + i * 2.2, speed: 0.012 + i * 0.004, keepGeo: true };
      scene.add(b);
      sea2.boats.push(b);
    });
  }
  function seaLife(dt, t, focus) {
    if (!sea2.dolphins.length) return;
    sea2.boats.forEach((b, i) => {
      const u = b.userData;
      if (!calm) u.a += dt * u.speed;
      const x = focus.x + Math.cos(u.a) * u.r, z = focus.z + Math.sin(u.a) * u.r * 0.8;
      b.position.set(x, Math.sin(t * 1.2 + i) * 0.04 - 0.02, z);
      b.rotation.y = Math.atan2(-Math.sin(u.a), Math.cos(u.a) * 0.8) + Math.PI;
      b.rotation.z = Math.sin(t * 1.0 + i * 2) * 0.06;
      b.visible = !nearIsland(x, z, 1.35);
    });
    // un saut de dauphins de temps en temps, dans le champ de la caméra
    sea2.next -= dt;
    if (!sea2.jump && sea2.next <= 0 && !calm) {
      sea2.next = 7 + Math.random() * 9;
      for (let tries = 0; tries < 12; tries++) {
        const a = cam.theta + Math.PI + (Math.random() - 0.5) * 1.6; // devant la caméra
        const d = 4 + Math.random() * 6;
        const x = cam.tx + Math.cos(a) * d, z = cam.tz + Math.sin(a) * d;
        if (nearIsland(x, z, 1.3)) continue;
        const h = Math.random() * Math.PI * 2;
        sea2.jump = { x, z, h, t: 0 };
        break;
      }
    }
    sea2.splash.forEach((r) => { r.material.opacity = Math.max(0, r.material.opacity - dt * 0.8); r.scale.multiplyScalar(1 + dt * 0.8); });
    const J = sea2.jump;
    if (!J) return;
    J.t += dt;
    sea2.dolphins.forEach((d, i) => {
      const tt = (J.t - i * 0.32) / 1.25;
      if (tt < 0 || tt > 1) { d.visible = false; return; }
      d.visible = true;
      const dx = Math.sin(J.h), dz = Math.cos(J.h);
      const off = i * 0.5;
      const s = (tt - 0.5) * 2.4;
      d.position.set(J.x + dx * s + dz * off, Math.sin(Math.PI * tt) * 0.85 - 0.12, J.z + dz * s - dx * off);
      d.rotation.set(0, J.h, 0);
      d.rotateX(-Math.cos(Math.PI * tt) * 0.9);
      if ((tt > 0.04 && tt < 0.08) || (tt > 0.93 && tt < 0.97)) { // éclaboussures
        const r = sea2.splash[i];
        if (r.material.opacity < 0.2) { r.position.set(d.position.x, 0.08, d.position.z); r.scale.setScalar(0.4); r.material.opacity = 0.8; }
      }
    });
    if (J.t > 2) sea2.jump = null;
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
  function radiusOf(c) { return 5.4 + C.makeRng('rayon:' + c)() * 0.4; }
  function flat(v) { v.y = 0; return v.normalize(); }
  function edgeToward(c, other, k) {
    const ctr = centerOf(c);
    return ctr.clone().add(flat(other.clone().sub(ctr)).multiplyScalar(radiusOf(c) * k));
  }
  const entryOf = (c, k) => edgeToward(c, c > 0 ? centerOf(c - 1) : centerOf(c).add(new THREE.Vector3(-SPACING, 0, 0)), k || 0.84);
  const exitOf = (c, k) => edgeToward(c, centerOf(c + 1), k || 0.84);

  // relief : un plateau doux (une bosse centrale, deux petites) qui s'aplatit vers la plage
  function heightLocal(ch, x, z) {
    let h = 0;
    ch.hills.forEach((b) => {
      const d2 = (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z);
      h += b.a * Math.exp(-d2 / (2 * b.s * b.s));
    });
    const d = Math.hypot(x, z) / ch.r;
    return TOP + h * (1 - smooth(0.62, 0.86, d)) - smooth(0.86, 1.0, d) * 0.12;
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

  // sol de l'île : prairie vive en larges taches nettes, anneau de plage doré bien franc
  function terrain(ch, colors) {
    const R = ch.r, rings = 30, segs = 72;
    const pos = [], col = [], idx = [];
    const c = new THREE.Color();
    const push = (x, z) => {
      const y = heightLocal(ch, x, z);
      pos.push(x, y, z);
      const d = Math.hypot(x, z) / R;
      // taches d'herbe en aplats (deux verts), comme peintes
      const n = Math.sin(x * 0.9 + ch.phase) * Math.cos(z * 0.8 - ch.phase) + Math.sin((x - z) * 1.7) * 0.3;
      c.copy(n > 0.35 ? colors.fresh : colors.low);
      c.lerp(colors.high, smooth(0.15, 0.6, (y - TOP) / 0.5) * 0.5);
      c.lerp(colors.sand, smooth(0.845, 0.865, d));
      col.push(c.r, c.g, c.b);
    };
    push(0, 0);
    for (let i = 1; i <= rings; i++) {
      const rr = R * (i / rings);
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        push(Math.cos(a) * rr, Math.sin(a) * rr);
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
    geo.userData.base = Float32Array.from(col);
    return geo;
  }

  // ------------------------------------------------------------------
  // Le sentier : UNE route continue qui serpente sur l'île, de la plage d'arrivée au
  // portique de sortie, puis traverse la mer sur un ponton de bois jusqu'à l'île suivante.
  // Les niveaux sont posés à intervalles réguliers le long de cette ligne (ordre = ordre des niveaux).
  // ------------------------------------------------------------------
  const LV0 = 0.08, LV1 = 0.84, GATE_F = 0.9, PATH_W = 0.34;
  const levelF = (k) => LV0 + (LV1 - LV0) * k / (PER - 1);
  function layoutPath(ch, entry, exit) {
    const R = ch.r, rng = ch.rng;
    const a = entry.clone().setLength(R * 0.98), b = exit.clone().setLength(R * 0.98);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    // une seule grande courbe en S : elle laisse deux larges zones, une de chaque côté
    const waves = 1, amp = R * (0.26 + rng() * 0.08), ph = rng() < 0.5 ? 0 : Math.PI;
    const pts = [a];
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const p = a.clone().addScaledVector(dir, len * t).addScaledVector(side, Math.sin(Math.PI * 2 * waves * t + ph) * amp * Math.sin(Math.PI * t));
      const r = Math.hypot(p.x, p.z);
      if (r > R * 0.72) p.multiplyScalar(R * 0.72 / r);
      pts.push(p);
    }
    pts.push(b);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const M = 260;
    const samp = curve.getSpacedPoints(M);
    samp.forEach((p) => { p.y = 0; });
    const cum = [0];
    for (let i = 1; i < samp.length; i++) cum.push(cum[i - 1] + samp[i].distanceTo(samp[i - 1]));
    ch.path = { samp, cum, len: cum[cum.length - 1] };
    ch.pathPts = samp.filter((p, i) => i % 3 === 0 || i === samp.length - 1);
  }
  // point du sentier à la fraction f (0 → plage d'arrivée, 1 → plage de départ), repère de l'île
  function pathAt(ch, f) {
    const P = ch.path, s = Math.max(0, Math.min(1, f)) * P.len;
    let lo = 0, hi = P.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] < s) lo = m; else hi = m; }
    const k = (s - P.cum[lo]) / Math.max(1e-6, P.cum[hi] - P.cum[lo]);
    return P.samp[lo].clone().lerp(P.samp[hi], k);
  }
  const pathWorld = (c, f) => pathAt(chapters[c], f).add(chapters[c].group.position).setY(0);
  // points de passage le long du sentier entre deux fractions (bornes exclues)
  function curveWps(c, f0, f1) {
    const ch = chapters[c], out = [];
    const n = Math.floor(Math.abs(f1 - f0) * ch.path.len / 0.42);
    for (let i = 1; i <= n; i++) out.push({ c, at: pathWorld(c, f0 + (f1 - f0) * i / (n + 1)) });
    return out;
  }
  // fraction du sentier → « temps » du voyage, en niveaux (k-ième niveau = c·PER + k)
  const pathLevel = (c, f) => c * PER + (f - LV0) / (LV1 - LV0) * (PER - 1);

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

  // chemin de sable clair aux bords nets, liseré plus foncé, quelques dalles rondes
  let pathTex = null;
  function pathTexture() {
    if (pathTex) return pathTex;
    const W = 128, H = 256, r = C.makeRng('dallage');
    pathTex = canvasTexture(W, H, (g) => {
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#e9c98f'; g.fillRect(8, 0, W - 16, H);      // liseré
      g.fillStyle = '#fff1cf'; g.fillRect(16, 0, W - 32, H);     // sable
      for (let k = 0; k < 16; k++) {                             // dalles rondes, comme des galets posés
        const x = 30 + r() * (W - 60), y = r() * H, rr = 7 + r() * 7;
        g.fillStyle = 'rgba(232,206,160,.8)';
        [0, H, -H].forEach((oy) => { g.beginPath(); g.ellipse(x, y + oy, rr * 1.3, rr, 0, 0, Math.PI * 2); g.fill(); });
      }
    });
    pathTex.wrapS = THREE.ClampToEdgeWrapping; pathTex.wrapT = THREE.RepeatWrapping;
    return pathTex;
  }
  // progression du voyage le long du sentier (niveaux), partagée par tous les rubans
  const pathU = { value: 0 };
  function pathMaterial() {
    const mat = toonMat({ color: '#ffffff', map: pathTexture(), transparent: true, alphaTest: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDone = pathU;
      sh.vertexShader = 'attribute float along;\nvarying float vAlong;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
      sh.fragmentShader = 'uniform float uDone;\nvarying float vAlong;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          // derrière Ulysse : chemin doré et lumineux ; devant : sable clair
          'float lit = 1.0 - smoothstep(uDone - 0.05, uDone + 0.3, vAlong);',
          'diffuseColor.rgb *= mix(vec3(1.0), vec3(1.08, 0.92, 0.55), lit);'
        ].join('\n'))
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.18, 0.12, 0.02) * lit * diffuseColor.rgb;');
    };
    return mat;
  }
  // ruban du sentier, posé sur le relief
  function pathRibbon(ch) {
    const S = ch.path.samp, cum = ch.path.cum, L = ch.path.len;
    const pos = [], uv = [], along = [], idx = [];
    for (let i = 0; i < S.length; i++) {
      const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const w = PATH_W * (i < 4 || i > S.length - 5 ? 0.8 : 1);
      [[1, 0], [-1, 1]].forEach(([sg, u]) => {
        const x = S[i].x + nx * w * sg, z = S[i].z + nz * w * sg;
        const r = Math.hypot(x, z);
        const y = r < ch.r ? heightLocal(ch, x, z) : TOP;
        pos.push(x, y + 0.028, z);
        uv.push(u, cum[i] / 0.62);
        along.push(pathLevel(ch.c, cum[i] / L));
      });
      if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = pathMaterial();
    ch.fadeMats.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    ch.group.add(mesh);
    ch.ribbon = mesh;
  }

  // petite fusion de géométries colorées (un seul appel de dessin) : [{ geo, color, m: Matrix4 }]
  function mergeParts(parts) {
    const pos = [], nor = [], col = [];
    const v = new THREE.Vector3(), c = new THREE.Color(), nm = new THREE.Matrix3();
    parts.forEach((p) => {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
      const P = g.attributes.position, N = g.attributes.normal;
      nm.getNormalMatrix(p.m);
      c.copy(lin(p.color));
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(p.m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }
  const M4 = (x, y, z, ry, sx, sy, sz, rx, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')),
    new THREE.Vector3(sx || 1, sy || (sy == null && sx) || 1, sz || (sz == null && sx) || 1)); // (une seule échelle : uniforme)

  // un tronçon de ponton : trois planches et deux pieux (géométrie partagée)
  let pierGeo = null, pierMat = null;
  function pierSegment() {
    if (!pierGeo) {
      const parts = [];
      const plank = new THREE.BoxGeometry(0.7, 0.05, 0.19);
      [-0.21, 0, 0.21].forEach((z, i) => parts.push({ geo: plank, color: i === 1 ? '#b58f68' : '#a98260', m: M4(0, 0, z, (i - 1) * 0.03) }));
      const beam = new THREE.BoxGeometry(0.06, 0.06, 0.66);
      [-0.3, 0.3].forEach((x) => parts.push({ geo: beam, color: '#8a6a4c', m: M4(x, -0.05, 0) }));
      const post = new THREE.CylinderGeometry(0.045, 0.05, 1.5, 7);
      [-0.36, 0.36].forEach((x) => parts.push({ geo: post, color: '#7d5f44', m: M4(x, -0.62, 0) }));
      const top = new THREE.SphereGeometry(0.05, 7, 5);
      [-0.36, 0.36].forEach((x) => parts.push({ geo: top, color: '#7d5f44', m: M4(x, 0.12, 0) }));
      pierGeo = mergeParts(parts);
      pierMat = toonMat({ color: '#ffffff', vertexColors: true, roughness: 0.85 });
    }
    const m = new THREE.Mesh(pierGeo, pierMat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // ------------------------------------------------------------------
  // Les îles de l'Odyssée. Chacune est dessinée comme une planche de dessin animé :
  // une plage en anneau, un plateau d'herbe, UN village groupé autour d'une placette,
  // UN bosquet (verger aligné ou rond d'arbres), UN monument lié à l'épisode, quelques
  // massifs de fleurs. Tout est posé par règles (zones, anneaux, alignements), loin du
  // sentier, puis fusionné en un seul maillage par île (un appel de dessin).
  // ------------------------------------------------------------------
  // grass = [herbe, taches plus fraîches, hauteurs] ; roofs = toits du village ;
  // tree = essence du bosquet ; animals = [espèce, nombre] ; landmark = monument
  const ISLES = [
    { id: 'troie', grass: ['#79d14a', '#8fdc55', '#b8e86a'], tree: 'olive', grove: 'orchard', roofs: ['#ee7a4d', '#f4a259'], flowers: ['#ff5d8f', '#ffd23f'], animals: ['sheep', 2], landmark: 'horse' },
    { id: 'cicones', grass: ['#6fd04f', '#86dc5c', '#b5e86e'], tree: 'round', grove: 'ring', roofs: ['#3d8ee8', '#ee7a4d'], flowers: ['#ffd23f', '#ff7a5c'], animals: ['sheep', 3], landmark: 'market' },
    { id: 'lotus', grass: ['#62d877', '#7de38a', '#b0ee8e'], tree: 'palm', grove: 'ring', roofs: ['#ff8fb1', '#3db8c9'], flowers: ['#ff8fc0', '#ffffff'], animals: null, landmark: 'lotus', beach: 'palms' },
    { id: 'cyclope', grass: ['#8bd24e', '#a0dc5a', '#c4e874'], tree: 'pine', grove: 'ring', roofs: ['#d9824a', '#c96f45'], flowers: ['#ffd23f', '#ffffff'], animals: ['sheep', 6], landmark: 'cave' },
    { id: 'eolie', grass: ['#7ad65e', '#93e070', '#bdec86'], tree: 'round', grove: 'orchard', roofs: ['#3d8ee8', '#5aa9f0'], flowers: ['#7ec8ff', '#ffffff'], animals: ['sheep', 2], landmark: 'windmills' },
    { id: 'lestrygons', grass: ['#76cc55', '#8ed866', '#b2e47c'], tree: 'pine', grove: 'ring', roofs: ['#ee7a4d', '#d9824a'], flowers: ['#ff5d5d', '#ffd23f'], animals: null, landmark: 'cliffs' },
    { id: 'circe', grass: ['#6fd67e', '#8be092', '#b5eca4'], tree: 'round', grove: 'ring', roofs: ['#c86fd6', '#ff8fb1'], flowers: ['#d68bff', '#ff8fc0'], animals: ['pig', 4], landmark: 'palace' },
    { id: 'ombres', grass: ['#7fd6b4', '#97e0c4', '#c0ecd8'], tree: 'cypress', grove: 'orchard', roofs: ['#8a7fe0', '#a99cf0'], flowers: ['#c7b8ff', '#ffffff'], animals: null, landmark: 'portal' },
    { id: 'sirenes', grass: ['#7ddc6c', '#96e57e', '#c0f09a'], tree: 'palm', grove: 'ring', roofs: ['#3db8c9', '#5ad1c9'], flowers: ['#ff8fc0', '#ffd23f'], animals: null, landmark: 'shells', beach: 'palms' },
    { id: 'charybde', grass: ['#72d35c', '#8bde6c', '#b4ea86'], tree: 'pine', grove: 'ring', roofs: ['#3d8ee8', '#ee7a4d'], flowers: ['#7ec8ff', '#ffd23f'], animals: ['sheep', 2], landmark: 'whirlpool' },
    { id: 'thrinacie', grass: ['#a2d94a', '#b6e25a', '#d6ee7a'], tree: 'olive', grove: 'orchard', roofs: ['#f4a259', '#ee7a4d'], flowers: ['#ffd23f', '#ff9f3d'], animals: ['cow', 4], landmark: 'sun' },
    { id: 'ogygie', grass: ['#5fd884', '#7be396', '#aaeeb0'], tree: 'palm', grove: 'ring', roofs: ['#3db8c9', '#ff8fb1'], flowers: ['#ff8fc0', '#d68bff'], animals: null, landmark: 'grotto', beach: 'palms' },
    { id: 'scherie', grass: ['#78d65c', '#90e06e', '#b8ec88'], tree: 'round', grove: 'orchard', roofs: ['#f2c14e', '#3d8ee8'], flowers: ['#ffd23f', '#ff5d8f'], animals: ['sheep', 2], landmark: 'palaceGold' },
    { id: 'ithaque', grass: ['#80d251', '#97dd62', '#bfe97a'], tree: 'olive', grove: 'orchard', roofs: ['#ee7a4d', '#f4a259'], flowers: ['#ff5d8f', '#ffffff'], animals: ['sheep', 3], landmark: 'home' }
  ];
  const isleOf = (c) => ISLES[c % ISLES.length];
  const SAND = '#ffe3a1', CLIFF = '#f4bf7f', WHITE = '#fffaf0', BLUE = '#3d7fe0', WOOD = '#b77a45', WOOD_D = '#8a5a30';

  // bibliothèque de formes simples, non indexées (fusion rapide)
  let GEO = null;
  function geoLib() {
    if (GEO) return GEO;
    const ni = (g) => (g.index ? g.toNonIndexed() : g);
    const tri = new THREE.Shape();
    tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 1); tri.lineTo(-0.5, 0);
    const prism = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false });
    prism.translate(0, 0, -0.5); prism.rotateY(Math.PI / 2); // faîtage le long de x
    const star = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 0.42 : 1;
      if (k) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.25, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 1 });
    starGeo.translate(0, 0, -0.125);
    GEO = {
      box: ni(new THREE.BoxGeometry(1, 1, 1)),
      cyl: ni(new THREE.CylinderGeometry(0.5, 0.5, 1, 14)),
      cyl6: ni(new THREE.CylinderGeometry(0.5, 0.5, 1, 7)),
      taper: ni(new THREE.CylinderGeometry(0.4, 0.5, 1, 12)),
      cone: ni(new THREE.ConeGeometry(0.5, 1, 12)),
      ball: ni(new THREE.IcosahedronGeometry(0.5, 1)),
      rock: ni(new THREE.IcosahedronGeometry(0.5, 0)),
      sphere: ni(new THREE.SphereGeometry(0.5, 12, 8)),
      dome: ni(new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
      torus: ni(new THREE.TorusGeometry(0.5, 0.14, 6, 18)),
      prism: ni(prism),
      star: ni(starGeo)
    };
    return GEO;
  }

  // « kit » de construction : pièces colorées dans un repère qu'on peut emboîter
  function kit() {
    const parts = [];
    let base = new THREE.Matrix4();
    const k = {
      parts,
      add(geo, color, x, y, z, sx, sy, sz, ry, rx, rz) {
        parts.push({ geo, color, m: base.clone().multiply(M4(x, y, z, ry, sx, sy == null ? sx : sy, sz == null ? sx : sz, rx, rz)) });
        return k;
      },
      at(x, y, z, ry, s, fn) { const prev = base; base = prev.clone().multiply(M4(x, y, z, ry, s, s, s)); fn(); base = prev; return k; },
      pt(x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(base); },
      rot() { return new THREE.Euler().setFromRotationMatrix(base, 'YXZ').y; }
    };
    return k;
  }

  // --- éléments de décor (chacun dessiné à l'origine, face vers +z) ---
  function drawTree(k, type, rng) {
    const G = geoLib();
    const j = () => 0.9 + rng() * 0.2;
    if (type === 'palm') {
      let x = 0, y = 0;
      const lean = 0.06 + rng() * 0.05;
      for (let i = 0; i < 6; i++) {
        k.add(G.cyl, i % 2 ? '#c99a5e' : '#b5844a', x, y + 0.13, 0, 0.17 - i * 0.012, 0.27, 0.17 - i * 0.012, 0, 0, -lean * 1.6);
        x += lean; y += 0.25;
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng() * 0.3;
        k.add(G.ball, i % 2 ? '#35c24a' : '#4cd65a', x + Math.sin(a) * 0.38, y + 0.02, Math.cos(a) * 0.38, 0.24, 0.07, 0.9, a, 0.42);
      }
      [0, 2, 4].forEach((i) => k.add(G.sphere, '#8a5a2b', x + Math.cos(i) * 0.09, y - 0.08, Math.sin(i) * 0.09, 0.13));
      return;
    }
    if (type === 'pine') {
      k.add(G.cyl, WOOD, 0, 0.18, 0, 0.13, 0.36, 0.13);
      k.add(G.cone, '#27a862', 0, 0.62, 0, 0.95 * j(), 0.75, 0.95);
      k.add(G.cone, '#33bd70', 0, 1.0, 0, 0.74, 0.65, 0.74);
      k.add(G.cone, '#45d17f', 0, 1.33, 0, 0.5, 0.55, 0.5);
      return;
    }
    if (type === 'cypress') {
      k.add(G.cyl, WOOD, 0, 0.12, 0, 0.12, 0.24, 0.12);
      k.add(G.ball, '#24a05e', 0, 0.95, 0, 0.5, 1.6 * j(), 0.5);
      k.add(G.ball, '#33b86c', 0.05, 1.12, 0.06, 0.34, 1.0, 0.34);
      return;
    }
    if (type === 'olive') {
      k.add(G.cyl, '#9c7352', 0, 0.22, 0, 0.16, 0.45, 0.16, 0, 0, 0.12);
      k.add(G.cyl, '#9c7352', 0.06, 0.5, 0, 0.1, 0.3, 0.1, 0, 0, -0.4);
      k.add(G.ball, '#98cf58', 0.1, 0.82, 0, 0.78 * j(), 0.5, 0.72);
      k.add(G.ball, '#86c44c', -0.22, 0.74, 0.12, 0.5, 0.36, 0.5);
      k.add(G.ball, '#aad968', 0.2, 0.95, -0.12, 0.46, 0.34, 0.46);
      return;
    }
    // arbre rond (feuillus)
    k.add(G.cyl, WOOD, 0, 0.26, 0, 0.15, 0.52, 0.15);
    k.add(G.ball, '#3fbf45', 0, 0.82, 0, 0.82 * j());
    k.add(G.ball, '#55d455', 0.2, 1.02, 0.08, 0.55);
    k.add(G.ball, '#34b23c', -0.22, 0.92, -0.08, 0.55);
  }
  function drawBush(k, rng, col) {
    const G = geoLib();
    k.add(G.ball, col || '#43c64a', 0, 0.16, 0, 0.5, 0.38, 0.5);
    k.add(G.ball, '#55d455', 0.22, 0.13, 0.06, 0.34, 0.28, 0.34);
    k.add(G.ball, '#38b443', -0.2, 0.12, -0.05, 0.32, 0.26, 0.32);
  }
  function drawFlowers(k, palette, rng) {
    const G = geoLib();
    k.add(G.ball, '#4fcf55', 0, 0.06, 0, 0.62, 0.18, 0.62);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + rng(), r = i ? 0.2 + rng() * 0.08 : 0;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.16 + rng() * 0.08;
      const col = palette[i % palette.length];
      k.add(G.cyl6, '#3aa846', x, h / 2, z, 0.025, h, 0.025);
      k.add(G.sphere, col, x, h + 0.02, z, 0.13, 0.08, 0.13);
      k.add(G.sphere, '#ffe14d', x, h + 0.05, z, 0.05);
    }
  }
  function drawHouse(k, roof, style) {
    const G = geoLib();
    k.add(G.box, '#efe2cc', 0, 0.04, 0, 0.86, 0.08, 0.76);
    k.add(G.box, WHITE, 0, 0.38, 0, 0.8, 0.68, 0.7);
    k.add(G.box, BLUE, 0, 0.2, 0.36, 0.22, 0.36, 0.04);
    k.add(G.sphere, '#ffd23f', 0.07, 0.2, 0.385, 0.03);
    [-0.25, 0.25].forEach((x) => k.add(G.box, BLUE, x, 0.47, 0.36, 0.15, 0.15, 0.04));
    k.add(G.box, BLUE, 0.41, 0.45, 0, 0.04, 0.15, 0.15);
    k.add(G.box, '#ffffff', 0, 0.52, 0.37, 0.9, 0.025, 0.02);
    if (style === 'dome') {
      k.add(G.box, WHITE, 0, 0.74, 0, 0.84, 0.06, 0.74);
      k.add(G.cyl, WHITE, 0, 0.8, 0, 0.42, 0.08, 0.42);
      k.add(G.dome, roof, 0, 0.83, 0, 0.42, 0.42, 0.42);
    } else {
      k.add(G.prism, roof, 0, 0.71, 0, 0.98, 0.36, 0.86);
      k.add(G.box, WHITE, 0.24, 0.92, -0.12, 0.1, 0.22, 0.1);
    }
  }
  function drawFountain(k) {
    const G = geoLib();
    k.add(G.cyl, '#f6e4bf', 0, 0.02, 0, 1.9, 0.05, 1.9);
    k.add(G.cyl, '#fff3dc', 0, 0.12, 0, 0.62, 0.2, 0.62);
    k.add(G.cyl, '#47cfee', 0, 0.2, 0, 0.5, 0.06, 0.5);
    k.add(G.cyl, '#fff3dc', 0, 0.36, 0, 0.1, 0.36, 0.1);
    k.add(G.cyl, '#fff3dc', 0, 0.55, 0, 0.3, 0.06, 0.3);
    k.add(G.ball, '#8fe6ff', 0, 0.63, 0, 0.14);
  }
  function drawColumn(k, h, col) {
    const G = geoLib();
    k.add(G.box, '#f3ead8', 0, 0.04, 0, 0.26, 0.08, 0.26);
    k.add(G.cyl, col || '#ffffff', 0, 0.08 + h / 2, 0, 0.16, h, 0.16);
    k.add(G.box, '#f3ead8', 0, 0.12 + h, 0, 0.26, 0.08, 0.26);
  }
  function drawRock(k, col, sx, sy, sz, ry) {
    const G = geoLib();
    k.add(G.rock, col || '#c9c1d8', 0, sy * 0.36, 0, sx, sy, sz, ry || 0);
  }
  function drawLighthouse(k) {
    const G = geoLib();
    k.add(G.taper, WHITE, 0, 0.7, 0, 0.5, 1.4, 0.5);
    k.add(G.cyl, '#ff5d5d', 0, 0.55, 0, 0.47, 0.2, 0.47);
    k.add(G.cyl, '#ff5d5d', 0, 1.05, 0, 0.43, 0.2, 0.43);
    k.add(G.cyl, '#f3ead8', 0, 1.43, 0, 0.56, 0.06, 0.56);
    k.add(G.cyl, '#ffe066', 0, 1.58, 0, 0.3, 0.26, 0.3);
    k.add(G.cone, '#ff5d5d', 0, 1.82, 0, 0.42, 0.24, 0.42);
  }
  function drawPalace(k, wall, roof, trim) {
    const G = geoLib();
    k.add(G.box, '#fff3e0', 0, 0.06, 0, 2.0, 0.12, 1.3);
    k.add(G.box, '#fff8ec', 0, 0.18, 0, 1.8, 0.12, 1.12);
    k.add(G.box, wall, 0, 0.56, -0.08, 1.3, 0.66, 0.7);
    k.add(G.box, BLUE, 0, 0.42, 0.28, 0.26, 0.4, 0.04);
    [-0.75, -0.25, 0.25, 0.75].forEach((x) => k.at(x, 0.24, 0.42, 0, 1, () => drawColumn(k, 0.66)));
    k.add(G.box, trim, 0, 1.02, 0, 1.9, 0.1, 1.2);
    k.add(G.prism, roof, 0, 1.07, 0, 2.0, 0.42, 1.24);
    k.add(G.sphere, '#ffd23f', 0, 1.5, 0, 0.14);
  }

  // --- monuments : un par île, liés à l'épisode de l'Odyssée (face vers le sentier) ---
  const LANDMARKS = {
    // Troie : le cheval de bois sur son chariot, devant un pan de remparts
    horse(k) {
      const G = geoLib();
      k.add(G.box, '#f2d9a6', 0, 0.36, -0.95, 2.2, 0.72, 0.32);
      [-0.9, -0.45, 0, 0.45, 0.9].forEach((x, i) => { if (i !== 3) k.add(G.box, '#f2d9a6', x, 0.82, -0.95, 0.26, 0.22, 0.34); });
      k.add(G.box, '#e8c88c', -1.05, 0.55, -0.9, 0.4, 1.1, 0.42);
      k.at(0, 0, 0.1, 0, 1, () => {
        k.add(G.box, WOOD_D, 0, 0.26, 0, 1.25, 0.12, 0.6);
        [[-0.45, 0.33], [0.45, 0.33], [-0.45, -0.33], [0.45, -0.33]].forEach(([x, z]) => k.add(G.cyl, '#7a4a26', x, 0.16, z, 0.32, 0.08, 0.32, 0, Math.PI / 2));
        [[-0.32, 0.15], [0.32, 0.15], [-0.32, -0.15], [0.32, -0.15]].forEach(([x, z]) => k.add(G.cyl, '#d39553', x, 0.55, z, 0.14, 0.5, 0.14));
        k.add(G.ball, '#dfa15c', 0, 0.98, 0, 1.15, 0.6, 0.55);
        k.add(G.box, '#dfa15c', 0.42, 1.3, 0, 0.26, 0.6, 0.24, 0, 0, -0.45);
        k.add(G.box, '#e6aa66', 0.66, 1.58, 0, 0.5, 0.26, 0.26, 0, 0, -0.1);
        k.add(G.box, WOOD_D, 0.36, 1.48, 0, 0.14, 0.4, 0.27, 0, 0, -0.45);
        [-0.07, 0.07].forEach((z) => { k.add(G.cone, '#dfa15c', 0.52, 1.8, z, 0.1, 0.18, 0.1); k.add(G.sphere, '#2b2b3a', 0.74, 1.64, z * 2.1, 0.07); });
        k.add(G.cone, WOOD_D, -0.6, 0.95, 0, 0.12, 0.45, 0.12, 0, 0, 1.0);
      });
    },
    // Ismaros (Cicones) : marché aux étals rayés et aux paniers de fruits
    market(k, ctx) {
      const G = geoLib();
      [[-0.75, 0.1, 0.35, '#ff6b6b'], [0, -0.15, 0, '#ffb43d'], [0.75, 0.1, -0.35, '#3d8ee8']].forEach(([x, z, ry, col]) => k.at(x, 0, z, ry, 1, () => {
        k.add(G.box, '#d39553', 0, 0.18, 0, 0.62, 0.36, 0.38);
        [-0.28, 0.28].forEach((px) => k.add(G.cyl6, WOOD_D, px, 0.4, -0.16, 0.05, 0.8, 0.05));
        for (let i = 0; i < 4; i++) k.add(G.box, i % 2 ? '#ffffff' : col, -0.24 + i * 0.16, 0.8, 0, 0.16, 0.05, 0.5, 0, 0.3);
        ['#ffa53d', '#ff5d5d', '#8bd34a'].forEach((fc, i) => k.add(G.sphere, fc, -0.18 + i * 0.18, 0.4, 0.06, 0.14));
      }));
      [-0.3, 0.3].forEach((x) => { k.add(G.sphere, '#e0884d', x, 0.2, 0.75, 0.32, 0.38, 0.32); k.add(G.cyl, '#e0884d', x, 0.42, 0.75, 0.12, 0.14, 0.12); });
    },
    // Lotophages : un étang de lotus roses et de nénuphars
    lotus(k, ctx) {
      const G = geoLib(), rng = ctx.rng;
      k.add(G.cyl, '#fff0c8', 0, 0.03, 0, 2.3, 0.08, 2.0);
      k.add(G.cyl, '#3fd0ef', 0, 0.06, 0, 2.0, 0.06, 1.72);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.3, r = 0.25 + (i % 3) * 0.22;
        const x = Math.cos(a) * r * 1.1, z = Math.sin(a) * r * 0.9;
        k.add(G.cyl6, '#45c552', x, 0.1, z, 0.34, 0.02, 0.34, a);
        if (i % 2 === 0) k.at(x, 0.12, z, a, 1, () => {
          for (let p = 0; p < 6; p++) { const b = p * Math.PI / 3; k.add(G.sphere, p % 2 ? '#ff9cc8' : '#ff7fb6', Math.sin(b) * 0.07, 0.05, Math.cos(b) * 0.07, 0.07, 0.07, 0.16, b, -0.6); }
          k.add(G.sphere, '#ffe14d', 0, 0.08, 0, 0.08);
        });
      }
      [[1.0, 0.5], [-0.95, -0.55], [-1.05, 0.4]].forEach(([x, z]) => { for (let i = 0; i < 3; i++) { k.add(G.cyl6, '#3aa846', x + i * 0.06, 0.25, z, 0.03, 0.5, 0.03); k.add(G.sphere, '#9c6a3a', x + i * 0.06, 0.5, z, 0.05, 0.14, 0.05); } });
    },
    // Cyclopes : la grotte de Polyphème, son gros rocher
    cave(k) {
      const G = geoLib(), rock = '#c3b6d6';
      k.add(G.ball, rock, 0, 0.5, -0.2, 2.3, 1.7, 1.7);
      k.add(G.ball, '#b5a7cb', 0.85, 0.32, 0.05, 1.2, 1.0, 1.2);
      k.add(G.ball, '#cfc3df', -0.85, 0.34, -0.05, 1.3, 1.1, 1.2);
      k.add(G.ball, '#6fd04f', 0, 1.3, -0.25, 1.4, 0.3, 1.1);
      k.add(G.cyl, '#3b2f55', 0, 0.2, 0.6, 1.0, 0.06, 1.1, 0, Math.PI / 2 - 0.15);
      k.add(G.rock, '#d4c9e3', 0.75, 0.25, 0.85, 0.6, 0.5, 0.6, 0.6);
      k.add(G.cyl, '#8a5a30', -0.75, 0.32, 0.75, 0.12, 0.65, 0.12, 0, 0.2, 0.3);
    },
    // Éolie : deux moulins à vent et un muret de bronze
    windmills(k, ctx) {
      const G = geoLib();
      k.add(G.box, '#e3a043', 0, 0.2, -0.85, 2.3, 0.4, 0.18);
      k.add(G.box, '#ffcb5c', 0, 0.42, -0.85, 2.36, 0.06, 0.24);
      [[-0.6, 0], [0.65, 0.15]].forEach(([x, z]) => k.at(x, 0, z, 0, 1, () => {
        k.add(G.taper, WHITE, 0, 0.6, 0, 0.66, 1.2, 0.66);
        k.add(G.cone, '#ee7a4d', 0, 1.4, 0, 0.82, 0.45, 0.82);
        k.add(G.box, BLUE, 0, 0.18, 0.31, 0.18, 0.32, 0.04);
        ctx.sails.push({ p: k.pt(0, 1.08, 0.36), ry: k.rot() });
      }));
    },
    // Lestrygons : hautes aiguilles de falaise et phare du port
    cliffs(k) {
      const G = geoLib();
      [[-0.55, -0.2, 0.95, 2.4], [0.25, -0.5, 0.8, 1.8], [-0.05, 0.35, 0.6, 1.1]].forEach(([x, z, w, h]) => {
        k.add(G.rock, '#f0b27a', x, h * 0.42, z, w, h, w, x * 3);
        k.add(G.ball, '#6fd04f', x, h * 0.8, z, w * 0.6, 0.18, w * 0.6);
      });
      k.at(0.8, 0, 0.35, 0, 0.85, () => drawLighthouse(k));
    },
    // Circé : palais rose, jardin de haies et de fleurs (les cochons gambadent autour)
    palace(k, ctx) {
      const G = geoLib();
      k.at(0, 0, -0.25, 0, 1.0, () => drawPalace(k, '#ffe0ef', '#d96bd6', '#ffd6ea'));
      [-0.75, 0.75].forEach((x) => { k.add(G.box, '#3fbf45', x, 0.16, 0.75, 0.75, 0.32, 0.26); k.add(G.ball, '#3fbf45', x, 0.33, 0.75, 0.75, 0.12, 0.26); });
      [-0.75, 0.75].forEach((x) => k.at(x, 0.3, 0.75, 0, 0.6, () => drawFlowers(k, ctx.isle.flowers, ctx.rng)));
    },
    // Pays des Ombres : un portique de pierre mauve, une lueur douce, des lanternes
    portal(k, ctx) {
      const G = geoLib();
      k.add(G.cyl, '#efe6ff', 0, 0.03, 0, 2.2, 0.06, 1.6);
      [-0.55, 0.55].forEach((x) => { k.add(G.cyl, '#d9cff5', x, 0.65, 0, 0.26, 1.3, 0.26); k.add(G.box, '#c9bdf0', x, 0.05, 0, 0.34, 0.1, 0.34); });
      k.add(G.box, '#c9bdf0', 0, 1.36, 0, 1.5, 0.2, 0.34);
      k.add(G.prism, '#b3a3ee', 0, 1.46, 0, 1.5, 0.28, 0.36);
      k.add(G.cyl, '#cbb8ff', 0, 0.68, 0, 0.92, 0.04, 1.24, 0, Math.PI / 2);
      [[-1.0, 0.55], [1.0, 0.55]].forEach(([x, z]) => {
        k.add(G.cyl6, '#8a7fe0', x, 0.3, z, 0.06, 0.6, 0.06);
        k.add(G.ball, '#fff2a8', x, 0.68, z, 0.2);
      });
      ctx.mist.push(k.pt(0, 0.7, 0.3), k.pt(-1.3, 0.4, -0.4), k.pt(1.3, 0.45, -0.3), k.pt(0.2, 0.35, 1.2));
    },
    // Sirènes : rochers ronds, grands coquillages nacrés, étoiles de mer
    shells(k) {
      const G = geoLib();
      drawRock(k, '#c9c1d8', 1.6, 1.1, 1.3, 0.3);
      k.at(-0.7, 0, -0.2, 0.5, 1, () => drawRock(k, '#d6cfe3', 0.8, 0.6, 0.7));
      k.at(0.75, 0, -0.1, 1.2, 1, () => drawRock(k, '#bdb4cf', 0.7, 0.5, 0.6));
      const shell = (x, z, ry, s, col) => k.at(x, 0.02, z, ry, s, () => {
        for (let i = 0; i < 7; i++) k.add(G.sphere, i % 2 ? col : '#ffffff', 0, 0.28, 0.02, 0.12, 0.62, 0.08, 0, 0, -0.9 + i * 0.3);
        k.add(G.sphere, '#ffffff', 0, 0.05, 0.02, 0.16, 0.1, 0.1);
        k.add(G.sphere, '#fff7fb', 0, 0.12, 0.12, 0.12);
      });
      shell(-0.3, 0.6, 0.2, 1.6, '#ffb3c9');
      shell(0.55, 0.7, -0.3, 1.2, '#ffd0a8');
      [[0.15, 0.95, 0.3], [-0.75, 0.6, 1.1]].forEach(([x, z, r]) => k.at(x, 0.03, z, r, 0.2, () => k.add(G.star, '#ff8a3d', 0, 0, 0, 1, 1, 1, 0, -Math.PI / 2)));
    },
    // Charybde et Scylla : le rocher de Scylla et sa grotte (le tourbillon tourne au large)
    whirlpool(k, ctx) {
      const G = geoLib();
      k.add(G.rock, '#c3b6d6', 0, 0.85, -0.1, 1.3, 2.2, 1.2, 0.4);
      k.add(G.rock, '#b5a7cb', 0.55, 0.4, 0.2, 0.9, 1.0, 0.9, 1.1);
      k.add(G.cyl, '#3b2f55', 0.0, 0.55, 0.5, 0.42, 0.05, 0.5, 0, Math.PI / 2 - 0.2);
      k.add(G.ball, '#6fd04f', 0, 1.75, -0.1, 0.6, 0.2, 0.6);
      ctx.whirl = true;
    },
    // Thrinacie : la colonne du Soleil, au milieu du pré clos des vaches d'Hélios
    sun(k, ctx) {
      const G = geoLib();
      k.add(G.cyl, '#fff3e0', 0, 0.55, 0, 0.26, 1.1, 0.26);
      k.add(G.box, '#ffe8c0', 0, 0.06, 0, 0.5, 0.12, 0.5);
      k.at(0, 1.42, 0, 0, 1, () => {
        k.add(G.cyl, '#ffc531', 0, 0, 0, 0.62, 0.12, 0.62, 0, Math.PI / 2);
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; k.add(G.cone, '#ffa21f', Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0, 0.12, 0.24, 0.06, 0, 0, a - Math.PI / 2); }
        [-0.1, 0.1].forEach((x) => k.add(G.sphere, '#7a4a10', x, 0.06, 0.07, 0.05));
        k.add(G.torus, '#7a4a10', 0, -0.06, 0.06, 0.18, 0.12, 0.12, 0, 0, Math.PI);
      });
      for (let i = 0; i < 18; i++) { // enclos : piquets et lisses
        const a = (i / 18) * Math.PI * 2;
        if (Math.cos(a) > 0.9) continue; // une entrée, côté sentier
        const x = Math.sin(a) * 1.45, z = Math.cos(a) * 1.45;
        k.add(G.cyl6, '#c98b4f', x, 0.17, z, 0.07, 0.34, 0.07);
        const b = a + Math.PI / 18;
        if (Math.cos(b + Math.PI / 18) <= 0.9) k.add(G.box, '#dba066', Math.sin(b) * 1.45, 0.22, Math.cos(b) * 1.45, 0.06, 0.05, 0.52, b + Math.PI / 2);
      }
    },
    // Ogygie : la grotte de Calypso, ses vignes et sa petite source
    grotto(k, ctx) {
      const G = geoLib(), rock = '#e8c9a0';
      k.add(G.ball, rock, -0.72, 0.6, -0.1, 0.85, 1.4, 0.9);
      k.add(G.ball, rock, 0.72, 0.6, -0.1, 0.85, 1.4, 0.9);
      k.add(G.ball, '#f0d5b0', 0, 1.25, -0.1, 2.1, 0.62, 1.0);
      k.add(G.box, '#3c5c5a', 0, 0.45, -0.35, 0.8, 0.9, 0.1);
      k.add(G.ball, '#5ad455', 0, 1.52, -0.1, 1.7, 0.26, 0.8);
      for (let i = 0; i < 7; i++) {
        const x = -0.6 + i * 0.2, h = 0.3 + (i % 3) * 0.14;
        k.add(G.cyl6, '#2fae45', x, 1.15 - h / 2, 0.35, 0.03, h, 0.03);
        k.add(G.ball, i % 2 ? '#4cd65a' : '#ff8fc0', x, 1.15 - h, 0.35, 0.12);
      }
      k.add(G.cyl, '#fff0c8', 0, 0.03, 0.85, 1.1, 0.06, 0.8);
      k.add(G.cyl, '#3fd0ef', 0, 0.05, 0.85, 0.94, 0.06, 0.66);
    },
    // Schérie : le palais d'Alcinoos au toit d'or, bannières bleues
    palaceGold(k) {
      const G = geoLib();
      k.at(0, 0, -0.15, 0, 0.95, () => drawPalace(k, WHITE, '#ffc531', '#ffe8a8'));
      [-1.1, 1.1].forEach((x) => { k.add(G.cyl6, WOOD_D, x, 0.75, 0.4, 0.05, 1.5, 0.05); k.add(G.box, BLUE, x + 0.2, 1.3, 0.4, 0.36, 0.26, 0.03); });
    },
    // Ithaque : la maison d'Ulysse, son grand olivier et Argos le chien fidèle
    home(k, ctx) {
      const G = geoLib();
      k.add(G.box, '#efe2cc', 0, 0.05, -0.2, 1.7, 0.1, 1.2);
      k.add(G.box, WHITE, 0, 0.5, -0.25, 1.5, 0.84, 1.0);
      k.add(G.prism, '#ee7a4d', 0, 0.92, -0.25, 1.7, 0.5, 1.2);
      k.add(G.box, BLUE, 0, 0.27, 0.26, 0.3, 0.5, 0.04);
      [-0.45, 0.45].forEach((x) => { k.add(G.box, BLUE, x, 0.6, 0.26, 0.2, 0.2, 0.04); k.at(x, 0, 0.42, 0, 0.9, () => drawColumn(k, 0.78)); });
      k.add(G.box, '#efe2cc', 0, 0.94, 0.42, 1.3, 0.08, 0.3);
      k.at(-1.15, 0, -0.45, 0.4, 1.5, () => drawTree(k, 'olive', ctx.rng));
      k.at(0.55, 0, 0.75, -0.6, 1, () => { // Argos
        k.add(G.ball, '#c98b4f', 0, 0.2, 0, 0.36, 0.22, 0.2);
        k.add(G.ball, '#c98b4f', 0.2, 0.32, 0, 0.2);
        k.add(G.ball, '#8a5a30', 0.2, 0.36, 0.08, 0.06, 0.14, 0.04);
        k.add(G.ball, '#8a5a30', 0.2, 0.36, -0.08, 0.06, 0.14, 0.04);
        k.add(G.sphere, '#2b2b3a', 0.31, 0.3, 0, 0.05);
        [[-0.1, 0.06], [0.1, 0.06], [-0.1, -0.06], [0.1, -0.06]].forEach(([x, z]) => k.add(G.cyl6, '#c98b4f', x, 0.07, z, 0.05, 0.14, 0.05));
        k.add(G.cyl6, '#c98b4f', -0.2, 0.26, 0, 0.04, 0.18, 0.04, 0, 0, 0.8);
      });
    }
  };

  // --- animaux : corps fusionné + tête à part (elle broute) ---
  const ANIMALS = {
    sheep(k, h) {
      const G = geoLib();
      if (h) {
        k.add(G.ball, '#4a4458', 0, 0, 0, 0.2, 0.18, 0.17);
        [-1, 1].forEach((s) => { k.add(G.sphere, '#4a4458', -0.02, 0.06, s * 0.1, 0.05, 0.03, 0.09); k.add(G.sphere, '#ffffff', 0.08, 0.03, s * 0.045, 0.045); k.add(G.sphere, '#1e1b26', 0.1, 0.03, s * 0.045, 0.022); });
        k.add(G.ball, '#ffffff', -0.04, 0.09, 0, 0.13);
        return;
      }
      [[-0.1, -0.07], [0.1, -0.07], [-0.1, 0.07], [0.1, 0.07]].forEach(([x, z]) => k.add(G.cyl6, '#4a4458', x, 0.08, z, 0.05, 0.16, 0.05));
      k.add(G.ball, '#ffffff', 0, 0.25, 0, 0.42, 0.3, 0.32);
      [[0.12, 0.3, 0.08], [-0.12, 0.3, -0.08], [0.0, 0.34, 0.0], [-0.14, 0.26, 0.1], [0.12, 0.26, -0.1]].forEach(([x, y, z]) => k.add(G.ball, '#f6f4fb', x, y, z, 0.22));
    },
    pig(k, h) {
      const G = geoLib();
      if (h) {
        k.add(G.ball, '#ffb3c7', 0, 0, 0, 0.24, 0.22, 0.22);
        k.add(G.cyl, '#ff8fb0', 0.12, -0.01, 0, 0.11, 0.06, 0.11, 0, 0, Math.PI / 2);
        [-1, 1].forEach((s) => { k.add(G.cone, '#ff9cb8', 0, 0.12, s * 0.07, 0.08, 0.09, 0.05); k.add(G.sphere, '#1e1b26', 0.09, 0.05, s * 0.05, 0.03); });
        return;
      }
      [[-0.1, -0.07], [0.1, -0.07], [-0.1, 0.07], [0.1, 0.07]].forEach(([x, z]) => k.add(G.cyl6, '#ff9cb8', x, 0.07, z, 0.06, 0.14, 0.06));
      k.add(G.ball, '#ffb3c7', 0, 0.22, 0, 0.46, 0.3, 0.3);
      k.add(G.torus, '#ff9cb8', -0.23, 0.26, 0, 0.06, 0.06, 0.06, 0, 0, Math.PI / 2);
    },
    cow(k, h) {
      const G = geoLib();
      if (h) {
        k.add(G.ball, '#f2a541', 0, 0, 0, 0.26, 0.24, 0.22);
        k.add(G.ball, '#ffd9c2', 0.1, -0.05, 0, 0.14, 0.12, 0.17);
        [-1, 1].forEach((s) => { k.add(G.cone, '#fff3d6', -0.02, 0.14, s * 0.08, 0.04, 0.12, 0.04, 0, s * 0.5); k.add(G.sphere, '#1e1b26', 0.08, 0.05, s * 0.06, 0.03); });
        return;
      }
      [[-0.14, -0.08], [0.14, -0.08], [-0.14, 0.08], [0.14, 0.08]].forEach(([x, z]) => k.add(G.cyl6, '#e08a2a', x, 0.1, z, 0.07, 0.2, 0.07));
      k.add(G.ball, '#f2a541', 0, 0.32, 0, 0.56, 0.34, 0.32);
      k.add(G.ball, '#ffffff', 0.05, 0.38, 0.1, 0.2, 0.16, 0.14);
      k.add(G.ball, '#ffffff', -0.14, 0.34, -0.1, 0.18, 0.14, 0.14);
      k.add(G.cyl6, '#e08a2a', -0.28, 0.3, 0, 0.03, 0.22, 0.03, 0, 0, 0.5);
    }
  };
  const animalGeo = {};
  let animalMat = null;
  function animalGeos(kind) {
    if (!animalGeo[kind]) {
      const b = kit(), h = kit();
      ANIMALS[kind](b, false); ANIMALS[kind](h, true);
      animalGeo[kind] = { body: mergeParts(b.parts), head: mergeParts(h.parts), hx: kind === 'cow' ? 0.32 : 0.26, hy: kind === 'cow' ? 0.4 : kind === 'pig' ? 0.27 : 0.31 };
    }
    return animalGeo[kind];
  }
  function makeAnimal(ch, kind, home) {
    animalMat = animalMat || toonMat({ color: '#ffffff', vertexColors: true });
    const G = animalGeos(kind);
    const g = new THREE.Group();
    const body = new THREE.Mesh(G.body, animalMat);
    const head = new THREE.Mesh(G.head, animalMat);
    head.position.set(G.hx, G.hy, 0);
    body.castShadow = head.castShadow = true;
    body.userData.keepGeo = head.userData.keepGeo = true;
    g.add(body, head);
    g.scale.setScalar(kind === 'cow' ? 1.05 : 1.1);
    const a = ch.rng() * Math.PI * 2, d = home.r * 0.6 * ch.rng();
    const x = home.x + Math.cos(a) * d, z = home.z + Math.sin(a) * d;
    g.userData = { x, z, tx: x, tz: z, wait: ch.rng() * 4, hop: 0, head, hy: G.hy, home };
    g.rotation.y = ch.rng() * 6;
    ch.group.add(g);
    return g;
  }
  function updateSheep(ch, s, dt, t) {
    const u = s.userData;
    const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
    if (d < 0.05) {
      u.wait -= dt;
      u.head.position.y = u.hy - (Math.sin(t * 2 + u.x) > 0.3 ? 0.1 : 0); // il broute
      if (u.wait <= 0) { // nouvelle destination, dans son pré, loin du sentier
        const H = u.home;
        for (let k = 0; k < 10; k++) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * H.r;
          const nx = H.x + Math.cos(a) * r, nz = H.z + Math.sin(a) * r;
          if (Math.hypot(nx - H.x, nz - H.z) > (H.inner || 0) && distToPath(ch, nx, nz) > 0.75) { u.tx = nx; u.tz = nz; break; }
        }
        u.wait = 2 + Math.random() * 5;
      }
    } else {
      const step = Math.min(d, dt * 0.45);
      u.x += (dx / d) * step; u.z += (dz / d) * step;
      u.hop += dt * 9;
      u.head.position.y = u.hy;
      s.rotation.y = Math.atan2(-dz, dx);
    }
    s.position.set(u.x, heightLocal(ch, u.x, u.z) + (d >= 0.05 ? Math.abs(Math.sin(u.hop)) * 0.05 : 0), u.z);
  }

  // petite barque de pêche (géométrie partagée, une couleur de coque par variante)
  const boatGeos = {};
  function fishingBoatGeo(hull) {
    if (boatGeos[hull]) return boatGeos[hull];
    const parts = [];
    const shell = new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    parts.push({ geo: shell, color: '#f1ede4', m: M4(0, 0.16, 0, 0, 0.32, 0.36, 1) });
    parts.push({ geo: new THREE.TorusGeometry(0.5, 0.04, 5, 20), color: hull, m: M4(0, 0.15, 0, 0, 0.33, 1, 1.02, Math.PI / 2) });
    parts.push({ geo: new THREE.BoxGeometry(0.22, 0.03, 0.5), color: '#b08a64', m: M4(0, 0.12, 0) });
    parts.push({ geo: new THREE.CylinderGeometry(0.014, 0.014, 0.75, 5), color: '#8a6a4c', m: M4(0, 0.5, 0.08) });
    const sail = new THREE.BufferGeometry();
    sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.2, 0.1, 0, 0.85, 0.09, 0, 0.22, -0.32, 0, 0.2, 0.1, 0, 0.22, -0.32, 0, 0.85, 0.09], 3));
    sail.computeVertexNormals();
    parts.push({ geo: sail, color: '#f8f1e2', m: M4(0.01, 0, 0) });
    boatGeos[hull] = mergeParts(parts);
    return boatGeos[hull];
  }
  let boatMat = null;
  function fishingBoat(hull) {
    boatMat = boatMat || toonMat({ color: '#ffffff', vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    const m = new THREE.Mesh(fishingBoatGeo(hull), boatMat);
    m.castShadow = true;
    m.userData.keepGeo = true;
    return m;
  }

  // ailes de moulin (géométrie partagée)
  let sailGeo = null;
  function millSails() {
    if (!sailGeo) {
      const parts = [];
      for (let k = 0; k < 4; k++) {
        const ang = k * Math.PI / 2;
        parts.push({ geo: geoLib().box, color: WOOD_D, m: new THREE.Matrix4().makeRotationZ(ang).multiply(M4(0, 0.31, 0, 0, 0.04, 0.62, 0.03)) });
        parts.push({ geo: geoLib().box, color: k % 2 ? '#ffffff' : '#ff8f6b', m: new THREE.Matrix4().makeRotationZ(ang).multiply(M4(0.12, 0.38, 0, 0, 0.2, 0.48, 0.015)) });
      }
      parts.push({ geo: geoLib().sphere, color: '#ee7a4d', m: M4(0, 0, 0.02, 0, 0.14) });
      sailGeo = mergeParts(parts);
    }
    return sailGeo;
  }

  // tourbillon de Charybde : spirale peinte qui tourne au ras de l'eau
  let whirlTex = null;
  function whirlTexture() {
    return whirlTex || (whirlTex = canvasTexture(128, 128, (g) => {
      g.clearRect(0, 0, 128, 128);
      g.translate(64, 64);
      for (let arm = 0; arm < 3; arm++) {
        g.beginPath();
        for (let i = 0; i <= 60; i++) {
          const t = i / 60, a = arm * Math.PI * 2 / 3 + t * Math.PI * 3, r = 6 + t * 56;
          if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 7; g.lineCap = 'round'; g.stroke();
      }
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 64);
      grd.addColorStop(0, 'rgba(10,80,140,.75)'); grd.addColorStop(0.5, 'rgba(30,140,200,.35)'); grd.addColorStop(1, 'rgba(30,140,200,0)');
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = grd; g.fillRect(-64, -64, 128, 128);
    }));
  }

  // point le plus proche du sentier : distance et côté (+1 / -1)
  function pathSide(ch, x, z) {
    const pts = ch.pathPts;
    let best = Infinity, side = 1, px = 0, pz = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz || 1)));
      const qx = a.x + abx * t, qz = a.z + abz * t, d = Math.hypot(qx - x, qz - z);
      if (d < best) { best = d; px = qx; pz = qz; side = abx * (z - qz) - abz * (x - qx) > 0 ? 1 : -1; }
    }
    return { d: best, side, px, pz };
  }

  // Plan de l'île : on choisit les zones (monument, village, bosquet, pré, massifs) sur une
  // grille de points candidats, en gardant une large marge de chaque côté du sentier.
  function planIsland(ch) {
    const R = ch.r, rng = C.makeRng('plan:' + ch.c);
    const cand = [];
    for (let x = -R; x <= R; x += 0.3) for (let z = -R; z <= R; z += 0.3) {
      const r = Math.hypot(x, z);
      if (r > R * 0.8) continue;
      const ps = pathSide(ch, x, z);
      cand.push({ x, z, r, d: ps.d, side: ps.side, px: ps.px, pz: ps.pz, j: rng() * 0.3 });
    }
    const occ = [{ x: ch.gateLocal.x, z: ch.gateLocal.z, r: 1.1 }];
    if (ch.harborLand) occ.push(ch.harborLand);
    ch.nodes.forEach((n) => occ.push({ x: n.local.x, z: n.local.z, r: 0.6 }));
    const pick = (need, prefSide, gap) => {
      for (const s of [1, 0.85, 0.7]) {
        const rr = need * s;
        let best = null, bs = -Infinity;
        cand.forEach((c) => {
          if (c.d < rr + (gap == null ? 0.6 : gap)) return;
          if (c.r + rr * 0.85 > R * 0.86) return;
          if (occ.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < o.r + rr + 0.25)) return;
          const sc = Math.min(c.d, 2.6) + (prefSide && c.side === prefSide ? 3 : 0) + c.j - c.r * 0.08;
          if (sc > bs) { bs = sc; best = c; }
        });
        if (best) {
          const o = Object.assign({}, best, { s, rad: rr });
          occ.push({ x: o.x, z: o.z, r: rr });
          // orientation : face au sentier
          o.ry = Math.atan2(best.px - best.x, best.pz - best.z);
          return o;
        }
      }
      return null;
    };
    const plan = {};
    plan.landmark = pick(1.5, 0, 0.6);
    plan.village = pick(1.55, plan.landmark ? -plan.landmark.side : 0, 0.6);
    plan.grove = pick(1.05, 0, 0.6);
    plan.pasture = pick(0.9, 0, 0.7);
    plan.flowers = [];
    for (let i = 0; i < 4; i++) { const f = pick(0.36, 0, 0.75); if (f) plan.flowers.push(f); }
    plan.bushes = [];
    for (let i = 0; i < 3; i++) { const b = pick(0.42, 0, 0.8); if (b) plan.bushes.push(b); }
    plan.lone = [];
    for (let i = 0; i < 3; i++) { const t = pick(0.5, 0, 1.0); if (t) plan.lone.push(t); }
    return plan;
  }

  // matériau du décor fusionné d'une île (il s'estompe avec l'île dans la brume)
  function decorMaterial(ch) {
    if (!ch.decorMat) {
      ch.decorMat = toonMat({ color: '#ffffff', vertexColors: true, transparent: true });
      ch.fadeMats.push(ch.decorMat);
    }
    return ch.decorMat;
  }

  function decorate(ch) {
    const isle = ch.isle, R = ch.r;
    const rng = C.makeRng('decor:' + ch.c);
    const decor = new THREE.Group();
    ch.decor = decor;
    ch.group.add(decor);
    ch.life = { sails: [], boats: [], lamp: null, mist: [], whirl: null };
    const k = kit();
    const G = geoLib();
    const y0 = (x, z) => heightLocal(ch, x, z) - 0.02;
    const plan = ch.plan = planIsland(ch);
    const ctx = { rng, isle, sails: [], mist: [], whirl: false };

    // le monument
    const L = plan.landmark;
    if (L) k.at(L.x, y0(L.x, L.z), L.z, L.ry, L.s, () => LANDMARKS[isle.landmark](k, ctx));

    // le village : maisons en arc autour d'une placette à fontaine, ouvert vers le sentier
    const V = plan.village;
    if (V) {
      k.at(V.x, y0(V.x, V.z), V.z, 0, V.s, () => drawFountain(k));
      const a0 = Math.atan2(V.pz - V.z, V.px - V.x) + Math.PI;
      [-1.75, -0.6, 0.6, 1.75].forEach((off, i) => {
        const a = a0 + off, rr = 1.12 * V.s;
        const x = V.x + Math.cos(a) * rr, z = V.z + Math.sin(a) * rr;
        const ry = Math.atan2(V.x - x, V.z - z);
        k.at(x, y0(x, z), z, ry, 0.82 * V.s, () => drawHouse(k, isle.roofs[i % isle.roofs.length], i % 3 === 1 ? 'dome' : 'tile'));
      });
      // deux pots de fleurs devant les maisons du fond
      [-0.25, 0.25].forEach((off) => {
        const a = a0 + off, x = V.x + Math.cos(a) * 0.95 * V.s, z = V.z + Math.sin(a) * 0.95 * V.s;
        k.at(x, y0(x, z), z, 0, 0.45, () => { k.add(G.cyl, '#e0884d', 0, 0.15, 0, 0.36, 0.3, 0.36); drawBush(k, rng, '#4cd65a'); });
      });
    }

    // le bosquet : verger en rangées alignées sur le sentier, ou rond d'arbres
    const B = plan.grove;
    if (B) {
      const t = isle.tree, s = (t === 'cypress' ? 1.15 : 1.25) * B.s;
      const spots = [];
      if (isle.grove === 'orchard') {
        for (let i = -1; i <= 1; i++) for (let jj = 0; jj < 2; jj++) spots.push([i * 0.8, (jj - 0.5) * 0.8]);
      } else {
        spots.push([0, 0]);
        for (let i = 0; i < 4; i++) spots.push([Math.cos(i * Math.PI / 2 + 0.4) * 0.78, Math.sin(i * Math.PI / 2 + 0.4) * 0.78]);
      }
      const cs = Math.cos(B.ry), sn = Math.sin(B.ry);
      spots.forEach(([lx, lz]) => {
        const x = B.x + (lx * cs + lz * sn) * B.s, z = B.z + (-lx * sn + lz * cs) * B.s;
        k.at(x, y0(x, z), z, rng() * 6, s * (0.9 + rng() * 0.2), () => drawTree(k, t, rng));
      });
    }
    // arbres isolés, plus loin du sentier : ils encadrent la vue
    plan.lone.forEach((T) => k.at(T.x, y0(T.x, T.z), T.z, rng() * 6, 1.25 * T.s, () => drawTree(k, isle.tree === 'palm' ? 'round' : isle.tree, rng)));
    plan.bushes.forEach((b) => k.at(b.x, y0(b.x, b.z), b.z, rng() * 6, 1, () => drawBush(k, rng)));
    plan.flowers.forEach((f) => k.at(f.x, y0(f.x, f.z), f.z, rng() * 6, 1.1, () => drawFlowers(k, isle.flowers, rng)));

    // la plage : palmiers par paires (îles tropicales) ou touffes d'oyats, à intervalles réguliers
    const S = ch.path.samp;
    const ends = [Math.atan2(S[0].z, S[0].x), Math.atan2(S[S.length - 1].z, S[S.length - 1].x), ch.harborAngle];
    const far = (a, lim) => ends.every((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) > lim);
    let placed = 0;
    for (let i = 0; i < 12 && placed < 3; i++) {
      const a = ch.phase + i * (Math.PI * 2 / 12) * 5 % (Math.PI * 2);
      if (!far(a, 0.75)) continue;
      placed++;
      [-0.18, 0.18].forEach((da, j) => {
        const r = R * 0.93, x = Math.cos(a + da) * r, z = Math.sin(a + da) * r;
        if (isle.beach === 'palms') k.at(x, y0(x, z), z, a + Math.PI, 1.25 + j * 0.2, () => drawTree(k, 'palm', rng));
        else if (j === 0) k.at(x, y0(x, z), z, a, 0.8, () => { for (let q = 0; q < 4; q++) k.add(G.cone, '#9bd65a', (q - 1.5) * 0.12, 0.18, (q % 2) * 0.08, 0.08, 0.36, 0.08, 0, 0, (q - 1.5) * 0.25); });
      });
    }

    // le port : ponton vers le large, barques amarrées
    const ox = Math.cos(ch.harborAngle), oz = Math.sin(ch.harborAngle);
    const jr = Math.atan2(ox, oz);
    k.at(ox * R * 0.9, 0, oz * R * 0.9, jr, 1, () => {
      for (let i = 0; i < 9; i++) k.add(G.box, i % 2 ? '#c98b4f' : '#d39553', 0, 0.36, i * 0.22, 0.6, 0.06, 0.2);
      for (let i = 0; i < 3; i++) [-0.32, 0.32].forEach((x) => k.add(G.cyl6, WOOD_D, x, 0.12, i * 0.8, 0.09, 0.7, 0.09));
    });
    ch.harbor = { x: ox * R * 1.35, z: oz * R * 1.35, a: ch.harborAngle };
    [[0.55, 1.12], [-0.6, 1.4]].forEach(([side, dist], i) => {
      const b = fishingBoat(isle.roofs[i % isle.roofs.length]);
      b.position.set(ox * R * dist - oz * side, 0, oz * R * dist + ox * side);
      b.rotation.y = jr + (i ? 0.25 : -0.2);
      b.userData.base = b.rotation.y;
      b.userData.phase = rng() * 6;
      decor.add(b);
      ch.life.boats.push(b);
    });
    // deux îlots au large, loin des traversées : un dôme de sable et un palmier
    for (let i = 0, made = 0; i < 20 && made < 2; i++) {
      const a = rng() * Math.PI * 2;
      if (!far(a, 0.9)) continue;
      const d = R * (1.6 + rng() * 0.7), x = Math.cos(a) * d, z = Math.sin(a) * d;
      const s = 0.7 + rng() * 0.4;
      k.at(x, -0.1, z, rng() * 6, s, () => {
        k.add(G.dome, SAND, 0, 0, 0, 1.6, 0.55, 1.4);
        k.add(G.dome, isle.grass[0], 0, 0.12, 0, 1.0, 0.36, 0.9);
        k.at(0.1, 0.25, 0, 0, 0.9, () => drawTree(k, 'palm', rng));
      });
      made++;
    }

    const mesh = new THREE.Mesh(mergeParts(k.parts), decorMaterial(ch));
    mesh.castShadow = mesh.receiveShadow = true;
    decor.add(mesh);

    // parties animées : ailes des moulins, brumes des Ombres, tourbillon
    ctx.sails.forEach((sp) => {
      const sails = new THREE.Mesh(millSails(), decorMaterial(ch));
      sails.userData.keepGeo = true;
      sails.scale.setScalar(1.35);
      const hub = new THREE.Group();
      hub.position.copy(sp.p);
      hub.rotation.y = sp.ry;
      hub.add(sails);
      sails.castShadow = true;
      decor.add(hub);
      ch.life.sails.push(sails);
    });
    ctx.mist.forEach((p, i) => {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#efe6ff', transparent: true, opacity: 0.6, depthWrite: false }));
      m.position.copy(p);
      m.scale.set(1.6, 1.0, 1);
      m.userData = { y: p.y, phase: i * 1.7 };
      decor.add(m);
      ch.life.mist.push(m);
    });
    if (ctx.whirl) {
      let wa = ch.harborAngle + Math.PI;
      for (let i = 0; i < 12 && !far(wa, 1.0); i++) wa += 0.5;
      const w = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ map: whirlTexture(), transparent: true, depthWrite: false }));
      w.rotation.x = -Math.PI / 2;
      w.position.set(Math.cos(wa) * R * 1.55, 0.07, Math.sin(wa) * R * 1.55);
      decor.add(w);
      ch.life.whirl = w;
    }

    // les animaux, dans leur pré (les vaches du Soleil : dans l'enclos du monument)
    if (isle.animals && !ch.sheep.length) {
      const [kind, n] = isle.animals;
      const home = kind === 'cow' && L ? { x: L.x, z: L.z, r: 1.05 * L.s, inner: 0.45 } : plan.pasture ? { x: plan.pasture.x, z: plan.pasture.z, r: 1.0 } : null;
      if (home) for (let i = 0; i < n; i++) ch.sheep.push(makeAnimal(ch, kind, home));
    }
  }

  // le voilier : le modèle remplace la coque procédurale (même groupe, même trajectoire)
  const TEX = {};
  const MATCOL = { DarkWood: '#a0663a', LightWood: '#e2b27a', Sail: '#ffffff', Steel: '#b9c4cc', _defaultMat: '#f0e6d6', Red: '#ff5d5d', White: '#ffffff' };
  const assets = { ready: false, status: 'none', tpl: {}, error: null, tex: {} };
  const MODEL_DIR = 'assets/models/';
  const MODELS = { man: 'hero_kaykit.glb', boat: 'sailboat.glb' };
  // modèle glTF → gabarit : triangles à plat (positions, normales, UV, occlusion des sommets,
  // nom du matériau), posés au sol (y min = 0), centrés, hauteur ramenée à 1
  function makeTemplate(root, opt) {
    opt = opt || {};
    root.updateMatrixWorld(true);
    const parts = [];
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, I = g.index;
      const UV = g.attributes.uv, CO = g.attributes.color;
      const n = I ? I.count : P.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      const uv = UV ? new Float32Array(n * 2) : null;
      const ao = CO ? new Float32Array(n) : null;
      // (r128 : getX ne dénormalise pas les attributs entiers)
      const cs = CO && CO.normalized ? (CO.array instanceof Uint8Array ? 1 / 255 : CO.array instanceof Uint16Array ? 1 / 65535 : 1) : 1;
      const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
      for (let k = 0; k < n; k++) {
        const i = I ? I.getX(k) : k;
        v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
        if (opt.rotY) v.applyAxisAngle(Y, opt.rotY);
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        box.expandByPoint(v);
        if (N) {
          v.fromBufferAttribute(N, i).applyMatrix3(nm);
          if (opt.rotY) v.applyAxisAngle(Y, opt.rotY);
          v.normalize();
          nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
        }
        if (uv) { uv[k * 2] = UV.getX(i); uv[k * 2 + 1] = UV.getY(i); }
        if (ao) ao[k] = Math.min(1, Math.max(0, (CO.getX(i) + CO.getY(i) + CO.getZ(i)) / 3 * cs));
      }
      if (!N) { // normales à plat, triangle par triangle
        const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
        for (let k = 0; k + 2 < n; k += 3) {
          a.fromArray(pos, k * 3); b.fromArray(pos, k * 3 + 3); c.fromArray(pos, k * 3 + 6);
          c.sub(b); a.sub(b); c.cross(a).normalize();
          for (let j = 0; j < 3; j++) c.toArray(nor, (k + j) * 3);
        }
      }
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      const name = (mat && mat.name) || '';
      // feuillage « duveteux » : normales orientées depuis le centre du houppier,
      // la ramure s'éclaire comme un seul volume doux (et non comme des cartes de feuilles)
      const T = TEX[name];
      if (T && T.fluffy) {
        const bb = new THREE.Box3();
        for (let k = 0; k < n; k++) bb.expandByPoint(v.fromArray(pos, k * 3));
        const ctr = bb.getCenter(new THREE.Vector3());
        ctr.y -= (bb.max.y - bb.min.y) * 0.15;
        const d = new THREE.Vector3();
        for (let k = 0; k < n; k++) {
          d.fromArray(pos, k * 3).sub(ctr).normalize();
          v.fromArray(nor, k * 3).lerp(d, T.fluffy).normalize();
          v.toArray(nor, k * 3);
        }
      }
      parts.push({ pos, nor, uv, ao, mat: name });
    });
    const h = Math.max(1e-6, box.max.y - box.min.y);
    const cx = opt.keepXZ ? 0 : (box.min.x + box.max.x) / 2, cz = opt.keepXZ ? 0 : (box.min.z + box.max.z) / 2;
    parts.forEach((p) => {
      for (let k = 0; k < p.pos.length; k += 3) {
        p.pos[k] = (p.pos[k] - cx) / h; p.pos[k + 1] = (p.pos[k + 1] - box.min.y) / h; p.pos[k + 2] = (p.pos[k + 2] - cz) / h;
      }
    });
    return { parts, w: (box.max.x - box.min.x) / h, d: (box.max.z - box.min.z) / h };
  }

  // Lot de gabarits posés dans une île, fusionnés par matériau (un appel de dessin par
  // texture et par île) ; couleur des sommets = teinte × nuance de chaque plante × occlusion.
  const colCache = {};
  const colorOf = (hex) => colCache[hex] || (colCache[hex] = lin(hex));
  const WARM = '#f3dcb0';
  function texKey(name, variant) {
    if (!TEX[name]) return null;
    return variant && TEX[name + '_' + variant] ? name + '_' + variant : name;
  }
  function newBatch() {
    const groups = {};
    const c = new THREE.Color(), base = new THREE.Color();
    const grp = (key, hasUv) => groups[key] || (groups[key] = { pos: [], nor: [], col: [], uv: hasUv ? [] : null });
    let total = 0;
    return {
      add(tpl, x, y, z, rot, sxz, sy, over, rng, variant) {
        const cs = Math.cos(rot), sn = Math.sin(rot);
        const shade = 0.9 + (rng ? rng() : 0.5) * 0.2;   // chaque plante a sa nuance
        const warm = (rng ? rng() : 0.5) * 0.1;
        tpl.parts.forEach((p) => {
          const tk = texKey(p.mat, variant);
          const T = tk && TEX[tk];
          let key = 'flat';
          if (T) {
            if (!p.uv || !assets.tex[T.file]) { if (T.alpha) return; } // feuillage sans texture : on l'omet
            else key = tk;
          }
          if (key !== 'flat') base.copy(colorOf((over && over[p.mat]) || T.tint)).multiplyScalar(T.gain);
          else base.copy(colorOf((over && over[p.mat]) || MATCOL[p.mat] || '#e5e1d8'));
          c.copy(base).lerp(colorOf(WARM), warm * (key === 'flat' ? 1 : 0.6)).multiplyScalar(shade);
          const G = grp(key, key !== 'flat');
          const P = p.pos, N = p.nor;
          for (let k = 0, j = 0; k < P.length; k += 3, j++) {
            const px = P[k] * sxz, pz = P[k + 2] * sxz;
            G.pos.push(x + px * cs + pz * sn, y + P[k + 1] * sy, z - px * sn + pz * cs);
            let nx = N[k] / sxz, ny = N[k + 1] / sy, nz = N[k + 2] / sxz;
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            G.nor.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
            const a = p.ao ? 0.35 + 0.65 * p.ao[j] : 1;
            G.col.push(c.r * a, c.g * a, c.b * a);
            if (G.uv) G.uv.push(p.uv[j * 2], p.uv[j * 2 + 1]);
          }
          total += P.length / 3;
        });
      },
      count: () => total,
      // matFor(clé) → matériau ; renvoie un groupe (un maillage par matériau)
      build(matFor) {
        const out = new THREE.Group();
        Object.keys(groups).forEach((key) => {
          const G = groups[key];
          if (!G.pos.length) return;
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
          geo.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
          geo.setAttribute('color', new THREE.Float32BufferAttribute(G.col, 3));
          if (G.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
          geo.computeBoundingSphere();
          const mesh = new THREE.Mesh(geo, typeof matFor === 'function' ? matFor(key) : matFor);
          mesh.castShadow = !(TEX[key] && TEX[key].noShadow);
          mesh.receiveShadow = true;
          mesh.userData.merged = key;
          out.add(mesh);
        });
        return out;
      }
    };
  }

  function loadAssets() {
    if (!THREE.GLTFLoader) { assets.status = 'no-loader'; return; }
    assets.status = 'loading';
    const loader = new THREE.GLTFLoader();
    const embedded = window.ODY_ASSETS || {};
    const load = (key) => new Promise((resolve) => {
      const path = MODEL_DIR + MODELS[key];
      try {
        loader.load(embedded[path] || path, (g) => resolve([key, g]), undefined, (e) => {
          console.warn('[world] modèle indisponible', path, e && e.message ? e.message : e);
          resolve([key, null]);
        });
      } catch (e) { resolve([key, null]); }
    });
    Promise.all(Object.keys(MODELS).map(load)).then((list) => {
      const got = {};
      list.forEach(([k, g]) => { if (g) got[k] = g; });
      assets.ready = true;
      if (got.boat) { try { upgradeBoat(got.boat); } catch (e) { console.warn('[world] voilier', e); } }
      if (got.man) { try { upgradeHero(got.man); } catch (e) { console.warn('[world] Ulysse', e); assets.error = String(e); } }
      assets.status = Object.keys(got).length ? 'ok:' + Object.keys(got).length + '/' + Object.keys(MODELS).length : 'fallback';
      if (World.ok && !running) renderFrame(); // une image à jour même si la boucle est en pause
    }).catch((e) => { assets.status = 'error'; assets.error = String(e); console.warn('[world] modèles', e); });
  }

  // le voilier : le modèle remplace la coque procédurale (même groupe, même trajectoire)
  function upgradeBoat(gltf) {
    let tpl = makeTemplate(gltf.scene);
    if (tpl.d > tpl.w) tpl = makeTemplate(gltf.scene, { rotY: Math.PI / 2 }); // l'étrave vers +x
    const b = newBatch();
    b.add(tpl, 0, -0.1, 0, 0, 1.45, 1.45, null, null);
    const mesh = b.build(toonMat({ color: '#ffffff', vertexColors: true }));
    mesh.children.forEach((o) => { o.receiveShadow = false; });
    boat.children.slice().forEach((o) => boat.remove(o));
    boat.add(mesh);
  }

  // ------------------------------------------------------------------
  // Pierres de niveau, version dessin animé : galets ronds et dodus.
  // Fait = or + étoile + laurier ; en cours = crème éclatante + anneau + flèche qui rebondit ;
  // à venir = pastel doux ; boss = plus grand, avec un fanion.
  // ------------------------------------------------------------------
  let STONE_GEO = null, BOSS_RING_MAT = null, LAUREL_MAT = null, CUR_RING = null, BOUNCE = null;
  function makeShared() {
    if (STONE_GEO) return;
    const G = geoLib();
    const puck = (R, H) => {
      const prof = [[0, 0], [R * 0.9, 0], [R, H * 0.25], [R * 1.0, H * 0.6], [R * 0.9, H * 0.9], [R * 0.7, H], [0, H]].map(([r, y]) => new THREE.Vector2(r, y));
      const g = new THREE.LatheGeometry(prof, 28);
      g.computeVertexNormals();
      return g;
    };
    // couronne de laurier + étoile, fusionnées (un seul maillage par pierre réussie)
    const reward = (R, H, s) => {
      const parts = [];
      const leaf = G.sphere;
      for (let k = 0; k < 20; k++) {
        if (k === 0 || k === 19) continue; // ouverte vers l'avant, comme une couronne
        const a = (k / 20) * Math.PI * 2;
        parts.push({ geo: leaf, color: k % 2 ? '#4cbf3a' : '#6fd64a',
          m: M4(Math.cos(a) * R, 0.03 + (k % 2) * 0.012, Math.sin(a) * R, -a + Math.PI / 2, 0.15, 0.05, 0.075, 0, k % 2 ? 0.5 : -0.5) });
      }
      parts.push({ geo: G.star, color: '#fff3b0', m: M4(0, H + 0.005, 0, 0, s, s, s, -Math.PI / 2) });
      return mergeParts(parts);
    };
    STONE_GEO = {
      normal: puck(0.34, 0.16),
      boss: puck(0.5, 0.2),
      laurel: reward(0.44, 0.165, 0.13), laurelBoss: reward(0.62, 0.205, 0.19)
    };
    // fanion du boss : mât et drapeau (le drapeau ondule à part)
    STONE_GEO.pole = mergeParts([{ geo: G.cyl, color: '#ffffff', m: M4(0, 0.6, 0, 0, 0.05, 1.2, 0.05) }, { geo: G.sphere, color: '#ffd23f', m: M4(0, 1.22, 0, 0, 0.1) }]);
    const flag = new THREE.PlaneGeometry(0.5, 0.3, 6, 1);
    flag.translate(0.25, 1.0, 0);
    STONE_GEO.flag = flag;
    BOSS_RING_MAT = toonMat({ color: '#ffffff', vertexColors: true, transparent: true });
    LAUREL_MAT = toonMat({ color: '#ffffff', vertexColors: true, emissive: lin('#3a2a00').multiplyScalar(0.25) });
    // anneau fixe du niveau en cours (en plus de l'onde qui pulse)
    CUR_RING = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 48),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
    CUR_RING.rotation.x = -Math.PI / 2;
    scene.add(CUR_RING);
    // flèche qui rebondit au-dessus du prochain niveau (quand Ulysse n'est pas dessus)
    BOUNCE = new THREE.Mesh(mergeParts([
      { geo: G.cone, color: '#ffffff', m: M4(0, 0.16, 0, 0, 0.3, 0.32, 0.3, Math.PI) },
      { geo: G.cyl, color: '#ffffff', m: M4(0, 0.42, 0, 0, 0.14, 0.24, 0.14) }
    ]), toonMat({ color: '#ffd23f', vertexColors: true, emissive: lin('#ffb000').multiplyScalar(0.3) }));
    BOUNCE.castShadow = true;
    scene.add(BOUNCE);
  }
  // île à l'horizon : un dôme vert sur sa plage, quelques maisons blanches (couleurs × brume)
  function horizonIsland(rng) {
    const parts = [];
    const hill = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push({ geo: hill, color: SAND, m: M4(0, 0, 0, 0, 11 + rng() * 3, 1.0, 8) });
    parts.push({ geo: hill, color: '#7fd06a', m: M4(0, 0.2, 0, 0, 9 + rng() * 3, 3 + rng() * 2.5, 6 + rng() * 1.5) });
    parts.push({ geo: hill, color: '#95da74', m: M4(5 + rng() * 3, 0.2, 2, 0, 5, 2 + rng() * 1.5, 4) });
    const cube = new THREE.BoxGeometry(1, 1, 1);
    for (let k = 0; k < 7; k++) {
      const x = (rng() - 0.5) * 9, z = 3 + rng() * 2.5;
      const y = Math.max(0, 3.0 * Math.sqrt(Math.max(0, 1 - (x * x) / 81 - (z * z) / 49)));
      parts.push({ geo: cube, color: '#ffffff', m: M4(x, y + 0.2, z, rng(), 0.6 + rng() * 0.5, 0.5 + rng() * 0.3, 0.6) });
      parts.push({ geo: cube, color: k % 2 ? '#3d8ee8' : '#ee7a4d', m: M4(x, y + 0.5, z, 0, 0.5, 0.12, 0.5) });
    }
    return mergeParts(parts);
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
    const isle = isleOf(c);
    const ch = { c, group, r, rng, accent, fadeMats, m, isle, sheep: [], flowers: {}, fade: 0.2, phase: rng() * 6.28, open: 0 };
    // relief : une bosse douce au centre, deux plus petites
    ch.hills = [{ x: (rng() - 0.5) * r * 0.3, z: (rng() - 0.5) * r * 0.3, a: 0.32 + rng() * 0.12, s: r * 0.42 }];
    for (let k = 0; k < 2; k++) {
      const a = rng() * Math.PI * 2, d = r * (0.3 + rng() * 0.2);
      ch.hills.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, a: 0.12 + rng() * 0.12, s: 0.9 + rng() * 0.5 });
    }

    const colors = { low: lin(isle.grass[0]), fresh: lin(isle.grass[1]), high: lin(isle.grass[2]), sand: lin(SAND) };
    const groundMat = toonMat({ vertexColors: true, transparent: true });
    fadeMats.push(groundMat);
    const ground = new THREE.Mesh(terrain(ch, colors), groundMat);
    ground.receiveShadow = true;
    ground.userData.ground = c;
    group.add(ground);
    ch.ground = ground;

    // falaise de grès doré jusqu'à la mer, et sa plage au pied
    const cliffGeo = new THREE.CylinderGeometry(r, r * 1.06, 2.6, 56, 2, true);
    const cliffMat = lambert(CLIFF, { transparent: true });
    fadeMats.push(cliffMat);
    ch.cliffMat = cliffMat;
    const cliff = new THREE.Mesh(cliffGeo, cliffMat);
    cliff.position.y = TOP - 0.12 - 1.3;
    cliff.receiveShadow = true;
    group.add(cliff);
    const beachMat = lambert(SAND, { transparent: true });
    fadeMats.push(beachMat);
    const beach = new THREE.Mesh(new THREE.RingGeometry(r * 0.95, r * 1.2, 56), beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.05;
    beach.receiveShadow = true;
    group.add(beach);

    // sentier : une seule route, de la plage d'arrivée au portique de sortie
    const entry = entryOf(c).sub(ctr), exit = exitOf(c).sub(ctr);
    layoutPath(ch, entry, exit);
    ch.gateLocal = pathAt(ch, GATE_F);
    // le port : l'angle le plus éloigné des deux bouts du sentier
    {
      const S = ch.path.samp;
      const pa = Math.atan2(S[0].z, S[0].x), pb = Math.atan2(S[S.length - 1].z, S[S.length - 1].x);
      let best = 0, bd = -1;
      for (let k = 0; k < 36; k++) {
        const a = (k / 36) * Math.PI * 2;
        const d = Math.min(Math.abs(Math.atan2(Math.sin(a - pa), Math.cos(a - pa))), Math.abs(Math.atan2(Math.sin(a - pb), Math.cos(a - pb))));
        if (d > bd) { bd = d; best = a; }
      }
      ch.harborAngle = best;
      ch.harborLand = { x: Math.cos(best) * r * 0.82, z: Math.sin(best) * r * 0.82, r: 0.7 };
    }
    ch.nodes = [];
    for (let k = 0; k < PER; k++) {
      const p = pathAt(ch, levelF(k));
      const boss = k === PER - 1;
      const mesh = new THREE.Mesh(boss ? STONE_GEO.boss : STONE_GEO.normal, toonMat({ color: '#ffffff', transparent: true }));
      mesh.position.set(p.x, heightLocal(ch, p.x, p.z) - 0.02, p.z);
      mesh.receiveShadow = mesh.castShadow = true;
      mesh.userData.level = c * PER + k;
      group.add(mesh);
      const n = { mesh, local: p, boss };
      if (boss) { // fanion à la couleur du jeu : le boss se repère de loin
        n.rings = new THREE.Group();
        const pole = new THREE.Mesh(STONE_GEO.pole, BOSS_RING_MAT);
        const flag = new THREE.Mesh(STONE_GEO.flag.clone(), toonMat({ color: accent, side: THREE.DoubleSide, transparent: true }));
        flag.userData.base = Float32Array.from(flag.geometry.attributes.position.array);
        pole.castShadow = flag.castShadow = true;
        n.rings.add(pole, flag);
        n.flag = flag;
        const back = pathAt(ch, levelF(k) - 0.03);
        const sx = back.z - p.z, sz = -(back.x - p.x), sl = Math.hypot(sx, sz) || 1;
        n.rings.position.set(p.x + sx / sl * 0.42, mesh.position.y, p.z + sz / sl * 0.42);
        group.add(n.rings);
      }
      ch.nodes.push(n);
    }
    pathRibbon(ch);

    // le portique du boss, en travers du sentier : colonnes blanches, fronton bleu (doré une fois ouvert)
    const gate = new THREE.Group();
    gate.position.set(ch.gateLocal.x, heightLocal(ch, ch.gateLocal.x, ch.gateLocal.z) - 0.02, ch.gateLocal.z);
    const ahead = pathAt(ch, 1);
    gate.lookAt(ahead.x, gate.position.y, ahead.z);
    const G = geoLib();
    const cols = kit();
    [-0.72, 0.72].forEach((x) => {
      cols.add(G.box, '#f3ead8', x, 0.06, 0, 0.42, 0.12, 0.42);
      cols.add(G.cyl, '#ffffff', x, 0.95, 0, 0.3, 1.7, 0.3);
      cols.add(G.box, '#ffd23f', x, 1.84, 0, 0.4, 0.1, 0.4);
    });
    const white = lambert('#ffffff', { vertexColors: true, transparent: true });
    fadeMats.push(white);
    const pillars = new THREE.Mesh(mergeParts(cols.parts), white);
    const lk = kit();
    lk.add(G.box, '#ffffff', 0, 1.98, 0, 1.9, 0.2, 0.42);
    lk.add(G.prism, '#ffffff', 0, 2.08, 0, 1.9, 0.4, 0.44, Math.PI / 2 * 0);
    lk.add(G.sphere, '#ffffff', 0, 2.56, 0, 0.16);
    const lintelMat = lambert('#4aa3df', { vertexColors: true, transparent: true });
    fadeMats.push(lintelMat);
    const lintel = new THREE.Mesh(mergeParts(lk.parts), lintelMat);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8),
      new THREE.MeshBasicMaterial({ color: lin('#ffd23f'), transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    veil.position.y = 0.95;
    pillars.castShadow = lintel.castShadow = true;
    gate.add(pillars, lintel, veil);
    group.add(gate);
    Object.assign(ch, { gate, veil, lintelMat });

    decorate(ch);

    // le ponton vers l'île suivante : il sort de l'eau, planche après planche, quand le boss est battu
    ch.stones = [];
    const from = exitOf(c, 1.0), to = entryOf(c + 1, 1.0);
    const span = from.distanceTo(to);
    const dirv = to.clone().sub(from).normalize();
    const sidev = new THREE.Vector3(-dirv.z, 0, dirv.x);
    const bend = (rng() - 0.5) * 1.6;
    const ctrl = from.clone().lerp(to, 0.5).addScaledVector(sidev, bend);
    const count = Math.max(4, Math.round(span / 0.64));
    const bez = (t) => new THREE.Vector3().copy(from).multiplyScalar((1 - t) * (1 - t)).addScaledVector(ctrl, 2 * t * (1 - t)).addScaledVector(to, t * t);
    for (let k = 1; k <= count; k++) {
      const t = k / (count + 1);
      const p = bez(t), q = bez(Math.min(1, t + 0.01));
      const s = pierSegment();
      const deck = 0.31 + 0.3 * Math.pow(1 - Math.sin(Math.PI * t), 1.6);
      s.position.set(p.x, deck, p.z);
      s.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      s.userData = { phase: k + c, dip: 0, raise: 0, base: deck, pier: true };
      s.visible = false;
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
      ring.userData = { base: r * 1.22, offset: k * 2.5 + rng() * 2 };
      scene.add(ring);
      ch.ripples.push(ring);
    }

    // îles lointaines à l'horizon, de part et d'autre de la route, avec leurs maisons blanches
    [-1, 1].forEach((side) => {
      const mtn = new THREE.Mesh(horizonIsland(rng), lambert(mtnColor, { vertexColors: true }));
      mountains.push(mtn);
      const s = 0.8 + rng() * 0.6;
      mtn.scale.set(s, s * (0.8 + rng() * 0.5), s);
      mtn.position.set(ctr.x + (rng() - 0.5) * 8, -0.3, ctr.z + side * (30 + rng() * 10));
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

  // niveau réussi : étoile et couronne de laurier sur la pierre dorée (elles poussent quand on vient de gagner)
  function bloom(ch, k, animate) {
    const n = ch.nodes[k];
    const g = new THREE.Mesh(n.boss ? STONE_GEO.laurelBoss : STONE_GEO.laurel, LAUREL_MAT);
    g.position.copy(n.mesh.position);
    g.rotation.y = Math.atan2(n.local.x, n.local.z);
    g.castShadow = true;
    if (animate) { g.scale.setScalar(0.01); g.userData.grow = true; }
    ch.group.add(g);
    ch.flowers[k] = g;
  }

  // Code couleur unique et lisible : fait = pierre dorée + étoile + laurier ; en cours = pierre
  // crème éclatante + anneau à la couleur du jeu (+ flèche qui rebondit) ; à venir = pastel doux.
  // Boss : grande pierre et fanion.
  function refresh(animate) {
    ensureChapters();
    pathU.target = done;
    chapters.forEach((ch) => {
      if (!ch) return;
      ch.nodes.forEach((n, k) => {
        const L = ch.c * PER + k;
        const mat = n.mesh.material;
        if (L < done) {
          setLin(mat.color, '#ffc531'); mat.emissive.copy(lin('#b86e00')).multiplyScalar(0.35); n.mesh.userData.alpha = 1;
          if (!ch.flowers[k]) bloom(ch, k, animate);
        } else if (L === done) {
          setLin(mat.color, '#fffaf0'); mat.emissive.setRGB(0.12, 0.12, 0.1); n.mesh.userData.alpha = 1;
        } else {
          mat.color.copy(tint(opts.levelInfo(L).accent, 0.35)); mat.emissive.setRGB(0.04, 0.04, 0.05); n.mesh.userData.alpha = 0.92;
        }
        if (n.rings) n.rings.userData.alpha = L <= done ? 1 : 0.6;
      });
      const beaten = done > ch.c * PER + PER - 1;
      if (beaten && !ch.opened) {
        ch.opened = true;
        setLin(ch.lintelMat.color, '#ffc531');
        ch.stones.forEach((s, i) => { s.userData.delay = animate ? 1.0 + i * 0.16 : 0; if (!animate) s.userData.raise = 1; });
      }
    });
  }

  function nodePos(L) {
    const ch = chapters[chapterOf(L)];
    const n = ch.nodes[L % PER];
    return new THREE.Vector3(ch.group.position.x + n.local.x, ch.group.position.y + heightLocal(ch, n.local.x, n.local.z) + (n.boss ? 0.19 : 0.15),
      ch.group.position.z + n.local.z);
  }
  function groundPos(c, at) {
    const ch = chapters[c];
    const lx = at.x - ch.group.position.x, lz = at.z - ch.group.position.z;
    return new THREE.Vector3(at.x, ch.group.position.y + heightLocal(ch, lx, lz), at.z);
  }
  // direction du sentier au niveau L (pour placer la caméra derrière le voyageur)
  function pathDir(L) {
    const ch = chapters[chapterOf(L)];
    if (!ch) return new THREE.Vector3(1, 0, 0);
    const f = levelF(L % PER);
    const d = pathAt(ch, f + 0.03).sub(pathAt(ch, f - 0.01)); d.y = 0;
    return d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(1, 0, 0);
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
    const skin = toonMat({ color: '#e9d6c0' });
    const tunicMat = lambert('#4d5862');
    const trouserMat = lambert('#6b737a');
    const bootMat = lambert('#8a7a68');
    const hairMat = lambert('#5a4636');

    // jambes articulées à la hanche (pour la marche)
    const legs = [-0.065, 0.065].map((x) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.46, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.42, 12), trouserMat);
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
    hair.position.set(0, 0.012, -0.012);
    hair.rotation.x = -0.75; // les cheveux couvrent l'arrière du crâne, pas le visage
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), hairMat);
    beard.position.set(0, -0.03, 0.022);
    // yeux discrets, pour que le visage se lise en gros plan
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#3b3430' });
    [-0.03, 0.03].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), eyeMat);
      eye.position.set(x, 0.012, 0.078);
      head.add(eye);
    });
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
    // bras articulés à l'épaule (balancent en marchant, se lèvent vers la tête en mode focus)
    const arms = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.155, 0.85, 0);
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.03, 0.27, 12), tunicMat);
      sleeve.position.y = -0.135;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), skin);
      hand.position.y = -0.3;
      pivot.add(sleeve, hand);
      pivot.userData.side = side;
      body.add(pivot);
      return pivot;
    });
    // lueur de la pensée, au cœur de la tête
    const mind = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    mind.scale.set(0.5, 0.5, 1);
    mind.position.y = 1.03;
    body.add(mind);
    // la lance reste plantée à côté de lui, même quand il lève les bras
    spear.position.x = 0.22;
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
    // contour encré (coque inversée) : Ulysse se détache du décor comme un dessin
    const inkMat = new THREE.MeshBasicMaterial({ color: '#2a2622', side: THREE.BackSide });
    const toOutline = [];
    body.traverse((o) => { if (o.isMesh && !(o.geometry.parameters && o.geometry.parameters.radius < 0.012)) toOutline.push(o); });
    if (OUTLINE) toOutline.forEach((o) => { // (on collecte d'abord : ajouter pendant le parcours bouclerait sans fin)
      const hull = new THREE.Mesh(o.geometry, inkMat);
      hull.scale.setScalar(1.12);
      o.add(hull);
    });
    scene.add(g);
    Object.assign(hero, { group: g, body, scarf: scarfMat, capeMat, shadow, cape: capePivot, legs, head, emblem, arms, mind, spear, focus: 0, focusTarget: 0,
      procMats: { tunic: tunicMat, hair: hairMat, skin } });
    applySkin();
  }

  // ------------------------------------------------------------------
  // Garde-robe d'Ulysse : costumes, couleurs, coiffes, armes, boucliers.
  // Les identifiants sont stables (l'interface les enregistre).
  // ------------------------------------------------------------------
  const SKIN_OPTIONS = {
    outfit: [
      { id: 'voyageur', name: 'Voyageur' }, { id: 'hoplite', name: 'Hoplite' },
      { id: 'roi', name: "Roi d'Ithaque" }, { id: 'marin', name: 'Marin' }, { id: 'pelerin', name: 'Pèlerin' }
    ],
    tunic: [
      { id: 'egee', name: 'Bleu Égée', color: '#2f6f9f' }, { id: 'terre', name: 'Terre cuite', color: '#c0643c' },
      { id: 'olive', name: 'Olivier', color: '#7b8a4c' }, { id: 'tyr', name: 'Pourpre de Tyr', color: '#7a2e5c' },
      { id: 'lin', name: 'Lin blanc', color: '#eee6d4' }, { id: 'nuit', name: 'Noir de nuit', color: '#2c2e35' },
      { id: 'safran', name: 'Safran', color: '#d5a03c' }, { id: 'ocean', name: 'Vert océan', color: '#2f8a80' }
    ],
    cape: [
      { id: 'blanc', name: 'Blanc', color: '#f4f1ea' }, { id: 'or', name: 'Or', color: '#d4a640' },
      { id: 'rouge', name: 'Rouge garance', color: '#a63a30' }, { id: 'egee', name: 'Bleu Égée', color: '#2f5f8f' },
      { id: 'tyr', name: 'Pourpre de Tyr', color: '#6e2a55' }, { id: 'nuit', name: 'Noir', color: '#26282e' },
      { id: 'none', name: 'Sans cape' }
    ],
    hair: [
      { id: 'brun', name: 'Brun', color: '#4a3424' }, { id: 'noir', name: 'Noir', color: '#1d1916' },
      { id: 'chatain', name: 'Châtain', color: '#6f4b2e' }, { id: 'blond', name: 'Blond', color: '#c49a5e' },
      { id: 'roux', name: 'Roux', color: '#94451f' }, { id: 'gris', name: 'Gris', color: '#9b958d' }
    ],
    skin: [
      { id: 's1', name: 'Ivoire', color: '#f2d3bb' }, { id: 's2', name: 'Sable', color: '#e2b38f' },
      { id: 's3', name: 'Olive', color: '#c68e64' }, { id: 's4', name: 'Cannelle', color: '#a06a45' },
      { id: 's5', name: 'Bronze', color: '#7a4c2f' }, { id: 's6', name: 'Ébène', color: '#4e2f1f' }
    ],
    accessory: [
      { id: 'none', name: 'Aucun' }, { id: 'laurel', name: 'Laurier' }, { id: 'helmet', name: 'Casque corinthien' },
      { id: 'band', name: 'Bandeau' }, { id: 'petasos', name: 'Pétase' }
    ],
    weapon: [
      { id: 'spear', name: 'Lance' }, { id: 'staff', name: 'Bâton' }, { id: 'bow', name: 'Arc' },
      { id: 'sword', name: 'Xiphos' }, { id: 'none', name: 'Aucune' }
    ],
    shield: [
      { id: 'none', name: 'Aucun' }, { id: 'chouette', name: "Chouette d'Athéna" }, { id: 'poulpe', name: 'Poulpe' },
      { id: 'oeil', name: 'Œil' }, { id: 'soleil', name: 'Soleil' }
    ]
  };
  const SKIN_LABELS = { outfit: 'Costume', tunic: 'Tunique', cape: 'Cape', hair: 'Cheveux', skin: 'Peau', accessory: 'Coiffe', weapon: 'Arme', shield: 'Bouclier' };
  const SKIN_DEFAULT = { outfit: 'voyageur', tunic: 'egee', cape: 'blanc', hair: 'brun', skin: 's2', accessory: 'none', weapon: 'spear', shield: 'none' };
  const skinState = Object.assign({}, SKIN_DEFAULT);
  const skinOpt = (cat, id) => SKIN_OPTIONS[cat].find((o) => o.id === id) || SKIN_OPTIONS[cat].find((o) => o.id === SKIN_DEFAULT[cat]);

  // motif peint d'un bouclier (toile 256 px, aucune image externe)
  const shieldTexCache = {};
  function shieldTexture(motif) {
    if (shieldTexCache[motif]) return shieldTexCache[motif];
    shieldTexCache[motif] = canvasTexture(256, 256, (g) => {
      const R = 128;
      g.fillStyle = motif === 'oeil' ? '#e9e1cf' : motif === 'soleil' ? '#2b2f3a' : '#b0402f';
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#d9b25b'; g.lineWidth = 14; g.beginPath(); g.arc(R, R, R - 9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = g.strokeStyle = '#1e1b19';
      g.lineCap = 'round'; g.lineWidth = 7;
      if (motif === 'chouette') {
        g.beginPath(); g.ellipse(R, R + 12, 44, 58, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#efe4c8';
        [-20, 20].forEach((dx) => { g.beginPath(); g.arc(R + dx, R - 12, 16, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = '#1e1b19';
        [-20, 20].forEach((dx) => { g.beginPath(); g.arc(R + dx, R - 12, 7, 0, Math.PI * 2); g.fill(); });
        g.beginPath(); g.moveTo(R - 40, R - 46); g.lineTo(R - 24, R - 30); g.moveTo(R + 40, R - 46); g.lineTo(R + 24, R - 30); g.stroke();
      } else if (motif === 'poulpe') {
        g.beginPath(); g.ellipse(R, R - 30, 30, 36, 0, 0, Math.PI * 2); g.fill();
        for (let k = 0; k < 8; k++) {
          const a = Math.PI * (0.15 + k * 0.1);
          g.beginPath(); g.moveTo(R + Math.cos(a) * 18, R - 8);
          g.bezierCurveTo(R + Math.cos(a) * 60, R + 30, R + Math.cos(a) * 30, R + 60, R + Math.cos(a) * 80, R + 80);
          g.stroke();
        }
        g.fillStyle = '#efe4c8';
        [-12, 12].forEach((dx) => { g.beginPath(); g.arc(R + dx, R - 34, 6, 0, Math.PI * 2); g.fill(); });
      } else if (motif === 'oeil') {
        g.beginPath(); g.ellipse(R, R, 74, 38, 0, 0, Math.PI * 2); g.lineWidth = 9; g.stroke();
        g.fillStyle = '#2f6f9f'; g.beginPath(); g.arc(R, R, 30, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1e1b19'; g.beginPath(); g.arc(R, R, 13, 0, Math.PI * 2); g.fill();
      } else if (motif === 'soleil') {
        g.fillStyle = g.strokeStyle = '#e3b54f';
        g.beginPath(); g.arc(R, R, 30, 0, Math.PI * 2); g.fill();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          g.beginPath(); g.moveTo(R + Math.cos(a) * 42, R + Math.sin(a) * 42); g.lineTo(R + Math.cos(a) * (k % 2 ? 70 : 88), R + Math.sin(a) * (k % 2 ? 70 : 88)); g.stroke();
        }
      }
    });
    return shieldTexCache[motif];
  }

  // Ulysse animé : « Adventurers Character Pack » de KayKit (Kay Lousberg, CC0) — le barbare
  // barbu, sans son bonnet d'ours : grosse tête, silhouette trapue de dessin animé.
  // Sa texture est une palette de pastilles en dégradé (grille 8 × 4) : la garde-robe repeint
  // les pastilles (tunique, cape, peau, cheveux, liserés…) dans une toile. Les pièces grecques
  // (boucles de cheveux, coiffes, armes, bouclier) sont construites ici et accrochées aux os.
  const KK = { // [colonne, rangée] des pastilles (rangée 0 = haut de l'image, sens des UV glTF)
    skin: [[0, 0]], hair: [[1, 0]], tunic: [[0, 1], [1, 1]], cape: [[5, 0], [7, 0]], capeSrc: [7, 0],
    trim: [[2, 1]], leather: [[6, 0]], metal: [[3, 0]], legs: [[3, 2]], wraps: [[7, 1], [7, 2]]
  };
  function upgradeHero(gltf) {
    const src = gltf.scene;
    const clips = gltf.animations || [];
    const clip = (n) => clips.find((c) => c.name === n || c.name.endsWith('|' + n));
    if (!clip('Idle') || !clip('Running_A')) throw new Error('animations manquantes');
    const bone = (n) => src.getObjectByName(n) || src.getObjectByName(n.replace(/\./g, ''));
    const B = {};
    ['head', 'chest', 'hips', 'upperarm.l', 'lowerarm.l', 'handslot.l', 'upperarm.r', 'lowerarm.r', 'hand.r', 'handslot.r'].forEach((n) => {
      B[n] = bone(n);
      if (!B[n]) throw new Error('os manquant ' + n);
    });
    const meshOf = (part) => { let f = null; src.traverse((o) => { if (o.isMesh && o.name.indexOf(part) >= 0) f = f || o; }); return f; };

    // la palette, recopiée dans une toile (512 px) que la garde-robe repeint
    let img = null;
    src.traverse((o) => { if (o.isMesh && o.material && o.material.map && !img) img = o.material.map.image; });
    if (!img) throw new Error('texture manquante');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 512;
    const g2 = cv.getContext('2d');
    g2.drawImage(img, 0, 0, 512, 512);
    const base = g2.getImageData(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.flipY = false;
    // (deux matériaux : r128 ne compile qu'un programme par matériau, avec ou sans squelette)
    const mat = toonMat({ color: '#ffffff', map: tex, skinning: true });
    const matRigid = toonMat({ color: '#ffffff', map: tex });
    src.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.isSkinnedMesh ? mat : matRigid;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // la boîte englobante ne suit pas l'animation
    });
    // la cape prend une pastille à elle (colonne 5, libre) : sa couleur devient indépendante
    const capeMesh = meshOf('Cape');
    if (capeMesh) {
      const uv = capeMesh.geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) - 0.25);
      uv.needsUpdate = true;
    }

    const rig = new THREE.Group();
    rig.add(src);
    src.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    const s = 1.12 / (box.max.y - box.min.y);
    src.scale.setScalar(s);
    src.position.set(0, -box.min.y * s, 0);

    // animations : repos, marche, course, joie ; mélange selon le déplacement
    const mixer = new THREE.AnimationMixer(src);
    const acts = {};
    [['idle', 'Idle'], ['walk', 'Walking_A'], ['run', 'Running_A'], ['cheer', 'Cheer']].forEach(([k, n]) => {
      const c = clip(n);
      if (!c) return;
      const a = mixer.clipAction(c);
      a.play();
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      acts[k] = { a, w: k === 'idle' ? 1 : 0 };
    });
    mixer.update(0);
    rig.updateMatrixWorld(true);

    const P = (o) => o.getWorldPosition(new THREE.Vector3()); // (rig à l'origine : repère du rig)
    const headMesh = meshOf('Head'), bodyMesh = meshOf('Body');
    const hb = headMesh ? new THREE.Box3().setFromObject(headMesh) : new THREE.Box3(new THREE.Vector3(-0.2, 0.6, -0.2), new THREE.Vector3(0.2, 1.1, 0.2));
    const bb = bodyMesh ? new THREE.Box3().setFromObject(bodyMesh) : new THREE.Box3(new THREE.Vector3(-0.15, 0.25, -0.12), new THREE.Vector3(0.15, 0.6, 0.12));
    const hr = (hb.max.x - hb.min.x) * 0.5;                 // demi-largeur du crâne
    const headC = new THREE.Vector3((hb.min.x + hb.max.x) / 2, hb.max.y - hr * 0.95, (hb.min.z + hb.max.z) / 2);
    const add = (parent, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; parent.add(o); return o; };
    const attach = (b, obj) => { rig.add(obj); rig.updateMatrixWorld(true); b.attach(obj); return obj; };
    const brass = toonMat({ color: '#ffc531' });
    const bronzeDark = toonMat({ color: '#d98a2b' });
    const leather = toonMat({ color: '#9a5a32' });
    const wood = toonMat({ color: '#c98b4f' });
    const leafMat = toonMat({ color: '#4cbf3a' });
    const crestMat = toonMat({ color: '#ff4f4f' });
    const bandMat = toonMat({ color: '#ff4f4f' });
    const hairMat = toonMat({ color: '#6b4226' });
    const acc = {};
    // boucles de cheveux : une calotte de petites boules (on ne garde que le haut et l'arrière)
    {
      const parts = [], N = 46;
      for (let i = 0; i < N; i++) {
        const y = 1 - (i + 0.5) / N * 2, rad = Math.sqrt(1 - y * y), a = i * 2.39996;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (y < -0.05 && z > -0.35) continue;          // pas de boucles sur le visage ni le cou
        if (z > 0.45 && y < 0.5) continue;             // le front reste dégagé
        if (y < -0.45) continue;
        parts.push({ geo: geoLib().ball, color: '#ffffff', m: M4(x * hr * 1.0, y * hr * 1.0 + hr * 0.08, z * hr * 1.06, 0, hr * 0.62) });
      }
      const hair = new THREE.Mesh(mergeParts(parts), toonMat({ color: '#6b4226', vertexColors: true }));
      hair.castShadow = true;
      hair.position.copy(headC);
      acc.hair = attach(B.head, hair);
      acc.hairMat = hair.material;
    }
    {
      const g = new THREE.Group(); // couronne de laurier
      const leaf = new THREE.SphereGeometry(1, 6, 4);
      for (let k = 0; k < 22; k++) {
        if (k === 10 || k === 11 || k === 12) continue; // ouverte sur la nuque
        const a = (k / 22) * Math.PI * 2 + Math.PI / 2;
        const l = add(g, leaf, k % 3 ? leafMat : brass, Math.cos(a) * hr * 1.12, (k % 2) * hr * 0.05, Math.sin(a) * hr * 1.16);
        l.scale.set(hr * 0.26, hr * 0.09, hr * 0.14);
        l.rotation.set(0.5, -a, (k % 2 ? 0.6 : -0.6));
      }
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.5, 0));
      g.rotation.x = -0.15;
      acc.laurel = attach(B.head, g);
    }
    {
      const ring = new THREE.TorusGeometry(1, 0.09, 6, 30); ring.rotateX(Math.PI / 2);
      ring.scale(hr * 1.08, 1, hr * 1.12);
      const g = new THREE.Group();
      add(g, ring, bandMat);
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.38, 0));
      g.rotation.x = -0.12;
      acc.band = attach(B.head, g);
    }
    {
      const g = new THREE.Group(); // casque grec à crête, relevé : le visage reste visible
      add(g, new THREE.SphereGeometry(hr * 1.14, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), brass);
      add(g, new THREE.TorusGeometry(hr * 1.1, hr * 0.08, 6, 26), bronzeDark).rotation.x = Math.PI / 2;
      const crest = new THREE.CylinderGeometry(hr * 0.95, hr * 0.95, hr * 0.3, 18, 1, false, -Math.PI * 0.05, Math.PI * 1.1);
      crest.rotateZ(Math.PI / 2);
      add(g, crest, crestMat, 0, hr * 1.0, -hr * 0.05);
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.12, 0));
      acc.helmet = attach(B.head, g);
    }
    {
      const g = new THREE.Group(); // pétase : chapeau de voyageur à large bord
      add(g, new THREE.CylinderGeometry(hr * 1.95, hr * 2.05, hr * 0.12, 26), toonMat({ color: '#d9a35a' }));
      add(g, new THREE.SphereGeometry(hr * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toonMat({ color: '#c98b4f' }), 0, 0.01, 0);
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.55, 0));
      g.rotation.x = -0.12;
      acc.petasos = attach(B.head, g);
    }
    // armes : tenues dans la main droite (tige verticale passant par la main, pose de repos)
    const grip = P(B['handslot.r']);
    const holdUp = (obj, below) => { obj.position.set(grip.x, grip.y - below, grip.z); return attach(B['handslot.r'], obj); };
    {
      const g = new THREE.Group(); // lance : hampe de bois, grosse pointe dorée
      add(g, new THREE.CylinderGeometry(0.022, 0.024, 1.25, 7), wood, 0, 0.62, 0);
      add(g, new THREE.ConeGeometry(0.06, 0.18, 8), brass, 0, 1.33, 0).scale.set(1, 1, 0.5);
      add(g, new THREE.SphereGeometry(0.035, 8, 6), bronzeDark, 0, 1.24, 0);
      acc.spear = holdUp(g, 0.3);
    }
    {
      const g = new THREE.Group(); // bâton de pèlerin à crosse
      add(g, new THREE.CylinderGeometry(0.026, 0.03, 1.05, 7), wood, 0, 0.52, 0);
      add(g, new THREE.TorusGeometry(0.07, 0.026, 6, 12, Math.PI * 1.2), wood, -0.07, 1.05, 0);
      acc.staff = holdUp(g, 0.28);
    }
    {
      const g = new THREE.Group(); // xiphos au côté
      add(g, new THREE.BoxGeometry(0.06, 0.3, 0.03), leather, 0, -0.15, 0);
      add(g, new THREE.BoxGeometry(0.14, 0.03, 0.05), brass, 0, 0.01, 0);
      add(g, new THREE.SphereGeometry(0.03, 8, 6), brass, 0, 0.07, 0);
      g.position.set(bb.max.x * 1.02, P(B.hips).y, (bb.min.z + bb.max.z) / 2);
      g.rotation.z = 0.3;
      acc.sword = attach(B.hips, g);
    }
    {
      const g = new THREE.Group(); // arc et carquois dans le dos
      const bow = add(g, new THREE.TorusGeometry(0.3, 0.018, 6, 22, Math.PI * 0.9), wood); bow.rotation.z = Math.PI * 0.55;
      const quiver = add(g, new THREE.CylinderGeometry(0.06, 0.05, 0.32, 10), leather, -0.07, 0.02, -0.03); quiver.rotation.z = -0.5;
      for (let k = 0; k < 3; k++) add(g, new THREE.ConeGeometry(0.03, 0.07, 5), crestMat, -0.15 - k * 0.02, 0.18 + k * 0.01, -0.03).rotation.z = -0.5;
      g.position.set(0, P(B.chest).y + 0.05, bb.min.z - 0.04);
      g.rotation.y = Math.PI;
      acc.bow = attach(B.chest, g);
    }
    // bouclier rond (aspis) dans le dos, motif peint
    const shieldFace = toonMat({ color: '#ffffff', map: shieldTexture('chouette') });
    {
      const g = new THREE.Group();
      const R = 0.22;
      const disc = new THREE.CylinderGeometry(R, R, 0.04, 28); disc.rotateX(Math.PI / 2);
      add(g, disc, bronzeDark);
      add(g, new THREE.CircleGeometry(R * 0.94, 28), shieldFace, 0, 0, -0.022).rotation.y = Math.PI;
      add(g, new THREE.TorusGeometry(R, 0.03, 6, 28), brass);
      g.position.set(0, P(B.chest).y + 0.02, bb.min.z - 0.06);
      acc.shield = attach(B.chest, g);
    }
    // repère au centre de la tête (caméra du mode concentration, lueur de la pensée)
    const anchor = new THREE.Object3D();
    anchor.position.copy(headC);
    attach(B.head, anchor);
    rig.add(hero.mind);
    hero.mind.position.copy(anchor.position);
    rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    hero.group.remove(hero.body);
    if (hero.spear.parent) hero.spear.parent.remove(hero.spear);
    hero.group.scale.setScalar(1);
    hero.group.add(rig);
    _ik = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), h: new THREE.Vector3(),
      q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion() };
    const arm = (side) => ({ upper: B['upperarm.' + side], lower: B['lowerarm.' + side], end: B['handslot.' + side], qa: [new THREE.Quaternion(), new THREE.Quaternion()] });
    Object.assign(hero, { body: rig, head: anchor, rig: { mixer, acts, arms: [arm('l'), arm('r')], headBone: B.head, headSize: hr * 2 * 0.9 },
      skin: { kk: true, cv, g2, base, tex, acc, capeMesh, shieldFace, mats: {}, parts: {} } });
    applySkin();
  }

  // tenues : couleurs des liserés, du cuir, du métal, des jambes et des lanières
  const OUTFIT_COL = {
    voyageur: { trim: '#f6ead0', leather: '#9a5a32', metal: '#ffcc4d', legs: '#7a5236', wraps: '#c98b4f' },
    hoplite: { trim: '#fff1d0', leather: '#8a5a32', metal: '#ffcc4d', legs: null, wraps: '#8a5a32', chest: '#f0b23a' },
    roi: { trim: '#ffcc4d', leather: '#ffcc4d', metal: '#ffffff', legs: null, wraps: '#ffcc4d' },
    marin: { trim: '#ffffff', leather: '#ead7ad', metal: '#b9c4cc', legs: null, wraps: '#c98b4f' },
    pelerin: { trim: '#ead9b5', leather: '#8a6a4c', metal: '#d9c08a', legs: '#9c7a5a', wraps: '#8a6a4c' }
  };
  // repeint les pastilles de la palette KayKit (dégradé d'origine × couleur choisie)
  function paintPalette(K, colors) {
    const W = 512, cw = W / 8, chh = W / 4;
    const out = new ImageData(new Uint8ClampedArray(K.base.data), W, W);
    const S = K.base.data, D = out.data;
    const cell = (dst, srcCell, hex) => {
      if (!hex) return;
      const t = new THREE.Color(hex);
      const [sx, sy] = srcCell || dst;
      let sum = 0, n = 0;
      for (let y = 0; y < chh; y += 4) for (let x = 0; x < cw; x += 4) {
        const i = ((sy * chh + y) * W + sx * cw + x) * 4; sum += S[i] + S[i + 1] + S[i + 2]; n++;
      }
      const ref = Math.max(1, sum / n);
      for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
        const si = ((sy * chh + y) * W + sx * cw + x) * 4, di = ((dst[1] * chh + y) * W + dst[0] * cw + x) * 4;
        const k = Math.min(1.25, (S[si] + S[si + 1] + S[si + 2]) / ref);
        D[di] = t.r * 255 * k; D[di + 1] = t.g * 255 * k; D[di + 2] = t.b * 255 * k; D[di + 3] = 255;
      }
    };
    Object.keys(colors).forEach((key) => {
      const c = colors[key];
      if (!c || !KK[key]) return;
      KK[key].forEach((dst) => cell(dst, key === 'cape' ? KK.capeSrc : null, c));
    });
    if (colors.chest) cell(KK.tunic[0], null, colors.chest);
    K.g2.putImageData(out, 0, 0);
    K.tex.needsUpdate = true;
  }

  // applique skinState au héros (modèle animé ou héros procédural de secours) : peu coûteux
  const HAND_WEAPONS = ['spear', 'staff'];
  function applySkin() {
    if (!hero.group) return;
    const st = skinState;
    const col = (cat) => skinOpt(cat, st[cat]).color;
    const capeId = skinOpt('cape', st.cape).id;
    const capeHex = col('cape') || '#f4f1ea';
    if (hero.capeMat) {
      setLin(hero.capeMat.color, capeHex);
      setLin(hero.scarf.color, '#' + new THREE.Color(capeHex).multiplyScalar(0.72).getHexString());
    }
    if (hero.cape) hero.cape.visible = capeId !== 'none';
    const K = hero.skin;
    if (!K) { // héros procédural : couleurs seulement
      const pm = hero.procMats;
      if (pm) {
        setLin(pm.tunic.color, col('tunic')); setLin(pm.hair.color, col('hair')); setLin(pm.skin.color, col('skin'));
      }
      return;
    }
    const outfit = skinOpt('outfit', st.outfit).id;
    const O = OUTFIT_COL[outfit] || OUTFIT_COL.voyageur;
    const skinHex = col('skin'), hairHex = col('hair');
    paintPalette(K, {
      skin: skinHex, hair: hairHex, tunic: col('tunic'), cape: capeId === 'none' ? col('tunic') : capeHex,
      trim: O.trim, leather: O.leather, metal: O.metal, legs: O.legs || skinHex, wraps: O.wraps, chest: O.chest
    });
    if (K.capeMesh) K.capeMesh.visible = capeId !== 'none';
    const A = K.acc;
    setLin(A.hairMat.color, hairHex);
    const accId = skinOpt('accessory', st.accessory).id;
    ['laurel', 'helmet', 'band', 'petasos'].forEach((n) => { A[n].visible = accId === n; });
    A.hair.visible = accId !== 'helmet';
    setLin(A.band.children[0].material.color, capeId === 'none' || capeId === 'blanc' ? '#ff4f4f' : capeHex);
    const w = skinOpt('weapon', st.weapon).id;
    ['spear', 'staff', 'bow', 'sword'].forEach((n) => { A[n].visible = w === n; A[n].userData.hidden = false; });
    const sh = skinOpt('shield', st.shield).id;
    A.shield.visible = sh !== 'none';
    if (sh !== 'none' && K.shieldFace.map !== shieldTexture(sh)) { K.shieldFace.map = shieldTexture(sh); K.shieldFace.needsUpdate = true; }
    if (World.ok && !running) renderFrame();
  }

  // Mains sur la tête (mode concentration) : petite IK « CCD » sur bras + avant-bras,
  // mélangée à l'animation de repos selon f (0 → animation seule, 1 → pose complète).
  let _ik = null; // (vecteurs de travail, créés quand THREE est disponible)
  function handsOnHead(f) {
    const r = hero.rig;
    hero.group.updateMatrixWorld(true);
    const head = hero.head.getWorldPosition(_ik.h);
    const scale = hero.group.scale.x;
    r.arms.forEach((arm) => {
      arm.qa[0].copy(arm.upper.quaternion); arm.qa[1].copy(arm.lower.quaternion);
      // cible : sur le côté du crâne, un peu au-dessus de l'oreille
      const sh = arm.upper.getWorldPosition(_ik.a);
      const side = _ik.b.set(sh.x - head.x, 0, sh.z - head.z);
      if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
      side.normalize();
      const target = _ik.t.copy(head).addScaledVector(side, r.headSize * 0.55 * scale).add(_ik.c.set(0, r.headSize * 0.22 * scale, 0));
      for (let it = 0; it < 8; it++) {
        [arm.lower, arm.upper].forEach((bone) => {
          const bp = bone.getWorldPosition(_ik.a);
          const ep = arm.end.getWorldPosition(_ik.b).sub(bp).normalize();
          const tp = _ik.c.copy(target).sub(bp).normalize();
          _ik.q.setFromUnitVectors(ep, tp);
          bone.getWorldQuaternion(_ik.w).premultiply(_ik.q);
          bone.parent.getWorldQuaternion(_ik.p).invert();
          bone.quaternion.copy(_ik.p.multiply(_ik.w));
        });
      }
      arm.upper.quaternion.copy(arm.qa[0].slerp(arm.upper.quaternion, f));
      arm.lower.quaternion.copy(arm.qa[1].slerp(arm.lower.quaternion, f));
    });
  }

  function updateRig(dt, t, moving, speed, lift) {
    const r = hero.rig;
    const cheer = !moving && hero.celebrate > 0.05 ? 1 : 0;
    const target = { idle: moving || cheer ? 0 : 1, walk: 0, run: moving ? 1 : 0, cheer };
    const kk = 1 - Math.exp(-dt * 10);
    Object.keys(r.acts).forEach((k) => {
      const A = r.acts[k];
      A.w += ((target[k] || 0) - A.w) * kk;
      A.a.setEffectiveWeight(A.w);
    });
    if (r.acts.run) r.acts.run.a.timeScale = speed ? 1.0 : 0.8;
    r.mixer.update(dt);
    // en concentration, l'arme tenue en main s'efface (les mains montent vers la tête)
    const A = hero.skin && hero.skin.acc;
    if (A) HAND_WEAPONS.forEach((n) => { if (A[n].visible || A[n].userData.hidden) { const on = hero.focus < 0.3; A[n].visible = on; A[n].userData.hidden = !on; } });
    if (hero.focus > 0.01) handsOnHead(Math.min(1, hero.focus));
    hero.mind.position.copy(hero.body.worldToLocal(hero.head.getWorldPosition(_ik.h)));
  }

  // point de passage → position vivante (les îles tanguent, le ponton sort de l'eau)
  function wpPos(wp) {
    if (wp.level != null) return nodePos(wp.level);
    if (wp.stone) return new THREE.Vector3(wp.stone.position.x, wp.stone.position.y + (wp.stone.userData.pier ? 0.03 : 0.11), wp.stone.position.z);
    return groundPos(wp.c, wp.at);
  }

  // itinéraire le long du sentier ; entre deux îles : le portique, puis le ponton
  function routeBetween(a, b) {
    const route = [{ level: a }];
    const dir = b > a ? 1 : -1;
    for (let L = a; L !== b; L += dir) {
      const n = L + dir;
      if (chapterOf(n) !== chapterOf(L)) {
        const c = Math.min(chapterOf(n), chapterOf(L));
        const leg = curveWps(c, levelF(PER - 1), 1).concat([{ c, at: pathWorld(c, 1) }])
          .concat(chapters[c].stones.map((s) => ({ stone: s })))
          .concat([{ c: c + 1, at: pathWorld(c + 1, 0) }]).concat(curveWps(c + 1, 0, levelF(0)));
        route.push(...(dir > 0 ? leg : leg.reverse()));
      } else {
        route.push(...curveWps(chapterOf(L), levelF(L % PER), levelF(n % PER)));
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
      const pier = !!((a.stone && a.stone.userData.pier) || (b.stone && b.stone.userData.pier));
      const hop = !pier && !!(a.stone || b.stone); // (anciennes pierres de gué : on sautait)
      hero.crossing = pier;
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
      hero.crossing = false;
      g.position.copy(hero.free ? groundPos(hero.free.c, hero.free.at) : nodePos(selected));
      // au repos, il regarde vers la suite du voyage (la caméra est derrière lui)
      if (!hero.free) { const d = pathDir(selected); hero.facing = Math.atan2(d.x, d.z); }
    }
    hero.moving = moving;
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
    hero.focus += (hero.focusTarget - hero.focus) * (1 - Math.exp(-dt * 4));
    if (hero.rig) updateRig(dt, t, moving, speed, lift);
    else animateProceduralHero(t, moving, speed, lift);
    const f = hero.focus;
    hero.mind.material.opacity = Math.max(0, f - 0.5) * 2 * (0.7 + Math.sin(t * 3) * 0.3);
    hero.mind.scale.setScalar(0.35 + f * 0.35 + Math.sin(t * 3) * 0.04);
    const accent = lin(opts.levelInfo(selected).accent);
    hero.emblem.material.color.lerp(accent, 1 - Math.exp(-dt * 2));
  }

  function animateProceduralHero(t, moving, speed, lift) {
    // marche, respiration, cape qui flotte derrière lui
    const w = t * 8.5;
    const stride = speed ? Math.sin(w) * 0.55 : lift > 0.05 ? 0.35 : 0;
    hero.legs[0].rotation.x = stride;
    hero.legs[1].rotation.x = speed ? -stride : -stride * 0.6;
    hero.body.position.y = speed ? Math.abs(Math.cos(w)) * 0.025 : 0;
    hero.body.rotation.x = speed ? 0.06 : 0;
    hero.body.scale.y = 1 + (moving ? 0 : Math.sin(t * 1.8) * 0.012);
    hero.cape.rotation.x = moving ? -0.32 + Math.sin(t * 7) * 0.06 : -0.04 + Math.sin(t * 1.2) * 0.03;
    // bras : balancier à la marche, mains sur la tête en mode focus
    const f = hero.focus;
    hero.arms.forEach((arm) => {
      const side = arm.userData.side;
      const swing = speed ? -Math.sin(w) * 0.45 * side : 0;
      arm.rotation.x = swing * (1 - f) - 0.35 * f;
      arm.rotation.z = side * 0.1 * (1 - f) + (-side * 2.82) * f;
    });
    hero.head.rotation.y = moving || f > 0.05 ? 0 : Math.sin(t * 0.35) * 0.35;
    hero.head.rotation.x = -0.12 * f; // il baisse légèrement la tête, concentré
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
    // la houle et l'écume vivent dans le shader ; en mode calme, elles se figent
    const SU = sea.material.userData;
    if (!calm) SU.time.value += dt;
    // les îles les plus proches dessinent leur lagon et leur écume
    chapters.filter(Boolean)
      .map((ch) => ({ ch, d: Math.hypot(ch.group.position.x - cam.tx, ch.group.position.z - cam.tz) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 6)
      .forEach(({ ch }, i) => SU.isl.value[i].set(ch.group.position.x, ch.group.position.z, ch.r * 1.15, Math.min(1, ch.fade * 1.4)));

    chapters.forEach((ch) => {
      if (!ch) return;
      const reached = done >= ch.c * PER;
      ch.fade += ((reached ? 1 : 0.22) - ch.fade) * (1 - Math.exp(-dt * 0.8));
      // l'île suivante attend, enfoncée dans la brume ; atteinte, elle s'élève doucement
      const rise = smooth(0.22, 0.95, ch.fade);
      ch.group.position.y = Math.sin(t * 0.5 + ch.phase) * 0.03 - (1 - rise) * 0.7;
      ch.fadeMats.forEach((m) => { m.opacity = ch.fade; m.transparent = ch.fade < 0.995; });
      ch.nodes.forEach((n) => {
        n.mesh.material.opacity = Math.min(ch.fade, n.mesh.userData.alpha == null ? 1 : n.mesh.userData.alpha);
        if (n.rings) n.rings.visible = ch.fade > 0.3;
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
        s.position.y = (u.base || 0) - (1 - ease) * 1.5 - Math.sin(u.dip * Math.PI) * 0.03;
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
      // fanion du boss qui flotte au vent
      ch.nodes.forEach((n) => {
        if (!n.flag || !n.rings.visible || calm) return;
        const P = n.flag.geometry.attributes.position, B0 = n.flag.userData.base;
        for (let i = 0; i < P.count; i++) { const x = B0[i * 3]; P.setZ(i, Math.sin(t * 4 - x * 9) * 0.05 * x * 2); }
        P.needsUpdate = true;
      });
      // vie de l'île : ailes des moulins, barques qui tanguent, brumes, tourbillon
      const life = ch.life;
      if (life && !calm) {
        life.sails.forEach((s) => { s.rotation.z -= dt * 0.8; });
        life.boats.forEach((b) => {
          b.position.y = Math.sin(t * 1.3 + b.userData.phase) * 0.03 - 0.02;
          b.rotation.z = Math.sin(t * 1.1 + b.userData.phase) * 0.05;
          b.rotation.y = b.userData.base + Math.sin(t * 0.3 + b.userData.phase) * 0.08;
        });
        life.mist.forEach((m) => {
          m.position.y = m.userData.y + Math.sin(t * 0.6 + m.userData.phase) * 0.12;
          m.material.opacity = (0.45 + Math.sin(t * 0.8 + m.userData.phase) * 0.15) * ch.fade;
        });
        if (life.whirl) life.whirl.rotation.z += dt * 1.2;
      }
    });
    // le sentier s'illumine jusqu'à Ulysse
    pathU.value += ((pathU.target != null ? pathU.target : done) - pathU.value) * (1 - Math.exp(-dt * 1.2));

    // la pierre du niveau en cours respire (anneau fixe + onde) ; la bulle du mini-jeu flotte
    // au-dessus de la pierre choisie, à côté d'Ulysse, à taille constante à l'écran
    const cur = chapters[chapterOf(done)] && nodePos(done);
    pulse.visible = !!cur;
    if (CUR_RING) CUR_RING.visible = !!cur && !cine;
    if (cur) {
      const k = (t * 0.6) % 1;
      const big = chapters[chapterOf(done)].nodes[done % PER].boss ? 1.45 : 1;
      pulse.position.set(cur.x, cur.y - 0.03, cur.z);
      pulse.scale.setScalar((0.95 + k * 0.7) * big);
      pulse.material.opacity = (1 - k) * 0.7;
      setLin(pulse.material.color, opts.levelInfo(done).accent);
      if (CUR_RING) {
        CUR_RING.position.set(cur.x, cur.y - 0.02, cur.z);
        CUR_RING.scale.setScalar(big * (1 + Math.sin(t * 2.4) * 0.04));
        setLin(CUR_RING.material.color, opts.levelInfo(done).accent);
      }
    }
    // flèche qui rebondit au-dessus du prochain niveau, quand Ulysse n'y est pas encore
    if (BOUNCE) {
      const away = !!cur && (selected !== done || hero.free || hero.route) && !cine;
      BOUNCE.visible = away;
      if (away) {
        const hop = Math.abs(Math.sin(t * 3.2));
        BOUNCE.position.set(cur.x, cur.y + 0.35 + hop * 0.3, cur.z);
        BOUNCE.scale.set(1 + (1 - hop) * 0.12, 1 - (1 - hop) * 0.12, 1 + (1 - hop) * 0.12);
        BOUNCE.rotation.y = t * 1.5;
      }
    }
    const sel = nodePos(selected);
    const camD = camera.position.distanceTo(sel);
    const ms = Math.max(0.28, Math.min(1.15, camD * 0.075));
    const aspect = (marker.material.map && marker.material.map.userData.aspect) || 2;
    marker.scale.set(ms * aspect, ms, 1);
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    right.y = 0; right.normalize();
    marker.position.set(sel.x, sel.y + 1.38 + ms * 0.55 + Math.sin(t * 1.6) * 0.04, sel.z).addScaledVector(right, 0.35 + ms * 0.5);
    marker.material.opacity += ((hero.route || hero.free || cine || lvlCam ? 0 : 1) - marker.material.opacity) * (1 - Math.exp(-dt * 5));
    if (cine) pulse.visible = false;

    clouds.forEach((c) => {
      const u = c.userData;
      u.a += dt * u.speed;
      c.position.set(focus.x + Math.cos(u.a) * u.r, u.y, focus.z + Math.sin(u.a) * u.r);
      c.rotation.y = -u.a;
      c.visible = c.position.distanceTo(camera.position) > 8; // jamais de nuage plaqué contre l'objectif
    });
    birds.forEach((b) => {
      const u = b.userData;
      u.a += dt * u.speed;
      b.position.set(focus.x + Math.cos(u.a) * u.rad, u.y + Math.sin(t * 0.7 + u.phase) * 0.4, focus.z + Math.sin(u.a) * u.rad);
      b.rotation.y = -u.a + (u.speed < 0 ? Math.PI : 0);
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
    seaLife(dt, t, focus);
    motes.position.set(focus.x, Math.sin(t * 0.2) * 0.3, focus.z);
    motes.rotation.y = t * 0.01;

    updateHero(dt, t);

    // mode concentration : la caméra plonge vers le visage d'Ulysse (de face, un peu de côté)
    if (cine) {
      cine.t += dt;
      const head = new THREE.Vector3();
      hero.head.getWorldPosition(head);
      goal.tx = head.x; goal.ty = head.y + 0.02; goal.tz = head.z;
      goal.radius = 1.8; goal.elev = 0.14; // (grosse tête de dessin animé : on recule un peu)
      const ry = hero.group.rotation.y;
      goal.theta = Math.atan2(Math.cos(ry), Math.sin(ry)) + 0.35;
      setLin(hero.mind.material.color, cine.accent);
      if (cine.t > 2.3 && cine.done) { const cb = cine.done; cine.done = null; cb(); }
      const k = 1 - Math.exp(-dt * 2.4);
      let dth = goal.theta - cam.theta;
      dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      cam.theta += dth * k;
      ['elev', 'radius', 'tx', 'ty', 'tz'].forEach((key) => { cam[key] += (goal[key] - cam[key]) * k; });
      placeCamera();
      return;
    }

    // Caméra « suivi » : toujours derrière Ulysse, un peu au-dessus de l'épaule, tournée vers
    // la suite du sentier ; pendant une traversée elle s'élève pour montrer les deux îles.
    // Caméra « libre » : on survole la carte (glisser, pincer, tourner à deux doigts).
    let rate = 3;
    if (camMode === 'follow') {
      const ry = hero.group.rotation.y;
      const fx = Math.sin(ry), fz = Math.cos(ry);
      if (!drag) followYaw *= Math.exp(-dt * 1.4); // un coup d'œil de côté revient doucement
      goal.theta = Math.atan2(-fz, -fx) + 0.3 + followYaw;
      const cross = hero.crossing ? 1 : 0;
      crossK += (cross - crossK) * (1 - Math.exp(-dt * 1.5));
      goal.radius = followR * (1 + crossK * 0.9);
      goal.elev = Math.min(1.25, followElev + crossK * 0.32);
      groundY += (focus.y - groundY) * (1 - Math.exp(-dt * 1.5));
      goal.tx = focus.x + fx * 0.55; goal.tz = focus.z + fz * 0.55; // on regarde un peu devant lui
      goal.ty = groundY + 0.72;
      rate = hero.moving ? 2.2 : 3;
    } else {
      goal.theta = userTheta;
      goal.tx = freeTarget.x; goal.ty = 0.9; goal.tz = freeTarget.z;
      if (!drag && Math.abs(rotVel) > 1e-4) { userTheta += rotVel * dt; rotVel *= Math.exp(-dt * 4); } // inertie
      else if (!drag) rotVel = 0;
    }
    // après l'intro, la caméra descend du ciel plus lentement ; au retour d'un niveau, elle recule en douceur
    if (swoopT > 0) swoopT -= dt;
    if (lvlCam && lvlCam.kind === 'exit') {
      lvlCam.t += dt;
      if (lvlCam.t >= lvlCam.dur) lvlCam = null;
    }
    const k = 1 - Math.exp(-dt * (swoopT > 0 ? 1.15 : lvlCam && lvlCam.kind === 'exit' ? 2.4 : rate));
    let dth = goal.theta - cam.theta;
    dth = Math.atan2(Math.sin(dth), Math.cos(dth));
    cam.theta += dth * k;
    ['elev', 'radius', 'tx', 'ty', 'tz'].forEach((key) => { cam[key] += (goal[key] - cam[key]) * k; });
    // entrée dans un niveau : plongée rapide par-dessus l'épaule vers la pierre devant lui
    if (lvlCam && lvlCam.kind === 'enter') {
      lvlCam.t += dt;
      const e = Math.min(1, lvlCam.t / lvlCam.dur), ease = e * e * e;
      const ry = hero.group.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
      const F = lvlCam.from;
      const tx = focus.x + fx * 1.5, tz = focus.z + fz * 1.5, ty = focus.y + 0.15;
      cam.tx = F.tx + (tx - F.tx) * ease; cam.ty = F.ty + (ty - F.ty) * ease; cam.tz = F.tz + (tz - F.tz) * ease;
      cam.radius = F.radius + (0.9 - F.radius) * ease;
      cam.elev = F.elev + (0.2 - F.elev) * ease;
      camera.fov = baseFov + 12 * ease;
      camera.updateProjectionMatrix();
      if (e >= 1 && !lvlCam.hold) { const cb = lvlCam.cb; lvlCam.cb = null; lvlCam.hold = true; if (cb) { try { cb(); } catch (err) { console.warn(err); } } }
      // (si personne ne nous rappelle, on revient seul derrière Ulysse)
      if (lvlCam && lvlCam.hold && lvlCam.t > lvlCam.dur + 8) { lvlCam = null; camera.fov = baseFov; camera.updateProjectionMatrix(); }
    }
    placeCamera();
  }
  let camMode = 'follow', groundY = 0.7;
  const freeTarget = { x: 0, z: 0 };
  // caméra de suivi : distance, inclinaison (réglables au doigt), coup d'œil latéral temporaire
  const FOLLOW_R = 4.6, FOLLOW_ELEV = 0.38;
  let followR = FOLLOW_R, followElev = FOLLOW_ELEV, followYaw = 0, crossK = 0, rotVel = 0, baseFov = 55;
  let lvlCam = null; // séquence d'entrée / de sortie de niveau

  function placeCamera() {
    const ce = Math.cos(cam.elev);
    camera.position.set(
      cam.tx + Math.cos(cam.theta) * ce * cam.radius,
      cam.ty + Math.sin(cam.elev) * cam.radius,
      cam.tz + Math.sin(cam.theta) * ce * cam.radius
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    moon.position.set(cam.tx - 22, 26, cam.tz - 30);
    const so = sunOffset();
    sun.position.set(cam.tx + so.x, so.y, cam.tz + so.z);
    sun.target.position.set(cam.tx, 0, cam.tz);
    renderFrame();
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

  // Gestes : un doigt → pivoter (horizontal) et incliner (vertical), ou déplacer la vue en
  // caméra libre ; deux doigts → pincer pour zoomer ; molette → zoom ; toucher bref → aller là.
  const pointers = new Map();
  let pinch = null;
  const R_MIN = 5, R_MAX = 36, F_MIN = 2.6, F_MAX = 12;
  const clampElev = (v) => Math.max(0.16, Math.min(1.35, v));

  function onDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* (pointeur déjà relâché) */ }
    rotVel = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), radius: camMode === 'free' ? goal.radius : followR, ang: Math.atan2(b.y - a.y, b.x - a.x), lastT: performance.now() };
      if (drag) drag.moved = 999; // un pincement n'est jamais un toucher
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    // tourner : clic droit, Maj + glisser, ou glisser horizontalement le long du bas de l'écran (caméra libre)
    const rotate = camMode === 'free' && (e.button === 2 || e.shiftKey || (e.pointerType !== 'mouse' && e.clientY > rect.bottom - rect.height * 0.16));
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), lt: performance.now(), moved: 0,
      theta: userTheta, elev: camMode === 'free' ? goal.elev : followElev, yaw: followYaw, rotate };
  }
  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
      if (camMode === 'free') {
        goal.radius = Math.max(R_MIN, Math.min(R_MAX, pinch.radius * pinch.dist / d));
        // torsion à deux doigts : la vue tourne autour du point visé
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        let da = ang - pinch.ang;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        pinch.ang = ang;
        userTheta += da;
        const now = performance.now();
        rotVel = da / Math.max(0.008, (now - pinch.lastT) / 1000) * 0.5;
        pinch.lastT = now;
      } else followR = Math.max(F_MIN, Math.min(F_MAX, pinch.radius * pinch.dist / d));
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.moved <= 8) return;
    const now = performance.now();
    if (camMode === 'free' && !drag.rotate) {
      // on fait glisser la carte sous le doigt
      const mx = e.clientX - drag.lx, my = e.clientY - drag.ly;
      const s = cam.radius * 0.0022;
      const fx = -Math.cos(cam.theta), fz = -Math.sin(cam.theta); // avant (vers la cible)
      const rx = -fz, rz = fx;                                     // droite
      freeTarget.x += (-mx * rx + my * fx) * s;
      freeTarget.z += (-mx * rz + my * fz) * s;
    } else if (camMode === 'free') {
      const prev = userTheta;
      userTheta = drag.theta + dx * 0.008;
      goal.elev = clampElev(drag.elev + dy * 0.004);
      rotVel = (userTheta - prev) / Math.max(0.008, (now - drag.lt) / 1000) * 0.5;
    } else {
      // suivi : un coup d'œil (il revient derrière Ulysse au relâchement) et l'inclinaison
      followYaw = Math.max(-1.6, Math.min(1.6, drag.yaw + dx * 0.007));
      followElev = Math.max(0.14, Math.min(1.1, drag.elev + dy * 0.004));
    }
    drag.lx = e.clientX; drag.ly = e.clientY; drag.lt = now;
  }
  function onWheel(e) {
    e.preventDefault();
    if (camMode === 'free') goal.radius = Math.max(R_MIN, Math.min(R_MAX, goal.radius * (1 + e.deltaY * 0.0012)));
    else followR = Math.max(F_MIN, Math.min(F_MAX, followR * (1 + e.deltaY * 0.0012)));
  }
  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag || pointers.size > 0) { if (pointers.size === 0) drag = null; return; }
    if (cine) { drag = null; return; } // pas de déplacement pendant la concentration
    const tap = drag.moved < 8 && performance.now() - drag.t < 400;
    drag = null;
    if (!tap) return;
    // Ulysse reste sur le niveau en cours : toucher la carte ne le déplace plus
    // (il n'avance qu'en terminant un niveau). Les gestes de caméra restent libres.
    if (!World.allowWander) return;
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

  // ------------------------------------------------------------------
  // Rendu stylisé « maquette » : la scène est rendue dans une texture, puis une passe
  // finale ajoute un flou de bascule (le haut et le bas de l'image se floutent, comme
  // une photo de diorama), un léger vignettage et des couleurs un peu plus riches.
  // ------------------------------------------------------------------
  let post = null;
  function setupPost() {
    try {
      const RT = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget;
      const target = new RT(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
      target.texture.encoding = THREE.sRGBEncoding; // la scène y est déjà tone-mappée et encodée en sRGB
      const material = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: target.texture }, texel: { value: new THREE.Vector2(1, 1) }, focus: { value: 0.5 }, strength: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: [
          'uniform sampler2D tDiffuse; uniform vec2 texel; uniform float focus; uniform float strength; varying vec2 vUv;',
          'void main() {',
          '  float d = abs(vUv.y - focus);',
          '  float blur = smoothstep(0.22, 0.6, d) * 3.5 * strength;', // net au centre, flou vers les bords
          '  vec4 col = texture2D(tDiffuse, vUv) * 0.2;',
          '  for (int i = 0; i < 8; i++) {',
          '    float a = float(i) * 2.39996;',                              // angle d'or : échantillons bien répartis
          '    vec2 off = vec2(cos(a), sin(a)) * texel * blur * (0.5 + float(i) / 8.0);',
          '    col += texture2D(tDiffuse, vUv + off) * 0.1;',
          '  }',
          '  vec3 c = col.rgb;',
          '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
          '  c = mix(vec3(l), c, 1.12);',                                      // un peu plus de couleur
          '  c = (c - 0.5) * 1.02 + 0.5;',                                    // un peu plus de contraste
          // étalonnage chaud et doux : ombres légèrement bleutées, lumières dorées
          '  float s = smoothstep(0.0, 0.55, l), hi = smoothstep(0.45, 1.0, l);',
          '  c += vec3(-0.012, 0.0, 0.022) * (1.0 - s) + vec3(0.03, 0.012, -0.022) * hi;',
          '  c = max(c, vec3(0.0));',
          '  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.12 * strength;',    // vignettage doux
          '  gl_FragColor = vec4(c, 1.0);',
          '}'
        ].join('\n'),
        depthTest: false, depthWrite: false
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
      quad.frustumCulled = false;
      const s = new THREE.Scene();
      s.add(quad);
      post = { target, material, scene: s, camera: new THREE.Camera() };
    } catch (e) { post = null; } // sans post-traitement, on rend directement
  }
  function resizePost(w, h) {
    if (!post) return;
    const pr = renderer.getPixelRatio();
    post.target.setSize(Math.round(w * pr), Math.round(h * pr));
    post.material.uniforms.texel.value.set(1 / (w * pr), 1 / (h * pr));
  }
  function renderFrame() {
    renderer.info.reset();
    if (!post) { renderer.render(scene, camera); return; }
    // en gros plan (mode concentration), le flou se resserre autour du visage
    post.material.uniforms.strength.value = calm ? 0.35 : 1;
    renderer.setRenderTarget(post.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(post.scene, post.camera);
  }

  function resize() {
    if (!renderer) return;
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    resizePost(w, h);
    camera.aspect = w / h;
    baseFov = w < h ? 55 : 42;
    if (!(lvlCam && lvlCam.kind === 'enter')) camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }

  // pastille au-dessus de la pierre : le numéro du niveau
  const numCache = {};
  function numberTexture(n, accent, boss) {
    const key = n + accent + boss;
    if (numCache[key]) return numCache[key];
    numCache[key] = canvasTexture(128, 128, (g) => {
      g.fillStyle = 'rgba(255,255,255,.95)';
      g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.fill();
      g.strokeStyle = accent; g.lineWidth = boss ? 6 : 4;
      g.beginPath(); g.arc(64, 64, boss ? 57 : 52, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#2b3035';
      g.font = '500 ' + (n > 99 ? 40 : 52) + 'px Jost, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 64, 68);
    });
    return numCache[key];
  }

  // Bulle au-dessus de la pierre : les symboles des mini-jeux du niveau, sans texte
  const bubbleCache = {};
  function bubbleTexture(info) {
    const ids = info.steps.map((s) => s.id);
    const key = ids.join('+') + (info.boss ? ':boss' : '');
    if (bubbleCache[key]) return bubbleCache[key];
    const W = 96 * ids.length + 48, H = 150;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    const imgs = [];
    const paint = () => {
      g.clearRect(0, 0, W, H);
      // bulle arrondie avec une petite pointe vers la pierre
      g.fillStyle = 'rgba(255,250,240,.96)';
      const r = 46, h = 112;
      g.beginPath();
      g.moveTo(r, 0); g.lineTo(W - r, 0); g.arcTo(W, 0, W, r, r); g.lineTo(W, h - r); g.arcTo(W, h, W - r, h, r);
      g.lineTo(W / 2 + 16, h); g.lineTo(W / 2, h + 22); g.lineTo(W / 2 - 16, h);
      g.lineTo(r, h); g.arcTo(0, h, 0, h - r, r); g.lineTo(0, r); g.arcTo(0, 0, r, 0, r); g.closePath();
      g.fill();
      if (info.boss) { g.strokeStyle = '#d9a441'; g.lineWidth = 6; g.stroke(); }
      imgs.forEach((im, i) => { if (im.complete && im.naturalWidth) g.drawImage(im, 24 + i * 96 + 12, 20, 72, 72); });
      tex.needsUpdate = true;
    };
    info.steps.forEach((s) => {
      const accent = s.accent || opts.accentOf(s.id);
      const inner = (opts.iconSvg(s.id) || '').replace(/class="f"/g, 'fill="' + accent + '" stroke="none"');
      const img = new Image();
      img.onload = paint;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="72" height="72" fill="none" stroke="' +
        accent + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>');
      imgs.push(img);
    });
    paint();
    tex.userData = { aspect: W / H };
    bubbleCache[key] = tex;
    return tex;
  }

  function setMarker() {
    const info = opts.levelInfo(selected);
    marker.material.map = bubbleTexture(info);
    marker.material.needsUpdate = true;
    const a = marker.material.map.userData.aspect || 2;
    marker.scale.set(0.82 * a, 0.82, 1);
    return;
    // (ancienne pastille numérotée)
    marker.material.map = numberTexture(selected + 1, info.accent, info.boss);
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // (éclairage PBR : on ménage le GPU des téléphones ; le flou de bascule masque la différence)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // chaîne de rendu linéaire → tone mapping filmique → sRGB
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping; // couleurs franches, sans tone mapping filmique
    renderer.physicallyCorrectLights = false;
    renderer.domElement.className = 'world-canvas';
    renderer.info.autoReset = false; // (statistiques de la scène complète, pas de la seule passe finale)
    setupPost();
    host.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 110); // (au-delà, la brume a tout effacé : on ne dessine pas)
    makeSky();
    hemi = new THREE.HemisphereLight('#ffffff', '#b9c6ca', 0.52);
    scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff2e2', 0.64);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
    scene.add(sun, sun.target);

    makeSea();
    makeClouds();
    makeBirds();
    makeBoat();
    makeSeaLife();
    makeMotes();

    pulse = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.44, 40),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false }));
    pulse.rotation.x = -Math.PI / 2;
    scene.add(pulse);
    marker = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    marker.scale.set(0.75, 0.75, 1);
    scene.add(marker);

    done = options.done || 0;
    selected = Math.min(options.selected != null ? options.selected : done, done);
    makeShared();
    refresh(false);
    makeHero();
    setMarker();

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinch = null; drag = null; });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // angle de départ : derrière Ulysse, dans le sens du sentier
    const d0 = pathDir(selected);
    userTheta = goal.theta = cam.theta = Math.atan2(-d0.z, -d0.x) + 0.3;
    cam.radius = goal.radius = followR; cam.elev = goal.elev = followElev;
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host); // barre d'adresse, plein écran : la scène suit la vraie hauteur
    resize();
    World.ok = true;
    applyLight();
    loadAssets(); // modèles 3D en arrière-plan ; le monde procédural reste en place s'ils manquent
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
  // heure réelle (ex. 18.5 pour 18 h 30) ; night = forcer la nuit (mode sombre choisi)
  World.setTime = (hour, night) => { if (!World.ok) return; lightHour = hour; forceNight = !!night; applyLight(); };
  World.isNight = (hour) => hour < 6 || hour >= 20.5;
  // caméra libre (on survole la carte) ou suivi d'Ulysse
  World.setCameraMode = (mode) => {
    const was = camMode;
    camMode = mode === 'free' ? 'free' : 'follow';
    if (camMode === 'free' && was !== 'free') {
      freeTarget.x = cam.tx; freeTarget.z = cam.tz;
      userTheta = cam.theta; goal.radius = Math.max(R_MIN, Math.min(R_MAX, cam.radius * 1.6)); goal.elev = clampElev(Math.max(0.55, cam.elev));
    }
    if (camMode === 'follow') { followYaw = 0; rotVel = 0; }
    return camMode;
  };
  World.cameraMode = () => camMode;
  // Îles du voyage (une par chapitre), dans l'ordre de l'Odyssée
  // noms courts et simples, un mot par île
  const ISLAND_NAMES = ['Troie', 'Le Marché', 'Les Lotus', 'Le Cyclope', 'Les Vents', 'Les Falaises',
    'Circé', 'Les Brumes', 'Les Sirènes', 'Le Tourbillon', 'Le Soleil', 'Calypso', 'Le Palais', 'Ithaque'];
  const islandName = (i) => ISLAND_NAMES[i % ISLAND_NAMES.length] + (i >= ISLAND_NAMES.length ? ' ' + (Math.floor(i / ISLAND_NAMES.length) + 1) : '');
  World.islands = () => {
    const here = hero.free ? hero.free.c : chapterOf(selected);
    const out = [];
    for (let c = 0; c < chapters.length; c++) if (chapters[c]) out.push({ index: c, name: islandName(c), unlocked: done >= c * PER, current: c === here });
    return out;
  };
  // la caméra glisse jusqu'à l'île choisie (caméra libre) ; Ulysse reste où il est
  World.viewIsland = (index) => {
    if (!World.ok) return islandName(index | 0);
    const c = Math.max(0, Math.min(chapters.length - 1, index | 0));
    const ch = chapters[c];
    if (!ch) return islandName(c);
    cine = null; lvlCam = null;
    World.setCameraMode('free');
    freeTarget.x = ch.group.position.x; freeTarget.z = ch.group.position.z;
    goal.radius = 15; goal.elev = 0.82;
    return islandName(c);
  };
  World.viewHero = () => World.setCameraMode('follow');
  // Plongée vers le niveau (bouton « Jouer ») : la caméra fonce par-dessus l'épaule d'Ulysse
  // vers la pierre devant lui (≈ 0,7 s), puis cb(). Sans 3D (ou boucle à l'arrêt) : cb() tout de suite.
  World.enterLevel = (cb) => {
    if (!World.ok || !running || cine) { if (cb) cb(); return; }
    if (lvlCam && lvlCam.kind === 'enter') { if (cb) lvlCam.cb = lvlCam.hold ? (cb(), null) : cb; return; } // (déjà en route)
    if (camMode !== 'follow') World.setCameraMode('follow');
    lvlCam = { kind: 'enter', t: 0, dur: 0.7, cb: cb || null, from: { tx: cam.tx, ty: cam.ty, tz: cam.tz, radius: cam.radius, elev: cam.elev } };
  };
  // Retour sur la carte : départ tout près, derrière Ulysse, puis recul en douceur (≈ 1,2 s)
  World.exitLevel = (won) => {
    if (!World.ok) return;
    cine = null;
    hero.focusTarget = 0;
    camMode = 'follow'; followYaw = 0;
    const ry = hero.group.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry);
    const p = hero.group.position;
    cam.theta = Math.atan2(-fz, -fx) + 0.3;
    cam.radius = 1.4; cam.elev = 0.22;
    cam.tx = p.x + fx * 0.8; cam.ty = p.y + 0.6; cam.tz = p.z + fz * 0.8;
    camera.fov = baseFov; camera.updateProjectionMatrix();
    lvlCam = { kind: 'exit', t: 0, dur: 1.2, won: !!won };
    if (!running) placeCamera();
  };
  // plongée d'intro : la caméra part très haut dans le ciel et descend vers Ulysse
  let swoopT = 0, camSave = null;
  World.swoop = () => { cam.radius = 64; cam.elev = 1.38; cam.theta = goal.theta + 1.7; swoopT = 3.2; };
  // Mode concentration : Ulysse pose les mains sur sa tête, la caméra plonge vers lui,
  // une lueur s'allume dans sa tête ; `done` est appelé à la fin de la séquence.
  World.concentrate = (accent, done) => {
    if (!World.ok) { done(); return; }
    if (hero.route) { // il s'arrête où il est
      const p = hero.group.position;
      const ch = chapters.find((c) => c && Math.hypot(p.x - c.group.position.x, p.z - c.group.position.z) < c.r);
      hero.route = null;
      if (ch) hero.free = { c: ch.c, at: new THREE.Vector3(p.x, 0, p.z) };
    }
    hero.focusTarget = 1;
    if (!camSave) camSave = { radius: goal.radius, elev: goal.elev };
    lvlCam = null;
    cine = { t: 0, accent, done };
  };
  World.endConcentrate = () => {
    if (!World.ok) return;
    cine = null;
    hero.focusTarget = 0;
    if (camSave) { goal.radius = camSave.radius; goal.elev = camSave.elev; camSave = null; }
  };
  // animations réduites : mer immobile, pas d'oiseaux ni de poussières
  World.setCalm = (on) => { if (!World.ok) return; calm = on; birds.forEach((b) => { b.visible = !on; }); motes.visible = !on; };
  World.selected = () => selected;
  // Garde-robe : options (catégories → [{ id, name, color? }]), libellés, état courant
  World.skinOptions = () => {
    const out = {};
    Object.keys(SKIN_OPTIONS).forEach((k) => { out[k] = SKIN_OPTIONS[k].map((o) => Object.assign({}, o)); });
    return out;
  };
  World.skinLabels = () => Object.assign({}, SKIN_LABELS);
  World.getSkin = () => Object.assign({}, skinState);
  // setSkin({ outfit, tunic, cape, hair, skin, accessory, weapon, shield }) : immédiat, sans coût notable ;
  // peut être appelé avant l'init ou avant le chargement du modèle (appliqué ensuite)
  World.setSkin = (s) => {
    if (s) Object.keys(SKIN_DEFAULT).forEach((k) => { if (s[k] != null && SKIN_OPTIONS[k].some((o) => o.id === s[k])) skinState[k] = s[k]; });
    if (THREE && hero.group) applySkin();
    return Object.assign({}, skinState);
  };
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
  World._scene = () => scene;
  World._camera = () => camera;
  World._render = () => renderFrame();
  World._gfx = () => ({ renderer, sun, hemi, stdMats, post, envMap, MOMENTS, applyLight, goal, freeTarget, chapters });
  World.wander = (c, dx, dz) => { const p = centerOf(c); wanderTo(c, new THREE.Vector3(p.x + dx, 0, p.z + dz)); };
  World.debug = () => ({ done, selected, free: !!hero.free, route: hero.route ? hero.route.length : 0, chapters: chapters.length,
    pos: hero.group.position.toArray().map((v) => +v.toFixed(2)), models: assets.status, rig: !!hero.rig, modelError: assets.error,
    calls: renderer.info.render.calls, tris: renderer.info.render.triangles });

  document.addEventListener('visibilitychange', () => {
    if (!World.ok) return;
    if (document.hidden) { if (running) { World.stop(); World._paused = true; } }
    else if (World._paused) { World._paused = false; World.start(); }
  });

  C.world = World;
})();
