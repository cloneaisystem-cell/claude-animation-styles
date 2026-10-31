// Every style is a pure function of u (seconds on its own clock) at any size w×h. full = the closer, "after the cut" framing.
export type StyleProps = { u: number; w: number; h: number; full: boolean };
