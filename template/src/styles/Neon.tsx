// /neon — "a sign buzzing to life": a wet brick wall at night, shot straight on. "OPEN" in thick red tubes flickers on
// letter by letter with an uneven buzz (each strike throws red light on the bricks). HARD CUT closer and lower: the
// warm-white script "all night" writes itself left → right with a white-hot tip, the whole sign surges to full glow,
// rain streaks fall through the light, the wet pavement mirrors the sign in ripples, and the E keeps buzzing.
// Pure 2D canvas, a pure function of u. Heavy textures (bricks, pavement, script tubes) are cached at module scope.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { loadFont as loadSacramento } from "@remotion/google-fonts/Sacramento";
import type { StyleProps } from "../types";
import { clamp, easeOut, hash, lerp } from "../theme";
import { U_END, U_FULL } from "../timing";

const SCRIPT_FONT = loadSacramento("normal", { weights: ["400"], subsets: ["latin"] });

// ───────────────────────── world (1 unit ≈ 1.9 mm; origin = sign centre, y down) ─────────────────────────
const BW = 120, CH = 40, MORT = 7;      // brick module
const T = 27;                           // OPEN tube Ø
const ST = 12;                          // script tube Ø
const WALL = { x0: -720, y0: -980, x1: 720, y1: 700 };
const TEX = 1.2;                        // wall texture px per world unit
const PAVE = { x0: -1100, x1: 1100, depth: 1500 };
const PT = 0.7;                         // pavement texture px per world unit
const SCRIPT_TEXT = "all night", SCRIPT_W = 600, SCRIPT_TOP = 50, SR = 2;

type Pt = [number, number];
const poly = (p: Path2D, pts: Pt[], r: number) => {
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) p.arcTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r);
  p.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
};

type Letter = { p: Path2D; c: Pt; ends: [number, number, number, number][]; clips: [number, number, number, number][] };
const mkLetters = (): Letter[] => {
  const O = new Path2D(); poly(O, [[-304, 15], [-382, 15], [-382, -215], [-208, -215], [-208, 15], [-286, 15]], 76);
  const P = new Path2D(); poly(P, [[-152, 15], [-152, -215], [-80, -215]], 18);
  P.arc(-80, -155, 60, -Math.PI / 2, Math.PI / 2); P.lineTo(-140, -95);
  const E = new Path2D(); poly(E, [[166, -215], [40, -215], [40, 15], [166, 15]], 18); E.moveTo(56, -100); E.lineTo(148, -100);
  const N = new Path2D(); poly(N, [[220, 15], [220, -215], [380, 15], [380, -215]], 14);
  const dg = Math.hypot(160, 230);
  return [
    { p: O, c: [-295, -100], ends: [[-304, 15, -1, 0], [-286, 15, 1, 0]], clips: [[-382, -95, 0, 1], [-208, -95, 0, 1], [-295, -215, 1, 0]] },
    { p: P, c: [-95, -100], ends: [[-152, 15, 0, -1], [-140, -95, 1, 0]], clips: [[-152, -40, 0, 1], [-20, -155, 0, 1]] },
    { p: E, c: [103, -100], ends: [[166, -215, -1, 0], [166, 15, -1, 0], [56, -100, 1, 0], [148, -100, -1, 0]], clips: [[40, -45, 0, 1], [112, -215, 1, 0], [112, 15, 1, 0]] },
    { p: N, c: [300, -100], ends: [[220, 15, 0, -1], [380, -215, 0, 1]], clips: [[220, -100, 0, 1], [380, -100, 0, 1], [300, -100, 160 / dg, 230 / dg]] },
  ];
};
const mkCable = () => {
  const c = new Path2D();
  c.moveTo(380, -232); c.bezierCurveTo(382, -262, 428, -262, 430, -205); c.lineTo(431, 760);
  return c;
};
const CABLE_SADDLES = [-120, 40, 200, 360, 520];

// ───────────────────────── timeline ─────────────────────────
type Steps = [number, number][];
/** OPEN strikes letter by letter, each with an on-off-on stutter (u in s since the card appeared) */
const OPEN_STEPS: Steps[] = [
  [[-1, 0.95], [0.033, 0.1], [0.067, 0.6], [0.1, 0], [0.117, 1]],
  [[0.2, 0.45], [0.217, 0], [0.267, 1], [0.3, 0.12], [0.317, 1]],
  [[0.37, 0.9], [0.387, 0.08], [0.42, 0], [0.45, 0.6], [0.467, 1]],
  [[0.53, 1], [0.547, 0], [0.567, 0.4], [0.6, 0], [0.617, 1]],
];
/** the E that never quite behaves (after the surge, to the end of the loop) */
const E_BUZZ: Steps = [[1.62, 0], [1.65, 1], [1.7, 0.25], [1.72, 1], [1.85, 0], [1.883, 0.6], [1.9, 0], [1.933, 1],
  [2.033, 0.1], [2.083, 1], [2.133, 0.3], [2.15, 1], [2.183, 0], [2.2, 0.7]];
const stepVal = (st: Steps, u: number, v0 = 0) => { let v = v0; for (const [t, l] of st) if (u >= t) v = l; return v; };
const W0 = 0.86, W1 = 1.34;   // script write-on
const SURGE = 1.38;

const levels = (u: number, full: boolean) => {
  const t = u - U_FULL;
  const flash = full && t >= 0 ? 0.22 * Math.exp(-t / 0.07) : 0;
  const bt = u - SURGE;
  const bump = bt < -0.033 ? 0 : bt < 0 ? (bt + 0.033) / 0.033 : Math.exp(-bt / 0.14);
  const base = lerp(0.8, 1, easeOut(clamp((u - SURGE + 0.03) / 0.12)));
  const master = base + flash + 0.6 * bump;
  const L = OPEN_STEPS.map((st, i) => {
    let v = stepVal(st, u);
    if (i === 2) v *= stepVal(E_BUZZ, u, 1);
    const buzz = 1 - 0.05 * (0.5 + 0.5 * Math.sin(u * 2 * Math.PI * (17 + 5 * i) + i * 1.7)) - 0.05 * hash(Math.floor(u * 60) * 0.73 + i * 11);
    return v * master * buzz;
  });
  const wp = clamp((u - W0) / (W1 - W0));
  const we = 0.45 * wp + 0.55 * (0.5 - 0.5 * Math.cos(Math.PI * wp));
  const S = u < W0 ? 0 : (0.92 + 0.04 * Math.sin(u * 2 * Math.PI * 13)) * master;
  return { L, S, wp, we, bump, master };
};

