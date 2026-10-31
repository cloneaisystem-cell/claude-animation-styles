// /front-page — "the paper spins in" (grid-only bonus style): an old-movie newspaper spin. A broadsheet spins in from the
// dark, slams flat to camera with a bounce and a dust puff, then the camera drifts in while dust motes float in a light beam.
// Pure function of u; the grid shows u = U_FULL … U_END (τ = u − U_FULL = 0 … 1.38 s).
import React from "react";
import { loadFont as loadBlack } from "@remotion/google-fonts/UnifrakturMaguntia";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadOld } from "@remotion/google-fonts/OldStandardTT";
import type { StyleProps } from "../types";
import { clamp, easeOut, hash, lerp } from "../theme";
import { U_FULL } from "../timing";

const BLACK = loadBlack("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily;
const PLAYFAIR = loadPlayfair("normal", { weights: ["900"], subsets: ["latin"] }).fontFamily;
const OLD = loadOld("normal", { weights: ["400", "700"], subsets: ["latin"] }).fontFamily;
const OLD_I = loadOld("italic", { weights: ["400"], subsets: ["latin"] }).fontFamily;

const INK = "#1E1A16", PAPER = "#EFE8D8";
const SLAM = 0.42; // τ of the slam

/** halftone "photo": a city skyline at dusk, dot size = darkness */
const Halftone: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const cols = 46, rows = Math.round((cols * h) / w);
  const cell = w / cols;
  const sky = (x: number, y: number) => 0.18 + 0.5 * y; // darker towards the ground
  const bld = (x: number) => {
    const i = Math.floor(x * 14);
    return 0.38 + 0.42 * hash(i * 7.3 + 1) * (0.5 + 0.5 * Math.sin(i * 1.7));
  };
  const dots: React.ReactNode[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i + 0.5) / cols, y = (j + 0.5) / rows;
    const top = 1 - bld(x);
    let d = y > top ? 0.82 + 0.12 * hash(i * 3 + j) : sky(x, y);
    const sx = x - 0.72, sy = y - 0.28; // low sun
    if (sx * sx + sy * sy < 0.012) d = 0.05;
    if (y > top && hash(i * 13.1 + j * 7.7) > 0.86 && (j % 2 === 0)) d = 0.25; // lit windows
    const r = (cell / 2) * Math.sqrt(clamp(d)) * 1.08;
    dots.push(<circle key={j * cols + i} cx={(i + 0.5) * cell} cy={(j + 0.5) * cell} r={r} fill={INK} />);
  }
  return <svg width={w} height={h} style={{ display: "block", background: PAPER }}>{dots}</svg>;
};

const COPY = [
  "A single sentence, typed into a chat window late on Friday, produced a finished animation before the kettle boiled, witnesses said.",
  "The method, now spreading among editors and designers, asks for nothing more than a clear description of the scene and its timing.",
  "Critics called it a passing trend. By Saturday morning nine distinct styles had been built the same way, each from its own prompt.",
  "Readers who wish to try it are advised to change the words, keep the structure, and expect to be surprised.",
];

const Paper: React.FC<{ pw: number; ph: number }> = ({ pw, ph }) => {
  const s = pw / 400; // layout unit
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, color: INK, padding: `${14 * s}px ${16 * s}px`, boxSizing: "border-box", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: OLD, fontSize: 8.5 * s, letterSpacing: 0.6 * s, borderBottom: `${1 * s}px solid ${INK}`, paddingBottom: 3 * s }}>
        <span>VOL. IX · No. 1</span><span>LATE EDITION</span><span>TWENTY-FIVE CENTS</span>
      </div>
      <div style={{ fontFamily: BLACK, fontSize: 50 * s, textAlign: "center", lineHeight: 1.12, marginTop: 4 * s }}>The Daily Prompt</div>
      <div style={{ borderTop: `${2.2 * s}px solid ${INK}`, borderBottom: `${0.8 * s}px solid ${INK}`, height: 2.5 * s, marginTop: 3 * s }} />
      <div style={{ fontFamily: OLD, fontSize: 8 * s, textAlign: "center", letterSpacing: 1 * s, margin: `${3 * s}px 0` }}>SATURDAY, NOVEMBER 1, 2026 · ALL THE STYLES FIT TO PRINT</div>
      <div style={{ borderTop: `${0.8 * s}px solid ${INK}`, marginBottom: 6 * s }} />
      <div style={{ fontFamily: PLAYFAIR, fontWeight: 900, fontSize: 41 * s, lineHeight: 0.98, textAlign: "center", letterSpacing: -0.5 * s }}>
        NINE STYLES.<br />NINE PROMPTS.
      </div>
      <div style={{ fontFamily: OLD_I, fontSize: 12.5 * s, textAlign: "center", margin: `${6 * s}px 0 ${7 * s}px` }}>
        Each one starts as a paragraph of plain English, and the town can’t stop talking
      </div>
      <div style={{ display: "flex", gap: 9 * s }}>
        <div style={{ flex: "0 0 58%" }}>
          <div style={{ border: `${0.8 * s}px solid ${INK}` }}><Halftone w={pw * 0.58 - 34 * s * 0.58} h={ph * 0.27} /></div>
          <div style={{ fontFamily: OLD_I, fontSize: 7.5 * s, marginTop: 3 * s }}>The skyline at dusk, minutes before the first render.</div>
        </div>
        <div style={{ flex: 1, fontFamily: OLD, fontSize: 7.6 * s, lineHeight: 1.32, textAlign: "justify" }}>
          <b style={{ fontSize: 9 * s }}>CITY DESK.</b> {COPY[0]} {COPY[1]}
        </div>
      </div>
      <div style={{ columnCount: 3, columnGap: 9 * s, columnRule: `${0.6 * s}px solid rgba(30,26,22,0.4)`, fontFamily: OLD, fontSize: 7.6 * s, lineHeight: 1.32, textAlign: "justify", marginTop: 8 * s, borderTop: `${0.8 * s}px solid ${INK}`, paddingTop: 5 * s }}>
        {COPY[2]} {COPY[3]} {COPY[0]} {COPY[1]} {COPY[2]} {COPY[3]}
      </div>
    </div>
  );
};

