import { FRONTIER, FRONTIER_LAYOUT, HARBOUR, isFrontier, REALM_OF, ROAD_SIGN, type FrontierId } from './realms';
import { DEFAULT_AVATAR, HAIR, SHIRTS, SKIN, type Avatar } from '../art/avatar';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import { Color, DoubleSide } from 'three';
import type * as THREE from 'three';
import type { GameState, Item, MarketId, OnlinePlayer, Plot, Stall } from '../api';
import { PLOTS, STALL_POS, ZONES, crateCount, lightAt, type Popup, type Selection } from './Map';
import { EDGES, LAMPS, newWalk, NODES, PLOT_STOP, seeded, SOURCE_POS, SOURCE_STOP, stepWalk, stopForStall, TREES, U, walkAt, walkToward, wx, wz, type Stop, type Walk } from './paths';

const CANOPY: Record<MarketId, [string, string]> = {
  produce: ['#2f9e5f', '#f1f8f3'], fabric: ['#2a6fdb', '#f1f6fe'], scrap: ['#c8622e', '#f1ede7'], harbour: ['#0b8f8f', '#eef8f8'], woods: FRONTIER.timberfell.canopy, mine: FRONTIER.gemhollow.canopy, vale: FRONTIER.sunvale.canopy,
};
const GROUND: Record<MarketId, string> = { produce: '#cfe8d3', fabric: '#cddcf3', scrap: '#ecd9c8', harbour: '#d8e7e4', woods: FRONTIER.timberfell.zone, mine: FRONTIER.gemhollow.zone, vale: FRONTIER.sunvale.zone };
/** Where you stand in each market: just off the street, so nobody walks through you. Saltmere and the frontiers have one spot each, with no walkways, so you is pinned there. */
const AVATAR_AT: Record<MarketId, [number, number]> = { produce: [260, 384], fabric: [700, 384], scrap: [560, 420], harbour: HARBOUR.you, woods: FRONTIER_LAYOUT.you, mine: FRONTIER_LAYOUT.you, vale: FRONTIER_LAYOUT.you };
/** Where to stand in town with nothing in particular selected: near the middle of each market. */
const DEFAULT_STOP: Record<'produce' | 'fabric' | 'scrap', Stop> = { produce: { node: 'm255', facing: Math.PI }, fabric: { node: 'm685', facing: Math.PI }, scrap: { node: 's500', facing: Math.PI } };
const AVATARS = ['#2f9e5f', '#e2557b', '#7b4de0', '#eb6834', '#18a999', '#2a6fdb', '#c98a00', '#0e9fb0'];
const avatarColor = (id: string) => AVATARS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];

const WALKER_COLORS = ['#e2557b', '#eb6834', '#2a6fdb', '#0e9fb0', '#7b4de0', '#c98a00', '#18a999'];

/**
 * The demo video drives the town from outside: the time, the camera, and when a frame has been drawn. In the live game none of this
 * is set and everything runs on the clock as before. In the video every moving part is a pure function of `t`, so a frame can be
 * drawn on its own, in any order.
 */
export interface VideoDrive {
  /** Seconds since the start of the video's scene. */
  t: number;
  camera: { position: [number, number, number]; target: [number, number, number]; fov?: number };
  /** Where the townsfolk shop. Fixed for the whole video, so a walker's route does not change when the picture cuts to another shot. */
  walkStops?: Stop[];
  /** Pixel ratio of the canvas: 2 keeps it sharp when the video zooms in. */
  dpr?: number;
  /** Show the markets' name banners high above them (clear in wide shots, but they float over stalls in a close-up). */
  banners?: boolean;
  /** Names this frame. `onDrawn` hands it back, so a late call from an earlier frame can be told apart from this one's. */
  frameKey?: number;
  /** Called once the frame has been drawn, with `frameKey`. */
  onDrawn?: (frameKey: number | undefined) => void;
  /** Show the way out of town (the road sign, and the screen's Travel button), as the game does: the Places video travels. */
  travel?: boolean;
}
const Drive = createContext<VideoDrive | null>(null);

/** Run `cb` every frame with the time in seconds: the live clock in the game, the video's own time in the video. */
function useTick(cb: (t: number) => void) {
  const drive = useContext(Drive);
  useFrame((state) => { if (!drive) cb(state.clock.elapsedTime); });
  useLayoutEffect(() => { if (drive) cb(drive.t); });
}

/** A colour part of the way from `a` to `b`. */
const mix = (a: string, b: string, k: number) => `#${new Color(a).lerp(new Color(b), k).getHexString()}`;

const label: React.CSSProperties = {
  background: 'rgba(22,38,74,.92)', color: '#fff', font: '600 12px system-ui, sans-serif', padding: '3px 8px',
  borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none', textAlign: 'center',
};

const PANTS = ['#2b3a55', '#3d3d4a', '#5a4632', '#33503f'];
const hashOf = (id: string) => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;

/** A small articulated person: head, hair, eyes, torso, swinging arms and legs. Faces +z. */
function Person({ id, shirt, scale = 1, mode = 'idle', apron, cap, look }: { id: string; shirt: string; scale?: number; mode?: 'idle' | 'walk'; apron?: string; cap?: string; look?: Avatar }) {
  const h = hashOf(id);
  // a chosen look (an avatar) wins; everyone else gets a look picked from their id
  const skin = look ? SKIN[look.skin] : SKIN[h % SKIN.length];
  const hair = look ? HAIR[look.hair] : HAIR[(h >> 3) % HAIR.length];
  const pants = PANTS[(h >> 5) % PANTS.length];
  const long = look ? look.style === 'long' : (h >> 7) % 3 === 0;
  const bald = look?.style === 'bald';
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useTick((time) => {
    const t = time + (h % 10);
    if (mode === 'walk') {
      const sw = Math.sin(t * 7) * 0.7;
      if (legL.current) legL.current.rotation.x = sw;
      if (legR.current) legR.current.rotation.x = -sw;
      if (armL.current) armL.current.rotation.x = -sw * 0.8;
      if (armR.current) armR.current.rotation.x = sw * 0.8;
      if (body.current) body.current.position.y = Math.abs(Math.cos(t * 7)) * 0.025;
    } else {
      if (armR.current) armR.current.rotation.x = -0.5 + Math.sin(t * 1.6) * 0.35; // arm gestures as if chatting
      if (armL.current) armL.current.rotation.x = Math.sin(t * 1.1) * 0.08;
      if (body.current) body.current.position.y = Math.sin(t * 2) * 0.006;
    }
  });
  const limb = (r: number, len: number, color: string) => (
    <mesh position={[0, -len / 2, 0]} castShadow><capsuleGeometry args={[r, len, 4, 8]} /><meshStandardMaterial color={color} /></mesh>
  );
  return (
    <group scale={scale}>
      <group ref={body}>
        {/* legs pivot at the hip */}
        {([[-0.065, legL], [0.065, legR]] as const).map(([x, ref], i) => (
          <group key={i} ref={ref} position={[x, 0.33, 0]}>
            {limb(0.052, 0.2, pants)}
            <mesh position={[0, -0.33, 0.03]} castShadow><boxGeometry args={[0.09, 0.05, 0.16]} /><meshStandardMaterial color="#2a2118" /></mesh>
          </group>
        ))}
        {/* torso */}
        <mesh position={[0, 0.5, 0]} castShadow><capsuleGeometry args={[0.125, 0.16, 6, 12]} /><meshStandardMaterial color={shirt} /></mesh>
        {apron && <mesh position={[0, 0.46, 0.105]}><boxGeometry args={[0.2, 0.22, 0.03]} /><meshStandardMaterial color={apron} /></mesh>}
        {/* arms pivot at the shoulder */}
        {([[-0.17, armL], [0.17, armR]] as const).map(([x, ref], i) => (
          <group key={i} ref={ref} position={[x, 0.6, 0]}>
            {limb(0.04, 0.17, shirt)}
            <mesh position={[0, -0.27, 0]} castShadow><sphereGeometry args={[0.04, 10, 10]} /><meshStandardMaterial color={skin} /></mesh>
          </group>
        ))}
        {/* neck + head */}
        <mesh position={[0, 0.68, 0]}><cylinderGeometry args={[0.04, 0.045, 0.05, 8]} /><meshStandardMaterial color={skin} /></mesh>
        <group position={[0, 0.79, 0]}>
          <mesh castShadow><sphereGeometry args={[0.105, 20, 20]} /><meshStandardMaterial color={skin} /></mesh>
          {/* hair cap (top half, set back a touch) */}
          {!bald && <mesh position={[0, 0.012, -0.012]} rotation={[-0.25, 0, 0]}><sphereGeometry args={[0.112, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><meshStandardMaterial color={hair} /></mesh>}
          {long && <mesh position={[0, -0.06, -0.06]}><capsuleGeometry args={[0.085, 0.1, 4, 10]} /><meshStandardMaterial color={hair} /></mesh>}
          {cap && (
            <group position={[0, 0.045, 0.005]}>
              <mesh><sphereGeometry args={[0.114, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.45]} /><meshStandardMaterial color={cap} /></mesh>
              <mesh position={[0, -0.01, 0.1]} rotation={[0.1, 0, 0]}><boxGeometry args={[0.12, 0.012, 0.09]} /><meshStandardMaterial color={cap} /></mesh>
            </group>
          )}
          {[-0.038, 0.038].map((x) => (
            <group key={x} position={[x, 0.005, 0.092]}>
              <mesh><sphereGeometry args={[0.02, 10, 10]} /><meshStandardMaterial color="#fff" /></mesh>
              <mesh position={[0, 0, 0.013]}><sphereGeometry args={[0.01, 8, 8]} /><meshStandardMaterial color="#14101a" /></mesh>
            </group>
          ))}
          <mesh position={[0, -0.05, 0.098]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.022, 0.005, 6, 12, Math.PI]} /><meshStandardMaterial color="#8a3b3b" /></mesh>
        </group>
      </group>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.18, 16]} /><meshBasicMaterial color="#14253d" transparent opacity={0.18} /></mesh>
    </group>
  );
}