// ───────────────────────── helpers ─────────────────────────
const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const c2d = (c: HTMLCanvasElement) => c.getContext("2d")!;
const tint = (src: HTMLCanvasElement, col: string) => {
  const c = mk(src.width, src.height), x = c2d(c);
  x.drawImage(src, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = "source-over";
  return c;
};
const erode = (src: HTMLCanvasElement, mask: HTMLCanvasElement, d: number) => {
  const c = mk(src.width, src.height), x = c2d(c);
  x.drawImage(src, 0, 0); x.globalCompositeOperation = "destination-in";
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; x.drawImage(mask, Math.cos(a) * d, Math.sin(a) * d); }
  x.globalCompositeOperation = "source-over";
  return c;
};
/** the part of the mask whose neighbour at (−dx, −dy) is empty: an edge band (a rim light) */
const rim = (mask: HTMLCanvasElement, col: string, dx: number, dy: number) => {
  const c = tint(mask, col), x = c2d(c);
  x.globalCompositeOperation = "destination-out"; x.drawImage(mask, dx, dy);
  x.globalCompositeOperation = "source-over";
  return c;
};
const rrect = (x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, r: number) => {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
};
const ihash = (i: number) => { let v = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b); v ^= v >>> 13; v = Math.imul(v, 0xc2b2ae35); v ^= v >>> 16; return (v >>> 0) / 4294967296; };
const vnoise = (x: number, y: number, seed: number) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash(a * 12.9898 + b * 78.233 + seed * 37.719);
  return lerp(lerp(h(i, j), h(i + 1, j), sx), lerp(h(i, j + 1), h(i + 1, j + 1), sx), sy);
};

// ───────────────────────── cached assets ─────────────────────────
type ScriptA = {
  mask: HTMLCanvasElement; glass: HTMLCanvasElement; lit: HTMLCanvasElement; amber: HTMLCanvasElement; white: HTMLCanvasElement;
  x0: number; y0: number; ww: number; hh: number; ix0: number; ix1: number; tipY: Float32Array; has: Uint8Array; clips: Pt[];
};
type Assets = { letters: Letter[]; cable: Path2D; script: ScriptA; wall: HTMLCanvasElement; wallLit: HTMLCanvasElement };
let assets: Assets | null = null;
let pending: Promise<Assets> | null = null;

const buildScript = (): ScriptA => {
  const fam = `"${SCRIPT_FONT.fontFamily}"`;
  const pr = c2d(mk(8, 8)); pr.font = `100px ${fam}`;
  const m = pr.measureText(SCRIPT_TEXT);
  const inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const k = SCRIPT_W / inkW, fs = 100 * k;
  const asc = m.actualBoundingBoxAscent * k, desc = m.actualBoundingBoxDescent * k, left = m.actualBoundingBoxLeft * k;
  const pad = 30, ww = SCRIPT_W + 2 * pad, hh = asc + desc + 2 * pad;
  const x0 = -ww / 2, y0 = SCRIPT_TOP - pad;
  const mask = mk(ww * SR, hh * SR), x = c2d(mask);
  x.font = `${fs * SR}px ${fam}`; x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineJoin = "round"; x.lineCap = "round";
  x.lineWidth = 8.5 * SR;
  const bx = (pad + left) * SR, by = (pad + asc) * SR;
  x.fillText(SCRIPT_TEXT, bx, by); x.strokeText(SCRIPT_TEXT, bx, by);
  // the tip path: per column, the ink run nearest the previous one (so the hot tip rides the stroke)
  const W = mask.width, H = mask.height, d = x.getImageData(0, 0, W, H).data;
  const tipY = new Float32Array(W), has = new Uint8Array(W), runH = new Float32Array(W);
  let prev = (pad + asc * 0.75) * SR, ix0 = -1, ix1 = -1;
  for (let c = 0; c < W; c++) {
    let best = -1, bestD = 1e9, bh = 0, inRun = false, r0 = 0;
    for (let r = 0; r <= H; r++) {
      const on = r < H && d[(r * W + c) * 4 + 3] > 110;
      if (on && !inRun) { inRun = true; r0 = r; }
      if (!on && inRun) {
        inRun = false; const ctr = (r0 + r) / 2, dd = Math.abs(ctr - prev);
        if (dd < bestD) { bestD = dd; best = ctr; bh = r - r0; }
      }
    }
    if (best >= 0) { prev = best; has[c] = 1; runH[c] = bh; if (ix0 < 0) ix0 = c; ix1 = c; }
    tipY[c] = prev;
  }
  // standoff clips on near-horizontal strokes, spread across the word
  const clips: Pt[] = [];
  for (const f of [0.1, 0.36, 0.62, 0.88]) {
    const tc = Math.round((pad + f * SCRIPT_W) * SR);
    let bc = tc, bv = 1e9;
    for (let c = tc - 30 * SR; c <= tc + 30 * SR; c++) if (c >= 0 && c < W && has[c] && runH[c] < bv) { bv = runH[c]; bc = c; }
    clips.push([x0 + bc / SR, y0 + tipY[bc] / SR]);
  }
  const glass = tint(mask, "rgba(196,186,176,0.96)"), g = c2d(glass);
  const dd = 0.3 * ST * SR;
  g.drawImage(erode(tint(mask, "rgba(70,65,62,0.88)"), mask, 0.17 * ST * SR), 0, 0);
  g.drawImage(rim(erode(mask, mask, 0.1 * ST * SR), "rgba(255,244,230,0.95)", dd * 0.7, dd * 0.7), 0, 0);
  g.drawImage(rim(erode(mask, mask, 0.1 * ST * SR), "rgba(200,145,110,0.4)", -dd * 0.6, -dd * 0.6), 0, 0);
  const lit = tint(mask, "rgb(255,186,120)"), l = c2d(lit);
  l.drawImage(erode(tint(mask, "rgb(255,232,196)"), mask, 0.2 * ST * SR), 0, 0);
  l.drawImage(erode(tint(mask, "rgb(255,252,246)"), mask, 0.34 * ST * SR), 0, 0);
  return {
    mask, glass, lit, amber: tint(mask, "rgb(255,136,52)"), white: tint(mask, "rgb(255,250,240)"),
    x0, y0, ww, hh, ix0: x0 + ix0 / SR, ix1: x0 + ix1 / SR, tipY, has, clips,
  };
};