export const FrontPage: React.FC<StyleProps> = ({ u, w, h }) => {
  const tau = u - U_FULL;
  const p = clamp(tau / SLAM);
  const pw = Math.min(w * 0.9, h * 0.66), ph = pw * 1.36;
  // spin in: accelerating towards the camera, abrupt stop (classic newsreel spin)
  const spinScale = (q: number) => 0.04 + 0.96 * Math.pow(q, 1.7);
  const spinRot = (q: number) => 1080 * Math.pow(1 - q, 1.35);
  const after = tau - SLAM;
  const bounce = after > 0 ? 0.045 * Math.exp(-after / 0.07) * Math.cos(after * 55) : 0;
  const drift = after > 0 ? 0.075 * easeOut(clamp(after / 1.0)) : 0;
  const scale = p < 1 ? spinScale(p) : 1 + bounce + drift;
  const rot = p < 1 ? spinRot(p) : -1.2 * easeOut(clamp(after / 0.6));
  const shake = after > 0 && after < 0.1 ? (hash(Math.floor(after * 60)) - 0.5) * w * 0.02 * (1 - after / 0.1) : 0;
  const tilt = after > 0 ? lerp(7, 2.5, easeOut(clamp(after / 0.9))) : 7;
  const ghosts = p < 1 ? [0.06, 0.12, 0.18] : [];
  const paperStyle = (sc: number, r: number, op: number): React.CSSProperties => ({
    position: "absolute", left: w / 2 - pw / 2, top: h / 2 - ph / 2, width: pw, height: ph, opacity: op,
    transform: `translate(${shake}px, ${shake * 0.6}px) perspective(${w * 3}px) rotateX(${tilt}deg) rotate(${r}deg) scale(${sc})`,
    boxShadow: `0 ${pw * 0.03}px ${pw * 0.09}px rgba(0,0,0,0.55)`,
  });
  // dust motes in the light beam + a puff at the slam
  const motes = Array.from({ length: 34 }, (_, i) => {
    const x = (hash(i * 3.1) + tau * 0.03 * (hash(i) - 0.5)) % 1;
    const y = (hash(i * 7.7) - tau * 0.05 * (0.4 + hash(i * 2.2)) + 1) % 1;
    return { x, y, r: (0.6 + 1.6 * hash(i * 5.3)) * (w / 444), a: 0.25 + 0.5 * hash(i * 9.1) };
  });
  const puff = after > 0 ? Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + hash(i) * 0.3;
    const d = easeOut(clamp(after / 0.5)) * pw * (0.55 + 0.25 * hash(i * 4.4));
    return { x: w / 2 + Math.cos(a) * d * 0.95, y: h / 2 + Math.sin(a) * d * 1.25, r: (2 + 4 * hash(i * 2.9)) * (w / 444), o: 0.55 * (1 - clamp(after / 0.6)) };
  }) : [];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "radial-gradient(ellipse at 50% 45%, #3A2E25 0%, #17110D 60%, #090706 100%)" }}>
      {/* light beam from the top left */}
      <div style={{ position: "absolute", left: -w * 0.3, top: -h * 0.2, width: w * 0.9, height: h * 1.6, transform: "rotate(-24deg)", transformOrigin: "50% 0",
        background: "linear-gradient(90deg, rgba(255,226,180,0) 0%, rgba(255,226,180,0.10) 45%, rgba(255,226,180,0) 100%)" }} />
      {ghosts.map((g, i) => {
        const q = clamp(p - g);
        return <div key={i} style={paperStyle(spinScale(q), spinRot(q), 0.22 - i * 0.06)}><Paper pw={pw} ph={ph} /></div>;
      })}
      <div style={paperStyle(scale, rot, 1)}>
        <Paper pw={pw} ph={ph} />
        {/* the paper's slight curl: light falls off towards the right edge */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(100deg, rgba(255,250,235,0.10) 0%, rgba(0,0,0,0) 45%, rgba(40,25,10,0.22) 100%)" }} />
      </div>
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        {motes.map((m, i) => <circle key={i} cx={m.x * w} cy={m.y * h} r={m.r} fill="#FFE7C2" opacity={m.a * (m.x < 0.75 - m.y * 0.4 ? 1 : 0.25)} />)}
        {puff.map((m, i) => <circle key={"p" + i} cx={m.x} cy={m.y} r={m.r} fill="#D8CDBB" opacity={m.o} />)}
      </svg>
    </div>
  );
};
