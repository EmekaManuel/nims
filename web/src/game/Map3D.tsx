import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, RoundedBox } from '@react-three/drei';
import type * as THREE from 'three';
import type { GameState, Item, MarketId, Stall } from '../api';
import { PLOTS, STALL_POS, ZONES, crateCount, lightAt, type Popup, type Selection } from './Map';

/** The 2D map is drawn on a 1000 x 680 canvas; the 3D town maps that onto the ground plane (50 px = 1 unit). */
const U = 50;
const wx = (px: number) => (px - 500) / U;
const wz = (py: number) => (py - 340) / U;

const SOURCE_POS: Record<string, [number, number]> = {
  tomatoes: [82, 110], pepper: [82, 250], iron: [100, 470], 'copper wire': [100, 590], cotton: [890, 470],
};
const SOURCE_COLOR: Record<string, string> = {
  tomatoes: '#d93b2b', pepper: '#e24a22', iron: '#8e99a8', 'copper wire': '#c8782e', cotton: '#e6ebf3',
};
const CANOPY: Record<MarketId, [string, string]> = {
  produce: ['#2f9e5f', '#f1f8f3'], fabric: ['#2a6fdb', '#f1f6fe'], scrap: ['#c8622e', '#f1ede7'],
};
const GROUND: Record<MarketId, string> = { produce: '#cfe8d3', fabric: '#cddcf3', scrap: '#ecd9c8' };
const AVATAR_AT: Record<MarketId, [number, number]> = { produce: [340, 368], fabric: [760, 368], scrap: [560, 372] };
const AVATARS = ['#2f9e5f', '#e2557b', '#7b4de0', '#eb6834', '#18a999', '#2a6fdb', '#c98a00', '#0e9fb0'];
const avatarColor = (id: string) => AVATARS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];

const WALKERS: { from: [number, number]; to: [number, number]; dur: number; phase: number; color: string }[] = [
  { from: [175, 356], to: [845, 356], dur: 34, phase: 0, color: '#e2557b' },
  { from: [575, 50], to: [575, 336], dur: 18, phase: 0.3, color: '#eb6834' },
  { from: [122, 650], to: [122, 60], dur: 46, phase: 0.5, color: '#2a6fdb' },
  { from: [945, 60], to: [945, 330], dur: 24, phase: 0.7, color: '#0e9fb0' },
];

const label: React.CSSProperties = {
  background: 'rgba(22,38,74,.92)', color: '#fff', font: '600 12px system-ui, sans-serif', padding: '3px 8px',
  borderRadius: 8, whiteSpace: 'nowrap', pointerEvents: 'none', textAlign: 'center',
};

const SKIN = ['#f1c9a5', '#e0a98a', '#c68863', '#a56b45', '#7b4a2e', '#5a3622'];
const HAIR = ['#1c1410', '#3a2618', '#6b4423', '#b8862b', '#8a8a8a', '#a1311f'];
const PANTS = ['#2b3a55', '#3d3d4a', '#5a4632', '#33503f'];
const hashOf = (id: string) => [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;

/** A small articulated person: head, hair, eyes, torso, swinging arms and legs. Faces +z. */
function Person({ id, shirt, scale = 1, mode = 'idle', apron, cap }: { id: string; shirt: string; scale?: number; mode?: 'idle' | 'walk'; apron?: string; cap?: string }) {
  const h = hashOf(id);
  const skin = SKIN[h % SKIN.length];
  const hair = HAIR[(h >> 3) % HAIR.length];
  const pants = PANTS[(h >> 5) % PANTS.length];
  const long = (h >> 7) % 3 === 0;
  const legL = useRef<THREE.Group>(null), legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null), armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + (h % 10);
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
          <mesh position={[0, 0.012, -0.012]} rotation={[-0.25, 0, 0]}><sphereGeometry args={[0.112, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.55]} /><meshStandardMaterial color={hair} /></mesh>
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

function Walker({ w, i }: { w: (typeof WALKERS)[number]; i: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = ((clock.elapsedTime / w.dur) + w.phase) % 1;
    const fwd = t < 0.5;
    const k = fwd ? t * 2 : 2 - t * 2; // there and back
    const x = wx(w.from[0] + (w.to[0] - w.from[0]) * k);
    const z = wz(w.from[1] + (w.to[1] - w.from[1]) * k);
    const dx = (w.to[0] - w.from[0]) * (fwd ? 1 : -1), dz = (w.to[1] - w.from[1]) * (fwd ? 1 : -1);
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(dx, dz);
  });
  return <group ref={ref}><Person id={`walker${i}`} shirt={w.color} mode="walk" scale={1.1} /></group>;
}

/** A delivery truck driving the south road. */
function Truck() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = ((clock.elapsedTime / 38) + 0.2) % 1;
    g.position.set(wx(30 + 940 * t), 0, wz(666));
  });
  return <group ref={ref} rotation={[0, Math.PI / 2, 0]}><Vehicle kind="van" color="#d6336c" /></group>;
}

