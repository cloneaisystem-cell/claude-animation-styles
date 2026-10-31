// /case-board — "cork, pins, red string": a detective's cork board solves "who ate the last slice?".
// Card: EXHIBIT A (an empty pizza box) is already pinned; four suspect polaroids slam on with push pins, red string
// snaps from the box to each suspect. Hard cut: closer + shallow focus, the last string pulls taut to the dog,
// a red marker circles its face, writes GUILTY, and we push in on the tomato sauce on its nose.
// Pure function of u. World units: the card view shows ~1000 × 1780 of the board.
import React from "react";
import { loadFont as loadMarker } from "@remotion/google-fonts/PermanentMarker";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadElite } from "@remotion/google-fonts/SpecialElite";
import type { StyleProps } from "../types";
import { clamp, easeIn, easeInOut, easeOut, hash, lerp } from "../theme";

const MARKER = loadMarker("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const HAND = loadCaveat("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily;
const TYPE = loadElite("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;

const U_CUT = 0.833;
const STRING = "#B0231A";
const INK = "#C3291C";
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- cork texture (cached, seamless)
const TILE = 1024;
const CORK_U = 430; // world units per texture tile
let corkURL: string | null = null;
const corkTexture = () => {
  if (corkURL) return corkURL;
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  const x = c.getContext("2d")!;
  x.fillStyle = "#A87747";
  x.fillRect(0, 0, TILE, TILE);
  const wraps = (px: number, py: number, r: number, f: (ox: number, oy: number) => void) => {
    const xs = [0], ys = [0];
    if (px < r + 2) xs.push(TILE); if (px > TILE - r - 2) xs.push(-TILE);
    if (py < r + 2) ys.push(TILE); if (py > TILE - r - 2) ys.push(-TILE);
    for (const ox of xs) for (const oy of ys) f(ox, oy);
  };
  // low-frequency blotches (hide the repeat)
  for (let i = 0; i < 60; i++) {
    const px = hash(i * 7.13 + 1) * TILE, py = hash(i * 3.71 + 2) * TILE, r = 80 + 180 * hash(i * 1.9 + 3);
    const light = hash(i * 9.1 + 4) > 0.5;
    wraps(px, py, r, (ox, oy) => {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, light ? "rgba(214,168,112,0.28)" : "rgba(104,64,32,0.26)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g;
      x.fillRect(px + ox - r, py + oy - r, 2 * r, 2 * r);
    });
  }
  // granules: a dark under-edge (lamp from the upper left) + the granule
  for (let i = 0; i < 26000; i++) {
    const px = hash(i * 1.317 + 0.11) * TILE, py = hash(i * 2.791 + 5.3) * TILE;
    const h3 = hash(i * 0.573 + 9.7), t = hash(i * 4.219 + 2.2), h5 = hash(i * 6.17 + 8.8);
    const r = 1.6 + 6.2 * h3 * h3;
    const R = lerp(112, 226, t), G = lerp(70, 172, t), B = lerp(36, 110, t);
    wraps(px, py, r + 2, (ox, oy) => {
      x.fillStyle = "rgba(58,34,16,0.32)";
      x.beginPath(); x.ellipse(px + ox + 0.9, py + oy + 1.2, r, r * (0.55 + 0.5 * h5), h5 * Math.PI, 0, TAU); x.fill();
      x.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},0.86)`;
      x.beginPath(); x.ellipse(px + ox, py + oy, r, r * (0.55 + 0.5 * h5), h5 * Math.PI, 0, TAU); x.fill();
    });
  }
  // pits + bright flecks
  for (let i = 0; i < 3200; i++) {
    const px = hash(i * 8.11 + 3.3) * TILE, py = hash(i * 5.07 + 1.1) * TILE, r = 0.6 + 1.6 * hash(i * 2.2 + 7);
    x.fillStyle = hash(i * 3.3 + 0.7) > 0.35 ? "rgba(52,30,14,0.75)" : "rgba(246,214,160,0.7)";
    x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
  }
  corkURL = c.toDataURL("image/jpeg", 0.92);
  return corkURL;
};

// ---------------------------------------------------------------- world layout
type PinC = "red" | "cream" | "brass";
type Pin = { x: number; y: number; c: PinC };
type Kind = "pol" | "card" | "sticky" | "header";
type Item = { id: string; kind: Kind; x: number; y: number; w: number; h: number; rot: number; land: number; pins: Pin[] };
const SW = 312;
const pol = (id: string, x: number, y: number, w: number, rot: number, land: number, extra: Pin[] = [], c: PinC = "red"): Item =>
  ({ id, kind: "pol", x, y, w, h: w * 1.2, rot, land, pins: [{ x: 0, y: -w * 0.6 + 15, c }, ...extra] });
const PZ = 372;
const cornerPin = (w: number, sx: number, sy: number, c: PinC = "cream"): Pin => ({ x: sx * (w / 2 - 16), y: sy * (w * 0.6 - 16), c });

const ITEMS: Item[] = [
  { id: "header", kind: "header", x: 500, y: 106, w: 730, h: 122, rot: -1.5, land: -1, pins: [{ x: -335, y: -34, c: "brass" }, { x: 335, y: -34, c: "brass" }] },
  { id: "cardA", kind: "card", x: 870, y: 800, w: 262, h: 160, rot: 5, land: -1, pins: [{ x: 0, y: -62, c: "cream" }] },
  { id: "verdict", kind: "card", x: 784, y: 1684, w: 340, h: 156, rot: 2.5, land: -1, pins: [{ x: -146, y: -56, c: "brass" }] },
  { id: "cardB", kind: "card", x: 146, y: 915, w: 262, h: 160, rot: -4, land: 0.22, pins: [{ x: 0, y: -62, c: "cream" }] },
  { id: "cardC", kind: "card", x: 236, y: 1702, w: 290, h: 150, rot: -3, land: 0.45, pins: [{ x: 108, y: -60, c: "red" }] },
  pol("pizza", 505, 900, PZ, -2, -1, [cornerPin(PZ, -1, 1), cornerPin(PZ, 1, 1)]),
  pol("roommate", 226, 418, SW, -5, 0.16, [cornerPin(SW, 1, 1)]),
  pol("cat", 786, 446, SW, 4.5, 0.28, [cornerPin(SW, -1, 1)]),
  pol("neighbour", 228, 1386, SW, 4, 0.39),
  pol("dog", 770, 1410, SW, -3, 0.51),
  { id: "alibi", kind: "sticky", x: 515, y: 1264, w: 150, h: 150, rot: -6, land: 0.6, pins: [{ x: 0, y: -56, c: "red" }] },
  { id: "motive", kind: "sticky", x: 918, y: 270, w: 136, h: 136, rot: 8, land: 0.7, pins: [] },
];
const BY: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

type Str = { a: [string, number]; b: [string, number]; t0: number; d: number; hero?: boolean };
const STRINGS: Str[] = [
  { a: ["cardB", 0], b: ["roommate", 1], t0: 0.25, d: 0.09 },
  { a: ["pizza", 0], b: ["roommate", 1], t0: 0.31, d: 0.1 },
  { a: ["pizza", 0], b: ["cat", 1], t0: 0.41, d: 0.1 },
  { a: ["pizza", 1], b: ["neighbour", 0], t0: 0.51, d: 0.1 },
  { a: ["alibi", 0], b: ["dog", 0], t0: 0.63, d: 0.08 },
  { a: ["pizza", 2], b: ["dog", 0], t0: 0.68, d: 0.12, hero: true },
];

// ---------------------------------------------------------------- motion helpers
type St = { s: number; dx: number; dy: number; dr: number; op: number; lift: number; pin: number };
const REST: St = { s: 1, dx: 0, dy: 0, dr: 0, op: 1, lift: 0, pin: 1 };
const DROP = 0.1;
/** pin "thunk": drops from slightly above (bigger, soft far shadow), lands, tiny squash + rotation settle, pin pushed in */
const slam = (u: number, land: number): St | null => {
  if (land < 0) return REST;
  if (u < land - DROP) return null;
  if (u < land) {
    const p = (u - (land - DROP)) / DROP, e = easeIn(p);
    return { s: lerp(1.12, 1, e), dx: lerp(-14, 0, e), dy: lerp(-46, 0, e), dr: lerp(6, 0, e), op: clamp(p / 0.12), lift: 1 - e, pin: 0 };
  }
  const a = u - land;
  return {
    s: 1 - 0.022 * Math.sin(Math.PI * clamp(a / 0.07)),
    dx: 0, dy: 0,
    dr: 2.4 * Math.exp(-a / 0.07) * Math.cos(a * TAU * 6),
    op: 1, lift: 0, pin: clamp(a / 0.05),
  };
};
/** the hero string's pull also yanks the dog photo a little toward the box */
const PULL0 = 0.85, PULL1 = 0.965;
const dogYank = (u: number) => {
  if (u < PULL1) return 0;
  const b = u - PULL1;
  return Math.exp(-b / 0.09) * Math.sin(Math.PI * clamp(b / 0.05) * 0.5 + b * TAU * 5);
};
const itemState = (it: Item, u: number): St | null => {
  const st = slam(u, it.land);
  if (!st || it.id !== "dog") return st;
  const y = dogYank(u);
  return { ...st, dr: st.dr + 2.2 * y, dx: st.dx - 5 * y, dy: st.dy - 6 * y };
};
const rotV = (x: number, y: number, deg: number) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
};
const pinWorld = (it: Item, k: number, st: St) => {
  const p = it.pins[k];
  const v = rotV(p.x * st.s, p.y * st.s, it.rot + st.dr);
  return { x: it.x + st.dx + v.x, y: it.y + st.dy + v.y };
};
/** a point in the item's local frame (relative to its centre) → world */
const localWorld = (it: Item, st: St, lx: number, ly: number) => {
  const v = rotV(lx * st.s, ly * st.s, it.rot + st.dr);
  return { x: it.x + st.dx + v.x, y: it.y + st.dy + v.y };
};

/** sag of a string (fraction of its length) */
const stringShape = (s: Str, u: number) => {
  const a = u - s.t0;
  if (a < 0) return null;
  const p = clamp(a / s.d), e = easeOut(p);
  let sag: number, wob = 0.07 * Math.sin(p * Math.PI * 2) * (1 - p);
  if (p < 1) sag = 0.14 * e;
  else if (!s.hero) { const b = a - s.d; sag = 0.03 + 0.11 * Math.exp(-b / 0.05) * Math.cos(b * TAU * 10); }
  else {
    // hero: arrives slack, swings, then (after the cut) is yanked taut with a twang
    const slack = 0.17 + 0.018 * Math.sin((u - s.t0 - s.d) * TAU * 1.4);
    if (u < PULL0) sag = lerp(0.14, slack, easeOut(clamp((a - s.d) / 0.08)));
    else if (u < PULL1) sag = lerp(0.17, -0.04, easeIn(clamp((u - PULL0) / (PULL1 - PULL0))));
    else { const b = u - PULL1; sag = 0.018 - 0.058 * Math.exp(-b / 0.075) * Math.cos(b * TAU * 12.5); }
  }
  return { e, sag, wob };
};

// ---------------------------------------------------------------- camera
type Cam = { cx: number; cy: number; z: number; rx: number; ry: number; rz: number };
const camAt = (u: number, full: boolean, tile: boolean): Cam => {
  if (!full) {
    const p = easeInOut(clamp(u / U_CUT));
    return { cx: 503 + 6 * p, cy: 902 + 14 * p, z: 0.9 + 0.05 * p, rx: 8 - 2 * p, ry: -4.5 + 2 * p, rz: -0.7 + 0.6 * p };
  }
  const a = Math.max(0, u - U_CUT);
  const push1 = easeInOut(clamp((u - 0.86) / 0.95)); // onto the dog
  const push2 = easeInOut(clamp((u - 1.8) / 0.38)); // the sauce reveal
  const drift = a * 0.035;
  if (tile) {
    return { cx: 776 + 4 * push2, cy: 1506 - 12 * push2, z: 2.0 + 0.08 * push1 + 0.1 * push2 + drift, rx: 6, ry: 7 - 2 * push1, rz: 1 - 0.6 * push1 };
  }
  // full screen: everything that matters ends inside the IG safe area (y 260–1450, x 60–900 at 1080×1920),
  // so the camera settles on the dog + verdict card by u 1.48, then a small sauce push + drift to the end
  const q1 = easeInOut(clamp((u - 0.86) / 0.62));
  const q2 = easeInOut(clamp((u - 1.78) / 0.42));
  return {
    cx: lerp(668, 808, q1),
    cy: lerp(1300, 1574, q1) - 6 * q2,
    z: lerp(1.78, 1.97, q1) + 0.07 * q2 + a * 0.028,
    rx: lerp(12, 5, q1), ry: lerp(13, 7, q1) - 2 * q2, rz: lerp(2.4, 1.2, q1),
  };
};
const SHAKES_CARD = ITEMS.filter((i) => i.land > 0).map((i) => [i.land, i.kind === "pol" ? 1 : 0.5] as [number, number]);
const SHAKES_FULL: [number, number][] = [[PULL1, 0.9], [1.45, 1.5], [1.75, 0.8], [1.9, 0.7]];
const shakeAt = (u: number, full: boolean) => {
  let x = 0, y = 0;
  for (const [t, a] of full ? SHAKES_FULL : SHAKES_CARD) {
    if (u < t) continue;
    const b = u - t, k = a * Math.exp(-b / 0.05);
    x += k * Math.sin(b * TAU * 17 + t * 9);
    y += k * Math.sin(b * TAU * 21 + t * 5 + 1);
  }
  return { x, y };
};

// ---------------------------------------------------------------- marker (circle + GUILTY) geometry
const CIRCLE = (() => {
  const pts: { x: number; y: number }[] = [];
  const N = 140, turns = 1.13, th0 = -0.75;
  for (let i = 0; i <= N; i++) {
    const t = i / N, th = th0 + t * turns * TAU;
    const r = 1 + 0.045 * Math.sin(3 * th + 1) + 0.03 * Math.sin(5 * th + 2) - 0.08 * t;
    pts.push({ x: 112 * r * Math.cos(th) + 6 * t, y: 99 * r * Math.sin(th) - 4 * t });
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, len, d: "M" + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L") };
})();
const circleAt = (p: number) => {
  const f = clamp(p) * (CIRCLE.pts.length - 1), i = Math.min(CIRCLE.pts.length - 2, Math.floor(f)), k = f - i;
  const A = CIRCLE.pts[i], B = CIRCLE.pts[i + 1];
  return { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k) };
};
const C0 = 1.1, C1 = 1.45, G0 = 1.47, G1 = 1.73, L0 = 1.745, L1 = 1.83;
const GW = 300; // GUILTY text length (verdict card local units)

// ---------------------------------------------------------------- suspects (flat vector, viewBox 0 0 100 100)
const Roommate: React.FC = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <radialGradient id="cb-rm-bg" cx="0.28" cy="0.2" r="1"><stop offset="0" stopColor="#D2A266" /><stop offset="1" stopColor="#6A472C" /></radialGradient>
    </defs>
    <rect width="100" height="100" fill="url(#cb-rm-bg)" />
    <rect x="64" y="5" width="30" height="42" rx="1" fill="#F6DDA8" opacity="0.38" />
    <path d="M79 5 V47 M64 26 H94" stroke="#7A5434" strokeWidth="1.6" opacity="0.5" />
    <path d="M27 72 Q25 36 50 30 Q75 36 73 72 Z" fill="#4B5530" />
    <path d="M6 100 Q8 76 30 70 L70 70 Q92 76 94 100 Z" fill="#5F6C3B" />
    <path d="M30 100 Q31 86 28 78" stroke="#4E5A30" strokeWidth="1.2" fill="none" />
    <path d="M70 100 Q69 86 72 78" stroke="#4E5A30" strokeWidth="1.2" fill="none" />
    <path d="M42 59 L58 59 L57 70 Q50 74 43 70 Z" fill="#C68C66" />
    <path d="M32 71 Q50 84 68 71 Q63 66 50 67 Q37 66 32 71 Z" fill="#46502C" />
    <path d="M44 75 Q43 85 42 91" stroke="#EFE5CF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M56 75 Q57 84 58.5 89" stroke="#EFE5CF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <ellipse cx="50" cy="46.5" rx="14.5" ry="16.5" fill="#E3B28B" />
    <path d="M56 33 Q65 40 63 56 Q60 62 54 62.5 Q62 52 56 33 Z" fill="#C99470" opacity="0.55" />
    <path d="M34.5 45 Q32 27 47 26 Q61 23 66.5 37 Q67 43 64.5 46 Q61 36 53 37.5 Q50 33 45 36 Q40 37 37.5 45 Z" fill="#3A2A1E" />
    <path d="M44 27 Q47 21 52 25 Q56 20 59 26" fill="#3A2A1E" />
    <path d="M32.5 49 Q30 21 50 20.5 Q70 21 67.5 49" stroke="#1E1C1B" strokeWidth="3.6" fill="none" />
    <rect x="28.8" y="40.5" width="8.6" height="15.5" rx="3.8" fill="#272422" />
    <rect x="62.6" y="40.5" width="8.6" height="15.5" rx="3.8" fill="#272422" />
    <rect x="30.2" y="42.5" width="1.6" height="10" rx="0.8" fill="#6B6560" />
    <rect x="64" y="42.5" width="1.6" height="10" rx="0.8" fill="#6B6560" />
    <path d="M40.5 41.8 Q44 40 47.2 41.6" stroke="#3A2A1E" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <path d="M52.8 41.6 Q56 40 59.5 41.8" stroke="#3A2A1E" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    <ellipse cx="44" cy="47.6" rx="2.1" ry="1.3" fill="#2A1C14" />
    <ellipse cx="56" cy="47.6" rx="2.1" ry="1.3" fill="#2A1C14" />
    <path d="M41 46.6 Q44 45.4 47 46.6" stroke="#B98460" strokeWidth="1.5" fill="none" />
    <path d="M53 46.6 Q56 45.4 59 46.6" stroke="#B98460" strokeWidth="1.5" fill="none" />
    <path d="M50 49 Q48.4 53.5 50.6 54.6" stroke="#B57E5B" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    <path d="M45.5 58.2 Q50 60.6 54.6 57.6" stroke="#8E4C3B" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </svg>
);

const Cat: React.FC = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <radialGradient id="cb-cat-bg" cx="0.3" cy="0.25" r="1"><stop offset="0" stopColor="#B26A50" /><stop offset="1" stopColor="#5E2F23" /></radialGradient>
    </defs>
    <rect width="100" height="100" fill="url(#cb-cat-bg)" />
    <path d="M0 64 Q50 58 100 64 V100 H0 Z" fill="#8A4A37" />
    <path d="M0 64 Q50 58 100 64" stroke="#5A2C20" strokeWidth="1.2" fill="none" />
    <path d="M16 100 Q14 70 50 66 Q86 70 84 100 Z" fill="#8F8882" />
    <ellipse cx="50" cy="90" rx="17" ry="14" fill="#D3CCC2" />
    <path d="M27.5 53 Q26 35 37 31 L32 13 L47 26.5 Q50 26 53 26.5 L68 13 L63 31 Q74 35 72.5 53 Q72 69 50 70 Q28 69 27.5 53 Z" fill="#8F8882" />
    <path d="M34.5 17.5 L44.5 27.5 L37.5 29.5 Z" fill="#D9A497" />
    <path d="M65.5 17.5 L55.5 27.5 L62.5 29.5 Z" fill="#D9A497" />
    <path d="M45 28.5 Q46 34 44.5 38 M50 27.5 V37 M55 28.5 Q54 34 55.5 38" stroke="#655E58" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <path d="M28 50 Q31 52 28.5 55 M72 50 Q69 52 71.5 55" stroke="#655E58" strokeWidth="1.3" fill="none" />
    <path d="M27.5 57 L23 60 L28.5 61 M72.5 57 L77 60 L71.5 61" fill="#8F8882" />
    <ellipse cx="50" cy="58.5" rx="9" ry="6.2" fill="#D6CFC5" />
    <path d="M36.5 47 Q42 43.4 47.5 47 Q42 50.2 36.5 47 Z" fill="#CDB43C" />
    <path d="M52.5 47 Q58 43.4 63.5 47 Q58 50.2 52.5 47 Z" fill="#CDB43C" />
    <ellipse cx="42.3" cy="47.4" rx="0.9" ry="1.8" fill="#1C1815" />
    <ellipse cx="57.7" cy="47.4" rx="0.9" ry="1.8" fill="#1C1815" />
    <path d="M35.8 47.2 Q42 42.2 48.2 47.2 L48.2 43.5 Q42 39.5 35.8 43.5 Z" fill="#8F8882" />
    <path d="M51.8 47.2 Q58 42.2 64.2 47.2 L64.2 43.5 Q58 39.5 51.8 43.5 Z" fill="#8F8882" />
    <path d="M36 47.1 Q42 44.7 48 47.1 M52 47.1 Q58 44.7 64 47.1" stroke="#3A3430" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    <path d="M47.8 54.4 L52.2 54.4 L50 56.8 Z" fill="#C9837A" />
    <path d="M50 56.8 Q48.5 59.4 45.6 58.4 M50 56.8 Q53 60.2 57 57" stroke="#3A3430" strokeWidth="1" fill="none" strokeLinecap="round" />
    <path d="M44 57.5 L27 55 M44 59 L27.5 60.5 M56 57.5 L73 54.5 M56 59 L72.5 60.5" stroke="#F1ECE3" strokeWidth="0.5" opacity="0.85" />
  </svg>
);

const Neighbour: React.FC = () => {
  const flowers: React.ReactNode[] = [];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
    const x = i * 16 + (j % 2) * 8 - 2, y = j * 15 + 4;
    flowers.push(<g key={`${i}-${j}`}><circle cx={x} cy={y} r="1.9" fill="#B97E62" /><ellipse cx={x + 3} cy={y + 2} rx="1.6" ry="0.8" fill="#8E9361" /></g>);
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <radialGradient id="cb-nb-bg" cx="0.3" cy="0.25" r="1"><stop offset="0" stopColor="#E7C9AC" /><stop offset="1" stopColor="#A88264" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cb-nb-bg)" />
      <g opacity="0.75">{flowers}</g>
      <path d="M12 100 Q14 76 50 72 Q86 76 88 100 Z" fill="#7C8856" />
      <path d="M39 73 L50 85 L61 73 Q50 77.5 39 73 Z" fill="#F2E9D8" />
      <path d="M50 85 V100" stroke="#5F6A40" strokeWidth="1" />
      <circle cx="47" cy="90" r="1" fill="#E7DCC2" /><circle cx="47" cy="96" r="1" fill="#E7DCC2" />
      <path d="M44 62 L56 62 L55.5 73 Q50 76 44.5 73 Z" fill="#DDB596" />
      <ellipse cx="50" cy="38" rx="21" ry="16.5" fill="#D9D3CA" />
      <circle cx="33" cy="44" r="6" fill="#D9D3CA" /><circle cx="67" cy="44" r="6" fill="#D9D3CA" />
      <path d="M35 38 q3 -3 6 0 M44 31 q3 -3 6 0 M55 33 q3 -3 6 0 M60 41 q3 -3 6 0" stroke="#BDB6AC" strokeWidth="0.9" fill="none" />
      <ellipse cx="50" cy="50" rx="14" ry="15.5" fill="#EAC5A5" />
      {[[34, 31, -40, "#E8A0A6"], [42.5, 24.5, -15, "#E8C65A"], [52, 23, 8, "#E8A0A6"], [61, 26.5, 28, "#E8C65A"], [67, 34, 55, "#E8A0A6"]].map(([x, y, r, c], k) => (
        <g key={k} transform={`translate(${x} ${y}) rotate(${r})`}>
          <rect x="-4.6" y="-2.6" width="9.2" height="5.2" rx="2.4" fill={c as string} />
          <path d="M-2 -2.6 V2.6 M1 -2.6 V2.6" stroke="#00000033" strokeWidth="0.6" />
        </g>
      ))}
      <ellipse cx="42" cy="56.5" rx="3.2" ry="2" fill="#E2928A" opacity="0.45" />
      <ellipse cx="58" cy="56.5" rx="3.2" ry="2" fill="#E2928A" opacity="0.45" />
      <path d="M39.5 42 Q43.5 39.5 47.5 41.5 M52.5 41.5 Q56.5 39.5 60.5 42" stroke="#9A8D80" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <circle cx="43.6" cy="49.5" r="1.4" fill="#2C211A" /><circle cx="56.4" cy="49.5" r="1.4" fill="#2C211A" />
      <circle cx="43.6" cy="49.2" r="5" fill="#FFFFFF" fillOpacity="0.14" stroke="#4A2E1F" strokeWidth="1.2" />
      <circle cx="56.4" cy="49.2" r="5" fill="#FFFFFF" fillOpacity="0.14" stroke="#4A2E1F" strokeWidth="1.2" />
      <path d="M48.6 48.6 Q50 47.6 51.4 48.6" stroke="#4A2E1F" strokeWidth="1" fill="none" />
      <path d="M40.8 47 Q42 45.6 43.8 45.4" stroke="#fff" strokeWidth="0.8" opacity="0.7" fill="none" />
      <path d="M53.6 47 Q54.8 45.6 56.6 45.4" stroke="#fff" strokeWidth="0.8" opacity="0.7" fill="none" />
      <path d="M50 51.5 Q49 55 50.8 55.6" stroke="#C99576" strokeWidth="1" fill="none" />
      <path d="M46.6 59.4 Q50 61.8 53.4 59.4" stroke="#A9443B" strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <circle cx="36.2" cy="55" r="1.3" fill="#F7F1E6" /><circle cx="63.8" cy="55" r="1.3" fill="#F7F1E6" />
    </svg>
  );
};

const Dog: React.FC<{ look: number; glint: number; sweat: number; lick: number; t: number }> = ({ look, glint, sweat, lick, t }) => {
  const tiles: React.ReactNode[] = [];
  for (let i = 1; i < 9; i++) tiles.push(<path key={`v${i}`} d={`M${i * 12.5} 0 V70`} stroke="#CDB894" strokeWidth="0.8" />);
  for (let j = 1; j < 6; j++) tiles.push(<path key={`h${j}`} d={`M0 ${j * 12.5} H100`} stroke="#CDB894" strokeWidth="0.8" />);
  const px = -2.1 * look, py = 0.3 - 1.4 * look;
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <radialGradient id="cb-dog-bg" cx="0.35" cy="0.25" r="1"><stop offset="0" stopColor="#F1E3C6" /><stop offset="1" stopColor="#BFA57E" /></radialGradient>
        <radialGradient id="cb-dog-head" cx="0.42" cy="0.35" r="0.75"><stop offset="0" stopColor="#D69650" /><stop offset="1" stopColor="#B4743A" /></radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cb-dog-bg)" />
      {tiles}
      <rect y="70" width="100" height="30" fill="#9A6A40" />
      <path d="M0 70 H100" stroke="#6F4A2A" strokeWidth="1.4" />
      <path d="M18 100 Q19 75 50 71 Q81 75 82 100 Z" fill="#C4843F" />
      <path d="M41 100 Q43 80 50 76 Q57 80 59 100 Z" fill="#F2E4C9" />
      <path d="M31 72 Q50 80 69 72 L69 76.5 Q50 84.5 31 76.5 Z" fill="#B8862A" />
      <circle cx="50" cy="82.5" r="2.8" fill="#DDBB5E" stroke="#9A7524" strokeWidth="0.7" />
      <path d="M32.5 33 Q21 37 21 56 Q22 67 30 65 Q35.5 57 36.5 42 Z" fill="#7C4A24" />
      <path d="M67.5 33 Q79 37 79 56 Q78 67 70 65 Q64.5 57 63.5 42 Z" fill="#7C4A24" />
      <path d="M31 46 Q31 26.5 50 25.5 Q69 26.5 69 46 Q70 62 60.5 67 Q50 71.5 39.5 67 Q30 62 31 46 Z" fill="url(#cb-dog-head)" />
      <path d="M46.6 26.2 Q50 25.4 53.4 26.2 L54.2 44 Q50 46.5 45.8 44 Z" fill="#F2E4C9" />
      <ellipse cx="50" cy="57.5" rx="11.8" ry="9.6" fill="#F2E4C9" />
      <path d="M37.6 37.4 Q41.4 35 45.2 33.8 M54.8 33.8 Q58.6 35 62.4 37.4" stroke="#8A5226" strokeWidth="1.9" fill="none" strokeLinecap="round" />
      <ellipse cx="41.6" cy="43" rx="4.3" ry="4.7" fill="#FBF6EC" />
      <ellipse cx="58.4" cy="43" rx="4.3" ry="4.7" fill="#FBF6EC" />
      <circle cx={41.6 + px} cy={43 + py} r="3.1" fill="#3B2210" />
      <circle cx={58.4 + px} cy={43 + py} r="3.1" fill="#3B2210" />
      <circle cx={41.6 + px} cy={43 + py} r="1.7" fill="#120A05" />
      <circle cx={58.4 + px} cy={43 + py} r="1.7" fill="#120A05" />
      <circle cx={42.6 + px} cy={41.9 + py} r="0.95" fill="#fff" />
      <circle cx={59.4 + px} cy={41.9 + py} r="0.95" fill="#fff" />
      <path d="M37.3 46.8 Q41.6 48.6 45.9 46.8 M54.1 46.8 Q58.4 48.6 62.7 46.8" stroke="#A86A34" strokeWidth="0.9" fill="none" opacity="0.8" />
      <path d="M44.4 51 Q50 48.4 55.6 51 Q55.1 55.6 50 57 Q44.9 55.6 44.4 51 Z" fill="#2A1A12" />
      <ellipse cx="48" cy="50.9" rx="2.1" ry="0.9" fill="#fff" opacity="0.3" />
      <path d="M50 57 V59.6 M44.4 60.6 Q47.4 62.8 50 59.6 Q52.6 62.8 55.6 60.6" stroke="#5B3A22" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* tomato sauce: smeared over the nose tip and up the muzzle, a dab at the mouth; the tongue sneaks out to lick it */}
      <path d="M50.4 50.2 Q50.2 46.6 53.2 45.9 Q56.6 45.7 57.6 49.4 Q58.6 52.8 55.8 53.5 Q53.6 53.9 52.5 52.3 Q50.9 51.7 50.4 50.2 Z" fill="#D4462A" stroke="#972B14" strokeWidth="0.35" />
      <path d="M54.8 60.3 Q58.6 58.3 60.6 60.6 Q61.3 63.2 58.7 63.7 Q56.2 63.8 54.8 60.3 Z" fill="#D4462A" stroke="#972B14" strokeWidth="0.3" />
      <ellipse cx="44.4" cy="61.2" rx="1.5" ry="1" fill="#D4462A" />
      {lick > 0 && (
        <g transform={`translate(56.6 61.4) rotate(${-10 + 16 * Math.sin((t - 1.88) * TAU * 3.2)}) scale(${lick})`}>
          <path d="M-1 0.2 Q0.6 4 3 2.8 Q4 1.6 2.8 0 Z" fill="#E88A86" stroke="#B5595A" strokeWidth="0.4" />
          <path d="M0.8 0.8 Q1.4 2 2.2 2.2" stroke="#C86A6A" strokeWidth="0.35" fill="none" />
        </g>
      )}
      <ellipse cx="54.6" cy="47.9" rx="1.7" ry="0.65" fill="#fff" opacity={0.6 + 0.35 * glint} transform="rotate(-18 54.6 47.9)" />
      <ellipse cx="58.8" cy="60.2" rx="0.9" ry="0.45" fill="#fff" opacity="0.5" />
      <ellipse cx="61.8" cy="57.4" rx="0.9" ry="0.6" fill="#E6BC68" stroke="#A8742E" strokeWidth="0.25" />
      <ellipse cx="42.2" cy="58.6" rx="0.6" ry="0.45" fill="#E6BC68" />
      {glint > 0 && (
        <g transform={`translate(55.6 47.4) scale(${glint})`} opacity={Math.min(1, glint * 1.4)}>
          <path d="M0 -4.6 L0.8 -0.8 L4.6 0 L0.8 0.8 L0 4.6 L-0.8 0.8 L-4.6 0 L-0.8 -0.8 Z" fill="#FFF8E8" />
        </g>
      )}
      {sweat > 0 && (
        <path transform={`translate(${66 - 0.5 * sweat} ${30 + 7 * sweat}) scale(${0.8 + 0.2 * sweat})`} d="M0 -3.4 Q2.4 0 2.4 1.6 A2.4 2.4 0 0 1 -2.4 1.6 Q-2.4 0 0 -3.4 Z" fill="#FBF7EF" stroke="#A8A196" strokeWidth="0.5" opacity={Math.min(1, sweat * 3)} />
      )}
    </svg>
  );
};

const PizzaBox: React.FC = () => {
  const crumbs: React.ReactNode[] = [];
  for (let i = 0; i < 46; i++) {
    const x = 18 + 64 * hash(i * 3.7 + 1), y = 42 + 46 * hash(i * 5.3 + 2), r = 0.5 + 1.3 * hash(i * 1.9 + 3) ** 2;
    const col = ["#B5652B", "#E3B867", "#8A4520", "#D58A3C"][Math.floor(hash(i * 7.1) * 4)];
    crumbs.push(<ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.7} transform={`rotate(${hash(i) * 180} ${x} ${y})`} fill={col} />);
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      <defs>
        <linearGradient id="cb-pz-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6A4429" /><stop offset="1" stopColor="#40281A" /></linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cb-pz-wood)" />
      {[12, 27, 44, 63, 81, 95].map((y, k) => <path key={k} d={`M0 ${y} Q30 ${y + 2} 55 ${y - 1} T100 ${y + 1}`} stroke="#33200F" strokeWidth="0.7" fill="none" opacity="0.5" />)}
      <path d="M12 3 L88 3 L90 35 L10 35 Z" fill="#E2C18F" />
      <path d="M15 6 L85 6 L86.5 32 L13.5 32 Z" fill="#D9B47F" />
      <ellipse cx="62" cy="18" rx="12" ry="6" fill="#9C6833" opacity="0.28" />
      <path d="M10 35 L90 35 L95 97 L5 97 Z" fill="#C79A62" />
      <path d="M14.5 39 L85.5 39 L89.5 93 L10.5 93 Z" fill="#DAB27C" />
      <path d="M10 35 L90 35" stroke="#A47A47" strokeWidth="1.2" />
      <ellipse cx="50" cy="65" rx="31" ry="22" fill="#A56C35" opacity="0.16" stroke="#9E6630" strokeOpacity="0.35" strokeWidth="2.4" />
      <path d="M28 52 q6 -4 10 1 q4 6 -3 8 q-8 1 -7 -9 Z" fill="#8F5A2A" opacity="0.32" />
      <path d="M62 71 q8 -3 11 3 q2 7 -6 7 q-8 -2 -5 -10 Z" fill="#8F5A2A" opacity="0.3" />
      <path d="M46 78 q4 -2 6 1 q1 4 -3 4 q-4 -1 -3 -5 Z" fill="#8F5A2A" opacity="0.28" />
      {crumbs}
      <g transform="translate(50 63)">
        <ellipse cx="1.2" cy="1.6" rx="7.6" ry="6.4" fill="#000" opacity="0.18" />
        {[90, 210, 330].map((a) => {
          const r = (a * Math.PI) / 180;
          return <g key={a}><path d={`M0 0 L${(6.6 * Math.cos(r)).toFixed(2)} ${(5.6 * Math.sin(r)).toFixed(2)}`} stroke="#F6F3EC" strokeWidth="1.7" strokeLinecap="round" /><circle cx={6.6 * Math.cos(r)} cy={5.6 * Math.sin(r)} r="1.25" fill="#ECE7DC" /></g>;
        })}
        <circle r="2.9" fill="#F8F6F0" stroke="#D9D3C6" strokeWidth="0.5" />
      </g>
      <g transform="translate(81 86)">
        <path d="M-7 6 L7 6 L4 -6 L-4 -6 Z" fill="#E5BE36" />
        <path d="M-4 -6 L4 -6" stroke="#A9861E" strokeWidth="0.8" />
        <text x="0" y="3.6" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="8" fill="#1C1A16">A</text>
      </g>
    </svg>
  );
};

// ---------------------------------------------------------------- paper items
const paperShadow = (S: number, lift: number) =>
  `0 ${0.9 * S}px ${1.8 * S}px rgba(28,14,5,${0.5 * (1 - lift) + 0.05}), ${(5 + 26 * lift) * S}px ${(8 + 38 * lift) * S}px ${(11 + 26 * lift) * S}px rgba(28,14,5,${0.42 - 0.14 * lift})`;

const Polaroid: React.FC<{ it: Item; S: number; caption: string; marker?: boolean; children: React.ReactNode }> = ({ it, S, caption, marker, children }) => {
  const m = it.w * 0.055, ph = it.w - 2 * m;
  const bottom = it.h - m - ph;
  return (
    <>
      <div style={{ position: "absolute", left: m * S, top: m * S, width: ph * S, height: ph * S, overflow: "hidden", background: "#222" }}>
        {children}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(118deg, rgba(255,250,235,0.20) 0%, rgba(255,250,235,0.05) 38%, rgba(0,0,0,0) 55%, rgba(30,15,5,0.16) 100%)" }} />
        <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 ${3 * S}px rgba(20,10,4,0.45)` }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: (m + ph) * S, height: bottom * S, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: marker ? MARKER : HAND, fontWeight: marker ? 400 : 700, fontSize: (marker ? 44 : 40) * S, color: "#221C18", letterSpacing: marker ? 1.5 * S : 0, lineHeight: 1, transform: `rotate(${marker ? -1.5 : -2}deg)` }}>
        {caption}
      </div>
    </>
  );
};

