'use strict';
/* ============================================================
   SCHOTTER ROYALE — core: math, rng, input, audio, storage
   ============================================================ */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;
const dist  = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const rnd   = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rndi  = (a, b) => Math.floor(rnd(a, b + 1));
const pick  = arr => arr[(Math.random() * arr.length) | 0];
const chance = p => Math.random() < p;
/** shortest signed angle from a to b */
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
/** rotate a toward b by at most max radians */
function angApproach(a, b, max) { const d = angDiff(a, b); return a + clamp(d, -max, max); }

/** deterministic rng so a seed always rebuilds the same island */
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
   Storage — persistent career stats + settings
   ============================================================ */
const Store = {
  key: 'schotter.v1',
  data: { wins: 0, matches: 0, kills: 0, best: 0, bestPlace: 999, dmg: 0, opts: {} },
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) Object.assign(this.data, JSON.parse(raw));
    } catch (e) { /* private mode / disabled storage — play without saving */ }
    return this.data;
  },
  save() {
    try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {}
  }
};

/* ============================================================
   Audio — everything synthesized, zero asset files, zero network
   ============================================================ */
const Snd = {
  ctx: null, master: null, on: true, noise: null, last: {},
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.30;
    this.master.connect(this.ctx.destination);
    // one shared noise buffer for gunfire / impacts / storm
    const len = this.ctx.sampleRate * 1.2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startStorm();
  },
  /** rate-limit a sound key so 100 bots can't spam 200 oscillators a frame */
  gate(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now; return true;
  },
  env(node, t, vol, atk, dec) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + atk + dec);
    node.connect(g); g.connect(this.master);
    return g;
  },
  burst(t, vol, dur, freq, q, type) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    s.connect(f);
    this.env(f, t, vol, 0.001, dur);
    s.start(t); s.stop(t + dur + 0.05);
  },
  tone(t, vol, dur, f0, f1, type) {
    const o = this.ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(o, t, vol, 0.005, dur);
    o.start(t); o.stop(t + dur + 0.05);
  },
  /** vol scales with distance so far-off firefights stay in the background */
  play(name, vol = 1) {
    if (!this.on || !this.ctx || vol <= 0.02) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'pistol': if (!this.gate('p', 25)) return; this.burst(t, .30 * vol, .09, 1500, .8); this.tone(t, .18 * vol, .07, 220, 60, 'square'); break;
      case 'smg':    if (!this.gate('s', 18)) return; this.burst(t, .22 * vol, .06, 1900, .9); break;
      case 'ar':     if (!this.gate('a', 22)) return; this.burst(t, .32 * vol, .10, 1200, .7); this.tone(t, .20 * vol, .08, 180, 50, 'square'); break;
      case 'shotgun':if (!this.gate('g', 40)) return; this.burst(t, .45 * vol, .22, 700, .5); this.tone(t, .25 * vol, .16, 130, 40, 'square'); break;
      case 'sniper': if (!this.gate('n', 60)) return; this.burst(t, .50 * vol, .32, 900, .4); this.tone(t, .30 * vol, .26, 150, 35, 'sawtooth'); break;
      case 'rpg':    this.burst(t, .40 * vol, .30, 500, .5); this.tone(t, .30 * vol, .35, 300, 60, 'sawtooth'); break;
      case 'boom':   this.burst(t, .60 * vol, .55, 220, .4, 'lowpass'); this.tone(t, .35 * vol, .45, 90, 28, 'triangle'); break;
      case 'hit':    if (!this.gate('h', 30)) return; this.tone(t, .22 * vol, .05, 900, 500, 'square'); break;
      case 'hurt':   this.tone(t, .30 * vol, .18, 300, 120, 'sawtooth'); this.burst(t, .18 * vol, .12, 500, .6); break;
      case 'shield': this.tone(t, .22 * vol, .12, 700, 1500, 'sine'); this.tone(t + .06, .18 * vol, .14, 1100, 1900, 'sine'); break;
      case 'kill':   this.tone(t, .30, .10, 700, 1200, 'square'); this.tone(t + .09, .30, .18, 1200, 1700, 'square'); break;
      case 'pickup': this.tone(t, .20 * vol, .07, 800, 1300, 'triangle'); break;
      case 'reload': this.burst(t, .22 * vol, .07, 2600, 2.5); this.tone(t + .12, .14 * vol, .06, 400, 260, 'square'); break;
      case 'build':  if (!this.gate('b', 40)) return; this.burst(t, .22 * vol, .10, 420, .8, 'lowpass'); this.tone(t, .14 * vol, .09, 320, 200, 'triangle'); break;
      case 'chop':   if (!this.gate('c', 60)) return; this.burst(t, .24 * vol, .08, 1100, 1.4); break;
      case 'chest':  this.tone(t, .22, .12, 500, 900); this.tone(t + .1, .22, .18, 900, 1400); break;
      case 'zone':   this.tone(t, .22, .5, 420, 300, 'triangle'); this.tone(t + .3, .22, .6, 320, 220, 'triangle'); break;
      case 'win':    [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * .13, .3, .4, f, f, 'triangle')); break;
      case 'lose':   [400, 330, 260, 190].forEach((f, i) => this.tone(t + i * .16, .28, .5, f, f * .9, 'sawtooth')); break;
      case 'jump':   this.burst(t, .30, .8, 600, .3, 'lowpass'); break;
    }
  },
  /** looping wind bed whose volume tracks how close the storm wall is */
  startStorm() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    this.stormGain = this.ctx.createGain(); this.stormGain.gain.value = 0;
    s.connect(f); f.connect(this.stormGain); this.stormGain.connect(this.master);
    s.start();
  },
  storm(v) {
    if (this.stormGain && this.ctx) {
      this.stormGain.gain.setTargetAtTime(this.on ? clamp(v, 0, 1) * 0.5 : 0, this.ctx.currentTime, 0.4);
    }
  },
  mute(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.30 : 0; }
};

