'use strict';
/* ============================================================
   SCHOTTER ROYALE — render3d: Ego-Perspektive auf three.js

   Die Spielwelt bleibt zweidimensional (x, y) — das 3D-Bild legt sie
   nur auf die Ebene: Welt-x -> 3D-x, Welt-y -> 3D-z, Höhe ist 3D-y.
   Dadurch laufen Kollision, KI, Sturm und Bauen unverändert weiter.

   Maßstab: 50 Einheiten = 1 Meter (Spieler r=15 -> 60 cm breit,
   Gebäude 130–320 Einheiten -> 2,6–6,4 m).
   ============================================================ */

const U = 50;                       // Einheiten pro Meter
const EYE = 82;                     // Augenhöhe (~1,65 m)
const BODY_H = 92;                  // Körperhöhe eines Spielers
const WALL_H = 170;                 // Höhe der Hauswände
const BUILT_H = 150;                // Höhe gebauter Wände
const CHUNK = 1100;                 // Kantenlänge eines Kulissen-Chunks

/* Masse der Waffenmodelle in Welteinheiten (50 = 1 m). Die Silhouette soll
   den Typ auf Distanz verraten: langer duenner Lauf = Scharfschuetze,
   kurz und dick = Schrotflinte. */
const GUN_SHAPE = {
  pistol:  { body: [11, 5.0, 3.6], barrel: [0.9,  5], mag: [2.6, 6, 2.6], grip: 0.55 },
  smg:     { body: [15, 5.2, 3.8], barrel: [0.9,  7], mag: [2.8, 9, 2.8], grip: 0.5 },
  tac:     { body: [18, 5.2, 3.8], barrel: [0.9,  9], mag: [2.8, 9, 2.8], grip: 0.5 },
  ar:      { body: [21, 5.4, 4.0], barrel: [1.0, 13], mag: [3.2, 10, 3.0], grip: 0.5 },
  shotgun: { body: [23, 6.0, 4.6], barrel: [1.6, 17], mag: [3.6, 4, 3.4], grip: 0.5 },
  sniper:  { body: [25, 5.2, 4.0], barrel: [1.15, 21], mag: [2.8, 5, 2.8], grip: 0.5, scope: true },
  rpg:     { body: [28, 7.0, 7.0], barrel: [3.0, 18], mag: [4.5, 5, 4.5], grip: 0.5 }
};

