// /flight-path — "the globe spins, the flight draws itself": clay-white 3D globe (real coastlines, world-atlas 50m),
// a blue great-circle arc draws Bucharest → Tokyo while a small white jet rides it; the camera follows and dives;
// a red pin drops on Tokyo. Pure function of u (seconds since the card appeared).
import React, { useLayoutEffect, useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
// @ts-ignore no types bundled
import { feature } from "topojson-client";
import { geoEquirectangular, geoGraticule10, geoPath } from "d3-geo";
// @ts-ignore json module
import land50 from "world-atlas/land-50m.json";
import { FPS, INTER, clamp, easeIn, easeInOut, easeOut, lerp, noteF } from "../theme";

const A = { lat: 44.4268, lon: 26.1025 }; // Bucharest
const B = { lat: 35.6762, lon: 139.6503 }; // Tokyo
const BLUE = "#1E78FF", RED = "#E5483C";

/** lat/lon → unit vector, matching three's SphereGeometry UVs with an equirectangular map (north up) */
const ll = (lat: number, lon: number) => {
  const phi = ((lon + 180) * Math.PI) / 180, th = ((90 - lat) * Math.PI) / 180;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
};
const VA = ll(A.lat, A.lon), VB = ll(B.lat, B.lon);
const OMEGA = VA.angleTo(VB);
const slerp = (s: number) => {
  const a = Math.sin((1 - s) * OMEGA) / Math.sin(OMEGA), b = Math.sin(s * OMEGA) / Math.sin(OMEGA);
  return VA.clone().multiplyScalar(a).add(VB.clone().multiplyScalar(b)).normalize();
};
const ALT = 0.17;
const arcPoint = (s: number) => slerp(s).multiplyScalar(1 + ALT * Math.sin(Math.PI * s));

let maps: { color: HTMLCanvasElement; bump: HTMLCanvasElement } | null = null;
const makeMaps = () => {
  if (maps) return maps;
  const Wt = 4096, Ht = 2048;
  const proj = geoEquirectangular().translate([Wt / 2, Ht / 2]).scale(Wt / (2 * Math.PI));
  const landF = feature(land50 as any, (land50 as any).objects.land);
  const color = document.createElement("canvas"); color.width = Wt; color.height = Ht;
  const c = color.getContext("2d")!;
  c.fillStyle = "#B9D0E8"; c.fillRect(0, 0, Wt, Ht);
  const path = geoPath(proj, c);
  c.beginPath(); path(geoGraticule10()); c.strokeStyle = "rgba(120,145,170,0.22)"; c.lineWidth = 2; c.stroke();
  c.beginPath(); path(landF); c.fillStyle = "#FBFAF7"; c.fill();
  c.strokeStyle = "rgba(140,155,170,0.55)"; c.lineWidth = 2.2; c.stroke();
  const bump = document.createElement("canvas"); bump.width = Wt / 2; bump.height = Ht / 2;
  const b = bump.getContext("2d")!;
  b.fillStyle = "#000"; b.fillRect(0, 0, Wt / 2, Ht / 2);
  b.filter = "blur(3px)";
  const p2 = geoPath(geoEquirectangular().translate([Wt / 4, Ht / 4]).scale(Wt / 2 / (2 * Math.PI)), b);
  b.beginPath(); p2(landF); b.fillStyle = "#fff"; b.fill();
  maps = { color, bump };
  return maps;
};

let jet: THREE.ExtrudeGeometry | null = null;
const jetGeometry = () => {
  if (jet) return jet;
  const sh = new THREE.Shape();
  const P: [number, number][] = [
    [0, 1], [0.07, 0.86], [0.08, 0.3], [0.95, -0.12], [0.95, -0.24], [0.08, 0.0], [0.07, -0.62], [0.36, -0.86], [0.36, -0.96], [0, -0.86],
  ];
  sh.moveTo(P[0][0], P[0][1]);
  for (const [x, y] of P.slice(1)) sh.lineTo(x, y);
  for (const [x, y] of P.slice(1, -1).reverse()) sh.lineTo(-x, y);
  sh.lineTo(0, 1);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.scale(0.045, 0.045, 0.045);
  jet = g;
  return g;
};

const label = (text: string, color: string) => {
  const cv = document.createElement("canvas"); cv.width = 1024; cv.height = 256;
  const x = cv.getContext("2d")!;
  x.font = "600 120px Inter, Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.lineWidth = 26; x.strokeStyle = "rgba(255,255,255,0.95)"; x.lineJoin = "round"; x.strokeText(text, 512, 128);
  x.fillStyle = color; x.fillText(text, 512, 128);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
};

/** loop 2: card at 0.55 s, card → full-screen cut on piano note 3 */
const U_FULL = (noteF(3) - noteF(2)) / FPS - 0.55;
const planeS = (u: number) => easeInOut(clamp((u - 0.2) / 1.25)); // arrives at u ≈ 1.45
const NORTH_B = new THREE.Vector3(0, 1, 0).sub(VB.clone().multiplyScalar(VB.y)).normalize();
const faceEuler = (v: THREE.Vector3, extraY = 0) => {
  const ay = Math.atan2(-v.x, v.z);
  const fz = -v.x * Math.sin(ay) + v.z * Math.cos(ay);
  return new THREE.Euler(Math.atan2(v.y, fz), ay + extraY, 0, "XYZ");
};
const R_FULL = faceEuler(slerp(0.55));
/** the jet's heading at landing (tangent at Tokyo, along the great circle) */
const T_LAND = (() => { const a = slerp(0.995), b = slerp(1); const t = b.clone().sub(a); return t.sub(VB.clone().multiplyScalar(t.dot(VB))).normalize(); })();

const Scene: React.FC<{ u: number; aspect: number }> = ({ u, aspect }) => {
  const { camera, scene } = useThree();
  const tex = useMemo(() => {
    const m = makeMaps();
    const col = new THREE.CanvasTexture(m.color); col.colorSpace = THREE.SRGBColorSpace; col.anisotropy = 16;
    const bump = new THREE.CanvasTexture(m.bump);
    return { col, bump, la: label("Bucharest", "#26313D"), lb: label("Tokyo", "#1F2A36") };
  }, []);
  const tube = useMemo(() => {
    const pts = Array.from({ length: 161 }, (_, i) => arcPoint(i / 160));
    const curve = new THREE.CatmullRomCurve3(pts);
    return { curve, core: new THREE.TubeGeometry(curve, 400, 0.0062, 10, false), glow: new THREE.TubeGeometry(curve, 400, 0.016, 10, false) };
  }, []);

  // ---- timeline ----
  const s = planeS(u);
  const full = u >= U_FULL;
  const dropP = clamp((u - 1.33) / 0.14);                       // pin falls from above, lands at u 1.47
  const after = u - 1.47;
  const pinY = dropP < 1 ? 0.09 * (1 - easeIn(dropP)) : 0.016 * Math.sin(Math.PI * clamp(after / 0.12));
  const squash = dropP >= 1 ? Math.sin(Math.PI * clamp(after / 0.1)) : 0;
  const ringB = clamp(after / 0.6);
  const ringA = (u % 0.9) / 0.9;

  // plane pose (same arc-length parameter as the tube's draw range, so the jet sits on the tip)
  const sc = Math.max(0.001, Math.min(0.995, s));
  const p = tube.curve.getPointAt(sc);
  const T = tube.curve.getTangentAt(sc).normalize();
  const N = p.clone().normalize();
  const planeQ = new THREE.Object3D();
  planeQ.position.copy(p); planeQ.up.copy(N); planeQ.lookAt(p.clone().add(T));

  // globe orientation + camera
  let rot: THREE.Euler;
  const cam = camera as THREE.PerspectiveCamera;
  let camPos: THREE.Vector3, look: THREE.Vector3, up: THREE.Vector3, fov: number;
  let quat: THREE.Quaternion | null = null;
  if (!full) {
    // wide: the globe spins in and settles on Bucharest, slowly following the jet
    const spin = (1 - easeOut(clamp(u / 0.8))) * 2.4;
    rot = faceEuler(slerp(0.3 * easeInOut(clamp(u / 1.0))), spin);
    const dist = lerp(5.4, 4.4, easeInOut(clamp(u / 0.85)));
    camPos = new THREE.Vector3(0, dist * 0.22, dist); look = new THREE.Vector3(0, 0.08, 0); up = new THREE.Vector3(0, 1, 0); fov = 32;
  } else {
    // full screen: chase cam behind the jet, then a crane up over Tokyo for the landing, then a slow drift until the cut.
    // The camera ORIENTATION is slerped between the two shots (lookAt with a lerped up vector flipped 180° mid-move).
    rot = R_FULL;
    const wB = easeInOut(clamp((u - 1.08) / 0.32));
    const drift = easeInOut(clamp((u - 1.3) / 0.95));
    // 3/4 chase cam (sample v3): above, behind and to the side of the jet, looking at it
    const Bs = new THREE.Vector3().crossVectors(N, T).normalize();
    const camC = p.clone().add(N.clone().multiplyScalar(0.3)).add(T.clone().multiplyScalar(-0.14)).add(Bs.multiplyScalar(0.16));
    const lookC = p.clone().add(N.clone().multiplyScalar(0.035));
    const camO = VB.clone().multiplyScalar(1.72 - 0.2 * drift).add(NORTH_B.clone().multiplyScalar(-0.3 + 0.1 * drift));
    const lookO = VB.clone().add(NORTH_B.clone().multiplyScalar(0.02));
    // overhead "screen up": halfway between north and the jet's heading at landing, so the roll stays small
    const upO = NORTH_B.clone().add(T_LAND).normalize();
    const toW = (v: THREE.Vector3) => v.clone().applyEuler(rot);
    const qOf = (eye: THREE.Vector3, target: THREE.Vector3, upv: THREE.Vector3) =>
      new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(toW(eye), toW(target), toW(upv)));
    camPos = toW(camC).lerp(toW(camO), wB);
    const qS = qOf(camC, lookC, N).slerp(qOf(camO, lookO, upO), wB);
    const upS = new THREE.Vector3(0, 1, 0).applyQuaternion(qS);
    const aim = lookC.clone().lerp(lookO, easeInOut(clamp((u - 1.08) / 0.4)));   // keeps the jet in frame while craning up
    quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(camPos, toW(aim), upS));
    look = toW(lookO); up = toW(upO);
    fov = lerp(44, 36, wB) - 3 * drift;
  }

  useLayoutEffect(() => {
    cam.fov = fov; cam.aspect = aspect; cam.near = 0.002; cam.far = 50;
    cam.position.copy(camPos); cam.up.copy(up);
    if (quat) cam.quaternion.copy(quat); else cam.lookAt(look);
    cam.updateProjectionMatrix();
    scene.background = new THREE.Color("#E9EDF1");
  });

  // geometry draw ranges
  const per = 10 * 6;
  tube.core.setDrawRange(0, Math.floor((tube.core.index!.count / per) * s) * per);
  tube.glow.setDrawRange(0, Math.floor((tube.glow.index!.count / per) * s) * per);

  const surf = (v: THREE.Vector3, h = 0) => v.clone().multiplyScalar(1 + h);
  const ringQ = (v: THREE.Vector3) => { const o = new THREE.Object3D(); o.position.copy(surf(v, 0.002)); o.lookAt(v.clone().multiplyScalar(2)); return o.quaternion; };
  const qB = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), VB.clone().normalize());
  const planeVis = s > 0.003 && dropP < 1;

  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#ffffff", "#b9c4d0", 0.6]} />
      <directionalLight position={[-3, 4, 5]} intensity={1.7} color="#fff8ef" />
      <directionalLight position={[-5, 0.5, 1]} intensity={0.9} color="#ffd9b0" />
      <directionalLight position={[4, -1, 2]} intensity={0.3} color="#dfe8ff" />
      <group rotation={rot}>
        <mesh>
          <sphereGeometry args={[1, 192, 192]} />
          <meshStandardMaterial map={tex.col} bumpMap={tex.bump} bumpScale={0.9} roughness={0.92} metalness={0} />
        </mesh>
        <mesh geometry={tube.glow}><meshBasicMaterial color={BLUE} transparent opacity={0.22} depthWrite={false} /></mesh>
        <mesh geometry={tube.core}><meshBasicMaterial color={BLUE} /></mesh>
        <mesh position={surf(VA, 0.004)}><sphereGeometry args={[0.014, 24, 24]} /><meshBasicMaterial color={BLUE} /></mesh>
        <mesh position={surf(VA, 0.003)} quaternion={ringQ(VA)} scale={1 + ringA * 2.2}>
          <ringGeometry args={[0.016, 0.022, 48]} /><meshBasicMaterial color={BLUE} transparent opacity={0.6 * (1 - ringA)} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {planeVis && (
          <group position={planeQ.position} quaternion={planeQ.quaternion}>
            <mesh geometry={jetGeometry()}><meshStandardMaterial color={BLUE} roughness={0.35} metalness={0.05} emissive={BLUE} emissiveIntensity={0.35} /></mesh>
          </group>
        )}
        {dropP > 0 && (
          <>
            <group position={surf(VB, 0.002 + pinY)} quaternion={qB}>
              <group scale={[1 + 0.18 * squash, 1 - 0.3 * squash, 1 + 0.18 * squash]}>
                <mesh position={[0, 0.026, 0]}><cylinderGeometry args={[0.0028, 0.0028, 0.05, 10]} /><meshStandardMaterial color="#8E98A3" /></mesh>
                <mesh position={[0, 0.056, 0]}><sphereGeometry args={[0.017, 32, 32]} /><meshStandardMaterial color={RED} roughness={0.35} emissive={RED} emissiveIntensity={0.25} /></mesh>
              </group>
            </group>
            {after > 0 && (
              <mesh position={surf(VB, 0.003)} quaternion={ringQ(VB)} scale={1 + ringB * 3}>
                <ringGeometry args={[0.02, 0.028, 48]} /><meshBasicMaterial color={RED} transparent opacity={0.7 * (1 - ringB)} depthWrite={false} side={THREE.DoubleSide} />
              </mesh>
            )}
          </>
        )}
        {!full && <sprite position={surf(VA, 0.09)} scale={[0.26, 0.065, 1]}><spriteMaterial map={tex.la} transparent depthTest={false} opacity={clamp(u / 0.4)} /></sprite>}
        {after > 0 && <sprite position={surf(VB, 0.13)} scale={[0.12, 0.03, 1]}><spriteMaterial map={tex.lb} transparent depthTest={false} opacity={easeOut(clamp(after / 0.15))} /></sprite>}
      </group>
    </>
  );
};

