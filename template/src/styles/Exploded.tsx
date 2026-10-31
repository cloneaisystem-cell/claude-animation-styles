// /exploded — "pulled apart, every part named": a 35 mm rangefinder (black leatherette, brushed-chrome top plate,
// shutter-speed dial, advance lever, rewind knob, knurled lens with coated glass) turns in 3/4 in a graphite studio,
// then pulls apart into six evenly spaced layers along its vertical axis. Hard cut to a higher angle: numbered labels
// with thin leader lines pop in one after another while the film strip unrolls from its canister.
// Pure function of u (seconds since the card appeared). Built from three.js primitives, no models, no logos.
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import type { StyleProps } from "../types";
import { backOut, clamp, easeInOut, easeOut, hash, lerp } from "../theme";
import { U_END, U_FULL } from "../timing";

const MONO_F = loadMono("normal", { weights: ["500", "700"], subsets: ["latin"] });
const INTER_F = loadInter("normal", { weights: ["500", "600", "800"], subsets: ["latin"] });
const MONO = MONO_F.fontFamily;
const SANS = INTER_F.fontFamily;

// ───────────────────────────── timeline (pure) ─────────────────────────────
const fullT = (u: number) => clamp((u - U_FULL) / (U_END - U_FULL));
/** order: 0 top plate · 1 lens · 2 shutter · 3 body · 4 film · 5 back door */
const BB: [number, number][] = [[1.0, 0.42], [0.32, -0.6], [0.48, -0.68], [0.6, -0.72], [0.29, -0.47], [0.4, -0.58]];
const HSUM = BB.reduce((a, [t, b]) => a + t - b, 0);
const ASM_C = (1.0 - 0.72) / 2; // assembled vertical centre
const EX_START = [0.28, 0.37, 0.43, 0.32, 0.4, 0.3];
const EX_DUR = 0.36;
const backOutS = (x: number, s = 1.25) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const t = x - 1;
  return 1 + (s + 1) * t * t * t + s * t * t;
};
const gapAt = (u: number, full: boolean) => (full ? 0.38 + 0.03 * easeOut(clamp((u - U_FULL) / 0.5)) + 0.03 * fullT(u) : 0.3);
const offsets = (g: number) => {
  let top = (HSUM + 5 * g) / 2;
  return BB.map(([t, b]) => {
    const o = top - t;
    top -= t - b + g;
    return o;
  });
};
const explodeP = (i: number, u: number, full: boolean) => (full ? 1 : backOutS((u - EX_START[i]) / EX_DUR));
const partDY = (u: number, full: boolean) => {
  const off = offsets(gapAt(u, full));
  // after the cut the layers float: a slow bob, each layer on its own phase
  return off.map((o, i) => o * explodeP(i, u, full) + (full ? 0.05 * Math.sin(2 * Math.PI * 0.55 * (u - U_FULL) + i * 1.3) : 0));
};
/** after the cut each layer also sways a little about the stack axis, on its own phase (labels follow) */
const layerWob = (i: number, u: number, full: boolean) => (full ? 0.06 * Math.sin(2 * Math.PI * 0.42 * (u - U_FULL) + i * 1.7 + 0.6) - 0.06 * Math.sin(i * 1.7 + 0.6) : 0);
const modelYaw = (u: number, full: boolean) => (full ? lerp(-0.82, -0.9, fullT(u)) : lerp(-0.42, -0.72, clamp(u / U_FULL)));

type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
const camPose = (u: number, aspect: number, full: boolean): Pose => {
  if (!full) {
    const k = easeInOut(clamp((u - 0.2) / 0.44));
    const pre = Math.sin(Math.PI * clamp(u / 0.3)) * 0.35; // small push-in before the pull-back
    const d = lerp(12.6, 16.8, k) - pre;
    const el = lerp(0.09, 0.15, clamp(u / U_FULL));
    const ty = lerp(ASM_C, 0, k);
    const look = new THREE.Vector3(0, ty, 0);
    return { pos: new THREE.Vector3(0, ty + d * Math.sin(el), d * Math.cos(el)), look, fov: 28 };
  }
  // after the cut: a slow, constant-speed orbit (~9°) + push-in (~7 %) through the whole hold, so every frame moves.
  // Full screen keeps the stack + labels inside the IG safe area (y 260–1450, x ≤ 900 at 1080×1920).
  const t = fullT(u);
  const fov = 26;
  const tile = aspect > 0.7;
  const d = tile ? lerp(21.8, 20.8, t) : lerp(32, 29.8, t);
  const el = lerp(0.42, 0.47, t);
  const az = lerp(-0.08, 0.08, t);
  const visW = 2 * d * Math.tan((fov * Math.PI) / 360) * aspect;
  const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
  const look = new THREE.Vector3(0, tile ? -0.12 : -0.76, 0).addScaledVector(right, visW * (tile ? 0.1 : 0.21));
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  return { pos: look.clone().addScaledVector(dir, d), look, fov };
};
const makeCam = (p: Pose, aspect: number) => {
  const c = new THREE.PerspectiveCamera(p.fov, aspect, 0.5, 120);
  c.position.copy(p.pos);
  c.up.set(0, 1, 0);
  c.lookAt(p.look);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
};
/** label anchors (assembled local coords), at the right-hand end of each part */
const ANCHOR: [number, number, number][] = [[1.41, 0.62, 0.0], [0.43, -0.1, 0.62], [0.58, -0.1, 0.17], [1.39, -0.15, 0.0], [1.1, -0.12, -0.23], [1.41, -0.1, -0.1]];
const anchorWorld = (i: number, u: number, full: boolean) => {
  const dy = partDY(u, full)[i];
  const [x, y, z] = ANCHOR[i];
  const Y = new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(x, y + dy, z).applyAxisAngle(Y, layerWob(i, u, full)).applyAxisAngle(Y, modelYaw(u, full));
};
const filmLen = (u: number, full: boolean) => (full ? 0.34 + 2.7 * easeInOut(clamp((u - 1.2) / 0.8)) : 0.34);
const irisA = (u: number) => {
  const t = u - 1.74;
  if (t < 0) return 0.12;
  if (t < 0.07) return lerp(0.12, 0.21, easeOut(t / 0.07));
  if (t < 0.13) return 0.21;
  return lerp(0.21, 0.12, easeInOut(clamp((t - 0.13) / 0.14)));
};

