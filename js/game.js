'use strict';
/* ============================================================
   SCHOTTER ROYALE — game: match flow, player, bullets, render
   ============================================================ */

const Game = {
  state: 'menu',                 // menu | bus | drop | play | result
  canvas: null, ctx: null,
  W: 0, H: 0, dpr: 1, zoom: 1,
  cam: { x: MAP / 2, y: MAP / 2 },
  actors: [], bots: [], player: null,
  bullets: [], parts: [], texts: [], rings: [],
  aGrid: new Grid(240),
  _tmp: [], _q: [], _q2: [],
  time: 0, alive: 0, total: 0,
  zone: { x: MAP / 2, y: MAP / 2, r: MAP * 0.72, ox: 0, oy: 0, or: 0, nx: 0, ny: 0, nr: 0, phase: 0, t: 0, mode: 'wait', dps: 0 },
  bus: { x: 0, y: 0, ang: 0, t: 0 },
  bCur: 0, pCur: 0,
  build: { on: false, kind: 'wall', mat: 'wood' },
  feed: [], hintItem: null, lowFx: false,

  opts: {
    bots: 100, diff: 'normal', autofire: true, aim: 2,
    speed: 1, sound: true, hand: 0, quality: 0
  },

  /* ------------------------------------------------------ boot */
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.mapC = document.getElementById('mapC');
    this.mapX = this.mapC.getContext('2d');
    this.el = {
      hud: document.getElementById('hud'), menu: document.getElementById('menu'),
      result: document.getElementById('result'), slots: document.getElementById('slots'),
      hp: document.querySelector('#hpBar i'), hpT: document.querySelector('#hpBar span'),
      sh: document.querySelector('#shBar i'), shT: document.querySelector('#shBar span'),
      wood: document.getElementById('mWood'), brick: document.getElementById('mBrick'), metal: document.getElementById('mMetal'),
      alive: document.getElementById('alive'), storm: document.getElementById('storm'), kills: document.getElementById('kills'),
      feed: document.getElementById('feed'), toast: document.getElementById('toast'), hint: document.getElementById('hint'),
      flash: document.getElementById('dmgFlash'), buildBar: document.getElementById('buildBar'),
      stats: document.getElementById('stats'), res: document.getElementById('res'),
      resT: document.getElementById('resT'), resS: document.getElementById('resS')
    };
    Store.load();
    Object.assign(this.opts, Store.data.opts || {});
    this.buildSlots();          // must exist before Input caches hitboxes
    Input.init();
    Input.leftHanded = this.opts.hand === 1;
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));

    document.getElementById('play').onclick = () => this.startMatch();
    document.getElementById('again').onclick = () => this.startMatch();
    document.getElementById('toMenu').onclick = () => this.toMenu();
    document.querySelectorAll('.opt').forEach(b => b.onclick = () => this.cycleOpt(b.dataset.opt));
    this.refreshOpts();
    this.refreshStats();

    // background canvas for the ground texture (drawn once)
    this.groundPat = this.makeGround();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  },

  resize() {
    const q = this.opts.quality;
    const maxDpr = q === 2 ? 1 : q === 1 ? 3 : 2;
    this.dpr = Math.min(devicePixelRatio || 1, maxDpr);
    this.W = innerWidth; this.H = innerHeight;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + 'px';
    this.canvas.style.height = this.H + 'px';
    this.zoom = clamp(Math.min(this.W, this.H) / 660, 0.32, 1.15);
    this.lowFx = (this.W * this.H > 900000) || this.opts.quality === 2;
    Input.cache();
  },

  /** subtle repeating dirt/grass pattern so the ground isn't flat colour */
  makeGround() {
    const s = 256, c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.fillStyle = '#2f4a35'; g.fillRect(0, 0, s, s);
    const R = mulberry32(7);
    for (let i = 0; i < 900; i++) {
      const x = R() * s, y = R() * s, r = 1 + R() * 4;
      g.fillStyle = R() < 0.5 ? `rgba(40,74,48,${0.25 + R() * 0.4})` : `rgba(70,96,60,${0.15 + R() * 0.3})`;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
    for (let i = 0; i < 90; i++) {                 // gravel specks — it is called Schotter after all
      const x = R() * s, y = R() * s;
      g.fillStyle = `rgba(150,145,130,${0.10 + R() * 0.18})`;
      g.fillRect(x, y, 1 + R() * 2, 1 + R() * 2);
    }
    return this.ctx.createPattern(c, 'repeat');
  },

  /* ------------------------------------------------------ options */
  cycleOpt(k) {
    const o = this.opts;
    switch (k) {
      case 'bots': o.bots = o.bots >= 120 ? 30 : o.bots === 100 ? 120 : o.bots === 75 ? 100 : o.bots === 50 ? 75 : 50; break;
      case 'diff': o.diff = DIFF_ORDER[(DIFF_ORDER.indexOf(o.diff) + 1) % 4]; break;
      case 'autofire': o.autofire = !o.autofire; break;
      case 'aim': o.aim = (o.aim + 1) % 3; break;
      case 'speed': o.speed = (o.speed + 1) % 3; break;
      case 'sound': o.sound = !o.sound; Snd.mute(o.sound); break;
      case 'hand': o.hand = o.hand ? 0 : 1; Input.leftHanded = o.hand === 1; break;
      case 'quality': o.quality = (o.quality + 1) % 3; this.resize(); break;
    }
    Store.data.opts = o; Store.save();
    this.refreshOpts();
  },

  refreshOpts() {
    const o = this.opts;
    const txt = {
      bots: o.bots, diff: DIFF[o.diff].name,
      autofire: o.autofire ? 'An' : 'Aus',
      aim: ['Aus', 'Normal', 'Stark'][o.aim],
      speed: ['Normal', 'Schnell', 'Blitz'][o.speed],
      sound: o.sound ? 'An' : 'Aus',
      hand: o.hand ? 'Links' : 'Rechts',
      quality: ['Auto', 'Hoch', 'Sparsam'][o.quality]
    };
    document.querySelectorAll('.opt').forEach(b => {
      const k = b.dataset.opt;
      b.innerHTML = b.textContent.split(':')[0] + ': <b>' + txt[k] + '</b>';
    });
  },

  refreshStats() {
    const d = Store.data;
    this.el.stats.innerHTML = d.matches
      ? `${d.matches} Matches · <b style="color:#ffd76a">${d.wins} Siege</b> · ${d.kills} Kills gesamt · Rekord ${d.best} Kills`
      : 'Noch kein Match gespielt — viel Erfolg!';
  },

  /* ------------------------------------------------------ match setup */
  startMatch() {
    Snd.init(); Snd.mute(this.opts.sound);
    AI.D = DIFF[this.opts.diff];
    this.timeScale = [1, 0.62, 0.42][this.opts.speed];

    World.gen((Math.random() * 1e9) | 0);
    ACTOR_ID = 1;
    this.actors.length = 0; this.bots.length = 0;
    this.bullets.length = 0; this.parts.length = 0; this.texts.length = 0; this.rings.length = 0;
    this.feed.length = 0; this.el.feed.innerHTML = '';
    this.time = 0; this.matchT = 0;

    const p = new Actor('Du', false);
    p.color = 8;
    this.player = p; this.actors.push(p);

    const names = BOT_NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) { const j = rndi(0, i); [names[i], names[j]] = [names[j], names[i]]; }
    for (let i = 0; i < this.opts.bots; i++) {
      const b = AI.spawn(names[i % names.length] + (i >= names.length ? '_' + (1 + ((i / names.length) | 0)) : ''));
      AI.equip(b);
      this.bots.push(b); this.actors.push(b);
    }
    this.total = this.alive = this.actors.length;

    // --- battle bus: a random chord across the island
    const a = rnd(TAU);
    const cx = MAP / 2, cy = MAP / 2, rad = MAP * 0.78;
    this.bus.x = cx - Math.cos(a) * rad / 2;
    this.bus.y = cy - Math.sin(a) * rad / 2;
    this.bus.ang = a; this.bus.t = 0;
    this.busEnd = { x: cx + Math.cos(a) * rad / 2, y: cy + Math.sin(a) * rad / 2 };

    for (const A of this.actors) {
      A.x = this.bus.x; A.y = this.bus.y;
      A.drop.phase = 'bus'; A.drop.h = 1;
      A.state = 'drop';
      if (A.isBot) {
        const poi = pick(World.pois);
        A.drop.tx = clamp(poi.x + rnd(-poi.r, poi.r), 100, MAP - 100);
        A.drop.ty = clamp(poi.y + rnd(-poi.r, poi.r), 100, MAP - 100);
        A.drop.at = rnd(0.05, 0.95);          // where along the bus line it bails
      }
    }
    // player picks their landing spot mid-air; seed it ahead of the bus
    this.player.drop.tx = cx; this.player.drop.ty = cy;
    this.busT = 0;
    this.busActive = true;

    // --- storm starts wide and centred-ish
    const z = this.zone;
    z.x = cx + rnd(-MAP * 0.09, MAP * 0.09);
    z.y = cy + rnd(-MAP * 0.09, MAP * 0.09);
    z.r = MAP * 0.70; z.phase = -1; z.mode = 'wait'; z.t = 4; z.dps = 0;
    z.nx = z.x; z.ny = z.y; z.nr = z.r;

    this.build.on = false; this.build.kind = 'wall'; this.build.mat = 'wood';
    this.el.buildBar.classList.add('hide');
    document.getElementById('bBuild').classList.remove('on');

    this.el.hint.classList.add('hide');
    this.el.toast.classList.remove('show');
    this.el.flash.style.opacity = 0;
    this.el.menu.classList.add('hide');
    this.el.result.classList.add('hide');
    this.el.hud.classList.remove('hide');
    this.state = 'bus';
    this.cam.x = this.bus.x; this.cam.y = this.bus.y;
    this.toast('SPRINGEN!', 1.4);
    setTimeout(() => Input.cache(), 50);
    this.updateSlots();
  },

  toMenu() {
    this.state = 'menu';
    this.el.hud.classList.add('hide');
    this.el.result.classList.add('hide');
    this.el.menu.classList.remove('hide');
    Snd.storm(0);
    this.refreshStats();
  },

  /* ------------------------------------------------------ main loop */
  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;                 // never let a hitch teleport anyone
    try {
      if (this.state !== 'menu' && this.state !== 'result') this.update(dt);
      this.render(dt);
      Input.endFrame();
    } catch (e) {
      // A thrown frame must never end the match: keep the loop alive and
      // report it once instead of leaving the player on a frozen screen.
      if (!this.errShown) { this.errShown = true; console.error('Frame-Fehler:', e); }
    } finally {
      requestAnimationFrame(t => this.frame(t));
    }
  },

  update(dt) {
    this.time += dt;
    if (this.state === 'bus') return this.updateBus(dt);
    this.matchT += dt;
    this.advanceBus(dt);       // bots still aboard keep riding to their own drop points

    // spatial index of everyone alive, rebuilt each frame
    this.aGrid.clear();
    for (let i = 0; i < this.actors.length; i++) { const a = this.actors[i]; if (a.alive) this.aGrid.add(a); }

    if (this.state === 'play') this.updateZone(dt);
    this.updatePlayer(dt);

    // --- LOD split
    const px = this.player.x, py = this.player.y;
    const NEAR = 1900 * 1900;
    this.slowT = (this.slowT || 0) + dt;
    const doFar = this.slowT >= 0.25;
    const farDt = this.slowT;
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      if (!b.alive) continue;
      if (b.drop.phase !== 'ground') { this.updateDrop(b, dt); continue; }
      if (b.healT > 0 && b.far) { b.healT -= dt; if (b.healT <= 0) this.finishHeal(b); }
      const near = dist2(b.x, b.y, px, py) < NEAR;
      b.far = !near;
      if (near) AI.think(b, dt, this);
      else if (doFar) AI.thinkFar(b, farDt, this);
      if (b.fireT > 0) b.fireT -= dt;
      if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) this.finishReload(b); }
      if (b.hurtT > 0) b.hurtT -= dt;
      if (b.muzzle > 0) b.muzzle -= dt;
    }
    if (doFar) this.slowT = 0;

    this.updateBullets(dt);
    this.updateStructures(dt);
    this.updateFx(dt);
    if (this.state === 'play') this.applyStorm(dt);
    World.cleanup();
    this.reapDead();
    this.updateHUD();
  },

  /* ------------------------------------------------------ bus & drop */

  /** The bus keeps flying after YOU jump — otherwise every bot that picked a
      later drop point would be stranded on it for the whole match. */
  advanceBus(dt) {
    if (!this.busActive) return;
    const sp = 340;
    this.bus.x += Math.cos(this.bus.ang) * sp * dt;
    this.bus.y += Math.sin(this.bus.ang) * sp * dt;
    const remaining = dist(this.bus.x, this.bus.y, this.busEnd.x, this.busEnd.y);
    const travelled = clamp(1 - remaining / (MAP * 0.78), 0, 1);
    const done = travelled >= 0.995;

    for (const b of this.bots) {
      if (b.drop.phase !== 'bus') continue;
      if (travelled >= b.drop.at || done) { b.drop.phase = 'fall'; b.drop.h = 1; }
      else { b.x = this.bus.x; b.y = this.bus.y; }
    }
    if (done) this.busActive = false;
    return travelled;
  },

  updateBus(dt) {
    this.busT += dt;
    const travelled = this.advanceBus(dt);
    this.cam.x = this.bus.x; this.cam.y = this.bus.y;

    for (const b of this.bots) if (b.drop.phase !== 'bus') this.updateDrop(b, dt);

    const p = this.player;
    p.x = this.bus.x; p.y = this.bus.y;
    // aim the drop with the left stick while riding
    if (Input.move.mag > 0.2) {
      p.drop.tx = clamp(p.x + Input.move.x * 900, 60, MAP - 60);
      p.drop.ty = clamp(p.y + Input.move.y * 900, 60, MAP - 60);
    } else { p.drop.tx = p.x + Math.cos(this.bus.ang) * 420; p.drop.ty = p.y + Math.sin(this.bus.ang) * 420; }

    if (Input.tap('fire') || Input.tap('use') || this.busT > 5.5 || travelled > 0.92) {
      p.drop.phase = 'fall'; p.drop.h = 1;
      this.state = 'drop';
      Snd.play('jump', 1);
      this.toast('LINKS ZIEHEN ZUM STEUERN', 1.6);
    }
  },

  updateDrop(a, dt) {
    const d = a.drop;
    if (d.phase === 'bus' || d.phase === 'ground') return;
    const fall = 0.30;                                  // ~3.3s from bus to boots
    d.h -= fall * dt;
    const steer = a === this.player
      ? (Input.move.mag > 0.15 ? { x: Input.move.x, y: Input.move.y, m: Input.move.mag } : null)
      : null;
    let ax, ay;
    if (steer) { ax = steer.x; ay = steer.y; }
    else {
      const dx = d.tx - a.x, dy = d.ty - a.y, n = Math.hypot(dx, dy) || 1;
      ax = dx / n; ay = dy / n;
      if (n < 30) { ax = ay = 0; }
    }
    const sp = d.h > 0.45 ? 620 : 300;                  // glider slows you down
    a.x = clamp(a.x + ax * sp * dt, 40, MAP - 40);
    a.y = clamp(a.y + ay * sp * dt, 40, MAP - 40);
    if (ax || ay) { a.ang = Math.atan2(ay, ax); a.aimAng = a.ang; }
    if (d.h <= 0) {
      d.h = 0; d.phase = 'ground';
      const pos = World.collide(a.x, a.y, a.r);
      a.x = pos.x; a.y = pos.y;
      a.state = a.isBot ? 'loot' : 'play';
      if (a === this.player) {
        this.state = 'play';
        Snd.play('pickup', .8);
        this.toast('LOS GEHT\'S — SAMMEL WAFFEN!', 1.8);
      }
    }
  },

  /* ------------------------------------------------------ zone */
  updateZone(dt) {
    const z = this.zone;
    z.t -= dt * this.timeScale;
    if (z.t <= 0) {
      if (z.mode === 'wait') {
        z.phase++;
        if (z.phase >= STORM_PHASES.length) { z.mode = 'done'; z.t = 1e9; z.dps = 25; return; }
        const ph = STORM_PHASES[z.phase];
        z.mode = 'move'; z.t = ph.move; z.moveT = ph.move; z.dps = ph.dps;
        z.ox = z.x; z.oy = z.y; z.or = z.r;
        z.nr = Math.max(1, z.r * ph.shrink);
        const off = Math.max(0, z.r - z.nr) * 0.72;
        const a = rnd(TAU), d = rnd(off);
        z.nx = clamp(z.x + Math.cos(a) * d, z.nr, MAP - z.nr);
        z.ny = clamp(z.y + Math.sin(a) * d, z.nr, MAP - z.nr);
        Snd.play('zone');
        this.toast('DER STURM ZIEHT SICH ZUSAMMEN', 1.5);
      } else {
        z.mode = 'wait';
        const ph = STORM_PHASES[Math.min(z.phase + 1, STORM_PHASES.length - 1)];
        z.t = ph.wait;
        z.x = z.nx; z.y = z.ny; z.r = z.nr;
      }
    }
    if (z.mode === 'move') {
      const t = 1 - clamp(z.t / z.moveT, 0, 1);
      z.x = lerp(z.ox, z.nx, t); z.y = lerp(z.oy, z.ny, t); z.r = Math.max(1, lerp(z.or, z.nr, t));
    }
  },

  applyStorm(dt) {
    const z = this.zone;
    if (z.dps <= 0) return;
    this.stormT = (this.stormT || 0) + dt;
    if (this.stormT < 0.5) return;
    const step = this.stormT; this.stormT = 0;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      if (!a.alive || a.drop.phase !== 'ground') continue;
      if (dist(a.x, a.y, z.x, z.y) > z.r) {
        const dead = a.hurt(z.dps * step, null);
        if (a === this.player) { this.flash(0.4); Snd.play('hurt', .5); }
        if (dead) this.onKill(null, a, 'storm');
      }
    }
  },

  /* ------------------------------------------------------ player */
  updatePlayer(dt) {
    const p = this.player;
    if (!p.alive) return;
    if (p.drop.phase !== 'ground') { this.updateDrop(p, dt); this.camFollow(dt); return; }

    Input.desktop(this.canvas, this.W / 2, this.H / 2);
    if (p.fireT > 0) p.fireT -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.muzzle > 0) p.muzzle -= dt;
    if (p.lastAttackT !== undefined) p.lastAttackT += dt;

    // --- consuming locks you down, exactly like it should
    if (p.healT > 0) {
      p.healT -= dt;
      if (p.healT <= 0) this.finishHeal(p);
      this.camFollow(dt);
      return;
    }
    if (p.reloadT > 0) { p.reloadT -= dt; if (p.reloadT <= 0) this.finishReload(p); }

    // --- movement
    const sprint = Input.btn.sprint ? 1.34 : 1;
    const mv = Input.move;
    if (mv.mag > 0) {
      const sp = G_SPEED * sprint * mv.mag;
      const pos = World.collide(p.x + mv.x * sp * dt, p.y + mv.y * sp * dt, p.r);
      p.x = pos.x; p.y = pos.y;
      if (Input.aim.mag < 0.2) { p.ang = angApproach(p.ang, Math.atan2(mv.y, mv.x), dt * 12); p.aimAng = p.ang; }
    }

    // --- aiming + aim assist
    let firing = Input.btn.fire;
    if (Input.aim.mag > 0.2) {
      let want = Math.atan2(Input.aim.y, Input.aim.x);
      const lock = this.aimAssist(p, want);
      if (lock) {
        const strength = [0, 0.35, 0.7][this.opts.aim];
        want = angApproach(want, lock.ang, Math.abs(angDiff(want, lock.ang)) * strength);
        if (this.opts.autofire) firing = true;
      }
      p.aimAng = angApproach(p.aimAng, want, dt * 16);
      p.ang = p.aimAng;
    }

    // --- buttons
    if (Input.tap('build')) this.toggleBuild();
    if (Input.tap('reload')) this.reload(p);
    if (Input.tap('heal')) { const i = AI.findHeal(p, true); if (i !== -1) { p.sel = i; this.startHeal(p); this.updateSlots(); } else this.toast('KEINE HEILUNG DABEI', 1); }
    if (Input.tap('use')) this.pickupNear(p);
    if (Input.btn.pickaxe) this.swingPickaxe(p, dt);
    if (this.build.on) {
      if (Input.tap('bwall')) this.doBuild('wall');
      if (Input.tap('bcorner')) this.doBuild('corner');
      if (Input.tap('bbox')) this.doBuild('box');
      if (Input.tap('bmat')) {
        this.build.mat = MATS[(MATS.indexOf(this.build.mat) + 1) % 3];
        const el = Input.els.bmat; if (el) el.querySelector('.ic').textContent = MAT_INFO[this.build.mat].ic;
      }
    } else if (firing) {
      this.fire(p, p.aimAng);
    }

    // --- auto-pickup when you walk over loot with a free slot
    this.autoPickup(p);
    this.hintNear(p);
    this.camFollow(dt);
  },

  /** nearest enemy inside the aim cone; drives assist + auto-fire */
  aimAssist(p, ang) {
    if (this.opts.aim === 0) return null;
    const g = p.gun;
    const range = g ? g.range : 140;
    const near = this.aGrid.query(p.x, p.y, range, this._tmp);
    let best = null, bs = 1e9;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === p || !o.alive || o.drop.phase !== 'ground') continue;
      const d = dist(p.x, p.y, o.x, o.y);
      if (d > range) continue;
      const a = Math.atan2(o.y - p.y, o.x - p.x);
      const off = Math.abs(angDiff(ang, a));
      if (off > 0.42) continue;                      // ~24° cone
      if (World.losBlocked(p.x, p.y, o.x, o.y)) continue;
      const score = off * 300 + d;
      if (score < bs) { bs = score; best = { ang: a, actor: o, d }; }
    }
    return best;
  },

  camFollow(dt) {
    const p = this.player;
    // lead the camera toward where you're aiming so you see what you shoot
    const lead = Input.aim.mag > 0.2 ? 110 : 0;
    const tx = p.x + Math.cos(p.aimAng) * lead;
    const ty = p.y + Math.sin(p.aimAng) * lead;
    const k = 1 - Math.pow(0.0001, dt);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  },

  /* ------------------------------------------------------ combat */
  fire(a, ang) {
    if (a.reloadT > 0 || a.healT > 0) return false;
    const g = a.gun;
    if (!g) { this.melee(a, ang); return false; }
    if (a.fireT > 0) return false;
    if (g.inMag <= 0) { this.reload(a); return false; }

    g.inMag--;
    a.fireT = 60 / g.rpm;
    a.muzzle = 0.06;
    a.recoil = 1;
    const spread = g.spread * Math.PI / 180;
    for (let i = 0; i < g.pellets; i++) {
      const s = ang + (Math.random() - 0.5) * spread * 2;
      this.spawnBullet(a, s, g);
    }
    const vol = a === this.player ? 1 : this.volAt(a.x, a.y);
    Snd.play(g.snd, vol);
    this.kick(a, ang);
    if (a === this.player) this.updateSlots();
    return true;
  },

  spawnBullet(a, ang, g) {
    let b = null;
    const L = this.bullets;
    for (let n = 0; n < L.length; n++) {
      const i = (this.bCur + n) % L.length;
      if (!L[i].on) { b = L[i]; this.bCur = (i + 1) % L.length; break; }
    }
    if (!b) { if (L.length > 420) return; b = {}; L.push(b); this.bCur = 0; }
    b.on = true;
    b.x = a.x + Math.cos(ang) * (a.r + 6);
    b.y = a.y + Math.sin(ang) * (a.r + 6);
    b.px = b.x; b.py = b.y;
    b.vx = Math.cos(ang) * g.speed;
    b.vy = Math.sin(ang) * g.speed;
    b.dmg = g.dmg * (a.isBot ? AI.D.dmg : 1);
    b.left = g.range;
    b.owner = a;
    b.rocket = g.rocket; b.aoe = g.aoe;
    b.trail = g.id === 'sniper' ? 1 : 0;
  },

  kick(a, ang) {
    if (this.lowFx && a !== this.player) return;
    for (let i = 0; i < 3; i++) {
      this.spark(a.x + Math.cos(ang) * 22, a.y + Math.sin(ang) * 22,
        ang + rnd(-0.5, 0.5), rnd(60, 220), '#ffd28a', 0.16);
    }
  },

  melee(a, ang) {
    if (a.fireT > 0) return;
    a.fireT = 0.62; a.muzzle = 0.05;
    Snd.play('chop', this.volAt(a.x, a.y));
    // one swing, one victim — a cone that hits a whole crowd made the drop a bloodbath
    const near = this.aGrid.query(a.x, a.y, 70, this._tmp);
    let best = null, bd = 62 * 62;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === a || !o.alive || o.drop.phase !== 'ground') continue;
      const d2 = dist2(a.x, a.y, o.x, o.y);
      if (d2 > bd) continue;
      if (Math.abs(angDiff(ang, Math.atan2(o.y - a.y, o.x - a.x))) > 0.9) continue;
      bd = d2; best = o;
    }
    if (!best) return;
    const dead = best.hurt(18, a);
    this.hitFx(best.x, best.y, 18, best === this.player, best);
    if (dead) this.onKill(a, best, 'melee');
  },

  reload(a) {
    const g = a.gun;
    if (!g || a.reloadT > 0 || a.healT > 0) return;
    if (g.inMag >= g.mag) return;
    if (a.ammo[g.ammo] <= 0) { if (a === this.player) this.toast('KEINE MUNITION', 0.9); return; }
    a.reloadT = g.reload;
    Snd.play('reload', a === this.player ? 1 : this.volAt(a.x, a.y) * 0.6);
  },

  finishReload(a) {
    const g = a.gun;
    if (!g) return;
    const need = g.mag - g.inMag;
    const have = Math.min(need, a.ammo[g.ammo]);
    g.inMag += have; a.ammo[g.ammo] -= have;
    if (a === this.player) this.updateSlots();
  },

  startHeal(a) {
    const s = a.slots[a.sel];
    if (!s || s.kind !== 'con' || a.healT > 0) return;
    const c = CONSUM[s.id];
    if (c.kind === 'hp' && a.hp >= c.cap) { if (a === this.player) this.toast('LEBEN SCHON VOLL', .9); return; }
    if (c.kind === 'sh' && a.sh >= c.cap) { if (a === this.player) this.toast('SCHILD SCHON VOLL', .9); return; }
    a.healT = c.time; a.healItem = a.sel;
    a.reloadT = 0;
  },

  finishHeal(a) {
    const s = a.slots[a.healItem];
    a.healItem = null;
    if (!s || s.kind !== 'con') return;
    const c = CONSUM[s.id];
    if (c.kind === 'hp' || c.kind === 'both') a.hp = Math.min(c.kind === 'both' ? a.maxHp : c.cap, a.hp + c.amount);
    if (c.kind === 'sh' || c.kind === 'both') a.sh = Math.min(c.kind === 'both' ? a.maxSh : c.cap, a.sh + c.amount);
    s.count--;
    if (s.count <= 0) a.slots[a.slots.indexOf(s)] = null;
    Snd.play(c.kind === 'sh' ? 'shield' : 'pickup', a === this.player ? 1 : this.volAt(a.x, a.y) * .5);
    if (a === this.player) { this.updateSlots(); this.floatText(a.x, a.y - 20, '+' + c.amount, c.kind === 'sh' ? '#7fe4ff' : '#7dffb0'); }
  },

  volAt(x, y) {
    const d = dist(x, y, this.player.x, this.player.y);
    return clamp(1 - d / 1500, 0, 1) ** 2;
  },

  /* ------------------------------------------------------ bullets */
  updateBullets(dt) {
    const list = this.bullets;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (!b.on) continue;
      const sp = Math.hypot(b.vx, b.vy);
      const steps = Math.max(1, Math.ceil(sp * dt / 26));   // no tunnelling through walls
      const sdt = dt / steps;
      for (let s = 0; s < steps && b.on; s++) {
        b.px = b.x; b.py = b.y;
        b.x += b.vx * sdt; b.y += b.vy * sdt;
        b.left -= sp * sdt;
        if (b.left <= 0 || b.x < 0 || b.y < 0 || b.x > MAP || b.y > MAP) { this.endBullet(b, false); break; }
        if (this.bulletHit(b)) break;
      }
    }
  },

  bulletHit(b) {
    // --- actors
    const near = this.aGrid.query(b.x, b.y, 60, this._tmp);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === b.owner || !o.alive || o.drop.phase !== 'ground') continue;
      if (dist2(b.x, b.y, o.x, o.y) > (o.r + 4) * (o.r + 4)) continue;
      if (b.rocket) { this.explode(b.x, b.y, b); return true; }
      const dead = o.hurt(b.dmg, b.owner);
      this.hitFx(b.x, b.y, b.dmg, o === this.player, o);
      Snd.play('hit', b.owner === this.player ? 0.9 : this.volAt(b.x, b.y) * .5);
      if (o === this.player) { this.flash(0.55); Snd.play('hurt', .9); }
      if (dead) this.onKill(b.owner, o, b.owner && b.owner.gun ? b.owner.gun.id : 'gun');
      this.endBullet(b, true);
      return true;
    }
    // --- built structures
    const built = World.bGrid.query(b.x, b.y, 70, this._q2);
    for (let i = 0; i < built.length; i++) {
      const s = built[i];
      if (s.hp <= 0) continue;
      if (b.x < s.bx || b.x > s.bx2 || b.y < s.by || b.y > s.by2) continue;
      if (b.rocket) { this.explode(b.x, b.y, b); return true; }
      World.damageStructure(s, b.dmg);
      this.spark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 160, MAT_INFO[s.mat].col, 0.2);
      this.endBullet(b, true);
      return true;
    }
    // --- world walls / rocks / trees
    const st = World.sGrid.query(b.x, b.y, 70, this._q);
    for (let i = 0; i < st.length; i++) {
      const o = st[i];
      if (o.w !== undefined) {
        if (!o.solid) continue;
        if (b.x < o.x || b.x > o.x2 || b.y < o.y || b.y > o.y2) continue;
      } else {
        if (o.hp <= 0 || o.type === 'crate') continue;
        if (dist2(b.x, b.y, o.x, o.y) > (o.r * 0.62) * (o.r * 0.62)) continue;
        o.hp -= b.dmg * 0.5;
      }
      if (b.rocket) { this.explode(b.x, b.y, b); return true; }
      this.spark(b.x, b.y, Math.atan2(-b.vy, -b.vx), 150, '#cfd6e0', 0.2);
      this.endBullet(b, true);
      return true;
    }
    return false;
  },

  endBullet(b) { b.on = false; },

  explode(x, y, b) {
    b.on = false;
    Snd.play('boom', b.owner === this.player ? 1 : this.volAt(x, y));
    this.rings.push({ x, y, r: 10, max: b.aoe, life: 0.45, t: 0.45, col: '#ffb257' });
    if (!this.lowFx) for (let i = 0; i < 14; i++) this.spark(x, y, rnd(TAU), rnd(120, 460), i % 2 ? '#ffd08a' : '#ff7a3a', rnd(0.2, 0.5));
    const near = this.aGrid.query(x, y, b.aoe + 40, this._tmp);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (!o.alive || o.drop.phase !== 'ground') continue;
      const d = dist(x, y, o.x, o.y);
      if (d > b.aoe) continue;
      const dmg = b.dmg * (1 - d / b.aoe * 0.6);
      const dead = o.hurt(dmg, b.owner);
      this.hitFx(o.x, o.y, dmg, o === this.player, o);
      if (o === this.player) { this.flash(0.8); Snd.play('hurt'); }
      if (dead) this.onKill(b.owner, o, 'rpg');
    }
    const built = World.bGrid.query(x, y, b.aoe + 60, this._q2);
    for (let i = 0; i < built.length; i++) {
      const s = built[i];
      if (s.hp > 0 && dist(x, y, s.x, s.y) < b.aoe + 40) World.damageStructure(s, b.dmg * 1.6);
    }
  },

  /* ------------------------------------------------------ death */
  onKill(killer, victim, weap) {
    victim.alive = false;
    victim.placed = this.alive;
    this.alive--;
    // drop their stuff so a kill is worth taking
    this.dropLoot(victim);
    const wn = weap === 'storm' ? 'Sturm' : weap === 'melee' ? 'Spitzhacke' : (WEAPONS[weap] ? WEAPONS[weap].name : 'Waffe');
    if (killer) {
      killer.kills++;
      if (killer === this.player) {
        Snd.play('kill');
        this.floatText(victim.x, victim.y - 26, 'AUSGESCHALTET', '#ffd76a', 1.4);
        if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
      }
    }
    this.addFeed(killer ? killer.name : 'Der Sturm', victim.name, wn,
      killer === this.player || victim === this.player);
    if (!this.lowFx) for (let i = 0; i < 8; i++) this.spark(victim.x, victim.y, rnd(TAU), rnd(60, 240), '#ff6b6b', rnd(0.25, 0.5));

    if (victim === this.player) this.endMatch(false);
    else if (this.alive === 1 && this.player.alive) this.endMatch(true);
  },

  dropLoot(a) {
    const items = [];
    for (const s of a.slots) if (s) items.push(s);
    let i = 0;
    for (const s of items) {
      const ang = (i++ / Math.max(1, items.length)) * TAU + rnd(0.4);
      const it = World.item(a.x + Math.cos(ang) * rnd(14, 40), a.y + Math.sin(ang) * rnd(14, 40), s);
      World.loot.push(it); World.lGrid.add(it);
    }
    for (const t in a.ammo) {
      if (a.ammo[t] > 4) {
        const it = World.item(a.x + rnd(-34, 34), a.y + rnd(-34, 34),
          { kind: 'ammo', id: t, name: 'Munition', ic: AMMO[t], count: Math.min(a.ammo[t], AMMO_BOX[t] * 2) });
        World.loot.push(it); World.lGrid.add(it);
      }
    }
    const m = (a.mats.wood + a.mats.brick + a.mats.metal) | 0;
    if (m > 20) {
      const it = World.item(a.x + rnd(-20, 20), a.y + rnd(-20, 20), { kind: 'mat', id: 'wood', name: 'Material', ic: '🪵', count: Math.min(160, m) });
      World.loot.push(it); World.lGrid.add(it);
    }
  },

  reapDead() {
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a.alive && !a.counted) {
        a.counted = true;
        if (a.placed === 0) {                       // died to something that skipped onKill
          a.placed = this.alive; this.alive--;
        }
      }
    }
  },

  endMatch(won) {
    if (this.state === 'result') return;
    const p = this.player;
    p.placed = won ? 1 : this.alive + 1;
    this.state = 'result';
    Snd.storm(0);
    Snd.play(won ? 'win' : 'lose');
    const d = Store.data;
    d.matches++; d.kills += p.kills;
    if (won) d.wins++;
    if (p.kills > d.best) d.best = p.kills;
    if (p.placed < d.bestPlace) d.bestPlace = p.placed;
    d.dmg += Math.round(p.dmgDone);
    Store.data.opts = this.opts;
    Store.save();

    setTimeout(() => {
      this.el.hud.classList.add('hide');
      this.el.result.classList.remove('hide');
      this.el.resT.textContent = '#' + p.placed;
      this.el.resT.style.color = won ? '#ffd76a' : '#eaf0ff';
      this.el.resS.textContent = won ? 'VICTORY ROYALE' : 'VON ' + this.total + ' SPIELERN';
      const killer = p.killer ? p.killer.name : 'dem Sturm';
      this.el.res.innerHTML =
        `<b style="font-size:16px;color:#ffd76a">☠ ${p.kills} Kills</b><br>` +
        `${Math.round(p.dmgDone)} Schaden ausgeteilt · ${Math.round(p.dmgTaken)} eingesteckt<br>` +
        `Überlebt: ${this.fmtTime(this.matchT)}<br>` +
        (won ? 'Letzter Überlebender auf der Insel.' : `Ausgeschaltet von <b>${killer}</b>.`);
      this.refreshStats();
    }, won ? 900 : 1200);
  },

  fmtTime(s) { const m = (s / 60) | 0; return m + ':' + String((s % 60) | 0).padStart(2, '0'); }
};

