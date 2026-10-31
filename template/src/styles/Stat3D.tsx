// /stat-3d — "the number that climbs" (grid-only bonus style): a big extruded "+248%" for a made-up bakery counts up and
// lands with a bounce on a glossy floor, while 3D bars rise behind it (the last one tallest and red); the camera orbits.
// Pure function of u (τ = u − U_FULL).
import React, { useLayoutEffect, useMemo } from "react";
import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { FontLoader, Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
// @ts-ignore json module
import helvBold from "three/examples/fonts/helvetiker_bold.typeface.json";
import type { StyleProps } from "../types";
import { INTER, backOut, clamp, easeInOut, easeOut, lerp } from "../theme";
import { U_FULL } from "../timing";

const CREAM = "#F4E9CC", RED = "#C2322A", GRAPH = "#3A3330";
let font: Font | null = null;
const getFont = () => (font ??= new FontLoader().parse(helvBold as any));
const textCache = new Map<string, THREE.BufferGeometry>();
const textGeo = (s: string) => {
  let g = textCache.get(s);
  if (!g) {
    g = new TextGeometry(s, { font: getFont(), size: 1, depth: 0.32, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 4 });
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    g.translate(-(bb.max.x + bb.min.x) / 2, 0, -0.16);
    textCache.set(s, g);
  }
  return g;
};
const BARS = [0.55, 0.8, 0.72, 1.15, 1.5, 2.25];
const boxGeo = new RoundedBoxGeometry(0.42, 1, 0.42, 4, 0.05);
boxGeo.translate(0, 0.5, 0);

const Scene: React.FC<{ tau: number; aspect: number }> = ({ tau, aspect }) => {
  const { camera, gl, scene } = useThree();
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const t = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return t;
  }, [gl]);
  const count = Math.round(248 * easeOut(clamp(tau / 0.75)));
  const pop = tau > 0.75 ? 1 + 0.08 * Math.exp(-(tau - 0.75) / 0.09) * Math.sin((tau - 0.75) * 40) : 1;
  const geo = textGeo(`+${count}%`);
  const az = lerp(-0.42, 0.18, easeInOut(clamp(tau / 1.38)));
  const R = 10.5 / Math.min(1, aspect / 0.8);
  useLayoutEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 30; cam.aspect = aspect; cam.near = 0.1; cam.far = 60;
    cam.position.set(Math.sin(az) * R, 2.6, Math.cos(az) * R);
    cam.lookAt(0, 0.95, -0.3);
    cam.updateProjectionMatrix();
    scene.environment = env;
    scene.background = new THREE.Color("#1A1614");
  });
  const content = (mirror: boolean) => (
    <group scale={[1, mirror ? -1 : 1, 1]}>
      {BARS.map((bh, i) => {
        const g = backOut(clamp((tau - 0.08 - i * 0.09) / 0.32));
        const last = i === BARS.length - 1;
        return (
          <mesh key={i} geometry={boxGeo} position={[-1.55 + i * 0.62, 0, -1.25]} scale={[1, Math.max(0.001, bh * g), 1]}>
            <meshPhysicalMaterial color={last ? RED : GRAPH} roughness={last ? 0.28 : 0.42} metalness={0.05} clearcoat={0.6} clearcoatRoughness={0.25} transparent={mirror} opacity={mirror ? 0.35 : 1} />
          </mesh>
        );
      })}
      <mesh geometry={geo} position={[0, 0.02, 0.35]} scale={[0.7 * pop, 0.7 * pop, 0.7]}>
        <meshPhysicalMaterial color={CREAM} roughness={0.22} metalness={0.0} clearcoat={1} clearcoatRoughness={0.12} transparent={mirror} opacity={mirror ? 0.35 : 1} />
      </mesh>
    </group>
  );
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[-4, 6, 5]} intensity={2.2} color="#FFF1DE" />
      <directionalLight position={[5, 3, -4]} intensity={1.4} color="#FFD7B5" />
      <spotLight position={[0, 7, 2]} angle={0.5} penumbra={0.8} intensity={30} color="#FFE9CF" />
      {content(false)}
      {content(true)}
      {/* glossy floor: a dark, slightly see-through plane over the mirrored copy */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0, 0]}>
        <circleGeometry args={[9, 64]} />
        <meshPhysicalMaterial color="#141110" roughness={0.18} metalness={0.2} transparent opacity={0.78} clearcoat={1} />
      </mesh>
    </>
  );
};

export const Stat3D: React.FC<StyleProps> = ({ u, w, h }) => {
  const tau = u - U_FULL;
  const S = Math.min(w, h);
  const lab = easeOut(clamp((tau - 0.2) / 0.3));
  return (
    <div style={{ position: "absolute", inset: 0, background: "#1A1614" }}>
      <ThreeCanvas width={Math.round(w)} height={Math.round(h)} gl={{ antialias: true }} camera={{ fov: 30, position: [0, 2, 7] }}>
        <Scene tau={tau} aspect={w / h} />
      </ThreeCanvas>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 42%, rgba(255,220,180,0.10) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)" }} />
      <div style={{ position: "absolute", left: S * 0.07, top: S * 0.07, display: "flex", alignItems: "center", gap: S * 0.025, fontFamily: INTER, color: CREAM, opacity: lab }}>
        <div style={{ width: S * 0.05, height: S * 0.05, borderRadius: "50%", border: `${S * 0.008}px solid ${CREAM}`, boxSizing: "border-box", position: "relative" }}>
          <div style={{ position: "absolute", width: S * 0.016, height: S * 0.016, borderRadius: "50%", background: RED, right: -S * 0.01, top: -S * 0.006 }} />
        </div>
        <span style={{ fontSize: S * 0.045, fontWeight: 600, letterSpacing: -S * 0.0008 }}>Orbit Bakery</span>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: S * 0.08, textAlign: "center", fontFamily: INTER, fontSize: S * 0.042, color: "rgba(244,233,204,0.75)", opacity: lab, transform: `translateY(${(1 - lab) * S * 0.02}px)` }}>
        weekend orders, Jan → Jun
      </div>
    </div>
  );
};