// ───────────────────────────── canvases (module cache) ─────────────────────────────
const mk = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
};
type Cvs = { leather: HTMLCanvasElement; brushed: HTMLCanvasElement; knurl: HTMLCanvasElement; diamond: HTMLCanvasElement; dial: HTMLCanvasElement; aperture: HTMLCanvasElement; scale: HTMLCanvasElement; can: HTMLCanvasElement; film: HTMLCanvasElement };
let CVS: Cvs | null = null;
const makeCanvases = (): Cvs => {
  if (CVS) return CVS;
  // leatherette: pebbled height field (tileable)
  const [raw, r] = mk(512, 512);
  r.fillStyle = "#6e6e6e";
  r.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const x = hash(i * 1.37 + 0.5) * 512, y = hash(i * 2.71 + 9.1) * 512, rad = 2.4 + hash(i * 0.93 + 4.4) * 4.2;
    const g = Math.round(105 + hash(i * 3.17 + 1.3) * 130);
    r.fillStyle = `rgb(${g},${g},${g})`;
    for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
      const px = x + dx, py = y + dy;
      if (px < -10 || px > 522 || py < -10 || py > 522) continue;
      r.beginPath();
      r.arc(px, py, rad, 0, Math.PI * 2);
      r.fill();
    }
  }
  const [leather, l] = mk(512, 512);
  l.filter = "blur(1.4px)";
  l.drawImage(raw, 0, 0);
  // brushed metal roughness: fine streaks along u
  const [brushed, b] = mk(1024, 256);
  for (let y = 0; y < 256; y++) {
    const g = Math.round(128 + (hash(y * 1.13 + 0.7) - 0.5) * 60 + (hash(Math.floor(y / 4) * 2.3) - 0.5) * 40);
    b.fillStyle = `rgb(${g},${g},${g})`;
    b.fillRect(0, y, 1024, 1);
  }
  for (let i = 0; i < 1400; i++) {
    const g = Math.round(90 + hash(i * 5.3) * 120);
    b.fillStyle = `rgba(${g},${g},${g},0.35)`;
    b.fillRect(hash(i * 1.9) * 1024, Math.floor(hash(i * 7.1) * 256), 40 + hash(i * 3.3) * 300, 1);
  }
  // straight knurl (ridges along v), 32 per tile
  const [knurl, k] = mk(512, 8);
  for (let x = 0; x < 512; x++) {
    const v = Math.pow(0.5 + 0.5 * Math.cos((2 * Math.PI * x) / 16), 0.7);
    const g = Math.round(v * 255);
    k.fillStyle = `rgb(${g},${g},${g})`;
    k.fillRect(x, 0, 1, 8);
  }
  // diamond knurl
  const [diamond, dm] = mk(256, 256);
  const id = dm.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = Math.abs(Math.sin((Math.PI * (x + y)) / 16)), c = Math.abs(Math.sin((Math.PI * (x - y)) / 16));
    const v = Math.round(255 * Math.min(a, c));
    const o = (y * 256 + x) * 4;
    id.data[o] = id.data[o + 1] = id.data[o + 2] = v;
    id.data[o + 3] = 255;
  }
  dm.putImageData(id, 0, 0);
  // shutter-speed dial top: engraved numbers on brushed chrome (map multiplies a white chrome)
  const [dial, d] = mk(512, 512);
  for (let i = 0; i < 60; i++) {
    const g = Math.round(222 + (hash(i * 4.1) - 0.5) * 26);
    d.strokeStyle = `rgb(${g},${g},${g})`;
    d.lineWidth = 4.5;
    d.beginPath();
    d.arc(256, 256, 4 + i * 4.3, 0, Math.PI * 2);
    d.stroke();
  }
  const speeds = ["B", "1", "2", "4", "8", "15", "30", "60", "125", "250", "500", "1000"];
  d.fillStyle = "#121212";
  d.font = `600 40px ${SANS}`;
  d.textAlign = "center";
  d.textBaseline = "middle";
  speeds.forEach((s, i) => {
    const a = -Math.PI / 2 + (i / speeds.length) * Math.PI * 2;
    d.save();
    d.translate(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186);
    d.rotate(a + Math.PI / 2);
    d.fillText(s, 0, 0);
    d.restore();
    const a2 = a + Math.PI / speeds.length;
    d.fillRect(256 + Math.cos(a2) * 222 - 3, 256 + Math.sin(a2) * 222 - 3, 6, 6);
  });
  d.lineWidth = 3;
  d.strokeStyle = "#1a1a1a";
  d.beginPath();
  d.arc(256, 256, 132, 0, Math.PI * 2);
  d.stroke();
  // aperture ring: white numbers on black
  const [aperture, ap] = mk(2048, 128);
  ap.fillStyle = "#0d0d0e";
  ap.fillRect(0, 0, 2048, 128);
  ap.fillStyle = "#EDEAE4";
  ap.font = `600 54px ${SANS}`;
  ap.textAlign = "center";
  ap.textBaseline = "middle";
  const fstops = ["16", "11", "8", "5.6", "4", "2.8", "2"];
  for (const off of [0, 1024]) fstops.forEach((s, i) => ap.fillText(s, off + 200 + i * 110, 64));
  // focus scale ring: black engraving on chrome
  const [scale, sc] = mk(2048, 128);
  sc.fillStyle = "#e4e4e4";
  sc.fillRect(0, 0, 2048, 128);
  sc.fillStyle = "#151515";
  sc.font = `600 50px ${SANS}`;
  sc.textAlign = "center";
  sc.textBaseline = "middle";
  const dist = ["∞", "10", "5", "3", "2", "1.5", "1", "0.7"];
  for (const off of [0, 1024]) dist.forEach((s, i) => sc.fillText(s, off + 160 + i * 104, 64));
  // film canister: cream with "36" only
  const [can, cn] = mk(1024, 512);
  cn.fillStyle = "#ECE2C8";
  cn.fillRect(0, 0, 1024, 512);
  cn.fillStyle = "#141414";
  cn.fillRect(0, 0, 1024, 34);
  cn.fillRect(0, 478, 1024, 34);
  cn.fillRect(0, 52, 1024, 6);
  cn.fillRect(0, 454, 1024, 6);
  cn.font = `800 230px ${SANS}`;
  cn.textAlign = "center";
  cn.textBaseline = "middle";
  for (const x of [171, 512, 853]) cn.fillText("36", x, 270);
  // film strip: one frame pitch per tile (u), the 35 mm width (v); perforations are transparent
  const [film, f] = mk(1024, 256);
  f.fillStyle = "#B8601E";
  f.fillRect(0, 0, 1024, 256);
  const fw = 1024 * (36 / 38), fh = 256 * (24 / 35), fx = (1024 - fw) / 2, fy = (256 - fh) / 2;
  const grd = f.createLinearGradient(fx, fy, fx + fw, fy + fh);
  grd.addColorStop(0, "#7A3510");
  grd.addColorStop(0.5, "#5E270B");
  grd.addColorStop(1, "#83400F");
  f.fillStyle = grd;
  f.beginPath();
  f.roundRect(fx, fy, fw, fh, 10);
  f.fill();
  for (let i = 0; i < 5; i++) {
    const g2 = f.createRadialGradient(fx + fw * (0.2 + 0.6 * hash(i * 3.7)), fy + fh * (0.3 + 0.4 * hash(i * 5.9)), 2, fx + fw * 0.5, fy + fh * 0.5, fw * 0.35);
    g2.addColorStop(0, "rgba(214,140,70,0.55)");
    g2.addColorStop(1, "rgba(214,140,70,0)");
    f.fillStyle = g2;
    f.fillRect(fx, fy, fw, fh);
  }
  f.globalCompositeOperation = "destination-out";
  const pp = 1024 / 8, pw = pp * (2.8 / 4.75), ph = 256 * (1.98 / 35), pm = 256 * (2.0 / 35);
  for (let i = 0; i < 8; i++) for (const y of [pm, 256 - pm - ph]) {
    f.beginPath();
    f.roundRect(i * pp + (pp - pw) / 2, y, pw, ph, 5);
    f.fill();
  }
  f.globalCompositeOperation = "source-over";
  CVS = { leather, brushed, knurl, diamond, dial, aperture, scale, can, film };
  return CVS;
};