const IndexCard: React.FC<{ it: Item; S: number; lines: string[]; verdict?: boolean }> = ({ it, S, lines, verdict }) => {
  const rows: React.ReactNode[] = [];
  for (let y = 52; y < it.h - 8; y += 24) rows.push(<div key={y} style={{ position: "absolute", left: 0, right: 0, top: y * S, height: Math.max(1, 1.1 * S), background: "rgba(150,128,100,0.32)" }} />);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, top: 30 * S, height: Math.max(1, 1.6 * S), background: "rgba(196,64,52,0.75)" }} />
      {rows}
      <div style={{ position: "absolute", left: (verdict ? 44 : 20) * S, top: (verdict ? 4 : 34) * S, fontFamily: TYPE, fontSize: (verdict ? 25 : 25) * S, lineHeight: `${24 * S}px`, color: "#2A2420", whiteSpace: "pre" }}>
        {lines.map((l, k) => <div key={k} style={{ height: 24 * S, paddingTop: k === 0 && !verdict ? 0 : 0 }}>{l}</div>)}
      </div>
    </>
  );
};

const Sticky: React.FC<{ it: Item; S: number; lines: string[] }> = ({ it, S, lines }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 10 * S,
    fontFamily: MARKER, fontSize: (it.w > 140 ? 31 : 33) * S, lineHeight: 1.05, color: "#2A2018", textAlign: "center" }}>
    {lines.map((l, k) => <div key={k}>{l}</div>)}
  </div>
);