const R3D = {
  ok: false, scene: null, cam: null, ren: null,
  chunks: new Map(), dyn: {}, fx: [], tracers: [],
  time: 0,

  /* ---------------------------------------------------- Aufbau */
  init(canvas) {
    if (typeof THREE === 'undefined') { this.ok = false; return false; }
    this.ren = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.ren.setClearColor(0x8fb6d8);
    this.ren.outputEncoding = THREE.sRGBEncoding;
    this.ren.shadowMap.enabled = true;
    this.ren.shadowMap.type = THREE.PCFSoftShadowMap;
    this.ren.shadowMap.autoUpdate = true;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa6c6e0, 600, 3500);

    this.cam = new THREE.PerspectiveCamera(78, 1, 4, 5200);
    this.cam.rotation.order = 'YXZ';

    // Licht: eine Sonne für Plastizität, Himmelslicht gegen tote schwarze Flächen
    const sun = new THREE.DirectionalLight(0xfff0cf, 1.05);
    sun.position.set(-0.5, 0.85, 0.28);
    sun.castShadow = true;
    // Enger Ausschnitt um den Spieler: 1300 Einheiten sind 26 m, das reicht
    // fuer alles, was man als Schatten wahrnimmt, und haelt die Karte scharf.
    const SH = 1300;
    sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
    sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
    sun.shadow.camera.near = 100; sun.shadow.camera.far = 5200;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 2.5;
    this.sun = sun;
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    sun.target = this.sunTarget;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xa8ccf5, 0x3e5230, 0.48));

    this.buildSky();
    this.buildGround();
    this.buildDynamic();
    this.buildViewModel();

    this.mat4 = new THREE.Matrix4();
    this.quat = new THREE.Quaternion();
    this.eul = new THREE.Euler(0, 0, 0, 'YXZ');
    this.v3 = new THREE.Vector3();
    this.sc = new THREE.Vector3(1, 1, 1);
    this.col = new THREE.Color();
    this.ok = true;
    return true;
  },

  /** Himmelskuppel mit Verlauf — billiger und ruhiger als eine Textur */
  buildSky() {
    const geo = new THREE.SphereGeometry(4600, 24, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x2a6ab5) }, bot: { value: new THREE.Color(0xd6e6f2) },
                  sunDir: { value: new THREE.Vector3(-0.5, 0.85, 0.28).normalize() } },
      vertexShader: `varying vec3 vp;
        void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vp; uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir;
        // billiges Wertrauschen — reicht fuer weiche Wolkenbaender
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec3 c = mix(bot, top, smoothstep(-0.05, 0.55, vp.y));
          float sun = max(dot(vp, sunDir), 0.0);
          c += vec3(1.0, 0.86, 0.62) * pow(sun, 220.0) * 1.4;      // Sonnenscheibe
          c += vec3(1.0, 0.82, 0.58) * pow(sun, 5.0) * 0.16;       // Hof drumherum
          if (vp.y > 0.02) {
            vec2 uv = vp.xz / max(vp.y, 0.05) * 0.55;
            float n = noise(uv * 1.6) * 0.6 + noise(uv * 3.7) * 0.3 + noise(uv * 8.0) * 0.1;
            float cl = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.30, vp.y);
            c = mix(c, vec3(1.0, 0.99, 0.97), cl * 0.75);
          }
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  },

  buildGround() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const R = mulberry32(11);
    g.fillStyle = '#4e6b3f'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) {
      const x = R() * 256, y = R() * 256, r = 1 + R() * 5;
      g.fillStyle = R() < 0.5 ? `rgba(60,88,48,${.3 + R() * .4})` : `rgba(108,132,74,${.2 + R() * .35})`;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    for (let i = 0; i < 240; i++) {          // Schotter
      g.fillStyle = `rgba(168,163,148,${.12 + R() * .25})`;
      g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(MAP / 220, MAP / 220);
    tex.anisotropy = 4;
    // Unterteilte Ebene mit Scheitelfarben: Wiesen, Trampelpfade, Sand am Rand.
    // Eine einzelne Textur ueber 6600 Einheiten sieht aus wie Filz.
    const geo = new THREE.PlaneGeometry(MAP, MAP, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const RN = mulberry32(23);
    const nz = [];
    for (let i = 0; i < 96; i++) nz.push({ x: RN() * MAP, y: RN() * MAP, r: 300 + RN() * 900, t: RN() });
    const C = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + MAP / 2, wz = pos.getZ(i) + MAP / 2;
      let dirt = 0, dry = 0;
      for (const n of nz) {
        const d = Math.hypot(wx - n.x, wz - n.y);
        if (d < n.r) { const f = 1 - d / n.r; if (n.t < 0.45) dirt = Math.max(dirt, f); else dry = Math.max(dry, f); }
      }
      const edge = Math.min(wx, wz, MAP - wx, MAP - wz);
      const sand = clamp(1 - edge / 340, 0, 1);          // Sandsaum am Inselrand
      // Scheitelfarben werden mit der Textur multipliziert: Werte ueber 1.0
      // hellen auf, bis der Boden weiss ausbrennt. Deshalb hoechstens 1.0 —
      // sie toenen, sie leuchten nicht.
      C.setRGB(1.0, 1.0, 0.98);
      C.lerp(this._dry || (this._dry = new THREE.Color(0.98, 0.90, 0.62)), dry * 0.6);
      C.lerp(this._dirt || (this._dirt = new THREE.Color(0.78, 0.64, 0.46)), dirt * 0.75);
      C.lerp(this._sand || (this._sand = new THREE.Color(1.0, 0.94, 0.74)), sand);
      cols[i * 3] = C.r; cols[i * 3 + 1] = C.g; cols[i * 3 + 2] = C.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }));
    m.receiveShadow = true;
    m.position.set(MAP / 2, 0, MAP / 2);
    this.scene.add(m);
    this.ground = m;
  },

  /* ---------------------------------------------------- statische Kulisse
     Alles Unbewegliche wird pro Chunk zu InstancedMeshes zusammengefasst,
     damit three.js ganze Kartenteile aus dem Sichtfeld werfen kann. Ohne
     das zeichnet die GPU bei jedem Bild den kompletten 6600er-Wald mit. */
  buildWorld() {
    for (const [, c] of this.chunks) for (const m of c) { this.scene.remove(m); m.geometry.dispose(); }
    this.chunks.clear();

    const box = new THREE.BoxGeometry(1, 1, 1);
    const trunk = new THREE.CylinderGeometry(1, 1.25, 1, 6);
    const leaf = new THREE.IcosahedronGeometry(1, 0);
    const pine = new THREE.ConeGeometry(1, 1, 7);
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const blob = new THREE.CircleGeometry(1, 10); blob.rotateX(-Math.PI / 2);
    const geos = { box, roof: box, trunk, leaf, pine, rock, blob };
    const mats = {
      box:   new THREE.MeshLambertMaterial({ color: 0xffffff }),   // Farbe je Instanz
      roof:  new THREE.MeshLambertMaterial({ color: 0xffffff }),
      trunk: new THREE.MeshLambertMaterial({ color: 0x6b4c2a }),
      leaf:  new THREE.MeshLambertMaterial({ color: 0x3f7a3c, flatShading: true }),
      pine:  new THREE.MeshLambertMaterial({ color: 0x2f6b41, flatShading: true }),
      rock:  new THREE.MeshLambertMaterial({ color: 0x8b8d92, flatShading: true }),

      // Kein Schattenwurf per Shadow-Map: 100 Figuren plus Wald waeren dem
      // Handy zu teuer. Ein weicher Fleck unter jedem Objekt erdet genauso gut.
      blob: new THREE.MeshBasicMaterial({ color: 0x1d2a17, transparent: true, opacity: .26, depthWrite: false })
    };
    this.geos = geos; this.mats = mats;

    // 1) einsortieren
    const bins = new Map();
    const key = (x, z) => (Math.floor(z / CHUNK) * 999 + Math.floor(x / CHUNK));
    const put = (x, z, type, item) => {
      const k = key(x, z);
      let b = bins.get(k);
      if (!b) { b = { box: [], roof: [], trunk: [], leaf: [], pine: [], rock: [], blob: [] }; bins.set(k, b); }
      b[type].push(item);
    };
    for (const o of World.obstacles) {
      o.kind = o.solid ? 'wall' : 'floor';
      put(o.x + o.w / 2, o.y + o.h / 2, 'box', o);
      // Der Grundriss traegt auch das Dach — ohne wirken die POIs wie
      // hingestellte Mauerreste statt wie Haeuser.
      if (!o.solid) put(o.x + o.w / 2, o.y + o.h / 2, 'roof', o);
    }
    for (const p of World.props) {
      if (p.type === 'tree') {
        // Art aus der Position ableiten, damit sie ueber Neustarts stabil bleibt
        const h = Math.abs(Math.sin(p.x * 0.017 + p.y * 0.031));
        p.kind = h < 0.42 ? 'broad' : h < 0.82 ? 'pine' : 'dead';
        put(p.x, p.y, 'trunk', p);
        if (p.kind === 'broad') put(p.x, p.y, 'leaf', p);
        else if (p.kind === 'pine') { put(p.x, p.y, 'pine', p); put(p.x, p.y, 'pine', p); }
      }
      else if (p.type === 'rock') put(p.x, p.y, 'rock', p);
      else { p.kind = 'crate'; put(p.x, p.y, 'box', p); }
      put(p.x, p.y, 'blob', p);
    }

    // 2) je Chunk und Typ ein InstancedMesh
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
    const E = new THREE.Euler();
    for (const [k, b] of bins) {
      const list = [];
      const cz0 = Math.floor(k / 999) * CHUNK, cx0 = (k - Math.floor(k / 999) * 999) * CHUNK;
      for (const type in b) {
        const items = b[type];
        if (!items.length) continue;
        const mesh = new THREE.InstancedMesh(geos[type], mats[type], items.length);
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        for (let i = 0; i < items.length; i++) {
          const o = items[i];
          if (type === 'box') {
            if (o.kind === 'wall')       { P.set(o.x + o.w / 2, WALL_H / 2, o.y + o.h / 2); S.set(o.w, WALL_H, o.h); Q.identity(); }
            else if (o.kind === 'floor') { P.set(o.x + o.w / 2, 2, o.y + o.h / 2);          S.set(o.w, 4, o.h);      Q.identity(); }
            else                         { const r = o.r * .8; P.set(o.x, r, o.y); S.set(r * 2, r * 2, r * 2);
                                           E.set(0, (o.x % 7) * .2, 0); Q.setFromEuler(E); }
          }
          else if (type === 'roof') {
            P.set(o.x + o.w / 2, WALL_H + 7, o.y + o.h / 2);
            S.set(o.w + 18, 14, o.h + 18); Q.identity();
          }
          else if (type === 'trunk'){ const h = (o.kind === 'pine' ? 175 : o.kind === 'dead' ? 195 : 150) * o.s;
                                      P.set(o.x, h / 2, o.y); S.set(o.kind === 'dead' ? 7 : 9, h, o.kind === 'dead' ? 7 : 9);
                                      Q.identity(); }
          else if (type === 'leaf') { const h = 150 * o.s; P.set(o.x, h + 34 * o.s, o.y); const r = 58 * o.s; S.set(r, r * .78, r);
                                      E.set(o.sway, o.sway * 1.7, 0); Q.setFromEuler(E); }
          else if (type === 'pine') { const h = 175 * o.s;
                                      // zwei gestapelte Kegel je Fichte
                                      const lvl = (i % 2);
                                      const r = (lvl ? 40 : 56) * o.s;
                                      P.set(o.x, h * (lvl ? 0.98 : 0.72) + 20 * o.s, o.y);
                                      S.set(r, 90 * o.s * (lvl ? 0.85 : 1), r); Q.identity(); }
          else if (type === 'rock') { const r = o.r * .62; P.set(o.x, r * .72, o.y); S.set(r * 1.5, r * 1.35, r * 1.5);
                                      E.set(0.3, o.x % 3, 0.2); Q.setFromEuler(E); }
          else                      { const r = (o.type === 'tree' ? 46 * o.s : o.r * 1.1);
                                      P.set(o.x, 1.2, o.y); S.set(r, 1, r); Q.identity(); }
          M.compose(P, Q, S);
          mesh.setMatrixAt(i, M);
        }
        if (type === 'box' || type === 'roof') {
          const C = new THREE.Color();
          // Farbe aus der Position ableiten: gleiche Haeuser sehen sonst aus
          // wie kopiert, und die Farbe muss ueber Neustarts stabil bleiben.
          const WALLS = [0xbcb5a4, 0xa89c86, 0xc9c3b2, 0x9a9384, 0xcbbfa6];
          const ROOFS = [0x8d4a3c, 0x6b4230, 0x4a5566, 0x7a5c34, 0x53504a];
          for (let i = 0; i < items.length; i++) {
            const o = items[i];
            const h = Math.abs(Math.round(o.x * 0.031 + o.y * 0.017)) % 5;
            if (type === 'roof') C.set(ROOFS[h]);
            else C.set(o.kind === 'wall' ? WALLS[h] : o.kind === 'floor' ? 0x5f584d : 0x8d6a3a);
            mesh.setColorAt(i, C);
          }
          mesh.instanceColor.needsUpdate = true;
        } else if (type === 'leaf' || type === 'pine' || type === 'rock' || type === 'trunk') {
          const C = new THREE.Color();
          for (let i = 0; i < items.length; i++) {
            const o = items[i];
            const j = (Math.sin(o.x * 12.9898 + o.y * 78.233) * 43758.5453) % 1;
            const t = (j < 0 ? j + 1 : j);
            if (type === 'leaf') C.setHSL(0.26 + t * 0.055, 0.42 + t * 0.16, 0.26 + t * 0.14);
            else if (type === 'pine') C.setHSL(0.34 + t * 0.04, 0.40 + t * 0.14, 0.20 + t * 0.10);
            else if (type === 'trunk') C.setHSL(0.08, 0.34, 0.22 + t * 0.09);
            else C.setHSL(0.09, 0.05, 0.44 + t * 0.18);
            mesh.setColorAt(i, C);
          }
          mesh.instanceColor.needsUpdate = true;
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.userData.items = items;
        mesh.userData.type = type;
        this.scene.add(mesh);
        list.push(mesh);
      }
      list.cx = cx0 + CHUNK / 2; list.cz = cz0 + CHUNK / 2;
      this.chunks.set(k, list);
    }
  },

  /* ---------------------------------------------------- bewegliche Objekte */
  buildDynamic() {
    const MAXA = 130, MAXL = 700, MAXB = 900;
    const lam = (c, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}));

    /* Figuren aus einem kleinen Skelett: Kopf, Brustkorb, Huefte, Rucksack,
       acht Gliedmassen-Segmente (Ober-/Unterarm, Ober-/Unterschenkel),
       Haende und Stiefel. Jedes Teil ist ein InstancedMesh, also je ein
       Zeichenaufruf fuer alle Figuren zusammen. */
    const box = () => new THREE.BoxGeometry(1, 1, 1);
    this.dyn.torso = new THREE.InstancedMesh(box(), lam(0xffffff), MAXA);
    this.dyn.hips  = new THREE.InstancedMesh(box(), lam(0x39435c), MAXA);
    this.dyn.head  = new THREE.InstancedMesh(box(), lam(0xffffff), MAXA);
    this.dyn.pack  = new THREE.InstancedMesh(box(), lam(0x5d6440), MAXA);
    this.dyn.cap   = new THREE.InstancedMesh(box(), lam(0xffffff), MAXA);
    this.dyn.limb  = new THREE.InstancedMesh(box(), lam(0xffffff), MAXA * 8);
    this.dyn.hand  = new THREE.InstancedMesh(box(), lam(0xe0b189), MAXA * 2);
    this.dyn.boot  = new THREE.InstancedMesh(box(), lam(0x2c2a26), MAXA * 2);
    const disc = new THREE.CircleGeometry(1, 12); disc.rotateX(-Math.PI / 2);
    this.dyn.shadow = new THREE.InstancedMesh(disc,
      new THREE.MeshBasicMaterial({ color: 0x101c10, transparent: true, opacity: .34, depthWrite: false }), MAXA);

    /* Waffen: drei Teile, deren Masse je Waffentyp variieren. Dieselben Meshes
       tragen sowohl die Waffe in der Hand als auch die am Boden liegende —
       ein Gewehr sieht dadurch ueberall gleich aus. */
    this.dyn.gunBody = new THREE.InstancedMesh(box(), lam(0xffffff), MAXA + 260);
    this.dyn.gunBarrel = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), lam(0x23262c), MAXA + 260);
    this.dyn.gunMag  = new THREE.InstancedMesh(box(), lam(0x2a2e35), MAXA + 260);

    // Uebrige Beute: Munitionskisten und Flaschen liegen ebenfalls am Boden
    this.dyn.loot = new THREE.InstancedMesh(box(), lam(0xffffff), MAXL);
    this.dyn.bottle = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), lam(0xffffff), MAXL);
    this.dyn.chest = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xd9a13a), 120);
    // gebaute Wände
    this.dyn.built = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), MAXB);

    for (const k in this.dyn) {
      const m = this.dyn[k];
      m.frustumCulled = false;
      m.count = 0;
      if (k !== 'shadow' && k !== 'spark') { m.castShadow = true; m.receiveShadow = true; }
      if (k !== 'shadow') {
        const n = m.instanceMatrix.count;
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      }
      this.scene.add(m);
    }

    // Leuchtspuren als ein einziges Liniennetz
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 6), 3));
    this.tracerMesh = new THREE.LineSegments(tg,
      new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: .85, fog: false }));
    this.tracerMesh.frustumCulled = false;
    this.scene.add(this.tracerMesh);

    // Treffer- und Explosionsblitze
    this.dyn.spark = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: .9, fog: false }), 160);
    this.dyn.spark.frustumCulled = false; this.dyn.spark.count = 0;
    this.scene.add(this.dyn.spark);

    this.buildStorm();
  },

  buildStorm() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${190 + Math.random() * 60 | 0},${90 + Math.random() * 90 | 0},255,${Math.random() * .5})`;
      g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 6 + Math.random() * 40);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(26, 1);
    this.stormTex = tex;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 44, 1, true);
    this.storm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, color: 0xc07bff, side: THREE.DoubleSide,
      transparent: true, opacity: .6, depthWrite: false, fog: true
    }));
    this.storm.frustumCulled = false;
    this.scene.add(this.storm);
  },

  /** Waffe am unteren Bildrand. Die Teile werden nach denselben Massen
      skaliert wie die Weltmodelle, damit die Waffe in der Hand aussieht wie
      die, die man aufgehoben hat — Scharfschuetze lang mit Zielfernrohr,
      Schrotflinte kurz und dick. */
  buildViewModel() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2f37 });
    const body = new THREE.MeshLambertMaterial({ color: 0x525a66 });
    const wood = new THREE.MeshLambertMaterial({ color: 0x54402a });
    const V = this.vmParts = {};

    V.receiver = new THREE.Mesh(new THREE.BoxGeometry(4.4, 5.2, 20), body);
    V.receiver.position.set(0, 0, -10);
    V.barrel = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 16, 8), dark);
    V.barrel.rotation.x = Math.PI / 2;
    V.mag = new THREE.Mesh(new THREE.BoxGeometry(3.2, 9, 4.6), dark);
    V.mag.position.set(0, -5.6, -8); V.mag.rotation.x = 0.16;
    V.grip = new THREE.Mesh(new THREE.BoxGeometry(3.6, 9, 4.2), wood);
    V.grip.position.set(0, -5.8, 1.5); V.grip.rotation.x = -0.32;
    V.stock = new THREE.Mesh(new THREE.BoxGeometry(3.6, 5, 9), wood);
    V.stock.position.set(0, -1.4, 6);
    V.scope = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 9, 8), dark);
    V.scope.rotation.x = Math.PI / 2; V.scope.position.set(0, 4.4, -12);
    V.scope.visible = false;
    V.sight = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 1.4), dark);
    V.sight.position.set(0, 3.6, -17);
    for (const k in V) g.add(V[k]);

    g.position.set(12.5, -10.5, -26);
    g.rotation.set(0.03, -0.11, 0.06);
    g.scale.setScalar(0.55);
    this.vm = g;
    this.vmBase = { x: 12.5, y: -10.5, z: -26 };

    this.flash = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, fog: false }));
    g.add(this.flash);
    this.muzzleLight = new THREE.PointLight(0xffd9a0, 0, 460, 2);
    g.add(this.muzzleLight);
    this.applyViewWeapon(null);
    this.cam.add(g);
    this.scene.add(this.cam);
  },

  /** Teile auf den aktuellen Waffentyp umskalieren (nur bei Wechsel) */
  applyViewWeapon(gun) {
    const key = gun ? gun.id + ':' + gun.rar : 'none';
    if (key === this.vmKey) return;
    this.vmKey = key;
    const V = this.vmParts;
    if (!gun) {                                  // ohne Waffe: nur die Faust
      for (const k in V) V[k].visible = false;
      V.grip.visible = true;
      this.flash.position.set(0, 0, -8);
      this.muzzleLight.position.set(0, 0, -8);
      return;
    }
    const S = GUN_SHAPE[gun.id] || GUN_SHAPE.ar;
    for (const k in V) V[k].visible = true;
    V.scope.visible = !!S.scope;

    const bl = S.body[0], bh = S.body[1], bd = S.body[2];
    V.receiver.scale.set(bd / 4.0, bh / 5.4, bl / 20);
    V.receiver.position.set(0, 0, -bl / 2);
    V.barrel.scale.set(S.barrel[0] / 1.0, S.barrel[1] / 16, S.barrel[0] / 1.0);
    V.barrel.position.set(0, bh * 0.16, -bl - S.barrel[1] / 2);
    V.mag.scale.set(S.mag[0] / 3.2, S.mag[1] / 9, S.mag[2] / 4.6);
    V.mag.position.set(0, -bh * 0.5 - S.mag[1] * 0.42, -bl * 0.45);
    V.grip.position.set(0, -bh * 0.55 - 4, -bl * 0.08);
    V.stock.position.set(0, -1.4, 4.5);
    V.stock.visible = gun.id !== 'pistol';
    V.sight.position.set(0, bh * 0.62 + 1, -bl * 0.85);
    V.scope.position.set(0, bh * 0.62 + 2.4, -bl * 0.6);

    // Verschluss in Seltenheitsfarbe einfaerben — man sieht, was man traegt
    const c = new THREE.Color(RARITY[gun.rar] ? RARITY[gun.rar].col : '#8a8f98');
    V.receiver.material = V.receiver.material.clone();
    V.receiver.material.color.copy(c).multiplyScalar(0.5).addScalar(0.14);

    const muz = -bl - S.barrel[1] - 2;
    this.flash.position.set(0, bh * 0.16, muz);
    this.muzzleLight.position.set(0, bh * 0.3, muz + 4);
  },

  /** Weltpunkt -> Buehnen-Pixel  /** Weltpunkt -> Buehnen-Pixel. null, wenn hinter der Kamera. */
  project(x, h, z, out) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, h, z).project(this.cam);
    if (v.z > 1) return null;                       // hinter der Kamera
    out.x = (v.x * 0.5 + 0.5) * Game.W;
    out.y = (-v.y * 0.5 + 0.5) * Game.H;
    return out;
  },

  resize(w, h, dpr) {
    if (!this.ok) return;
    this.ren.setPixelRatio(dpr);
    this.ren.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.fov = h > w ? 88 : 76;          // hochkant mehr Blickwinkel
    this.cam.updateProjectionMatrix();
  }
};

