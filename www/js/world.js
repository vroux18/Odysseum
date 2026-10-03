// Odysseum — le monde en 3D (Three.js r128).
// Une chaîne d'îles sans fin. Sur chaque île, un sentier serpente entre PER
// niveaux répartis sur tout le relief ; le dernier est un boss. Battre le boss
// ouvre le portique et fait remonter les pierres de gué vers l'île suivante.
// Chaque île a son ambiance (pinède, ruines, jardin, dunes), ses moutons, ses fleurs.
(function () {
  'use strict';
  const C = window.Carnet;

  const PER = 6;           // niveaux par île (le dernier est le boss)
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

  // Rendu « linéaire » : les couleurs sont écrites en sRGB (hex) et converties en espace
  // linéaire pour l'éclairage ; la sortie est ré-encodée en sRGB avec un tone mapping filmique.
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const setLin = (color, hex) => color.set(hex).convertSRGBToLinear();
  const tint = (hex, amount) => new THREE.Color('#fbfaf7').lerp(new THREE.Color(hex), amount).convertSRGBToLinear();
  // Matériau de base : ombrage doux « maquette » (PBR mat, sans reflets métalliques),
  // éclairé par le soleil, le ciel (HDRI) et une lumière d'ambiance.
  const stdMats = [];
  let envBoost = 1;
  const toonMat = (params) => {
    const p = Object.assign({ roughness: 0.88, metalness: 0 }, params);
    delete p.flatShading; delete p.gradientMap;
    const hex = p.color;
    delete p.color;
    const mat = new THREE.MeshStandardMaterial(p);
    if (hex != null) { if (hex.isColor) mat.color.copy(hex); else setLin(mat.color, hex); }
    mat.envMapIntensity = envBoost;
    stdMats.push(mat);
    return mat;
  };
  const lambert = (color, extra) => toonMat(Object.assign({ color }, extra || {}));
  const OUTLINE = false; // contour encré du héros (abandonné avec l'éclairage doux)
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
    dayBg = gradient([[0, '#d3e1e7'], [0.5, '#eef2f1'], [1, FOG]]);
    nightBg = gradient([[0, '#0e1418'], [0.55, '#18212a'], [1, '#1a2126']]);
    scene.background = dayBg;
    scene.fog = new THREE.Fog(FOG, 22, 72);
    // la lune, visible de nuit seulement
    moon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: '#eef1f4', fog: false }));
    moon.material.toneMapped = false;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#c9d6ff', transparent: true, opacity: 0.55, depthWrite: false, fog: false, toneMapped: false }));
    halo.scale.set(12, 12, 1);
    moon.add(halo);
    moon.visible = false;
    scene.add(moon);
  }

  // ------------------------------------------------------------------
  // Lumière du jour : l'archipel suit l'heure réelle (aube, jour, crépuscule, nuit).
  // Chaque moment est une palette ; entre deux moments, on interpole doucement.
  // ------------------------------------------------------------------
  // sea = [eau profonde, eau peu profonde (lagon autour des îles)] ; env = intensité du ciel HDRI
  const MOMENTS = {
    nuit: { sky: ['#0e1418', '#18212a', '#1a2126'], fog: '#1a2126', sea: ['#1d2c36', '#2f4a52'], hemi: ['#8fa2b8', '#1c2328', 0.45],
      sun: ['#b8c8ff', 0.5], cloud: ['#46515a', 0.55], mtn: '#222b31', motes: ['#ffe2a0', 1, 0.17], night: 1, env: 0.12 },
    aube: { sky: ['#c6cde0', '#f2d8cf', '#f4e2d6'], fog: '#f1e2d8', sea: ['#8fb0bf', '#bfe0d8'], hemi: ['#ffe9dc', '#b6b4c4', 0.3],
      sun: ['#ffc9a4', 1.0], cloud: ['#fbe9e2', 0.9], mtn: '#e6dcdc', motes: ['#ffffff', 0.8, 0.12], night: 0, env: 0.3 },
    jour: { sky: ['#a9cfe3', '#e3eff1', FOG], fog: FOG, sea: ['#5fa9bf', '#9ee0d6'], hemi: ['#f4f8ff', '#c9c2ae', 0.28],
      sun: ['#fff0dc', 1.15], cloud: ['#ffffff', 0.92], mtn: '#dfe6e6', motes: ['#ffffff', 0.8, 0.12], night: 0, env: 0.35 },
    crepuscule: { sky: ['#b6c1d8', '#f1ccb6', '#f3d8c3'], fog: '#efd9c9', sea: ['#7c9fb4', '#c4d8cf'], hemi: ['#ffe1c6', '#a9afc0', 0.3],
      sun: ['#ffbe88', 1.05], cloud: ['#fae0cf', 0.9], mtn: '#e2d6d2', motes: ['#ffe9c4', 0.85, 0.13], night: 0, env: 0.3 }
  };
  // (lumières en unités physiques : ×π par rapport à l'ancien rendu)
  const SUN_K = Math.PI * 1.15, HEMI_K = Math.PI;
  let envMap = null;
  // heure → moment (les intervalles se fondent les uns dans les autres)
  const TIMELINE = [[0, 'nuit'], [5, 'nuit'], [6.5, 'aube'], [8.5, 'jour'], [17, 'jour'], [19, 'crepuscule'], [20.5, 'nuit'], [24, 'nuit']];
  let calm = false;
  let cine = null; // séquence « mode concentration » en cours
  let lightHour = 12, forceNight = false, skyKey = '', mtnColor = '#dfe6e6';

  function mix(a, b, k) {
    if (typeof a === 'number') return a + (b - a) * k;
    if (Array.isArray(a)) return a.map((v, i) => mix(v, b[i], k));
    return '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
  }
  function paletteAt(hour) {
    if (forceNight) return MOMENTS.nuit;
    for (let i = 0; i + 1 < TIMELINE.length; i++) {
      const [h0, m0] = TIMELINE[i], [h1, m1] = TIMELINE[i + 1];
      if (hour >= h0 && hour <= h1) {
        const k = h1 === h0 ? 0 : (hour - h0) / (h1 - h0);
        const A = MOMENTS[m0], B = MOMENTS[m1], out = {};
        Object.keys(A).forEach((key) => { out[key] = mix(A[key], B[key], k); });
        return out;
      }
    }
    return MOMENTS.jour;
  }

  function applyLight() {
    const p = paletteAt(lightHour);
    const key = p.sky.join();
    if (key !== skyKey) { // le dégradé du ciel n'est redessiné que s'il change
      skyKey = key;
      if (scene.background && scene.background.dispose && scene.background !== dayBg) scene.background.dispose();
      scene.background = canvasTexture(4, 256, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, p.sky[0]); grd.addColorStop(0.5, p.sky[1]); grd.addColorStop(1, p.sky[2]);
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
      });
    }
    setLin(scene.fog.color, p.fog);
    if (sea.material.userData.deep) {
      setLin(sea.material.userData.deep.value, p.sea[0]);
      setLin(sea.material.userData.shallow.value, p.sea[1]);
      sea.material.userData.spark.value = 1 - p.night * 0.85;
    }
    setLin(hemi.color, p.hemi[0]); setLin(hemi.groundColor, p.hemi[1]);
    // avec le ciel HDRI, l'ambiance vient surtout de l'environnement : l'hémisphère complète
    hemi.intensity = p.hemi[2] * HEMI_K * (envMap ? 0.55 : 1.15);
    setLin(sun.color, p.sun[0]); sun.intensity = p.sun[1] * SUN_K;
    envBoost = envMap ? p.env : 0;
    stdMats.forEach((m) => { m.envMapIntensity = envBoost; });
    setLin(cloudMat.color, p.cloud[0]); cloudMat.opacity = p.cloud[1];
    mtnColor = p.mtn;
    mountains.forEach((m) => setLin(m.material.color, p.mtn));
    setLin(motes.material.color, p.motes[0]); motes.material.opacity = p.motes[1]; motes.material.size = p.motes[2];
    isDark = p.night > 0.5;
    moon.visible = p.night > 0.3;
    moon.children[0].material.opacity = 0.55 * p.night;
  }

  // position du soleil selon l'heure : bas à l'aube et au crépuscule, ombres longues
  function sunOffset() {
    if (forceNight || lightHour < 6 || lightHour > 20.5) return new THREE.Vector3(-8, 16, -10); // la lune
    const k = (lightHour - 6) / 14.5;               // 0 au lever, 1 au coucher
    const az = Math.PI * (0.15 + k * 0.7);
    const elev = 4 + Math.sin(Math.PI * k) * 11; // soleil un peu bas : ombres longues et douces
    return new THREE.Vector3(Math.cos(az) * 14, elev, Math.sin(az) * 10 + 4);
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
    U.deep = { value: lin('#5fa9bf') };
    U.shallow = { value: lin('#9ee0d6') };
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
          'base = mix(base, vec3(0.95), clamp(foam + foam2 + caps * 0.3, 0.0, 1.0));',
          // paillettes de soleil
          'vec2 g2 = p + vec2(sin(p.y * 0.73 + t * 0.3), cos(p.x * 0.61 - t * 0.25)) * 1.7;',
          'float gl = pow(max(0.0, sin(g2.x * 13.0 + t * 2.1) * sin(g2.y * 11.0 - t * 1.7)), 30.0) * smoothstep(0.55, 0.95, sin(p.x * 0.45 + p.y * 0.31 + t * 0.2) * 0.5 + 0.5);',
          'base += vec3(1.0, 0.97, 0.88) * gl * 1.3 * uSpark;',
          'vec4 diffuseColor = vec4(base, opacity);'
        ].join('\n'))
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + [
          // vagues : quatre trains de houle croisés (normales perturbées, sans texture)
          'vec2 q = vW.xz; float tt = uTime; vec2 gw = vec2(0.0);',
          'gw += vec2(0.8, 0.6) * cos(dot(q, vec2(0.8, 0.6)) * 2.1 + tt * 1.3) * 0.07;',
          'gw += vec2(-0.5, 0.85) * cos(dot(q, vec2(-0.5, 0.85)) * 3.3 + tt * 1.7) * 0.05;',
          'gw += vec2(0.95, -0.3) * cos(dot(q, vec2(0.95, -0.3)) * 5.7 + tt * 2.3) * 0.035;',
          'gw += vec2(-0.2, -1.0) * cos(dot(q, vec2(-0.2, -1.0)) * 9.1 + tt * 3.1) * 0.022;',
          'normal = normalize(normal + (viewMatrix * vec4(gw.x, 0.0, gw.y, 0.0)).xyz);'
        ].join('\n'));
    };
    sea = new THREE.Mesh(geo, seaMat);
    sea.receiveShadow = true;
    scene.add(sea);
  }

  function makeClouds() {
    const mat = cloudMat = lambert('#ffffff', { transparent: true, opacity: 0.92 });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let k = 0; k < puffs; k++) {
        const s = 0.9 + Math.random() * 1.0;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), mat);
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
    const mat = new THREE.MeshBasicMaterial({ color: lin('#8a9399'), side: THREE.DoubleSide });
    const gull = new THREE.MeshBasicMaterial({ color: lin('#e9ecec'), side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) { // goélands et martinets
      const b = new THREE.Group();
      const l = new THREE.Mesh(wingGeo, i % 2 ? gull : mat), r = new THREE.Mesh(wingGeo, i % 2 ? gull : mat);
      r.scale.x = -1;
      b.add(l, r);
      b.userData = { l, r, a: i * 1.6, rad: 7 + (i % 4) * 2.5 + i * 0.6, y: 3.2 + (i % 3) * 1.6, speed: (0.11 + i * 0.025) * (i % 2 ? -1 : 1), phase: i };
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
    const R = ch.r, rings = 26, segs = 72;
    const pos = [], col = [], idx = [], uv = [];
    const c = new THREE.Color();
    const push = (x, z, edge) => {
      const y = edge ? TOP : heightLocal(ch, x, z);
      pos.push(x, y, z);
      uv.push(x * 0.3, z * 0.3); // texture d'herbe répétée environ tous les 3 mètres
      const t = Math.min(1, Math.max(0, (y - TOP) / 1.3));
      if (edge) c.copy(colors.sand);
      else {
        c.copy(colors.low).lerp(colors.high, t);
        // prairie vivante : taches d'herbe plus fraîches ou plus sèches, bord plus clair
        const n = Math.sin(x * 1.3 + ch.phase) * Math.cos(z * 1.1 - ch.phase) + Math.sin((x + z) * 2.7) * 0.35;
        c.lerp(n > 0 ? colors.fresh : colors.dry, Math.min(1, Math.abs(n)) * 0.45);
        c.lerp(colors.sand, smooth(0.86, 1.0, Math.hypot(x, z) / R) * 0.55);
      }
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
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.userData.base = Float32Array.from(col); // (couleurs avant l'occlusion au pied des décors)
    return geo;
  }

  // ------------------------------------------------------------------
  // Le sentier : UNE route continue qui serpente sur l'île, de la plage d'arrivée au
  // portique de sortie, puis traverse la mer sur un ponton de bois jusqu'à l'île suivante.
  // Les niveaux sont posés à intervalles réguliers le long de cette ligne (ordre = ordre des niveaux).
  // ------------------------------------------------------------------
  const LV0 = 0.08, LV1 = 0.84, GATE_F = 0.9, PATH_W = 0.27;
  const levelF = (k) => LV0 + (LV1 - LV0) * k / (PER - 1);
  function layoutPath(ch, entry, exit) {
    const R = ch.r, rng = ch.rng;
    const a = entry.clone().setLength(R * 0.98), b = exit.clone().setLength(R * 0.98);
    const dir = b.clone().sub(a);
    const len = dir.length();
    dir.normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const waves = rng() < 0.5 ? 1 : 1.5, amp = R * (0.42 + rng() * 0.1), ph = rng() < 0.5 ? 0 : Math.PI;
    const pts = [a];
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const p = a.clone().addScaledVector(dir, len * t).addScaledVector(side, Math.sin(Math.PI * 2 * waves * t + ph) * amp * Math.sin(Math.PI * t));
      const r = Math.hypot(p.x, p.z);
      if (r > R * 0.76) p.multiplyScalar(R * 0.76 / r);
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

  // dallage du sentier : pierres claires irrégulières, joints doux, bords fondus (alpha)
  let pathTex = null;
  function pathTexture() {
    if (pathTex) return pathTex;
    const W = 128, H = 256, r = C.makeRng('dallage');
    pathTex = canvasTexture(W, H, (g) => {
      g.fillStyle = '#d9cdb4'; g.fillRect(0, 0, W, H);
      let y = 0;
      while (y < H) {
        const h = 26 + r() * 22;
        let x = -r() * 30;
        while (x < W) {
          const w = 30 + r() * 34;
          const v = 228 + Math.floor(r() * 22);
          g.fillStyle = 'rgb(' + v + ',' + (v - 8) + ',' + (v - 24) + ')';
          const rr = 7;
          g.beginPath();
          g.moveTo(x + rr + 2, y + 2); g.arcTo(x + w - 2, y + 2, x + w - 2, y + h - 2, rr); g.arcTo(x + w - 2, y + h - 2, x + 2, y + h - 2, rr);
          g.arcTo(x + 2, y + h - 2, x + 2, y + 2, rr); g.arcTo(x + 2, y + 2, x + w - 2, y + 2, rr); g.fill();
          for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(120,100,70,' + (0.04 + r() * 0.05) + ')'; g.fillRect(x + r() * w, y + r() * h, 2 + r() * 3, 2 + r() * 3); }
          x += w;
        }
        y += h;
      }
      // bords fondus dans l'herbe
      g.globalCompositeOperation = 'destination-in';
      const grd = g.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.16, 'rgba(0,0,0,1)');
      grd.addColorStop(0.84, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    });
    pathTex.wrapS = THREE.ClampToEdgeWrapping; pathTex.wrapT = THREE.RepeatWrapping;
    return pathTex;
  }
  // progression du voyage le long du sentier (niveaux), partagée par tous les rubans
  const pathU = { value: 0 };
  function pathMaterial() {
    const mat = toonMat({ color: '#ffffff', map: pathTexture(), transparent: true, depthWrite: false, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDone = pathU;
      sh.vertexShader = 'attribute float along;\nvarying float vAlong;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlong = along;');
      sh.fragmentShader = 'uniform float uDone;\nvarying float vAlong;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', [
          '#include <map_fragment>',
          // derrière Ulysse : dallage doré et lumineux ; devant : pierre grise, pointillés estompés
          'float lit = 1.0 - smoothstep(uDone - 0.05, uDone + 0.3, vAlong);',
          'diffuseColor.rgb *= mix(vec3(0.8, 0.82, 0.84), vec3(1.1, 0.98, 0.74), lit);',
          'float dash = smoothstep(0.38, 0.46, fract(vAlong * 1.6)) * (1.0 - smoothstep(0.88, 0.96, fract(vAlong * 1.6)));',
          'diffuseColor.a *= mix(0.62 * mix(0.35, 1.0, dash), 1.0, lit);'
        ].join('\n'))
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.16, 0.11, 0.03) * lit * diffuseColor.rgb;');
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
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(sx || 1, sy || 1, sz || 1));

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
  // Décors : arbres, rochers, colonnes, temple, fleurs, palmiers…
  // ------------------------------------------------------------------
  const PROP = {
    pin(m, rng) {
      const g = new THREE.Group();
      const s = 0.85 + rng() * 0.5;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.25, 5), m('#c4b39c'));
      t.position.y = 0.12;
      const a = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 16), m('#97b6a0'));
      a.position.y = 0.5;
      const b = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.48, 16), m('#a9c4ad'));
      b.position.y = 0.86;
      g.add(t, a, b);
      g.scale.setScalar(s);
      return g;
    },
    olivier(m, rng) {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.42, 5), m('#bfae96'));
      t.position.y = 0.21; t.rotation.z = (rng() - 0.5) * 0.3;
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 2), m('#b7c49a'));
      c.position.y = 0.6; c.scale.y = 0.75;
      g.add(t, c);
      g.scale.setScalar(0.8 + rng() * 0.5);
      return g;
    },
    buisson(m, rng) {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + rng() * 0.1, 2), m(k % 2 ? '#b5cdb0' : '#a6c2a6'));
        b.position.set((rng() - 0.5) * 0.3, 0.12, (rng() - 0.5) * 0.3);
        g.add(b);
      }
      return g;
    },
    rocher(m, rng) {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + rng() * 0.28, 1), m('#e4e1da'));
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
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.62, 8), m('#a3c09f'));
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

  // ------------------------------------------------------------------
  // Modèles 3D (CC0 : Kenney Nature Kit, Quaternius) chargés en arrière-plan.
  // Tant qu'ils ne sont pas là (ou si le chargement échoue, hors ligne…), le monde
  // procédural ci-dessus sert de décor. Une fois chargés, chaque île est redécorée :
  // tous ses modèles sont fusionnés en un seul maillage à couleurs de sommets
  // (un seul appel de dessin par île), avec le même ombrage « cartoon ».
  // ------------------------------------------------------------------
  const MODEL_DIR = 'assets/models/';
  const TEX_DIR = 'assets/textures/';
  const MK = 'megakit/';
  const MODELS = {
    man: 'hero.glb', boat: 'sailboat.glb', column: 'column.glb', columnRound: 'column_round.glb', arch: 'arch.glb',
    palmTall: 'nature/tree_palmDetailedTall.glb', palmBend: 'nature/tree_palmBend.glb',
    // Quaternius — Stylized Nature MegaKit (CC0), textures peintes à la main
    tree3: MK + 'CommonTree_3.glb', tree5: MK + 'CommonTree_5.glb', pine5: MK + 'Pine_5.glb',
    twisted: MK + 'TwistedTree_1.glb', bush: MK + 'Bush_Common.glb', bushFl: MK + 'Bush_Common_Flowers.glb',
    grassS: MK + 'Grass_Common_Short.glb', grassT: MK + 'Grass_Common_Tall.glb',
    flower3: MK + 'Flower_3_Group.glb', flower3s: MK + 'Flower_3_Single.glb',
    clover: MK + 'Clover_1.glb', plant1: MK + 'Plant_1.glb', plant7: MK + 'Plant_7_Big.glb', fern: MK + 'Fern_1.glb',
    rock1: MK + 'Rock_Medium_1.glb', rock2: MK + 'Rock_Medium_2.glb', rock3: MK + 'Rock_Medium_3.glb',
    peb1: MK + 'Pebble_Round_1.glb', peb2: MK + 'Pebble_Round_2.glb', peb3: MK + 'Pebble_Round_3.glb',
    pebS1: MK + 'Pebble_Square_1.glb', pebS2: MK + 'Pebble_Square_2.glb', pebS3: MK + 'Pebble_Square_3.glb', pebS4: MK + 'Pebble_Square_4.glb'
  };
  // matériaux texturés (par nom de matériau glTF) : image, découpe alpha, teinte (sRGB) × gain,
  // ombre portée (l'herbe et les fleurs n'en projettent pas : moins de travail pour le GPU)
  const TEX = {
    Bark_NormalTree: { file: 'bark.jpg', tint: '#c2cdc8', gain: 1.05 },
    Bark_TwistedTree: { file: 'bark_twisted.jpg', tint: '#e8dccb', gain: 1 },
    Leaves_NormalTree: { file: 'leaves_tree.png', alpha: true, tint: '#d8f0a8', gain: 1.25, fluffy: 0.75 },
    Leaves_Pine: { file: 'leaves_pine.png', alpha: true, tint: '#c4e2a2', gain: 1.6, fluffy: 0.6 },
    Leaves_TwistedTree: { file: 'leaves_twisted.png', alpha: true, tint: '#7fb062', gain: 0.9, fluffy: 0.75 }, // masque blanc : teinte libre
    Leaves: { file: 'leaves.png', alpha: true, tint: '#f2f8e6', gain: 1.05, noShadow: true },
    Flowers: { file: 'flowers.png', alpha: true, tint: '#ffffff', gain: 1.05, noShadow: true },
    Grass: { file: 'grass.png', alpha: true, tint: '#e6f2c8', gain: 1.1, noShadow: true },
    Rocks: { file: 'limestone.jpg', tint: '#fff8ee', gain: 1.25 }, // calcaire (dérivé de Rocks_Desert, désaturé)
    Rocks_desert: { file: 'rocks_desert.jpg', tint: '#ffffff', gain: 1.2 },
    PathRocks: { file: 'pathrocks.jpg', tint: '#fff8ee', gain: 1.1, noShadow: true }
  };
  // couleurs (par nom de matériau glTF) des modèles sans texture, dans la palette douce de l'archipel
  const MATCOL = {
    leafsGreen: '#93c27c', leafsDark: '#6f9f80', grass: '#a7cd88', woodBark: '#c09f80', woodBarkDark: '#a6876e',
    dirt: '#d9c5a7', stone: '#e5e1d8', _defaultMat: '#e5e1d8', Stone: '#e3ded4',
    colorPurple: '#c8b4ee', colorRed: '#f2a49c', colorYellow: '#f7d586',
    Marble: '#f4f0e8', Grey_Floor: '#f3efe7', DarkGrey_Floor: '#e6e0d5', HalloweenBits: '#efe9de',
    DarkWood: '#a07c5f', LightWood: '#dabf9c', Sail: '#fcf9f2', Steel: '#b9bdc0',
    // village grec (gabarits procéduraux) : chaux, volets bleus, tuiles, bois, terre cuite
    houseWhite: '#f7f4ee', houseShade: '#e9e4da', houseBlue: '#3d78b8', roofTerra: '#c8714c', domeBlue: '#2e6bb0',
    straw: '#cfb489', woodPier: '#a98563', terracotta: '#c8784c', drystone: '#ddd5c6', sailCloth: '#f8f4ea',
    hullWhite: '#f1ede4', hullBlue: '#3a6ea8', hullRed: '#b4493a', islet: '#d9d0c2', bandRed: '#c0473b'
  };
  const THEME_COL = {
    dunes: { grass: '#d3cd97', leafsGreen: '#a3c486', Grass: '#f0e6b0' },
    jardin: { Leaves_NormalTree: '#e2f5ae' }
  };
  // [modèles possibles, hauteur min/max, place libre autour, décor procédural de secours]
  // narrow : silhouette resserrée (cyprès) ; fit : la taille vaut pour la plus grande dimension
  const KINDS = {
    cypress: { m: ['pine5'], h: [1.6, 2.2], narrow: 0.42, room: 0.42, fb: 'pin' },
    pine: { m: ['pine5'], h: [1.2, 1.9], room: 0.7, fb: 'pin' },
    olive: { m: ['tree5', 'tree3'], h: [1.0, 1.35], room: 0.75, fb: 'olivier', col: { Leaves_NormalTree: '#c9d9a2' } },
    bigOlive: { m: ['twisted'], h: [1.5, 1.7], room: 1.1, fb: 'olivier', col: { Leaves_TwistedTree: '#a9bd86', Bark_TwistedTree: '#d9cfc0' } },
    tree: { m: ['tree3', 'tree5'], h: [1.3, 1.7], room: 0.75, fb: 'olivier' },
    bush: { m: ['bush', 'bushFl', 'bush'], h: [0.42, 0.62], room: 0.36, fb: 'buisson', fit: true },
    plant: { m: ['plant1', 'fern', 'plant7', 'clover'], h: [0.26, 0.4], room: 0.2, fb: 'touffe', fit: true },
    grass: { m: ['grassS', 'grassT', 'grassS'], h: [0.26, 0.4], room: 0.14, fb: 'touffe' },
    flower: { m: ['flower3', 'flower3s', 'flower3'], h: [0.28, 0.4], room: 0.16, fb: 'fleurs' },
    rock: { m: ['rock1', 'rock2', 'rock3'], h: [0.45, 0.8], room: 0.45, fb: 'rocher', fit: true },
    pebble: { m: ['peb1', 'peb2', 'peb3', 'pebS1', 'pebS2'], path: ['pebS1', 'pebS2', 'pebS3', 'pebS4'], h: [0.16, 0.26], room: 0.15, fb: null, fit: true },
    column: { m: ['column', 'columnRound'], h: [1.2, 1.45], room: 0.5, fb: 'colonne', broken: 0.55 },
    arch: { m: ['arch'], h: [1.5, 1.7], room: 1.1, fb: null },
    palm: { m: ['palmTall', 'palmBend'], h: [1.5, 2.0], room: 0.6, fb: 'palmier', keepXZ: true },
    temple: { m: [], room: 1.4, fb: 'temple' }
  };
  // composition des îles quand les modèles sont là : dense, luxuriante, mais légère pour un téléphone
  const SCENES_3D = {
    pinede: [['cypress', 5, 0.8], ['pine', 7, 0.9], ['rock', 5, 0.6], ['bush', 8, 0.55], ['plant', 8, 0.4], ['grass', 30, 0.35], ['flower', 10, 0.35], ['pebble', 8, 0.3]],
    ruines: [['temple', 1, 1.3], ['arch', 1, 1.0], ['bigOlive', 1, 1.0], ['column', 9, 0.7], ['olive', 5, 0.8], ['cypress', 5, 0.8], ['rock', 3, 0.6], ['bush', 8, 0.55],
      ['plant', 6, 0.4], ['grass', 30, 0.35], ['flower', 12, 0.35], ['pebble', 6, 0.3]],
    jardin: [['bigOlive', 1, 1.0], ['bush', 12, 0.55], ['olive', 3, 0.8], ['tree', 3, 0.8], ['cypress', 3, 0.8], ['flower', 26, 0.35], ['plant', 10, 0.4],
      ['grass', 20, 0.35], ['rock', 3, 0.6]],
    dunes: [['palm', 7, 0.8], ['rock', 9, 0.6], ['grass', 16, 0.4], ['column', 2, 0.7], ['plant', 4, 0.4], ['flower', 3, 0.4], ['pebble', 12, 0.3]]
  };
  const assets = { ready: false, status: 'none', tpl: {}, error: null, tex: {}, cliffTex: null };

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

  // matériau d'un lot pour une île (partagé, il s'estompe avec l'île dans la brume)
  function decorMaterial(ch, key) {
    ch.decorMats = ch.decorMats || {};
    if (ch.decorMats[key]) return ch.decorMats[key];
    const T = TEX[key];
    let mat;
    if (!T) mat = toonMat({ color: '#ffffff', vertexColors: true, transparent: true });
    else {
      mat = toonMat({ color: '#ffffff', vertexColors: true, transparent: true, map: assets.tex[T.file],
        alphaTest: T.alpha ? 0.42 : 0, side: T.alpha ? THREE.DoubleSide : THREE.FrontSide, roughness: T.alpha ? 0.8 : 0.92 });
      // cartes de feuilles : pas d'inversion de la normale au dos (les normales « duveteuses »
      // pointent déjà vers l'extérieur du houppier)
      if (T.alpha) mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('normal = normal * faceDirection;', ''); };
    }
    ch.decorMats[key] = mat;
    ch.fadeMats.push(mat);
    return mat;
  }

  // occlusion douce au pied des arbres et des rochers, sentier de terre battue
  function shadeGround(ch, placed) {
    const geo = ch.ground.geometry, P = geo.attributes.position, Cl = geo.attributes.color, base = geo.userData.base;
    if (!base) return;
    const dust = lin(THEMES[ch.c % THEMES.length] === 'dunes' ? '#e9d3a6' : '#dccfae');
    const blobs = placed.filter((p) => p.ao);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      let k = 1;
      for (let j = 0; j < blobs.length; j++) {
        const b = blobs[j], d2 = (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z);
        if (d2 < b.s * b.s * 9) k *= 1 - b.ao * Math.exp(-d2 / (2 * b.s * b.s));
      }
      const path = ch.pathPts ? 1 - smooth(0.12, 0.42, distToPath(ch, x, z)) : 0;
      const r = base[i * 3] + (dust.r - base[i * 3]) * path * 0.75;
      const g = base[i * 3 + 1] + (dust.g - base[i * 3 + 1]) * path * 0.75;
      const b = base[i * 3 + 2] + (dust.b - base[i * 3 + 2]) * path * 0.75;
      Cl.setXYZ(i, r * k, g * k, b * k);
    }
    Cl.needsUpdate = true;
  }

  // ------------------------------------------------------------------
  // Gabarits procéduraux du monde habité : maisons cubiques, chapelle à coupole, moulin,
  // phare, amphores, murets, îlots. Fusionnés dans le lot de chaque île (un appel de dessin).
  // ------------------------------------------------------------------
  const procTpl = {};
  function namedMat(name) { const m = new THREE.MeshBasicMaterial(); m.name = name; return m; }
  function buildProcTemplates() {
    if (procTpl.house) return;
    const T = (fill) => { const g = new THREE.Group(); fill(g, (geo, mat, x, y, z, ry) => { const m = new THREE.Mesh(geo, namedMat(mat)); m.position.set(x || 0, y || 0, z || 0); m.rotation.y = ry || 0; g.add(m); return m; }); return makeTemplate(g, { keepXZ: true }); };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    // maison cubique à toit plat, porte et volets bleus
    procTpl.house = T((g, a) => {
      a(box(1, 0.8, 0.9), 'houseWhite', 0, 0.4, 0);
      a(box(1.06, 0.06, 0.96), 'houseShade', 0, 0.83, 0);
      a(box(0.22, 0.4, 0.04), 'houseBlue', 0.18, 0.2, 0.46);
      a(box(0.16, 0.16, 0.04), 'houseBlue', -0.25, 0.5, 0.46);
      a(box(0.04, 0.16, 0.16), 'houseBlue', 0.51, 0.5, 0.1);
    });
    // maison à deux niveaux (terrasse)
    procTpl.house2 = T((g, a) => {
      a(box(1, 0.7, 0.9), 'houseWhite', 0, 0.35, 0);
      a(box(0.55, 0.5, 0.6), 'houseWhite', -0.2, 0.95, -0.12);
      a(box(1.04, 0.05, 0.94), 'houseShade', 0, 0.72, 0);
      a(box(0.2, 0.36, 0.04), 'houseBlue', 0.25, 0.18, 0.46);
      a(box(0.14, 0.14, 0.04), 'houseBlue', -0.2, 1.0, 0.19);
      a(box(0.14, 0.14, 0.04), 'houseBlue', -0.2, 0.45, 0.46);
    });
    // maison à toit de tuiles
    procTpl.houseTile = T((g, a) => {
      a(box(1, 0.7, 0.8), 'houseWhite', 0, 0.35, 0);
      const roof = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 3); roof.rotateZ(Math.PI / 2); roof.scale(1, 0.62, 1.05);
      a(roof, 'roofTerra', 0, 0.84, 0);
      a(box(0.2, 0.36, 0.04), 'houseBlue', 0, 0.18, 0.41);
    });
    // chapelle à coupole bleue
    procTpl.chapel = T((g, a) => {
      a(box(0.9, 0.75, 0.9), 'houseWhite', 0, 0.375, 0);
      a(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 18), 'houseWhite', 0, 0.83, 0);
      a(new THREE.SphereGeometry(0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'domeBlue', 0, 0.9, 0);
      a(box(0.04, 0.2, 0.04), 'houseShade', 0, 1.33, 0);
      a(box(0.14, 0.04, 0.04), 'houseShade', 0, 1.36, 0);
      a(box(0.22, 0.38, 0.04), 'houseBlue', 0, 0.19, 0.46);
    });
    // tour du moulin (les ailes tournent à part)
    procTpl.mill = T((g, a) => {
      a(new THREE.CylinderGeometry(0.34, 0.42, 1.2, 16), 'houseWhite', 0, 0.6, 0);
      a(new THREE.ConeGeometry(0.42, 0.42, 16), 'straw', 0, 1.4, 0);
      a(box(0.2, 0.34, 0.04), 'houseBlue', 0, 0.17, 0.4);
    });
    // phare : tour fuselée à bande, lanterne
    procTpl.lighthouse = T((g, a) => {
      a(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 16), 'houseWhite', 0, 0.8, 0);
      a(new THREE.CylinderGeometry(0.245, 0.27, 0.22, 16), 'bandRed', 0, 0.95, 0);
      a(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), 'houseShade', 0, 1.62, 0);
      a(new THREE.CylinderGeometry(0.17, 0.17, 0.24, 12), 'sailCloth', 0, 1.77, 0);
      a(new THREE.ConeGeometry(0.22, 0.2, 12), 'domeBlue', 0, 1.99, 0);
    });
    // amphore de terre cuite
    procTpl.amphora = T((g, a) => {
      const prof = [[0.0, 0], [0.12, 0.02], [0.3, 0.25], [0.32, 0.5], [0.22, 0.78], [0.1, 0.9], [0.1, 1.0], [0.14, 1.04]].map(([r, y]) => new THREE.Vector2(r, y));
      a(new THREE.LatheGeometry(prof, 12), 'terracotta');
    });
    // muret de pierres sèches
    procTpl.wall = T((g, a) => {
      const r = C.makeRng('muret');
      for (let k = 0; k < 7; k++) for (let j = 0; j < 2; j++) {
        a(box(0.3 + r() * 0.12, 0.17, 0.26), 'drystone', -0.95 + k * 0.32 + j * 0.14, 0.09 + j * 0.17, (r() - 0.5) * 0.04, (r() - 0.5) * 0.15);
      }
    });
    // ponton du port : planches sur pieux
    procTpl.jetty = T((g, a) => {
      for (let k = 0; k < 9; k++) a(box(0.55, 0.05, 0.17), 'woodPier', 0, 0.62, k * 0.2);
      for (let k = 0; k < 3; k++) [-0.3, 0.3].forEach((x) => a(new THREE.CylinderGeometry(0.04, 0.045, 0.75, 6), 'DarkWood', x, 0.3, k * 0.8));
    });
    // îlot rocheux (parfois coiffé d'une maison)
    procTpl.islet = T((g, a) => {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const p = geo.attributes.position, r = C.makeRng('ilot');
      for (let i = 0; i < p.count; i++) { const f = 0.85 + r() * 0.3; p.setXYZ(i, p.getX(i) * f, Math.max(-0.2, p.getY(i)) * 0.45 * f, p.getZ(i) * f); }
      geo.computeVertexNormals();
      a(geo, 'islet', 0, 0.09, 0);
    });
    procTpl.buoy = T((g, a) => {
      a(new THREE.SphereGeometry(0.5, 10, 8), 'bandRed', 0, 0.5, 0);
      a(new THREE.CylinderGeometry(0.08, 0.08, 0.6, 6), 'houseWhite', 0, 1.1, 0);
    });
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

  // Village, moulin, phare et port d'une île ; îlots au large. (Les objets animés — ailes du
  // moulin, barques amarrées, feu du phare — sont gardés dans ch.life pour la boucle.)
  function settle(ch, batch, placed, rng) {
    buildProcTemplates();
    const R = ch.r, theme = THEMES[ch.c % THEMES.length];
    const free = (x, z, room, clear) => distToPath(ch, x, z) > clear && ch.gateLocal.distanceTo(new THREE.Vector3(x, 0, z)) > 1.3 &&
      !placed.some((p) => Math.hypot(p.x - x, p.z - z) < Math.max(room, p.room));
    const put = (tpl, x, z, h, rot, room, ao, sink) => {
      batch.add(tpl, x, heightLocal(ch, x, z) - (sink == null ? 0.03 : sink), z, rot, h, h, null, null);
      placed.push({ x, z, room, ao: ao || 0.2, s: room * 0.7 });
    };
    ch.life = { sails: null, boats: [], lamp: null };
    // le village : 4 à 7 maisons serrées autour d'une placette, portes vers le centre de l'île
    let vc = null;
    for (let t = 0; t < 60 && !vc; t++) {
      const a = rng() * Math.PI * 2, d = R * (0.4 + rng() * 0.32);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (free(x, z, 1.2, 1.25)) vc = { x, z };
    }
    if (vc) {
      const kinds = theme === 'dunes' ? ['house', 'house', 'house2', 'chapel'] : ['house', 'house2', 'houseTile', 'house', 'chapel', 'houseTile'];
      const n = 4 + Math.floor(rng() * 4);
      let chapel = false;
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < 25; t++) {
          const a = rng() * Math.PI * 2, d = 0.25 + rng() * 0.95;
          const x = vc.x + Math.cos(a) * d, z = vc.z + Math.sin(a) * d;
          if (Math.hypot(x, z) > R * 0.84 || !free(x, z, 0.42, 0.62)) continue;
          let kind = kinds[Math.floor(rng() * kinds.length)];
          if (kind === 'chapel') { if (chapel) kind = 'house'; chapel = true; }
          const h = kind === 'chapel' ? 0.62 : 0.4 + rng() * 0.14;
          // les maisons regardent vers la placette (axes « carrés » : rues étroites)
          const rot = Math.round((Math.atan2(vc.x - x, vc.z - z)) / (Math.PI / 2)) * (Math.PI / 2) + (rng() - 0.5) * 0.12;
          put(procTpl[kind], x, z, h, rot, 0.45, 0.22, 0.03);
          break;
        }
      }
      // amphores et muret au bord de la placette
      for (let k = 0; k < 3; k++) {
        const a = rng() * Math.PI * 2, x = vc.x + Math.cos(a) * 0.35, z = vc.z + Math.sin(a) * 0.35;
        if (free(x, z, 0.12, 0.5)) put(procTpl.amphora, x, z, 0.16 + rng() * 0.05, rng() * 6, 0.12, 0.1, 0.01);
      }
    }
    // moulin à vent sur une hauteur (îles herbeuses)
    if (theme === 'pinede' || theme === 'jardin' || theme === 'ruines') {
      for (let t = 0; t < 50; t++) {
        const a = rng() * Math.PI * 2, d = R * (0.2 + rng() * 0.55);
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (!free(x, z, 0.7, 1.0)) continue;
        put(procTpl.mill, x, z, 1.05, rng() * 6, 0.6, 0.25, 0.04);
        // ailes : quatre voiles triangulaires sur un moyeu
        const parts = [];
        for (let k = 0; k < 4; k++) {
          const ang = k * Math.PI / 2;
          parts.push({ geo: new THREE.BoxGeometry(0.03, 0.62, 0.02), color: '#8a6a4c', m: M4(0, 0, 0, 0, 1, 1, 1, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeTranslation(0, 0.31, 0)) });
          parts.push({ geo: new THREE.BoxGeometry(0.2, 0.5, 0.01), color: '#f4efe2', m: new THREE.Matrix4().makeRotationZ(ang).multiply(new THREE.Matrix4().makeTranslation(0.11, 0.36, 0)) });
        }
        const sails = new THREE.Mesh(mergeParts(parts), toonMat({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
        const hub = new THREE.Group();
        hub.position.set(x, heightLocal(ch, x, z) + 1.05 * 0.7, z);
        hub.rotation.y = Math.atan2(-x, -z) + Math.PI; // face au large
        sails.position.z = 0.28;
        sails.scale.setScalar(0.72);
        sails.castShadow = true;
        hub.add(sails);
        ch.decor.add(hub);
        ch.fadeMats.push(sails.material);
        ch.life.sails = sails;
        break;
      }
    }
    // le port : un ponton vers le large, deux barques amarrées, une bouée
    const pa = Math.atan2(ch.path.samp[0].z, ch.path.samp[0].x), pb = Math.atan2(ch.path.samp[ch.path.samp.length - 1].z, ch.path.samp[ch.path.samp.length - 1].x);
    let best = 0, bd = -1;
    for (let k = 0; k < 24; k++) { // l'angle le plus éloigné des deux bouts du sentier
      const a = (k / 24) * Math.PI * 2;
      const d = Math.min(Math.abs(Math.atan2(Math.sin(a - pa), Math.cos(a - pa))), Math.abs(Math.atan2(Math.sin(a - pb), Math.cos(a - pb))));
      if (d > bd) { bd = d; best = a; }
    }
    const ox = Math.cos(best), oz = Math.sin(best);
    const jx = ox * R * 0.93, jz = oz * R * 0.93;
    batch.add(procTpl.jetty, jx, -0.42, jz, Math.atan2(ox, oz), 0.95, 0.95, null, null);
    ch.harbor = { x: ox * R * 1.35, z: oz * R * 1.35, a: best };
    [[0.55, 1.1], [-0.6, 1.45]].forEach(([side, dist], i) => {
      const b = fishingBoat(i ? '#b4493a' : '#3a6ea8');
      const tx = -oz, tz = ox;
      b.position.set(ox * R * dist + tx * side, 0, oz * R * dist + tz * side);
      b.rotation.y = Math.atan2(ox, oz) + (i ? 0.25 : -0.2);
      b.userData.base = b.rotation.y;
      b.userData.phase = rng() * 6;
      ch.decor.add(b);
      ch.life.boats.push(b);
    });
    batch.add(procTpl.buoy, ox * R * 1.7 - oz * 0.9, -0.02, oz * R * 1.7 + ox * 0.9, 0, 0.16, 0.16, null, null);
    // phare au bout de l'île, une île sur deux
    if (ch.c % 2 === 1) {
      const a = best + Math.PI * 0.55;
      const x = Math.cos(a) * R * 0.86, z = Math.sin(a) * R * 0.86;
      if (free(x, z, 0.5, 0.7)) {
        put(procTpl.lighthouse, x, z, 1.5, 0, 0.5, 0.2, 0.02);
        const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe3a0', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
        lamp.position.set(x, heightLocal(ch, x, z) + 1.5 * 0.88, z);
        lamp.scale.set(1.4, 1.4, 1);
        ch.decor.add(lamp);
        ch.life.lamp = lamp;
      }
    }
    // îlots et rochers au large (loin des traversées)
    const avoid = [pa, pb];
    for (let k = 0, made = 0; k < 30 && made < 6; k++) {
      const a = rng() * Math.PI * 2;
      if (avoid.some((v) => Math.abs(Math.atan2(Math.sin(a - v), Math.cos(a - v))) < 0.7)) continue;
      const d = R * (1.55 + rng() * 1.3);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const big = made < 2;
      const s = big ? 0.9 + rng() * 0.6 : 0.25 + rng() * 0.3;
      batch.add(procTpl.islet, x, -0.12, z, rng() * 6, s, s * (big ? 1.4 : 1.1), null, null);
      if (big) { // un îlot habité : une maison, un cyprès
        batch.add(procTpl.house, x + 0.1, -0.12 + s * 1.4 * 0.82, z, rng() * 6, 0.32, 0.32, null, null);
        const cy = KINDS.cypress.m.map((m) => assets.tpl[m]).filter(Boolean)[0];
        if (cy) batch.add(cy, x - s * 0.3, -0.12 + s * 1.4 * 0.7, z + s * 0.2, 0, 0.8 * 0.42, 0.8, null, rng);
      }
      made++;
    }
  }

  // bordures du sentier : galets clairs, touffes, fleurs ; parfois une amphore ou un muret
  function pathBorder(ch, batch, rng) {
    buildProcTemplates();
    const S = ch.path.samp, cum = ch.path.cum;
    const peb = KINDS.pebble.path.map((k) => assets.tpl[k]).filter(Boolean);
    const grass = ['grassS', 'grassT'].map((k) => assets.tpl[k]).filter(Boolean);
    const flow = ['flower3s', 'flower3'].map((k) => assets.tpl[k]).filter(Boolean);
    const nodes = ch.nodes.map((n) => n.local);
    let next = 0.3, wallAt = 2 + rng() * 2;
    for (let i = 1; i < S.length - 1; i++) {
      if (cum[i] < next) continue;
      next = cum[i] + 0.3 + rng() * 0.18;
      const a = S[i - 1], b = S[i + 1];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const sg = rng() < 0.5 ? 1 : -1;
      const off = PATH_W + 0.06 + rng() * 0.14;
      const x = S[i].x + nx * off * sg, z = S[i].z + nz * off * sg;
      if (Math.hypot(x, z) > ch.r * 0.92) continue;
      if (nodes.some((p) => Math.hypot(p.x - x, p.z - z) < 0.5)) continue;
      const y = heightLocal(ch, x, z);
      const r = rng();
      if (cum[i] > wallAt && Math.hypot(S[i].x - ch.gateLocal.x, S[i].z - ch.gateLocal.z) > 1.2) { // muret ou amphores
        wallAt = cum[i] + 2.5 + rng() * 2.5;
        const w = PATH_W + 0.38;
        const wx = S[i].x + nx * w * sg, wz = S[i].z + nz * w * sg;
        if (nodes.some((p) => Math.hypot(p.x - wx, p.z - wz) < 0.8)) continue;
        if (rng() < 0.55) batch.add(procTpl.wall, wx, heightLocal(ch, wx, wz) - 0.03, wz, Math.atan2(tx, tz) + Math.PI / 2, 0.36, 0.3, null, null);
        else {
          batch.add(procTpl.amphora, wx, heightLocal(ch, wx, wz) - 0.01, wz, rng() * 6, 0.2, 0.2, null, null);
          batch.add(procTpl.amphora, wx + tx / tl * 0.14, heightLocal(ch, wx, wz) - 0.01, wz + tz / tl * 0.14, rng() * 6, 0.15, 0.15, null, null);
        }
        continue;
      }
      if (r < 0.42 && peb.length) {
        const tpl = peb[Math.floor(rng() * peb.length)];
        const s = (0.13 + rng() * 0.08) / Math.max(1, tpl.w, tpl.d);
        batch.add(tpl, x, y - 0.02, z, rng() * 6.28, s, s * 0.7, null, rng);
      } else if (r < 0.75 && grass.length) {
        const tpl = grass[Math.floor(rng() * grass.length)];
        batch.add(tpl, x, y - 0.01, z, rng() * 6.28, 0.22 + rng() * 0.1, 0.22 + rng() * 0.1, null, rng);
      } else if (flow.length) {
        const tpl = flow[Math.floor(rng() * flow.length)];
        batch.add(tpl, x, y - 0.01, z, rng() * 6.28, 0.24 + rng() * 0.08, 0.24 + rng() * 0.08, null, rng);
      }
    }
  }

  function decorate(ch, m) {
    const placed = [];
    const theme = THEMES[ch.c % THEMES.length];
    const variant = theme === 'dunes' ? 'desert' : null;
    const rng = C.makeRng('decor:' + ch.c);
    const decor = new THREE.Group();
    ch.decor = decor;
    ch.group.add(decor);
    const batch = assets.ready ? newBatch() : null;
    const themeCol = THEME_COL[theme] || {};
    if (batch) { try { settle(ch, batch, placed, rng); } catch (e) { console.warn('[world] village', e); } }
    (batch ? SCENES_3D : SCENES)[theme].forEach(([type, count, clear]) => {
      const kind = batch ? KINDS[type] : null;
      const tpls = kind ? kind.m.map((k) => assets.tpl[k]).filter(Boolean) : [];
      const proc = kind ? kind.fb : type;
      if (!tpls.length && !proc) return;
      const big = proc === 'temple' && !tpls.length;
      const room = kind ? kind.room : type === 'temple' ? 1.4 : type === 'touffe' || type === 'fleurs' ? 0.3 : 0.55;
      const over = kind && Object.assign({}, themeCol, kind.col || {});
      // occlusion au sol : [force, rayon] selon la taille de l'objet
      const ao = /^(cypress|pine|olive|bigOlive|tree|palm|pin|olivier|palmier)$/.test(type) ? [0.32, 0.42]
        : /^(rock|rocher|bush|buisson|column|colonne|arch|temple)$/.test(type) ? [0.22, 0.3] : null;
      for (let k = 0; k < count; k++) {
        for (let tries = 0; tries < 40; tries++) {
          const a = rng() * Math.PI * 2;
          const d = Math.sqrt(rng()) * ch.r * (big ? 0.55 : 0.86);
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          if (distToPath(ch, x, z) < clear) continue;
          if (ch.gateLocal.distanceTo(new THREE.Vector3(x, 0, z)) < 1.2) continue;
          if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < Math.max(room, p.room))) continue;
          const y = heightLocal(ch, x, z) - 0.02;
          if (tpls.length) {
            const tpl = tpls[Math.floor(rng() * tpls.length)];
            // (h = hauteur ; pour les « fit », plus grande dimension : un rocher plat reste petit)
            const h = (kind.h[0] + rng() * (kind.h[1] - kind.h[0])) / (kind.fit ? Math.max(1, tpl.w, tpl.d) : 1);
            const sy = kind.broken && rng() < kind.broken ? h * (0.22 + rng() * 0.35) : h; // colonnes brisées
            const sink = kind.fit ? 0.03 : 0.01; // rochers et buissons un peu enfoncés dans le sol
            const wj = kind.fit ? 1 : 0.86 + rng() * 0.28; // silhouettes variées
            batch.add(tpl, x, y - sink, z, rng() * Math.PI * 2, h * (kind.narrow || 1) * wj, sy, over, rng, variant);
          } else {
            const obj = PROP[proc](m, rng);
            obj.position.set(x, y, z);
            obj.rotation.y = rng() * Math.PI * 2;
            obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
            decor.add(obj);
          }
          placed.push({ x, z, room: room * 0.6, ao: ao && ao[0], s: ao && ao[1] });
          break;
        }
      }
    });
    if (batch) pathBorder(ch, batch, rng);
    if (batch && batch.count()) decor.add(batch.build((key) => decorMaterial(ch, key)));
    shadeGround(ch, placed);
    // des moutons sur les îles herbeuses
    if (theme !== 'dunes' && !ch.sheep.length) {
      for (let k = 0; k < 3; k++) ch.sheep.push(makeSheep(ch, m));
    }
  }

  function redecorate(ch) {
    if (ch.decor) {
      ch.group.remove(ch.decor);
      ch.decor.traverse((o) => { if (o.isMesh && !o.userData.keepGeo) o.geometry.dispose(); });
    }
    decorate(ch, ch.m);
  }

  function loadAssets() {
    if (!THREE.GLTFLoader) { assets.status = 'no-loader'; return; }
    assets.status = 'loading';
    const loader = new THREE.GLTFLoader();
    const texLoader = new THREE.TextureLoader();
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
    const loadTex = (file) => new Promise((resolve) => {
      const path = TEX_DIR + file;
      try {
        texLoader.load(embedded[path] || path, (t) => {
          t.encoding = THREE.sRGBEncoding;
          t.flipY = false; // UV glTF
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          resolve([file, t]);
        }, undefined, () => { console.warn('[world] texture indisponible', path); resolve([file, null]); });
      } catch (e) { resolve([file, null]); }
    });
    const files = [...new Set(Object.values(TEX).map((T) => T.file))];
    Promise.all([Promise.all(Object.keys(MODELS).map(load)), Promise.all(files.map(loadTex))]).then(([list, texs]) => {
      texs.forEach(([f, t]) => { if (t) assets.tex[f] = t; });
      if (assets.tex['limestone.jpg']) { // falaises de calcaire peint
        const t = assets.tex['limestone.jpg'].clone();
        t.needsUpdate = true;
        t.flipY = true;
        t.repeat.set(7, 1.3);
        assets.cliffTex = t;
        chapters.forEach((ch) => { if (ch) dressCliff(ch); });
      }
      const got = {};
      list.forEach(([k, g]) => { if (g) got[k] = g; });
      // décor
      Object.keys(got).forEach((k) => {
        if (k === 'man' || k === 'boat') return;
        try {
          const kind = Object.values(KINDS).find((K) => K.m.indexOf(k) >= 0);
          assets.tpl[k] = makeTemplate(got[k].scene, { keepXZ: kind && kind.keepXZ });
        } catch (e) { console.warn('[world] gabarit', k, e); }
      });
      if (Object.keys(assets.tpl).length) {
        assets.ready = true;
        chapters.forEach((ch) => { if (ch) { try { redecorate(ch); } catch (e) { console.warn('[world] décor', e); } } });
      }
      if (got.boat) { try { upgradeBoat(got.boat); } catch (e) { console.warn('[world] voilier', e); } }
      if (got.man) { try { upgradeHero(got.man); } catch (e) { console.warn('[world] Ulysse', e); assets.error = String(e); } }
      assets.status = Object.keys(got).length ? 'ok:' + Object.keys(got).length + '/' + Object.keys(MODELS).length +
        ' tex:' + Object.keys(assets.tex).length + '/' + files.length : 'fallback';
      if (World.ok && !running) renderFrame(); // une image à jour même si la boucle est en pause
    }).catch((e) => { assets.status = 'error'; assets.error = String(e); console.warn('[world] modèles', e); });
  }

  function dressCliff(ch) {
    if (!assets.cliffTex || !ch.cliffMat || ch.cliffMat.map === assets.cliffTex) return;
    ch.cliffMat.map = assets.cliffTex;
    setLin(ch.cliffMat.color, THEMES[ch.c % THEMES.length] === 'dunes' ? '#f3dcb8' : '#f4ece0').multiplyScalar(1.35); // calcaire clair
    ch.cliffMat.needsUpdate = true;
  }

  // Ciel HDRI (Poly Haven, CC0) : éclairage d'ambiance et reflets doux, préfiltrés (PMREM)
  function loadEnvironment() {
    if (!THREE.RGBELoader || !THREE.PMREMGenerator) return;
    const path = TEX_DIR + 'sky.hdr';
    const src = (window.ODY_ASSETS || {})[path] || path;
    try {
      new THREE.RGBELoader().setDataType(THREE.UnsignedByteType).load(src, (hdr) => {
        try {
          const pm = new THREE.PMREMGenerator(renderer);
          pm.compileEquirectangularShader();
          envMap = pm.fromEquirectangular(hdr).texture;
          hdr.dispose(); pm.dispose();
          scene.environment = envMap;
          applyLight();
          if (World.ok && !running) renderFrame();
        } catch (e) { console.warn('[world] environnement', e); }
      }, undefined, () => console.warn('[world] ciel HDRI indisponible'));
    } catch (e) { console.warn('[world] environnement', e); }
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

  function makeSheep(ch, m) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 2), m('#fbfaf6'));
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
  // Pierres de niveau : géométries partagées (pierre, boss, anneaux d'or, couronne de laurier)
  // ------------------------------------------------------------------
  let STONE_GEO = null, BOSS_RING_MAT = null, LAUREL_MAT = null, CUR_RING = null;
  function makeShared() {
    if (STONE_GEO) return;
    const laurel = (R) => {
      const parts = [];
      const leaf = new THREE.SphereGeometry(1, 6, 4);
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        parts.push({ geo: leaf, color: k % 4 === 0 ? '#e3b54f' : k % 2 ? '#6f9a45' : '#86ad55',
          m: M4(Math.cos(a) * R, 0.02 + (k % 2) * 0.01, Math.sin(a) * R, -a + Math.PI / 2, 0.07, 0.022, 0.035, 0.0, k % 2 ? 0.5 : -0.5) });
      }
      return mergeParts(parts);
    };
    const ring = (r) => { const g = new THREE.TorusGeometry(r, 0.022, 6, 48); g.rotateX(Math.PI / 2); return g; };
    const rings = new THREE.BufferGeometry();
    {
      const a = ring(0.6), b = ring(0.7);
      const pos = [...a.toNonIndexed().attributes.position.array, ...b.toNonIndexed().attributes.position.array];
      const nor = [...a.toNonIndexed().attributes.normal.array, ...b.toNonIndexed().attributes.normal.array];
      rings.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      rings.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    }
    STONE_GEO = {
      normal: new THREE.CylinderGeometry(0.3, 0.34, 0.12, 28),
      boss: new THREE.CylinderGeometry(0.46, 0.52, 0.16, 32),
      bossRings: rings,
      laurel: laurel(0.42), laurelBoss: laurel(0.6)
    };
    BOSS_RING_MAT = toonMat({ color: '#e0b24e', roughness: 0.35, metalness: 0.7, emissive: lin('#6b4a10'), transparent: true });
    LAUREL_MAT = toonMat({ color: '#ffffff', vertexColors: true, roughness: 0.6 });
    // anneau fixe du niveau en cours (en plus de l'onde qui pulse)
    CUR_RING = new THREE.Mesh(new THREE.RingGeometry(0.41, 0.47, 48),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    CUR_RING.rotation.x = -Math.PI / 2;
    scene.add(CUR_RING);
  }
  // île à l'horizon : un relief doux et quelques maisons blanches (couleurs de sommets × brume)
  function horizonIsland(rng) {
    const parts = [];
    const hill = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push({ geo: hill, color: '#c8c8c8', m: M4(0, 0, 0, 0, 9 + rng() * 4, 3.5 + rng() * 3, 6 + rng() * 2) });
    parts.push({ geo: hill, color: '#bdbdbd', m: M4(5 + rng() * 3, 0, 2, 0, 5, 2 + rng() * 1.5, 4) });
    const cube = new THREE.BoxGeometry(1, 1, 1);
    for (let k = 0; k < 9; k++) {
      const x = (rng() - 0.5) * 9, z = 3 + rng() * 2.5;
      const y = Math.max(0, 3.2 * Math.sqrt(Math.max(0, 1 - (x * x) / 81 - (z * z) / 49)));
      parts.push({ geo: cube, color: '#ffffff', m: M4(x, y + 0.2, z, rng(), 0.6 + rng() * 0.5, 0.5 + rng() * 0.3, 0.6) });
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

    const ch = { c, group, r, rng, accent, fadeMats, m, sheep: [], flowers: {}, fade: 0.2, phase: rng() * 6.28, open: 0 };
    // collines
    const theme = THEMES[c % THEMES.length];
    ch.hills = [];
    const nh = theme === 'dunes' ? 5 : 3 + Math.floor(rng() * 2);
    for (let k = 0; k < nh; k++) {
      const a = rng() * Math.PI * 2, d = rng() * r * 0.5;
      ch.hills.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, a: (theme === 'dunes' ? 0.35 : 0.5) + rng() * 0.7, s: 0.9 + rng() * 0.9 });
    }

    const dunes = theme === 'dunes';
    const colors = {
      low: dunes ? lin('#e3c58f') : lin('#8cc06a').lerp(lin(accent), 0.05),
      high: dunes ? lin('#efd9ab') : lin('#b3d37a'),
      fresh: dunes ? lin('#dcc890') : lin('#70b35e'),
      dry: dunes ? lin('#f0dcb0') : lin('#c6cf78'),
      sand: lin('#efe2c6')
    };
    const groundMat = toonMat({ vertexColors: true, transparent: true, map: texture(theme === 'dunes' ? 'sable' : 'herbe', 1) });
    fadeMats.push(groundMat);
    const ground = new THREE.Mesh(terrain(ch, colors), groundMat);
    ground.receiveShadow = true;
    ground.castShadow = true;
    ground.userData.ground = c;
    group.add(ground);
    ch.ground = ground;

    // falaises jusqu'à la mer
    const cliffGeo = new THREE.CylinderGeometry(r, r * 1.05, 2.6, 56, 3, true); // falaise légèrement évasée : elle prend la lumière
    const cp = cliffGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      if (cp.getY(i) < 1.29) { cp.setX(i, cp.getX(i) + (rng() - 0.5) * 0.12); cp.setZ(i, cp.getZ(i) + (rng() - 0.5) * 0.12); }
    }
    cliffGeo.computeVertexNormals();
    const cliffMat = lambert('#ece6db', { transparent: true, map: texture('roche', 1, 6, 1.4) });
    fadeMats.push(cliffMat);
    ch.cliffMat = cliffMat;
    dressCliff(ch);
    const cliff = new THREE.Mesh(cliffGeo, cliffMat);
    cliff.position.y = TOP - 1.3;
    cliff.receiveShadow = true;
    group.add(cliff);

    // plage claire au pied des falaises
    const beachMat = toonMat({ color: '#f1e7d2', transparent: true, map: texture('sable', 1, 10, 3) });
    fadeMats.push(beachMat);
    const beach = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r * 1.17, 56), beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.04;
    group.add(beach);

    // sentier : une seule route, de la plage d'arrivée au portique de sortie
    const entry = entryOf(c).sub(ctr), exit = exitOf(c).sub(ctr);
    layoutPath(ch, entry, exit);
    ch.gateLocal = pathAt(ch, GATE_F);
    ch.nodes = [];
    for (let k = 0; k < PER; k++) {
      const p = pathAt(ch, levelF(k));
      const boss = k === PER - 1;
      const mesh = new THREE.Mesh(boss ? STONE_GEO.boss : STONE_GEO.normal,
        toonMat({ color: '#b9b6ae', transparent: true, map: texture('pierre', 1), roughness: 0.75 }));
      mesh.position.set(p.x, heightLocal(ch, p.x, p.z) + 0.04, p.z);
      mesh.receiveShadow = mesh.castShadow = true;
      mesh.userData.level = c * PER + k;
      group.add(mesh);
      const n = { mesh, local: p, boss };
      if (boss) { // double anneau d'or : le boss se repère de loin
        n.rings = new THREE.Mesh(STONE_GEO.bossRings, BOSS_RING_MAT);
        n.rings.position.copy(mesh.position).add(new THREE.Vector3(0, 0.05, 0));
        group.add(n.rings);
      }
      ch.nodes.push(n);
    }
    pathRibbon(ch);

    // le portique du boss, en travers du sentier
    const gate = new THREE.Group();
    gate.position.set(ch.gateLocal.x, heightLocal(ch, ch.gateLocal.x, ch.gateLocal.z) - 0.02, ch.gateLocal.z);
    const ahead = pathAt(ch, 1);
    gate.lookAt(ahead.x, gate.position.y, ahead.z);
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
      new THREE.MeshBasicMaterial({ color: lin('#e3b54f'), transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    veil.position.y = 0.95;
    [lintel, pediment].forEach((o) => { o.castShadow = true; });
    gate.add(lintel, pediment, veil);
    group.add(gate);
    Object.assign(ch, { gate, veil, lintelMat });

    decorate(ch, m);

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

  // niveau réussi : couronne de laurier autour de la pierre dorée (elle pousse quand on vient de gagner)
  function bloom(ch, k, animate) {
    const n = ch.nodes[k];
    const g = new THREE.Mesh(n.boss ? STONE_GEO.laurelBoss : STONE_GEO.laurel, LAUREL_MAT);
    g.position.set(n.local.x, heightLocal(ch, n.local.x, n.local.z) + 0.07, n.local.z);
    g.castShadow = true;
    if (animate) { g.scale.setScalar(0.01); g.userData.grow = true; }
    ch.group.add(g);
    ch.flowers[k] = g;
  }

  // Code couleur unique et lisible : fait = pierre dorée qui luit + laurier ; en cours = pierre
  // blanche + anneau à la couleur du jeu ; à venir = pierre grise estompée. Boss : grande pierre,
  // double anneau d'or.
  function refresh(animate) {
    ensureChapters();
    pathU.target = done;
    chapters.forEach((ch) => {
      if (!ch) return;
      ch.nodes.forEach((n, k) => {
        const L = ch.c * PER + k;
        const mat = n.mesh.material;
        if (L < done) {
          setLin(mat.color, '#f3c75e'); mat.emissive.copy(lin('#c98a1c')).multiplyScalar(0.5);
          mat.roughness = 0.45; mat.metalness = 0.2; n.mesh.userData.alpha = 1;
          if (!ch.flowers[k]) bloom(ch, k, animate);
        } else if (L === done) {
          setLin(mat.color, '#ffffff'); mat.emissive.setRGB(0.06, 0.06, 0.06); mat.roughness = 0.6; mat.metalness = 0; n.mesh.userData.alpha = 1;
        } else {
          setLin(mat.color, '#a9a7a1'); mat.emissive.setRGB(0, 0, 0); mat.roughness = 0.85; mat.metalness = 0; n.mesh.userData.alpha = 0.78;
        }
        if (n.rings) n.rings.userData.alpha = L <= done ? 1 : 0.45;
      });
      const beaten = done > ch.c * PER + PER - 1;
      if (beaten && !ch.opened) {
        ch.opened = true;
        setLin(ch.lintelMat.color, '#f0d58c');
        ch.stones.forEach((s, i) => { s.userData.delay = animate ? 1.0 + i * 0.16 : 0; if (!animate) s.userData.raise = 1; });
      }
    });
  }

  function nodePos(L) {
    const ch = chapters[chapterOf(L)];
    const n = ch.nodes[L % PER];
    return new THREE.Vector3(ch.group.position.x + n.local.x, ch.group.position.y + heightLocal(ch, n.local.x, n.local.z) + (n.boss ? 0.12 : 0.1),
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

  // Ulysse animé : base « Universal Base Characters » + tenue « Modular Character Outfits »
  // + animations « Universal Animation Library » (Quaternius, CC0), assemblés dans hero.glb.
  // Les pièces grecques (cuirasse, jupe, casque, couronne, armes, bouclier) sont construites
  // ici et accrochées aux os ; setSkin() ne fait que montrer/cacher et recolorer.
  function upgradeHero(gltf) {
    const src = gltf.scene;
    const clips = gltf.animations || [];
    const clip = (n) => clips.find((c) => c.name === n || c.name.endsWith('|' + n));
    if (!clip('Idle') || !clip('Run')) throw new Error('animations manquantes');
    const B = {};
    ['Head', 'neck_01', 'spine_03', 'spine_02', 'pelvis', 'upperarm_l', 'lowerarm_l', 'hand_l', 'middle_01_l', 'upperarm_r', 'lowerarm_r',
      'hand_r', 'middle_01_r', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'].forEach((n) => {
      B[n] = src.getObjectByName(n);
      if (!B[n]) throw new Error('os manquant ' + n);
    });

    const rig = new THREE.Group();
    rig.add(src);
    src.updateMatrixWorld(true);
    // taille : 1,2 unité (un peu plus grand que l'ancien modèle, pour rester lisible de loin)
    const box = new THREE.Box3();
    src.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
    const s = 1.2 / (box.max.y - box.min.y);
    src.scale.setScalar(s);
    src.position.set(0, -box.min.y * s, 0);

    // matériaux : textures du modèle, teintes de la garde-robe
    const mats = {};
    src.traverse((o) => {
      if (!o.isMesh) return;
      const old = o.material, name = old.name;
      const m = toonMat({ color: '#ffffff', map: old.map || null, skinning: true,
        roughness: name === 'Eyes' ? 0.3 : name === 'Skin' || name === 'Hands' || name === 'Legs' ? 0.62 : 0.85 });
      if (m.map) { m.map.encoding = THREE.sRGBEncoding; m.map.anisotropy = 2; }
      m.name = name;
      o.material = m;
      mats[name] = m;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // la boîte englobante ne suit pas l'animation
    });
    const meshOf = (name) => { let f = null; src.traverse((o) => { if (o.isMesh && o.name === name) f = o; }); return f; };
    const parts = {};
    ['Tunic', 'Trousers', 'Shoes', 'Legs', 'Hair', 'Beard', 'Head', 'Hands'].forEach((n) => { parts[n] = meshOf(n); });

    // animations : repos, marche, course ; mélange selon le déplacement
    const mixer = new THREE.AnimationMixer(src);
    const acts = {};
    [['idle', 'Idle'], ['walk', 'Walk'], ['run', 'Run']].forEach(([k, n]) => {
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
    const ul = P(B.upperarm_l), ur = P(B.upperarm_r);
    const width = ul.distanceTo(ur);
    const headBone = P(B.Head);
    // haut du crâne : boîte de la tête (pose de liaison, à l'échelle)
    let headTop = headBone.y + 0.14;
    if (parts.Head) {
      const hb = parts.Head.geometry.boundingBox || (parts.Head.geometry.computeBoundingBox(), parts.Head.geometry.boundingBox);
      headTop = hb.max.y * s - box.min.y * s;
    }
    const headSize = headTop - headBone.y;
    const unit = 1.2 / 1.84; // (le modèle mesure 1,84 m)
    const brass = toonMat({ color: '#c9973f', roughness: 0.38, metalness: 0.75, skinning: false });
    const bronzeDark = toonMat({ color: '#8a5f2a', roughness: 0.45, metalness: 0.7 });
    const leather = toonMat({ color: '#7a5034', roughness: 0.8 });
    const wood = toonMat({ color: '#a7835c', roughness: 0.8 });
    const gold = toonMat({ color: '#e0b24e', roughness: 0.32, metalness: 0.85 });
    const linen = toonMat({ color: '#efe7d6', roughness: 0.9, side: THREE.DoubleSide });
    const tunicCloth = toonMat({ color: '#2f6f9f', roughness: 0.9, side: THREE.DoubleSide });
    const leafMat = toonMat({ color: '#7f9f4a', roughness: 0.7 });
    const crestMat = toonMat({ color: '#b03a2e', roughness: 0.95 });
    const bandMat = toonMat({ color: '#a63a30', roughness: 0.85 });
    const strap = toonMat({ color: '#5a3a24', roughness: 0.8 });
    const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; parent.add(m); return m; };
    // attache : on place l'objet dans le repère du rig, puis on le confie à l'os (transformation conservée)
    const attach = (bone, obj) => { rig.add(obj); rig.updateMatrixWorld(true); bone.attach(obj); return obj; };

    // tour de taille et de poitrine mesurés sur la tunique (pose de liaison)
    const torsoAt = (y0, y1) => {
      const g = parts.Tunic && parts.Tunic.geometry, p = g && g.attributes.position;
      let rx = 0.16, rz = 0.11;
      if (!p) return { rx: rx * unit / 0.6, rz };
      let mx = 0, mz = 0, cz = 0, n = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        if (y < y0 || y > y1 || Math.abs(p.getX(i)) > 0.24) continue;
        mx = Math.max(mx, Math.abs(p.getX(i))); mz = Math.max(mz, Math.abs(p.getZ(i) - 0)); cz += p.getZ(i); n++;
      }
      return n ? { rx: mx * s, rz: mz * s, cz: (cz / n) * s } : { rx: rx, rz: rz, cz: 0 };
    };
    const pelvis = P(B.pelvis), chest = P(B.spine_03);
    const waist = torsoAt(0.95, 1.05), ribs = torsoAt(1.15, 1.3);
    const acc = {}; // pièces de garde-robe

    // cuirasse de bronze « musclée » (hoplite) : coque tournée autour du torse
    const chestRx = Math.max(ribs.rx * 1.25, width * 0.64), chestRz = Math.max(ribs.rz * 1.35, chestRx * 0.66);
    {
      const g = new THREE.Group();
      const y0 = pelvis.y + 0.04, h = (ul.y + 0.035) - y0;
      const prof = [[0.8, 0], [0.84, 0.12], [0.93, 0.42], [1.0, 0.68], [0.98, 0.86], [0.8, 0.97], [0.5, 1.02]]
        .map(([r, y]) => new THREE.Vector2(r, y * h));
      const geo = new THREE.LatheGeometry(prof, 22);
      // bombé des pectoraux et des abdominaux, sur le devant
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i), y = p.getY(i) / h;
        if (z > 0) p.setZ(i, z * (1 + 0.12 * Math.sin(Math.PI * Math.min(1, y * 1.15))));
      }
      geo.scale(chestRx, 1, chestRz);
      geo.computeVertexNormals();
      add(g, geo, brass, 0, 0, 0);
      const rim = new THREE.TorusGeometry(1, 0.07, 6, 24); rim.rotateX(Math.PI / 2); rim.scale(chestRx * 0.81, 0.3, chestRz * 0.81);
      add(g, rim, bronzeDark, 0, 0.004, 0);
      g.position.set(0, y0, (ribs.cz || 0) + 0.005);
      acc.cuirass = attach(B.spine_02, g);
    }
    // ptéruges : lanières de cuir sous la cuirasse
    {
      const g = new THREE.Group();
      const n = 18, r = chestRx * 0.8, rz = chestRz * 0.8, len = 0.15;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const piv = new THREE.Group();
        piv.position.set(Math.sin(a) * r, 0, Math.cos(a) * rz);
        piv.rotation.order = 'YXZ';
        piv.rotation.y = a;
        piv.rotation.x = -0.22; // les lanières s'évasent vers l'extérieur
        g.add(piv);
        add(piv, new THREE.BoxGeometry(0.036, len, 0.008), k % 2 ? leather : linen, 0, -len / 2, 0);
        add(piv, new THREE.BoxGeometry(0.036, 0.014, 0.011), brass, 0, -len + 0.007, 0);
      }
      g.position.set(0, pelvis.y + 0.05, (ribs.cz || 0) + 0.005);
      acc.pteruges = attach(B.pelvis, g);
    }
    // jupe de chiton (marin : courte ; roi et pèlerin : longue) — couleur de la tunique
    const skirt = (len, flare, mat) => {
      const g = new THREE.Group();
      const geo = new THREE.CylinderGeometry(1, flare, len, 22, 4, true);
      geo.scale(waist.rx * 1.02, 1, waist.rz * 1.18);
      // plis : ondulation douce du bas
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), k = (len / 2 - y) / len, a = Math.atan2(p.getZ(i), p.getX(i));
        const f = 1 + Math.sin(a * 11) * 0.06 * k;
        p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
      }
      geo.computeVertexNormals();
      add(g, geo, mat, 0, -len / 2, 0);
      const hem = new THREE.TorusGeometry(1, 0.03, 5, 28); hem.rotateX(Math.PI / 2); hem.scale(waist.rx * 1.02 * flare, 0.5, waist.rz * 1.18 * flare);
      const hemM = add(g, hem, gold, 0, -len + 0.004, 0);
      const belt = new THREE.TorusGeometry(1, 0.05, 5, 24); belt.rotateX(Math.PI / 2); belt.scale(waist.rx * 1.0, 0.45, waist.rz * 1.12);
      add(g, belt, leather, 0, 0.005, 0);
      g.userData.hem = hemM;
      g.position.set(0, pelvis.y + 0.07, waist.cz || 0);
      return attach(B.pelvis, g);
    };
    acc.skirtShort = skirt(0.2, 1.45, tunicCloth);
    acc.skirtLong = skirt(0.43, 1.75, tunicCloth);
    // jambières de bronze (cnémides)
    acc.greaves = [];
    ['l', 'r'].forEach((sd) => {
      const a = P(B['calf_' + sd]), b = P(B['foot_' + sd]);
      const len = a.distanceTo(b) * 0.78;
      const geo = new THREE.CylinderGeometry(0.042, 0.034, len, 12, 1, true, -Math.PI * 0.75, Math.PI * 1.5);
      const m = new THREE.Mesh(geo, brass);
      m.castShadow = true;
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a.clone().sub(b).normalize());
      m.rotateY(Math.PI); // l'ouverture vers l'arrière du mollet
      acc.greaves.push(attach(B['calf_' + sd], m));
    });
    // sandales : semelle et lanières croisées
    acc.sandals = [];
    ['l', 'r'].forEach((sd) => {
      const f = P(B['foot_' + sd]), t = P(B['ball_' + sd]);
      const g = new THREE.Group();
      const len = Math.hypot(t.x - f.x, t.z - f.z) * 1.9;
      add(g, new THREE.BoxGeometry(0.07, 0.012, len), leather, 0, 0.006, len * 0.18);
      [0.035, 0.07, 0.11].forEach((y, i) => {
        const ring = new THREE.TorusGeometry(0.036 - i * 0.002, 0.005, 4, 14); ring.rotateX(Math.PI / 2);
        add(g, ring, strap, 0, y + 0.01, 0);
      });
      g.position.set(f.x, 0, f.z);
      g.lookAt(t.x, 0, t.z + 1e-4);
      acc.sandals.push(attach(B['foot_' + sd], g));
    });
    // coiffes
    const headC = new THREE.Vector3(headBone.x, headBone.y + headSize * 0.52, headBone.z + headSize * 0.04);
    const hr = headSize * 0.62; // rayon approximatif du crâne
    {
      const g = new THREE.Group(); // couronne de laurier
      const leaf = new THREE.SphereGeometry(1, 6, 4);
      for (let k = 0; k < 26; k++) {
        if (k === 12 || k === 13) continue; // ouverte sur la nuque
        const a = (k / 26) * Math.PI * 2 + Math.PI / 2;
        const l = add(g, leaf, k % 3 ? leafMat : gold, Math.cos(a) * hr * 1.06, (k % 2) * 0.008, Math.sin(a) * hr * 1.12);
        l.scale.set(0.022, 0.008, 0.012);
        l.rotation.set(0.5, -a, (k % 2 ? 0.6 : -0.6));
      }
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.32, 0));
      g.rotation.x = -0.18;
      acc.laurel = attach(B.Head, g);
    }
    {
      const ring = new THREE.TorusGeometry(1, 0.06, 6, 30); ring.rotateX(Math.PI / 2);
      ring.scale(hr * 1.02, 0.35, hr * 1.1);
      const g = new THREE.Group();
      add(g, ring, bandMat);
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.18, 0));
      g.rotation.x = -0.15;
      acc.band = attach(B.Head, g);
    }
    {
      const g = new THREE.Group(); // casque corinthien à crête
      // porté relevé sur le front, à la manière des statues de Périclès : le visage reste lisible
      const dome = new THREE.SphereGeometry(hr * 1.06, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
      dome.scale(0.95, 1.0, 1.1);
      add(g, dome, brass);
      // garde-joues et nasal, relevés au-dessus du front
      const cheeks = new THREE.CylinderGeometry(hr * 1.0, hr * 0.95, hr * 0.45, 20, 1, true, Math.PI * 0.15, Math.PI * 1.7);
      cheeks.scale(0.97, 1, 1.1);
      add(g, cheeks, brass, 0, -hr * 0.18, 0);
      add(g, new THREE.BoxGeometry(hr * 0.14, hr * 0.32, hr * 0.1), brass, 0, -hr * 0.2, hr * 1.06);
      // crête de crin, d'avant en arrière
      const crest = new THREE.CylinderGeometry(hr * 0.9, hr * 0.9, hr * 0.16, 18, 1, false, -Math.PI * 0.02, Math.PI * 1.04);
      crest.rotateZ(Math.PI / 2);
      add(g, crest, crestMat, 0, hr * 1.05, -hr * 0.12);
      add(g, new THREE.BoxGeometry(hr * 0.1, hr * 0.3, hr * 0.9), bronzeDark, 0, hr * 1.0, -hr * 0.12);
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.42, -hr * 0.08));
      g.rotation.x = -0.32;
      acc.helmet = attach(B.Head, g);
    }
    {
      const g = new THREE.Group(); // pétase : chapeau de voyageur à large bord
      const brim = new THREE.CylinderGeometry(hr * 2.0, hr * 2.15, hr * 0.08, 26);
      add(g, brim, toonMat({ color: '#b48a5a', roughness: 0.9 }), 0, 0, 0);
      const crown = new THREE.SphereGeometry(hr * 0.98, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      add(g, crown, toonMat({ color: '#a37b4c', roughness: 0.9 }), 0, 0.01, 0);
      g.position.copy(headC).add(new THREE.Vector3(0, hr * 0.45, -hr * 0.05));
      g.rotation.x = -0.1;
      acc.petasos = attach(B.Head, g);
    }
    // armes : tenues dans la main droite (position calculée dans la pose de repos)
    const hand = P(B.hand_r), fing = P(B.middle_01_r);
    const grip = hand.clone().lerp(fing, 0.6);
    const holdUp = (obj, below) => { // tige verticale passant par la main
      obj.position.set(grip.x, grip.y - below, grip.z);
      return attach(B.hand_r, obj);
    };
    {
      const g = new THREE.Group(); // lance : hampe de frêne, pointe de bronze
      add(g, new THREE.CylinderGeometry(0.012, 0.014, 1.32, 6), wood, 0, 0.66, 0);
      add(g, new THREE.ConeGeometry(0.028, 0.13, 8), brass, 0, 1.38, 0).scale.set(1, 1, 0.45);
      add(g, new THREE.CylinderGeometry(0.018, 0.016, 0.04, 8), bronzeDark, 0, 1.31, 0);
      add(g, new THREE.ConeGeometry(0.014, 0.06, 6), bronzeDark, 0, -0.02, 0).rotation.x = Math.PI;
      acc.spear = holdUp(g, 0.42);
    }
    {
      const g = new THREE.Group(); // bâton de pèlerin à crosse
      add(g, new THREE.CylinderGeometry(0.016, 0.019, 1.15, 7), wood, 0, 0.575, 0);
      const hook = new THREE.TorusGeometry(0.06, 0.016, 6, 12, Math.PI * 1.2);
      add(g, hook, wood, -0.06, 1.15, 0).rotation.z = -0.1;
      acc.staff = holdUp(g, 0.4);
    }
    {
      const g = new THREE.Group(); // xiphos au côté (fourreau à la hanche gauche)
      add(g, new THREE.BoxGeometry(0.04, 0.3, 0.018), leather, 0, -0.15, 0);
      add(g, new THREE.BoxGeometry(0.1, 0.018, 0.03), gold, 0, 0.01, 0);
      add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), wood, 0, 0.06, 0);
      add(g, new THREE.SphereGeometry(0.018, 8, 6), gold, 0, 0.105, 0);
      g.position.set(pelvis.x + waist.rx * 1.15, pelvis.y + 0.03, (waist.cz || 0) + 0.02);
      g.rotation.z = 0.35;
      acc.sword = attach(B.pelvis, g);
    }
    {
      const g = new THREE.Group(); // arc et carquois dans le dos
      const arc = new THREE.TorusGeometry(0.38, 0.011, 6, 26, Math.PI * 0.9);
      const bow = add(g, arc, wood); bow.rotation.z = Math.PI * 0.55;
      const str = new THREE.CylinderGeometry(0.002, 0.002, 0.72, 3);
      add(g, str, linen, 0.06, 0, 0).rotation.z = 0.02;
      const quiver = add(g, new THREE.CylinderGeometry(0.035, 0.03, 0.34, 10), leather, -0.07, 0.02, -0.02);
      quiver.rotation.z = -0.5;
      for (let k = 0; k < 3; k++) add(g, new THREE.ConeGeometry(0.015, 0.05, 4), crestMat, -0.15 - k * 0.012, 0.18 + k * 0.005, -0.02 + k * 0.01).rotation.z = -0.5;
      g.position.set(0, chest.y + 0.02, -(ribs.rz + 0.06) + (ribs.cz || 0));
      g.rotation.y = Math.PI;
      g.scale.setScalar(0.72);
      acc.bow = attach(B.spine_03, g);
    }
    // bouclier rond (aspis) dans le dos, motif peint
    const shieldFace = toonMat({ color: '#ffffff', roughness: 0.6, map: shieldTexture('chouette') });
    {
      const g = new THREE.Group();
      const R = 0.22;
      const disc = new THREE.CylinderGeometry(R, R, 0.03, 32); disc.rotateX(Math.PI / 2);
      add(g, disc, bronzeDark);
      const face = new THREE.CircleGeometry(R * 0.96, 32);
      add(g, face, shieldFace, 0, 0, -0.017).rotation.y = Math.PI;
      const rim = new THREE.TorusGeometry(R, 0.022, 6, 32);
      add(g, rim, brass);
      g.position.set(0, chest.y - 0.02, -(ribs.rz + 0.07) + (ribs.cz || 0));
      acc.shield = attach(B.spine_03, g);
    }

    // cape : accrochée au torse, à hauteur d'épaules
    const holder = new THREE.Group();
    const sy = (ul.y + ur.y) / 2;
    holder.position.set(0, sy - 0.01, (ribs.cz || 0) - ribs.rz * 0.35);
    const k = Math.max(0.6, Math.min(1.8, width / 0.27));
    holder.scale.set(k * 0.86, sy / 0.88 * 0.8, k * 0.92);
    hero.cape.position.set(0, 0, 0);
    holder.add(hero.cape);
    attach(B.spine_03, holder);
    // repère au centre de la tête (caméra du mode concentration, lueur de la pensée)
    const anchor = new THREE.Object3D();
    anchor.position.copy(headC);
    attach(B.Head, anchor);
    rig.add(hero.mind);
    hero.mind.position.copy(anchor.position);
    rig.traverse((o) => { if (o.isMesh) o.castShadow = true; });

    hero.group.remove(hero.body);
    if (hero.spear.parent) hero.spear.parent.remove(hero.spear);
    hero.group.add(rig);
    _ik = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), t: new THREE.Vector3(), h: new THREE.Vector3(),
      q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion() };
    const arm = (side) => ({ upper: B['upperarm_' + side], lower: B['lowerarm_' + side], end: B['middle_01_' + side], qa: [new THREE.Quaternion(), new THREE.Quaternion()] });
    Object.assign(hero, { body: rig, head: anchor, rig: { mixer, acts, arms: [arm('l'), arm('r')], headBone: B.Head, headSize: headSize * 0.9 },
      skin: { mats, parts, acc, tunicCloth, shieldFace, capeHolder: holder } });
    applySkin();
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
    const tunicHex = col('tunic');
    // textures en niveaux de gris (moyenne ≈ 0,82) : la couleur choisie les teinte
    if (K.mats.Tunic) setLin(K.mats.Tunic.color, tunicHex).multiplyScalar(1.2);
    setLin(K.tunicCloth.color, tunicHex);
    ['Hair', 'Beard', 'Brows'].forEach((n) => { if (K.mats[n]) setLin(K.mats[n].color, col('hair')).multiplyScalar(1.25); });
    // peau : la texture est déjà hâlée (≈ #c98f66) ; on la multiplie vers le ton choisi
    const ref = lin('#d29a72'), tgt = lin(col('skin'));
    ['Skin', 'Hands', 'Legs'].forEach((n) => {
      if (K.mats[n]) K.mats[n].color.setRGB(tgt.r / ref.r, tgt.g / ref.g, tgt.b / ref.b);
    });
    const A = K.acc, P = K.parts;
    const greek = outfit !== 'voyageur';
    if (P.Trousers) P.Trousers.visible = !greek;
    if (P.Shoes) P.Shoes.visible = !greek;
    if (P.Legs) P.Legs.visible = greek;
    A.sandals.forEach((o) => { o.visible = greek; });
    A.greaves.forEach((o) => { o.visible = outfit === 'hoplite'; });
    A.cuirass.visible = outfit === 'hoplite';
    A.pteruges.visible = outfit === 'hoplite';
    A.skirtShort.visible = outfit === 'marin';
    A.skirtLong.visible = outfit === 'roi' || outfit === 'pelerin';
    // le roi porte un ourlet d'or, le pèlerin un simple lin
    A.skirtLong.userData.hem.visible = outfit === 'roi';
    const accId = skinOpt('accessory', st.accessory).id;
    ['laurel', 'helmet', 'band', 'petasos'].forEach((n) => { A[n].visible = accId === n; });
    setLin(A.band.children[0].material.color, capeId === 'none' || capeId === 'blanc' ? '#a63a30' : capeHex);
    const w = skinOpt('weapon', st.weapon).id;
    ['spear', 'staff', 'bow', 'sword'].forEach((n) => { A[n].visible = w === n; A[n].userData.hidden = false; });
    const sh = skinOpt('shield', st.shield).id;
    A.shield.visible = sh !== 'none';
    if (sh !== 'none' && K.shieldFace.map !== shieldTexture(sh)) { K.shieldFace.map = shieldTexture(sh); K.shieldFace.needsUpdate = true; }
    // carquois et bouclier se disputent le dos : le bouclier passe devant l'arc
    if (A.bow.visible && A.shield.visible) A.shield.position.z -= 0; // (le bouclier, plus large, recouvre l'arc)
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
    const target = { idle: moving ? 0 : 1, walk: 0, run: moving ? 1 : 0 };
    const kk = 1 - Math.exp(-dt * 10);
    Object.keys(r.acts).forEach((k) => {
      const A = r.acts[k];
      A.w += ((target[k] || 0) - A.w) * kk;
      A.a.setEffectiveWeight(A.w);
    });
    if (r.acts.run) r.acts.run.a.timeScale = speed ? 1.12 : 0.8;
    r.mixer.update(dt);
    hero.cape.rotation.x = moving ? -0.42 + Math.sin(t * 7) * 0.07 : -0.06 + Math.sin(t * 1.2) * 0.03;
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
      // vie de l'île : ailes du moulin, barques qui tanguent, feu du phare la nuit
      const life = ch.life;
      if (life) {
        if (life.sails && !calm) life.sails.rotation.z -= dt * 0.6;
        life.boats.forEach((b) => {
          b.position.y = Math.sin(t * 1.3 + b.userData.phase) * 0.03 - 0.02;
          b.rotation.z = Math.sin(t * 1.1 + b.userData.phase) * 0.05;
          b.rotation.y = b.userData.base + Math.sin(t * 0.3 + b.userData.phase) * 0.08;
        });
        if (life.lamp) life.lamp.material.opacity = isDark && reached ? 0.75 + Math.sin(t * 2.2) * 0.15 : 0;
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
      goal.radius = 1.25; goal.elev = 0.12;
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
          '  float blur = smoothstep(0.16, 0.55, d) * 7.0 * strength;', // net au centre, flou vers les bords
          '  vec4 col = texture2D(tDiffuse, vUv) * 0.2;',
          '  for (int i = 0; i < 8; i++) {',
          '    float a = float(i) * 2.39996;',                              // angle d'or : échantillons bien répartis
          '    vec2 off = vec2(cos(a), sin(a)) * texel * blur * (0.5 + float(i) / 8.0);',
          '    col += texture2D(tDiffuse, vUv + off) * 0.1;',
          '  }',
          '  vec3 c = col.rgb;',
          '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
          '  c = mix(vec3(l), c, 1.1);',                                      // un peu plus de couleur
          '  c = (c - 0.5) * 1.03 + 0.5;',                                    // un peu plus de contraste
          // étalonnage chaud et doux : ombres légèrement bleutées, lumières dorées
          '  float s = smoothstep(0.0, 0.55, l), hi = smoothstep(0.45, 1.0, l);',
          '  c += vec3(-0.012, 0.0, 0.022) * (1.0 - s) + vec3(0.03, 0.012, -0.022) * hi;',
          '  c = max(c, vec3(0.0));',
          '  vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.42 * strength;',    // vignettage doux
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    renderer.physicallyCorrectLights = true;
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
    loadEnvironment(); // ciel HDRI en arrière-plan ; sans lui, l'hémisphère éclaire seule
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
  const ISLAND_NAMES = ['Troie', 'Ismaros, chez les Cicones', 'Île des Lotophages', 'Île des Cyclopes', 'Éolie', 'Télépyle des Lestrygons',
    'Île de Circé', 'Pays des Ombres', 'Île des Sirènes', 'Charybde et Scylla', 'Thrinacie, île du Soleil', 'Ogygie, île de Calypso',
    'Schérie, chez les Phéaciens', 'Ithaque'];
  const islandName = (i) => ISLAND_NAMES[i % ISLAND_NAMES.length] + (i >= ISLAND_NAMES.length ? ' (' + (Math.floor(i / ISLAND_NAMES.length) + 1) + 'e voyage)' : '');
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