let READY = false;
let pending: Promise<void> | null = null;
const prepare = () => {
  if (READY) return Promise.resolve();
  if (!pending) pending = Promise.all([MONO_F.waitUntilDone(), INTER_F.waitUntilDone()]).then(() => {
    makeCanvases();
    READY = true;
  });
  return pending;
};

// ───────────────────────────── geometry (module cache) ─────────────────────────────
const rrect = (w: number, h: number, r: number, cx = 0, cy = 0) => {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
};
const holePath = (r: number, cx = 0, cy = 0) => {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
};
const disc = (r: number) => {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
};
const annulus = (ro: number, ri: number) => {
  const s = disc(ro);
  s.holes.push(holePath(ri));
  return s;
};
/** shape in the xz footprint (shape y = −z), extruded up from y0 */
const extrudeUp = (shape: THREE.Shape, y0: number, hgt: number, bev: number, seg = 32) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, hgt - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 5, curveSegments: seg });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0 + bev, 0);
  return g;
};
/** shape in xy, extruded along +z from z0 */
const extrudeZ = (shape: THREE.Shape, z0: number, dep: number, bev: number, seg = 64) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, dep - 2 * bev), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 4, curveSegments: seg });
  g.translate(0, 0, z0 + bev);
  return g;
};
/** cylinder along z (front radius rf at z1) */
const zcyl = (rf: number, rb: number, z0: number, z1: number, seg = 96, open = false) => {
  const g = new THREE.CylinderGeometry(rf, rb, z1 - z0, seg, 1, open);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
};
const ycyl = (r: number, y0: number, y1: number, seg = 64, open = false) => {
  const g = new THREE.CylinderGeometry(r, r, y1 - y0, seg, 1, open);
  g.translate(0, (y0 + y1) / 2, 0);
  return g;
};
const capZ = (R: number, rc: number, zBase: number) => {
  const th = Math.asin(rc / R);
  const g = new THREE.SphereGeometry(R, 72, 18, 0, Math.PI * 2, 0, th);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, zBase - R * Math.cos(th));
  return g;
};
const topDisc = (r: number, y: number) => {
  const g = new THREE.CircleGeometry(r, 96);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
};
const gearShape = (r: number, teeth: number, td: number) => {
  const s = new THREE.Shape();
  const n = teeth * 4;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = i % 4 < 2 ? r : r - td;
    const x = rr * Math.cos(a), y = rr * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.holes.push(holePath(r * 0.28));
  return s;
};