/* ============================================================
   Part 2 — loot, building, effects, HUD, rendering
   ============================================================ */
Object.assign(Game, {

  /* ------------------------------------------------------ loot */
  lootNear(x, y, r) {
    const near = World.lGrid.query(x, y, r, this._q);
    let best = null, bd = r * r;
    for (let i = 0; i < near.length; i++) {
      const l = near[i];
      if (l.taken || l.open) continue;
      const d = dist2(x, y, l.x, l.y);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  },

  /** grab the closest thing in arm's reach; opens chests too */
  pickupNear(a) {
    const near = World.lGrid.query(a.x, a.y, 90, this._q);
    let best = null, bd = 78 * 78;
    for (let i = 0; i < near.length; i++) {
      const l = near[i];
      if (l.taken || l.open) continue;
      const d = dist2(a.x, a.y, l.x, l.y);
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) return false;
    if (best.data === undefined) return this.openChest(a, best);
    return this.grab(a, best);
  },

  grab(a, l) {
    const it = l.data;
    const res = a.take(it);
    if (res === null) { if (a === this.player) this.toast('INVENTAR VOLL', .8); return false; }
    l.taken = true;
    if (res instanceof Object && res.kind) {          // swapped: the old gun falls where you stand
      const drop = World.item(a.x + rnd(-16, 16), a.y + rnd(-16, 16), res);
      World.loot.push(drop); World.lGrid.add(drop);
    }
    if (it.kind === 'mat') { const per = (it.count / 3) | 0; for (const m of MATS) a.addMat(m, per); }
    Snd.play('pickup', a === this.player ? 1 : this.volAt(a.x, a.y) * .4);
    if (a === this.player) {
      this.updateSlots();
      const label = it.kind === 'gun' ? `${RARITY[it.rar].name} ${it.name}`
        : it.kind === 'ammo' ? `${it.count} Munition` : it.kind === 'mat' ? `${it.count} Material` : `${it.name} x${it.count}`;
      this.floatText(a.x, a.y - 26, label, it.kind === 'gun' ? RARITY[it.rar].col : '#cfe4ff', 1.1);
    }
    return true;
  },

  openChest(a, c) {
    c.open = true;
    Snd.play('chest', a === this.player ? 1 : this.volAt(c.x, c.y) * .5);
    const n = 3 + (chance(0.4) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + rnd(0.5), d = rnd(34, 62);
      const r = Math.random();
      const data = r < 0.42 ? rollWeapon(1) : r < 0.72 ? rollConsum() : World.ammoItem();
      const it = World.item(c.x + Math.cos(ang) * d, c.y + Math.sin(ang) * d, data);
      World.loot.push(it); World.lGrid.add(it);
    }
    if (a === this.player) this.floatText(c.x, c.y - 28, 'TRUHE GEÖFFNET', '#ffd76a', 1.1);
    return true;
  },

  /** walking over loot picks it up when there's room — no button mashing */
  autoPickup(p) {
    const near = World.lGrid.query(p.x, p.y, 46, this._q);
    for (let i = 0; i < near.length; i++) {
      const l = near[i];
      if (l.taken || l.data === undefined) continue;
      if (dist2(p.x, p.y, l.x, l.y) > 34 * 34) continue;
      const it = l.data;
      const free = p.slots.indexOf(null) !== -1;
      if (it.kind === 'ammo' || it.kind === 'mat' || free) { this.grab(p, l); return; }
    }
  },

  hintNear(p) {
    const l = this.lootNear(p.x, p.y, 88);
    this.hintItem = l || null;
    const h = this.el.hint;
    if (l) {
      const t = l.data === undefined ? '🧰 Truhe öffnen'
        : l.data.kind === 'gun' ? `${RARITY[l.data.rar].name} ${l.data.name}`
        : `${l.data.name}${l.data.count ? ' x' + l.data.count : ''}`;
      h.textContent = t;
      h.classList.remove('hide');
    } else h.classList.add('hide');
  },

  /* ------------------------------------------------------ building */
  toggleBuild() {
    this.build.on = !this.build.on;
    this.el.buildBar.classList.toggle('hide', !this.build.on);
    document.getElementById('bBuild').classList.toggle('on', this.build.on);
    const el = Input.els.bmat; if (el) el.querySelector('.ic').textContent = MAT_INFO[this.build.mat].ic;
    setTimeout(() => Input.cache(), 30);
  },

  doBuild(kind) {
    const p = this.player;
    const cost = BUILD_KINDS[kind].cost;
    if (p.mats[this.build.mat] < cost) { this.toast('ZU WENIG ' + MAT_INFO[this.build.mat].name.toUpperCase(), 1); return; }
    const made = this.tryBuild(p, kind, p.x, p.y, p.aimAng, this.build.mat);
    if (!made) this.toast('HIER IST SCHON WAS', .8);
  },

  /** returns how many pieces actually went up */
  tryBuild(a, kind, x, y, ang, mat) {
    mat = mat || a.mat || 'wood';
    const cost = BUILD_KINDS[kind] ? BUILD_KINDS[kind].cost : 10;
    if (a.mats[mat] < cost) return 0;
    const [gx, gy] = World.cellOf(a.x, a.y);
    let edges;
    if (kind === 'box') edges = World.cellEdges(gx, gy);
    else if (kind === 'corner') {
      const e = World.edgeFrom(gx, gy, ang);
      const side = World.edgeFrom(gx, gy, ang + Math.PI / 2);
      edges = [e, side];
    } else edges = [World.edgeFrom(gx, gy, ang)];

    let made = 0;
    for (const [ex, ey, dir] of edges) if (World.placeWall(a, mat, ex, ey, dir)) made++;
    if (!made) return 0;
    a.mats[mat] = Math.max(0, a.mats[mat] - cost);
    Snd.play('build', a === this.player ? 1 : this.volAt(a.x, a.y) * .5);
    if (a === this.player) this.updateHUD();
    return made;
  },

  updateStructures(dt) {
    const st = World.structures;
    for (let i = 0; i < st.length; i++) {
      const s = st[i];
      if (s.buildT > 0) s.buildT -= dt;
    }
  },

  /** the pickaxe: farms trees/rocks/crates, chews through builds, pokes people */
  swingPickaxe(p, dt) {
    p.pickT -= dt;
    if (p.pickT > 0) return;
    p.pickT = 0.42;
    p.muzzle = 0.05;
    const ang = p.aimAng;
    const hx = p.x + Math.cos(ang) * 34, hy = p.y + Math.sin(ang) * 34;
    let hitAny = false;

    const props = World.sGrid.query(hx, hy, 70, this._q);
    for (let i = 0; i < props.length; i++) {
      const o = props[i];
      if (o.w !== undefined || o.hp <= 0) continue;
      if (dist(hx, hy, o.x, o.y) > o.r + 20) continue;
      o.hp -= 34;
      p.addMat(o.mat, 12 + rndi(0, 8));
      this.spark(o.x, o.y, ang, 130, MAT_INFO[o.mat].col, 0.25);
      this.floatText(o.x, o.y - 18, '+' + MAT_INFO[o.mat].ic, MAT_INFO[o.mat].col, 0.7);
      Snd.play('chop', 1);
      if (o.hp <= 0) p.addMat(o.mat, 22);   // felling it yields a bonus
      hitAny = true; break;
    }
    if (!hitAny) {
      const built = World.bGrid.query(hx, hy, 80, this._q2);
      for (let i = 0; i < built.length; i++) {
        const s = built[i];
        if (s.hp <= 0) continue;
        if (hx < s.bx - 14 || hx > s.bx2 + 14 || hy < s.by - 14 || hy > s.by2 + 14) continue;
        World.damageStructure(s, 45);
        this.spark(s.x, s.y, ang, 130, MAT_INFO[s.mat].col, 0.25);
        Snd.play('chop', 1); hitAny = true; break;
      }
    }
    if (!hitAny) this.melee(p, ang);
  },

  /* ------------------------------------------------------ effects */
  spark(x, y, ang, sp, col, life) {
    if (this.parts.length > 320) return;
    let p = null;
    const L = this.parts;
    for (let n = 0; n < L.length; n++) {
      const i = (this.pCur + n) % L.length;
      if (!L[i].on) { p = L[i]; this.pCur = (i + 1) % L.length; break; }
    }
    if (!p) { p = {}; L.push(p); this.pCur = 0; }
    p.on = true; p.x = x; p.y = y;
    p.vx = Math.cos(ang) * sp * rnd(0.5, 1.2);
    p.vy = Math.sin(ang) * sp * rnd(0.5, 1.2);
    p.life = p.max = life; p.col = col; p.r = rnd(1.5, 3.4);
  },

  floatText(x, y, txt, col, life) {
    this.texts.push({ x, y, txt, col, life: life || 0.9, max: life || 0.9 });
    if (this.texts.length > 40) this.texts.shift();
  },

  hitFx(x, y, dmg, isMe, victim) {
    if (!this.lowFx) for (let i = 0; i < 3; i++) this.spark(x, y, rnd(TAU), rnd(70, 190), isMe ? '#ff6b6b' : '#ffe08a', 0.22);
    if (!isMe && victim && dist(x, y, this.player.x, this.player.y) < 900)
      this.floatText(x + rnd(-6, 6), y - 14, Math.round(dmg), victim.sh > 0 ? '#7fe4ff' : '#ffffff', 0.7);
  },

  updateFx(dt) {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.90; p.vy *= 0.90;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt; t.y -= 26 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r = lerp(10, r.max, 1 - r.life / r.t);
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.el.flash.style.opacity = 0; }
    const z = this.zone;
    const edge = dist(this.player.x, this.player.y, z.x, z.y) - z.r;
    Snd.storm(clamp(1 + edge / 500, 0, 1));
  },

  toast(txt, t) {
    this.el.toast.textContent = txt;
    this.el.toast.classList.add('show');
    this.toastT = t || 1.2;
  },

  flash(v) { this.el.flash.style.opacity = v; this.flashT = 0.25; },

  addFeed(killer, victim, weap, mine) {
    const d = document.createElement('div');
    d.className = mine ? 'me' : '';
    d.textContent = `${killer} ⚔ ${victim}`;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 5) this.el.feed.removeChild(this.el.feed.firstChild);
    const node = d;
    setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 5200);
  },

  /* ------------------------------------------------------ HUD */
  buildSlots() {
    const wrap = this.el.slots;
    wrap.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.dataset.act = 'slot' + i;
      d.innerHTML = '<div class="n">' + (i + 1) + '</div><div class="ic"></div><div class="am"></div><div class="rar"></div>';
      wrap.appendChild(d);
    }
  },

  updateSlots() {
    const p = this.player;
    const els = this.el.slots.children;
    for (let i = 0; i < 5; i++) {
      const el = els[i], s = p.slots[i];
      el.classList.toggle('sel', i === p.sel);
      const ic = el.querySelector('.ic'), am = el.querySelector('.am'), rr = el.querySelector('.rar');
      if (!s) { ic.textContent = ''; am.textContent = ''; rr.style.background = 'transparent'; continue; }
      ic.textContent = s.ic;
      if (s.kind === 'gun') {
        am.textContent = s.inMag + '/' + p.ammo[s.ammo];
        rr.style.background = RARITY[s.rar].col;
      } else { am.textContent = 'x' + s.count; rr.style.background = '#5c6a80'; }
    }
  },

  updateHUD() {
    const p = this.player, e = this.el;
    e.hp.style.transform = 'scaleX(' + (p.hp / p.maxHp) + ')';
    e.sh.style.transform = 'scaleX(' + (p.sh / p.maxSh) + ')';
    e.hpT.textContent = Math.ceil(p.hp);
    e.shT.textContent = Math.ceil(p.sh);
    e.wood.textContent = p.mats.wood | 0;
    e.brick.textContent = p.mats.brick | 0;
    e.metal.textContent = p.mats.metal | 0;
    e.alive.innerHTML = this.alive + '<small>ÜBRIG</small>';
    e.kills.textContent = '☠ ' + p.kills + ' Kills';
    const z = this.zone;
    if (z.mode === 'move') { e.storm.textContent = '⚡ Sturm zieht sich zusammen'; e.storm.classList.add('warn'); }
    else if (z.mode === 'done') { e.storm.textContent = '☠ Letzter Kreis'; e.storm.classList.add('warn'); }
    else { e.storm.textContent = '⛈ Nächster Kreis in ' + Math.ceil(z.t); e.storm.classList.remove('warn'); }

    // slot taps
    for (let i = 0; i < 5; i++) {
      if (Input.tap('slot' + i)) {
        if (p.sel !== i) { p.sel = i; p.reloadT = 0; p.healT = 0; p.fireT = Math.max(p.fireT, 0.18); }
        else if (p.slots[i] && p.slots[i].kind === 'con') this.startHeal(p);
        this.updateSlots();
      }
    }
    this.slotT = (this.slotT || 0) + 1;
    if (this.slotT % 6 === 0) this.updateSlots();
  }
});