function Wheel({ x, z, r = 0.14 }: { x: number; z: number; r?: number }) {
  return (
    <mesh position={[x, r, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[r, r, 0.1, 16]} /><meshStandardMaterial color="#1d1d24" />
    </mesh>
  );
}

/** Your ride: a wheelbarrow, a pickup or a van. Drawn nose toward +z. */
function Vehicle({ kind, color = '#e8a42b' }: { kind: 'wheelbarrow' | 'pickup' | 'van'; color?: string }) {
  if (kind === 'wheelbarrow') {
    return (
      <group>
        <mesh position={[0, 0.25, 0.05]} rotation={[0.15, 0, 0]} castShadow><boxGeometry args={[0.36, 0.14, 0.42]} /><meshStandardMaterial color="#2a6fdb" /></mesh>
        <Wheel x={0} z={0.32} r={0.1} />
        {[-0.15, 0.15].map((x) => <mesh key={x} position={[x, 0.22, -0.3]} rotation={[0.2, 0, 0]}><boxGeometry args={[0.03, 0.03, 0.5]} /><meshStandardMaterial color="#8b6b4a" /></mesh>)}
      </group>
    );
  }
  const len = kind === 'van' ? 1.5 : 1.3;
  return (
    <group>
      <mesh position={[0, 0.3, -0.1]} castShadow><boxGeometry args={[0.7, 0.3, len]} /><meshStandardMaterial color={color} /></mesh>
      <mesh position={[0, 0.58, kind === 'van' ? -0.1 : 0.35]} castShadow>
        <boxGeometry args={[0.66, kind === 'van' ? 0.4 : 0.3, kind === 'van' ? len - 0.1 : 0.5]} /><meshStandardMaterial color={kind === 'van' ? '#f2f2f2' : color} />
      </mesh>
      <mesh position={[0, 0.62, kind === 'van' ? 0.62 : 0.55]}><boxGeometry args={[0.6, 0.16, 0.05]} /><meshStandardMaterial color="#9bd3ff" /></mesh>
      {[-0.36, 0.36].map((x) => [-0.5, 0.45].map((z) => <Wheel key={`${x}${z}`} x={x} z={z} />))}
    </group>
  );
}

/**
 * Someone out shopping (see Walk in paths.ts): they pick a stall or a source, walk there along the walkways and nowhere else,
 * stand in front of it for a few seconds looking at it, then choose the next.
 */
function Walker({ id, color, stops, speed, seed }: { id: string; color: string; stops: Stop[]; speed: number; seed: number }) {
  const ref = useRef<THREE.Group>(null);
  const [mode, setMode] = useState<'walk' | 'idle'>('idle');
  const walk = useRef<Walk | null>(null);
  if (!walk.current) walk.current = newWalk(seed, stops);
  const shown = useRef<'walk' | 'idle'>('idle');
  useFrame((_, dt) => {
    const g = ref.current;
    const w = walk.current!;
    if (!g) return;
    stepWalk(w, stops, speed, Math.min(dt, 0.1));
    g.position.set(w.x, 0, w.z);
    g.rotation.y = w.yaw;
    const now = w.path.length ? 'walk' : 'idle';
    if (now !== shown.current) { shown.current = now; setMode(now); }
  });
  return <group ref={ref}><Person id={id} shirt={color} mode={mode} scale={1.1} /></group>;
}

/** The same shopper in the video: their place at time t is looked up, not accumulated. */
function VideoWalker({ id, color, stops, speed, seed, t }: { id: string; color: string; stops: Stop[]; speed: number; seed: number; t: number }) {
  const w = walkAt(seed, stops, speed, t);
  return <group position={[w.x, 0, w.z]} rotation={[0, w.yaw, 0]}><Person id={id} shirt={color} mode={w.moving ? 'walk' : 'idle'} scale={1.1} /></group>;
}

/** The paved walkways, drawn along the same lines the walkers follow. */
function Walkways() {
  return (
    <group>
      {EDGES.map(([a, b]) => {
        const [x1, y1] = NODES[a], [x2, y2] = NODES[b];
        const horizontal = y1 === y2;
        const len = Math.hypot(x2 - x1, y2 - y1) / U + 0.7; // a little extra, so corners meet
        return (
          <mesh key={`${a}-${b}`} position={[wx((x1 + x2) / 2), 0.04, wz((y1 + y2) / 2)]} receiveShadow>
            <boxGeometry args={horizontal ? [len, 0.1, 0.7] : [0.7, 0.1, len]} />
            <meshStandardMaterial color="#e8e1d2" />
          </mesh>
        );
      })}
    </group>
  );
}

/** A delivery truck driving the far south road. */
function Truck() {
  const ref = useRef<THREE.Group>(null);
  useTick((time) => {
    const g = ref.current;
    if (!g) return;
    const t = ((time / 38) + 0.2) % 1;
    g.position.set(wx(30 + 940 * t), 0, wz(730)); // the far south road, beyond every tree and stall
  });
  return <group ref={ref} rotation={[0, Math.PI / 2, 0]}><Vehicle kind="van" color="#d6336c" /></group>;
}

function Lamp({ x, z, on }: { x: number; z: number; on: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.025, 0.035, 1.6, 8]} /><meshStandardMaterial color="#556277" /></mesh>
      <mesh position={[0, 1.65, 0]}><sphereGeometry args={[0.1, 12, 12]} /><meshStandardMaterial color="#ffe3a0" emissive="#ffc861" emissiveIntensity={on ? 2.2 : 0.15} /></mesh>
      {on && <pointLight position={[0, 1.65, 0]} intensity={10} distance={7} color="#ffc861" />}
    </group>
  );
}