const Header: React.FC<{ it: Item; S: number }> = ({ S }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontFamily: TYPE, fontSize: 19 * S, color: "#6B5A45", letterSpacing: 3 * S, marginBottom: 2 * S }}>CASE No. 0031 · KITCHEN</div>
    <div style={{ fontFamily: MARKER, fontSize: 47 * S, color: "#1F1A16", lineHeight: 1.05, letterSpacing: 0.5 * S, whiteSpace: "nowrap" }}>WHO ATE THE LAST SLICE?</div>
  </div>
);

const tornClip = (seed: number) => {
  const pts: string[] = [];
  for (let i = 0; i <= 12; i++) pts.push(`${(i / 12) * 100}% ${(hash(seed + i) * 4).toFixed(2)}%`);
  for (let i = 12; i >= 0; i--) pts.push(`${(i / 12) * 100}% ${(100 - hash(seed + 40 + i) * 5).toFixed(2)}%`);
  return `polygon(${pts.join(",")})`;
};
const HEADER_CLIP = tornClip(17);

// ---------------------------------------------------------------- pins (SVG, world units)
const PIN_COL: Record<PinC, [string, string, string, string]> = {
  red: ["#FF9C88", "#E0392B", "#9C1A11", "#5A0D07"],
  cream: ["#FFFFFF", "#EFE6D2", "#BDAE90", "#7D6E55"],
  brass: ["#FFF0B8", "#D6AD4E", "#9A7424", "#5C4210"],
};
const PinDefs: React.FC = () => (
  <defs>
    {(Object.keys(PIN_COL) as PinC[]).map((k) => (
      <radialGradient key={k} id={`cb-pin-${k}`} cx="0.36" cy="0.32" r="0.78">
        <stop offset="0" stopColor={PIN_COL[k][0]} /><stop offset="0.28" stopColor={PIN_COL[k][1]} />
        <stop offset="0.75" stopColor={PIN_COL[k][2]} /><stop offset="1" stopColor={PIN_COL[k][3]} />
      </radialGradient>
    ))}
    <filter id="cb-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6" /></filter>
    <filter id="cb-soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
  </defs>
);
const PinHead: React.FC<{ x: number; y: number; c: PinC; p: number }> = ({ x, y, c, p }) => {
  const s = lerp(1.6, 1, easeOut(p)), r = 12.5;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={clamp(p * 3)}>
      <ellipse cx={8 * s} cy={11 * s} rx={r * 1.05} ry={r * 0.95} fill="#1E0F05" opacity={0.42} filter="url(#cb-soft)" />
      <path d={`M0 0 L${7 * s} ${10 * s}`} stroke="#1E0F05" strokeWidth="2.4" opacity="0.25" filter="url(#cb-soft)" />
      <circle r={r} fill={`url(#cb-pin-${c})`} />
      <circle r={r - 1.2} fill="none" stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" />
      <ellipse cx={-4} cy={-4.6} rx={3.6} ry={2.4} fill="#fff" opacity="0.78" transform="rotate(-30 -4 -4.6)" />
    </g>
  );
};

