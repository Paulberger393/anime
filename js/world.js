'use strict';
/* ============================================================
   SCHOTTER ROYALE — world: island generation, spatial grid, loot
   ============================================================ */

const MAP = 6600;                // world is MAP x MAP px
const CELL = 200;                // spatial-hash cell size

/* ------------------------------------------------------------
   Spatial hash — the whole reason 100 bots + hundreds of bullets
   stay at 60fps. Rebuilt each frame for movers, built once for statics.
   ------------------------------------------------------------ */
class Grid {
  constructor(cell = CELL) {
    this.cell = cell;
    this.cols = Math.ceil(MAP / cell) + 2;
    this.buckets = new Map();
  }
  key(cx, cy) { return cy * this.cols + cx; }
  clear() { this.buckets.clear(); }
  add(o) {
    const cx = (o.x / this.cell) | 0, cy = (o.y / this.cell) | 0;
    const k = this.key(cx, cy);
    let b = this.buckets.get(k);
    if (!b) { b = []; this.buckets.set(k, b); }
    b.push(o);
  }
  /** collect everything within `r` world px of (x,y) into `out` */
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = ((x - r) / c) | 0, x1 = ((x + r) / c) | 0;
    const y0 = ((y - r) / c) | 0, y1 = ((y + r) / c) | 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------
   Island
   ------------------------------------------------------------ */
const World = {
  obstacles: [],     // {x,y,w,h,type,hp,mat,solid}  axis-aligned boxes
  props: [],         // harvestable trees / rocks / crates
  loot: [],          // ground items
  chests: [],
  pois: [],
  structures: [],    // player/bot-built pieces
  sGrid: new Grid(220),   // statics (obstacles + props)
  bGrid: new Grid(220),   // built structures
  lGrid: new Grid(260),   // loot
  bgCanvas: null,
  seed: 1,

  gen(seed) {
    this.seed = seed >>> 0;
    const R = mulberry32(this.seed);
    this.obstacles.length = 0; this.props.length = 0; this.loot.length = 0;
    this.chests.length = 0; this.pois.length = 0; this.structures.length = 0;

    const names = POI_NAMES.slice();
    // shuffle POI names deterministically from the seed
    for (let i = names.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; [names[i], names[j]] = [names[j], names[i]]; }

    // --- named locations on a jittered 3x3..4x4 lattice, plus a big centre one
    const N = 5, pad = 640, step = (MAP - pad * 2) / (N - 1);
    let ni = 0;
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        if (R() < 0.18) continue;                       // leave gaps = open field rotations
        const x = pad + gx * step + (R() - 0.5) * step * 0.45;
        const y = pad + gy * step + (R() - 0.5) * step * 0.45;
        const big = R() < 0.35;
        this.pois.push({ x, y, name: names[ni++ % names.length], r: big ? 400 : 280, big });
      }
    }