/** Festive season: bunting strung over the fabric market, with drifting confetti. */
function Festive() {
  const ref = useRef<THREE.Group>(null);
  useTick((time) => { if (ref.current) ref.current.rotation.y = Math.sin(time * 0.4) * 0.02; });
  const cols = ['#f2a900', '#d6336c', '#2a6fdb', '#2f8f4e'];
  return (
    <group ref={ref}>
      {[-1.5, 0.4, 2.2].map((z, r) => (
        <group key={r}>
          {Array.from({ length: 14 }, (_, i) => {
            const x = 2.2 + i * 0.52;
            return (
              <mesh key={i} position={[x, 2.1 - Math.sin((i / 13) * Math.PI) * -0.15 - 0.2, z]} rotation={[0, 0, Math.PI]}>
                <coneGeometry args={[0.13, 0.28, 3]} /><meshStandardMaterial color={cols[(i + r) % 4]} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function FuelQueue() {
  return (
    <group position={[wx(720), 0, wz(690)]}>
      {[0, 1, 2, 3].map((i) => <group key={i} position={[i * 0.95, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={0.6}><Vehicle kind="pickup" color={['#c8622e', '#2a6fdb', '#2f9e5f', '#7b4de0'][i]} /></group>)}
      <group position={[4.1, 0, 0]}>
        <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[0.35, 0.8, 0.35]} /><meshStandardMaterial color="#d6336c" /></mesh>
      </group>
    </group>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <group position={[wx(x), 0, wz(y)]} scale={s}>
      <mesh position={[0, 0.25, 0]} castShadow><cylinderGeometry args={[0.07, 0.09, 0.5, 8]} /><meshStandardMaterial color="#8b6b4a" /></mesh>
      <mesh position={[0, 0.75, 0]} castShadow><icosahedronGeometry args={[0.45, 1]} /><meshStandardMaterial color="#3f9e6a" flatShading /></mesh>
    </group>
  );
}

/** One piece of produce, shaped like the thing it is. Sits at the origin; callers position it. */
function Good({ item }: { item: string }) {
  switch (item) {
    case 'tomatoes':
    case 'pepper': {
      const c = item === 'pepper' ? '#e24a22' : '#d93b2b';
      return (
        <group>
          <mesh castShadow><sphereGeometry args={[0.07, 12, 12]} /><meshStandardMaterial color={c} roughness={0.4} /></mesh>
          <mesh position={[0, 0.065, 0]}><coneGeometry args={[0.03, 0.03, 5]} /><meshStandardMaterial color="#2f8f4e" /></mesh>
        </group>
      );
    }
    case 'cotton':
      return (
        <group>
          {[[0, 0, 0], [0.05, 0.03, 0.02], [-0.05, 0.02, -0.02], [0, 0.06, 0]].map((o, i) => (
            <mesh key={i} position={o as [number, number, number]} castShadow><icosahedronGeometry args={[0.065, 1]} /><meshStandardMaterial color="#fbfbf7" /></mesh>
          ))}
        </group>
      );
    case 'iron':
      return (
        <group>
          {[0, 1, 2].map((i) => <mesh key={i} position={[0, i * 0.035, (i - 1) * 0.05]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.025, 0.025, 0.2, 8]} /><meshStandardMaterial color="#6e7a89" metalness={0.7} roughness={0.35} /></mesh>)}
        </group>
      );
    case 'copper wire':
      return (
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh castShadow><torusGeometry args={[0.07, 0.03, 8, 18]} /><meshStandardMaterial color="#c8782e" metalness={0.8} roughness={0.3} /></mesh>
        </group>
      );
    case 'fish':
      return (
        <group rotation={[0, 0.4, 0]}>
          <mesh castShadow scale={[1.6, 0.6, 0.5]}><sphereGeometry args={[0.06, 12, 10]} /><meshStandardMaterial color="#8fb3d1" metalness={0.5} roughness={0.35} /></mesh>
          <mesh position={[-0.11, 0, 0]} rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.04, 0.06, 4]} /><meshStandardMaterial color="#6f93b3" /></mesh>
        </group>
      );
    case 'salt':
      return <mesh castShadow position={[0, 0.03, 0]}><coneGeometry args={[0.08, 0.1, 7]} /><meshStandardMaterial color="#f3f1ea" roughness={0.9} /></mesh>;
    case 'timber':
      return (
        <group rotation={[0, 0, Math.PI / 2]}>
          {[-0.04, 0.04].map((x) => <mesh key={x} position={[0, x, 0]} castShadow><cylinderGeometry args={[0.035, 0.035, 0.2, 8]} /><meshStandardMaterial color="#a87b4f" /></mesh>)}
        </group>
      );
    case 'gems':
      return <mesh castShadow position={[0, 0.04, 0]}><octahedronGeometry args={[0.06, 0]} /><meshStandardMaterial color="#7b4de0" metalness={0.3} roughness={0.15} emissive="#2a1a6e" emissiveIntensity={0.3} /></mesh>;
    case 'wine':
      return (
        <group>
          <mesh castShadow position={[0, 0.06, 0]}><cylinderGeometry args={[0.035, 0.035, 0.12, 10]} /><meshStandardMaterial color="#3d1a26" roughness={0.3} /></mesh>
          <mesh position={[0, 0.14, 0]}><cylinderGeometry args={[0.012, 0.02, 0.05, 8]} /><meshStandardMaterial color="#3d1a26" /></mesh>
        </group>
      );
    case 'spice':
      return (
        <group>
          <mesh castShadow scale={[1, 1.15, 1]}><sphereGeometry args={[0.07, 10, 10]} /><meshStandardMaterial color="#c8551e" roughness={0.8} /></mesh>
          <mesh position={[0, 0.075, 0]}><cylinderGeometry args={[0.03, 0.045, 0.03, 8]} /><meshStandardMaterial color="#7a2f0c" /></mesh>
        </group>
      );
    default:
      return <mesh castShadow><boxGeometry args={[0.12, 0.12, 0.12]} /><meshStandardMaterial color="#b8946a" /></mesh>;
  }
}

/** Open crates stocked with real goods. More stock = more crates, each filled with the item. */
function Stock({ offers }: { offers: Stall['offers'] }) {
  const shown = offers.slice(0, 2);
  return (
    <group>
      {shown.map((o, i) => {
        const n = crateCount(o.stock, o.target);
        const x0 = shown.length === 1 ? 0 : i === 0 ? -0.65 : 0.65;
        return Array.from({ length: n }, (_, k) => {
          const cx = x0 + (k % 2) * 0.4 - 0.2;
          const cy = 0.5 + Math.floor(k / 2) * 0.17;
          return (
            <group key={`${o.item}${k}`} position={[cx, cy, 0.18]}>
              <mesh castShadow><boxGeometry args={[0.36, 0.14, 0.34]} /><meshStandardMaterial color="#c9a479" /></mesh>
              <mesh position={[0, 0.071, 0]}><boxGeometry args={[0.3, 0.01, 0.28]} /><meshStandardMaterial color="#6b5a45" /></mesh>
              {[[-0.08, -0.07], [0.08, -0.07], [-0.08, 0.07], [0.08, 0.07], [0, 0]].map(([gx, gz], g) => (
                <group key={g} position={[gx, 0.12, gz]}><Good item={o.item} /></group>
              ))}
            </group>
          );
        });
      })}
    </group>
  );
}

function StallModel({ s, pos, selected, next, onSelect }: { s: Stall; pos: [number, number]; selected: boolean; next: boolean; onSelect: () => void }) {
  const closed = s.state === 'closed';
  const [a, b] = s.owner ? ['#f2b01e', '#fff8e6'] : CANOPY[s.market];
  const stripes = 10;
  const wood = '#8b6b4a';
  const roofY = 1.95; // tall enough that the shopkeeper's face shows under the awning
  return (
    <group position={[wx(pos[0]), 0, wz(pos[1])]} onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      {/* wooden counter with a front panel and a worn top */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow><boxGeometry args={[2.6, 0.4, 1.1]} /><meshStandardMaterial color="#16264a" /></mesh>
      {[-0.9, 0, 0.9].map((x) => <mesh key={x} position={[x, 0.2, 0.56]}><boxGeometry args={[0.78, 0.3, 0.02]} /><meshStandardMaterial color="#1f3466" /></mesh>)}
      <mesh position={[0, 0.43, 0]} castShadow><boxGeometry args={[2.7, 0.06, 1.2]} /><meshStandardMaterial color="#c9a479" /></mesh>
      {/* four timber posts + back wall + roof frame */}
      {[-1.3, 1.3].map((x) => [-0.6, 0.6].map((z) => (
        <mesh key={`${x}${z}`} position={[x, roofY / 2, z]} castShadow><boxGeometry args={[0.07, roofY, 0.07]} /><meshStandardMaterial color={wood} /></mesh>
      )))}
      <mesh position={[0, 1.2, -0.6]} castShadow><boxGeometry args={[2.6, 1.5, 0.04]} /><meshStandardMaterial color="#d8c3a0" /></mesh>
      {[0.55, 0.9, 1.25, 1.6].map((y) => <mesh key={y} position={[0, y, -0.57]}><boxGeometry args={[2.4, 0.03, 0.03]} /><meshStandardMaterial color={wood} /></mesh>)}
      {/* striped awning with a scalloped valance */}
      {Array.from({ length: stripes }, (_, i) => {
        const w = 2.8 / stripes;
        const x = -1.4 + (i + 0.5) * w;
        const col = closed ? '#8d98a3' : i % 2 ? b : a;
        return (
          <group key={i} position={[x, roofY + 0.02, 0]}>
            <mesh rotation={[0.28, 0, 0]} castShadow><boxGeometry args={[w, 0.035, 1.5]} /><meshStandardMaterial color={col} /></mesh>
            <mesh position={[0, -0.12, 0.74]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[w / 2, w / 2, w * 0.98, 12, 1, false, 0, Math.PI]} /><meshStandardMaterial color={col} /></mesh>
          </group>
        );
      })}
      {closed ? (
        <group>
          <mesh position={[0, 0.9, 0.55]}><boxGeometry args={[2.5, 0.85, 0.03]} /><meshStandardMaterial color="#8d98a3" metalness={0.3} /></mesh>
          {[0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25].map((y) => <mesh key={y} position={[0, y, 0.57]}><boxGeometry args={[2.5, 0.015, 0.02]} /><meshStandardMaterial color="#6b7682" /></mesh>)}
        </group>
      ) : (
        <>
          <Stock offers={s.offers} />
          {/* shopkeeper, apron on, gesturing */}
          <group position={[0, 0.46, -0.25]}><Person id={s.id} shirt={s.owner ? '#f2b01e' : avatarColor(s.id)} apron={s.owner ? '#fff8e6' : '#f1f1ec'} scale={1.15} /></group>
        </>
      )}
      {/* hanging sign */}
      <mesh position={[0, 1.7, 0.8]}><boxGeometry args={[0.8, 0.14, 0.02]} /><meshStandardMaterial color="#16264a" /></mesh>
      {selected && <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.9, 2.05, 48]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
      {next && <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.1, 2.25, 48]} /><meshBasicMaterial color="#d6336c" /></mesh>}
      <Html zIndexRange={[5, 0]} position={[0, 2.6, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={label}>
          {s.owner?.mine && <span style={{ color: '#f2b01e' }}>YOURS · </span>}{s.name}
          <div style={{ fontSize: 10, color: closed ? '#ff9a9a' : s.state === 'struggling' ? '#ffc861' : '#7fe0a0' }}>
            {closed ? '✕ Closed' : s.state === 'struggling' ? '▼ Low on cash' : '● Open'}
          </div>
          {next && <div style={{ background: '#d6336c', borderRadius: 6, marginTop: 2 }}>▼ NEXT</div>}
        </div>
      </Html>
      {closed ? null : <Lamp x={1.4} z={0.7} on={false} />}
    </group>
  );
}

function PlotModel({ market, on, onSelect }: { market: MarketId; on: boolean; onSelect: () => void }) {
  const [x, y] = PLOTS[market]!;
  return (
    <group position={[wx(x), 0, wz(y)]} onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2.8, 1.8]} /><meshStandardMaterial color={on ? '#f2b01e' : '#ffffff'} transparent opacity={0.55} /></mesh>
      <Html zIndexRange={[5, 0]} position={[0, 0.5, 0]} center style={{ pointerEvents: 'none' }}><div style={label}>+ Free plot</div></Html>
    </group>
  );
}

function SourceModel({ item, label: text, detail, on, next, onSelect, lit, pos }: { item: Item; label: string; detail: string; on: boolean; next: boolean; onSelect: () => void; lit?: boolean; pos?: [number, number] }) {
  const p = pos ?? SOURCE_POS[item];
  if (!p) return null;
  const crop = item === 'tomatoes' || item === 'pepper';
  return (
    <group position={[wx(p[0]), 0, wz(p[1])]} onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      {crop ? (
        <>
          <mesh position={[0, 0.08, 0]} receiveShadow><boxGeometry args={[2, 0.16, 1.2]} /><meshStandardMaterial color="#6b4a2f" /></mesh>
          {[-0.4, 0, 0.4].map((z) => (
            <group key={z}>
              <mesh position={[0, 0.2, z]}><boxGeometry args={[1.8, 0.1, 0.16]} /><meshStandardMaterial color="#4a7a3a" /></mesh>
              {[-0.75, -0.45, -0.15, 0.15, 0.45, 0.75].map((x) => (
                <group key={x} position={[x, 0.3, z]}>
                  <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.012, 0.012, 0.3, 5]} /><meshStandardMaterial color="#3f8a47" /></mesh>
                  <group position={[0.04, 0.06, 0.06]} scale={1.3}><Good item={item} /></group>
                  <mesh position={[0, 0.26, 0]}><icosahedronGeometry args={[0.1, 0]} /><meshStandardMaterial color="#3f9e6a" flatShading /></mesh>
                </group>
              ))}
            </group>
          ))}
        </>
      ) : item === 'fish' ? (
        <>
          {/* the fishing pier: planks on posts, and crates of the catch */}
          <mesh position={[0, 0.12, 0]} receiveShadow castShadow><boxGeometry args={[2, 0.1, 1.2]} /><meshStandardMaterial color="#a87b4f" /></mesh>
          {[[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, 0.05, z]}><cylinderGeometry args={[0.06, 0.06, 0.2, 8]} /><meshStandardMaterial color="#6b4a2f" /></mesh>)}
          {[-0.45, 0.45].map((x) => (
            <group key={x} position={[x, 0.32, 0]}>
              <mesh castShadow><boxGeometry args={[0.6, 0.3, 0.5]} /><meshStandardMaterial color="#6b4a2f" /></mesh>
              {[-0.15, 0.05, 0.2].map((dx) => <group key={dx} position={[dx, 0.2, 0]} scale={1.4}><Good item="fish" /></group>)}
            </group>
          ))}
        </>
      ) : item === 'salt' ? (
        <>
          {/* the salt pans: shallow beds of brine with white heaps */}
          <mesh position={[0, 0.04, 0]} receiveShadow><boxGeometry args={[2, 0.08, 1.2]} /><meshStandardMaterial color="#cfe3ea" roughness={0.3} /></mesh>
          {[[-0.55, -0.25], [0.15, -0.3], [-0.2, 0.3], [0.6, 0.25]].map(([x, z], i) => <mesh key={i} position={[x, 0.24, z]} castShadow><coneGeometry args={[0.28, 0.4, 9]} /><meshStandardMaterial color="#f3f1ea" roughness={0.95} /></mesh>)}
        </>
      ) : item === 'timber' ? (
        <>
          {/* the lumber camp: a stack of logs */}
          {[[-0.5, 0.18, 0], [0, 0.18, 0], [0.5, 0.18, 0], [-0.25, 0.48, 0], [0.25, 0.48, 0]].map(([x, y, z], i) => (
            <mesh key={i} position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]} castShadow><cylinderGeometry args={[0.17, 0.17, 1.1, 12]} /><meshStandardMaterial color="#a87b4f" /></mesh>
          ))}
        </>
      ) : item === 'gems' ? (
        <>
          {/* the gem seam: a rock face with crystals */}
          <mesh position={[0, 0.5, 0]} castShadow><dodecahedronGeometry args={[0.85, 0]} /><meshStandardMaterial color="#8e8a96" flatShading roughness={0.85} /></mesh>
          {[[-0.35, 0.75, 0.55, '#7b4de0'], [0.25, 0.95, 0.5, '#d6336c'], [0.45, 0.5, 0.6, '#0b8f8f']].map(([x, y, z, c], i) => (
            <mesh key={i} position={[x as number, y as number, z as number]}><octahedronGeometry args={[0.16, 0]} /><meshStandardMaterial color={c as string} emissive={c as string} emissiveIntensity={0.35} roughness={0.1} /></mesh>
          ))}
        </>
      ) : item === 'wine' ? (
        <>
          {/* the vineyard: rows of vines and a barrel */}
          {[-0.4, 0, 0.4].map((z) => (
            <group key={z}>
              <mesh position={[-0.2, 0.25, z]} castShadow><boxGeometry args={[1.4, 0.4, 0.14]} /><meshStandardMaterial color="#5a8a3a" /></mesh>
              {[-0.7, -0.3, 0.1, 0.5].map((x) => <mesh key={x} position={[x, 0.32, z + 0.09]}><sphereGeometry args={[0.06, 8, 8]} /><meshStandardMaterial color="#7a2846" /></mesh>)}
            </group>
          ))}
          <mesh position={[0.8, 0.3, 0]} castShadow><cylinderGeometry args={[0.22, 0.22, 0.55, 14]} /><meshStandardMaterial color="#8a5a32" /></mesh>
        </>
      ) : item === 'cotton' ? (
        <>
          {/* cotton shed full of fluffy bales */}
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[2, 1, 1.2]} /><meshStandardMaterial color="#e6ebf3" /></mesh>
          {/* a gabled roof: two sloping panels meeting at a ridge */}
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.52, 1.28, 0]} rotation={[0, 0, -side * 0.5]} castShadow><boxGeometry args={[1.2, 0.07, 1.34]} /><meshStandardMaterial color="#4a8bff" emissive="#1b3a7a" emissiveIntensity={0.5} /></mesh>
          ))}
          <mesh position={[0, 1.52, 0]}><boxGeometry args={[0.1, 0.07, 1.36]} /><meshStandardMaterial color="#2d63c8" emissive="#1b3a7a" emissiveIntensity={0.4} /></mesh>
          <mesh position={[0, 0.4, 0.62]}><boxGeometry args={[0.9, 0.8, 0.03]} /><meshStandardMaterial color="#16264a" /></mesh>
          {[-0.5, 0.5].map((x) => <group key={x} position={[x, 0.16, 0.9]}><mesh castShadow><boxGeometry args={[0.45, 0.3, 0.4]} /><meshStandardMaterial color="#fbfbf7" /></mesh></group>)}
        </>
      ) : (
        <>
          {/* scrap heap of crushed metal, with the actual material poking out */}
          <mesh position={[0, 0.45, 0]} castShadow><dodecahedronGeometry args={[0.85, 0]} /><meshStandardMaterial color="#7a8696" flatShading roughness={0.8} /></mesh>
          <mesh position={[0.6, 0.25, 0.3]} castShadow rotation={[0.3, 0.5, 0]}><dodecahedronGeometry args={[0.45, 0]} /><meshStandardMaterial color="#9099a6" flatShading /></mesh>
          <mesh position={[-0.55, 0.22, 0.35]} castShadow rotation={[0.1, 0.2, 0.4]}><dodecahedronGeometry args={[0.38, 0]} /><meshStandardMaterial color="#6a5a4a" flatShading /></mesh>
          <group position={[0.1, 0.95, 0.2]} scale={2.2}><Good item={item} /></group>
        </>
      )}
      {lit && <pointLight position={[item === 'cotton' ? -1.2 : 1.2, 1.6, 1.4]} intensity={9} distance={6} color="#ffc861" />}
      {on && <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.5, 48]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
      <Html zIndexRange={[5, 0]} position={[0, 1.9, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={label}>{text}<div style={{ fontSize: 10, color: '#ffc861' }}>{detail}</div>{next && <div style={{ background: '#d6336c', borderRadius: 6, marginTop: 2 }}>▼ NEXT</div>}</div>
      </Html>
    </group>
  );
}