// ---------------------------------------------------------------- the marker pen (world units, tip at the origin)
const MarkerPen: React.FC<{ x: number; y: number; rot: number; lift: number }> = ({ x, y, rot, lift }) => (
  <g transform={`translate(${x} ${y})`}>
    <g transform={`translate(${14 + 30 * lift} ${22 + 40 * lift}) rotate(${rot})`} opacity={0.3 - 0.1 * lift} filter="url(#cb-soft2)">
      <path d="M0 0 L40 -16 L420 -18 L420 18 L40 16 Z" fill="#1E0F05" />
    </g>
    <g transform={`rotate(${rot})`}>
      <defs>
        <linearGradient id="cb-pen-body" x1="0" y1="-1" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#F06A55" /><stop offset="0.3" stopColor="#D2301F" /><stop offset="0.75" stopColor="#8E160E" /><stop offset="1" stopColor="#5C0C07" />
        </linearGradient>
        <linearGradient id="cb-pen-grip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5A5552" /><stop offset="0.35" stopColor="#2C2927" /><stop offset="1" stopColor="#141210" /></linearGradient>
      </defs>
      <path d="M0 -1.6 Q0 -4.6 6 -6 L16 -7.5 L16 7.5 L6 6 Q0 4.6 0 1.6 Z" fill="#A7231A" />
      <path d="M16 -8 L42 -15.5 L42 15.5 L16 8 Z" fill="url(#cb-pen-grip)" />
      <rect x="42" y="-17" width="380" height="34" rx="7" fill="url(#cb-pen-body)" />
      <rect x="42" y="-17" width="26" height="34" fill="#000" opacity="0.18" />
      <rect x="250" y="-17" width="64" height="34" fill="#F0E8D8" opacity="0.92" />
      <rect x="250" y="-17" width="64" height="34" fill="url(#cb-pen-grip)" opacity="0.12" />
      <rect x="50" y="-12" width="360" height="5" rx="2.5" fill="#fff" opacity="0.32" />
    </g>
  </g>
);

