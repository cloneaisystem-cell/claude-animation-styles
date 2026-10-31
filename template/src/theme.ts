// Shared helpers: 9:16 1080×1920, 60 fps, easing, a deterministic hash, and the musical clock the styles were timed to.
import { Easing } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

export const INTER = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;

export const FPS = 60;
export const W = 1080;
export const H = 1920;
export const clamp = (v: number, a = 0, z = 1) => Math.min(z, Math.max(a, v));
export const lerp = (a: number, z: number, t: number) => a + (z - a) * t;
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
export const backOut = Easing.bezier(0.34, 1.56, 0.64, 1);
export const prog = (t: number, t0: number, dur: number, e = easeOut) => e(clamp((t - t0) / dur));
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** the beat the styles were cut to: one hit every 1.379 s (two hits = one style) */
export const NOTE0 = 0.0906;
export const NOTE_P = 1.37929;
export const note = (k: number) => NOTE0 + NOTE_P * k;
/** frame of note k (nearest frame) */
export const noteF = (k: number) => Math.round(note(k) * FPS);