/** A plot of frontier land: a marked-out patch with a sign showing its price, its owner, or both. */
function LandModel({ plot, pos, on, onSelect }: { plot: Plot; pos: [number, number]; on: boolean; onSelect: () => void }) {
  const price = plot.owner ? plot.forSale : plot.price;
  const top = plot.owner ? (plot.owner.mine ? 'Your land' : `${plot.owner.name}'s land`) : 'Land for sale';
  return (
    <group position={[wx(pos[0]), 0, wz(pos[1])]} onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh position={[0, 0.03, 0]} receiveShadow><boxGeometry args={[3, 0.04, 2]} /><meshStandardMaterial color={plot.owner ? '#efe2c2' : '#e6e0d2'} /></mesh>
      {[[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, 0.2, z]} castShadow><cylinderGeometry args={[0.04, 0.04, 0.4, 6]} /><meshStandardMaterial color="#8a5a32" /></mesh>)}
      <mesh position={[-0.6, 0.5, 0]} castShadow><cylinderGeometry args={[0.04, 0.05, 1, 6]} /><meshStandardMaterial color="#5a4632" /></mesh>
      <mesh position={[-0.6, 0.95, 0]} castShadow><boxGeometry args={[0.7, 0.3, 0.05]} /><meshStandardMaterial color={plot.owner?.mine ? '#2f8cff' : '#f2b01e'} /></mesh>
      {on && <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.7, 1.85, 48]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
      <Html zIndexRange={[5, 0]} position={[0, 1.5, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={label}>{top}{price !== null && <div style={{ fontSize: 10, color: '#ffc861' }}>{price.toLocaleString('en-US')} coins</div>}</div>
      </Html>
    </group>
  );
}

/**
 * A frontier, in 3D: open ground with the trees, rocks or vines of the place, its source, eight plots of land, and the businesses
 * players have built on them. No shops until players build them.
 */
function FrontierScene({ realm, state, selected, onSelect, popups, animate }: { realm: FrontierId; state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups: Popup[]; animate: boolean }) {
  const f = FRONTIER[realm];
  const light = lightAt(state.hour);
  const focus = state.coach.focus;
  const night = light.opacity;
  const dark = Math.min(1, night / 0.5);
  const rain = state.shocks.some((x) => x.kind === 'rain');
  const z = FRONTIER_LAYOUT.zone;
  const plots = state.land?.here ?? [];
  const sign = ROAD_SIGN[realm];
  const decor: [number, number, number][] = [[40, 120, 1], [60, 520, 0.9], [975, 60, 0.8], [130, 650, 0.8], [700, 655, 0.7], [400, 650, 0.9], [985, 400, 0.8]];
  return (
    <>
      <color attach="background" args={[mix('#e4ece4', '#080d24', dark)]} />
      <fog attach="fog" args={[mix('#e4ece4', '#080d24', dark), 24 - dark * 6, 60 - dark * 14]} />
      <ambientLight intensity={0.95 - dark * 0.68} color={mix('#ffffff', '#7f93ff', dark)} />
      <directionalLight position={[6, 10, 5]} intensity={1.3 - dark * 0.95} color={mix('#ffffff', '#a9bcff', dark)} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={9} shadow-camera-bottom={-9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[26, 18]} /><meshStandardMaterial color={mix(f.ground, '#262f52', dark)} />
      </mesh>
      <RoundedBox args={[z.w / U, 0.05, z.h / U]} radius={0.03} position={[wx(z.x + z.w / 2), 0.015, wz(z.y + z.h / 2)]} receiveShadow>
        <meshStandardMaterial color={f.zone} />
      </RoundedBox>
      <Html zIndexRange={[5, 0]} position={[wx(z.x + z.w / 2), 4, wz(z.y + 30)]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: 'rgba(22,38,74,.55)', font: '700 15px system-ui, sans-serif', letterSpacing: 1.5, padding: '4px 14px', border: '1px solid rgba(255,255,255,.35)' }}>{f.label.toUpperCase()}{state.land?.discovered ? ` · FIRST REACHED BY ${state.land.discovered.by.toUpperCase()}` : ''}</div></Html>
      {decor.map(([x, y, sc], i) => (
        f.decor === 'trees' ? <group key={i}><Tree x={x} y={y} s={sc} /><Tree x={x + 30} y={y + 16} s={sc * 0.8} /></group>
          : f.decor === 'rocks' ? <mesh key={i} position={[wx(x), 0.35 * sc, wz(y)]} castShadow><dodecahedronGeometry args={[0.6 * sc, 0]} /><meshStandardMaterial color="#8e8a96" flatShading /></mesh>
          : <group key={i} position={[wx(x), 0, wz(y)]}>{[-0.4, 0, 0.4].map((dz) => <mesh key={dz} position={[0, 0.22, dz]} castShadow><boxGeometry args={[1.4, 0.4, 0.12]} /><meshStandardMaterial color="#5a8a3a" /></mesh>)}</group>
      ))}
      {plots.filter((x) => !x.business).map((plot) => (
        <LandModel key={plot.id} plot={plot} pos={FRONTIER_LAYOUT.plots[plot.n]} on={selected?.kind === 'land' && selected.id === plot.id} onSelect={() => onSelect({ kind: 'land', id: plot.id })} />
      ))}
      {state.stalls.map((s) => {
        const plot = plots.find((x) => x.business?.id === s.id);
        if (!plot) return null;
        return <StallModel key={s.id} s={s} pos={FRONTIER_LAYOUT.plots[plot.n]} selected={selected?.kind === 'stall' && selected.id === s.id}
          next={focus?.kind === 'stall' && focus.id === s.id} onSelect={() => onSelect({ kind: 'stall', id: s.id })} />;
      })}
      {state.sources.filter((src) => src.item === f.source).map((src) => (
        <SourceModel key={src.item} pos={FRONTIER_LAYOUT.source} lit={night >= 0.28} item={src.item} label={src.item} detail={`${src.cost} coins each`}
          on={selected?.kind === 'source' && selected.item === src.item} next={focus?.kind === 'source' && focus.id === src.item}
          onSelect={() => onSelect({ kind: 'source', item: src.item })} />
      ))}
      <RoadSign3D at={sign.at} label={sign.label} on={selected?.kind === 'road'} onSelect={() => onSelect({ kind: 'road', realm: sign.to })} />
      {(state.online ?? []).filter((o) => o.realm === realm).map((o, _i, here) => {
        const [ox, oy] = spotOffset(here.indexOf(o));
        return <OtherPlayerModel key={o.id} player={o} at={[FRONTIER_LAYOUT.you[0] + ox, FRONTIER_LAYOUT.you[1] + oy]} selected={selected?.kind === 'player' && selected.id === o.id} onSelect={() => onSelect({ kind: 'player', id: o.id })} />;
      })}
      <YouModel state={state} at={FRONTIER_LAYOUT.you} />
      {[[200, 600], [920, 600], [200, 20], [920, 20]].map(([x, y], i) => <Lamp key={i} x={wx(x)} z={wz(y)} on={night >= 0.28} />)}
      {night >= 0.28 && plots.filter((x) => x.business).map((x) => { const [px, py] = FRONTIER_LAYOUT.plots[x.n]; return <pointLight key={x.id} position={[wx(px), 1.2, wz(py) + 0.8]} intensity={9} distance={6} color="#ffc861" />; })}
      {animate && rain && <Rain />}
      {popups.map((p) => (
        <Html zIndexRange={[5, 0]} key={p.id} position={[wx(p.x), 1.6, wz(p.y)]} center style={{ pointerEvents: 'none' }}>
          <div style={{ ...label, background: p.tone === 'gain' ? '#2f8f4e' : p.tone === 'spend' ? '#d6336c' : '#16264a', fontSize: 14 }}>{p.text}</div>
        </Html>
      ))}
    </>
  );
}