const LAMP = { x: -540, y: -1350 };
const buildWall = (letters: Letter[], cable: Path2D, sc: ScriptA) => {
  const W = Math.round((WALL.x1 - WALL.x0) * TEX), H = Math.round((WALL.y1 - WALL.y0) * TEX);
  const toTex = (x: CanvasRenderingContext2D) => x.setTransform(TEX, 0, 0, TEX, -WALL.x0 * TEX, -WALL.y0 * TEX);
  const RW = WALL.x1 - WALL.x0, RH = WALL.y1 - WALL.y0;
  const alb = mk(W, H), a = c2d(alb); toTex(a);
  const spec = mk(W, H), s = c2d(spec); toTex(s);
  a.fillStyle = "#3a332e"; a.fillRect(WALL.x0, WALL.y0, RW, RH);
  s.fillStyle = "#000"; s.fillRect(WALL.x0, WALL.y0, RW, RH);
  // mortar: a little sandy noise
  for (let i = 0; i < 9000; i++) {
    const n = i * 1.37;
    a.fillStyle = `rgba(${hash(n) > 0.5 ? "255,240,220" : "0,0,0"},${0.05 + 0.08 * hash(n + 3)})`;
    a.fillRect(WALL.x0 + hash(n + 1) * RW, WALL.y0 + hash(n + 2) * RH, 2 + 3 * hash(n + 4), 2 + 2 * hash(n + 5));
  }
  const r0 = Math.floor(WALL.y0 / CH) - 1, r1 = Math.ceil(WALL.y1 / CH) + 1;
  for (let r = r0; r <= r1; r++) {
    const y = r * CH, off = (r & 1) ? BW / 2 : 0;
    const c0 = Math.floor((WALL.x0 + off) / BW) - 1, c1 = Math.ceil((WALL.x1 + off) / BW) + 1;
    for (let c = c0; c <= c1; c++) {
      const X = c * BW - off, n = r * 97.13 + c * 13.71 + 500;
      const h1 = hash(n), h2 = hash(n + 0.71), h3 = hash(n + 1.37), h4 = hash(n + 2.11);
      let hue = 7 + 13 * h1, sat = 36 + 20 * h2, lig = 22 + 11 * h3;
      if (h4 < 0.08) { lig = 13 + 5 * h3; sat -= 12; } else if (h4 > 0.93) { lig = 32 + 5 * h3; hue += 7; }
      const bx = X + MORT / 2 + (hash(n + 4.4) - 0.5) * 2.2, by = y + MORT / 2 + (hash(n + 5.5) - 0.5) * 1.6;
      const bw = BW - MORT - hash(n + 6.6) * 2.5, bh = CH - MORT - hash(n + 7.7) * 1.8;
      a.fillStyle = `hsl(${hue},${sat}%,${lig}%)`; rrect(a, bx, by, bw, bh, 3.2); a.fill();
      // a burnt end / lighter end on some bricks
      const lg = a.createLinearGradient(bx, 0, bx + bw, 0);
      const e = (hash(n + 8.8) - 0.5) * 0.5;
      lg.addColorStop(0, e > 0 ? `rgba(0,0,0,${e})` : `rgba(255,190,150,${-e * 0.35})`); lg.addColorStop(0.45, "rgba(0,0,0,0)"); lg.addColorStop(1, "rgba(0,0,0,0)");
      a.fillStyle = lg; rrect(a, bx, by, bw, bh, 3.2); a.fill();
      // top edge catches the street light, bottom edge falls into shade
      const g = a.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, "rgba(255,226,196,0.22)"); g.addColorStop(0.2, "rgba(255,226,196,0)"); g.addColorStop(0.7, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.32)");
      a.fillStyle = g; rrect(a, bx, by, bw, bh, 3.2); a.fill();
      // wet gloss: a bright top lip, a few glossy blotches
      s.fillStyle = `rgba(255,255,255,${0.22 + 0.35 * h2})`; s.fillRect(bx + 4, by + 0.6, bw - 8, 1.8);
      for (let q = 0; q < 3; q++) {
        const qx = bx + bw * hash(n + 10 + q), qy = by + bh * (0.2 + 0.6 * hash(n + 20 + q)), qr = 8 + 26 * hash(n + 30 + q);
        const rg = s.createRadialGradient(qx, qy, 0, qx, qy, qr);
        rg.addColorStop(0, `rgba(255,255,255,${0.12 + 0.25 * hash(n + 40 + q)})`); rg.addColorStop(1, "rgba(255,255,255,0)");
        s.save(); rrect(s, bx, by, bw, bh, 3.2); s.clip(); s.fillStyle = rg; s.fillRect(qx - qr, qy - qr, qr * 2, qr * 2); s.restore();
      }
    }
  }
  // per-pixel sand texture + pores
  const img = a.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const v = ihash(i);
    let f = 0.9 + 0.2 * v;
    if (v < 0.006) f = 0.55;
    d[p] = d[p] * f; d[p + 1] = d[p + 1] * f; d[p + 2] = d[p + 2] * f;
  }
  a.putImageData(img, 0, 0);
  // mottling: soft large-scale damp patches
  const mot = mk(110, 126), mx = c2d(mot), mi = mx.createImageData(110, 126);
  for (let i = 0; i < 110 * 126; i++) { const v = hash(i * 3.71 + 9) * 255; mi.data[i * 4] = v; mi.data[i * 4 + 1] = v; mi.data[i * 4 + 2] = v; mi.data[i * 4 + 3] = 255; }
  mx.putImageData(mi, 0, 0);
  a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = "soft-light"; a.globalAlpha = 0.12; a.imageSmoothingQuality = "high";
  a.drawImage(mot, 0, 0, W, H); a.globalCompositeOperation = "source-over"; a.globalAlpha = 1; toTex(a);
  // rain runs: darker wet trails on the albedo, glossy on the spec map
  a.filter = `blur(${2.5 * TEX}px)`; s.filter = `blur(${1.5 * TEX}px)`;
  for (let i = 0; i < 46; i++) {
    const n = i * 7.13 + 77, x = WALL.x0 + hash(n) * RW, y = WALL.y0 + hash(n + 1) * RH, len = 80 + 340 * hash(n + 2), wd = 3 + 9 * hash(n + 3);
    a.fillStyle = `rgba(10,5,3,${0.06 + 0.1 * hash(n + 4)})`; a.fillRect(x, y, wd, len);
    s.fillStyle = `rgba(255,255,255,${0.12 + 0.16 * hash(n + 5)})`; s.fillRect(x + wd * 0.3, y, Math.max(1.5, wd * 0.3), len);
  }
  a.filter = "none"; s.filter = "none";

  // baked street light: albedo × warm lamp falloff + the lamp's wet sheen, then the sign's soft shadows
  const base = mk(W, H), b = c2d(base);
  b.drawImage(alb, 0, 0); toTex(b);
  const lg = b.createRadialGradient(LAMP.x, LAMP.y, 0, LAMP.x, LAMP.y, 2900);
  lg.addColorStop(0, "rgb(255,220,180)"); lg.addColorStop(0.28, "rgb(236,176,130)"); lg.addColorStop(0.5, "rgb(168,116,84)");
  lg.addColorStop(0.68, "rgb(98,68,50)"); lg.addColorStop(0.85, "rgb(50,34,27)"); lg.addColorStop(1, "rgb(28,19,16)");
  b.globalCompositeOperation = "multiply"; b.fillStyle = lg; b.fillRect(WALL.x0, WALL.y0, RW, RH);
  const sl = mk(W, H), slx = c2d(sl); slx.drawImage(spec, 0, 0); toTex(slx);
  slx.globalCompositeOperation = "multiply"; slx.fillStyle = lg; slx.fillRect(WALL.x0, WALL.y0, RW, RH);
  b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = "lighter"; b.globalAlpha = 0.35; b.drawImage(sl, 0, 0);
  b.globalAlpha = 1; b.globalCompositeOperation = "source-over"; toTex(b);
  // shadows (lamp up-left → shadows fall down-right; the tubes stand ~3 cm off the wall)
  b.save(); b.filter = `blur(${4.5 * TEX}px)`; b.translate(9, 15);
  b.strokeStyle = "rgba(8,4,3,0.62)"; b.lineCap = "round"; b.lineJoin = "round"; b.lineWidth = T;
  for (const L of letters) b.stroke(L.p);
  b.lineWidth = 7; b.stroke(cable);
  b.drawImage(tint(sc.mask, "rgba(8,4,3,0.55)"), sc.x0, sc.y0, sc.ww, sc.hh);
  b.restore();
  // wallLit: what the neon light multiplies — a brighter albedo plus the gloss (wet bricks shine in the red)
  const lit = mk(W, H), l = c2d(lit);
  l.drawImage(alb, 0, 0); l.globalCompositeOperation = "lighter"; l.globalAlpha = 0.45; l.drawImage(alb, 0, 0); l.globalAlpha = 1; l.drawImage(spec, 0, 0);
  return { base, lit };
};

