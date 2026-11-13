import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DECK, type Scenario } from '../sim';
import { runtime } from '../game/runtime';

const W = DECK.halfWidth * 2;
const D = DECK.halfDepth * 2;
const PX_PER_M = 24;

/** Deck markings drawn procedurally: plates, hazard perimeter, usable-zone lines and an original target. */
function deckTexture(usableHalfWidth: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = W * PX_PER_M;
  c.height = D * PX_PER_M;
  const g = c.getContext('2d')!;
  const m = (v: number) => v * PX_PER_M;
  const cx = c.width / 2;
  const cy = c.height / 2;

  g.fillStyle = '#2b3036';
  g.fillRect(0, 0, c.width, c.height);

  // Weathering: soft blotches.
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    const r = m(0.5 + rnd() * 3);
    g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.025)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Plate seams every 4 m.
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 2;
  for (let x = 0; x <= W; x += 4) {
    g.beginPath();
    g.moveTo(m(x), 0);
    g.lineTo(m(x), c.height);
    g.stroke();
  }
  for (let y = 0; y <= D; y += 4) {
    g.beginPath();
    g.moveTo(0, m(y));
    g.lineTo(c.width, m(y));
    g.stroke();
  }
  // Scorch around the centre from previous landings.
  const scorch = g.createRadialGradient(cx, cy, 0, cx, cy, m(13));
  scorch.addColorStop(0, 'rgba(10,8,6,0.55)');
  scorch.addColorStop(1, 'rgba(10,8,6,0)');
  g.fillStyle = scorch;
  g.fillRect(0, 0, c.width, c.height);

  // Hazard perimeter.
  const band = m(1.4);
  g.save();
  g.beginPath();
  g.rect(0, 0, c.width, c.height);
  g.rect(band, band, c.width - band * 2, c.height - band * 2);
  g.clip('evenodd');
  g.fillStyle = '#d29a35';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1d2024';
  for (let i = -c.height; i < c.width + c.height; i += m(2.4)) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + m(1.2), 0);
    g.lineTo(i + m(1.2) - c.height, c.height);
    g.lineTo(i - c.height, c.height);
    g.closePath();
    g.fill();
  }
  g.restore();

  // Usable-zone boundary (per preset): dashed lines with corner brackets.
  g.strokeStyle = 'rgba(240,236,226,0.85)';
  g.lineWidth = m(0.3);
  g.setLineDash([m(1.6), m(1.0)]);
  for (const side of [-1, 1]) {
    const x = cx + side * m(usableHalfWidth);
    g.beginPath();
    g.moveTo(x, band + m(1.2));
    g.lineTo(x, c.height - band - m(1.2));
    g.stroke();
  }
  g.setLineDash([]);

  // Target: rings and crosshair.
  g.strokeStyle = '#f0ece2';
  g.lineWidth = m(0.8);
  g.beginPath();
  g.arc(cx, cy, m(11), 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = m(0.35);
  g.beginPath();
  g.arc(cx, cy, m(7.2), 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#e3a43f';
  g.lineWidth = m(0.5);
  g.beginPath();
  g.arc(cx, cy, m(3.2), 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(240,236,226,0.75)';
  g.lineWidth = m(0.25);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    g.beginPath();
    g.moveTo(cx - dx * m(15), cy - dy * m(15));
    g.lineTo(cx - dx * m(4.2), cy - dy * m(4.2));
    g.moveTo(cx + dx * m(4.2), cy + dy * m(4.2));
    g.lineTo(cx + dx * m(15), cy + dy * m(15));
    g.stroke();
  }
  // Original emblem: an upward chevron.
  g.fillStyle = '#f0ece2';
  g.beginPath();
  g.moveTo(cx, cy - m(2.1));
  g.lineTo(cx + m(1.7), cy + m(1.2));
  g.lineTo(cx + m(0.8), cy + m(1.2));
  g.lineTo(cx, cy - m(0.3));
  g.lineTo(cx - m(0.8), cy + m(1.2));
  g.lineTo(cx - m(1.7), cy + m(1.2));
  g.closePath();
  g.fill();

  // Platform ID.
  g.fillStyle = 'rgba(240,236,226,0.7)';
  g.font = `600 ${m(1.6)}px ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillText('RECOVERY DECK 02', cx, c.height - band - m(1.6));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function Windsock() {
  const sock = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!sock.current) return;
    const w = runtime.view.wind;
    const strength = Math.min(1, Math.abs(w) / 8);
    // Droops in calm air, streams out downwind as wind rises.
    sock.current.rotation.y = w >= 0 ? 0 : Math.PI;
    sock.current.rotation.z = (Math.PI / 2) * (0.2 + 0.75 * strength);
  });
  return (
    <group position={[-35, 0, -21]}>
      <mesh position={[0, 3.5, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 7, 8]} />
        <meshStandardMaterial color="#9aa2aa" metalness={0.6} roughness={0.4} />
      </mesh>
      <group position={[0, 6.8, 0]} ref={sock}>
        <mesh position={[0, -1.4, 0]}>
          <cylinderGeometry args={[0.45, 0.2, 2.8, 12, 1, true]} />
          <meshStandardMaterial color="#e2853a" roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

export function Platform({ scenario }: { scenario: Scenario }) {
  const tex = useMemo(() => deckTexture(scenario.usableHalfWidth), [scenario.usableHalfWidth]);
  useEffect(() => () => tex.dispose(), [tex]);

  const hullMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#33404b', roughness: 0.75, metalness: 0.35 }), []);
  const trimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#56626c', roughness: 0.6, metalness: 0.5 }), []);
  const darkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1e252c', roughness: 0.8, metalness: 0.2 }), []);
  const lightMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffd59a' }), []);

  const ribs = useMemo(() => {
    const xs: number[] = [];
    for (let x = -36; x <= 36; x += 8) xs.push(x);
    return xs;
  }, []);
  const lights = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let x = -38; x <= 38; x += 7.6) {
      pts.push([x, 0.12, DECK.halfDepth - 0.4]);
      pts.push([x, 0.12, -DECK.halfDepth + 0.4]);
    }
    return pts;
  }, []);

  return (
    <group>
      {/* Deck surface: top at y = 0, exactly the collision plane. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial map={tex} roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Hull, extending below the sea surface. */}
      <mesh position={[0, -5.5, 0]} material={hullMat} receiveShadow castShadow>
        <boxGeometry args={[W + 0.6, 11, D + 0.6]} />
      </mesh>
      {/* Deck edge trim. */}
      <mesh position={[0, -0.35, DECK.halfDepth + 0.35]} material={trimMat}>
        <boxGeometry args={[W + 0.8, 0.7, 0.3]} />
      </mesh>
      <mesh position={[0, -0.35, -DECK.halfDepth - 0.35]} material={trimMat}>
        <boxGeometry args={[W + 0.8, 0.7, 0.3]} />
      </mesh>
      {/* Hull ribs on the visible side. */}
      {ribs.map((x) => (
        <mesh key={x} position={[x, -3.4, DECK.halfDepth + 0.45]} material={darkMat}>
          <boxGeometry args={[0.6, 5.5, 0.3]} />
        </mesh>
      ))}
      {/* Corner thruster pods, below deck level. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`${sx}${sz}`} position={[sx * (DECK.halfWidth - 3), -4.2, sz * (DECK.halfDepth + 1.4)]} material={darkMat}>
            <boxGeometry args={[4, 3, 2.4]} />
          </mesh>
        )),
      )}
      {/* Back railing. */}
      <mesh position={[0, 1.05, -DECK.halfDepth + 0.15]} material={trimMat}>
        <boxGeometry args={[W - 1, 0.08, 0.08]} />
      </mesh>
      {ribs.map((x) => (
        <mesh key={`p${x}`} position={[x, 0.55, -DECK.halfDepth + 0.15]} material={trimMat}>
          <boxGeometry args={[0.1, 1.1, 0.1]} />
        </mesh>
      ))}
      {/* Equipment hut and mast at the back corner, well clear of the landing plane. */}
      <mesh position={[34, 2.2, -21]} material={hullMat} castShadow>
        <boxGeometry args={[6, 4.4, 4]} />
      </mesh>
      <mesh position={[35.5, 8, -21.5]} material={trimMat} castShadow>
        <cylinderGeometry args={[0.1, 0.14, 8, 6]} />
      </mesh>
      <mesh position={[35.5, 12.1, -21.5]} material={lightMat}>
        <sphereGeometry args={[0.22, 8, 8]} />
      </mesh>
      {lights.map((p, i) => (
        <mesh key={i} position={p} material={lightMat}>
          <boxGeometry args={[0.35, 0.12, 0.35]} />
        </mesh>
      ))}
      <Windsock />
    </group>
  );
}