/** A signpost: the road out of this realm. Tap it to see the journey. */
function RoadSign3D({ at, label: text, on, onSelect }: { at: [number, number]; label: string; on: boolean; onSelect: () => void }) {
  return (
    <group position={[wx(at[0]), 0, wz(at[1])]} onClick={(e) => { e.stopPropagation(); onSelect(); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }} onPointerOut={() => { document.body.style.cursor = ''; }}>
      <mesh position={[0, 0.6, 0]} castShadow><cylinderGeometry args={[0.05, 0.06, 1.2, 8]} /><meshStandardMaterial color="#5a4632" /></mesh>
      <mesh position={[0.25, 1.05, 0]} castShadow><boxGeometry args={[0.8, 0.26, 0.05]} /><meshStandardMaterial color="#f2b01e" /></mesh>
      <mesh position={[0.7, 1.05, 0]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.18, 0.18, 0.05]} /><meshStandardMaterial color="#f2b01e" /></mesh>
      {on && <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.55, 0.68, 40]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
      <Html zIndexRange={[5, 0]} position={[0.2, 1.55, 0]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: '#8a5a00' }}>{text} →</div></Html>
    </group>
  );
}

/** You, with your look and your vehicle, standing at `at` (canvas coordinates). For Saltmere and the frontiers, which have no walkways. */
function YouModel({ state, at }: { state: GameState; at: [number, number] }) {
  const look = state.you.avatar ?? DEFAULT_AVATAR;
  const shirt = SHIRTS[look.shirt];
  return (
    <group position={[wx(at[0]), 0, wz(at[1])]}>
      <Person id="you" shirt={shirt} look={look} cap={look.hat === 'cap' ? mix(shirt, '#000000', 0.45) : undefined} scale={1.45} />
      <group position={[0.6, 0, 0.1]} rotation={[0, 0.3, 0]}><Vehicle kind={state.you.vehicle} /></group>
      <Html zIndexRange={[5, 0]} position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: shirt }}>You</div></Html>
    </group>
  );
}