type PaveA = { base: HTMLCanvasElement; mask: HTMLCanvasElement };
const paveCache = new Map<number, PaveA>();
/** dark wet asphalt (fine aggregate, a few smooth puddles) + a reflection-strength mask (asphalt dull and mottled, puddles strong) */
const paveFor = (D: number): PaveA => {
  const hit = paveCache.get(D); if (hit) return hit;
  const W = Math.round((PAVE.x1 - PAVE.x0) * PT), H = Math.round(PAVE.depth * PT);
  const base = mk(W, H), b = c2d(base);
  const mask = mk(W / 4, H / 4), m = c2d(mask);
  const pd = b.createImageData(W, H), md = m.createImageData(mask.width, mask.height);
  // ground-plane coordinates: depth z = D / y (1 at the wall), lateral gx = x*z -> puddles flatten with distance
  const puddle = (X: number, Y: number) => {
    const z = D / Y, gx = X * z, gz = Y / D;
    const n = vnoise(gx / 230, gz * 2.4, 3) * 0.7 + vnoise(gx / 80, gz * 7, 7) * 0.3;
    return { z, wet: clamp((n - 0.6) / 0.07) };
  };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = PAVE.x0 + i / PT, Y = D + j / PT;
    const { wet } = puddle(X, Y);
    const g = ihash(i * 7919 + j * 104729), grit = g > 0.93 ? 1.7 : 0.8 + 0.3 * g;   // aggregate specks
    const patch = 0.85 + 0.3 * vnoise(X / 140, Y / 60, 11);
    const v = lerp(10.5 * grit * patch, 6, wet);
    const p = (j * W + i) * 4;
    pd.data[p] = v * 1.08; pd.data[p + 1] = v * 0.92; pd.data[p + 2] = v * 0.84; pd.data[p + 3] = 255;
  }
  b.putImageData(pd, 0, 0);
  for (let j = 0; j < mask.height; j++) for (let i = 0; i < mask.width; i++) {
    const X = PAVE.x0 + (i * 4) / PT, Y = D + (j * 4) / PT;
    const { z, wet } = puddle(X, Y);
    const mottle = 0.55 + 0.45 * (0.6 * vnoise(X / 26, Y / 9, 31) + 0.4 * vnoise(X / 9, Y / 4, 37));   // rough asphalt breaks the light up
    const p = (j * mask.width + i) * 4;
    md.data[p] = 255; md.data[p + 1] = 255; md.data[p + 2] = 255;
    md.data[p + 3] = 255 * clamp(lerp(0.6 * mottle, 1, wet) * (0.65 + 0.35 * z));
  }
  m.putImageData(md, 0, 0);
  // the wall's foot: a dark wet gutter
  b.setTransform(PT, 0, 0, PT, -PAVE.x0 * PT, -D * PT);
  const gg = b.createLinearGradient(0, D, 0, D + 30);
  gg.addColorStop(0, "rgba(0,0,0,0.85)"); gg.addColorStop(1, "rgba(0,0,0,0)");
  b.fillStyle = gg; b.fillRect(PAVE.x0, D, PAVE.x1 - PAVE.x0, 30);
  const out = { base, mask };
  paveCache.set(D, out);
  return out;
};

const prepare = (): Promise<Assets> => {
  if (assets) return Promise.resolve(assets);
  if (pending) return pending;
  pending = (async () => {
    await SCRIPT_FONT.waitUntilDone();
    await document.fonts.load(`100px "${SCRIPT_FONT.fontFamily}"`);
    const letters = mkLetters(), cable = mkCable(), script = buildScript();
    const w = buildWall(letters, cable, script);
    assets = { letters, cable, script, wall: w.base, wallLit: w.lit };
    return assets;
  })();
  return pending;
};

// ───────────────────────── per-size work buffers ─────────────────────────
type Bufs = { glow: HTMLCanvasElement; light: HTMLCanvasElement; bloom: HTMLCanvasElement; tmp: HTMLCanvasElement; q1: HTMLCanvasElement; q2: HTMLCanvasElement; qs: HTMLCanvasElement; stripes: HTMLCanvasElement; sw: HTMLCanvasElement[] };
const bufCache = new Map<string, Bufs>();
const bufsFor = (w: number, h: number, sc: ScriptA): Bufs => {
  const key = `${w}x${h}`; const hit = bufCache.get(key); if (hit) return hit;
  const b: Bufs = {
    glow: mk(w / 4, h / 4), light: mk(w / 4, h / 4), bloom: mk(w / 16, h / 16), tmp: mk(w, h),
    q1: mk(w / 4, h / 4), q2: mk(w / 4, h / 4), qs: mk(w / 4, h / 72), stripes: mk(w / 4, 1),
    sw: [mk(sc.mask.width, sc.mask.height), mk(sc.mask.width, sc.mask.height), mk(sc.mask.width, sc.mask.height)],
  };
  bufCache.set(key, b);
  return b;
};

