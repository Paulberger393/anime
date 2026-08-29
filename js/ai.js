'use strict';
/* ============================================================
   SCHOTTER ROYALE — ai: actors + bot brain
   100 opponents can't all run full physics, so bots use LOD:
     NEAR  (< ~1900px, on screen-ish) -> full sim, real bullets
     FAR                              -> 4Hz cheap sim, abstract duels
   Kills, loot and the alive counter behave identically either way.
   ============================================================ */

let ACTOR_ID = 1;

class Actor {
  constructor(name, isBot) {
    this.id = ACTOR_ID++;
    this.name = name;
    this.isBot = isBot;
    this.alive = true;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.r = 15;
    this.ang = rnd(TAU); this.aimAng = this.ang; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.sh = 0; this.maxSh = 100;
    this.mats = { wood: 0, brick: 0, metal: 0 };
    this.ammo = { light: 0, medium: 0, shells: 0, heavy: 0, rocket: 0 };
    this.slots = [null, null, null, null, null];
    this.sel = 0;
    this.kills = 0; this.dmgDone = 0; this.dmgTaken = 0;
    this.state = 'drop'; this.stateT = 0;
    this.target = null; this.lastSeenT = 0; this.tx = 0; this.ty = 0;
    this.fireT = 0; this.reloadT = 0; this.healT = 0; this.healItem = null;
    this.pickT = 0; this.buildCd = 0; this.hurtT = 0; this.muzzle = 0;
    this.far = false; this.acc = 0; this.strafe = chance(0.5) ? 1 : -1;
    this.dest = null; this.stuck = 0; this.avoid = 0; this.avoidDir = 1;
    this.placed = 0; this.killer = null;
    this.drop = { phase: 'bus', h: 1, tx: 0, ty: 0 };
    this.mat = 'wood';
    this.recoil = 0; this.flash = 0;
    this.color = 0;
  }

  get gun() { const s = this.slots[this.sel]; return s && s.kind === 'gun' ? s : null; }
  get eff() { return this.hp + this.sh; }

  /** returns leftover damage after shields soak their part */
  hurt(dmg, src) {
    if (!this.alive) return false;
    let d = dmg;
    if (this.sh > 0) { const s = Math.min(this.sh, d); this.sh -= s; d -= s; }
    this.hp -= d;
    this.dmgTaken += dmg;
    this.hurtT = 0.25;
    if (src) { src.dmgDone += dmg; this.lastAttacker = src; this.lastAttackT = 0; }
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.killer = src || null; return true; }
    return false;
  }

  addAmmo(type, n) { this.ammo[type] = Math.min(999, this.ammo[type] + n); }
  addMat(m, n) { this.mats[m] = Math.min(MAT_INFO[m].max * 2, this.mats[m] + n); }

  /** first free slot, else replace the worst gun / stack the consumable */
  take(item) {
    if (item.kind === 'ammo') { this.addAmmo(item.id, item.count); return 'ammo'; }
    if (item.kind === 'con') {
      for (let i = 0; i < 5; i++) {
        const s = this.slots[i];
        if (s && s.kind === 'con' && s.id === item.id && s.count < CONSUM[item.id].stack) {
          const room = CONSUM[item.id].stack - s.count;
          const n = Math.min(room, item.count);
          s.count += n; item.count -= n;
          if (item.count <= 0) return 'stack';
        }
      }
    }
    for (let i = 0; i < 5; i++) if (!this.slots[i]) { this.slots[i] = item; if (item.kind === 'gun' && !this.gun) this.sel = i; return 'new'; }
    if (item.kind === 'gun') {
      // swap out the weakest gun if this one is better
      let worst = -1, ws = 1e9;
      for (let i = 0; i < 5; i++) {
        const s = this.slots[i];
        if (s && s.kind === 'gun') { const sc = gunScore(s, this); if (sc < ws) { ws = sc; worst = i; } }
      }
      if (worst >= 0 && gunScore(item, this) > ws) { const old = this.slots[worst]; this.slots[worst] = item; return old; }
    }
    return null;
  }
}