/** The walkway stop for whatever is selected right now, so you can walk there; the market's own spot otherwise. */
function goalFor(state: GameState, selected: Selection): Stop {
  if (selected?.kind === 'stall') {
    const s = state.stalls.find((x) => x.id === selected.id);
    const g = s && stopForStall(s.id, s.market);
    if (g) return g;
  } else if (selected?.kind === 'source') {
    const g = SOURCE_STOP[selected.item];
    if (g) return g;
  } else if (selected?.kind === 'plot') {
    const g = PLOT_STOP[selected.market];
    if (g) return g;
  }
  return DEFAULT_STOP[(state.you.at as 'produce' | 'fabric' | 'scrap') ?? 'produce'];
}

const YOU_SPEED = 1.6;

/** You, in town: walks the streets to whatever you clicked (see walkToward in paths.ts), instead of snapping there. */
function YouWalker({ state, goal }: { state: GameState; goal: Stop }) {
  const ref = useRef<THREE.Group>(null);
  const [mode, setMode] = useState<'walk' | 'idle'>('idle');
  const walk = useRef<Walk | null>(null);
  if (!walk.current) walk.current = { at: goal.node, path: [], dwell: 0, x: wx(NODES[goal.node][0]), z: wz(NODES[goal.node][1]), yaw: goal.facing, rng: seeded(1) };
  const shown = useRef<'walk' | 'idle'>('idle');
  useFrame((_, dt) => {
    const g = ref.current;
    const w = walk.current!;
    if (!g) return;
    walkToward(w, goal, YOU_SPEED, Math.min(dt, 0.1));
    g.position.set(w.x, 0, w.z);
    g.rotation.y = w.yaw;
    const now = w.path.length ? 'walk' : 'idle';
    if (now !== shown.current) { shown.current = now; setMode(now); }
  });
  const look = state.you.avatar ?? DEFAULT_AVATAR;
  const shirt = SHIRTS[look.shirt];
  return (
    <group ref={ref}>
      <Person id="you" shirt={shirt} look={look} cap={look.hat === 'cap' ? mix(shirt, '#000000', 0.45) : undefined} mode={mode} scale={1.45} />
      <group position={[0.6, 0, 0.1]} rotation={[0, 0.3, 0]}><Vehicle kind={state.you.vehicle} /></group>
      <Html zIndexRange={[5, 0]} position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: shirt }}>You</div></Html>
    </group>
  );
}

/** Spreads two or more online players standing at the same spot (map pixel units, same scale as AVATAR_AT). */
function spotOffset(i: number): [number, number] {
  const a = i * 2.4 + 0.6;
  return [Math.cos(a) * 26, Math.sin(a) * 16];
}

/** Another signed-in player, shown where they are right now. Click them to see their stats. `at` is in map pixel units, like AVATAR_AT. */
function OtherPlayerModel({ player, at, selected, onSelect }: { player: OnlinePlayer; at: [number, number]; selected: boolean; onSelect: () => void }) {
  const look = player.avatar ?? DEFAULT_AVATAR;
  const shirt = SHIRTS[look.shirt];
  return (
    <group position={[wx(at[0]), 0, wz(at[1])]} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <Person id={player.id} shirt={shirt} look={look} cap={look.hat === 'cap' ? mix(shirt, '#000000', 0.45) : undefined} scale={1.3} />
      <Html zIndexRange={[5, 0]} position={[0, 1.4, 0]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: shirt, opacity: selected ? 1 : 0.88 }}>{player.name}</div></Html>
      {selected && <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.6, 0.72, 32]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
    </group>
  );
}

