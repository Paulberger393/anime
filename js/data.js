'use strict';
/* ============================================================
   SCHOTTER ROYALE — data: weapons, rarity, loot, storm, names
   ============================================================ */

/* Rarity drives colour, damage and handling. Legendary is ~25% harder
   hitting than common but stays inside one-clip-to-kill territory so
   fights are still winnable with a grey pistol. */
const RARITY = [
  { id: 0, name: 'Gewöhnlich', col: '#9aa5b4', dmg: 1.00, rel: 1.00, spread: 1.00 },
  { id: 1, name: 'Ungewöhnlich', col: '#5fd45f', dmg: 1.06, rel: 0.96, spread: 0.94 },
  { id: 2, name: 'Selten', col: '#4aa3ff', dmg: 1.12, rel: 0.92, spread: 0.88 },
  { id: 3, name: 'Episch', col: '#b45cff', dmg: 1.19, rel: 0.88, spread: 0.82 },
  { id: 4, name: 'Legendär', col: '#ffb03a', dmg: 1.27, rel: 0.84, spread: 0.75 }
];

const AMMO = { light: '🔸', medium: '🔹', shells: '🔺', heavy: '🔻', rocket: '🚀' };

/* rpm = rounds/min, spread in degrees, range in world px */
const WEAPONS = {
  pistol:  { name: 'Pistole',       ic: '🔫', snd: 'pistol',  dmg: 26, rpm: 380, mag: 16, reload: 1.35, spread: 2.6, range: 720,  pellets: 1, speed: 1500, ammo: 'light',  auto: false, botPref: 1 },
  smg:     { name: 'MP',            ic: '💥', snd: 'smg',     dmg: 17, rpm: 800, mag: 30, reload: 2.05, spread: 5.2, range: 560,  pellets: 1, speed: 1400, ammo: 'light',  auto: true,  botPref: 2 },
  ar:      { name: 'Sturmgewehr',   ic: '🎯', snd: 'ar',      dmg: 33, rpm: 480, mag: 30, reload: 2.30, spread: 3.2, range: 980,  pellets: 1, speed: 1750, ammo: 'medium', auto: true,  botPref: 4 },
  tac:     { name: 'Taktik-MP',     ic: '⚡', snd: 'smg',     dmg: 22, rpm: 640, mag: 25, reload: 1.90, spread: 4.0, range: 700,  pellets: 1, speed: 1550, ammo: 'medium', auto: true,  botPref: 3 },
  shotgun: { name: 'Schrotflinte',  ic: '🧨', snd: 'shotgun', dmg: 11, rpm: 78,  mag: 5,  reload: 2.60, spread: 9.5, range: 340,  pellets: 8, speed: 1200, ammo: 'shells', auto: false, botPref: 3 },
  sniper:  { name: 'Scharfschütze', ic: '🔭', snd: 'sniper',  dmg: 108,rpm: 42,  mag: 1,  reload: 2.75, spread: 0.5, range: 1900, pellets: 1, speed: 3000, ammo: 'heavy',  auto: false, botPref: 3 },
  rpg:     { name: 'Raketenwerfer', ic: '🚀', snd: 'rpg',     dmg: 96, rpm: 34,  mag: 1,  reload: 3.20, spread: 1.4, range: 1300, pellets: 1, speed: 620,  ammo: 'rocket', auto: false, botPref: 3, rocket: true, aoe: 120 }
};

/* Which rarities each gun can roll in — snipers/rockets never come as grey junk. */
const WEAPON_POOL = [
  { id: 'pistol',  w: 16, rar: [0, 1, 2, 3] },
  { id: 'smg',     w: 15, rar: [0, 1, 2, 3] },
  { id: 'ar',      w: 17, rar: [0, 1, 2, 3, 4] },
  { id: 'tac',     w: 12, rar: [1, 2, 3] },
  { id: 'shotgun', w: 15, rar: [0, 1, 2, 3, 4] },
  { id: 'sniper',  w: 7,  rar: [2, 3, 4] },
  { id: 'rpg',     w: 3,  rar: [3, 4] }
];

