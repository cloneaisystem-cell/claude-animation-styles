// /origami — "one sheet becomes a crane": a square of red paper (cream back, fine fibres) folds itself on a warm
// off-white paper backdrop: diagonal → triangle → square base → bird base (rigid facets hinging about crease lines),
// then a hard cut to a low 3/4 hero angle where a low-poly crane raises its neck and tail, bends its head, opens its
// wings, flaps twice and lifts off out of frame, leaving its soft shadow behind. Pure function of u.
import React, { useLayoutEffect, useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { Easing } from "remotion";
import * as THREE from "three";
// @ts-ignore no types bundled
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { StyleProps } from "../types";
import { clamp, hash, lerp } from "../theme";

const U_CUT = 0.833;
const RED = "#B9261F", CREAM = "#F3E6CB", BACKDROP = "#EFE6D8", SHADOW = "#4A2A1A";
const D2R = Math.PI / 180;
const S2 = Math.SQRT2;
type V3 = THREE.Vector3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const snap = Easing.bezier(0.55, 0, 0.12, 1); // fast hinge: quick start, crisp stop
const sine = Easing.bezier(0.45, 0, 0.55, 1);
const over = Easing.bezier(0.3, 1.45, 0.45, 1); // overshoot + settle
const ph = (u: number, t0: number, d: number) => clamp((u - t0) / d);

const rotAxis = (p: V3, o: V3, dir: V3, a: number) => p.clone().sub(o).applyAxisAngle(dir, a).add(o);

// ───────────────────────────── textures (module cache) ─────────────────────────────
let fibreCv: HTMLCanvasElement | null = null;
const fibreCanvas = () => {
  if (fibreCv) return fibreCv;
  const N = 1024;
  const c = document.createElement("canvas"); c.width = N; c.height = N;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgb(238,238,238)"; x.fillRect(0, 0, N, N);
  // soft cloudy formation (paper "flock")
  for (let i = 0; i < 1400; i++) {
    const px = hash(i * 3.17 + 1) * N, py = hash(i * 7.73 + 2) * N, r = 6 + hash(i * 1.31 + 5) * 26;
    const l = hash(i * 9.11 + 3) > 0.5;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, l ? "rgba(255,255,255,0.05)" : "rgba(200,200,200,0.035)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  // fine fibres: short curved strands
  for (let i = 0; i < 9000; i++) {
    const px = hash(i * 2.71 + 11) * N, py = hash(i * 5.39 + 13) * N;
    const a = hash(i * 4.13 + 17) * Math.PI * 2, len = 5 + hash(i * 6.07 + 19) * 22, bend = (hash(i * 8.3 + 23) - 0.5) * 10;
    const light = hash(i * 1.97 + 29) > 0.45;
    x.strokeStyle = light ? `rgba(255,255,255,${0.22 + hash(i * 3.3) * 0.3})` : `rgba(140,140,140,${0.1 + hash(i * 2.2) * 0.12})`;
    x.lineWidth = 0.5 + hash(i * 7.7 + 31) * 0.9;
    const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo((px + ex) / 2 - Math.sin(a) * bend, (py + ey) / 2 + Math.cos(a) * bend, ex, ey); x.stroke();
  }
  fibreCv = c;
  return c;
};

let paperCv: HTMLCanvasElement | null = null;
/** the backdrop's paper: very low-contrast long fibres, no blotches (reads as paper, never as grain) */
const paperCanvas = () => {
  if (paperCv) return paperCv;
  const N = 1024;
  const c = document.createElement("canvas"); c.width = N; c.height = N;
  const x = c.getContext("2d")!;
  x.fillStyle = "rgb(246,246,246)"; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 2600; i++) {
    const px = hash(i * 1.71 + 41) * N, py = hash(i * 3.93 + 43) * N;
    const a = hash(i * 2.13 + 47) * Math.PI * 2, len = 10 + hash(i * 5.07 + 53) * 30, bend = (hash(i * 8.9 + 59) - 0.5) * 14;
    x.strokeStyle = hash(i * 1.37 + 61) > 0.5 ? "rgba(255,255,255,0.22)" : "rgba(200,200,200,0.10)";
    x.lineWidth = 0.6 + hash(i * 7.1 + 67) * 0.8;
    const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo((px + ex) / 2 - Math.sin(a) * bend, (py + ey) / 2 + Math.cos(a) * bend, ex, ey); x.stroke();
  }
  paperCv = c;
  return c;
};

const SH_N = 512;
let shCv: { c: HTMLCanvasElement; sil: HTMLCanvasElement } | null = null;
const shadowCanvases = () => {
  if (shCv) return shCv;
  const c = document.createElement("canvas"); c.width = SH_N; c.height = SH_N;
  const sil = document.createElement("canvas"); sil.width = SH_N; sil.height = SH_N;
  shCv = { c, sil };
  return shCv;
};
/** paints the projected silhouette of the paper (soft, blurred) — a height-aware fake area-light shadow */
const paintShadow = (tris: V3[][], L: V3, cx: number, cz: number, span: number, blur: number, shrink: number, contact: number, anchor = V()) => {
  const { c, sil } = shadowCanvases();
  const k = SH_N / span;
  const g = sil.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, SH_N, SH_N);
  const hc = (y: number) => Math.min(y, 0.9) + 0.12 * Math.max(0, y - 0.9);
  const proj = tris.map((t) => t.map((p) => [p.x - anchor.x - (L.x * hc(p.y)) / L.y, p.z - anchor.z - (L.z * hc(p.y)) / L.y]));
  let sx = 0, sz = 0, n = 0;
  for (const t of proj) for (const q of t) { sx += q[0]; sz += q[1]; n++; }
  sx /= Math.max(1, n); sz /= Math.max(1, n);
  g.fillStyle = "#fff";
  for (const t of proj) {
    g.beginPath();
    t.forEach((q, i) => {
      const X = (sx + (q[0] - sx) * shrink - cx) * k + SH_N / 2, Y = (sz + (q[1] - sz) * shrink - cz) * k + SH_N / 2;
      if (i === 0) g.moveTo(X, Y); else g.lineTo(X, Y);
    });
    g.closePath(); g.fill();
  }
  const f = c.getContext("2d")!;
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.filter = "none"; f.globalAlpha = 1; f.fillStyle = "#000"; f.fillRect(0, 0, SH_N, SH_N);
  f.filter = `blur(${blur.toFixed(2)}px)`; f.drawImage(sil, 0, 0);
  if (contact > 0.01) { f.globalAlpha = contact; f.filter = `blur(${Math.max(0.6, blur * 0.25).toFixed(2)}px)`; f.drawImage(sil, 0, 0); }
  f.filter = "none"; f.globalAlpha = 1;
  return { cx, cz };
};