    for (const p of this.pois) this.town(R, p);
    this.scatter(R);
    this.floorLoot(R);
    this.bake();
  },

  /** one settlement: a ring of buildings + chests + surrounding cover */
  town(R, p) {
    const count = p.big ? 7 + ((R() * 4) | 0) : 4 + ((R() * 3) | 0);
    for (let i = 0; i < count; i++) {
      const a = R() * TAU, d = R() * p.r * 0.85;
      const bw = 130 + R() * 190, bh = 120 + R() * 170;
      const bx = clamp(p.x + Math.cos(a) * d, 120, MAP - 120 - bw);
      const by = clamp(p.y + Math.sin(a) * d, 120, MAP - 120 - bh);
      this.building(R, bx, by, bw, bh);
    }
    const chests = p.big ? 4 + ((R() * 3) | 0) : 2 + ((R() * 2) | 0);
    for (let i = 0; i < chests; i++) {
      const a = R() * TAU, d = R() * p.r * 0.8;
      this.chests.push({
        x: clamp(p.x + Math.cos(a) * d, 80, MAP - 80),
        y: clamp(p.y + Math.sin(a) * d, 80, MAP - 80),
        r: 22, open: false, bob: R() * TAU
      });
    }
    // loose cover so towns aren't wide-open shooting galleries
    for (let i = 0; i < (p.big ? 14 : 8); i++) {
      const a = R() * TAU, d = p.r * (0.5 + R() * 0.75);
      const x = clamp(p.x + Math.cos(a) * d, 60, MAP - 60);
      const y = clamp(p.y + Math.sin(a) * d, 60, MAP - 60);
      this.props.push(this.prop(R, x, y, R() < 0.5 ? 'rock' : 'crate'));
    }
  },

  /** hollow building: 4 walls with a doorway gap on one side */
  building(R, x, y, w, h) {
    const T = 20, door = 62;
    const doorSide = (R() * 4) | 0;
    const push = (bx, by, bw, bh) => {
      if (bw > 4 && bh > 4) this.obstacles.push({ x: bx, y: by, w: bw, h: bh, type: 'wall', hp: 400, solid: true });
    };
    const gap = (len, has) => {
      if (!has) return [[0, len]];
      const d = clamp(len * 0.5 - door / 2 + (R() - 0.5) * len * 0.2, T, len - door - T);
      return [[0, d], [d + door, len - d - door]];
    };
    for (const [o, l] of gap(w, doorSide === 0)) push(x + o, y, l, T);            // top
    for (const [o, l] of gap(w, doorSide === 1)) push(x + o, y + h - T, l, T);    // bottom
    for (const [o, l] of gap(h, doorSide === 2)) push(x, y + o, T, l);            // left
    for (const [o, l] of gap(h, doorSide === 3)) push(x + w - T, y + o, T, l);    // right
    this.obstacles.push({ x, y, w, h, type: 'floor', solid: false });             // visual only
    // interior loot
    if (R() < 0.7) this.loot.push(this.item(x + T + R() * (w - T * 2 - 20), y + T + R() * (h - T * 2 - 20), R() < 0.55 ? rollWeapon(0.35) : rollConsum()));
    if (R() < 0.45) this.chests.push({ x: x + w / 2 + (R() - .5) * 40, y: y + h / 2 + (R() - .5) * 40, r: 22, open: false, bob: R() * TAU });
  },

  prop(R, x, y, type) {
    if (type === 'tree') return { x, y, r: 26, type, hp: 100, mat: 'wood', sway: R() * TAU, s: 0.85 + R() * 0.5 };
    if (type === 'rock') return { x, y, r: 30, type, hp: 130, mat: 'brick', sway: 0, s: 0.8 + R() * 0.6 };
    return { x, y, r: 22, type: 'crate', hp: 80, mat: 'metal', sway: 0, s: 1 };
  },

  scatter(R) {
    // forests: clumped trees away from town centres
    for (let i = 0; i < 190; i++) {
      const cx = 200 + R() * (MAP - 400), cy = 200 + R() * (MAP - 400);
      const n = 3 + ((R() * 8) | 0);
      for (let j = 0; j < n; j++) {
        const x = clamp(cx + (R() - .5) * 300, 60, MAP - 60);
        const y = clamp(cy + (R() - .5) * 300, 60, MAP - 60);
        if (this.nearBuilding(x, y, 40)) continue;
        this.props.push(this.prop(R, x, y, 'tree'));
      }
    }
    for (let i = 0; i < 260; i++) {
      const x = 100 + R() * (MAP - 200), y = 100 + R() * (MAP - 200);
      if (this.nearBuilding(x, y, 40)) continue;
      this.props.push(this.prop(R, x, y, R() < 0.65 ? 'rock' : 'crate'));
    }
  },

  floorLoot(R) {
    for (let i = 0; i < 300; i++) {
      const p = this.pois[(R() * this.pois.length) | 0];
      const a = R() * TAU, d = R() * p.r * 1.15;
      const x = clamp(p.x + Math.cos(a) * d, 60, MAP - 60);
      const y = clamp(p.y + Math.sin(a) * d, 60, MAP - 60);
      const r = R();
      let it;
      if (r < 0.42) it = rollWeapon(0);
      else if (r < 0.74) it = rollConsum();
      else it = this.ammoItem();
      this.loot.push(this.item(x, y, it));
    }
    for (let i = 0; i < 120; i++) {              // sparse loot in the wilderness
      const x = 120 + R() * (MAP - 240), y = 120 + R() * (MAP - 240);
      this.loot.push(this.item(x, y, R() < 0.4 ? rollWeapon(0) : this.ammoItem()));
    }
  },

  ammoItem() {
    const t = pick(['light', 'light', 'medium', 'medium', 'shells', 'heavy', 'rocket']);
    return { kind: 'ammo', id: t, name: 'Munition', ic: AMMO[t], count: AMMO_BOX[t] };
  },

  item(x, y, data) { return { x, y, r: 18, data, bob: rnd(TAU), vy: 0 }; },

  nearBuilding(x, y, pad) {
    for (const o of this.obstacles) {
      if (o.type !== 'floor') continue;
      if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return true;
    }
    return false;
  },

  /** static grid + pre-rendered ground texture */
  bake() {
    this.sGrid.clear();
    for (const o of this.obstacles) {
      if (!o.solid) continue;
      o.x2 = o.x + o.w; o.y2 = o.y + o.h;
      o.cx = o.x + o.w / 2; o.cy = o.y + o.h / 2;
      // wide walls span several cells — register in each so lookups never miss
      for (let gy = (o.y / this.sGrid.cell) | 0; gy <= ((o.y2 / this.sGrid.cell) | 0); gy++)
        for (let gx = (o.x / this.sGrid.cell) | 0; gx <= ((o.x2 / this.sGrid.cell) | 0); gx++) {
          const k = this.sGrid.key(gx, gy);
          let b = this.sGrid.buckets.get(k); if (!b) { b = []; this.sGrid.buckets.set(k, b); }
          b.push(o);
        }
    }
    for (const p of this.props) { p.box = false; this.sGrid.add(p); }
    this.reindexLoot();
    this.bgCanvas = null;
  },

  reindexLoot() {
    this.lGrid.clear();
    for (const l of this.loot) this.lGrid.add(l);
    for (const c of this.chests) this.lGrid.add(c);
  },

  reindexStructures() {
    this.bGrid.clear();
    for (const s of this.structures) if (s.hp > 0) this.bGrid.add(s);
  },

  /* --------------------------------------------------------
     Collision — circle vs. all solids near (x,y). Returns a
     corrected position; used by players, bots and the pickaxe.
     -------------------------------------------------------- */
  _q: [],
  collide(x, y, r) {
    let nx = x, ny = y;
    const near = this.sGrid.query(x, y, r + 80, this._q);
    for (let i = 0; i < near.length; i++) {
      const o = near[i];
      if (o.w !== undefined) {                                  // box
        const cx = clamp(nx, o.x, o.x2), cy = clamp(ny, o.y, o.y2);
        let dx = nx - cx, dy = ny - cy;
        let d = Math.hypot(dx, dy);
        if (d < r) {
          if (d < 0.0001) {                                     // dead centre: push out the shallow axis
            const ox = Math.min(nx - o.x, o.x2 - nx), oy = Math.min(ny - o.y, o.y2 - ny);
            if (ox < oy) nx += (nx < o.cx ? -1 : 1) * (ox + r); else ny += (ny < o.cy ? -1 : 1) * (oy + r);
          } else { nx = cx + dx / d * r; ny = cy + dy / d * r; }
        }
      } else if (o.hp > 0 && o.type !== 'crate') {              // tree / rock circle
        const dx = nx - o.x, dy = ny - o.y;
        const d = Math.hypot(dx, dy), min = r + o.r * 0.6;
        if (d < min && d > 0.0001) { nx = o.x + dx / d * min; ny = o.y + dy / d * min; }
      }
    }
    // built pieces sit on cell EDGES and block movement once finished
    const built = this.bGrid.query(x, y, r + 110, this._q2 || (this._q2 = []));
    for (let i = 0; i < built.length; i++) {
      const s = built[i];
      if (s.hp <= 0 || s.buildT > 0) continue;
      const cx = clamp(nx, s.bx, s.bx2), cy = clamp(ny, s.by, s.by2);
      const dx = nx - cx, dy = ny - cy, d = Math.hypot(dx, dy);
      if (d < r) {
        if (d < 0.0001) {
          if (s.dir === 0) ny += (ny < s.y ? -1 : 1) * (WALL_T + r);
          else nx += (nx < s.x ? -1 : 1) * (WALL_T + r);
        } else { nx = cx + dx / d * r; ny = cy + dy / d * r; }
      }
    }
    return { x: clamp(nx, 24, MAP - 24), y: clamp(ny, 24, MAP - 24) };
  },

  /** does the segment a→b hit a wall? cheap stepped sampling, good enough for AI LOS */
  losBlocked(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.min(24, Math.ceil(d / 55));
    if (steps <= 0) return false;
    for (let i = 1; i < steps; i++) {
      const t = i / steps, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const near = this.sGrid.query(x, y, 40, this._q3 || (this._q3 = []));
      for (let j = 0; j < near.length; j++) {
        const o = near[j];
        if (o.w !== undefined) { if (x > o.x && x < o.x2 && y > o.y && y < o.y2) return true; }
        else if (o.type === 'rock' && o.hp > 0 && dist2(x, y, o.x, o.y) < o.r * o.r) return true;
      }
    }
    return false;
  },

  /** A wall lives on a cell EDGE: dir 0 = north edge of (gx,gy), dir 1 = west edge.
      That makes "box yourself in" exactly four edges around your own cell. */
  wallAt(gx, gy, dir) {
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i];
      if (s.hp > 0 && s.gx === gx && s.gy === gy && s.dir === dir) return s;
    }
    return null;
  },

  placeWall(owner, mat, gx, gy, dir) {
    if (gx < 0 || gy < 0 || gx > MAP / GRID || gy > MAP / GRID) return null;
    if (this.wallAt(gx, gy, dir)) return null;
    const info = MAT_INFO[mat];
    const s = { gx, gy, dir, type: 'wall', mat, hp: info.hp, maxHp: info.hp,
                buildT: info.build, build: info.build,
                owner: owner ? owner.id : -1 };
    if (dir === 0) {
      s.bx = gx * GRID; s.by = gy * GRID - WALL_T; s.bx2 = s.bx + GRID; s.by2 = s.by + WALL_T * 2;
    } else {
      s.bx = gx * GRID - WALL_T; s.by = gy * GRID; s.bx2 = s.bx + WALL_T * 2; s.by2 = s.by + GRID;
    }
    s.x = (s.bx + s.bx2) / 2; s.y = (s.by + s.by2) / 2;
    this.structures.push(s);
    this.bGrid.add(s);
    return s;
  },

  /** which edge of cell (gx,gy) does `ang` point at? -> [gx,gy,dir] */
  edgeFrom(gx, gy, ang) {
    const c = Math.cos(ang), sn = Math.sin(ang);
    if (Math.abs(c) > Math.abs(sn)) return c > 0 ? [gx + 1, gy, 1] : [gx, gy, 1];
    return sn > 0 ? [gx, gy + 1, 0] : [gx, gy, 0];
  },

  cellOf(x, y) { return [Math.floor(x / GRID), Math.floor(y / GRID)]; },

  /** all four edges of a cell, for boxing up */
  cellEdges(gx, gy) { return [[gx, gy, 0], [gx, gy + 1, 0], [gx, gy, 1], [gx + 1, gy, 1]]; },

  damageStructure(s, dmg) {
    s.hp -= dmg;
    if (s.hp <= 0) { s.hp = 0; this.dirtyStructures = true; }
  },

  cleanup() {
    if (!this.dirtyStructures) return;
    this.dirtyStructures = false;
    this.structures = this.structures.filter(s => s.hp > 0);
    this.reindexStructures();
  }
};