// ---------------------------------------------------------------- board edge: wooden frame + the frame's shadow on the cork
const BX0 = -28, BY0 = -30, BX1 = 1032, BY1 = 1838, FW = 44;
const GRAIN_H = "repeating-linear-gradient(90deg, rgba(30,14,4,0.10) 0px, rgba(30,14,4,0) 3px, rgba(255,220,170,0.05) 7px, rgba(30,14,4,0) 13px)";
const GRAIN_V = "repeating-linear-gradient(180deg, rgba(30,14,4,0.10) 0px, rgba(30,14,4,0) 3px, rgba(255,220,170,0.05) 7px, rgba(30,14,4,0) 13px)";
const FRAME_BARS = [
  { x0: BX0 - FW, y0: BY0 - FW, x1: BX1 + FW, y1: BY0, bg: `${GRAIN_H}, linear-gradient(180deg, #A8774B 0%, #8A5A33 22%, #6A4023 70%, #3E2412 100%)` },
  { x0: BX0 - FW, y0: BY1, x1: BX1 + FW, y1: BY1 + FW, bg: `${GRAIN_H}, linear-gradient(180deg, #8C6039 0%, #6A4224 35%, #4C2D17 80%, #2E1A0C 100%)` },
  { x0: BX0 - FW, y0: BY0, x1: BX0, y1: BY1, bg: `${GRAIN_V}, linear-gradient(90deg, #A0704A 0%, #85562F 25%, #643C20 72%, #3A2111 100%)` },
  { x0: BX1, y0: BY0, x1: BX1 + FW, y1: BY1, bg: `${GRAIN_V}, linear-gradient(90deg, #7C5230 0%, #6A4224 30%, #4A2C16 78%, #2C190B 100%)` },
];
const CORK_SHADE = [
  { x0: BX0, y0: BY0, x1: BX1, y1: BY0 + 30, bg: "linear-gradient(180deg, rgba(25,12,4,0.55), rgba(25,12,4,0))" },
  { x0: BX0, y0: BY0, x1: BX0 + 26, y1: BY1, bg: "linear-gradient(90deg, rgba(25,12,4,0.5), rgba(25,12,4,0))" },
  { x0: BX1 - 14, y0: BY0, x1: BX1, y1: BY1, bg: "linear-gradient(270deg, rgba(25,12,4,0.3), rgba(25,12,4,0))" },
  { x0: BX0, y0: BY1 - 14, x1: BX1, y1: BY1, bg: "linear-gradient(0deg, rgba(25,12,4,0.3), rgba(25,12,4,0))" },
];