/** A boat at its mooring, rocking gently. */
function Boat({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  useTick((t) => { if (ref.current) { ref.current.rotation.z = Math.sin(t * 0.9 + x) * 0.05; ref.current.position.y = Math.sin(t * 1.1 + y) * 0.03; } });
  return (
    <group position={[wx(x), 0, wz(y)]} rotation={[0, r, 0]}>
      <group ref={ref}>
        <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[2.2, 0.35, 0.8]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[1.15, 0.1, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><boxGeometry args={[0.56, 0.35, 0.56]} /><meshStandardMaterial color={color} /></mesh>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[2, 0.05, 0.66]} /><meshStandardMaterial color="#a87b4f" /></mesh>
        <mesh position={[-0.1, 1.2, 0]} castShadow><cylinderGeometry args={[0.04, 0.05, 1.8, 8]} /><meshStandardMaterial color="#5a4632" /></mesh>
        <mesh position={[0.3, 1.25, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.05, 1]} /><meshStandardMaterial color="#f6f2e6" side={DoubleSide} /></mesh>
        <mesh position={[0.32, 1.25, 0]}><boxGeometry args={[0.75, 1.3, 0.02]} /><meshStandardMaterial color="#f6f2e6" /></mesh>
      </group>
    </group>
  );
}

/**
 * Saltmere Harbour, in 3D: a stone quay, the market along the top, the fishing pier and the salt pans on the quay, and the
 * sea below the shore line with boats at their moorings. Same stalls, sources and people as the town.
 */
function HarbourScene({ state, selected, onSelect, popups, animate }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups: Popup[]; animate: boolean }) {
  const light = lightAt(state.hour);
  const focus = state.coach.focus;
  const night = light.opacity;
  const dark = Math.min(1, night / 0.5);
  const rain = state.shocks.some((x) => x.kind === 'rain');
  const z = HARBOUR.zone;
  const shoreZ = wz(HARBOUR.shore);
  const sign = ROAD_SIGN.saltmere;
  return (
    <>
      <color attach="background" args={[mix('#dfe9f0', '#080d24', dark)]} />
      <fog attach="fog" args={[mix('#dfe9f0', '#080d24', dark), 24 - dark * 6, 60 - dark * 14]} />
      <ambientLight intensity={0.95 - dark * 0.68} color={mix('#ffffff', '#7f93ff', dark)} />
      <directionalLight position={[6, 10, 5]} intensity={1.3 - dark * 0.95} color={mix('#ffffff', '#a9bcff', dark)} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={9} shadow-camera-bottom={-9} />
      {/* the quay, down to the shore */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, (wz(0) + shoreZ) / 2]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[24, shoreZ - wz(0)]} /><meshStandardMaterial color={mix('#d6cfc2', '#2e3450', dark)} />
      </mesh>
      <mesh position={[0, 0.06, shoreZ]} receiveShadow><boxGeometry args={[24, 0.2, 0.3]} /><meshStandardMaterial color={mix('#8a7a66', '#2a2d3e', dark)} /></mesh>
      {/* the sea */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, shoreZ + 4]} onClick={() => onSelect(null)}>
        <planeGeometry args={[30, 8]} /><meshStandardMaterial color={mix('#4f8fb8', '#0e1d3d', dark)} roughness={0.25} metalness={0.2} />
      </mesh>
      {/* the jetty out to the boats */}
      <mesh position={[wx(330), 0.05, shoreZ + 1.1]} castShadow receiveShadow><boxGeometry args={[1.2, 0.12, 2.2]} /><meshStandardMaterial color="#a87b4f" /></mesh>
      {HARBOUR.boats.map(([x, y, r], i) => <Boat key={i} x={x} y={y} r={r} color={['#c8622e', '#2a6fdb', '#2f9e5f'][i % 3]} />)}

      <RoundedBox args={[z.w / U, 0.06, z.h / U]} radius={0.03} position={[wx(z.x + z.w / 2), 0.02, wz(z.y + z.h / 2)]} receiveShadow>
        <meshStandardMaterial color={GROUND.harbour} />
      </RoundedBox>
      <Html zIndexRange={[5, 0]} position={[wx(z.x + z.w / 2), 4, wz(z.y + 40)]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: 'rgba(22,38,74,.55)', font: '700 15px system-ui, sans-serif', letterSpacing: 1.5, padding: '4px 14px', border: '1px solid rgba(255,255,255,.35)' }}>{z.label.toUpperCase()}</div></Html>

      {state.stalls.map((s) => {
        const pos = REALM_OF[s.market] === 'saltmere' ? HARBOUR.stalls[s.id] : undefined;
        if (!pos) return null;
        return <StallModel key={s.id} s={s} pos={pos} selected={selected?.kind === 'stall' && selected.id === s.id}
          next={focus?.kind === 'stall' && focus.id === s.id} onSelect={() => onSelect({ kind: 'stall', id: s.id })} />;
      })}
      {state.sources.map((src) => {
        const pos = HARBOUR.sources[src.item];
        return pos ? (
          <SourceModel key={src.item} pos={pos} lit={night >= 0.28} item={src.item} label={src.item} detail={src.cost > 0 ? `${src.cost} coins each` : `${src.units} free`}
            on={selected?.kind === 'source' && selected.item === src.item} next={focus?.kind === 'source' && focus.id === src.item}
            onSelect={() => onSelect({ kind: 'source', item: src.item })} />
        ) : null;
      })}
      <RoadSign3D at={sign.at} label={sign.label} on={selected?.kind === 'road'} onSelect={() => onSelect({ kind: 'road', realm: sign.to })} />
      {(state.online ?? []).filter((o) => o.realm === 'saltmere').map((o, _i, here) => {
        const [ox, oy] = spotOffset(here.indexOf(o));
        return <OtherPlayerModel key={o.id} player={o} at={[HARBOUR.you[0] + ox, HARBOUR.you[1] + oy]} selected={selected?.kind === 'player' && selected.id === o.id} onSelect={() => onSelect({ kind: 'player', id: o.id })} />;
      })}
      <YouModel state={state} at={HARBOUR.you} />
      {[[150, 330], [500, 330], [850, 330], [150, 470], [850, 470]].map(([x, y], i) => <Lamp key={i} x={wx(x)} z={wz(y)} on={night >= 0.28} />)}
      {night >= 0.28 && Object.values(HARBOUR.stalls).map(([x, y], i) => <pointLight key={i} position={[wx(x), 1.2, wz(y) + 0.8]} intensity={9} distance={6} color="#ffc861" />)}
      {animate && rain && <Rain />}
      {popups.map((p) => (
        <Html zIndexRange={[5, 0]} key={p.id} position={[wx(p.x), 1.6, wz(p.y)]} center style={{ pointerEvents: 'none' }}>
          <div style={{ ...label, background: p.tone === 'gain' ? '#2f8f4e' : p.tone === 'spend' ? '#d6336c' : '#16264a', fontSize: 14 }}>{p.text}</div>
        </Html>
      ))}
    </>
  );
}

function Rain() {
  const ref = useRef<THREE.Points>(null);
  // Where each drop starts (fixed, so the rain looks the same in every frame of the video), and where it is at time t.
  const start = useMemo(() => {
    const a = new Float32Array(600 * 3);
    const rng = seeded(7);
    for (let i = 0; i < 600; i++) { a[i * 3] = (rng() - 0.5) * 22; a[i * 3 + 1] = rng() * 8; a[i * 3 + 2] = (rng() - 0.5) * 15; }
    return a;
  }, []);
  const pos = useMemo(() => start.slice(), [start]);
  useTick((time) => {
    const attr = ref.current?.geometry.attributes.position;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < 600; i++) arr[i * 3 + 1] = (((start[i * 3 + 1] - time * 7) % 8) + 8) % 8;
    attr.needsUpdate = true;
  });
  return <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" array={pos} count={600} itemSize={3} /></bufferGeometry><pointsMaterial color="#a8c4f0" size={0.06} /></points>;
}

function Scene(props: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups: Popup[]; animate: boolean }) {
  // Saltmere Harbour has its own scene; everything below is the town.
  const here = props.state.realm?.here ?? 'town';
  if (here === 'saltmere') return <HarbourScene {...props} />;
  if (isFrontier(here)) return <FrontierScene realm={here} {...props} />;
  return <TownScene {...props} />;
}

