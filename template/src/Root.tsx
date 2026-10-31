// One composition per style (1080×1920, 60 fps), plus your own versions from src/my/index.ts.
// Render: npx remotion render src/index.ts <id> out/<id>.mp4   ·   Preview: npm run studio
import React from "react";
import { AbsoluteFill, Composition, useCurrentFrame } from "remotion";
import { FPS, W, H, noteF } from "./theme";
import { U_END, U_FULL } from "./timing";
import type { StyleProps } from "./types";
import { MY } from "./my";
import { Particles } from "./styles/Particles";
import { FlightPath } from "./styles/FlightPath";
import { Neon } from "./styles/Neon";
import { CaseBoard } from "./styles/CaseBoard";
import { Origami } from "./styles/Origami";
import { Exploded } from "./styles/Exploded";
import { FrontPage } from "./styles/FrontPage";
import { Watercolor } from "./styles/Watercolor";
import { Stat3D } from "./styles/Stat3D";

/** particles: the dots snap into the portrait on the first beat */
const P_CUT = noteF(1) / FPS - 0.3, P_END = noteF(2) / FPS - 0.3;

export type StyleDef = { id: string; Style: React.FC<StyleProps>; u0: number; u1: number; fullAt: number };
export const BASE: StyleDef[] = [
  { id: "particles", Style: Particles, u0: 0.0, u1: P_END, fullAt: P_CUT },
  { id: "flight-path", Style: FlightPath, u0: 0.0, u1: U_END, fullAt: U_FULL },
  { id: "neon", Style: Neon, u0: 0.0, u1: U_END, fullAt: U_FULL },
  { id: "case-board", Style: CaseBoard, u0: 0.0, u1: U_END, fullAt: U_FULL },
  { id: "origami", Style: Origami, u0: 0.0, u1: U_END, fullAt: U_FULL },
  { id: "exploded", Style: Exploded, u0: 0.0, u1: U_END, fullAt: U_FULL },
  { id: "front-page", Style: FrontPage, u0: U_FULL, u1: U_FULL + 2.2, fullAt: U_FULL },
  { id: "watercolor", Style: Watercolor, u0: U_FULL, u1: U_FULL + 2.2, fullAt: U_FULL },
  { id: "stat-3d", Style: Stat3D, u0: U_FULL, u1: U_FULL + 2.2, fullAt: U_FULL },
];
const byId = Object.fromEntries(BASE.map((b) => [b.id, b]));

const Play: React.FC<{ def: StyleDef }> = ({ def }) => {
  const u = def.u0 + useCurrentFrame() / FPS;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <def.Style u={u} w={W} h={H} full={u >= def.fullAt} />
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => (
  <>
    {[...BASE, ...MY.map((m) => ({ ...byId[m.base], id: m.id, Style: m.Style }))].map((d) => (
      <Composition key={d.id} id={d.id} component={() => <Play def={d} />}
        durationInFrames={Math.round((d.u1 - d.u0) * FPS)} fps={FPS} width={W} height={H} />
    ))}
  </>
);