// ───────────────────────────── act 1: the folding sheet ─────────────────────────────
// Sheet [-1,1]², red side = +c. Sheet (a,b) → model (a, 0, -b). Rib model: 8 rays from the centre O alternating midline
// (length 1) and diagonal (length √2); every facet is a rigid piece of one of the 8 triangles between rays.
const AZ = [0, 45, 90, 135, 180, 225, 270, 315].map((a) => a * D2R);
const LEN = [1, S2, 1, S2, 1, S2, 1, S2];
const sheet2 = (az: number, l: number) => [Math.cos(az) * l, Math.sin(az) * l];
const KK = 2 - S2; // kite crease point on each midline (petal fold)
// facet groups in the square base: FO = front face (Q1), FI = inner layers behind it, BO/BI = the back half
type Facet = { k: number; p: number[][]; part: "rest" | "kite" | "flap"; grp: "FO" | "FI" | "BO" | "BI" };
const GRP: Facet["grp"][] = ["FO", "FO", "FI", "BI", "BO", "BO", "BI", "FI"];
const ribPts = (k: number) => {
  const mi = k % 2 === 0 ? k : (k + 1) % 8, di = k % 2 === 0 ? (k + 1) % 8 : k;
  return { mi, di, M: sheet2(AZ[mi], 1), C: sheet2(AZ[di], S2), K: sheet2(AZ[mi], KK), J: sheet2(AZ[di], KK / S2) };
};
const FACETS: Facet[] = (() => {
  const out: Facet[] = [];
  for (let k = 0; k < 8; k++) {
    const { M, C, K, J } = ribPts(k), grp = GRP[k], O = [0, 0];
    if (grp === "FO") { out.push({ k, p: [O, K, J], part: "rest", grp }, { k, p: [J, K, C], part: "kite", grp }); }
    else out.push({ k, p: [O, K, C], part: "rest", grp });
    out.push({ k, p: [K, M, C], part: "flap", grp });
  }
  // CCW in sheet coords = red side
  for (const f of out) {
    const [a, b, c] = f.p;
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) f.p = [a, c, b];
  }
  return out;
})();