const LX = 0, LY = -0.1; // lens axis
let GEO: ReturnType<typeof buildGeo> | null = null;
function buildGeo() {
  const plateFoot = rrect(2.84, 0.66, 0.28);
  const bodyFoot = rrect(2.78, 0.62, 0.26);
  // lever (top view), pivot at the origin, tip along +x
  const lever = new THREE.Shape();
  lever.absarc(0, 0, 0.1, Math.PI * 0.5, Math.PI * 1.5, false);
  lever.lineTo(0.6, -0.042);
  lever.absarc(0.6, 0, 0.042, -Math.PI / 2, Math.PI / 2, false);
  lever.lineTo(0, 0.1);
  const leverG = extrudeUp(lever, 0, 0.034, 0.009, 24);
  leverG.rotateY(0.42);
  // iris blade: inner edge on the local y axis
  const blade = rrect(0.3, 0.4, 0.03, 0.15, 0);
  // back door: a C-shaped shell that wraps the body's back and rounded ends (footprint coords, y = −z)
  const shell = (() => {
    const W2 = 1.405, Yb = 0.325, R = 0.272, t = 0.05, yA = Yb - R;
    const sh = new THREE.Shape();
    sh.moveTo(-W2, 0);
    sh.lineTo(-W2, yA);
    sh.absarc(-W2 + R, yA, R, Math.PI, Math.PI / 2, true);
    sh.lineTo(W2 - R, Yb);
    sh.absarc(W2 - R, yA, R, Math.PI / 2, 0, true);
    sh.lineTo(W2, 0);
    sh.lineTo(W2 - t, 0);
    sh.lineTo(W2 - t, yA);
    sh.absarc(W2 - R, yA, R - t, 0, Math.PI / 2, false);
    sh.lineTo(-W2 + R, Yb - t);
    sh.absarc(-W2 + R, yA, R - t, Math.PI / 2, Math.PI, false);
    sh.lineTo(-W2 + t, 0);
    sh.lineTo(-W2, 0);
    return sh;
  })();
  const plateHole = rrect(1.12, 1.0, 0.07);
  plateHole.holes.push(holePath(0.37));
  return {
    // 01 top plate
    topPlate: extrudeUp(plateFoot, 0.42, 0.38, 0.045, 40),
    winBezel: new THREE.BoxGeometry(1, 1, 1),
    dialSide: ycyl(0.2, 0.82, 0.9, 120, true),
    dialTop: topDisc(0.2, 0.9),
    dialCollar: ycyl(0.215, 0.8, 0.825, 96),
    btnCollar: ycyl(0.075, 0.94, 0.965, 48),
    btn: ycyl(0.045, 0.94, 1.0, 48),
    btnTop: topDisc(0.045, 1.0),
    lever: leverG,
    leverTip: ycyl(0.048, 0.0, 0.05, 32),
    pivot: ycyl(0.1, 0.8, 0.905, 64),
    shoeBase: new THREE.BoxGeometry(0.46, 0.024, 0.38),
    shoeRail: new THREE.BoxGeometry(0.46, 0.05, 0.035),
    shoeLip: new THREE.BoxGeometry(0.46, 0.012, 0.09),
    rwCollar: ycyl(0.205, 0.8, 0.83, 96),
    rwSide: ycyl(0.185, 0.83, 0.95, 120, true),
    rwTop: topDisc(0.185, 0.95),
    rwCrank: new THREE.BoxGeometry(0.2, 0.022, 0.06),
    rwKnob: ycyl(0.028, 0.0, 0.06, 24),
    counter: (() => { const g = new THREE.SphereGeometry(0.07, 48, 16, 0, Math.PI * 2, 0, 1.1); g.translate(0, 0.8 - 0.07 * Math.cos(1.1), 0); return g; })(),
    counterRing: ycyl(0.08, 0.8, 0.815, 48),
    // 02 lens (axis along +z, centred at LX, LY)
    flange: zcyl(0.4, 0.4, 0.35, 0.39),
    apRing: zcyl(0.385, 0.385, 0.39, 0.5, 120, true),
    apFront: (() => { const g = new THREE.RingGeometry(0.37, 0.385, 96); g.translate(0, 0, 0.5); return g; })(),
    idxRing: zcyl(0.37, 0.37, 0.5, 0.53),
    focusLipB: zcyl(0.405, 0.405, 0.53, 0.545),
    focus: zcyl(0.415, 0.415, 0.545, 0.705, 160, true),
    focusLipF: zcyl(0.405, 0.405, 0.705, 0.72),
    focusFaceB: (() => { const g = new THREE.RingGeometry(0.37, 0.415, 96); g.rotateY(Math.PI); g.translate(0, 0, 0.545); return g; })(),
    focusFaceF: (() => { const g = new THREE.RingGeometry(0.37, 0.415, 96); g.translate(0, 0, 0.705); return g; })(),
    scaleRing: zcyl(0.378, 0.378, 0.72, 0.78, 120, true),
    barrel: zcyl(0.352, 0.366, 0.78, 1.02, 96),
    frontRing: zcyl(0.37, 0.37, 1.02, 1.07, 96, true),
    frontFace: (() => { const g = new THREE.RingGeometry(0.262, 0.37, 96); g.translate(0, 0, 1.07); return g; })(),
    glass: capZ(0.6, 0.262, 1.035),
    glassIn: capZ(0.42, 0.2, 0.995),
    tab: (() => { const g = new THREE.BoxGeometry(0.1, 0.1, 0.12); g.translate(0, -0.45, 0.625); return g; })(),
    tabEnd: (() => { const g = zcyl(0.05, 0.05, 0.565, 0.685, 32); g.translate(0, -0.5, 0); return g; })(),
    // 03 shutter (centred at LX, LY)
    shPlate: extrudeZ(plateHole, 0.1, 0.035, 0.008),
    shHousing: extrudeZ(annulus(0.58, 0.37), 0.135, 0.075, 0.012, 96),
    shBezel: extrudeZ(annulus(0.52, 0.37), 0.21, 0.018, 0.005, 96),
    blade: extrudeZ(blade, 0, 0.006, 0, 12),
    gear: extrudeZ(gearShape(0.11, 16, 0.025), 0.135, 0.03, 0, 8),
    gear2: extrudeZ(gearShape(0.06, 10, 0.018), 0.135, 0.04, 0, 8),
    // 04 body
    leather: extrudeUp(bodyFoot, -0.6, 1.02, 0.012, 40),
    base: extrudeUp(plateFoot, -0.72, 0.13, 0.035, 40),
    deck: extrudeUp(rrect(2.7, 0.56, 0.23), 0.42, 0.025, 0, 40),
    mount: extrudeZ(annulus(0.43, 0.33), 0.305, 0.045, 0.008, 96),
    throat: (() => { const g = new THREE.CircleGeometry(0.335, 64); g.translate(0, 0, 0.312); return g; })(),
    rfBlock: new THREE.BoxGeometry(1.5, 0.14, 0.34),
    prism: new THREE.BoxGeometry(0.18, 0.13, 0.18),
    shaft: ycyl(0.035, 0.445, 0.6, 24),
    lug: new THREE.TorusGeometry(0.055, 0.014, 12, 40),
    release: zcyl(0.05, 0.05, 0.3, 0.35, 32),
    // 05 film
    canSide: ycyl(0.19, -0.4, 0.16, 96, true),
    canCap: ycyl(0.2, 0, 0.035, 96),
    hub: ycyl(0.07, 0, 0.09, 48),
    lip: new THREE.BoxGeometry(0.13, 0.5, 0.05),
    // 06 back door
    door: extrudeUp(shell, -0.58, 0.98, 0.01, 40),
    pressure: new THREE.BoxGeometry(1.36, 0.6, 0.02),
    spring: new THREE.BoxGeometry(0.34, 0.025, 0.03),
    rail: new THREE.BoxGeometry(2.3, 0.028, 0.02),
    latch: new THREE.BoxGeometry(0.03, 0.24, 0.09),
  };
}
const geo = () => (GEO ??= buildGeo());