// ───────────────────────── camera ─────────────────────────
type Cam = { s: number; ox: number; oy: number; D: number; rs: number; tile: boolean };
/** sign extents in world units: tubes x -396..394, cable to 435 -> centre 19.5, half-width 415.5; OPEN top -228.5 */
const SIGN_CX = 19.5;
const GROUND = 660;
const camFor = (u: number, w: number, h: number, full: boolean): Cam => {
  const tile = full && w / h > 0.7;
  const t = clamp((u - U_FULL) / (U_END - U_FULL));
  const push = 0.55 * t + 0.45 * (1 - (1 - t) * (1 - t));      // still moving at the last frame
  const surgePop = 0.01 * Math.exp(-(((u - SURGE - 0.03) / 0.08) ** 2));
  if (!full) {
    const s = (0.54 * w) / 800 * (1 + 0.035 * clamp(u / U_FULL));
    return { s, ox: w / 2 - SIGN_CX * s, oy: h * 0.4, D: GROUND, rs: 0.22, tile };
  }
  if (tile) {
    const s = ((0.78 * w) / 800) * (1 + 0.035 * push + surgePop);
    return { s, ox: w / 2 - SIGN_CX * s, oy: h * 0.29, D: 520, rs: 0.22, tile };
  }
  // max scale 0.78*1.06 -> half-width 415.5*1.116 = 464 px (x 76..1003 at 1080 wide); OPEN top stays below y 400
  const s = ((0.78 * w) / 800) * (1 + 0.05 * push + surgePop);
  return { s, ox: w / 2 - SIGN_CX * s, oy: h * 0.35, D: GROUND, rs: 0.22, tile };
};
const setCam = (x: CanvasRenderingContext2D, c: Cam, q = 1) => x.setTransform(c.s * q, 0, 0, c.s * q, c.ox * q, c.oy * q);
const reset = (x: CanvasRenderingContext2D) => { x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over"; x.filter = "none"; };

// ───────────────────────── frame ─────────────────────────
const RED_GLOW = "rgb(255,22,6)";

const drawFrame = (cv: HTMLCanvasElement, u: number, w: number, h: number, full: boolean) => {
  const A = assets!; const sc = A.script;
  const cam = camFor(u, w, h, full);
  const pave = paveFor(cam.D);
  const B = bufsFor(w, h, sc);
  const lv = levels(u, full);
  const yG = cam.oy + cam.D * cam.s;
  const x = c2d(cv);
  reset(x); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
  x.fillStyle = "#050303"; x.fillRect(0, 0, w, h);

  // ── 1. wall + pavement (street light baked in)
  setCam(x, cam);
  x.drawImage(A.wall, WALL.x0, WALL.y0, WALL.x1 - WALL.x0, WALL.y1 - WALL.y0);
  x.drawImage(pave.base, PAVE.x0, cam.D, PAVE.x1 - PAVE.x0, PAVE.depth);
  // the wall's wet foot (splash zone) and the lit lip of the kerb
  const fz = x.createLinearGradient(0, cam.D - 170, 0, cam.D);
  fz.addColorStop(0, "rgba(4,2,2,0)"); fz.addColorStop(1, "rgba(4,2,2,0.6)");
  x.fillStyle = fz; x.fillRect(WALL.x0, cam.D - 170, WALL.x1 - WALL.x0, 170);
  x.fillStyle = "rgba(255,214,176,0.07)"; x.fillRect(PAVE.x0, cam.D + 1, PAVE.x1 - PAVE.x0, 1.6);

  // ── script write-on state (wiped textures)
  const wx = lerp(sc.ix0 - 12, sc.ix1 + 14, lv.we);
  const writing = lv.S > 0 && lv.wp < 1;
  const toPx = (X: number) => (X - sc.x0) * SR;
  let litS = sc.lit, ambS = sc.amber, hotS: HTMLCanvasElement | null = null;
  if (writing) {
    const [s0, s1, s2] = B.sw;
    const wipe = (dst: HTMLCanvasElement, src: HTMLCanvasElement, a0: number, a1: number, hot: boolean) => {
      const c = c2d(dst); reset(c); c.clearRect(0, 0, dst.width, dst.height); c.drawImage(src, 0, 0);
      c.globalCompositeOperation = "destination-in";
      const g = c.createLinearGradient(toPx(a0), 0, toPx(a1), 0);
      if (hot) { g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.85, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); }
      else { g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)"); }
      c.fillStyle = g; c.fillRect(0, 0, dst.width, dst.height);
      return dst;
    };
    litS = wipe(s0, sc.lit, wx - 10, wx, false);
    ambS = wipe(s1, sc.amber, wx - 10, wx, false);
    hotS = wipe(s2, sc.white, wx - 90, wx + 2, true);
  }
  const sOn = lv.S > 0.001 && (lv.wp > 0);

  // ── 2. neon light spilling onto the bricks (light buffer × wet-brick albedo, added)
  {
    const lc = c2d(B.light), q = B.light.width / w, sp = cam.s * q;
    reset(lc); lc.fillStyle = "#000"; lc.fillRect(0, 0, B.light.width, B.light.height);
    lc.globalCompositeOperation = "lighter"; setCam(lc, cam, q); lc.lineCap = "round"; lc.lineJoin = "round";
    A.letters.forEach((Lt, i) => {
      const L = lv.L[i]; if (L < 0.003) return;
      lc.strokeStyle = "rgb(255,30,10)";
      lc.filter = `blur(${40 * sp}px)`; lc.globalAlpha = clamp(L * 0.7); lc.lineWidth = T * 2.2; lc.stroke(Lt.p);
      lc.filter = `blur(${150 * sp}px)`; lc.globalAlpha = clamp(L * 0.42); lc.lineWidth = T * 5; lc.stroke(Lt.p);
    });
    if (sOn) {
      lc.filter = `blur(${36 * sp}px)`; lc.globalAlpha = clamp(lv.S * 0.75); lc.drawImage(ambS, sc.x0, sc.y0, sc.ww, sc.hh);
      lc.filter = `blur(${130 * sp}px)`; lc.globalAlpha = clamp(lv.S); lc.drawImage(ambS, sc.x0, sc.y0, sc.ww, sc.hh);
    }
    const tc = c2d(B.tmp); reset(tc); tc.fillStyle = "#000"; tc.fillRect(0, 0, w, h);
    setCam(tc, cam); tc.drawImage(A.wallLit, WALL.x0, WALL.y0, WALL.x1 - WALL.x0, WALL.y1 - WALL.y0);
    reset(tc); tc.fillStyle = "#000"; tc.fillRect(0, yG, w, h - yG);
    tc.globalCompositeOperation = "multiply"; tc.drawImage(B.light, 0, 0, w, h);
    reset(x); x.globalCompositeOperation = "lighter"; x.drawImage(B.tmp, 0, 0);
  }

  // ── 3. the sign hardware: standoff discs, cable, unlit glass
  reset(x); setCam(x, cam); x.lineCap = "round"; x.lineJoin = "round";
  const disc = (cx: number, cy: number, r: number) => {
    const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, "#b8b0a6"); g.addColorStop(0.45, "#6b645e"); g.addColorStop(1, "#1d1a18");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  };
  for (const Lt of A.letters) for (const [cx, cy] of Lt.clips) disc(cx, cy, T * 0.78);
  for (const [cx, cy] of sc.clips) disc(cx, cy, ST * 0.95);
  // cable + saddles
  x.strokeStyle = "#0c0a09"; x.lineWidth = 7; x.stroke(A.cable);
  x.save(); x.translate(-1.6, -1.2); x.strokeStyle = "rgba(235,215,195,0.32)"; x.lineWidth = 1.5; x.stroke(A.cable); x.restore();
  for (const y of CABLE_SADDLES) { x.fillStyle = "#575049"; rrect(x, 431 - 9, y - 4, 18, 8, 2.5); x.fill(); x.fillStyle = "rgba(255,240,220,0.35)"; x.fillRect(431 - 8, y - 4, 16, 1.4); }
  // glass tubes (dark grey glass, a lamp specular along the upper-left, a warm bounce underneath)
  for (const Lt of A.letters) {
    x.strokeStyle = "rgba(196,186,176,0.96)"; x.lineWidth = T; x.stroke(Lt.p);
    x.strokeStyle = "rgba(70,65,62,0.88)"; x.lineWidth = 0.66 * T; x.stroke(Lt.p);
    x.save(); x.translate(-0.09 * T, -0.09 * T); x.strokeStyle = "rgba(110,102,96,0.55)"; x.lineWidth = 0.3 * T; x.stroke(Lt.p); x.restore();
    x.save(); x.translate(-0.21 * T, -0.21 * T); x.strokeStyle = "rgba(255,246,234,0.95)"; x.lineWidth = 0.09 * T; x.stroke(Lt.p); x.restore();
    x.save(); x.translate(0.24 * T, 0.24 * T); x.strokeStyle = "rgba(214,150,112,0.45)"; x.lineWidth = 0.07 * T; x.stroke(Lt.p); x.restore();
  }
  x.drawImage(sc.glass, sc.x0, sc.y0, sc.ww, sc.hh);

  // ── 4. lit tubes
  A.letters.forEach((Lt, i) => {
    const L = lv.L[i]; if (L < 0.003) return;
    const a = clamp(L);
    x.globalCompositeOperation = "source-over"; x.globalAlpha = a; x.strokeStyle = "rgb(214,18,8)"; x.lineWidth = T; x.stroke(Lt.p);
    x.globalCompositeOperation = "lighter";
    x.strokeStyle = "rgb(200,22,8)"; x.lineWidth = 0.66 * T; x.stroke(Lt.p);
    x.globalAlpha = clamp(L * L); x.strokeStyle = "rgb(170,74,58)"; x.lineWidth = 0.36 * T; x.stroke(Lt.p);
    x.strokeStyle = "rgb(130,128,118)"; x.lineWidth = 0.13 * T; x.stroke(Lt.p);
    x.save(); x.translate(-0.3 * T, -0.3 * T); x.globalAlpha = 0.22; x.strokeStyle = "rgb(255,220,210)"; x.lineWidth = 0.07 * T; x.stroke(Lt.p); x.restore();
    x.globalAlpha = 1;
  });
  x.globalCompositeOperation = "source-over";
  if (sOn) {
    x.globalAlpha = clamp(lv.S); x.drawImage(litS, sc.x0, sc.y0, sc.ww, sc.hh);
    x.globalCompositeOperation = "lighter"; x.globalAlpha = clamp(lv.S - 1); x.drawImage(litS, sc.x0, sc.y0, sc.ww, sc.hh);
    if (hotS) { x.globalAlpha = 1; x.drawImage(hotS, sc.x0, sc.y0, sc.ww, sc.hh); x.drawImage(hotS, sc.x0, sc.y0, sc.ww, sc.hh); }
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
  }

  // ── 5. hardware in front of the glass: blackout ends + electrode boots, standoff clips
  for (const Lt of A.letters) {
    for (const [ex, ey, dx, dy] of Lt.ends) {
      x.lineCap = "round";
      x.strokeStyle = "#110d0c"; x.lineWidth = T * 1.0;
      x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex + dx * 22, ey + dy * 22); x.stroke();
      x.strokeStyle = "rgba(255,240,226,0.4)"; x.lineWidth = 0.08 * T;
      x.beginPath(); x.moveTo(ex - 0.2 * T, ey - 0.2 * T); x.lineTo(ex - 0.2 * T + dx * 22, ey - 0.2 * T + dy * 22); x.stroke();
    }
    x.lineCap = "round";
    for (const [cx, cy, dx, dy] of Lt.clips) {
      x.save(); x.translate(cx, cy); x.rotate(Math.atan2(dy, dx));
      x.fillStyle = "#26211f"; rrect(x, -3.6, -T * 0.66, 7.2, T * 1.32, 2); x.fill();
      x.fillStyle = "rgba(240,224,206,0.5)"; x.fillRect(-3.6, -T * 0.66, 1.6, T * 1.32);
      x.restore();
    }
  }
  for (const [cx, cy] of sc.clips) {
    x.fillStyle = "#26211f"; rrect(x, cx - 2.8, cy - ST * 0.75, 5.6, ST * 1.5, 1.6); x.fill();
    x.fillStyle = "rgba(240,224,206,0.5)"; x.fillRect(cx - 2.8, cy - ST * 0.75, 1.3, ST * 1.5);
  }

  // ── 6. halo (low-res, additive) + white-hot tip
  const tipOn = writing ? 1 : clamp(1 - (u - W1) / 0.06) * (u > W0 ? 1 : 0);
  const tipCol = Math.round(clamp(toPx(wx), 0, sc.mask.width - 1));
  const tipX = wx, tipY = sc.y0 + sc.tipY[tipCol] / SR;
  const tipA = tipOn * (sc.has[tipCol] ? 1 : 0.35);
  {
    const gc = c2d(B.glow), q = B.glow.width / w, sp = cam.s * q;
    reset(gc); gc.fillStyle = "#000"; gc.fillRect(0, 0, B.glow.width, B.glow.height);
    gc.globalCompositeOperation = "lighter"; setCam(gc, cam, q); gc.lineCap = "round"; gc.lineJoin = "round";
    A.letters.forEach((Lt, i) => {
      const L = lv.L[i]; if (L < 0.003) return;
      gc.strokeStyle = RED_GLOW;
      gc.filter = `blur(${T * 0.5 * sp}px)`; gc.globalAlpha = clamp(L * 0.8); gc.lineWidth = T * 1.2; gc.stroke(Lt.p);
      gc.filter = `blur(${T * 2.2 * sp}px)`; gc.globalAlpha = clamp(L * 0.5); gc.lineWidth = T * 1.6; gc.stroke(Lt.p);
      if (L > 1) { gc.filter = `blur(${T * 1.0 * sp}px)`; gc.globalAlpha = clamp(L - 1); gc.lineWidth = T * 1.4; gc.stroke(Lt.p); }
    });
    if (sOn) {
      gc.filter = `blur(${ST * 0.7 * sp}px)`; gc.globalAlpha = clamp(lv.S * 0.75); gc.drawImage(ambS, sc.x0, sc.y0, sc.ww, sc.hh);
      gc.filter = `blur(${ST * 2.8 * sp}px)`; gc.globalAlpha = clamp(lv.S * 0.45); gc.drawImage(ambS, sc.x0, sc.y0, sc.ww, sc.hh);
    }
    if (tipA > 0.01) {
      gc.filter = "none"; gc.globalAlpha = tipA;
      const fg = gc.createRadialGradient(tipX, tipY, 0, tipX, tipY, 130);
      fg.addColorStop(0, "rgba(255,240,220,1)"); fg.addColorStop(0.25, "rgba(255,190,120,0.55)"); fg.addColorStop(1, "rgba(255,140,60,0)");
      gc.fillStyle = fg; gc.fillRect(tipX - 130, tipY - 130, 260, 260);
    }
    reset(x); x.globalCompositeOperation = "lighter"; x.globalAlpha = 1; x.drawImage(B.glow, 0, 0, w, h);
    // wide bloom (more on the surge)
    const bc = c2d(B.bloom); reset(bc); bc.clearRect(0, 0, B.bloom.width, B.bloom.height);
    bc.filter = `blur(${Math.max(1, B.bloom.width / 60)}px)`; bc.drawImage(B.glow, 0, 0, B.bloom.width, B.bloom.height);
    x.globalAlpha = clamp(0.3 + 1.1 * lv.bump); x.drawImage(B.bloom, 0, 0, w, h);
    if (lv.bump > 0.5) { x.globalAlpha = clamp(lv.bump - 0.5); x.drawImage(B.bloom, 0, 0, w, h); }
    x.globalAlpha = 1;
  }
  if (tipA > 0.01) {
    setCam(x, cam); x.globalCompositeOperation = "lighter"; x.globalAlpha = tipA;
    const tg = x.createRadialGradient(tipX, tipY, 0, tipX, tipY, 26);
    tg.addColorStop(0, "rgba(255,255,255,1)"); tg.addColorStop(0.35, "rgba(255,246,230,0.9)"); tg.addColorStop(1, "rgba(255,200,140,0)");
    x.fillStyle = tg; x.fillRect(tipX - 26, tipY - 26, 52, 52);
    // anamorphic streak
    x.save(); x.translate(tipX, tipY); x.scale(1, 0.05);
    const sg = x.createRadialGradient(0, 0, 0, 0, 0, 190);
    sg.addColorStop(0, "rgba(255,230,200,0.85)"); sg.addColorStop(1, "rgba(255,170,90,0)");
    x.fillStyle = sg; x.fillRect(-190, -190, 380, 380); x.restore();
    // sparks shed behind the tip
    for (let k = 0; k < 7; k++) {
      const age = ((u * 9 + hash(k * 3.1) ) % 1);
      const sx = tipX - age * 40 - 8 * hash(k + 0.3), sy = tipY + (hash(k * 5.7) - 0.5) * 30 * age + 40 * age * age;
      x.globalAlpha = tipA * (1 - age) * 0.9; x.fillStyle = "rgb(255,236,210)";
      x.beginPath(); x.arc(sx, sy, 1.8 * (1 - age) + 0.6, 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
  }

  // ── 7. wet asphalt: the lights alone (no bricks), mirrored hard toward the wall line, smeared into vertical
  //       streaks, shimmering, broken up by the asphalt, strongest in the puddles, kept dim
  {
    const k = B.q1.width / w, rw = B.q1.width, rh = B.q1.height, sp = cam.s * k;
    const c1 = c2d(B.q1), c2 = c2d(B.q2), cs = c2d(B.qs);
    // a) light sources only: the halo buffer + crisp tube cores
    reset(c1); c1.fillStyle = "#000"; c1.fillRect(0, 0, rw, rh);
    c1.globalCompositeOperation = "lighter"; c1.drawImage(B.glow, 0, 0, rw, rh);
    setCam(c1, cam, k); c1.lineCap = "round"; c1.lineJoin = "round"; c1.filter = `blur(${Math.max(0.5, T * 0.35 * sp)}px)`;
    A.letters.forEach((Lt, i) => { const L = lv.L[i]; if (L < 0.003) return; c1.globalAlpha = clamp(L); c1.strokeStyle = "rgb(255,40,16)"; c1.lineWidth = T; c1.stroke(Lt.p); });
    if (sOn) { c1.globalAlpha = clamp(lv.S); c1.drawImage(litS, sc.x0, sc.y0, sc.ww, sc.hh); }
    // b) mirror about the wall line, squashed (rs << 1) so it lands just in front of the wall
    reset(c2); c2.fillStyle = "#000"; c2.fillRect(0, 0, rw, rh);
    const yk = yG * k;
    c2.save(); c2.beginPath(); c2.rect(0, yk, rw, rh - yk); c2.clip();
    c2.setTransform(1, 0, 0, -cam.rs, 0, yk * (1 + cam.rs)); c2.drawImage(B.q1, 0, 0); c2.restore();
    // c) vertical smear: squash to a few rows and back (blurs only vertically), then long tails toward the camera
    reset(cs); cs.imageSmoothingQuality = "high"; cs.drawImage(B.q2, 0, 0, rw, B.qs.height);
    reset(c1); c1.fillStyle = "#000"; c1.fillRect(0, 0, rw, rh); c1.imageSmoothingQuality = "high";
    c1.globalCompositeOperation = "lighter";
    const tail = rh / 30;
    for (let j = 0; j < 8; j++) { c1.globalAlpha = 0.75 * Math.pow(0.76, j); c1.drawImage(B.qs, 0, j * tail - tail * 0.8, rw, rh); }
    // d) shimmer: rows wobble sideways (ripples), stronger toward the camera
    reset(c2); c2.fillStyle = "#000"; c2.fillRect(0, 0, rw, rh);
    const hz = cam.oy * k, y0 = Math.floor(yk);
    for (let yy = y0; yy < rh; yy++) {
      const z = (yk - hz) / Math.max(1, yy + 1 - hz);
      const amp = (0.5 + 0.9 / z) * (w / 1080) * (cam.tile ? 0.6 : 1);
      const dx = amp * (Math.sin(z * 90 + u * 7.3) * 0.6 + Math.sin(z * 37 - u * 4.1 + 1.3) * 0.4) + (hash(yy * 0.37 + Math.floor(u * 24) * 1.9) - 0.5) * amp * 0.8;
      c2.drawImage(B.q1, 0, yy, rw, 1, dx, yy, rw, 1);
    }
    // e) horizontal break-up: soft vertical bands that drift (wet asphalt never mirrors evenly)
    const st = c2d(B.stripes), sd = st.createImageData(rw, 1);
    for (let i = 0; i < rw; i++) {
      const X = (i / k - cam.ox) / cam.s + 4 * Math.sin(u * 3.1);
      const n = 0.55 * vnoise(X / 16, 0.5, 21) + 0.45 * vnoise(X / 45 + u * 0.4, 1.5, 22);
      sd.data[i * 4] = 255; sd.data[i * 4 + 1] = 255; sd.data[i * 4 + 2] = 255; sd.data[i * 4 + 3] = 255 * (0.55 + 0.45 * clamp((n - 0.3) / 0.4));
    }
    st.putImageData(sd, 0, 0);
    reset(c1); c1.clearRect(0, 0, rw, rh); c1.drawImage(B.q2, 0, 0);
    c1.globalCompositeOperation = "destination-in"; c1.drawImage(B.stripes, 0, 0, rw, rh);
    reset(c1); c1.globalCompositeOperation = "destination-in"; setCam(c1, cam, k);
    c1.drawImage(pave.mask, PAVE.x0, cam.D, PAVE.x1 - PAVE.x0, PAVE.depth);
    reset(x); x.save(); x.beginPath(); x.rect(0, yG, w, h - yG); x.clip();
    x.globalCompositeOperation = "lighter"; x.globalAlpha = 1; x.drawImage(B.q1, 0, 0, w, h); x.globalAlpha = cam.tile ? 0.5 : 0.35; x.drawImage(B.q1, 0, 0, w, h);
    // a little direct light on the asphalt at the wall's foot
    const Lm = (lv.L[0] + lv.L[1] + lv.L[2] + lv.L[3]) / 4;
    x.setTransform(1, 0, 0, 0.12, 0, yG * 0.88); x.globalAlpha = clamp(0.2 * Lm + 0.12 * lv.S * lv.wp);
    const gx = cam.ox + SIGN_CX * cam.s, gr = 460 * cam.s;
    const fg = x.createRadialGradient(gx, yG, 0, gx, yG, gr);
    fg.addColorStop(0, "rgba(255,60,24,0.9)"); fg.addColorStop(1, "rgba(255,40,16,0)");
    x.fillStyle = fg; x.fillRect(gx - gr, yG - gr, gr * 2, gr * 2);
    x.restore(); reset(x);
  }

  // light field for rain + ripples (screen space)
  const lightAt = (X: number, Y: number) => {
    let r = 0.05, g = 0.035, b = 0.025;
    const Yw = Y > yG ? yG - (Y - yG) / cam.rs : Y;
    A.letters.forEach((Lt, i) => {
      const L = lv.L[i]; if (L < 0.003) return;
      const dx = (X - (cam.ox + Lt.c[0] * cam.s)) / (200 * cam.s), dy = (Yw - (cam.oy + Lt.c[1] * cam.s)) / (240 * cam.s);
      const e = L * Math.exp(-(dx * dx + dy * dy)); r += e; g += e * 0.16; b += e * 0.07;
    });
    if (sOn) {
      const cx = cam.ox + lerp(sc.ix0, Math.min(wx, sc.ix1), 0.5) * cam.s, frac = clamp((wx - sc.ix0) / (sc.ix1 - sc.ix0));
      const dx = (X - cx) / ((120 + 260 * frac) * cam.s), dy = (Yw - (cam.oy + 135 * cam.s)) / (150 * cam.s);
      const e = lv.S * frac * Math.exp(-(dx * dx + dy * dy)); r += e; g += e * 0.75; b += e * 0.5;
    }
    return [r, g, b];
  };

  // ── 8. rain: streaks only show where the light catches them; ripple rings on the puddles
  reset(x); x.globalCompositeOperation = "lighter"; x.lineCap = "round";
  const sx = w / 1080;
  const rainAmt = full ? lerp(0.75, 1.15, clamp((u - SURGE) / 0.15)) : 0.55;
  const NR = cam.tile ? 80 : full ? 260 : 110;
  for (let i = 0; i < NR; i++) {
    const dep = hash(i * 1.31 + 0.2);
    const speed = (1.6 + 2.4 * dep) * h, len = (0.02 + 0.05 * dep) * h * (full ? 1 : 0.8);
    const span = h + len * 2;
    const yH = ((hash(i * 7.7) * span + u * speed) % span) - len;
    const xH = hash(i * 3.3) * w * 1.2 - w * 0.1 + yH * 0.1;
    const xT = xH - len * 0.1, yT = yH - len;
    const [r, g, b] = lightAt(xH, yH - len * 0.5);
    const m = Math.max(r, g, b);
    const a = clamp((0.035 + 1.9 * m) * (0.3 + 0.7 * dep) * rainAmt);
    if (a < 0.01) continue;
    const n = 1 / Math.max(0.001, m);
    const col = `${Math.round(255 * clamp(r * n))},${Math.round(255 * clamp(0.25 + g * n * 0.8))},${Math.round(255 * clamp(0.2 + b * n * 0.8))}`;
    const lg = x.createLinearGradient(xT, yT, xH, yH);
    lg.addColorStop(0, `rgba(${col},0)`); lg.addColorStop(1, `rgba(${col},${a})`);
    x.strokeStyle = lg; x.lineWidth = (0.9 + 2.6 * dep * dep) * sx * (cam.tile ? 1.3 : 1);
    x.beginPath(); x.moveTo(xT, yT); x.lineTo(xH, yH); x.stroke();
  }
  // ripple rings
  const NRing = cam.tile ? 10 : 22;
  for (let i = 0; i < NRing; i++) {
    const P = 0.45 + 0.4 * hash(i * 2.9);
    const tt = u / P + hash(i * 4.1), cyc = Math.floor(tt), age = tt - cyc;
    const rx0 = hash(i * 13.1 + cyc * 7.3), ry0 = hash(i * 5.7 + cyc * 3.9);
    const Y = yG + (0.04 + 0.96 * ry0 * ry0) * (h - yG), X = rx0 * w;
    const z = (yG - cam.oy) / Math.max(1, Y - cam.oy);
    const R = (6 + 34 * age) * sx / z * 0.6;
    const [r, g, b] = lightAt(X, Y);
    const m = Math.max(r, g, b), a = clamp((0.1 + 1.4 * m) * (1 - age) * 0.6);
    if (a < 0.01) continue;
    x.strokeStyle = `rgba(${Math.round(255 * clamp(r / m))},${Math.round(255 * clamp(0.3 + g / m * 0.7))},${Math.round(255 * clamp(0.25 + b / m * 0.7))},${a})`;
    x.lineWidth = 1.2 * sx;
    x.beginPath(); x.ellipse(X, Y, R, R * 0.22 * (0.4 + 0.6 / Math.max(0.4, 1 / z)), 0, 0, Math.PI * 2); x.stroke();
  }

  // ── 9. grade: vignette
  reset(x);
  const vg = x.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.3, w / 2, h * 0.45, Math.max(w, h) * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.5)");
  x.fillStyle = vg; x.fillRect(0, 0, w, h);
  // in the card, the render develops through a sparse dot matrix: expose it brighter while the dots are small
  if (!full) {
    const boost = 1.05 * (1 - clamp((u - 0.02) / 0.26)) ** 1.5;
    if (boost > 0.005) {
      const tc = c2d(B.tmp); reset(tc); tc.drawImage(cv, 0, 0);
      x.globalCompositeOperation = "lighter";
      for (let k = boost; k > 0.005; k -= 1) { x.globalAlpha = Math.min(1, k); x.drawImage(B.tmp, 0, 0); }
      reset(x);
    }
  }
};

export const Neon: React.FC<StyleProps> = ({ u, w, h, full }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(!!assets);
  const [handle] = useState(() => (assets ? null : delayRender("neon assets")));
  useEffect(() => {
    if (ready) return;
    let on = true;
    prepare().then(() => { if (on) setReady(true); if (handle !== null) continueRender(handle); });
    return () => { on = false; };
  }, []);
  const W = Math.round(w), H = Math.round(h);
  useLayoutEffect(() => {
    if (!ready || !ref.current) return;
    drawFrame(ref.current, u, W, H, full);
  });
  return <canvas ref={ref} width={W} height={H} style={{ width: w, height: h, display: "block" }} />;
};
