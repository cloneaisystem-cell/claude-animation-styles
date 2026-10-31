// /watercolor — "pigment blooms on paper" (grid-only bonus style): on rough cold-press paper, a warm sunset wash blooms
// outward, a dark ridge of hills blooms up from the bottom, a small red sun appears, the edges darken as the pigment dries,
// granulation specks settle, and a fine hand-lettered title writes itself. Pure function of u (τ = u − U_FULL).
import React, { useLayoutEffect, useRef } from "react";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import type { StyleProps } from "../types";
import { clamp, easeInOut, easeOut, hash } from "../theme";
import { U_FULL } from "../timing";

const CAVEAT = loadCaveat("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily;

/** smooth 1D value noise, periodic over n samples */
const noise1 = (x: number, seed: number, n = 64) => {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  const a = hash(((i % n) + n) % n * 1.37 + seed * 91.7), b = hash((((i + 1) % n) + n) % n * 1.37 + seed * 91.7);
  return a + (b - a) * s;
};
/** a wobbly watercolour edge radius around angle th */
const edge = (th: number, seed: number) => {
  const x = (th / (Math.PI * 2)) * 24;
  return 0.62 * noise1(x, seed, 24) + 0.28 * noise1(x * 2.7, seed + 3, 65) + 0.1 * noise1(x * 7.1, seed + 7, 171);
};

let paperCache: { w: number; h: number; c: HTMLCanvasElement } | null = null;
const paper = (w: number, h: number) => {
  if (paperCache && paperCache.w === w && paperCache.h === h) return paperCache.c;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = "#F3EEE2"; x.fillRect(0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  // cold-press tooth: soft blotchy bumps + fine grain
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    const bump = noise1(i / 9 + noise1(j / 13, 5) * 3, Math.floor(j / 7) + 11) * 0.5 + noise1(j / 8, Math.floor(i / 6) + 23) * 0.5;
    const v = (bump - 0.5) * 16 + (hash(i * 7.31 + j * 3.17) - 0.5) * 7;
    d[k] += v; d[k + 1] += v; d[k + 2] += v * 0.9;
  }
  x.putImageData(img, 0, 0);
  paperCache = { w, h, c };
  return c;
};

let artCanvas: HTMLCanvasElement | null = null;
const art = (w: number, h: number) => {
  if (!artCanvas || artCanvas.width !== w || artCanvas.height !== h) { artCanvas = document.createElement("canvas"); artCanvas.width = w; artCanvas.height = h; }
  return artCanvas;
};

let maskCanvas: HTMLCanvasElement | null = null;
const mask = (w: number, h: number) => {
  if (!maskCanvas || maskCanvas.width !== w || maskCanvas.height !== h) { maskCanvas = document.createElement("canvas"); maskCanvas.width = w; maskCanvas.height = h; }
  return maskCanvas;
};

export const Watercolor: React.FC<StyleProps> = ({ u, w, h }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const tau = u - U_FULL;
  useLayoutEffect(() => {
    const W = Math.round(w), H = Math.round(h);
    const cv = ref.current!;
    const x = cv.getContext("2d")!;
    const S = Math.min(W, H);
    const A = art(W, H), a = A.getContext("2d")!;
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalCompositeOperation = "source-over"; a.globalAlpha = 1; a.clearRect(0, 0, W, H);
    const horizon = H * 0.63;
    const cx = W * 0.5, cy = H * 0.6;
    const blob = (c: CanvasRenderingContext2D, rx: number, ry: number, seed: number) => {
      c.beginPath();
      for (let i = 0; i <= 180; i++) {
        const th = (i / 180) * Math.PI * 2;
        const k = 0.8 + 0.4 * edge(th, seed);
        const px = cx + Math.cos(th) * rx * k, py = cy + Math.sin(th) * ry * k;
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.closePath();
    };
    const bloom = easeOut(clamp(tau / 0.55));                // the wet wash spreads outward
    const dry = easeOut(clamp((tau - 0.75) / 0.5));          // edges darken as the pigment dries
    // 1. sunset sky: red at the top → ochre at the horizon
    const gr = a.createLinearGradient(0, H * 0.2, 0, horizon);
    gr.addColorStop(0, "#B5352A"); gr.addColorStop(0.5, "#D4613A"); gr.addColorStop(1, "#E6A84A");
    a.fillStyle = gr; a.fillRect(0, 0, W, H);
    // soft streaks of a second wash in the sky
    for (let L = 0; L < 4; L++) {
      a.globalAlpha = 0.16; a.fillStyle = "#A8291F";
      a.beginPath();
      const y0 = H * (0.26 + L * 0.07);
      a.moveTo(0, y0);
      for (let i = 0; i <= 60; i++) a.lineTo((i / 60) * W, y0 + H * 0.03 * (noise1(i / 6, L + 30) - 0.5) * 2);
      for (let i = 60; i >= 0; i--) a.lineTo((i / 60) * W, y0 + H * 0.022 + H * 0.02 * noise1(i / 5, L + 50));
      a.closePath(); a.fill();
    }
    a.globalAlpha = 1;
    // 3. the small red sun
    const sunG = easeOut(clamp((tau - 0.5) / 0.3));
    if (sunG > 0) {
      a.fillStyle = "#9E2018";
      for (let L = 0; L < 3; L++) {
        a.globalAlpha = L ? 0.3 : 0.9;
        a.beginPath();
        for (let i = 0; i <= 90; i++) {
          const th = (i / 90) * Math.PI * 2, r = S * 0.07 * sunG * (0.94 + 0.12 * edge(th, 40 + L) + L * 0.05);
          const px = W * 0.64 + Math.cos(th) * r, py = horizon - H * 0.1 + Math.sin(th) * r;
          i ? a.lineTo(px, py) : a.moveTo(px, py);
        }
        a.fill();
      }
      a.globalAlpha = 1;
    }
    // 2. hills: far ridge, then the near ridge, rising from the bottom while wet
    const ridge = (base: number, amp: number, seed: number, color: string, t0: number) => {
      const g = easeOut(clamp((tau - t0) / 0.42));
      if (g <= 0) return;
      const lift = (1 - g) * H * 0.35;
      for (let L = 0; L < 4; L++) {
        a.globalAlpha = L === 0 ? 0.75 : 0.18;
        a.fillStyle = color;
        a.beginPath(); a.moveTo(0, H);
        for (let i = 0; i <= 120; i++) {
          const fx = i / 120;
          const y = base + lift - amp * (0.55 * noise1(fx * 5, seed) + 0.35 * noise1(fx * 13, seed + 4) + 0.1 * noise1(fx * 37, seed + 9 + L));
          a.lineTo(fx * W, y + L * S * 0.005);
        }
        a.lineTo(W, H); a.closePath(); a.fill();
      }
      a.globalAlpha = 1;
    };
    ridge(horizon + H * 0.03, H * 0.18, 3, "#86372A", 0.28);
    ridge(horizon + H * 0.15, H * 0.15, 8, "#3B211A", 0.42);
    // 4. granulation specks
    const gran = clamp((tau - 0.75) / 0.4);
    for (let i = 0; i < 520 && gran > 0; i++) {
      const px = hash(i * 3.7) * W, py = H * 0.2 + hash(i * 9.1 + 2) * H * 0.8;
      a.globalAlpha = gran * 0.45 * hash(i * 5.5);
      a.fillStyle = py > horizon ? "#21120E" : "#7E2A1C";
      a.fillRect(px, py, S * 0.004, S * 0.004);
    }
    a.globalAlpha = 1;
    // the painting lives inside a soft, uneven bloom shape (white paper around it)
    const rx = W * 0.47 * (0.25 + 0.75 * bloom), ry = H * 0.355 * (0.25 + 0.75 * bloom);
    const M = mask(W, H), m = M.getContext("2d")!;
    m.globalCompositeOperation = "source-over"; m.clearRect(0, 0, W, H); m.fillStyle = "#000";
    // layered blobs: solid core + softer, uneven outer rings
    // a soft, feathered outer bloom, then the crisp wet core on top
    // wet edges: a wide feathered bleed, an uneven mid layer, then a soft core (no hard cut-out edge)
    m.filter = `blur(${S * 0.02}px)`; m.globalAlpha = 0.5; blob(m, rx * 1.07, ry * 1.07, 1.31); m.fill();
    m.filter = `blur(${S * 0.009}px)`; m.globalAlpha = 0.7; blob(m, rx * 1.02, ry * 1.02, 1.77); m.fill();
    m.filter = `blur(${S * 0.006}px)`; m.globalAlpha = 1; blob(m, rx * 0.97, ry * 0.97, 1); m.fill();
    m.filter = "none"; m.globalAlpha = 1;
    a.globalCompositeOperation = "destination-in";
    a.drawImage(M, 0, 0);
    a.globalCompositeOperation = "source-over"; a.globalAlpha = 1;

    // compose: paper, painting multiplied into it, darker pigment rim, title
    const z = 1 + 0.045 * easeInOut(clamp(tau / 1.38)); // slow push-in, never frozen
    x.setTransform(z, 0, 0, z, (W - W * z) / 2, (H - H * z) * 0.5);
    x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    x.drawImage(paper(W, H), 0, 0);
    x.globalCompositeOperation = "multiply";
    x.globalAlpha = 0.92; x.drawImage(A, 0, 0);
    x.globalAlpha = 0.18 + 0.4 * dry;
    x.strokeStyle = "#A8382A"; x.lineWidth = S * 0.011; x.filter = `blur(${S * 0.006}px)`;
    blob(x, rx * 0.98, ry * 0.98, 1); x.stroke();
    x.filter = "none"; x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    const txt = clamp((tau - 0.78) / 0.45);
    if (txt > 0) {
      x.save();
      x.font = `700 ${S * 0.1}px ${CAVEAT}`;
      x.textAlign = "center"; x.textBaseline = "middle";
      const tw = x.measureText("slow mornings").width;
      x.beginPath(); x.rect(W / 2 - tw / 2 - S * 0.02, H * 0.02, (tw + S * 0.04) * easeInOut(txt), H * 0.16); x.clip();
      x.fillStyle = "#3A1E17"; x.globalAlpha = 0.88;
      x.fillText("slow mornings", W / 2, H * 0.095);
      x.restore();
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
  });
  return <canvas ref={ref} width={Math.round(w)} height={Math.round(h)} style={{ position: "absolute", inset: 0, width: w, height: h }} />;
};