// ───────────────────────────── studio env + materials ─────────────────────────────
const makeEnv = (gl: THREE.WebGLRenderer) => {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.03, 0.032), side: THREE.BackSide }));
  s.add(room);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.058, 0.055) }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -12;
  s.add(floor);
  const panel = (w: number, h: number, pos: [number, number, number], k: number, col = "#ffffff") => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(9, 7, [-10, 12, 9], 3.2, "#fff2e2"); // key softbox, warm white
  panel(16, 3.5, [0, 18, -2], 1.6); // overhead strip
  panel(2.2, 22, [16, 3, -9], 6.0, "#eef2f6"); // rim strip right, cool neutral
  panel(2.2, 22, [-16, 3, -9], 4.0, "#f6f3ee"); // rim strip left
  panel(14, 1.2, [0, -3, 16], 1.4); // low front strip → a line on the glass
  panel(3, 10, [12, 6, 10], 1.8, "#fff6ec"); // front-right accent
  panel(1.5, 3.6, [-14, -3.5, 1.5], 5.5, "#fff4e8"); // low-left softbox → the glint on the lens glass
  const pm = new THREE.PMREMGenerator(gl);
  const rt = pm.fromScene(s, 0.02, 0.1, 100);
  pm.dispose();
  return rt.texture;
};

const makeMats = () => {
  const C = makeCanvases();
  const tex = (c: HTMLCanvasElement, rx = 1, ry = 1, color = false) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const brushed = tex(C.brushed, 0.7, 2.2);
  const leatherBump = tex(C.leather, 1.7, 1.7);
  const knurl = tex(C.knurl, 4, 1);
  const knurlBlack = tex(C.knurl, 3, 1);
  const diamond = tex(C.diamond, 6, 0.7);
  const dialMap = tex(C.dial, 1, 1, true);
  const apMap = tex(C.aperture, 1, 1, true);
  const scaleMap = tex(C.scale, 1, 1, true);
  const canMap = tex(C.can, 1, 1, true);
  const filmMap = tex(C.film, 1, 1, true);
  filmMap.wrapT = THREE.ClampToEdgeWrapping;
  const chrome = new THREE.MeshPhysicalMaterial({ color: "#d9d9d9", metalness: 1, roughness: 0.42, roughnessMap: brushed, envMapIntensity: 1.25 });
  const polished = new THREE.MeshPhysicalMaterial({ color: "#e3e3e3", metalness: 1, roughness: 0.1, envMapIntensity: 1.3 });
  const knurlChrome = new THREE.MeshPhysicalMaterial({ color: "#d4d4d4", metalness: 1, roughness: 0.2, bumpMap: knurl, bumpScale: 3, envMapIntensity: 1.3 });
  const diamondChrome = new THREE.MeshPhysicalMaterial({ color: "#d4d4d4", metalness: 1, roughness: 0.22, bumpMap: diamond, bumpScale: 2.5, envMapIntensity: 1.3 });
  const leather = new THREE.MeshPhysicalMaterial({ color: "#161617", roughness: 0.68, metalness: 0, bumpMap: leatherBump, bumpScale: 1.6, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.9 });
  const satin = new THREE.MeshPhysicalMaterial({ color: "#121213", roughness: 0.32, metalness: 0.55, envMapIntensity: 1.1 });
  const gunmetal = new THREE.MeshPhysicalMaterial({ color: "#3a3b3d", roughness: 0.3, metalness: 1, envMapIntensity: 1.1 });
  const blackKnurl = new THREE.MeshPhysicalMaterial({ color: "#121213", roughness: 0.35, metalness: 0.4, bumpMap: knurlBlack, bumpScale: 2, map: apMap });
  const steel = new THREE.MeshPhysicalMaterial({ color: "#c4c5c8", metalness: 1, roughness: 0.5, roughnessMap: brushed, envMapIntensity: 1.6 });
  const blades = new THREE.MeshPhysicalMaterial({ color: "#7c7d82", metalness: 1, roughness: 0.2, envMapIntensity: 1.7 });
  const brass = new THREE.MeshPhysicalMaterial({ color: "#c8a15a", metalness: 1, roughness: 0.28, envMapIntensity: 1.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#050607", metalness: 0, roughness: 0.02, ior: 1.75, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.85, iridescenceIOR: 1.35, iridescenceThicknessRange: [190, 270], envMapIntensity: 2.4 });
  const glassIn = new THREE.MeshPhysicalMaterial({ color: "#0b0906", metalness: 0, roughness: 0.04, ior: 1.6, specularColor: new THREE.Color("#ffb060"), specularIntensity: 1, envMapIntensity: 2 });
  const winGlass = new THREE.MeshPhysicalMaterial({ color: "#0a0b0c", metalness: 0.2, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.8 });
  const frosted = new THREE.MeshPhysicalMaterial({ color: "#a8a39b", roughness: 0.45, emissive: "#1e1c19", clearcoat: 1, envMapIntensity: 0.8 });
  const dial = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: dialMap, metalness: 1, roughness: 0.24, envMapIntensity: 1.3 });
  const scale = new THREE.MeshPhysicalMaterial({ color: "#ffffff", map: scaleMap, metalness: 1, roughness: 0.18, envMapIntensity: 1.3 });
  const matte = new THREE.MeshStandardMaterial({ color: "#060606", roughness: 0.9 });
  const plastic = new THREE.MeshPhysicalMaterial({ color: "#141414", roughness: 0.4, clearcoat: 0.6 });
  const can = new THREE.MeshPhysicalMaterial({ map: canMap, metalness: 0.25, roughness: 0.3, clearcoat: 0.5, envMapIntensity: 1 });
  const film = new THREE.MeshPhysicalMaterial({ map: filmMap, emissiveMap: filmMap, emissive: "#ffffff", emissiveIntensity: 0.22, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.25, clearcoat: 0.6, envMapIntensity: 0.9 });
  return { chrome, polished, knurlChrome, diamondChrome, leather, satin, gunmetal, blackKnurl, steel, blades, brass, glass, glassIn, winGlass, frosted, dial, scale, matte, plastic, can, film };
};