/* ============================================================
   Part 3 — rendering
   ============================================================ */
const ACTOR_COLS = ['#e4634f', '#4fa8e4', '#67c25c', '#d9a441', '#a967d9', '#48c9b0', '#e07ab5', '#b0714a', '#ffd76a'];

Object.assign(Game, {

  render(dt) {
    const g = this.ctx, W = this.W, H = this.H;
    g.save();
    g.scale(this.dpr, this.dpr);
    g.fillStyle = '#101a2c';
    g.fillRect(0, 0, W, H);

    if (this.state === 'menu') { g.restore(); return; }

    const z = this.zoom;
    g.translate(W / 2, H / 2);
    g.scale(z, z);
    g.translate(-this.cam.x, -this.cam.y);

    // world-space view rect, used for culling everything below
    const vw = W / z / 2 + 90, vh = H / z / 2 + 90;
    const v = { x0: this.cam.x - vw, x1: this.cam.x + vw, y0: this.cam.y - vh, y1: this.cam.y + vh };

    this.drawGround(g, v);
    this.drawZoneTarget(g);
    this.drawStatics(g, v);
    this.drawLoot(g, v);
    this.drawStructures(g, v);
    this.drawBullets(g, v);
    this.drawActors(g, v);
    this.drawFx(g, v);
    this.drawStorm(g);
    if (this.state === 'bus' || this.state === 'drop') this.drawDropUI(g);

    g.restore();

    g.save();
    g.scale(this.dpr, this.dpr);
    this.drawSticks(g);
    if (this.state === 'play' && this.build.on) { /* build ghost drawn in world space above */ }
    g.restore();

    this.mapT = (this.mapT || 0) + dt;
    if (this.mapT > 0.12) { this.mapT = 0; this.drawMinimap(); }
  },

  drawGround(g, v) {
    g.fillStyle = this.groundPat;
    g.save();
    g.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
    g.restore();
    // out-of-bounds ocean
    if (v.x0 < 0 || v.y0 < 0 || v.x1 > MAP || v.y1 > MAP) {
      g.fillStyle = '#14324e';
      if (v.x0 < 0) g.fillRect(v.x0, v.y0, -v.x0, v.y1 - v.y0);
      if (v.y0 < 0) g.fillRect(v.x0, v.y0, v.x1 - v.x0, -v.y0);
      if (v.x1 > MAP) g.fillRect(MAP, v.y0, v.x1 - MAP, v.y1 - v.y0);
      if (v.y1 > MAP) g.fillRect(v.x0, MAP, v.x1 - v.x0, v.y1 - MAP);
    }
    // POI labels, faint
    g.font = 'bold 26px sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of World.pois) {
      if (p.x < v.x0 - 300 || p.x > v.x1 + 300 || p.y < v.y0 - 300 || p.y > v.y1 + 300) continue;
      g.fillStyle = 'rgba(255,255,255,.07)';
      g.fillText(p.name.toUpperCase(), p.x, p.y);
    }
  },

  drawStatics(g, v) {
    // building floors first
    g.fillStyle = '#3a3a42';
    for (const o of World.obstacles) {
      if (o.solid) continue;
      if (o.x + o.w < v.x0 || o.x > v.x1 || o.y + o.h < v.y0 || o.y > v.y1) continue;
      g.fillStyle = '#3c3f47'; g.fillRect(o.x, o.y, o.w, o.h);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.strokeRect(o.x, o.y, o.w, o.h);
    }
    // walls with a drop shadow so they read as tall
    for (const o of World.obstacles) {
      if (!o.solid) continue;
      if (o.x2 < v.x0 || o.x > v.x1 || o.y2 < v.y0 || o.y > v.y1) continue;
      g.fillStyle = 'rgba(0,0,0,.32)';
      g.fillRect(o.x + 4, o.y + 6, o.w, o.h);
      g.fillStyle = '#6d6f7a'; g.fillRect(o.x, o.y, o.w, o.h);
      g.fillStyle = '#8b8e9c'; g.fillRect(o.x, o.y, o.w, Math.min(6, o.h));
    }
    // props
    for (const p of World.props) {
      if (p.hp <= 0) continue;
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1) continue;
      const r = p.r * p.s;
      g.fillStyle = 'rgba(0,0,0,.28)';
      g.beginPath(); g.ellipse(p.x + 5, p.y + 7, r, r * 0.75, 0, 0, TAU); g.fill();
      if (p.type === 'tree') {
        const sway = Math.sin(this.time * 1.4 + p.sway) * 2.5;
        g.fillStyle = '#54401f';
        g.fillRect(p.x - 4.5, p.y - r * 0.1, 9, r * 0.85);
        g.fillStyle = '#244a2b';
        g.beginPath(); g.arc(p.x + sway, p.y - r * 0.28, r, 0, TAU); g.fill();
        g.fillStyle = '#356b3c';
        g.beginPath(); g.arc(p.x + sway - r * .16, p.y - r * .44, r * .76, 0, TAU); g.fill();
        g.fillStyle = '#4a8a50';
        g.beginPath(); g.arc(p.x + sway - r * .3, p.y - r * .56, r * .40, 0, TAU); g.fill();
      } else if (p.type === 'rock') {
        g.fillStyle = '#7c7f88';
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU, rr = r * (0.78 + ((i * 37) % 10) / 40);
          i ? g.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr) : g.moveTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
        }
        g.closePath(); g.fill();
        g.fillStyle = '#989ca6';
        g.beginPath(); g.arc(p.x - r * .2, p.y - r * .2, r * .4, 0, TAU); g.fill();
      } else {
        g.fillStyle = '#8a6a3f'; g.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        g.strokeStyle = '#5f4826'; g.lineWidth = 3; g.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
      }
    }
  },

  drawLoot(g, v) {
    const t = this.time;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const c of World.chests) {
      if (c.x < v.x0 || c.x > v.x1 || c.y < v.y0 || c.y > v.y1) continue;
      const bob = Math.sin(t * 2 + c.bob) * 2;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath(); g.ellipse(c.x + 3, c.y + 8, 20, 9, 0, 0, TAU); g.fill();
      if (!c.open) {
        g.fillStyle = 'rgba(255,200,80,.14)';
        g.beginPath(); g.arc(c.x, c.y, 30 + Math.sin(t * 3 + c.bob) * 3, 0, TAU); g.fill();
      }
      g.fillStyle = c.open ? '#6b5a3a' : '#c9922f';
      g.fillRect(c.x - 17, c.y - 12 + bob, 34, 24);
      g.fillStyle = c.open ? '#4d4130' : '#e8b44a';
      g.fillRect(c.x - 17, c.y - 12 + bob, 34, 8);
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2;
      g.strokeRect(c.x - 17, c.y - 12 + bob, 34, 24);
    }
    g.font = '19px sans-serif';
    for (const l of World.loot) {
      if (l.taken) continue;
      if (l.x < v.x0 || l.x > v.x1 || l.y < v.y0 || l.y > v.y1) continue;
      const bob = Math.sin(t * 3 + l.bob) * 3;
      const col = l.data.kind === 'gun' ? RARITY[l.data.rar].col : '#7f8ea3';
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath(); g.ellipse(l.x + 2, l.y + 10, 13, 6, 0, 0, TAU); g.fill();
      g.globalAlpha = .30; g.fillStyle = col;
      g.beginPath(); g.arc(l.x, l.y + bob, 17, 0, TAU); g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath(); g.arc(l.x, l.y + bob, 17, 0, TAU); g.stroke();
      g.fillText(l.data.ic, l.x, l.y + bob + 1);
    }
    // highlight what the interact button would grab
    const h = this.hintItem;
    if (h && !h.taken && !h.open) {
      g.strokeStyle = '#8fffc8'; g.lineWidth = 3;
      g.beginPath(); g.arc(h.x, h.y, 26 + Math.sin(t * 7) * 2, 0, TAU); g.stroke();
    }
  },

  drawStructures(g, v) {
    for (const s of World.structures) {
      if (s.hp <= 0) continue;
      if (s.bx2 < v.x0 || s.bx > v.x1 || s.by2 < v.y0 || s.by > v.y1) continue;
      const info = MAT_INFO[s.mat];
      const w = s.bx2 - s.bx, h = s.by2 - s.by;
      const building = s.buildT > 0;
      g.globalAlpha = building ? 0.45 : 1;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(s.bx + 3, s.by + 5, w, h);
      g.fillStyle = info.col;
      g.fillRect(s.bx, s.by, w, h);
      g.fillStyle = info.dark;
      if (s.dir === 0) g.fillRect(s.bx, s.by + h - 5, w, 5);
      else g.fillRect(s.bx + w - 5, s.by, 5, h);
      // damage shading
      const f = s.hp / s.maxHp;
      if (f < 0.99) {
        g.fillStyle = 'rgba(0,0,0,' + ((1 - f) * 0.45) + ')';
        g.fillRect(s.bx, s.by, w, h);
      }
      g.globalAlpha = 1;
    }
    // build preview
    if (this.build.on && this.player.alive && this.player.drop.phase === 'ground') {
      const p = this.player;
      const [gx, gy] = World.cellOf(p.x, p.y);
      let edges;
      if (this.build.kind === 'box') edges = World.cellEdges(gx, gy);
      else edges = [World.edgeFrom(gx, gy, p.aimAng)];
      g.globalAlpha = 0.4;
      g.fillStyle = MAT_INFO[this.build.mat].col;
      for (const [ex, ey, dir] of World.cellEdges(gx, gy)) {
        const on = edges.some(e => e[0] === ex && e[1] === ey && e[2] === dir);
        g.globalAlpha = on ? 0.55 : 0.12;
        if (dir === 0) g.fillRect(ex * GRID, ey * GRID - WALL_T, GRID, WALL_T * 2);
        else g.fillRect(ex * GRID - WALL_T, ey * GRID, WALL_T * 2, GRID);
      }
      g.globalAlpha = 1;
    }
  },

  drawBullets(g, v) {
    g.lineCap = 'round';
    for (const b of this.bullets) {
      if (!b.on) continue;
      if (b.x < v.x0 || b.x > v.x1 || b.y < v.y0 || b.y > v.y1) continue;
      if (b.rocket) {
        g.fillStyle = '#ffb257';
        g.beginPath(); g.arc(b.x, b.y, 6, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,140,60,.5)'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(b.px, b.py); g.lineTo(b.x, b.y); g.stroke();
      } else {
        const n = Math.hypot(b.vx, b.vy) || 1;
        const len = b.trail ? 42 : 20;
        g.strokeStyle = b.owner === this.player ? 'rgba(180,255,200,.95)' : 'rgba(255,220,140,.9)';
        g.lineWidth = b.trail ? 3 : 2.2;
        g.beginPath();
        g.moveTo(b.x - b.vx / n * len, b.y - b.vy / n * len);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }
  },

  drawActors(g, v) {
    const p = this.player;
    // aim ray — on a phone you can't feel where the barrel points, so show it
    if (p.alive && p.drop.phase === 'ground' && this.state === 'play' && !this.build.on) {
      const gun = p.gun;
      const len = Math.min(gun ? gun.range : 90, 520);
      const c = Math.cos(p.aimAng), sn = Math.sin(p.aimAng);
      const grad = g.createLinearGradient(p.x, p.y, p.x + c * len, p.y + sn * len);
      grad.addColorStop(0, 'rgba(255,255,255,.30)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = grad; g.lineWidth = 2;
      g.beginPath();
      g.moveTo(p.x + c * (p.r + 14), p.y + sn * (p.r + 14));
      g.lineTo(p.x + c * len, p.y + sn * len);
      g.stroke();
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of this.actors) {
      if (!a.alive) continue;
      if (a.x < v.x0 - 40 || a.x > v.x1 + 40 || a.y < v.y0 - 40 || a.y > v.y1 + 40) continue;
      const air = a.drop.phase !== 'ground' && a.drop.phase !== 'bus';
      const lift = air ? a.drop.h * 46 : 0;
      const dy = a.y - lift;

      // shadow (shrinks as you drop = readable altitude cue)
      g.fillStyle = 'rgba(0,0,0,' + (air ? 0.22 : 0.34) + ')';
      g.beginPath();
      g.ellipse(a.x + 3, a.y + 12, a.r * (air ? 0.6 : 1) * 1.05, a.r * (air ? 0.4 : 0.62), 0, 0, TAU);
      g.fill();

      if (air) {                                     // glider
        g.fillStyle = a === p ? '#ffd76a' : 'rgba(220,230,255,.75)';
        g.save(); g.translate(a.x, dy - 12); g.rotate(a.ang + Math.PI / 2);
        g.beginPath(); g.moveTo(0, -20); g.lineTo(20, 12); g.lineTo(0, 4); g.lineTo(-20, 12); g.closePath(); g.fill();
        g.restore();
      }

      const col = ACTOR_COLS[a.color % ACTOR_COLS.length];
      // body
      g.fillStyle = a.hurtT > 0 ? '#ffffff' : col;
      g.beginPath(); g.arc(a.x, dy, a.r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.42)'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(a.x, dy, a.r, 0, TAU); g.stroke();
      if (a === p) {
        g.strokeStyle = '#ffffff'; g.lineWidth = 2;
        g.beginPath(); g.arc(a.x, dy, a.r + 4, 0, TAU); g.stroke();
      }
      // weapon
      if (!air) {
        const g1 = a.gun;
        const len = a.r + (g1 ? 20 : 11);
        const recoil = a.muzzle > 0 ? 4 : 0;
        const c = Math.cos(a.aimAng), sn = Math.sin(a.aimAng);
        g.strokeStyle = '#23262e'; g.lineWidth = g1 ? 7 : 5; g.lineCap = 'round';
        g.beginPath();
        g.moveTo(a.x + c * (a.r * 0.5), dy + sn * (a.r * 0.5));
        g.lineTo(a.x + c * (len - recoil), dy + sn * (len - recoil));
        g.stroke();
        if (a.muzzle > 0) {
          g.fillStyle = '#fff2b0';
          g.beginPath(); g.arc(a.x + c * (len + 3), dy + sn * (len + 3), 7, 0, TAU); g.fill();
        }
      }
      // healing ring
      if (a.healT > 0) {
        const s = a.slots[a.healItem];
        const total = s ? CONSUM[s.id].time : 1;
        g.strokeStyle = '#7dffb0'; g.lineWidth = 3.5;
        g.beginPath(); g.arc(a.x, dy, a.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - a.healT / total)); g.stroke();
      }
      // reload ring
      if (a.reloadT > 0 && a.gun) {
        g.strokeStyle = '#9ec8ff'; g.lineWidth = 3;
        g.beginPath(); g.arc(a.x, dy, a.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - a.reloadT / a.gun.reload)); g.stroke();
      }
      // name + hp bar for enemies you can actually see
      if (a !== p && !air) {
        const d = dist(a.x, a.y, p.x, p.y);
        if (d < 700) {
          const alpha = clamp(1.2 - d / 700, 0, 1);
          g.globalAlpha = alpha;
          g.fillStyle = 'rgba(0,0,0,.55)';
          g.fillRect(a.x - 22, dy - a.r - 20, 44, 5);
          g.fillStyle = a.sh > 0 ? '#39c8ff' : '#3ddc84';
          g.fillRect(a.x - 22, dy - a.r - 20, 44 * clamp(a.eff / (a.maxHp + a.maxSh) * 2, 0, 1), 5);
          g.font = 'bold 11px sans-serif';
          g.fillStyle = '#e7eeff';
          g.fillText(a.name, a.x, dy - a.r - 30);
          g.globalAlpha = 1;
        }
      }
    }
  },

  drawFx(g, v) {
    for (const p of this.parts) {
      if (!p.on) continue;
      g.globalAlpha = clamp(p.life / p.max, 0, 1);
      g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    for (const r of this.rings) {
      g.globalAlpha = clamp(r.life / r.t, 0, 1) * 0.8;
      g.strokeStyle = r.col; g.lineWidth = 6;
      g.beginPath(); g.arc(r.x, r.y, r.r, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 17px sans-serif';
    for (const t of this.texts) {
      g.globalAlpha = clamp(t.life / t.max, 0, 1);
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillText(t.txt, t.x + 1.5, t.y + 1.5);
      g.fillStyle = t.col;
      g.fillText(t.txt, t.x, t.y);
    }
    g.globalAlpha = 1;
  },

  drawZoneTarget(g) {
    const z = this.zone;
    if (z.mode === 'done') return;
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = 3; g.setLineDash([16, 14]);
    g.beginPath(); g.arc(z.nx, z.ny, Math.max(1, z.nr), 0, TAU); g.stroke();
    g.setLineDash([]);
  },

  drawStorm(g) {
    const z = this.zone;
    const big = MAP * 2;
    const zr = Math.max(1, z.r);
    g.save();
    g.beginPath();
    g.rect(z.x - big, z.y - big, big * 2, big * 2);
    g.arc(z.x, z.y, zr, 0, TAU, true);
    g.fillStyle = 'rgba(150,60,220,.30)';
    g.fill('evenodd');
    g.restore();
    g.strokeStyle = 'rgba(226,150,255,.95)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(z.x, z.y, zr, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)';
    g.lineWidth = 2;
    g.beginPath(); g.arc(z.x, z.y, Math.max(1, z.r - 5), 0, TAU); g.stroke();
  },

  drawDropUI(g) {
    if (this.state !== 'bus') return;
    const b = this.bus;
    g.save();
    g.translate(b.x, b.y); g.rotate(b.ang);
    g.fillStyle = '#e8eeff';
    g.fillRect(-46, -18, 92, 36);
    g.fillStyle = '#4aa3ff';
    g.fillRect(-46, -18, 92, 10);
    g.fillStyle = '#2b3550';
    g.fillRect(30, -12, 14, 24);
    g.restore();
    const p = this.player;
    g.strokeStyle = 'rgba(255,215,106,.8)'; g.lineWidth = 4; g.setLineDash([12, 10]);
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(p.drop.tx, p.drop.ty); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,215,106,.35)';
    g.beginPath(); g.arc(p.drop.tx, p.drop.ty, 34, 0, TAU); g.fill();
  },

  /* ------------------------------------------------------ screen-space UI */
  drawSticks(g) {
    for (const s of [Input.move, Input.aim]) {
      if (!s.active) continue;
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 3;
      g.beginPath(); g.arc(s.ox, s.oy, Input.R, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.beginPath(); g.arc(s.ox, s.oy, Input.R, 0, TAU); g.fill();
      const kx = s.ox + s.x * s.mag * Input.R, ky = s.oy + s.y * s.mag * Input.R;
      g.fillStyle = s === Input.aim ? 'rgba(255,170,120,.75)' : 'rgba(160,210,255,.75)';
      g.beginPath(); g.arc(kx, ky, 24, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(kx, ky, 24, 0, TAU); g.stroke();
    }
  },

  drawMinimap() {
    const c = this.mapX, S = this.mapC.width;
    const k = S / MAP;
    c.fillStyle = '#1d2c22'; c.fillRect(0, 0, S, S);
    // POIs
    c.fillStyle = 'rgba(190,215,180,.22)';
    for (const p of World.pois) { c.beginPath(); c.arc(p.x * k, p.y * k, p.r * k, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, S - 1, S - 1);
    // storm
    const z = this.zone;
    c.save();
    c.beginPath();
    c.rect(0, 0, S, S);
    c.arc(z.x * k, z.y * k, Math.max(1, z.r * k), 0, TAU, true);
    c.fillStyle = 'rgba(150,60,220,.42)'; c.fill('evenodd');
    c.restore();
    c.strokeStyle = '#e296ff'; c.lineWidth = 2;
    c.beginPath(); c.arc(z.x * k, z.y * k, Math.max(1, z.r * k), 0, TAU); c.stroke();
    if (z.mode !== 'done') {
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.setLineDash([4, 4]);
      c.beginPath(); c.arc(z.nx * k, z.ny * k, Math.max(1, z.nr * k), 0, TAU); c.stroke();
      c.setLineDash([]);
    }
    // nearby enemies only — a full radar would trivialise the mode
    const p = this.player;
    c.fillStyle = '#ff6b6b';
    for (const a of this.bots) {
      if (!a.alive) continue;
      if (dist2(a.x, a.y, p.x, p.y) > 900 * 900) continue;
      c.fillRect(a.x * k - 1.5, a.y * k - 1.5, 3, 3);
    }
    // player
    c.fillStyle = '#ffd76a';
    c.beginPath(); c.arc(p.x * k, p.y * k, 3.5, 0, TAU); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(p.x * k, p.y * k);
    c.lineTo(p.x * k + Math.cos(p.aimAng) * 9, p.y * k + Math.sin(p.aimAng) * 9);
    c.stroke();
  }
});

/* ------------------------------------------------------ boot */
addEventListener('load', () => {
  Game.init();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