const CONSUM = {
  bandage: { name: 'Verband',     ic: '🩹', kind: 'hp', amount: 15,  cap: 75,  time: 1.6, stack: 15, w: 20 },
  medkit:  { name: 'Medikit',     ic: '💉', kind: 'hp', amount: 100, cap: 100, time: 3.6, stack: 3,  w: 8 },
  mini:    { name: 'Mini-Schild', ic: '🧪', kind: 'sh', amount: 25,  cap: 50,  time: 1.9, stack: 6,  w: 20 },
  big:     { name: 'Schildtrank', ic: '🍶', kind: 'sh', amount: 50,  cap: 100, time: 3.4, stack: 3,  w: 9 },
  chug:    { name: 'Wundertrank', ic: '🥤', kind: 'both', amount: 100, cap: 100, time: 5.0, stack: 2, w: 3 }
};

const AMMO_BOX = { light: 24, medium: 22, shells: 8, heavy: 6, rocket: 3 };

const MATS = ['wood', 'brick', 'metal'];
const MAT_INFO = {
  wood:  { name: 'Holz',   col: '#b4813f', dark: '#7d5626', hp: 140, build: 0.42, max: 160, ic: '🪵' },
  brick: { name: 'Stein',  col: '#c07a6a', dark: '#8a5245', hp: 210, build: 0.62, max: 160, ic: '🧱' },
  metal: { name: 'Metall', col: '#9fb0c4', dark: '#6c7d92', hp: 290, build: 0.85, max: 160, ic: '⚙️' }
};
const GRID = 96;                   // build grid size in world px
const WALL_T = 13;                 // half-thickness of a built wall
/* Top-down needs shapes, not staircases: one edge, an L, or a full box. */
const BUILD_KINDS = {
  wall:   { name: 'Wand', cost: 10, ic: '🟫' },
  corner: { name: 'Ecke', cost: 20, ic: '📐' },
  box:    { name: 'Box',  cost: 40, ic: '▣' }
};

/* Storm: 9 phases, each waits then closes. `dps` ramps hard at the end so
   late-game camping in the purple is never viable. Times are scaled by the
   match-pace setting (Schnell = ~0.55x). */
const STORM_PHASES = [
  { wait: 42, move: 36, shrink: 0.58, dps: 1 },
  { wait: 30, move: 30, shrink: 0.60, dps: 2 },
  { wait: 22, move: 22, shrink: 0.60, dps: 4 },
  { wait: 18, move: 20, shrink: 0.58, dps: 6 },
  { wait: 15, move: 17, shrink: 0.56, dps: 8 },
  { wait: 13, move: 14, shrink: 0.55, dps: 10 },
  { wait: 11, move: 12, shrink: 0.52, dps: 12 },
  { wait: 9,  move: 10, shrink: 0.45, dps: 15 },
  { wait: 7,  move: 20, shrink: 0.02, dps: 20 }
];

const DIFF = {
  easy:   { name: 'Leicht', acc: 0.42, react: 0.55, dmg: 0.65, aggro: 0.75, view: 620,  heal: 0.5, build: 0.25 },
  normal: { name: 'Normal', acc: 0.60, react: 0.34, dmg: 0.85, aggro: 1.00, view: 720,  heal: 0.8, build: 0.55 },
  hard:   { name: 'Schwer', acc: 0.75, react: 0.20, dmg: 1.00, aggro: 1.20, view: 940,  heal: 1.0, build: 0.85 },
  pro:    { name: 'Profi',  acc: 0.87, react: 0.12, dmg: 1.12, aggro: 1.40, view: 1120, heal: 1.0, build: 1.00 }
};
const DIFF_ORDER = ['easy', 'normal', 'hard', 'pro'];

const POI_NAMES = [
  'Kieskuppe', 'Schotterbucht', 'Ödturm', 'Rostwerk', 'Nebeltal', 'Kranfeld',
  'Salzsee', 'Betonstadt', 'Funkhügel', 'Alte Mühle', 'Containerhof', 'Silobucht',
  'Dünenkamp', 'Bunkerpark', 'Fährhafen', 'Steinbruch'
];