// ───────────────────────────── film strip ─────────────────────────────
const STRIP_N = 160;
const PITCH = 0.543; // one 35 mm frame pitch, strip width 0.5
const FILM_C = { x: 0.98, y: -0.12, z: -0.08 };
const CAN_R = 0.19;
/** the strip leaves the canister towards the front-left (reads horizontal on screen in both shots) */
const SD = { x: -0.741, z: 0.671 }; // direction along the strip (local xz)
const SN = { x: 0.671, z: 0.741 }; // horizontal normal, towards the camera
const LIP_YAW = Math.atan2(-SD.z, SD.x);
const updateStrip = (g: THREE.BufferGeometry, L: number, phase: number) => {
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  const x0 = FILM_C.x - (CAN_R + 0.012) * SN.x, z0 = FILM_C.z - (CAN_R + 0.012) * SN.z;
  const curlLen = Math.min(0.5, L);
  for (let j = 0; j <= STRIP_N; j++) {
    const s = (L * j) / STRIP_N;
    const ramp = clamp(s / 0.8);
    const e = clamp((s - (L - curlLen)) / Math.max(0.001, curlLen));
    const along = s - 0.09 * e * e * e;
    const side = 0.07 * Math.sin(2.1 * s - phase) * ramp * ramp + 0.16 * e * e;
    const x = x0 + SD.x * along + SN.x * side;
    const z = z0 + SD.z * along + SN.z * side;
    const f = clamp((s - (L - 0.44)) / 0.12);
    const ff = f * f * (3 - 2 * f);
    const top = 0.25, bot = lerp(-0.25, -0.01, ff);
    pos.setXYZ(j * 2, x, FILM_C.y + top, z);
    pos.setXYZ(j * 2 + 1, x, FILM_C.y + bot, z);
    uv.setXY(j * 2, s / PITCH, 1);
    uv.setXY(j * 2 + 1, s / PITCH, (bot + 0.25) / 0.5);
  }
  pos.needsUpdate = true;
  uv.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingSphere();
};
const makeStrip = () => {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((STRIP_N + 1) * 2 * 3), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((STRIP_N + 1) * 2 * 2), 2));
  const idx: number[] = [];
  for (let j = 0; j < STRIP_N; j++) {
    const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  g.setIndex(idx);
  return g;
};