/** card beats (u): fold 1 diagonal, fold 2 triangle, squash → square base, petal → bird base */
const T1 = [0.035, 0.15], T2 = [0.205, 0.14], T3 = [0.37, 0.18], T4 = [0.585, 0.17];
const stageS = (u: number) => [snap(ph(u, T1[0], T1[1])), snap(ph(u, T2[0], T2[1])), snap(ph(u, T3[0], T3[1])), snap(ph(u, T4[0], T4[1]))];

/** roof-style mountain fold: both halves dip (crease rises), then one half tucks under the other; paper springs back a little */
const SB = 9 * D2R;
const foldRibs = (ribs: V3[], axis: V3, stat: number[], mov: number[], s: number) => {
  if (s <= 0) return ribs;
  const tA = (Math.PI / 4) * Math.sin(Math.PI * s) + (SB / 2) * s, tB = (Math.PI - SB) * s - tA;
  return ribs.map((r, i) => (stat.includes(i) ? r.clone().applyAxisAngle(axis, tA) : mov.includes(i) ? r.clone().applyAxisAngle(axis, -tB) : r));
};
const foldPath = (s0: number, s1: number) => {
  let r = AZ.map((a) => V(Math.cos(a), 0, -Math.sin(a)));
  r = foldRibs(r, r[1].clone().normalize(), [6, 7, 0], [2, 3, 4], s0);
  if (s1 > 0) r = foldRibs(r, r[7].clone().normalize(), [4, 5, 6], [0, 1, 2], s1);
  return r;
};
let fold2End: V3[] | null = null;
const ribsAt = (s: number[]) => {
  if (s[2] > 0) {
    // squash: the diagonals close together while the midlines open up/down → a (standing) square base
    const g = (Math.PI / 4) * (1 - s[2]);
    const b = Math.acos(clamp(Math.cos(Math.PI / 4) / Math.cos(g), -1, 1));
    const dA = V(-Math.sin(g), 0, Math.cos(g)), dB = V(Math.sin(g), 0, Math.cos(g));
    const mU = V(0, Math.sin(b), Math.cos(b)), mD = V(0, -Math.sin(b), Math.cos(b));
    const F = [mU, dA, mD, dB, mD, dA, mU, dB];
    if (!fold2End) fold2End = foldPath(1, 1);
    const bl = sine(clamp(s[2] / 0.35));
    return F.map((r, i) => fold2End![i].clone().lerp(r, bl).normalize());
  }
  return foldPath(s[0], s[1]);
};

/** sheet facets → model-frame triangles (before the global roll/yaw) */
const PUFF = 6 * D2R;
const sheetModel = (s: number[]) => {
  const ribs = ribsAt(s);
  const map = (k: number, q: number[]) => {
    const k2 = (k + 1) % 8;
    const A = sheet2(AZ[k], LEN[k]), B = sheet2(AZ[k2], LEN[k2]);
    const det = A[0] * B[1] - A[1] * B[0];
    const al = (q[0] * B[1] - q[1] * B[0]) / det, be = (A[0] * q[1] - A[1] * q[0]) / det;
    return ribs[k].clone().multiplyScalar(LEN[k] * al).add(ribs[k2].clone().multiplyScalar(LEN[k2] * be));
  };
  // front normal of the square base (Q1)
  const nQ = map(0, [1, 0]).cross(map(0, [1, 1])).add(map(1, [1, 1]).cross(map(1, [0, 1]))).normalize();
  // puff: the outer faces' side edges lift off a little, so the centre crease reads (squash onwards)
  const puffs = [0, 1, 4, 5].map((k) => {
    const { di, M } = ribPts(k);
    const ax = ribs[di].clone().normalize(), m3 = map(k, M);
    const want = k < 2 ? 1 : -1;
    const sg = m3.clone().applyAxisAngle(ax, 0.01).sub(m3).dot(nQ) * want >= 0 ? 1 : -1;
    return { k, q: new THREE.Quaternion().setFromAxisAngle(ax, sg * PUFF * s[2]) };
  });
  const P3 = (k: number, q: number[]) => {
    const p = map(k, q);
    const pf = puffs.find((x) => x.k === k);
    return pf && s[2] > 0 ? p.applyQuaternion(pf.q) : p;
  };
  const tris = FACETS.map((f) => ({ f, P: f.p.map((q) => P3(f.k, q)) }));
  if (s[3] > 0) {
    // petal fold: the front kite swings up and over the top; the side flaps (and the layers behind them) tuck in
    const K0 = P3(0, ribPts(0).K), K1 = P3(1, ribPts(1).K), C0 = P3(0, ribPts(0).C);
    const kAx = K1.clone().sub(K0).normalize();
    const sgn = (p: V3, o: V3, ax: V3, want: number) => (rotAxis(p, o, ax, 0.01).sub(p).dot(nQ) * want >= 0 ? 1 : -1);
    const kS = sgn(C0, K0, kAx, 1);
    const th = Math.PI * s[3], fl = Math.PI * clamp(s[3] * 1.1 - 0.05), fi = Math.PI * clamp(s[3] * 1.15);
    const flapRot = FACETS.map((f) => {
      if (f.part !== "flap") return null;
      const r = ribPts(f.k);
      const C = P3(f.k, r.C), K = P3(f.k, r.K), M = P3(f.k, r.M);
      const ax = K.clone().sub(C).normalize();
      const want = f.grp === "FI" ? 1 : -1;
      return { C, ax, sg: sgn(M, C, ax, want), ang: f.grp === "FO" ? fl : fi };
    });
    tris.forEach((t, i) => {
      const f = t.f, fr = flapRot[i];
      if (f.part === "rest") return;
      t.P = t.P.map((p) => {
        let q = p;
        if (fr) q = rotAxis(q, fr.C, fr.ax, fr.sg * fr.ang);
        if (f.grp === "FO") q = rotAxis(q, K0, kAx, kS * th);
        return q;
      });
    });
  }
  return tris;
};