// ---------------------------------------------------------------- the board (world → px with S)
type View = { x0: number; y0: number; x1: number; y1: number };
const Board: React.FC<{ u: number; S: number; ox: number; oy: number; view: View; full: boolean }> = ({ u, S, ox, oy, view, full }) => {
  const states: Record<string, St | null> = {};
  for (const it of ITEMS) states[it.id] = itemState(it, u);
  const vis = (it: Item) => it.x + it.w > view.x0 && it.x - it.w < view.x1 && it.y + it.h > view.y0 && it.y - it.h < view.y1;

  const dog = BY.dog, dst = states.dog ?? REST;
  // marker timeline
  const cp = easeInOut(clamp((u - C0) / (C1 - C0)));
  const gq = clamp((u - G0) / (G1 - G0));
  const gk = Math.min(5, Math.floor(gq * 6));
  const gw = gq >= 1 ? 1 : (gk + easeOut(gq * 6 - gk)) / 6;
  const lp = easeInOut(clamp((u - L0) / (L1 - L0)));
  const faceC = localWorld(dog, dst, 0, -dog.h / 2 + dog.w * 0.055 + 0.47 * dog.w * 0.89);
  const look = u < 1.92 ? 0 : easeOut(clamp((u - 1.92) / 0.06)) * (u > 2.12 ? 1 - 0.25 * easeInOut(clamp((u - 2.12) / 0.1)) : 1);
  const glint = u < 1.86 ? 0 : Math.sin(Math.PI * clamp((u - 1.86) / 0.3)) * 1 + (u > 2.0 ? 0.25 : 0);
  const sweat = u < 1.98 ? 0 : clamp((u - 1.98) / 0.24);
  const lick = u < 1.88 ? 0 : 1 - Math.pow(1 - clamp((u - 1.88) / 0.1), 3) * 1 + 0.12 * Math.sin(clamp((u - 1.88) / 0.1) * Math.PI);

  const ver = BY.verdict, vst = states.verdict ?? REST;
  const gx0 = -GW / 2 + 4, gy = 44;

  // pen tip
  let pen: { x: number; y: number; lift: number } | null = null;
  if (full && u > 0.98 && u < 2.1) {
    if (u < C0) { const e = easeOut(clamp((u - 0.98) / 0.12)); const c = circleAt(0); pen = { x: faceC.x + c.x + 320 * (1 - e), y: faceC.y + c.y + 420 * (1 - e), lift: 1 - e }; }
    else if (u < C1 + 0.01) { const c = circleAt(cp); pen = { x: faceC.x + c.x, y: faceC.y + c.y, lift: 0 }; }
    else if (u < G0) { const c = circleAt(1); const g = localWorld(ver, vst, gx0, gy - 30); const e = easeInOut(clamp((u - C1 - 0.01) / (G0 - C1 - 0.01))); pen = { x: lerp(faceC.x + c.x, g.x, e), y: lerp(faceC.y + c.y, g.y, e), lift: Math.sin(Math.PI * e) * 0.4 }; }
    else if (u < L0) { const lx = gx0 + GW * gw, bob = Math.sin(gq * 6 * Math.PI * 2) * 22; const g = localWorld(ver, vst, lx, gy - 34 + bob); pen = { x: g.x, y: g.y, lift: 0 }; }
    else if (u < L1 + 0.02) { const g = localWorld(ver, vst, gx0 - 6 + (GW + 16) * lp, gy + 22 + 6 * Math.sin(lp * Math.PI)); pen = { x: g.x, y: g.y, lift: 0 }; }
    else { const e = easeIn(clamp((u - L1 - 0.02) / 0.22)); const g = localWorld(ver, vst, gx0 + GW + 10, gy + 22); pen = { x: g.x + 380 * e, y: g.y + 520 * e, lift: e }; }
  }

  const strings = STRINGS.map((s, k) => {
    const A0 = BY[s.a[0]], B0 = BY[s.b[0]];
    const sa = states[A0.id], sb = states[B0.id];
    if (!sa || !sb || sb.pin < 1 && s.t0 > 0 && u < s.t0) return null;
    const sh = stringShape(s, u);
    if (!sh) return null;
    const A = pinWorld(A0, s.a[1], sa), B = pinWorld(B0, s.b[1], sb);
    const E = { x: lerp(A.x, B.x, sh.e), y: lerp(A.y, B.y, sh.e) };
    const L = Math.hypot(B.x - A.x, B.y - A.y), l = Math.hypot(E.x - A.x, E.y - A.y) || 1;
    const nx = -(E.y - A.y) / l, ny = (E.x - A.x) / l;
    const cx = (A.x + E.x) / 2 + nx * sh.wob * L, cy = (A.y + E.y) / 2 + sh.sag * L * 1.6 + ny * sh.wob * L;
    const d = `M${A.x.toFixed(2)} ${A.y.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${E.x.toFixed(2)} ${E.y.toFixed(2)}`;
    return { k, d, E, done: sh.e >= 1 };
  });

  const wx = (v: number) => v * S;
  const inside = view.x0 > BX0 && view.x1 < BX1 && view.y0 > BY0 && view.y1 < BY1;
  const c0x = Math.max(view.x0, BX0), c0y = Math.max(view.y0, BY0), c1x = Math.min(view.x1, BX1), c1y = Math.min(view.y1, BY1);
  const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
  const svgBox = { position: "absolute" as const, left: wx(view.x0), top: wx(view.y0), width: wx(vw), height: wx(vh), overflow: "visible" as const };
  const lamp = { x: 470, y: 820, r: 1300 };

  const renderItem = (it: Item) => {
    const st = states[it.id];
    if (!st || !vis(it)) return null;
    const base: React.CSSProperties = {
      position: "absolute", left: wx(it.x - it.w / 2), top: wx(it.y - it.h / 2), width: wx(it.w), height: wx(it.h),
      transform: `translate(${wx(st.dx)}px, ${wx(st.dy)}px) rotate(${it.rot + st.dr}deg) scale(${st.s})`, opacity: st.op,
      boxShadow: paperShadow(S, st.lift),
    };
    if (it.kind === "pol") {
      const cap: Record<string, string> = { pizza: "EXHIBIT A", roommate: "the roommate", cat: "the cat", neighbour: "the neighbour", dog: "the dog" };
      const art = it.id === "pizza" ? <PizzaBox /> : it.id === "roommate" ? <Roommate /> : it.id === "cat" ? <Cat /> : it.id === "neighbour" ? <Neighbour /> : <Dog look={look} glint={glint} sweat={sweat} lick={lick} t={u} />;
      return (
        <div key={it.id} style={{ ...base, background: "linear-gradient(162deg, #FDFBF4 0%, #F4EFE3 55%, #E3DBCA 100%)", borderRadius: 1.5 * S }}>
          <Polaroid it={it} S={S} caption={cap[it.id]} marker={it.id === "pizza"}>{art}</Polaroid>
        </div>
      );
    }
    if (it.kind === "card") {
      const lines = it.id === "cardA" ? ["FRI 11:48 PM —", "box sealed."] : it.id === "cardB" ? ["11:52 PM —", "crumbs on", "the sofa."] : it.id === "cardC" ? ["12:03 AM —", "box found EMPTY."] : ["VERDICT:"];
      return (
        <div key={it.id} style={{ ...base, background: "linear-gradient(170deg, #FBF5E6 0%, #F1E8D2 100%)", borderRadius: 2 * S }}>
          <IndexCard it={it} S={S} lines={lines} verdict={it.id === "verdict"} />
        </div>
      );
    }
    if (it.kind === "sticky") {
      const lines = it.id === "alibi" ? ["alibi:", "asleep??"] : ["motive?"];
      return (
        <div key={it.id} style={{ ...base, background: "linear-gradient(172deg, #F7DD6A 0%, #EFCB45 70%, #DDB431 100%)", borderRadius: `${1 * S}px ${1 * S}px ${6 * S}px ${1 * S}px` }}>
          <Sticky it={it} S={S} lines={lines} />
        </div>
      );
    }
    return (
      <div key={it.id} style={{ ...base, boxShadow: "none", filter: `drop-shadow(${4 * S}px ${7 * S}px ${6 * S}px rgba(28,14,5,0.45))` }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(175deg, #EFE0BC 0%, #E2CFA4 100%)", clipPath: HEADER_CLIP }}>
          <Header it={it} S={S} />
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", left: ox, top: oy, width: 0, height: 0 }}>
      {/* wall + wooden frame (only when the view reaches the board's edge) */}
      {!inside && <div style={{ position: "absolute", left: wx(view.x0), top: wx(view.y0), width: wx(vw), height: wx(vh), background: "#3B291C" }} />}
      {!inside && <div style={{ position: "absolute", left: wx(BX0 - FW), top: wx(BY0 - FW), width: wx(BX1 - BX0 + 2 * FW), height: wx(BY1 - BY0 + 2 * FW),
        background: "#4A2D18", boxShadow: `${12 * S}px ${20 * S}px ${34 * S}px rgba(10,5,2,0.65)` }} />}
      {/* cork */}
      <div style={{ position: "absolute", left: wx(c0x), top: wx(c0y), width: wx(c1x - c0x), height: wx(c1y - c0y),
        backgroundColor: "#A87747", backgroundImage: `url(${corkTexture()})`, backgroundSize: `${wx(CORK_U)}px ${wx(CORK_U)}px`,
        backgroundPosition: `${-wx(c0x)}px ${-wx(c0y)}px` }} />
      {!inside && FRAME_BARS.map((f, k) => (
        <div key={k} style={{ position: "absolute", left: wx(f.x0), top: wx(f.y0), width: wx(f.x1 - f.x0), height: wx(f.y1 - f.y0), background: f.bg }} />
      ))}
      {!inside && CORK_SHADE.map((f, k) => (
        <div key={`s${k}`} style={{ position: "absolute", left: wx(f.x0), top: wx(f.y0), width: wx(f.x1 - f.x0), height: wx(f.y1 - f.y0), background: f.bg }} />
      ))}
      {ITEMS.map(renderItem)}
      {/* marker ink + strings + pins */}
      <svg viewBox={`${view.x0} ${view.y0} ${vw} ${vh}`} style={svgBox}>
        <PinDefs />
        {cp > 0 && (
          <g transform={`translate(${faceC.x} ${faceC.y})`} style={{ mixBlendMode: "multiply" }}>
            <path d={CIRCLE.d} fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={CIRCLE.len} strokeDashoffset={CIRCLE.len * (1 - cp)} opacity="0.92" />
            <path d={CIRCLE.d} fill="none" stroke="#7E120B" strokeWidth="3" strokeLinecap="round" strokeDasharray={CIRCLE.len} strokeDashoffset={CIRCLE.len * (1 - cp)} opacity="0.25" />
          </g>
        )}
        {gq > 0 && (() => {
          const c = localWorld(ver, vst, 0, 0);
          return (
            <g transform={`translate(${c.x} ${c.y}) rotate(${ver.rot + vst.dr - 7})`} style={{ mixBlendMode: "multiply" }}>
              <clipPath id="cb-gclip"><rect x={gx0 - 20} y={-120} width={(GW + 40) * gw} height={240} /></clipPath>
              <text x={gx0} y={gy} textLength={GW} lengthAdjust="spacingAndGlyphs" fontFamily={MARKER} fontSize="104" fill={INK} stroke={INK} strokeWidth="1.5" clipPath="url(#cb-gclip)" opacity="0.95">GUILTY</text>
              {lp > 0 && (
                <path d={`M${gx0 - 6} ${gy + 22} Q${gx0 + GW * 0.5} ${gy + 32} ${gx0 + GW + 10} ${gy + 16}`} fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - lp} opacity="0.92" />
              )}
            </g>
          );
        })()}
        {strings.map((s) => s && (
          <g key={s.k}>
            <path d={s.d} transform="translate(7 10)" fill="none" stroke="#1E0F05" strokeWidth="4.4" opacity="0.34" filter="url(#cb-soft)" />
            <path d={s.d} fill="none" stroke="#5E0E09" strokeWidth="5.4" strokeLinecap="round" />
            <path d={s.d} fill="none" stroke={STRING} strokeWidth="4.2" strokeLinecap="round" />
            <path d={s.d} fill="none" stroke="#F07462" strokeWidth="1.4" strokeDasharray="3 4" opacity="0.7" />
            {!s.done && <circle cx={s.E.x} cy={s.E.y} r="3" fill={STRING} />}
          </g>
        ))}
        {ITEMS.map((it) => {
          const st = states[it.id];
          if (!st || st.pin <= 0 || !vis(it)) return null;
          return it.pins.map((p, k) => { const w = pinWorld(it, k, st); return <PinHead key={`${it.id}${k}`} x={w.x} y={w.y} c={p.c} p={st.pin} />; });
        })}
        {pen && <MarkerPen x={pen.x} y={pen.y} rot={52} lift={pen.lift} />}
      </svg>
      {/* desk-lamp light: warm falloff (world-anchored) */}
      <div style={{ position: "absolute", left: wx(view.x0), top: wx(view.y0), width: wx(vw), height: wx(vh), mixBlendMode: "multiply",
        background: `radial-gradient(circle ${wx(lamp.r)}px at ${wx(lamp.x - view.x0)}px ${wx(lamp.y - view.y0)}px, #FFFFFF 0%, #FBEBD2 34%, #D0A57C 70%, #684630 100%)` }} />
      <div style={{ position: "absolute", left: wx(view.x0), top: wx(view.y0), width: wx(vw), height: wx(vh), mixBlendMode: "screen",
        background: `radial-gradient(circle ${wx(lamp.r * 0.5)}px at ${wx(lamp.x - 80 - view.x0)}px ${wx(lamp.y - 160 - view.y0)}px, rgba(255,194,116,0.32) 0%, rgba(255,194,116,0) 100%)` }} />
    </div>
  );
};

// ---------------------------------------------------------------- the style
export const CaseBoard: React.FC<StyleProps> = ({ u: uIn, w, h, full }) => {
  const u = Math.max(0, uIn);
  const tile = full && w / h > 0.7;
  const cam = camAt(u, full, tile);
  const S = (cam.z * w) / 1000;
  const sh = shakeAt(u, full);
  const k = w / 1000;
  const ox = w / 2 - cam.cx * S + sh.x * 3 * k, oy = h / 2 - cam.cy * S + sh.y * 3 * k;
  const mx = (w / S) * 0.75, my = (h / S) * 0.75;
  const view: View = { x0: cam.cx - mx, x1: cam.cx + mx, y0: cam.cy - my, y1: cam.cy + my };
  const P = h * (full ? 1.25 : 1.2);
  const cam3d = `perspective(${P}px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) rotateZ(${cam.rz}deg)`;
  const scene = (
    <div style={{ position: "absolute", inset: 0, transform: cam3d, transformOrigin: "50% 50%" }}>
      <Board u={u} S={S} ox={ox} oy={oy} view={view} full={full} />
    </div>
  );
  // shallow depth of field after the cut: a blurred copy, masked away around the focus point
  let dof: React.ReactNode = null;
  if (full) {
    const f0 = { x: 712, y: 1200 }, f1 = { x: 780, y: 1525 };
    const fp = easeInOut(clamp((u - 0.95) / 0.3));
    const fx = lerp(f0.x, f1.x, fp), fy = lerp(f0.y, f1.y, fp);
    const sx = w / 2 + (fx - cam.cx) * S, sy = h / 2 + (fy - cam.cy) * S;
    const blur = (tile ? 2.2 : 7.5) * (w / 1080) * (tile ? 1.6 : 1);
    const rx = w * (tile ? 0.66 : 0.62), ry = h * (tile ? 0.66 : 0.52);
    dof = (
      <div style={{ position: "absolute", inset: 0, filter: `blur(${blur}px)`,
        WebkitMaskImage: `radial-gradient(ellipse ${rx}px ${ry}px at ${sx}px ${sy}px, transparent 0%, transparent 52%, #000 100%)` }}>
        {scene}
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#2A1A0F",
      // the card is first seen through a dot matrix: run the lamp hot until the dots merge, so the shapes read
      filter: full ? undefined : `brightness(${1 + 0.22 * (1 - easeInOut(clamp((u - 0.03) / 0.2)))})` }}>
      {scene}
      {dof}
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 75% 62% at 50% 46%, rgba(0,0,0,0) 55%, rgba(14,8,4,${full ? 0.5 : 0.3}) 100%)` }} />
    </div>
  );
};