function Lamp({ x, z, on }: { x: number; z: number; on: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.8, 0]} castShadow><cylinderGeometry args={[0.025, 0.035, 1.6, 8]} /><meshStandardMaterial color="#26364a" /></mesh>
      <mesh position={[0, 1.65, 0]}><sphereGeometry args={[0.1, 12, 12]} /><meshStandardMaterial color="#ffe3a0" emissive="#ffc861" emissiveIntensity={on ? 2.2 : 0.15} /></mesh>
      {on && <pointLight position={[0, 1.65, 0]} intensity={6} distance={5} color="#ffc861" />}
    </group>
  );
}

/** Festive season: bunting strung over the fabric market, with drifting confetti. */
function Festive() {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.4) * 0.02; });
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
    <group position={[wx(890), 0, wz(360)]}>
      {[0, 1, 2, 3].map((i) => <group key={i} position={[0, 0, i * 0.5]} rotation={[0, Math.PI, 0]} scale={0.6}><Vehicle kind="pickup" color={['#c8622e', '#2a6fdb', '#2f9e5f', '#7b4de0'][i]} /></group>)}
      <group position={[1.2, 0, 0.6]}>
        <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[0.35, 0.8, 0.35]} /><meshStandardMaterial color="#d6336c" /></mesh>
        <Html zIndexRange={[5, 0]} position={[0, 1.1, 0]} center style={{ pointerEvents: 'none' }}><div style={label}>FUEL QUEUE</div></Html>
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
  const roofY = 1.55;
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
      <mesh position={[0, 0.95, -0.6]} castShadow><boxGeometry args={[2.6, 1.0, 0.04]} /><meshStandardMaterial color="#d8c3a0" /></mesh>
      {[0.55, 0.85, 1.15].map((y) => <mesh key={y} position={[0, y, -0.57]}><boxGeometry args={[2.4, 0.03, 0.03]} /><meshStandardMaterial color={wood} /></mesh>)}
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
      <mesh position={[0, 1.38, 0.78]}><boxGeometry args={[0.8, 0.14, 0.02]} /><meshStandardMaterial color="#16264a" /></mesh>
      {selected && <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.9, 2.05, 48]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
      {next && <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[2.1, 2.25, 48]} /><meshBasicMaterial color="#d6336c" /></mesh>}
      <Html zIndexRange={[5, 0]} position={[0, 2.2, 0]} center style={{ pointerEvents: 'none' }}>
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

function SourceModel({ item, label: text, detail, on, next, onSelect }: { item: Item; label: string; detail: string; on: boolean; next: boolean; onSelect: () => void }) {
  const p = SOURCE_POS[item];
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
      ) : item === 'cotton' ? (
        <>
          {/* cotton shed full of fluffy bales */}
          <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[2, 1, 1.2]} /><meshStandardMaterial color="#e6ebf3" /></mesh>
          <mesh position={[0, 1.2, 0]} rotation={[0, 0, Math.PI / 4]} castShadow><boxGeometry args={[1.02, 1.02, 1.3]} /><meshStandardMaterial color="#2a6fdb" /></mesh>
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
      {on && <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.35, 1.5, 48]} /><meshBasicMaterial color="#f2b01e" /></mesh>}
      <Html zIndexRange={[5, 0]} position={[0, 1.9, 0]} center style={{ pointerEvents: 'none' }}>
        <div style={label}>{text}<div style={{ fontSize: 10, color: '#ffc861' }}>{detail}</div>{next && <div style={{ background: '#d6336c', borderRadius: 6, marginTop: 2 }}>▼ NEXT</div>}</div>
      </Html>
    </group>
  );
}

function Rain() {
  const ref = useRef<THREE.Points>(null);
  const pos = useMemo(() => {
    const a = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { a[i * 3] = (Math.random() - 0.5) * 22; a[i * 3 + 1] = Math.random() * 8; a[i * 3 + 2] = (Math.random() - 0.5) * 15; }
    return a;
  }, []);
  useFrame((_, dt) => {
    const attr = ref.current?.geometry.attributes.position;
    if (!attr) return;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < 600; i++) { arr[i * 3 + 1] -= dt * 7; if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 8; }
    attr.needsUpdate = true;
  });
  return <points ref={ref}><bufferGeometry><bufferAttribute attach="attributes-position" array={pos} count={600} itemSize={3} /></bufferGeometry><pointsMaterial color="#a8c4f0" size={0.06} /></points>;
}