/** model → world: roll the standing square base flat, present it with a yaw, keep it centred, rest it on the backdrop */
const CARD_YAW = 22 * D2R;
const sheetWorldRaw = (s: number[]) => {
  const roll = (Math.PI / 2) * s[2];
  const qr = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), roll);
  return sheetModel(s).map((t) => ({ f: t.f, P: t.P.map((p) => p.clone().applyQuaternion(qr)) }));
};
const bboxC = (tris: { P: V3[] }[]) => {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const t of tris) for (const p of t.P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return V((x0 + x1) / 2, 0, (z0 + z1) / 2);
};
let restC: V3[] | null = null;
const restCentres = () => {
  if (restC) return restC;
  const st = [[0, 0, 0, 0], [1, 0, 0, 0], [1, 1, 0, 0], [1, 1, 1, 0], [1, 1, 1, 1]];
  restC = st.map((s) => bboxC(sheetWorldRaw(s)));
  return restC;
};

const sheetWorld = (u: number) => {
  const s = stageS(u);
  const raw = sheetWorldRaw(s);
  const rc = restCentres();
  let c = rc[0].clone();
  for (let i = 0; i < 4; i++) if (s[i] > 0) c = rc[i].clone().lerp(rc[i + 1], s[i]);
  // hover + a little lift-and-settle after every fold
  const ends = [T1, T2, T3, T4].map((t) => t[0] + t[1]);
  let hop = 0, wob = 0;
  [T1, T2, T3, T4].forEach((t, i) => {
    const p = ph(u, t[0], t[1]);
    hop += 0.07 * Math.sin(Math.PI * p);
    const e = u - ends[i];
    if (e > 0) { const d = Math.exp(-e / 0.045); hop += 0.025 * d * Math.sin(e / 0.06 * Math.PI) ; wob += 2.2 * D2R * d * Math.sin((e / 0.075) * Math.PI * 2); }
  });
  const yaw = CARD_YAW + 6 * D2R * u;
  const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw);
  const qw = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), wob);
  const tris = raw.map((t) => ({ f: t.f, P: t.P.map((p) => p.clone().sub(c).applyQuaternion(qy).applyQuaternion(qw)) }));
  let ymin = 1e9;
  for (const t of tris) for (const p of t.P) ymin = Math.min(ymin, p.y);
  const lift = -ymin + 0.03 + hop;
  for (const t of tris) for (const p of t.P) p.y += lift;
  return { tris: tris.map((t) => t.P), uvs: tris.map((t) => t.f.p.map((q) => [(q[0] + 1) / 2, (q[1] + 1) / 2])), s, ymin: 0.03 + hop };
};