const BOT_NAMES = [
  'Kevin', 'Sniper_Opa', 'Nudelholz', 'BrotDoseXX', 'Tarnkappe', 'HerrKlaus', 'Blitzmerker',
  'Schnitzel', 'Waldemar', 'Turbo_Tanne', 'Pixelklaus', 'DerBaumeister', 'Krümel', 'Nachtfalke',
  'Rasenmäher', 'Zockerheinz', 'Frosti', 'Bratwurst', 'Käpt_n_Kies', 'Silberfuchs', 'Donnerkeil',
  'MiniMax', 'Grünschnabel', 'Betonmischer', 'Wolkenbruch', 'Feuerstuhl', 'Knallfrosch', 'Schattenwolf',
  'Klopapier99', 'Gurkenglas', 'Eisbaer', 'Rotkohl', 'Sandsack', 'Blechbüchse', 'Sturmhaube',
  'Zahnfee', 'Panzerknacker', 'Wackelpudding', 'Ofenrohr', 'Nebelkrähe', 'Kupferkopf', 'Milchbube',
  'Dosenravioli', 'Regenwurm', 'Stahlmaus', 'Fliegenpilz', 'Butterkeks', 'Rasselbande', 'Hackfleisch',
  'Zwiebelring', 'Salzstange', 'Kaugummi', 'Wattebausch', 'Tannenzapfen', 'Trüffelnase', 'Ziegelstein',
  'Kaffeefilter', 'Schraubstock', 'Windbeutel', 'Kartoffelsalat', 'Handbremse', 'Nachtschicht',
  'Sonnenbrand', 'Krawallschachtel', 'Tiefkuehlpizza', 'Rostlaube', 'Gummibaum', 'Feldhamster',
  'Blaulicht', 'Schneepflug', 'Kirschkern', 'Bohnenstange', 'Poltergeist', 'Zuckerwatte',
  'Hammerwerfer', 'Fensterkitt', 'Grillmeister', 'Ohrwurm', 'Sperrmuell', 'Wackelzahn',
  'Dachlatte', 'Sitzriese', 'Notausgang', 'Kabelbinder', 'Fussmatte', 'Heizdecke', 'Waschbaer',
  'Sonntagsfahrer', 'Radieschen', 'Pfannkuchen', 'Luftpumpe', 'Torwart', 'Schlagbohrer',
  'Mondlicht', 'Klobuerste', 'Wetterhahn', 'Gluehbirne', 'Zaunkoenig', 'Tischkante', 'Schnappatmung',
  'Bierdeckel', 'Turnbeutel', 'Kaltduscher', 'Muellsack', 'Zimtstern', 'Fahrradkette', 'Suppenkasper',
  'Baggersee', 'Kupferstich', 'Nussknacker', 'Ellenbogen', 'Schuhkarton', 'Wintermantel', 'Kranfuehrer',
  'Zahnstocher', 'Rasenkante', 'Blitzableiter', 'Schneckenpost', 'Rollsplitt', 'Warnweste'
];

/** weighted pick from [{w:n,...}] */
function wpick(list) {
  let total = 0;
  for (const e of list) total += e.w;
  let r = Math.random() * total;
  for (const e of list) { r -= e.w; if (r <= 0) return e; }
  return list[list.length - 1];
}

/** Roll one gun. `lucky` biases rarity upward (chests > floor loot). */
function rollWeapon(lucky = 0) {
  const e = wpick(WEAPON_POOL);
  const pool = e.rar;
  let idx = 0;
  // walk up the rarity ladder; each step is a coin flip weighted by luck
  for (let i = 1; i < pool.length; i++) {
    if (chance(0.30 + lucky * 0.22)) idx = i; else break;
  }
  return makeGun(e.id, pool[idx]);
}

function makeGun(id, rar) {
  const W = WEAPONS[id], R = RARITY[rar];
  return {
    kind: 'gun', id, rar,
    name: W.name, ic: W.ic,
    dmg: W.dmg * R.dmg,
    rpm: W.rpm, mag: W.mag, inMag: W.mag,
    reload: W.reload * R.rel,
    spread: W.spread * R.spread,
    range: W.range, pellets: W.pellets, speed: W.speed,
    ammo: W.ammo, auto: W.auto, snd: W.snd,
    rocket: !!W.rocket, aoe: W.aoe || 0,
    cd: 0, reloading: 0
  };
}

function rollConsum() {
  const keys = Object.keys(CONSUM);
  const e = wpick(keys.map(k => ({ w: CONSUM[k].w, k })));
  const c = CONSUM[e.k];
  return { kind: 'con', id: e.k, name: c.name, ic: c.ic, count: Math.max(1, Math.ceil(c.stack / 3)) };
}
