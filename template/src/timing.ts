// Each style has two acts: a first framing, then a hard cut to a closer framing at U_FULL ("Then cut closer" in the prompts).
import { FPS } from "./theme";

export const BODY_TIMES = { send: 0.45, status: 0.55, card: 0.55 };
export const SEG_FULL_F = 83;
export const SEG_F = 166;
/** u at the cut to the closer framing, and at the end */
export const U_FULL = SEG_FULL_F / FPS - BODY_TIMES.card; // 0.833 s
export const U_END = SEG_F / FPS - BODY_TIMES.card; // 2.217 s