/* ============================================================
   Input — multi-touch: two floating sticks + hit-tested HUD buttons
   Buttons are DOM elements but hit-tested manually from one global
   touch handler, which is what makes true multi-touch work on iOS
   (a finger on the stick never steals the finger on FIRE).
   ============================================================ */
const Input = {
  move: { x: 0, y: 0, mag: 0, id: null, ox: 0, oy: 0, cx: 0, cy: 0, active: false },
  aim:  { x: 0, y: 0, mag: 0, id: null, ox: 0, oy: 0, cx: 0, cy: 0, active: false },
  btn: {},          // act -> true while held
  tapped: {},       // act -> true for exactly one frame
  rects: [],        // cached button hitboxes
  els: {},
  leftHanded: false,
  R: 52,            // stick travel radius
  DEAD: 0.16,

  init() {
    document.querySelectorAll('[data-act]').forEach(el => {
      this.els[el.dataset.act] = el;
      this.btn[el.dataset.act] = false;
    });
    this.cache();
    addEventListener('resize', () => setTimeout(() => this.cache(), 60));
    addEventListener('orientationchange', () => setTimeout(() => this.cache(), 250));

    const c = document.getElementById('game');
    const opt = { passive: false };
    c.addEventListener('touchstart', e => this.down(e), opt);
    c.addEventListener('touchmove',  e => this.movee(e), opt);
    c.addEventListener('touchend',   e => this.up(e), opt);
    c.addEventListener('touchcancel',e => this.up(e), opt);
    // iOS: kill double-tap zoom and long-press callout over the play area
    document.addEventListener('gesturestart', e => e.preventDefault(), opt);
    document.addEventListener('contextmenu',  e => e.preventDefault(), opt);

    // desktop fallback so the game is testable without a phone
    this.keys = {};
    addEventListener('keydown', e => { this.keys[e.code] = true; this.key(e.code, true); });
    addEventListener('keyup',   e => { this.keys[e.code] = false; this.key(e.code, false); });
    c.addEventListener('mousemove', e => {
      if (this.mx !== undefined) { this.mdx = (this.mdx || 0) + e.clientX - this.mx; this.mdy = (this.mdy || 0) + e.clientY - this.my; }
      this.mx = e.clientX; this.my = e.clientY;
    });
    c.addEventListener('mousedown', e => { this.mouse = true; e.preventDefault(); });
    addEventListener('mouseup',     () => { this.mouse = false; });
  },

  /** button rects only change on layout/resize, so cache them */
  cache() {
    this.rects = [];
    for (const act in this.els) {
      const el = this.els[act];
      if (!el.offsetParent) continue;              // hidden (e.g. build bar closed)
      const r = el.getBoundingClientRect();
      this.rects.push({ act, x: r.x + r.width / 2, y: r.y + r.height / 2, r: Math.max(r.width, r.height) / 2 + 9 });
    }
  },

  /** Bildschirm- -> Buehnenkoordinaten.
      rot 1 = Buehne um +90° gedreht (Oberkante zeigt nach rechts),
      rot 2 = um -90° (Oberkante nach links). */
  toStage(x, y) {
    if (this.rot === 1) return { x: y, y: innerWidth - x };
    if (this.rot === 2) return { x: innerHeight - y, y: x };
    return { x, y };
  },
  stageW() { return this.rot ? innerHeight : innerWidth; },

  hitBtn(x, y) {
    let best = null, bd = 1e9;
    for (const b of this.rects) {
      const d = dist2(x, y, b.x, b.y);
      if (d < b.r * b.r && d < bd) { bd = d; best = b.act; }
    }
    return best;
  },

  press(act) {
    if (!this.btn[act]) this.tapped[act] = true;
    this.btn[act] = true;
    const el = this.els[act]; if (el) el.classList.add('on');
    if (navigator.vibrate) navigator.vibrate(8);
  },
  release(act) {
    this.btn[act] = false;
    const el = this.els[act]; if (el) el.classList.remove('on');
  },

  down(e) {
    e.preventDefault(); Snd.init();
    for (const t of e.changedTouches) {
      const act = this.hitBtn(t.clientX, t.clientY);
      if (act) { this.touchAct = this.touchAct || {}; this.touchAct[t.identifier] = act; this.press(act); continue; }
      // otherwise it's a stick: left half moves, right half aims (swapped for lefties)
      const s = this.toStage(t.clientX, t.clientY);
      const leftSide = s.x < this.stageW() * 0.5;
      const stick = (leftSide !== this.leftHanded) ? this.move : this.aim;
      if (stick.id !== null) continue;
      stick.id = t.identifier; stick.active = true;
      stick.ox = stick.cx = s.x; stick.oy = stick.cy = s.y;
      stick.px = s.x; stick.py = s.y;                  // fuer das Blick-Delta
      stick.x = stick.y = stick.mag = 0;
    }
  },

  movee(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const s of [this.move, this.aim]) {
        if (s.id !== t.identifier) continue;
        const q = this.toStage(t.clientX, t.clientY);
        let dx = q.x - s.ox, dy = q.y - s.oy;
        const d = Math.hypot(dx, dy);
        if (d > this.R) {                    // drag the origin along so the stick never sticks at the rim
          s.ox += dx * (1 - this.R / d);
          s.oy += dy * (1 - this.R / d);
          dx *= this.R / d; dy *= this.R / d;
        }
        // Ego-Perspektive dreht sich um die Fingerbewegung, nicht um die
        // Auslenkung: gezogen wird wie mit einer Maus, nicht wie an einem Stick.
        s.dxA = (s.dxA || 0) + (q.x - (s.px === undefined ? q.x : s.px));
        s.dyA = (s.dyA || 0) + (q.y - (s.py === undefined ? q.y : s.py));
        s.px = q.x; s.py = q.y;
        s.cx = q.x; s.cy = q.y;
        const m = Math.min(1, Math.hypot(dx, dy) / this.R);
        if (m < this.DEAD) { s.x = s.y = 0; s.mag = 0; }
        else {
          const n = Math.hypot(dx, dy) || 1;
          s.x = dx / n; s.y = dy / n;
          s.mag = (m - this.DEAD) / (1 - this.DEAD);
        }
      }
    }
  },

  up(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.touchAct && this.touchAct[t.identifier]) {
        this.release(this.touchAct[t.identifier]);
        delete this.touchAct[t.identifier];
      }
      for (const s of [this.move, this.aim]) {
        if (s.id === t.identifier) { s.id = null; s.active = false; s.x = s.y = s.mag = 0; s.px = s.py = undefined; }
      }
    }
  },

  key(code, dn) {
    const map = { Space: 'fire', KeyR: 'reload', KeyE: 'use', KeyQ: 'heal', KeyF: 'pickaxe',
                  ShiftLeft: 'sprint', KeyB: 'build', KeyZ: 'bwall', KeyX: 'bcorner', KeyC: 'bbox', KeyV: 'bmat' };
    if (map[code]) { dn ? this.press(map[code]) : this.release(map[code]); }
  },

  /** fold keyboard/mouse into the same stick values the game reads */
  desktop(canvas, px, py) {
    const k = this.keys; if (!k) return;
    let dx = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    let dy = (k.KeyS ? 1 : 0) - (k.KeyW ? 1 : 0);
    if (dx || dy) { const n = Math.hypot(dx, dy); this.move.x = dx / n; this.move.y = dy / n; this.move.mag = 1; }
    else if (!this.move.active) { this.move.mag = 0; }
    if (this.mx !== undefined && !this.aim.active) {
      const ax = this.mx - px, ay = this.my - py, n = Math.hypot(ax, ay) || 1;
      this.aim.x = ax / n; this.aim.y = ay / n; this.aim.mag = 1;
    }
    const fireEl = this.els.fire;
    if (this.mouse) this.btn.fire = true;
    else if (!fireEl || !fireEl.classList.contains('on')) this.btn.fire = false;
  },

  /** Blickbewegung seit dem letzten Bild; das Lesen setzt sie zurueck */
  lookDelta() {
    const s = this.aim;
    const d = { dx: s.dxA || 0, dy: s.dyA || 0 };
    s.dxA = 0; s.dyA = 0;
    if (this.mdx || this.mdy) { d.dx += this.mdx; d.dy += this.mdy; this.mdx = this.mdy = 0; }
    return d;
  },

  /** call once per frame after the game has read input */
  endFrame() { this.tapped = {}; },
  tap(a) { return !!this.tapped[a]; }
};
