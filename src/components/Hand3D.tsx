import { Component, useRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import type { Group } from 'three'
import type { Choice } from '../lib/rps'
import { CHOICE_EMOJI } from '../lib/rps'

/** 외부 모델 없이 기본 도형(구/캡슐/라운드박스)만 조합해 만든 통통한 젤리 손 */

export const HAND_COLORS = { player: '#5ec8ff', cpu: '#8c9bff', royal: '#3f6bff', ice: '#cdeeff' } as const
type Tone = keyof typeof HAND_COLORS

function Jelly({ color }: { color: string }) {
  return <meshPhysicalMaterial color={color} roughness={0.28} clearcoat={1} clearcoatRoughness={0.12} sheen={1} sheenColor="#ffffff" />
}

function Face({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-0.24, 0.24].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshStandardMaterial color="#0a1228" roughness={0.2} />
          </mesh>
          <mesh position={[0.025, 0.03, 0.06]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color="#fff" />
          </mesh>
        </group>
      ))}
      {[-0.42, 0.42].map((x) => (
        <mesh key={x} position={[x, -0.14, -0.02]} scale={[1, 0.6, 0.4]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color="#ff8fb8" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function Finger({ r = 0.16, len, pos, rotZ = 0, color }: { r?: number; len: number; pos: [number, number, number]; rotZ?: number; color: string }) {
  return (
    <mesh position={pos} rotation={[0, 0, rotZ]}>
      <capsuleGeometry args={[r, len, 8, 20]} />
      <Jelly color={color} />
    </mesh>
  )
}

function Sleeve() {
  return (
    <mesh position={[0, -1.25, 0]}>
      <cylinderGeometry args={[0.62, 0.7, 0.55, 32]} />
      <meshStandardMaterial color="#12245a" roughness={0.5} />
    </mesh>
  )
}

function Rock({ color }: { color: string }) {
  return (
    <group>
      <mesh scale={[1.05, 0.92, 0.88]}>
        <sphereGeometry args={[0.9, 40, 40]} />
        <Jelly color={color} />
      </mesh>
      {[-0.6, -0.2, 0.2, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.62 - Math.abs(x) * 0.18, 0.4]}>
          <sphereGeometry args={[0.27, 24, 24]} />
          <Jelly color={color} />
        </mesh>
      ))}
      <mesh position={[-0.86, -0.1, 0.4]}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <Jelly color={color} />
      </mesh>
      <Face position={[0, -0.12, 0.75]} />
      <Sleeve />
    </group>
  )
}

function Paper({ color }: { color: string }) {
  const fingers: [number, number][] = [[-0.5, 0.62], [-0.17, 0.85], [0.17, 0.8], [0.5, 0.58]]
  return (
    <group position={[0, -0.1, 0]}>
      <RoundedBox args={[1.45, 1.35, 0.62]} radius={0.3} smoothness={6} position={[0, -0.2, 0]}>
        <Jelly color={color} />
      </RoundedBox>
      {fingers.map(([x, len]) => (
        <Finger key={x} len={len} r={0.17} pos={[x, 0.42 + len / 2 + 0.1, 0]} color={color} />
      ))}
      <Finger len={0.5} r={0.18} pos={[-1.0, -0.05, 0.05]} rotZ={0.85} color={color} />
      <Face position={[0, -0.3, 0.32]} />
      <Sleeve />
    </group>
  )
}

function Scissors({ color }: { color: string }) {
  return (
    <group position={[0, 0.05, 0]}>
      <mesh position={[0, -0.4, 0]} scale={[1, 0.95, 0.9]}>
        <sphereGeometry args={[0.8, 36, 36]} />
        <Jelly color={color} />
      </mesh>
      <Finger len={0.95} r={0.17} pos={[-0.3, 0.55, 0]} rotZ={0.3} color={color} />
      <Finger len={1.05} r={0.17} pos={[0.3, 0.57, 0]} rotZ={-0.3} color={color} />
      <mesh position={[0.5, -0.1, 0.45]}>
        <sphereGeometry args={[0.22, 20, 20]} />
        <Jelly color={color} />
      </mesh>
      <mesh position={[0.26, -0.02, 0.5]}>
        <sphereGeometry args={[0.2, 20, 20]} />
        <Jelly color={color} />
      </mesh>
      <mesh position={[-0.78, -0.45, 0.3]}>
        <sphereGeometry args={[0.25, 20, 20]} />
        <Jelly color={color} />
      </mesh>
      <Face position={[-0.05, -0.55, 0.7]} />
      <Sleeve />
    </group>
  )
}

export interface HandItem {
  choice: Choice
  tone?: Tone
  x: number
  scale?: number
  shaking?: boolean
  mirror?: boolean
}

function AnimatedHand({ item, index }: { item: HandItem; index: number }) {
  const ref = useRef<Group>(null)
  const spring = useRef({ s: 0.3, v: 0, choice: item.choice })
  const color = HAND_COLORS[item.tone ?? 'player']

  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const sp = spring.current
    if (sp.choice !== item.choice) {
      sp.choice = item.choice
      sp.s = 0.55 // 선택이 바뀌면 통! 하고 커졌다 자리잡는다
    }
    sp.v += (1 - sp.s) * 0.28
    sp.v *= 0.78
    sp.s += sp.v
    const t = state.clock.elapsedTime + index * 0.7
    const base = item.scale ?? 1
    g.scale.set(base * sp.s * (item.mirror ? -1 : 1), base * sp.s, base * sp.s)
    if (item.shaking) {
      g.position.y = Math.abs(Math.sin(t * 9)) * 0.55 - 0.3
      g.rotation.z = Math.sin(t * 9) * 0.18 * (item.mirror ? -1 : 1)
    } else {
      g.position.y += (Math.sin(t * 1.7) * 0.1 - g.position.y) * Math.min(1, dt * 8)
      g.rotation.z += (Math.sin(t * 0.9) * 0.06 - g.rotation.z) * Math.min(1, dt * 8)
    }
    g.rotation.y = Math.sin(t * 0.8) * 0.25 * (item.mirror ? -1 : 1)
  })

  return (
    <group position={[item.x, 0, 0]}>
      <group ref={ref}>
        {item.choice === 'rock' && <Rock color={color} />}
        {item.choice === 'paper' && <Paper color={color} />}
        {item.choice === 'scissors' && <Scissors color={color} />}
      </group>
      {/* 바닥 그림자 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.75, 0]} scale={[(item.scale ?? 1) * 1.1, (item.scale ?? 1) * 0.5, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial color="#000" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

/** 화면 폭이 좁아져도 손이 잘리지 않도록 씬 전체를 폭에 맞춰 축소한다. */
function Fit({ halfWidth, children }: { halfWidth: number; children: ReactNode }) {
  const vw = useThree((st) => st.viewport.width)
  const k = Math.min(1, vw / (2 * halfWidth))
  return <group scale={k}>{children}</group>
}

class WebGLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** 여러 손을 하나의 Canvas(=WebGL 컨텍스트 1개)에 그린다. 손 아래 가로 길이 기준으로 배치. */
export function HandStage({ items, height = 220, className = '' }: { items: HandItem[]; height?: number; className?: string }) {
  const fallback = (
    <div className="flex h-full items-center justify-around text-7xl">
      {items.map((it, i) => (
        <span key={i} className={it.shaking ? 'animate-shake' : 'animate-float'}>{CHOICE_EMOJI[it.choice]}</span>
      ))}
    </div>
  )
  return (
    <div className={`w-full ${className}`} style={{ height }} aria-hidden="true">
      <WebGLBoundary fallback={fallback}>
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.25, 7.5], fov: 38 }} gl={{ antialias: true, alpha: true }}>
          <hemisphereLight args={['#cdeeff', '#0a1228', 1.1]} />
          <directionalLight position={[3, 5, 5]} intensity={2.2} />
          <pointLight position={[-4, 1, 3]} intensity={30} color="#5ec8ff" />
          <pointLight position={[4, -1, 2]} intensity={14} color="#3f6bff" />
          <Fit halfWidth={Math.max(...items.map((it) => Math.abs(it.x) + 1.25 * (it.scale ?? 1))) + 0.2}>
            {items.map((it, i) => (
              <AnimatedHand key={i} item={it} index={i} />
            ))}
          </Fit>
        </Canvas>
      </WebGLBoundary>
    </div>
  )
}