function Scene({ state, selected, onSelect, popups, animate }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups: Popup[]; animate: boolean }) {
  const light = lightAt(state.hour);
  const focus = state.coach.focus;
  const you = AVATAR_AT[state.you.at ?? 'produce'];
  const rain = state.shocks.some((x) => x.kind === 'rain');
  const night = light.opacity;
  return (
    <>
      <color attach="background" args={[night > 0.2 ? '#1a2548' : '#dfe5ee']} />
      <ambientLight intensity={0.95 - night * 1.1} color={night > 0 ? light.color === '#ffffff' ? '#ffffff' : '#c8d0ff' : '#ffffff'} />
      <directionalLight position={[6, 10, 5]} intensity={1.3 - night * 1.6} castShadow shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={9} shadow-camera-bottom={-9} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow onClick={() => onSelect(null)}>
        <planeGeometry args={[24, 17]} /><meshStandardMaterial color="#dfe5ee" />
      </mesh>

      {(Object.keys(ZONES) as MarketId[]).map((id) => {
        const z = ZONES[id];
        return (
          <group key={id}>
            <RoundedBox args={[z.w / U, 0.06, z.h / U]} radius={0.03} position={[wx(z.x + z.w / 2), 0.02, wz(z.y + z.h / 2)]} receiveShadow>
              <meshStandardMaterial color={GROUND[id]} />
            </RoundedBox>
            <Html zIndexRange={[5, 0]} position={[wx(z.x + 90), 0.15, wz(z.y + 28)]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: 'rgba(22,38,74,.75)' }}>{z.label}</div></Html>
          </group>
        );
      })}

      <Tree x={44} y={372} /><Tree x={958} y={392} s={0.9} /><Tree x={900} y={640} s={0.8} /><Tree x={30} y={660} s={0.7} />
      <Tree x={150} y={355} s={0.6} /><Tree x={850} y={355} s={0.6} /><Tree x={570} y={660} s={0.7} /><Tree x={980} y={200} s={0.8} />
      {/* a ring of small buildings around the district to give it a skyline */}
      {[[-11, -6.5, 1.6, 2.2, '#c98a6a'], [-9, -7, 1.2, 1.6, '#d9b88f'], [11, -6.5, 1.5, 2.6, '#9fb4cf'], [9.5, -7, 1.4, 1.5, '#cfa7b5'], [-11, 6.5, 1.5, 1.9, '#a8c7a0'], [11, 6.5, 1.6, 2.1, '#d9c27a'], [0, 7.4, 2.4, 1.3, '#b9a9d4']].map(([x, z, w, h, c], i) => (
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
        <SourceModel key={src.item} item={src.item} label={src.item} detail={src.cost > 0 ? `${src.cost} coins each` : `${src.units} free`}
          on={selected?.kind === 'source' && selected.item === src.item} next={focus?.kind === 'source' && focus.id === src.item}
          onSelect={() => onSelect({ kind: 'source', item: src.item })} />
      ))}

      {animate && WALKERS.map((w, i) => <Walker key={i} w={w} i={i} />)}
      {animate && <Truck />}

      <group position={[wx(you[0]), 0, wz(you[1])]}>
        <Person id="you" shirt="#1d63d6" cap="#14253d" scale={1.45} />
        <group position={[0.6, 0, 0.1]} rotation={[0, 0.3, 0]}><Vehicle kind={state.you.vehicle} /></group>
        <Html zIndexRange={[5, 0]} position={[0, 1.55, 0]} center style={{ pointerEvents: 'none' }}><div style={{ ...label, background: '#1d63d6' }}>You</div></Html>
      </group>

      {state.shocks.some((x) => x.kind === 'festive season') && <Festive />}
      {state.shocks.some((x) => x.kind === 'fuel queue') && <FuelQueue />}
      {/* street lamps along the roads, glowing after dark */}
      {[[130, 190], [130, 530], [575, 355], [575, 190], [880, 355], [330, 355]].map(([x, y], i) => <Lamp key={i} x={wx(x)} z={wz(y)} on={night >= 0.28} />)}
      {night >= 0.28 && state.stalls.map((st) => {
        const pos = STALL_POS[st.id] ?? PLOTS[st.market];
        return pos && st.state !== 'closed' ? <pointLight key={st.id} position={[wx(pos[0]), 1.2, wz(pos[1]) + 0.8]} intensity={5} distance={4.5} color="#ffc861" /> : null;
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

/**
 * The district as a 3D town. Same props as the 2D map, so the screen can swap one for the other:
 * click a stall, plot or source to open its panel; drag to turn the view, scroll to zoom.
 */
export function DistrictMap3D({ state, selected, onSelect, popups = [], moving }: { state: GameState; selected: Selection; onSelect: (s: Selection) => void; popups?: Popup[]; moving?: boolean }) {
  const animate = moving ?? !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  return (
    <div className="map map3d" aria-label="3D map of the market district">
      <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 13, 12], fov: 38 }}>
        <Scene state={state} selected={selected} onSelect={onSelect} popups={popups} animate={animate} />
        <OrbitControls makeDefault enablePan={false} minDistance={9} maxDistance={26} minPolarAngle={0.35} maxPolarAngle={1.2} />
      </Canvas>
    </div>
  );
}