/* ============================================================
   Teil 2 — pro Bild: Kamera, Figuren, Loot, Sturm, Effekte
   ============================================================ */
Object.assign(R3D, {

  render(dt) {
    if (!this.ok) return;
    this.time += dt;
    const p = Game.player;

    this.updateCamera(dt, p);
    this.cullChunks();
    this.updateActors(p);
    this.updateLoot(p);
    this.updateBuilt(p);
    this.updateStorm(p);
    this.updateTracers();
    this.updateSparks(dt);

    // Sonne mitfuehren, sonst laeuft man aus dem Schattenausschnitt heraus
    this.sunTarget.position.set(p.x, 0, p.y);
    this.sun.position.set(p.x - 900, 1530, p.y + 500);
    this.sky.position.copy(this.cam.position);
    this.ground.position.set(MAP / 2, 0, MAP / 2);
    this.ren.render(this.scene, this.cam);
  },

  /** Sichtbarkeit je Chunk: Entfernung plus grober Blickkegel.
      Spart auf dem Handy den Grossteil der Zeichenaufrufe. */
  cullChunks() {
    const cx = this.cam.position.x, cz = this.cam.position.z;
    const yaw = (Game.player.aimAng || 0);
    const dx0 = Math.cos(yaw), dz0 = Math.sin(yaw);
    const FAR = this.scene.fog.far + CHUNK;
    const NEAR2 = (CHUNK * 1.2) * (CHUNK * 1.2);
    for (const [, list] of this.chunks) {
      const dx = list.cx - cx, dz = list.cz - cz;
      const d2 = dx * dx + dz * dz;
      let vis = d2 < FAR * FAR;
      if (vis && d2 > NEAR2) {
        const d = Math.sqrt(d2);
        vis = (dx * dx0 + dz * dz0) / d > -0.30;   // grosszuegiger Kegel gegen Aufpoppen
      }
      const casts = d2 < 1500 * 1500;
      for (let i = 0; i < list.length; i++) { list[i].visible = vis; list[i].castShadow = casts; }
    }
  },

  updateCamera(dt, p) {
    const air = p.drop.phase !== 'ground' && p.drop.phase !== 'bus';
    // Absprunghöhe: 3000 Einheiten sind 60 m — hoch genug für Übersicht,
    // niedrig genug dass man Gebäude noch als Gebäude erkennt.
    let y = EYE;
    if (p.drop.phase === 'bus') y = 3400;
    else if (air) y = EYE + p.drop.h * 3000;

    // Im Bus und im freien Fall schaut die Kamera nach unten. Ohne das blickt
    // man aus 68 m Hoehe waagerecht in den Himmel, sieht die Insel nie und
    // merkt gar nicht, dass man abspringen soll.
    this.dropPitch = this.dropPitch === undefined ? -1.15 : this.dropPitch;
    if (p.drop.phase === 'bus') this.dropPitch = -1.05;
    else if (air) this.dropPitch = lerp(-1.15, -0.45, 1 - p.drop.h);   // beim Sinken flacher
    else this.dropPitch = null;

    // Kopfbewegung beim Laufen, gedämpft damit sie nicht seekrank macht
    const speed = Math.hypot(p.x - (this.lx || p.x), p.y - (this.lz || p.y)) / Math.max(dt, .001);
    this.lx = p.x; this.lz = p.y;
    this.bobT = (this.bobT || 0) + dt * clamp(speed / 200, 0, 1.6) * 9;
    const bob = Math.sin(this.bobT) * clamp(speed / 260, 0, 1) * 2.4;
    const roll = Math.cos(this.bobT * .5) * clamp(speed / 260, 0, 1) * 0.012;

    this.cam.position.set(p.x, y + bob, p.y);
    // Welt-Winkel -> Kamera: aimAng 0 zeigt nach +x, three.js blickt nach -z
    const pitch = this.dropPitch !== null && this.dropPitch !== undefined
      ? this.dropPitch + clamp(p.pitch || 0, -0.5, 0.5)   // im Fall zusaetzlich frei umschauen
      : (p.pitch || 0);
    this.cam.rotation.set(pitch, -(p.aimAng || 0) - Math.PI / 2, roll);

    // Waffe folgt der Kamera verzögert (Trägheit) und zuckt beim Schuss
    const g = p.gun;
    this.applyViewWeapon(g);
    this.vm.visible = !air && p.alive && Game.state === 'play';
    const kick = p.muzzle > 0 ? 1 : 0;
    this.vmKick = lerp(this.vmKick || 0, kick, dt * (kick ? 40 : 9));
    const vb = this.vmBase, walking = Input.move.mag > .1;
    this.vm.position.set(vb.x - (walking ? Math.sin(this.bobT) * 1.3 : 0),
                         vb.y + (walking ? Math.cos(this.bobT * 2) * .8 : 0) - this.vmKick * 1.1,
                         vb.z + this.vmKick * 4);
    this.vm.rotation.set(0.03 + this.vmKick * 0.17, -0.09, 0.05);
    this.vm.scale.setScalar(g ? 0.55 : 0.42);
    this.flash.material.opacity = p.muzzle > 0 ? 0.95 : 0;
    this.flash.scale.setScalar(p.muzzle > 0 ? rnd(0.7, 1.4) : 1);
    this.muzzleLight.intensity = p.muzzle > 0 ? 4.2 : 0;
  },

  /** Setzt einen Quader zwischen zwei Punkte — die Grundoperation fuer jedes
      Gliedmassen-Segment. Ohne sie muesste jeder Arm von Hand rotiert werden. */
  seg(mesh, i, ax, ay, az, bx, by, bz, thick, col) {
    const A = this._a || (this._a = new THREE.Vector3());
    const B = this._b || (this._b = new THREE.Vector3());
    const D = this._d || (this._d = new THREE.Vector3());
    const UP = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    A.set(ax, ay, az); B.set(bx, by, bz);
    D.subVectors(B, A);
    const len = D.length() || 0.001;
    D.divideScalar(len);
    this.quat.setFromUnitVectors(UP, D);
    this.v3.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    this.sc.set(thick, len, thick);
    this.mat4.compose(this.v3, this.quat, this.sc);
    mesh.setMatrixAt(i, this.mat4);
    if (col && mesh.instanceColor) mesh.setColorAt(i, col);
  },

  /** Quader mit eigener Ausrichtung (Rumpf, Kopf, Rucksack, Waffenteile) */
  put(mesh, i, x, y, z, sx, sy, sz, q, col) {
    this.v3.set(x, y, z); this.sc.set(sx, sy, sz);
    this.mat4.compose(this.v3, q, this.sc);
    mesh.setMatrixAt(i, this.mat4);
    if (col && mesh.instanceColor) mesh.setColorAt(i, col);
  },

  /** Eine Waffe an Position und Ausrichtung. `gi` zaehlt ueber alle Waffen —
      in der Hand und am Boden — weil beide dieselben Meshes benutzen. */
  drawGun(gi, id, rar, ox, oy, oz, fx, fz, tilt, upright) {
    const S = GUN_SHAPE[id] || GUN_SHAPE.ar;
    const E = this.eul, Q = this.quat2 || (this.quat2 = new THREE.Quaternion());
    const yaw = Math.atan2(fx, fz);
    E.set(tilt || 0, yaw, upright ? 0 : 0, 'YXZ');
    // Ausrichtung des Laufs: entlang der Blickrichtung liegend
    const qBody = this._qb || (this._qb = new THREE.Quaternion());
    E.set(0, yaw, tilt || 0); qBody.setFromEuler(E);
    const C = this._gc || (this._gc = new THREE.Color());
    C.set(RARITY[rar] ? RARITY[rar].col : '#8a8f98').multiplyScalar(0.55).addScalar(0.16);

    const bl = S.body[0];
    this.put(this.dyn.gunBody, gi, ox, oy, oz, S.body[2], S.body[1], bl, qBody, C);

    // Lauf ragt nach vorn, Zylinder zeigt in +y -> um 90 Grad kippen
    const bx = ox + fx * (bl / 2 + S.barrel[1] / 2), bz = oz + fz * (bl / 2 + S.barrel[1] / 2);
    const qBar = this._qr || (this._qr = new THREE.Quaternion());
    E.set(Math.PI / 2 + (tilt || 0), 0, 0);
    const qPitch = this._qp || (this._qp = new THREE.Quaternion());
    qPitch.setFromEuler(E);
    const qYaw = this._qy || (this._qy = new THREE.Quaternion());
    E.set(0, yaw, 0); qYaw.setFromEuler(E);
    qBar.copy(qYaw).multiply(qPitch);
    this.put(this.dyn.gunBarrel, gi, bx, oy + S.body[1] * 0.12, bz,
             S.barrel[0], S.barrel[1], S.barrel[0], qBar);

    // Magazin unter dem Verschluss
    this.put(this.dyn.gunMag, gi, ox - fx * bl * 0.08, oy - S.body[1] * 0.55 - S.mag[1] * 0.4,
             oz - fz * bl * 0.08, S.mag[0], S.mag[1], S.mag[2], qBody);
  },

  updateActors(p) {
    const D = this.dyn;
    const M = this.mat4, Q = this.quat, E = this.eul, C = this.col;
    const skin = this._skin || (this._skin = new THREE.Color('#e0b189'));
    const white = this._white || (this._white = new THREE.Color('#ffffff'));
    let n = 0, gi = 0;
    const far2 = 2600 * 2600;
    const MAXDRAW = 34;                       // reicht fuers Sichtfeld, spart Rechenzeit

    for (const a of Game.actors) {
      if (!a.alive || a === p) continue;
      if (a.drop.phase === 'bus') continue;
      if (dist2(a.x, a.y, p.x, p.y) > far2) continue;
      if (n >= MAXDRAW) break;
      const air = a.drop.phase !== 'ground';
      const base = air ? a.drop.h * 3000 : 0;
      const hurt = a.hurtT > 0;
      C.set(hurt ? '#ffffff' : ACTOR_COLS[a.color % ACTOR_COLS.length]);
      const legCol = hurt ? white : (this._pants || (this._pants = new THREE.Color('#39435c')));

      const H = BODY_H;
      const c = Math.cos(a.aimAng), sn = Math.sin(a.aimAng);
      const rx = -sn, rz = c;                                  // Rechtsvektor
      E.set(0, -a.aimAng - Math.PI / 2, 0); Q.setFromEuler(E);

      // Schrittphase aus der zurueckgelegten Strecke: laeuft nur, wer laeuft
      const moved = a.lastX === undefined ? 0 : dist(a.x, a.y, a.lastX, a.lastY);
      a.lastX = a.x; a.lastY = a.y;
      a.step = (a.step || 0) + moved * 0.055;
      a.gait = lerp(a.gait || 0, Math.min(1, moved * 14), 0.25);   // 0 = steht, 1 = laeuft
      const ph = a.step, g = a.gait * (air ? 0.2 : 1);
      const swing = Math.sin(ph) * 0.55 * g;
      const knee = Math.max(0, -Math.cos(ph)) * 0.5 * g;

      // --- Rumpf, Huefte, Kopf, Rucksack
      const hipY = base + H * 0.44, chestY = base + H * 0.63, headY = base + H * 0.87;
      this.put(D.hips, n, a.x, hipY, a.y, 22, H * 0.10, 15, Q, legCol);
      this.put(D.torso, n, a.x, chestY, a.y, 23, H * 0.26, 15, Q, C);
      this.put(D.head, n, a.x + c * 1.5, headY, a.y + sn * 1.5, 14, 14.5, 13.5, Q, hurt ? white : skin);
      // Muetze in Trikotfarbe: sonst verschwimmt der Hautton mit dem Rumpf
      this.put(D.cap, n, a.x + c * 1.5, headY + 8.5, a.y + sn * 1.5, 15, 5, 14.5, Q, C);
      this.put(D.pack, n, a.x - c * 11, base + H * 0.66, a.y - sn * 11, 15, H * 0.20, 7, Q,
               this._packc || (this._packc = new THREE.Color('#5d6440')));

      // --- Beine: Oberschenkel schwingt, Knie knickt nach hinten
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1, sw = k ? swing : -swing, kn = k ? knee : Math.max(0, Math.cos(ph)) * 0.5 * g;
        const hx = a.x + rx * side * 6.5, hz = a.y + rz * side * 6.5;
        const kx = hx + c * Math.sin(sw) * H * 0.22, kz = hz + sn * Math.sin(sw) * H * 0.22;
        const kY = hipY - Math.cos(sw) * H * 0.22;
        const ax2 = kx + c * Math.sin(sw - kn) * H * 0.21, az2 = kz + sn * Math.sin(sw - kn) * H * 0.21;
        const aY = kY - Math.cos(sw - kn) * H * 0.21;
        this.seg(D.limb, n * 8 + k * 2, hx, hipY, hz, kx, kY, kz, 8.5, legCol);
        this.seg(D.limb, n * 8 + k * 2 + 1, kx, kY, kz, ax2, aY, az2, 7.5, legCol);
        this.put(D.boot, n * 2 + k, ax2 + c * 2.5, aY + 2.5, az2 + sn * 2.5, 8, 5, 12, Q,
                 this._bootc || (this._bootc = new THREE.Color('#2c2a26')));
      }

      // --- Arme: bewaffnet greifen beide nach vorn an die Waffe,
      //     unbewaffnet pendeln sie gegenlaeufig zu den Beinen
      const armed = !!a.gun;
      const shY = base + H * 0.74;
      const hands = [];
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        const sx = a.x + rx * side * 13.5, sz = a.y + rz * side * 13.5;
        let ex, ez, eY, wx, wz, wY;
        if (armed) {
          const reach = k ? 20 : 12;                       // rechte Hand weiter vorn
          ex = sx + c * reach * 0.5 + rx * side * -2; ez = sz + sn * reach * 0.5 + rz * side * -2;
          eY = shY - H * 0.13;
          wx = a.x + c * (16 + reach * 0.35) + rx * 4; wz = a.y + sn * (16 + reach * 0.35) + rz * 4;
          wY = base + H * 0.60;
        } else {
          const sw2 = k ? -swing : swing;
          ex = sx + c * Math.sin(sw2) * H * 0.20; ez = sz + sn * Math.sin(sw2) * H * 0.20;
          eY = shY - Math.cos(sw2) * H * 0.20;
          wx = ex + c * Math.sin(sw2 * 0.6) * H * 0.19; wz = ez + sn * Math.sin(sw2 * 0.6) * H * 0.19;
          wY = eY - Math.cos(sw2 * 0.6) * H * 0.19;
        }
        this.seg(D.limb, n * 8 + 4 + k * 2, sx, shY, sz, ex, eY, ez, 7.5, C);
        this.seg(D.limb, n * 8 + 4 + k * 2 + 1, ex, eY, ez, wx, wY, wz, 6.5, C);
        this.put(D.hand, n * 2 + k, wx, wY, wz, 6, 6, 6, Q, hurt ? white : skin);
        hands.push({ x: wx, y: wY, z: wz });
      }

      // --- Waffe in den Haenden
      if (armed && gi < D.gunBody.instanceMatrix.count) {
        const h = hands[1];
        this.drawGun(gi++, a.gun.id, a.gun.rar, h.x + c * 3, h.y + 2, h.z + sn * 3, c, sn, 0);
      }

      this.put(D.shadow, n, a.x, base + 1.5, a.y, 24, 1, 24,
               this.quatId || (this.quatId = new THREE.Quaternion()));
      n++;
    }

    // --- Waffen am Boden: liegend, leicht gedreht, statt schwebender Wuerfel
    const r2 = 1500 * 1500;
    for (const l of World.loot) {
      if (l.taken || !l.data || l.data.kind !== 'gun') continue;
      if (gi >= D.gunBody.instanceMatrix.count) break;
      if (dist2(l.x, l.y, p.x, p.y) > r2) continue;
      const ang = l.bob;                                  // fester Winkel je Fundstueck
      this.drawGun(gi++, l.data.id, l.data.rar, l.x, 7, l.y, Math.cos(ang), Math.sin(ang), 0);
    }

    for (const k of ['torso', 'hips', 'head', 'cap', 'pack', 'shadow']) {
      D[k].count = n; D[k].instanceMatrix.needsUpdate = true;
      if (D[k].instanceColor) D[k].instanceColor.needsUpdate = true;
    }
    D.limb.count = n * 8; D.limb.instanceMatrix.needsUpdate = true;
    if (D.limb.instanceColor) D.limb.instanceColor.needsUpdate = true;
    for (const k of ['hand', 'boot']) {
      D[k].count = n * 2; D[k].instanceMatrix.needsUpdate = true;
      if (D[k].instanceColor) D[k].instanceColor.needsUpdate = true;
    }
    for (const k of ['gunBody', 'gunBarrel', 'gunMag']) {
      D[k].count = gi; D[k].instanceMatrix.needsUpdate = true;
      if (D[k].instanceColor) D[k].instanceColor.needsUpdate = true;
    }
  },

  updateLoot(p) {
    const L = this.dyn.loot, B = this.dyn.bottle, CH = this.dyn.chest;
    const M = this.mat4, Q = this.quat, E = this.eul, P = this.v3, S = this.sc, C = this.col;
    let n = 0, m = 0, ch = 0;
    const r2 = 1500 * 1500;
    for (const l of World.loot) {
      if (l.taken || !l.data) continue;
      if (l.data.kind === 'gun') continue;          // Waffen zeichnet updateActors
      if (dist2(l.x, l.y, p.x, p.y) > r2) continue;
      // leichtes Wippen statt Rotation: es soll am Boden liegen, nicht schweben
      const bob = Math.sin(this.time * 1.8 + l.bob) * 1.2;
      E.set(0, l.bob * 3, 0); Q.setFromEuler(E);
      if (l.data.kind === 'con') {
        C.set(CONSUM[l.data.id] && (l.data.id === 'mini' || l.data.id === 'big') ? '#5ad2ff' : '#7fe0a0');
        P.set(l.x, 9 + bob, l.y); S.set(8, 18, 8);
        M.compose(P, Q, S); B.setMatrixAt(m, M); B.setColorAt(m, C); m++;
      } else {
        C.set(l.data.kind === 'ammo' ? '#b39a63' : '#9aa7b8');
        P.set(l.x, 6 + bob, l.y); S.set(19, 12, 13);
        M.compose(P, Q, S); L.setMatrixAt(n, M); L.setColorAt(n, C); n++;
      }
      if (n >= L.instanceMatrix.count || m >= B.instanceMatrix.count) break;
    }
    for (const c of World.chests) {
      if (ch >= 120) break;
      if (dist2(c.x, c.y, p.x, p.y) > r2) continue;
      E.set(0, 0, 0); Q.setFromEuler(E);
      P.set(c.x, 17, c.y); S.set(46, 34, 32);
      M.compose(P, Q, S); CH.setMatrixAt(ch, M);
      C.set(c.open ? '#5d4f34' : '#e0a83c'); CH.setColorAt(ch, C);
      ch++;
    }
    L.count = n; B.count = m; CH.count = ch;
    for (const mesh of [L, B, CH]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  },

  updateBuilt(p) {
    const B = this.dyn.built;
    const M = this.mat4, Q = this.quat, P = this.v3, S = this.sc, C = this.col;
    Q.identity();
    let n = 0;
    const r2 = 2400 * 2400;
    for (const s of World.structures) {
      if (s.hp <= 0 || n >= 900) continue;
      if (dist2(s.x, s.y, p.x, p.y) > r2) continue;
      const grow = s.buildT > 0 ? clamp(1 - s.buildT / s.build, .15, 1) : 1;
      const w = s.bx2 - s.bx, d = s.by2 - s.by;
      P.set(s.x, BUILT_H * grow / 2, s.y);
      S.set(w, BUILT_H * grow, d);
      M.compose(P, Q, S); B.setMatrixAt(n, M);
      const info = MAT_INFO[s.mat];
      C.set(info.col).multiplyScalar(0.45 + 0.55 * (s.hp / s.maxHp));
      B.setColorAt(n, C);
      n++;
    }
    B.count = n;
    B.instanceMatrix.needsUpdate = true;
    if (B.instanceColor) B.instanceColor.needsUpdate = true;
  },

  updateStorm(p) {
    const z = Game.zone;
    const r = Math.max(2, z.r);
    this.storm.position.set(z.x, 900, z.y);
    this.storm.scale.set(r, 1800, r);
    this.stormTex.offset.y = this.time * 0.06;
    this.stormTex.repeat.set(Math.max(6, r / 90), 1);
    // je näher die Wand, desto dichter der Nebel — man spürt den Sturm kommen
    const edge = dist(p.x, p.y, z.x, z.y) - r;
    const inside = edge < 0;
    this.scene.fog.near = inside ? 600 : 90;
    this.scene.fog.far = inside ? 3500 : 780;
    this.scene.fog.color.set(inside ? 0xa6c6e0 : 0x8b4fd0);
    this.ren.setClearColor(inside ? 0x8fb6d8 : 0x8b4fd0);
    this.sky.visible = inside;
  },

  /** Leuchtspuren aus den aktiven Geschossen */
  updateTracers() {
    const pos = this.tracerMesh.geometry.attributes.position;
    const arr = pos.array;
    let i = 0;
    for (const b of Game.bullets) {
      if (!b.on || i >= 240) continue;
      const n = Math.hypot(b.vx, b.vy, b.vz || 0) || 1;
      const len = b.rocket ? 30 : 70;
      const o = i * 6;
      arr[o]     = b.x; arr[o + 1] = b.y3 !== undefined ? b.y3 : EYE; arr[o + 2] = b.y;
      arr[o + 3] = b.x - b.vx / n * len;
      arr[o + 4] = (b.y3 !== undefined ? b.y3 : EYE) - (b.vz || 0) / n * len;
      arr[o + 5] = b.y - b.vy / n * len;
      i++;
    }
    for (let j = i; j < 240; j++) { const o = j * 6; for (let k = 0; k < 6; k++) arr[o + k] = 0; }
    pos.needsUpdate = true;
    this.tracerMesh.geometry.setDrawRange(0, i * 2);
  },

  /** Treffer-, Bau- und Explosionsblitze */
  spark(x, y, z, size, life) {
    if (this.fx.length > 150) return;
    this.fx.push({ x, y, z, s: size, life, max: life });
  },

  updateSparks(dt) {
    const S3 = this.dyn.spark;
    const M = this.mat4, Q = this.quat, P = this.v3, S = this.sc;
    Q.identity();
    let n = 0;
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.life -= dt;
      if (f.life <= 0) { this.fx.splice(i, 1); continue; }
      if (n >= 160) continue;
      const t = f.life / f.max;
      P.set(f.x, f.y, f.z);
      S.setScalar(f.s * (1.25 - t * 0.55));
      M.compose(P, Q, S); S3.setMatrixAt(n, M);
      n++;
    }
    S3.count = n;
    S3.instanceMatrix.needsUpdate = true;
    S3.material.opacity = 0.85;
  }
});

// InstancedMesh merkt sich seine Höchstzahl nicht — hier nachreichen,
// damit updateActors nicht über das Ende des Puffers hinausschreibt.
R3D._capInit = function () {
  for (const k in this.dyn) this.dyn[k].count_max = this.dyn[k].instanceMatrix.count;
};