export const FlightPath: React.FC<{ u: number; w: number; h: number; full: boolean }> = ({ u, w, h }) => {
  const km = Math.round(8877 * planeS(u));
  const landed = u >= 1.47;
  const pop = landed ? 1 + 0.08 * Math.sin(Math.PI * clamp((u - 1.47) / 0.18)) : 1;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ThreeCanvas width={Math.round(w)} height={Math.round(h)} camera={{ fov: 32, position: [0, 1, 5] }} gl={{ antialias: true }}>
        <Scene u={u} aspect={w / h} />
      </ThreeCanvas>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(60,75,95,0.16) 100%)", pointerEvents: "none" }} />
      {/* distance counter, runs with the jet */}
      <div style={{ position: "absolute", left: 0, right: 0, top: h * 0.075, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: INTER, color: "#1F2A36", opacity: clamp(u / 0.25) }}>
        <div style={{ fontSize: w * 0.034, fontWeight: 600, letterSpacing: w * 0.004, color: "#5B6876" }}>BUCHAREST → TOKYO</div>
        <div style={{ fontSize: w * 0.105, fontWeight: 700, letterSpacing: -w * 0.003, fontVariantNumeric: "tabular-nums", transform: `scale(${pop})`, color: landed ? BLUE : "#1F2A36" }}>
          {km.toLocaleString("en-US")} km
        </div>
      </div>
    </div>
  );
};