// ───────────────────────────── act 2: the crane ─────────────────────────────
type Tri = V3[];
const outTri = (a: V3, b: V3, c: V3, out: V3): Tri => {
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  return n.dot(out) >= 0 ? [a, b, c] : [a, c, b];
};
const keys = (u: number, ks: number[][], e = sine) => {
  if (u <= ks[0][0]) return ks[0][1];
  for (let i = 0; i < ks.length - 1; i++) if (u <= ks[i + 1][0]) return lerp(ks[i][1], ks[i + 1][1], e((u - ks[i][0]) / (ks[i + 1][0] - ks[i][0])));
  return ks[ks.length - 1][1];
};
// the full shot opens on a readable crane: wings already half open in a V, then a gather-up, then they spread
const WING_KEYS = [
  [U_CUT, 48], [0.99, 60], [1.17, 55], [1.34, 3], [1.41, 13], [1.47, 15], [1.55, 58], [1.65, -30], [1.73, 64], [1.82, -34],
  [1.89, 62], [1.96, -32], [2.03, 62], [2.1, -30], [2.16, 60], [2.24, -28],
];
const wingAngle = (u: number) => keys(u, WING_KEYS);
const LIFT0 = 1.79;

/** crane pose → world triangles. Crane frame: x forward (head), y up, z right wing. */
const craneWorld = (u: number, tile: boolean) => {
  const T: { t: Tri; uv?: number[][] }[] = [];
  const push = (t: Tri) => T.push({ t });
  // ---- timeline
  const nP = ph(u, U_CUT, 0.22), tP = ph(u, U_CUT + 0.025, 0.22);
  const aN = lerp(47, 62, over(nP)) * D2R;
  const aT = lerp(32, 52, over(tP)) * D2R;
  const bend = lerp(40, 122, over(ph(u, 0.93, 0.17))) * D2R;
  const om = wingAngle(u) * D2R;
  const dOm = (wingAngle(u + 0.008) - wingAngle(u - 0.008)) / 0.016; // deg/s
  const flex = clamp(-0.032 * dOm, -26, 26) * D2R;
  const liftP = ph(u, LIFT0, 2.217 - LIFT0);
  const lift = (tile ? 1.15 : 3.5) * Math.pow(liftP, 1.9);
  // little hops on the two flaps (down-strokes), body rises a touch as the wings push
  const hop = 0.05 * Math.max(0, Math.sin(Math.PI * ph(u, 1.56, 0.12))) + 0.06 * Math.max(0, Math.sin(Math.PI * ph(u, 1.66, 0.14)));
  const settle = -0.015 * Math.sin(Math.PI * ph(u, U_CUT, 0.06));
  const neckBob = (3 * Math.sin(Math.PI * 2 * ph(u, 1.47, 0.36)) * (1 - liftP)) * D2R;

  // ---- body (a puffed diamond)
  // hull: the top edge is the wing hinge, a keel below, puffed sides
  const B = V(0, 0, 0), TF = V(0.41, 0.37, 0), TR = V(-0.41, 0.37, 0), L = V(0.02, 0.22, -0.19), Rt = V(0.02, 0.22, 0.19);
  const bc = V(0, 0.22, 0);
  const bodyF = [[TF, TR, Rt], [TF, Rt, B], [Rt, TR, B], [TF, TR, L], [TF, L, B], [L, TR, B]];
  for (const [a, b, c] of bodyF) push(outTri(a, b, c, a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(bc)));

  // ---- neck + head
  const LN = 1.0;
  const nRT = V(0, 0.11, 0), nRL = V(0, -0.11, -0.035), nRR = V(0, -0.11, 0.035);
  const nET = V(LN, 0.032, 0), nEL = V(LN, -0.022, -0.011), nER = V(LN, -0.022, 0.011);
  const hT = V(0, 0, 0), hL = V(0, -0.06, -0.012), hR = V(0, -0.06, 0.012), hTip = V(0.32, -0.035, 0);
  const headPiv = nET.clone();
  const headPts = [hT, hL, hR, hTip].map((p) => p.clone().applyAxisAngle(V(0, 0, 1), -bend).add(headPiv));
  const neckM = new THREE.Matrix4().makeTranslation(0.27, 0.16, 0).multiply(new THREE.Matrix4().makeRotationZ(aN + neckBob));
  const nk = (p: V3) => p.clone().applyMatrix4(neckM);
  const [a1, b1, c1, d1, e1, f1] = [nRT, nRL, nRR, nET, nEL, nER].map(nk);
  const [h0, h1, h2, h3] = headPts.map(nk);
  push(outTri(a1, d1, e1, V(0, 0, -1))); push(outTri(a1, e1, b1, V(0, 0, -1)));
  push(outTri(a1, d1, f1, V(0, 0, 1))); push(outTri(a1, f1, c1, V(0, 0, 1)));
  push(outTri(h0, h3, h1, V(0, 0, -1))); push(outTri(h0, h3, h2, V(0, 0, 1)));
  // the neck's end cap where the head folds (small)
  push(outTri(h0, d1, h1, V(0, 0, -1))); push(outTri(h0, d1, h2, V(0, 0, 1)));

  // ---- tail
  const LT = 1.02;
  const tailM = new THREE.Matrix4().makeTranslation(-0.27, 0.16, 0).multiply(new THREE.Matrix4().makeRotationZ(-aT - neckBob * 0.6));
  const tk = (p: V3) => p.clone().applyMatrix4(tailM);
  const [ta, tb, tc, td] = [V(0, 0.11, 0), V(0, -0.11, -0.035), V(0, -0.11, 0.035), V(-LT, 0.0, 0)].map(tk);
  push(outTri(ta, td, tb, V(0, 0, -1))); push(outTri(ta, td, tc, V(0, 0, 1)));

  // ---- wings (two layers, a centre crease and a flexing outer panel)
  const RF = V(0.4, 0.0, 0), RM = V(0, -0.045, 0.02), RR = V(-0.4, 0.0, 0), TP = V(-0.16, 0.0, 1.16);
  const fr = 0.55;
  const P1 = RF.clone().lerp(TP, fr), PM = RM.clone().lerp(TP, fr), P2 = RR.clone().lerp(TP, fr);
  const flexAx = P2.clone().sub(P1).normalize();
  const TPf = rotAxis(TP, P1, flexAx, -flex);
  const wingLocal = [[RF, RM, PM], [RF, PM, P1], [RM, RR, P2], [RM, P2, PM], [P1, PM, TPf], [PM, P2, TPf]];
  for (const side of [1, -1]) {
    const m = new THREE.Matrix4().makeTranslation(0, 0.37, side * 0.015).multiply(new THREE.Matrix4().makeRotationX(-side * om));
    for (const tri of wingLocal) {
      const pts = tri.map((p) => V(p.x, p.y, p.z * side));
      const top = pts.map((p) => p.clone().applyMatrix4(m));
      const bot = pts.map((p) => p.clone().add(V(0, -0.007, 0)).applyMatrix4(m));
      const up = V(0, 1, 0).applyAxisAngle(V(1, 0, 0), -side * om);
      push(outTri(top[0], top[1], top[2], up));
      push(outTri(bot[0], bot[1], bot[2], up.clone().negate()));
    }
  }

  // ---- global: settle, hop, lift-off (rise + nose-up + drift forward), presentation yaw
  const pitch = 13 * D2R * sine(liftP) + 2.5 * D2R * Math.sin(Math.PI * ph(u, 1.45, 0.4));
  // opens near side-on (neck, tail and the wing V read as a crane), turns toward camera as the wings spread
  const yaw = keys(u, [[U_CUT, -34], [1.42, -61], [2.217, -54]]) * D2R;
  const fwd = 0.7 * liftP * liftP;
  const pos = V(fwd * Math.cos(yaw), settle + hop + lift, -fwd * Math.sin(yaw));
  const G = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z)
    .multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationZ(pitch));
  const tris = T.map((x) => x.t.map((p) => p.clone().applyMatrix4(G)));
  // planar uv for the fibre texture
  const uvs = tris.map((t) => t.map((p) => [p.x * 0.35 + 0.5, p.z * 0.35 + p.y * 0.2 + 0.5]));
  return { tris, uvs, height: lift + hop, liftP, pos, drift: V(pos.x, 0, pos.z) };
};