/** rough DPS-ish rating used for auto-swap and bot weapon choice */
function gunScore(g, actor) {
  const W = WEAPONS[g.id];
  let dps = g.dmg * g.pellets * (g.rpm / 60);
  dps *= 1 + W.botPref * 0.06;
  if (actor && actor.ammo[g.ammo] <= 0) dps *= 0.25;      // a gun you can't feed is nearly worthless
  return dps;
}

/* ============================================================
   Bot brain
   ============================================================ */
const AI = {
  D: DIFF.normal,

  spawn(name) {
    const b = new Actor(name, true);
    b.skill = clamp(rnd(0.55, 1.35), 0.4, 1.5);           // per-bot talent spread
    b.color = rndi(0, 7);
    b.pref = pick(['ar', 'smg', 'shotgun', 'ar', 'tac']);
    b.aggr = rnd(0.6, 1.4);
    b.lootGreed = rnd(0.6, 1.5);
    return b;
  },

  /** Bots land empty-handed like you do — only ammo, mats and a snack.
      They pick real guns off the ground (near) or via autoLoot (far). */
  equip(b) {
    b.addAmmo('light', 40 + rndi(0, 40));
    b.addAmmo('medium', 40 + rndi(0, 40));
    b.addAmmo('shells', 8 + rndi(0, 10));
    if (chance(0.55)) b.slots[1] = { kind: 'con', id: 'mini', name: CONSUM.mini.name, ic: CONSUM.mini.ic, count: rndi(1, 4) };
    if (chance(0.4))  b.slots[2] = { kind: 'con', id: 'bandage', name: CONSUM.bandage.name, ic: CONSUM.bandage.ic, count: rndi(2, 6) };
    const m = 30 + rndi(0, 90);
    b.mats.wood = m; b.mats.brick = (m * 0.5) | 0; b.mats.metal = (m * 0.3) | 0;
    b.mat = pick(MATS);
  },

  /* ---------- FULL SIM ---------- */
  think(b, dt, G) {
    const D = this.D;
    b.stateT += dt;
    if (b.buildCd > 0) b.buildCd -= dt;
    if (b.lastAttackT !== undefined) b.lastAttackT += dt;

    // ---- healing has priority and locks the bot in place
    if (b.healT > 0) {
      b.healT -= dt;
      if (b.healT <= 0) G.finishHeal(b);
      return;
    }

    // ---- target acquisition (throttled: re-scan ~5x/sec, not 60)
    b.scanT = (b.scanT || 0) - dt;
    if (b.scanT <= 0) {
      b.scanT = 0.18 + rnd(0.12);
      this.acquire(b, G);
    }

    const zone = G.zone;
    const dz = dist(b.x, b.y, zone.x, zone.y);
    const outside = dz > zone.r - 40;
    const danger = dz > zone.r * 0.92;

    // ---- decide state
    const lowHp = b.eff < 55;
    const canHeal = this.findHeal(b, lowHp) !== -1;
    const t = b.target;
    const seeT = t && t.alive && b.lastSeenT < 2.2;
    const armed = !!this.bestGun(b);

    if (outside) b.state = 'rotate';
    else if (lowHp && canHeal && (!seeT || b.lastSeenT > 1.4) && chance(D.heal * 0.6)) b.state = 'heal';
    // no gun + someone nearby = go find a gun, don't start a fist fight
    else if (seeT && !armed) b.state = 'flee';
    // being shot at overrides any reluctance to engage
    else if (seeT && (b.engage || b.lastAttackT < 2.5)) b.state = 'fight';
    else if (danger) b.state = 'rotate';
    else if (!armed || b.ammo[this.bestGun(b).ammo] < 8) b.state = 'loot';
    else if (b.state !== 'loot' || !b.dest) b.state = (chance(0.5) ? 'loot' : 'rotate');

    switch (b.state) {
      case 'heal':   this.doHeal(b, G); break;
      case 'fight':  this.doFight(b, dt, G); break;
      case 'flee':   this.doFlee(b, dt, G); break;
      case 'loot':   this.doLoot(b, dt, G); break;
      default:       this.doRotate(b, dt, G); break;
    }

    // ---- panic wall: recently shot, no cover, has mats
    if (b.buildCd <= 0 && b.lastAttackT < 0.9 && b.mats[b.mat] >= BUILD_KINDS.wall.cost && chance(D.build * b.skill * dt * 4)) {
      const src = b.lastAttacker;
      if (src && src.alive) {
        const a = Math.atan2(src.y - b.y, src.x - b.x);
        G.tryBuild(b, 'wall', b.x + Math.cos(a) * 52, b.y + Math.sin(a) * 52, a);
        b.buildCd = 1.6 + rnd(1.4);
      }
    }
  },

  acquire(b, G) {
    const D = this.D;
    const view = D.view * (0.8 + b.skill * 0.25);
    const near = G.aGrid.query(b.x, b.y, view, G._tmp);
    let best = null, bd = view * view;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === b || !o.alive) continue;
      const d2 = dist2(b.x, b.y, o.x, o.y);
      if (d2 > bd) continue;
      // being shot at makes a bot look your way even without a clean line
      if (World.losBlocked(b.x, b.y, o.x, o.y) && o !== b.lastAttacker) continue;
      bd = d2; best = o;
    }
    if (best) {
      if (best !== b.target) {
        // Not every sighting is a fight. Aggression decides whether this bot
        // commits or keeps looting — without it the whole lobby beelines at
        // the first thing it sees and the match burns down in 45 seconds.
        b.engage = chance(0.5 * D.aggro * b.aggr);
      }
      b.target = best; b.lastSeenT = 0; b.tx = best.x; b.ty = best.y;
    } else if (b.target) { b.lastSeenT += 0.3; }
  },

  doFight(b, dt, G) {
    const D = this.D, t = b.target;
    b.lastSeenT += dt;
    if (!t || !t.alive) { b.target = null; b.state = 'rotate'; return; }
    if (!World.losBlocked(b.x, b.y, t.x, t.y)) { b.tx = t.x; b.ty = t.y; b.lastSeenT = 0; }

    const d = dist(b.x, b.y, b.tx, b.ty);
    const g = this.bestGun(b);
    const want = g ? clamp(g.range * 0.55, 120, 620) : 90;

    // strafe + close/back off to the weapon's comfort band
    const toT = Math.atan2(b.ty - b.y, b.tx - b.x);
    let mv = toT;
    if (d > want * 1.25) mv = toT;
    else if (d < want * 0.55) mv = toT + Math.PI;
    else mv = toT + b.strafe * Math.PI * 0.5;
    if (chance(dt * 0.6)) b.strafe *= -1;
    this.walk(b, dt, mv, 1);

    // aim with a skill/distance dependent error that settles the longer you track
    b.acc = Math.min(1, b.acc + dt / Math.max(0.05, D.react));
    const err = (1 - D.acc * b.skill * b.acc) * (0.20 + d / 2600);
    const aim = toT + (Math.sin(G.time * 3.1 + b.id) * 0.5 + (Math.random() - 0.5)) * err;
    b.aimAng = angApproach(b.aimAng, aim, dt * (5 + D.acc * 9));
    b.ang = b.aimAng;

    if (b.lastSeenT > 0.35) return;                       // lost sight — hold fire
    if (!g) { if (d < 54) G.melee(b, b.aimAng); else b.state = 'flee'; return; }
    if (g !== b.slots[b.sel]) { b.sel = b.slots.indexOf(g); return; }
    if (g.inMag <= 0) { G.reload(b); return; }
    if (d > g.range * 1.1) return;
    if (b.fireT > 0) return;
    if (Math.abs(angDiff(b.aimAng, toT)) > 0.30) return;  // still swinging onto target
    // trigger discipline: a burst, then a beat to re-aim — holding the trigger
    // forever made every engagement a coin flip decided in half a second
    if (b.burstPause > 0) { b.burstPause -= dt; return; }
    if (b.burstLeft === undefined) b.burstLeft = rndi(3, 8);
    if (G.fire(b, b.aimAng) && --b.burstLeft <= 0) {
      b.burstLeft = rndi(3, 9);
      b.burstPause = rnd(0.30, 0.85) / (0.6 + b.skill * 0.5);
    }
  },

  /** Unarmed and spotted: break contact toward the nearest loot.
      Only swings back if the threat is literally on top of it. */
  doFlee(b, dt, G) {
    const t = b.target;
    b.lastSeenT += dt;
    const away = t && t.alive ? Math.atan2(b.y - t.y, b.x - t.x) : (b.fleeAng || (b.fleeAng = rnd(TAU)));
    let ang = away;
    const l = G.lootNear(b.x, b.y, 750);
    if (l) {
      const toL = Math.atan2(l.y - b.y, l.x - b.x);
      if (!t || Math.abs(angDiff(toL, away)) < 1.6) ang = toL;      // loot that isn't behind the threat
      if (dist(b.x, b.y, l.x, l.y) < 34) G.pickupNear(b);
    }
    this.walk(b, dt, ang, 1.12);
    b.ang = angApproach(b.ang, ang, dt * 7);
    b.aimAng = b.ang;
    if (t && t.alive && dist(b.x, b.y, t.x, t.y) < 54) {           // cornered — fight back
      b.aimAng = Math.atan2(t.y - b.y, t.x - b.x);
      G.melee(b, b.aimAng);
    }
  },

  doLoot(b, dt, G) {
    // pick a loot goal and walk to it; grab happens in Game.pickupNear
    if (!b.dest || b.dest.kind !== 'loot' || b.stateT > 6 || (b.dest.ref && (b.dest.ref.taken || b.dest.ref.open))) {
      const near = G.lootNear(b.x, b.y, 900 * b.lootGreed);
      if (near) b.dest = { kind: 'loot', x: near.x, y: near.y, ref: near };
      else { b.state = 'rotate'; b.dest = null; return; }
      b.stateT = 0;
    }
    const d = dist(b.x, b.y, b.dest.x, b.dest.y);
    if (d < 30) { G.pickupNear(b); b.dest = null; b.stateT = 5; return; }
    this.walk(b, dt, Math.atan2(b.dest.y - b.y, b.dest.x - b.x), 1);
    b.ang = angApproach(b.ang, Math.atan2(b.dest.y - b.y, b.dest.x - b.x), dt * 6);
    b.aimAng = b.ang;
  },

  doRotate(b, dt, G) {
    const z = G.zone;
    if (!b.dest || b.dest.kind !== 'zone' || b.stateT > 4) {
      const a = rnd(TAU), rr = z.r * rnd(0.15, 0.72);
      b.dest = { kind: 'zone', x: clamp(z.x + Math.cos(a) * rr, 60, MAP - 60), y: clamp(z.y + Math.sin(a) * rr, 60, MAP - 60) };
      b.stateT = 0;
    }
    const d = dist(b.x, b.y, b.dest.x, b.dest.y);
    if (d < 60) { b.dest = null; return; }
    const a = Math.atan2(b.dest.y - b.y, b.dest.x - b.x);
    const outside = dist(b.x, b.y, z.x, z.y) > z.r;
    this.walk(b, dt, a, outside ? 1.18 : 1);
    b.ang = angApproach(b.ang, a, dt * 6);
    b.aimAng = b.ang;
  },

  findHeal(b, urgent) {
    let idx = -1, bestScore = -1;
    for (let i = 0; i < 5; i++) {
      const s = b.slots[i];
      if (!s || s.kind !== 'con') continue;
      const c = CONSUM[s.id];
      if (c.kind === 'hp' && b.hp >= c.cap) continue;
      if (c.kind === 'sh' && b.sh >= c.cap) continue;
      // prefer shields when healthy, health when hurt
      const score = (c.kind === 'sh' ? (b.hp > 60 ? 2 : 1) : (b.hp < 60 ? 2 : 0.5)) * (urgent ? c.amount : 1);
      if (score > bestScore) { bestScore = score; idx = i; }
    }
    return idx;
  },

  doHeal(b, G) {
    const i = this.findHeal(b, true);
    if (i === -1) { b.state = 'rotate'; return; }
    b.sel = i;
    G.startHeal(b);
  },

  bestGun(b) {
    let best = null, bs = -1;
    for (let i = 0; i < 5; i++) {
      const s = b.slots[i];
      if (!s || s.kind !== 'gun') continue;
      if (b.ammo[s.ammo] <= 0 && s.inMag <= 0) continue;
      const sc = gunScore(s, b) * (s.id === b.pref ? 1.15 : 1);
      if (sc > bs) { bs = sc; best = s; }
    }
    return best;
  },

  /** move with obstacle-aware detouring */
  walk(b, dt, ang, mult) {
    const sp = G_SPEED * mult * (0.92 + b.skill * 0.08);
    if (b.avoid > 0) { b.avoid -= dt; ang += b.avoidDir * 1.15; }
    const nx = b.x + Math.cos(ang) * sp * dt;
    const ny = b.y + Math.sin(ang) * sp * dt;
    const p = World.collide(nx, ny, b.r);
    const moved = dist(b.x, b.y, p.x, p.y);
    b.x = p.x; b.y = p.y;
    if (moved < sp * dt * 0.45) {
      b.stuck += dt;
      if (b.stuck > 0.22 && b.avoid <= 0) { b.avoid = 0.55 + rnd(0.5); b.avoidDir = chance(0.5) ? 1 : -1; b.stuck = 0; }
    } else b.stuck = Math.max(0, b.stuck - dt);
  },

  /** off-screen looting: a bot that has been on the ground a while finds gear,
      so the far half of the lobby is armed on the same curve as the near half */
  autoLoot(b, dt, G) {
    b.lootT = (b.lootT || rnd(4, 14)) - dt;
    if (b.lootT > 0) return;
    b.lootT = rnd(10, 24);
    if (!this.bestGun(b)) { const g = rollWeapon(clamp(G.matchT / 200, 0, 1)); b.take(g); b.addAmmo(g.ammo, 40); return; }
    if (chance(0.5)) { const g = rollWeapon(clamp(G.matchT / 160, 0, 1)); b.take(g); b.addAmmo(g.ammo, 30); }
    else if (b.sh < 50 && chance(0.6)) b.sh = Math.min(100, b.sh + 25);
  },

  /* ---------- CHEAP SIM (far from the player) ----------
     Same outcomes, ~1/40th the cost: no bullets, no LOS rays,
     duels resolved as damage-over-time between close bots.        */
  thinkFar(b, dt, G) {
    const z = G.zone;
    this.autoLoot(b, dt, G);
    const dz = dist(b.x, b.y, z.x, z.y);
    if (!b.dest || b.dest.kind !== 'zone' || dz > z.r * 0.85) {
      const a = rnd(TAU), rr = z.r * rnd(0.1, 0.6);
      b.dest = { kind: 'zone', x: clamp(z.x + Math.cos(a) * rr, 60, MAP - 60), y: clamp(z.y + Math.sin(a) * rr, 60, MAP - 60) };
    }
    const a = Math.atan2(b.dest.y - b.y, b.dest.x - b.x);
    const sp = G_SPEED * (dz > z.r ? 1.15 : 0.85);
    b.x = clamp(b.x + Math.cos(a) * sp * dt, 30, MAP - 30);
    b.y = clamp(b.y + Math.sin(a) * sp * dt, 30, MAP - 30);
    b.ang = a; b.aimAng = a;
    if (dist(b.x, b.y, b.dest.x, b.dest.y) < 70) b.dest = null;

    // abstract duel: pick one nearby rival and trade damage
    b.duelT = (b.duelT || 0) - dt;
    if (b.duelT > 0) return;
    b.duelT = 0.9 + rnd(0.6);
    if (!chance(0.6)) return;                      // most ticks are cover, reloads, misses
    const near = G.aGrid.query(b.x, b.y, 260, G._tmp);
    let foe = null, bd = 260 * 260;
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o === b || !o.alive || !o.isBot) continue;
      const d2 = dist2(b.x, b.y, o.x, o.y);
      if (d2 < bd) { bd = d2; foe = o; }
    }
    if (!foe) return;
    const g = this.bestGun(b);
    const dps = (g ? gunScore(g, b) * 0.06 : 5) * this.D.acc * b.skill * this.D.dmg;
    const dmg = dps * 0.42 * (0.6 + Math.random() * 0.8);
    if (foe.hurt(dmg, b)) G.onKill(b, foe, g ? g.id : 'melee');
    if (b.eff < 40 && chance(0.5)) {                       // far bots heal off-screen too
      const i2 = this.findHeal(b, true);
      if (i2 !== -1) { b.sel = i2; G.startHeal(b); }
    }
  }
};

let G_SPEED = 215;      // base walk speed, shared by player and bots