function TownScene({ state, selected, onSelect, popups, animate }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups: Popup[]; animate: boolean }) {
  const drive = useContext(Drive);
  const light = lightAt(state.hour);
  const focus = state.coach.focus;
  const goal = goalFor(state, selected);
  const rain = state.shocks.some((x) => x.kind === 'rain');
  const night = light.opacity;
  const dark = Math.min(1, night / 0.5); // 0 in daylight, 1 in the dead of night
  // Where townsfolk go shopping: in front of every stall that is open, and at every source.
  const stops = useMemo(() => [
    ...state.stalls.filter((x) => x.state !== 'closed').map((x) => stopForStall(x.id, x.market)),
    ...state.sources.map((x) => SOURCE_STOP[x.item]),
  ].filter((x): x is Stop => !!x), [state.stalls, state.sources]);
  return (
    <>
      {/* day, dusk and night: a moonlit blue town with warm pools of light under the stalls and lamps */}
      <color attach="background" args={[mix('#dfe5ee', '#080d24', dark)]} />
      <fog attach="fog" args={[mix('#dfe5ee', '#080d24', dark), 24 - dark * 6, 60 - dark * 14]} />
      <ambientLight intensity={0.95 - dark * 0.68} color={mix('#ffffff', '#7f93ff', dark)} />
      <directionalLight position={[6, 10, 5]} intensity={1.3 - dark * 0.95} color={mix('#ffffff', '#a9bcff', dark)} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={9} shadow-camera-bottom={-9} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[24, 17]} /><meshStandardMaterial color={mix('#dfe5ee', '#262f52', dark)} />
      </mesh>

      {(Object.keys(ZONES) as MarketId[]).filter((id) => REALM_OF[id] === 'town').map((id) => {
        const z = ZONES[id];
        return (
          <group key={id}>
            <RoundedBox args={[z.w / U, 0.06, z.h / U]} radius={0.03} position={[wx(z.x + z.w / 2), 0.02, wz(z.y + z.h / 2)]} receiveShadow>
              <meshStandardMaterial color={GROUND[id]} />
            </RoundedBox>
            {/* the market's name hangs high above a back-row market, clear of the stalls' own labels. A front-row market's name would
                hang over the markets behind it from this camera, so it sits low, on the walkway in front of the market instead. */}
            {(!drive || drive.banners) && <Html zIndexRange={[5, 0]} position={z.y < 100 ? [wx(z.x + z.w / 2), 4, wz(z.y + 40)] : [wx(z.x + z.w / 2), 0.15, wz(z.y + z.h - 12)]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: 'rgba(22,38,74,.55)', font: '700 15px system-ui, sans-serif', letterSpacing: 1.5, padding: '4px 14px', border: '1px solid rgba(255,255,255,.35)' }}>{z.label.toUpperCase()}</div></Html>}
          </group>
        );
      })}

      <Walkways />
      {TREES.map(([x, y, sc], i) => <Tree key={i} x={x} y={y} s={sc} />)}
      {/* a ring of small buildings around the district to give it a skyline */}
      {[[-11, -6.5, 1.6, 2.2, '#c98a6a'], [-9, -7, 1.2, 1.6, '#d9b88f'], [11, -6.5, 1.5, 2.6, '#9fb4cf'], [9.5, -7, 1.4, 1.5, '#cfa7b5'], [-11, 6.5, 1.5, 1.9, '#a8c7a0'], [11, 6.5, 1.6, 2.1, '#d9c27a']].map(([x, z, w, h, c], i) => (
        <group key={i} position={[x as number, 0, z as number]}>
          <mesh position={[0, (h as number) / 2, 0]} castShadow receiveShadow><boxGeometry args={[w as number, h as number, 1.3]} /><meshStandardMaterial color={c as string} /></mesh>
          <mesh position={[0, (h as number) + 0.2, 0]} castShadow><boxGeometry args={[(w as number) + 0.15, 0.12, 1.45]} /><meshStandardMaterial color="#5a4a40" /></mesh>
          {[0.35, 0.95].map((y) => <mesh key={y} position={[0, y + 0.3, 0.66]}><boxGeometry args={[0.35, 0.3, 0.02]} /><meshStandardMaterial color={night >= 0.28 ? '#ffd98a' : '#8fb8d8'} emissive={night >= 0.28 ? '#ffc861' : '#000'} emissiveIntensity={night >= 0.28 ? 1 : 0} /></mesh>)}
        </group>
      ))}

      {state.business.stallOffer && (Object.keys(PLOTS) as MarketId[]).map((mk) => (
        <PlotModel key={mk} market={mk} on={selected?.kind === 'plot' && selected.market === mk} onSelect={() => onSelect({ kind: 'plot', market: mk })} />
      ))}

      {state.stalls.map((s) => {
        const pos = STALL_POS[s.id] ?? PLOTS[s.market];
        if (!pos) return null;
        return <StallModel key={s.id} s={s} pos={pos} selected={selected?.kind === 'stall' && selected.id === s.id}
          next={focus?.kind === 'stall' && focus.id === s.id} onSelect={() => onSelect({ kind: 'stall', id: s.id })} />;
      })}

      {state.sources.map((src) => (
        <SourceModel key={src.item} lit={night >= 0.28} item={src.item} label={src.item} detail={src.cost > 0 ? `${src.cost} coins each` : `${src.units} free`}
          on={selected?.kind === 'source' && selected.item === src.item} next={focus?.kind === 'source' && focus.id === src.item}
          onSelect={() => onSelect({ kind: 'source', item: src.item })} />
      ))}

      {animate && (drive?.walkStops ?? stops).length > 1 && WALKER_COLORS.map((c, i) => drive
        ? <VideoWalker key={i} id={`walker${i}`} color={c} stops={drive.walkStops ?? stops} speed={0.8 + (i % 3) * 0.12} seed={i * 7919 + 13} t={drive.t} />
        : <Walker key={i} id={`walker${i}`} color={c} stops={stops} speed={0.8 + (i % 3) * 0.12} seed={i * 7919 + 13} />)}
      {animate && <Truck />}

      {(state.online ?? []).filter((o) => o.realm === 'town').map((o, _i, here) => {
        const sameSpot = here.filter((x) => x.market === o.market);
        const [bx, by] = AVATAR_AT[o.market];
        const [ox, oy] = spotOffset(sameSpot.indexOf(o));
        return <OtherPlayerModel key={o.id} player={o} at={[bx + ox, by + oy]} selected={selected?.kind === 'player' && selected.id === o.id} onSelect={() => onSelect({ kind: 'player', id: o.id })} />;
      })}
      <YouWalker state={state} goal={goal} />
      {(!drive || drive.travel) && <RoadSign3D at={ROAD_SIGN.town.at} label={ROAD_SIGN.town.label} on={selected?.kind === 'road'} onSelect={() => onSelect({ kind: 'road', realm: ROAD_SIGN.town.to })} />}

      {state.shocks.some((x) => x.kind === 'festive season') && <Festive />}
      {state.shocks.some((x) => x.kind === 'fuel queue') && <FuelQueue />}
      {/* street lamps along the roads, glowing after dark */}
      {LAMPS.map(([x, y], i) => <Lamp key={i} x={wx(x)} z={wz(y)} on={night >= 0.28} />)}
      {night >= 0.28 && state.stalls.map((st) => {
        const pos = STALL_POS[st.id] ?? PLOTS[st.market];
        return pos && st.state !== 'closed' ? <pointLight key={st.id} position={[wx(pos[0]), 1.2, wz(pos[1]) + 0.8]} intensity={9} distance={6} color="#ffc861" /> : null;
      })}
      {animate && rain && <Rain />}

      {popups.map((p) => (
        <Html zIndexRange={[5, 0]} key={p.id} position={[wx(p.x), 1.6, wz(p.y)]} center style={{ pointerEvents: 'none' }}>
          <div style={{ ...label, background: p.tone === 'gain' ? '#2f8f4e' : p.tone === 'spend' ? '#d6336c' : '#16264a', fontSize: 14 }}>{p.text}</div>
        </Html>
      ))}
    </>
  );
}

/** Copy what a WebGL canvas shows into a 2D canvas that sits on top of it (made the first time), and hide the WebGL one. */
function mirror(source: HTMLCanvasElement) {
  const parent = source.parentElement;
  if (!parent) return;
  let copy = parent.querySelector<HTMLCanvasElement>('canvas[data-mirror]');
  if (!copy) {
    copy = document.createElement('canvas');
    copy.dataset.mirror = '1';
    Object.assign(copy.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', zIndex: '0', pointerEvents: 'none' });
    parent.appendChild(copy);
    source.style.opacity = '0';
  }
  if (copy.width !== source.width || copy.height !== source.height) { copy.width = source.width; copy.height = source.height; }
  copy.getContext('2d')?.drawImage(source, 0, 0);
}

/** In the video: put the camera where the script says, and say when the frame has been drawn. */
function DriveRig({ drive }: { drive: VideoDrive }) {
  const { camera, advance, gl } = useThree();
  // Setting a canvas's size clears it, even to the size it already has, and the page is re-rendered several times in each video frame, each
  // time re-configuring the canvas. Only pass a size on to the canvas when it really changes, so a drawn frame is not wiped before it is captured.
  useLayoutEffect(() => {
    const original = gl.setSize.bind(gl);
    let w = -1, h = -1;
    gl.setSize = (width: number, height: number, updateStyle?: boolean) => {
      if (width === w && height === h) return;
      w = width; h = height;
      original(width, height, updateStyle);
    };
    return () => { gl.setSize = original; };
  }, [gl]);
  // Re-run whenever the canvas is resized: resizing clears a canvas, and with no render loop of its own nothing would draw it again.
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const lost = () => console.warn('3D: the WebGL context was lost');
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl]);
  useLayoutEffect(() => {
    camera.position.set(...drive.camera.position);
    const cam = camera as THREE.PerspectiveCamera;
    if (drive.camera.fov) { cam.fov = drive.camera.fov; cam.updateProjectionMatrix(); }
    camera.lookAt(...drive.camera.target);
    camera.updateMatrixWorld();
    // Draw now, in this very step, with every per-frame update (the labels too) run: nothing is left to a render loop that might not have
    // caught up. Then copy the picture into an ordinary 2D canvas laid over the 3D one: a screenshot can catch a WebGL canvas between
    // presentations (it comes out blank), but a 2D canvas is part of the page like an image, so it cannot.
    advance(drive.t, true);
    mirror(gl.domElement);
    // Then wait for the browser to show it, draw once more (cheap, and certain: the canvas holds this frame at the moment of release),
    // and only then say so.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        advance(drive.t, true);
        mirror(gl.domElement);
        id = requestAnimationFrame(() => drive.onDrawn?.(drive.frameKey));
      });
    });
    return () => cancelAnimationFrame(id);
  }, [camera, advance, drive, size.width, size.height]);
  return null;
}

/**
 * The district as a 3D town. Same props as the 2D map, so the screen can swap one for the other:
 * click a stall, plot or source to open its panel; drag to turn the view, scroll to zoom.
 * With `drive` (the demo video) the time and camera come from outside and nothing is interactive.
 */
export function DistrictMap3D({ state, selected, onSelect, popups = [], moving, drive }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups?: Popup[]; moving?: boolean; drive?: VideoDrive }) {
  const animate = moving ?? (drive ? true : !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches));
  // The canvas is its own React tree, so the drive has to be provided inside it. In the video the whole screen is zoomed with CSS, which a
  // bounding-box measurement would count twice: the canvas measures its layout size instead (offsetSize).
  return (
    <div className="map map3d" aria-label="3D map of the market district">
      {drive ? (
        <Canvas shadows frameloop="never" dpr={drive.dpr ?? 1} resize={{ offsetSize: true, scroll: false, debounce: 0 }} camera={{ position: drive.camera.position, fov: drive.camera.fov ?? 38 }} gl={{ preserveDrawingBuffer: true, antialias: true }}>
          <Drive.Provider value={drive}>
            <Scene state={state} selected={selected} onSelect={onSelect} popups={popups} animate={animate} />
            <DriveRig drive={drive} />
          </Drive.Provider>
        </Canvas>
      ) : (
        <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 13, 12], fov: 38 }}>
          <Scene state={state} selected={selected} onSelect={onSelect} popups={popups} animate={animate} />
          <OrbitControls makeDefault enablePan={false} minDistance={9} maxDistance={26} minPolarAngle={0.35} maxPolarAngle={1.2} />
        </Canvas>
      )}
    </div>
  );
}
