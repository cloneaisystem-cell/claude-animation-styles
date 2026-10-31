// /particles — "10,000 dots find a face": the card's dot-matrix render IS the particles. The dots lift into a swirl,
// fly back and land as a halftone portrait of a portrait (public/portrait.png), then a ripple passes.
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { FPS, clamp, easeInOut, easeOut, hash, lerp, noteF } from "../theme";

/** loop 1: the card appears at 0.30 s; the card → full-screen cut is on piano note 1 */
const U_CUT = noteF(1) / FPS - 0.3;

const COLS = 75, ROWS = 134; // 10,050 dots (the command says "10,000 dots")
type Dot = { r: number; g: number; b: number; v: number; d: number; h1: number; h2: number; h3: number };
export const EYE = { x: 0.6, y: 0.4 };
let cache: Dot[] | null = null;
let pending: Promise<Dot[]> | null = null;

const sample = (): Promise<Dot[]> => {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = COLS; c.height = ROWS;
      const x = c.getContext("2d")!;
      // background: the avatar's red glow extended to 9:16
      const g = x.createRadialGradient(COLS * 0.55, ROWS * 0.42, 2, COLS * 0.55, ROWS * 0.42, ROWS * 0.62);
      g.addColorStop(0, "#7a1a10"); g.addColorStop(0.45, "#3d0c08"); g.addColorStop(1, "#080404");
      x.fillStyle = g; x.fillRect(0, 0, COLS, ROWS);
      const s = COLS * 1.18; // avatar size in cells
      const il = (COLS - s) / 2 - COLS * 0.04, it = ROWS * 0.4 - s * 0.5;
      x.drawImage(img, il, it, s, s);
      EYE.x = (il + s * 0.713) / COLS; EYE.y = (it + s * 0.42) / ROWS;
      // blend the square's bottom edge into the dark (no seam)
      const yb = it + s;
      const fade = x.createLinearGradient(0, yb - s * 0.16, 0, yb);
      fade.addColorStop(0, "rgba(8,4,4,0)"); fade.addColorStop(1, "rgba(8,4,4,1)");
      x.fillStyle = fade; x.fillRect(0, yb - s * 0.16, COLS, s * 0.16);
      x.fillStyle = "#080404"; x.fillRect(0, yb - 0.5, COLS, ROWS);
      const px = x.getImageData(0, 0, COLS, ROWS).data;
      const dots: Dot[] = [];
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        const k = (j * COLS + i) * 4;
        const r = px[k], gg = px[k + 1], b = px[k + 2];
        const v = Math.min(1, Math.pow(Math.min(1, (Math.max(r, gg, b) / 255) * 1.9), 0.8));
        const dx = i / COLS - EYE.x, dy = j / ROWS - EYE.y;
        const n = j * COLS + i;
        dots.push({ r, g: gg, b, v, d: Math.sqrt(dx * dx + dy * dy * 0.35), h1: hash(n * 1.7), h2: hash(n * 3.3 + 9), h3: hash(n * 5.1 + 2) });
      }
      cache = dots; res(dots);
    };
    img.src = staticFile("portrait.png");
  });
  return pending;
};

