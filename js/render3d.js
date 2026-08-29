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
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xa6c6e0, 600, 3500);

    this.cam = new THREE.PerspectiveCamera(78, 1, 4, 5200);
    this.cam.rotation.order = 'YXZ';

    // Licht: eine Sonne für Plastizität, Himmelslicht gegen tote schwarze Flächen
    const sun = new THREE.DirectionalLight(0xfff0cf, 0.95);
    sun.position.set(-0.5, 0.85, 0.28);
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
      uniforms: { top: { value: new THREE.Color(0x2f6fb8) }, bot: { value: new THREE.Color(0xcfe2f0) } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float h; uniform vec3 top; uniform vec3 bot; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.55, h)), 1.0); }'
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
    const geo = new THREE.PlaneGeometry(MAP, MAP);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
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
    const rock = new THREE.DodecahedronGeometry(1, 0);
    const blob = new THREE.CircleGeometry(1, 10); blob.rotateX(-Math.PI / 2);
    const geos = { box, trunk, leaf, rock, blob };
    const mats = {
      box:   new THREE.MeshLambertMaterial({ color: 0xffffff }),   // Farbe je Instanz
      trunk: new THREE.MeshLambertMaterial({ color: 0x6b4c2a }),
      leaf:  new THREE.MeshLambertMaterial({ color: 0x3f7a3c, flatShading: true }),
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
      if (!b) { b = { box: [], trunk: [], leaf: [], rock: [], blob: [] }; bins.set(k, b); }
      b[type].push(item);
    };
    for (const o of World.obstacles) { o.kind = o.solid ? 'wall' : 'floor'; put(o.x + o.w / 2, o.y + o.h / 2, 'box', o); }
    for (const p of World.props) {
      if (p.type === 'tree') { put(p.x, p.y, 'trunk', p); put(p.x, p.y, 'leaf', p); }
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
        for (let i = 0; i < items.length; i++) {
          const o = items[i];
          if (type === 'box') {
            if (o.kind === 'wall')       { P.set(o.x + o.w / 2, WALL_H / 2, o.y + o.h / 2); S.set(o.w, WALL_H, o.h); Q.identity(); }
            else if (o.kind === 'floor') { P.set(o.x + o.w / 2, 2, o.y + o.h / 2);          S.set(o.w, 4, o.h);      Q.identity(); }
            else                         { const r = o.r * .8; P.set(o.x, r, o.y); S.set(r * 2, r * 2, r * 2);
                                           E.set(0, (o.x % 7) * .2, 0); Q.setFromEuler(E); }
          }
          else if (type === 'trunk'){ const h = 150 * o.s; P.set(o.x, h / 2, o.y); S.set(9, h, 9); Q.identity(); }
          else if (type === 'leaf') { const h = 150 * o.s; P.set(o.x, h + 34 * o.s, o.y); const r = 58 * o.s; S.set(r, r * .78, r);
                                      E.set(o.sway, o.sway * 1.7, 0); Q.setFromEuler(E); }
          else if (type === 'rock') { const r = o.r * .62; P.set(o.x, r * .72, o.y); S.set(r * 1.5, r * 1.35, r * 1.5);
                                      E.set(0.3, o.x % 3, 0.2); Q.setFromEuler(E); }
          else                      { const r = (o.type === 'tree' ? 46 * o.s : o.r * 1.1);
                                      P.set(o.x, 1.2, o.y); S.set(r, 1, r); Q.identity(); }
          M.compose(P, Q, S);
          mesh.setMatrixAt(i, M);
        }
        if (type === 'box') {
          const C = new THREE.Color();
          for (let i = 0; i < items.length; i++) {
            const o = items[i];
            C.set(o.kind === 'wall' ? 0xa8a294 : o.kind === 'floor' ? 0x5f584d : 0x8d6a3a);
            mesh.setColorAt(i, C);
          }
          mesh.instanceColor.needsUpdate = true;
        } else if (type === 'leaf' || type === 'rock' || type === 'trunk') {
          const C = new THREE.Color();
          for (let i = 0; i < items.length; i++) {
            const o = items[i];
            const j = (Math.sin(o.x * 12.9898 + o.y * 78.233) * 43758.5453) % 1;
            const t = (j < 0 ? j + 1 : j);
            if (type === 'leaf') C.setHSL(0.26 + t * 0.055, 0.42 + t * 0.16, 0.26 + t * 0.14);
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

    // Figuren: Rumpf, Kopf, Waffe und ein weicher Bodenschatten
    this.dyn.body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), MAXA);
    this.dyn.head = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), MAXA);
    this.dyn.gun  = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0x2b2f38), MAXA);
    const disc = new THREE.CircleGeometry(1, 12); disc.rotateX(-Math.PI / 2);
    this.dyn.shadow = new THREE.InstancedMesh(disc,
      new THREE.MeshBasicMaterial({ color: 0x101c10, transparent: true, opacity: .34, depthWrite: false }), MAXA);

    // Loot schwebt und dreht sich, damit es auf Distanz auffällt
    this.dyn.loot = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), MAXL);
    this.dyn.chest = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xd9a13a), 120);
    // gebaute Wände
    this.dyn.built = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lam(0xffffff), MAXB);

    for (const k in this.dyn) {
      const m = this.dyn[k];
      m.frustumCulled = false;
      m.count = 0;
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

  /** Waffe am unteren Bildrand — verkauft die Ego-Perspektive */
  buildViewModel() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 34), new THREE.MeshLambertMaterial({ color: 0x33383f }));
    body.position.set(0, 0, -14);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 22, 6), new THREE.MeshLambertMaterial({ color: 0x22262c }));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.4, -34);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(5.5, 12, 6), new THREE.MeshLambertMaterial({ color: 0x4a3524 }));
    grip.position.set(0, -7, -6); grip.rotation.x = -0.22;
    g.add(body, barrel, grip);
    g.position.set(11, -9, -20);
    this.vm = g;
    this.flash = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, fog: false }));
    this.flash.position.set(0, 1.4, -47);
    g.add(this.flash);
    this.cam.add(g);
    this.scene.add(this.cam);
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
      for (let i = 0; i < list.length; i++) list[i].visible = vis;
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
    this.vm.visible = !air && p.alive && Game.state === 'play';
    const kick = p.muzzle > 0 ? 1 : 0;
    this.vmKick = lerp(this.vmKick || 0, kick, dt * (kick ? 40 : 9));
    this.vm.position.set(11 - (Input.move.mag > .1 ? Math.sin(this.bobT) * 1.6 : 0),
                         -9 + (Input.move.mag > .1 ? Math.cos(this.bobT * 2) * .9 : 0) - this.vmKick * 1.2,
                         -20 + this.vmKick * 5);
    this.vm.rotation.x = this.vmKick * 0.16;
    this.vm.scale.setScalar(g ? 1 : 0.62);
    this.flash.material.opacity = p.muzzle > 0 ? 0.95 : 0;
    this.flash.scale.setScalar(p.muzzle > 0 ? rnd(0.7, 1.4) : 1);
  },

  updateActors(p) {
    const body = this.dyn.body, head = this.dyn.head, gun = this.dyn.gun, sh = this.dyn.shadow;
    const M = this.mat4, Q = this.quat, E = this.eul, P = this.v3, S = this.sc, C = this.col;
    let n = 0;
    const far2 = 2600 * 2600;
    for (const a of Game.actors) {
      if (!a.alive || a === p) continue;
      if (a.drop.phase === 'bus') continue;
      if (dist2(a.x, a.y, p.x, p.y) > far2) continue;
      if (n >= body.count_max) break;
      const air = a.drop.phase !== 'ground';
      const base = air ? a.drop.h * 3000 : 0;
      const hex = ACTOR_COLS[a.color % ACTOR_COLS.length];
      C.set(a.hurtT > 0 ? '#ffffff' : hex);

      E.set(0, -a.aimAng - Math.PI / 2, 0); Q.setFromEuler(E);
      P.set(a.x, base + BODY_H * 0.42, a.y); S.set(30, BODY_H * .62, 20);
      M.compose(P, Q, S); body.setMatrixAt(n, M); body.setColorAt(n, C);

      P.set(a.x, base + BODY_H * 0.87, a.y); S.set(17, 17, 17);
      M.compose(P, Q, S); head.setMatrixAt(n, M);
      C.set(a.hurtT > 0 ? '#ffffff' : '#e0b189');
      head.setColorAt(n, C);
      C.set(a.hurtT > 0 ? '#ffffff' : hex);

      // Waffe waagerecht vor der Brust in Blickrichtung
      const c = Math.cos(a.aimAng), s2 = Math.sin(a.aimAng);
      P.set(a.x + c * 20, base + BODY_H * 0.62, a.y + s2 * 20);
      S.set(a.gun ? 30 : 14, 6, 6);
      M.compose(P, Q, S); gun.setMatrixAt(n, M);

      P.set(a.x, base + 1.5, a.y); S.set(22, 1, 22);
      M.compose(P, this.quatId || (this.quatId = new THREE.Quaternion()), S);
      sh.setMatrixAt(n, M);
      n++;
    }
    for (const m of [body, head, gun, sh]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  },

  updateLoot(p) {
    const L = this.dyn.loot, CH = this.dyn.chest;
    const M = this.mat4, Q = this.quat, E = this.eul, P = this.v3, S = this.sc, C = this.col;
    let n = 0, m = 0;
    const r2 = 1700 * 1700;
    for (const l of World.loot) {
      if (l.taken || n >= 700) continue;
      if (dist2(l.x, l.y, p.x, p.y) > r2) continue;
      const bob = Math.sin(this.time * 2.2 + l.bob) * 5;
      E.set(0, this.time * 1.3 + l.bob, 0.35); Q.setFromEuler(E);
      P.set(l.x, 30 + bob, l.y); S.set(15, 15, 15);
      M.compose(P, Q, S); L.setMatrixAt(n, M);
      C.set(l.data.kind === 'gun' ? RARITY[l.data.rar].col : l.data.kind === 'ammo' ? '#c8b48a' : '#7fe0b0');
      L.setColorAt(n, C);
      n++;
    }
    for (const c of World.chests) {
      if (m >= 120) break;
      if (dist2(c.x, c.y, p.x, p.y) > r2) continue;
      E.set(0, 0, 0); Q.setFromEuler(E);
      P.set(c.x, 17, c.y); S.set(44, 34, 30);
      M.compose(P, Q, S); CH.setMatrixAt(m, M);
      C.set(c.open ? '#5d4f34' : '#e0a83c'); CH.setColorAt(m, C);
      m++;
    }
    L.count = n; CH.count = m;
    L.instanceMatrix.needsUpdate = true; CH.instanceMatrix.needsUpdate = true;
    if (L.instanceColor) L.instanceColor.needsUpdate = true;
    if (CH.instanceColor) CH.instanceColor.needsUpdate = true;
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