// ───────────────────────────── scene ─────────────────────────────
const Scene: React.FC<{ u: number; aspect: number; full: boolean }> = ({ u, aspect, full }) => {
  const { camera, scene, gl } = useThree();
  const env = useMemo(() => makeEnv(gl), [gl]);
  const M = useMemo(makeMats, []);
  const strip = useMemo(makeStrip, []);
  const G = geo();
  const pose = camPose(u, aspect, full);
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = pose.fov;
    cam.aspect = aspect;
    cam.near = 0.5;
    cam.far = 120;
    cam.position.copy(pose.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(pose.look);
    cam.updateProjectionMatrix();
    scene.environment = env;
    scene.background = null;
    gl.toneMappingExposure = 1.12;
  });

  const dy = partDY(u, full);
  const wob = [0, 1, 2, 3, 4, 5].map((i) => layerWob(i, u, full));
  const focusRot = full ? 0.5 * Math.sin(2 * Math.PI * 0.36 * (u - U_FULL)) : 0;
  const yaw = modelYaw(u, full);
  const L = filmLen(u, full);
  updateStrip(strip, L, full ? (u - U_FULL) * 2.4 : 0);
  const canSpin = -(L - 0.34) / 0.19;
  const a = full ? irisA(u) : 0.12;

  const win = (x: number, w: number, h: number, mat: THREE.Material) => (
    <group position={[x, 0.61, 0.33]}>
      <mesh geometry={G.winBezel} material={M.polished} scale={[w + 0.05, h + 0.05, 0.024]} position={[0, 0, 0.004]} />
      <mesh geometry={G.winBezel} material={mat} scale={[w, h, 0.02]} position={[0, 0, 0.012]} />
    </group>
  );

  return (
    <>
      <ambientLight intensity={0.12} />
      <directionalLight position={[-6, 8, 7]} intensity={2.2} color="#fff0de" />
      <directionalLight position={[8, 4, -7]} intensity={3.4} color="#e8edf2" />
      <directionalLight position={[-8, 3, -6]} intensity={2.2} color="#f4efe8" />
      <directionalLight position={[2, -6, 5]} intensity={0.35} color="#ffffff" />
      <group rotation={[0, yaw, 0]}>
        {/* 01 top plate */}
        <group position={[0, dy[0], 0]} rotation={[0, wob[0], 0]}>
          <mesh geometry={G.topPlate} material={M.chrome} />
          {win(0.78, 0.48, 0.2, M.winGlass)}
          {win(0.26, 0.2, 0.17, M.frosted)}
          {win(-0.7, 0.2, 0.17, M.winGlass)}
          <group position={[-0.7, 0, 0.05]}>
            <mesh geometry={G.dialCollar} material={M.polished} />
            <mesh geometry={G.dialSide} material={M.diamondChrome} />
            <mesh geometry={G.dialTop} material={M.dial} />
          </group>
          <group position={[-1.1, 0, 0.08]}>
            <mesh geometry={G.pivot} material={M.polished} />
            <mesh geometry={G.lever} material={M.polished} position={[0, 0.905, 0]} />
            <mesh geometry={G.leverTip} material={M.plastic} position={[0.6 * Math.cos(0.42), 0.9, -0.6 * Math.sin(0.42)]} />
            <mesh geometry={G.btnCollar} material={M.polished} />
            <mesh geometry={G.btn} material={M.polished} />
          </group>
          <group position={[0.14, 0.8, 0]}>
            <mesh geometry={G.shoeBase} material={M.chrome} position={[0, 0.012, 0]} />
            <mesh geometry={G.shoeRail} material={M.polished} position={[0, 0.035, 0.17]} />
            <mesh geometry={G.shoeRail} material={M.polished} position={[0, 0.035, -0.17]} />
            <mesh geometry={G.shoeLip} material={M.polished} position={[0, 0.066, 0.135]} />
            <mesh geometry={G.shoeLip} material={M.polished} position={[0, 0.066, -0.135]} />
          </group>
          <group position={[0.98, 0, 0.02]}>
            <mesh geometry={G.rwCollar} material={M.polished} />
            <mesh geometry={G.rwSide} material={M.diamondChrome} />
            <mesh geometry={G.rwTop} material={M.chrome} />
            <mesh geometry={G.rwCrank} material={M.polished} position={[0.06, 0.962, 0.0]} />
            <mesh geometry={G.rwKnob} material={M.plastic} position={[0.15, 0.97, 0.0]} />
          </group>
          <group position={[-0.32, 0, -0.17]}>
            <mesh geometry={G.counterRing} material={M.polished} />
            <mesh geometry={G.counter} material={M.winGlass} position={[0, 0.012, 0]} />
          </group>
        </group>
        {/* 02 lens */}
        <group position={[LX, LY + dy[1], 0]} rotation={[0, wob[1], 0]}>
          <mesh geometry={G.flange} material={M.polished} />
          <mesh geometry={G.apRing} material={M.blackKnurl} rotation={[0, 0, -0.4 * focusRot]} />
          <mesh geometry={G.apFront} material={M.satin} />
          <mesh geometry={G.idxRing} material={M.polished} />
          <mesh geometry={G.focusLipB} material={M.polished} />
          <mesh geometry={G.focus} material={M.knurlChrome} rotation={[0, 0, focusRot]} />
          <mesh geometry={G.focusLipF} material={M.polished} />
          <mesh geometry={G.focusFaceB} material={M.polished} />
          <mesh geometry={G.focusFaceF} material={M.polished} />
          <mesh geometry={G.scaleRing} material={M.scale} />
          <mesh geometry={G.barrel} material={M.satin} />
          <mesh geometry={G.frontRing} material={M.polished} />
          <mesh geometry={G.frontFace} material={M.satin} />
          <mesh geometry={G.glassIn} material={M.glassIn} />
          <mesh geometry={G.glass} material={M.glass} />
          <mesh geometry={G.tab} material={M.polished} />
          <mesh geometry={G.tabEnd} material={M.polished} />
        </group>
        {/* 03 shutter */}
        <group position={[LX, LY + dy[2], 0]} rotation={[0, wob[2], 0]}>
          <mesh geometry={G.shPlate} material={M.steel} />
          <mesh geometry={G.shHousing} material={M.satin} />
          <mesh geometry={G.shBezel} material={M.polished} />
          {Array.from({ length: 7 }, (_, k) => {
            const ph = (k / 7) * Math.PI * 2 + 0.3;
            return <mesh key={k} geometry={G.blade} material={M.blades} position={[a * Math.cos(ph), a * Math.sin(ph), 0.16 + k * 0.005]} rotation={[0, 0, ph + 0.22]} />;
          })}
          <mesh geometry={G.gear} material={M.brass} position={[0.5, 0.42, 0]} rotation={[0, 0, u * 1.5]} />
          <mesh geometry={G.gear2} material={M.brass} position={[0.36, 0.53, 0]} rotation={[0, 0, -u * 2.7]} />
        </group>
        {/* 04 body */}
        <group position={[0, dy[3], 0]} rotation={[0, wob[3], 0]}>
          <mesh geometry={G.leather} material={M.leather} />
          <mesh geometry={G.base} material={M.chrome} />
          <mesh geometry={G.deck} material={M.satin} />
          <mesh geometry={G.rfBlock} material={M.gunmetal} position={[0.22, 0.52, -0.02]} />
          <mesh geometry={G.prism} material={M.polished} position={[-0.72, 0.52, 0.04]} />
          <mesh geometry={G.shaft} material={M.polished} position={[-0.7, 0, 0.05]} />
          <mesh geometry={G.shaft} material={M.polished} position={[0.98, 0, 0.02]} />
          <group position={[LX, LY, 0]}>
            <mesh geometry={G.mount} material={M.polished} />
            <mesh geometry={G.throat} material={M.matte} />
          </group>
          <mesh geometry={G.release} material={M.polished} position={[0.5, -0.4, 0]} />
          <mesh geometry={G.lug} material={M.polished} position={[1.42, 0.28, 0]} rotation={[0, Math.PI / 2, 0]} />
          <mesh geometry={G.lug} material={M.polished} position={[-1.42, 0.28, 0]} rotation={[0, Math.PI / 2, 0]} />
        </group>
        {/* 05 film: canister + strip */}
        <group position={[0, dy[4], 0]} rotation={[0, wob[4], 0]}>
          <group position={[FILM_C.x, FILM_C.y, FILM_C.z]}>
            <group rotation={[0, canSpin, 0]}>
              <mesh geometry={G.canSide} material={M.can} position={[0, 0.12, 0]} />
            </group>
            <mesh geometry={G.canCap} material={M.satin} position={[0, 0.28, 0]} />
            <mesh geometry={G.canCap} material={M.satin} position={[0, -0.315, 0]} />
            <mesh geometry={G.hub} material={M.plastic} position={[0, 0.315, 0]} rotation={[0, canSpin, 0]} />
            <mesh geometry={G.lip} material={M.matte} position={[-(CAN_R + 0.012) * SN.x, 0, -(CAN_R + 0.012) * SN.z]} rotation={[0, LIP_YAW, 0]} />
          </group>
          <mesh geometry={strip} material={M.film} />
        </group>
        {/* 06 back door */}
        <group position={[0, dy[5], 0]} rotation={[0, wob[5], 0]}>
          <mesh geometry={G.door} material={M.leather} />
          <mesh geometry={G.pressure} material={M.steel} position={[0, LY, -0.24]} />
          <mesh geometry={G.spring} material={M.polished} position={[0, LY + 0.18, -0.262]} />
          <mesh geometry={G.spring} material={M.polished} position={[0, LY - 0.18, -0.262]} />
          <mesh geometry={G.rail} material={M.polished} position={[0, LY + 0.36, -0.264]} />
          <mesh geometry={G.rail} material={M.polished} position={[0, LY - 0.36, -0.264]} />
          <mesh geometry={G.latch} material={M.polished} position={[1.41, LY, -0.12]} />
        </group>
      </group>
    </>
  );
};