export const Particles: React.FC<{ u: number; w: number; h: number; full: boolean }> = ({ u, w, h }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [dots, setDots] = useState<Dot[] | null>(cache);
  const [handle] = useState(() => (cache ? null : delayRender("particles avatar")));
  useEffect(() => {
    if (dots) return;
    let on = true;
    sample().then((d) => { if (!on) return; setDots(d); if (handle !== null) continueRender(handle); });
    return () => { on = false; };
  }, []);

  useLayoutEffect(() => {
    const cv = ref.current; if (!cv || !dots) return;
    const x = cv.getContext("2d")!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = "#0a0607"; x.fillRect(0, 0, w, h);
    const cw = w / COLS, chh = h / ROWS;
    const cxp = w * EYE.x - w * 0.08, cyp = h * EYE.y;
    const post = u - U_CUT;                     // seconds after the snap (= the card → full-screen cut, on a piano note)
    const snapped = post >= 0;
    const push = snapped ? 1.16 + 0.05 * easeInOut(clamp(post / 1.38)) : 1 + 0.035 * clamp(u / U_CUT);   // cut closer on the snap, then a slow push
    x.translate(w / 2, h * 0.45); x.scale(push, push); x.translate(-w / 2, -h * 0.45);
    const R = Math.max(w, h) * 0.5;
    const flash = snapped ? Math.exp(-post / 0.14) : 0;                // rim ignition on the note
    const breathe = snapped ? 0.06 * Math.sin(2 * Math.PI * post * (76 / 60)) : 0;
    const sweep = clamp((post - 0.73) / 0.4);                          // rim light crown → chin (t 2.2–2.6)
    const bandY = lerp(EYE.y - 0.2, EYE.y + 0.2, easeInOut(sweep));
    const stream = Math.max(0, post - 1.23);                           // t ≥ 2.70: dots stream out into the cut
    const gain = 1.75;
    for (let n = 0; n < dots.length; n++) {
      const D = dots[n];
      const i = n % COLS, j = (n / COLS) | 0;
      const tx = (i + 0.5) * cw, ty = (j + 0.5) * chh;
      const final = Math.max(0.12, Math.min(1, 0.12 + 0.88 * D.v));
      const rFinal = cw * 0.52 * final;
      // 1) brightness-mapped cream dot matrix (readable silhouette by ~0.25 s)
      const inA = easeOut(clamp((u - (j / ROWS) * 0.12) / 0.08));
      // 2) the dots peel off into a swirl and fly back (~70 % formed by t ≈ 1.1 s); 3) snap on the note
      const peel = easeOut(clamp((u - 0.25 - D.h3 * 0.05) / 0.15));
      const ret = easeInOut(clamp((u - 0.38 - D.d * 0.25 - D.h3 * 0.06) / 0.5));   // lands just before the snap
      const disp = snapped ? 0 : peel * (1 - ret);
      // a twirl around the eye (the face stays readable while it moves), plus a little scatter
      const dx = tx - cxp, dy = ty - cyp, dist = Math.sqrt(dx * dx + dy * dy);
      const th = disp * 0.62 * (1 + 0.25 * D.h3) * Math.exp(-dist / (0.7 * R));
      const sc = 1 + disp * 0.05 * (D.h2 - 0.5);
      let px = cxp + (dx * Math.cos(th) - dy * Math.sin(th)) * sc + disp * R * 0.025 * (D.h1 - 0.5);
      let py = cyp + (dx * Math.sin(th) + dy * Math.cos(th)) * sc + disp * R * 0.025 * (D.h2 - 0.5);
      if (stream > 0) { const k = stream * stream * (0.6 + D.h1); px += k * w * 6; py -= k * h * 0.7 * (D.h2 - 0.35); }
      let r = rFinal * inA * (snapped ? 1 + breathe : lerp(1, 0.78 + 0.15 * D.h1, disp));
      let glow = 0;
      if (snapped && D.v > 0.45 && sweep > 0 && sweep < 1) { const dy = ty / h - bandY; glow = Math.exp(-(dy * dy) / 0.0022); }
      glow = Math.max(glow, flash * (D.v > 0.45 ? 1 : 0.12));
      r *= 1 + glow * 0.35;
      if (r < 0.25) continue;
      let cr: number, cg: number, cb: number, a: number;
      if (!snapped) { cr = 250; cg = 238; cb = 196; a = 0.72 * inA * (1 - 0.2 * disp); }
      else {
        const g2 = gain * (1 + 0.45 * glow);
        cr = Math.min(255, D.r * g2 + 60 * glow); cg = Math.min(255, D.g * g2 + 50 * glow); cb = Math.min(255, D.b * g2 + 30 * glow); a = 1;
      }
      if (stream > 0) a *= clamp(1 - stream * 2.5 * D.h1);
      x.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${a})`;
      x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
      if (snapped && (D.v > 0.6 || glow > 0.25)) {
        x.fillStyle = `rgba(255,${(160 + 60 * glow) | 0},${(110 + 50 * glow) | 0},${(0.08 + 0.16 * glow) * a})`;
        x.beginPath(); x.arc(px, py, r * 2.1, 0, Math.PI * 2); x.fill();
      }
    }
  });
  return <canvas ref={ref} width={Math.round(w)} height={Math.round(h)} style={{ width: w, height: h, display: "block" }} />;
};