// ───────────────────────────── backdrop: a warm paper cyclorama ─────────────────────────────
const cycGeometry = () => {
  const prof: number[][] = [[40, 0], [-6, 0]];
  const Rr = 5;
  for (let i = 1; i <= 24; i++) { const a = (i / 24) * (Math.PI / 2); prof.push([-6 - Math.sin(a) * Rr, Rr - Math.cos(a) * Rr]); }
  prof.push([-6 - Rr, 40]);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let arc = 0;
  prof.forEach((p, i) => {
    if (i > 0) arc += Math.hypot(p[0] - prof[i - 1][0], p[1] - prof[i - 1][1]);
    for (const x of [-40, 40]) { pos.push(x, p[1], p[0]); uv.push(x / 9, -arc / 9); }
  });
  for (let i = 0; i < prof.length - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face the camera side (+y on the floor, +z on the wall)
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  if (n.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
};

const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
const MAX_TRI = 160;

const Scene: React.FC<{ u: number; w: number; h: number; full: boolean }> = ({ u, w, h, full }) => {
  const { camera, scene, gl } = useThree();
  const tile = full && w / h > 0.7;
  const R = useMemo(() => {
    const fc = fibreCanvas();
    const fib = new THREE.CanvasTexture(fc); fib.wrapS = fib.wrapT = THREE.RepeatWrapping; fib.colorSpace = THREE.SRGBColorSpace; fib.anisotropy = 8;
    const bump = new THREE.CanvasTexture(fc); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
    const pc = paperCanvas();
    const fibB = new THREE.CanvasTexture(pc); fibB.wrapS = fibB.wrapT = THREE.RepeatWrapping; fibB.colorSpace = THREE.SRGBColorSpace; fibB.repeat.set(3, 3); fibB.anisotropy = 8;
    const bumpB = new THREE.CanvasTexture(pc); bumpB.wrapS = bumpB.wrapT = THREE.RepeatWrapping; bumpB.repeat.set(3, 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(MAX_TRI * 9), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(MAX_TRI * 9), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(MAX_TRI * 6), 2));
    const red = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.78, metalness: 0, map: fib, bumpMap: bump, bumpScale: 1.6, side: THREE.FrontSide });
    const cream = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.82, metalness: 0, map: fib, bumpMap: bump, bumpScale: 1.6, side: THREE.BackSide });
    const sh = new THREE.CanvasTexture(shadowCanvases().c);
    const shMat = new THREE.MeshBasicMaterial({ color: SHADOW, alphaMap: sh, transparent: true, depthWrite: false, opacity: 0.5 });
    const cyc = cycGeometry();
    const back = new THREE.MeshStandardMaterial({ color: BACKDROP, roughness: 0.95, metalness: 0, map: fibB, bumpMap: bumpB, bumpScale: 0.08, emissive: BACKDROP, emissiveIntensity: 0.22 });
    return { geo, red, cream, sh, shMat, cyc, back };
  }, []);

  // ---- paper geometry for this frame
  let tris: V3[][], uvs: number[][][];
  let shadow: { L: V3; blur: number; shrink: number; opacity: number; contact: number; span: number; cx: number; cz: number; anchor?: V3 };
  let camPos: V3, look: V3, fov: number;
  if (!full) {
    const sw = sheetWorld(u);
    tris = sw.tris; uvs = sw.uvs;
    const hgt = sw.ymin;
    shadow = { L: V(-0.42, 1, -0.32).normalize(), blur: 3 + 26 * hgt, shrink: 1, opacity: 0.42, contact: 0.5, span: 6, cx: 0.3, cz: 0.3 };
    // camera: high 3/4, slow orbit, pushing in as the form gets smaller
    const pin = Easing.bezier(0.4, 0, 0.3, 1)(clamp(u / U_CUT));
    const dist = lerp(10.4, 5.3, pin), el = lerp(52, 60, pin) * D2R, az = lerp(-6, 10, pin) * D2R;
    look = V(0, 0.15, 0.05);
    camPos = V(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist).add(look);
    fov = 30;
  } else {
    const cw = craneWorld(u, tile);
    tris = cw.tris; uvs = cw.uvs;
    const hh = cw.height;
    const k = clamp(hh / 2.6);
    shadow = { L: V(-0.3, 1, 0.24).normalize(), blur: 3.5 + 13 * k, shrink: 1 - 0.38 * k, opacity: 0.46 * (1 - 0.12 * k), contact: 0.7 * (1 - clamp(hh / 0.25)), span: 7, cx: 0.3, cz: -0.25, anchor: cw.drift.multiplyScalar(0.85) };
    const up = sine(ph(u, LIFT0 - 0.05, 2.217 - LIFT0 + 0.05));
    const t = ph(u, U_CUT, 2.217 - U_CUT);
    if (tile) {
      look = V(keys(u, [[U_CUT, 0.14], [1.3, 0.0]]), lerp(0.62, 1.45, up), 0);
      camPos = V(lerp(0.4, 0.25, t), lerp(1.7, 2.2, up), lerp(4.5, 4.25, t));
      fov = 34;
    } else {
      // close on the folding neck/head, pull back as the wings open, tilt up for the lift-off
      const dist = keys(u, [[U_CUT, 4.75], [1.28, 3.95], [1.5, 4.05], [2.217, 3.8]]);
      look = V(keys(u, [[U_CUT, 0.16], [1.3, 0.0]]), lerp(0.66, 1.05, up), 0);
      camPos = V(lerp(0.4, 0.2, t), lerp(1.55, 1.85, up), dist);
      fov = 40;
    }
  }

  // write triangles: offset each facet a hair along its red-side normal (stacked layers never z-fight)
  const pos = R.geo.getAttribute("position") as THREE.BufferAttribute;
  const nor = R.geo.getAttribute("normal") as THREE.BufferAttribute;
  const uva = R.geo.getAttribute("uv") as THREE.BufferAttribute;
  const n = Math.min(MAX_TRI, tris.length);
  const eps = full ? 0 : 0.004;
  for (let i = 0; i < n; i++) {
    const [a, b, c] = tris[i];
    const nn = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    [a, b, c].forEach((p, j) => {
      pos.setXYZ(i * 3 + j, p.x + nn.x * eps, p.y + nn.y * eps, p.z + nn.z * eps);
      nor.setXYZ(i * 3 + j, nn.x, nn.y, nn.z);
      uva.setXY(i * 3 + j, uvs[i][j][0], uvs[i][j][1]);
    });
  }
  R.geo.setDrawRange(0, n * 3);
  pos.needsUpdate = true; nor.needsUpdate = true; uva.needsUpdate = true;
  R.geo.computeBoundingSphere();

  // soft shadow on the backdrop
  paintShadow(tris, shadow.L, shadow.cx, shadow.cz, shadow.span, shadow.blur, shadow.shrink, shadow.contact, shadow.anchor);
  R.sh.needsUpdate = true;
  R.shMat.opacity = shadow.opacity;

  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = fov; cam.aspect = w / h; cam.near = 0.05; cam.far = 120;
    cam.position.copy(camPos); cam.up.set(0, 1, 0); cam.lookAt(look); cam.updateProjectionMatrix();
    gl.toneMapping = THREE.NeutralToneMapping; gl.toneMappingExposure = 1.0;
    scene.background = new THREE.Color(BACKDROP);
    let env = envCache.get(gl);
    if (!env) {
      const pm = new THREE.PMREMGenerator(gl);
      env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      envCache.set(gl, env);
    }
    scene.environment = env;
    (scene as any).environmentIntensity = 0.22;
  });

  const keyPos: [number, number, number] = full ? [-3.2, 6.5, 4.2] : [-4.5, 9, -3.2];
  const fillPos: [number, number, number] = full ? [4, 2.2, 3] : [4, 3, 6];
  return (
    <>
      <hemisphereLight args={["#FFF7EC", "#E8D3B4", 0.65]} />
      <directionalLight position={keyPos} intensity={2.9} color="#FFF0DC" />
      <directionalLight position={fillPos} intensity={0.3} color="#FFE7D2" />
      <directionalLight position={full ? [1.5, 3, -5] : [3, 4, -6]} intensity={0.55} color="#FFE2C4" />
      {full && <directionalLight position={[0.3, -0.35, 3]} intensity={2.3} color="#FFD6BC" />}
      <mesh geometry={R.cyc} material={R.back} />
      <mesh position={[shadow.cx, 0.002, shadow.cz]} rotation={[-Math.PI / 2, 0, 0]} material={R.shMat} renderOrder={1}>
        <planeGeometry args={[shadow.span, shadow.span]} />
      </mesh>
      <mesh geometry={R.geo} material={R.red} renderOrder={2} frustumCulled={false} />
      <mesh geometry={R.geo} material={R.cream} renderOrder={2} frustumCulled={false} />
    </>
  );
};

export const Origami: React.FC<StyleProps> = ({ u, w, h, full }) => (
  <div style={{ position: "absolute", inset: 0, background: BACKDROP }}>
    <ThreeCanvas width={Math.round(w)} height={Math.round(h)} camera={{ fov: 30, position: [0, 8, 6] }} gl={{ antialias: true }}>
      <Scene u={u} w={w} h={h} full={full} />
    </ThreeCanvas>
    {/* soft warm vignette: keeps the eye on the paper */}
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 80% 70% at 48% 50%, rgba(255,250,240,0) 55%, rgba(120,90,60,0.16) 100%)" }} />
  </div>
);