// ───────────────────────────── labels (HTML over the canvas, same camera) ─────────────────────────────
const NAMES = ["Top plate", "Lens", "Shutter", "Body", "Film · 36 exp.", "Back door"];
const Labels: React.FC<{ u: number; w: number; h: number }> = ({ u, w, h }) => {
  const aspect = w / h;
  const cam = makeCam(camPose(u, aspect, true), aspect);
  const s = w / 1080;
  const tile = aspect > 0.7;
  const lx = w * (tile ? 0.6 : 0.48);
  const items = NAMES.map((name, i) => {
    const p = anchorWorld(i, u, true).project(cam);
    return { name, i, ax: ((p.x + 1) / 2) * w, ay: ((1 - p.y) / 2) * h, t0: 0.9 + 0.1 * i };
  });
  const ink = "rgba(244,239,230,0.82)";
  return (
    <>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        {items.map(({ i, ax, ay, t0 }) => {
          const kd = clamp((u - t0) / 0.12);
          if (kd <= 0) return null;
          const kl = easeOut(clamp((u - t0 - 0.03) / 0.16));
          const x2 = lerp(ax + 10 * s, lx - 18 * s, kl);
          const ring = clamp((u - t0) / 0.35);
          return (
            <g key={i}>
              <circle cx={ax} cy={ay} r={6.5 * s * backOut(kd)} fill="#F4EFE6" />
              <circle cx={ax} cy={ay} r={(10 + 16 * ring) * s} fill="none" stroke="#F4EFE6" strokeWidth={2 * s} opacity={0.7 * (1 - ring)} />
              <circle cx={ax} cy={ay} r={12 * s} fill="none" stroke={ink} strokeWidth={1.6 * s} opacity={0.6 * kd} />
              {kl > 0 && <line x1={ax + 12 * s} y1={ay} x2={x2} y2={ay} stroke={ink} strokeWidth={2.4 * s} strokeLinecap="round" />}
            </g>
          );
        })}
      </svg>
      {items.map(({ name, i, ay, t0 }) => {
        const k = clamp((u - t0 - 0.1) / 0.22);
        if (k <= 0) return null;
        const pop = backOut(k);
        return (
          <div key={i} style={{ position: "absolute", left: lx, top: ay - 29 * s, height: 58 * s, display: "flex", alignItems: "center", gap: 14 * s, transformOrigin: `0 ${29 * s}px`, transform: `translateX(${(1 - easeOut(k)) * -24 * s}px) scale(${0.86 + 0.14 * pop})`, opacity: clamp(k * 2.2), whiteSpace: "nowrap" }}>
            <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 40 * s, lineHeight: `${58 * s}px`, color: "#C9BEAD", letterSpacing: 1 * s }}>{String(i + 1).padStart(2, "0")}</div>
            <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 46 * s, lineHeight: `${58 * s}px`, color: "#F5F0E7", letterSpacing: -0.5 * s }}>{name}</div>
          </div>
        );
      })}
    </>
  );
};

// ───────────────────────────── component ─────────────────────────────
export const Exploded: React.FC<StyleProps> = ({ u, w, h, full }) => {
  const [ready, setReady] = useState(READY);
  const [handle] = useState(() => (READY ? null : delayRender("exploded: fonts + textures")));
  useEffect(() => {
    if (ready) return;
    let on = true;
    prepare().then(() => {
      if (on) setReady(true);
      if (handle !== null) continueRender(handle);
    });
    return () => {
      on = false;
    };
  }, []);
  const W = Math.round(w), H = Math.round(h);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: full
      ? `radial-gradient(ellipse 72% 56% at ${lerp(26, 34, fullT(u))}% ${lerp(46, 44, fullT(u))}%, #645f58 0%, #433f3b 40%, #272523 74%, #171615 100%)`
      : "radial-gradient(ellipse 92% 64% at 50% 46%, #a19b91 0%, #6f6a63 36%, #3b3834 70%, #201f1d 100%)" }}>
      {ready && (
        <ThreeCanvas width={W} height={H} camera={{ fov: 28, position: [0, 1, 14] }} gl={{ antialias: true, alpha: true }}>
          <Scene u={u} aspect={w / h} full={full} />
        </ThreeCanvas>
      )}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 120% 90% at 50% 48%, transparent 58%, rgba(8,8,8,0.42) 100%)", pointerEvents: "none" }} />
      {ready && full && <Labels u={u} w={w} h={h} />}
    </div>
  );
};
