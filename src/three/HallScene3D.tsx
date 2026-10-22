/**
 * Procedural 3D hall: stepped rows, instanced seats, emissive screen, amber aisle lights.
 * Built from scratch with primitive geometry; no external models or textures.
 * This file (and three.js) is only ever loaded through React.lazy on the seat page.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import type { Hall, Seat } from '@/lib/api'

export type HallSceneProps = {
  hall: Hall
  taken: Set<string>
  selected: string[]
  focusSeat: Seat | null
  hovered: Seat | null
  onPick: (seat: Seat) => void
  onHover: (seat: Seat | null) => void
  onContextLost: () => void
  resetKey: number
  phone: boolean
  instant: boolean
}

const SPACING_X = 0.62
const ROW_DEPTH = 1.05
const ROW_RISE = 0.28
const FIRST_ROW_Z = 5
const SCREEN = { w: 11, h: 4.6, y: 3.4, z: 0 }
const SCREEN_CENTER = new THREE.Vector3(0, SCREEN.y, SCREEN.z)

const C = {
  free: new THREE.Color('#7A1F2B'),
  taken: new THREE.Color('#2b2b33'),
  selected: new THREE.Color('#F2B544'),
  access: new THREE.Color('#3B82F6'),
  hover: new THREE.Color('#c0485a'),
}

function layout(hall: Hall) {
  return hall.rows.flatMap((row, ri) =>
    row.seats.map((s) => ({
      seat: s,
      pos: new THREE.Vector3((s.x - (hall.columns - 1) / 2) * SPACING_X, ri * ROW_RISE, FIRST_ROW_Z + ri * ROW_DEPTH),
    })),
  )
}

function overview(hall: Hall) {
  const last = hall.rows.length - 1
  return { pos: new THREE.Vector3(0, last * ROW_RISE + 3.2, FIRST_ROW_Z + last * ROW_DEPTH + 3.2), look: new THREE.Vector3(0, 1.6, 2) }
}

function eye(p: THREE.Vector3) {
  return { pos: new THREE.Vector3(p.x, p.y + 1.15, p.z + 0.05), look: SCREEN_CENTER.clone() }
}

function Seats({ hall, taken, selected, hovered, onPick, onHover }: Pick<HallSceneProps, 'hall' | 'taken' | 'selected' | 'hovered' | 'onPick' | 'onHover'>) {
  const items = useMemo(() => layout(hall), [hall])
  const cushion = useRef<THREE.InstancedMesh>(null)
  const back = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => ({
    cushion: new THREE.BoxGeometry(0.5, 0.18, 0.5),
    back: new THREE.BoxGeometry(0.5, 0.6, 0.12),
  }), [])
  const tmp = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    items.forEach(({ seat, pos }, i) => {
      const sel = selected.includes(seat.id)
      const lift = sel ? 0.08 : 0
      tmp.position.set(pos.x, pos.y + 0.35 + lift, pos.z)
      tmp.updateMatrix()
      cushion.current!.setMatrixAt(i, tmp.matrix)
      tmp.position.set(pos.x, pos.y + 0.7 + lift, pos.z + 0.25)
      tmp.rotation.x = -0.12
      tmp.updateMatrix()
      tmp.rotation.x = 0
      back.current!.setMatrixAt(i, tmp.matrix)
      const col = taken.has(seat.id) ? C.taken : sel ? C.selected : hovered?.id === seat.id ? C.hover : seat.type === 'access' ? C.access : C.free
      cushion.current!.setColorAt(i, col)
      back.current!.setColorAt(i, col)
    })
    for (const m of [cushion.current!, back.current!]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [items, taken, selected, hovered, tmp])

  const handle = (e: ThreeEvent<PointerEvent | MouseEvent>, kind: 'move' | 'click') => {
    e.stopPropagation()
    const item = e.instanceId != null ? items[e.instanceId] : undefined
    if (!item) return
    if (kind === 'click') onPick(item.seat)
    else if (hovered?.id !== item.seat.id) onHover(item.seat)
  }
  const props = {
    onClick: (e: ThreeEvent<MouseEvent>) => handle(e, 'click'),
    onPointerMove: (e: ThreeEvent<PointerEvent>) => handle(e, 'move'),
    onPointerOut: () => onHover(null),
  }
  return (
    <>
      <instancedMesh ref={cushion} args={[geo.cushion, undefined, items.length]} {...props}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={back} args={[geo.back, undefined, items.length]} {...props}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </>
  )
}

function Room({ hall }: { hall: Hall }) {
  const rows = hall.rows.length
  const width = hall.columns * SPACING_X + 3
  const screenTex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 512; c.height = 214
    const g = c.getContext('2d')!
    const grad = g.createLinearGradient(0, 0, 512, 214)
    grad.addColorStop(0, '#F2B544'); grad.addColorStop(0.5, '#7A1F2B'); grad.addColorStop(1, '#1E3A5F')
    g.fillStyle = grad; g.fillRect(0, 0, 512, 214)
    g.fillStyle = 'rgba(244,241,234,0.9)'; g.font = '48px "Bebas Neue", Oswald, sans-serif'; g.textAlign = 'center'
    g.fillText('NOW PLAYING [PH]', 256, 120)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (mat.current) mat.current.color.setScalar(0.85 + Math.sin(clock.elapsedTime * 0.8) * 0.08)
  })
  return (
    <group>
      {/* floor + stepped risers */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 8]}><planeGeometry args={[width + 2, 30]} /><meshStandardMaterial color="#121218" /></mesh>
      {hall.rows.map((_, ri) => (
        <mesh key={ri} position={[0, ri * ROW_RISE / 2, FIRST_ROW_Z + ri * ROW_DEPTH + 0.1]}>
          <boxGeometry args={[width, ri * ROW_RISE + 0.01, ROW_DEPTH]} />
          <meshStandardMaterial color="#1a1a22" />
        </mesh>
      ))}
      {/* side walls with step lights */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (width / 2 + 0.6), 3, 8]} rotation-y={-s * Math.PI / 2}><planeGeometry args={[30, 8]} /><meshStandardMaterial color="#17131a" side={THREE.DoubleSide} /></mesh>
          {hall.rows.map((_, ri) => (
            <mesh key={ri} position={[s * (width / 2 + 0.55), ri * ROW_RISE + 0.25, FIRST_ROW_Z + ri * ROW_DEPTH]}>
              <boxGeometry args={[0.05, 0.08, 0.3]} /><meshBasicMaterial color="#F2B544" />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 3, rows * ROW_DEPTH + FIRST_ROW_Z + 3]}><planeGeometry args={[width + 2, 8]} /><meshStandardMaterial color="#141419" /></mesh>
      {/* screen */}
      <mesh position={[0, SCREEN.y, SCREEN.z]}><planeGeometry args={[SCREEN.w, SCREEN.h]} /><meshBasicMaterial ref={mat} map={screenTex} toneMapped={false} /></mesh>
      <mesh position={[0, SCREEN.y, SCREEN.z - 0.05]}><planeGeometry args={[SCREEN.w + 0.4, SCREEN.h + 0.4]} /><meshBasicMaterial color="#050507" /></mesh>
      <pointLight position={[0, SCREEN.y, 2]} intensity={60} distance={30} color="#f6dcb0" />
      {[-1, 1].map((s) => [6, 10, 14].map((z) => <pointLight key={`${s}${z}`} position={[s * (width / 2), 0.6, z]} intensity={1.2} distance={4} color="#F2B544" />))}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#f6dcb0", "#0B0B0F", 0.6]} />
    </group>
  )
}

function CameraRig({ hall, focusSeat, resetKey, instant }: Pick<HallSceneProps, 'hall' | 'focusSeat' | 'resetKey' | 'instant'>) {
  const { camera, gl } = useThree()
  const items = useMemo(() => layout(hall), [hall])
  const from = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const to = useRef(overview(hall))
  const look = useRef(overview(hall).look.clone())
  const t = useRef(1)
  const drag = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0 })

  useEffect(() => { camera.position.copy(to.current.pos); camera.lookAt(to.current.look) }, [camera])

  const go = (target: { pos: THREE.Vector3; look: THREE.Vector3 }) => {
    from.current = { pos: camera.position.clone(), look: look.current.clone() }
    to.current = target
    t.current = instant ? 1 : 0
    if (instant) { camera.position.copy(target.pos); look.current.copy(target.look) }
  }
  useEffect(() => {
    if (!focusSeat) return
    const item = items.find((i) => i.seat.id === focusSeat.id)
    if (item) { go(eye(item.pos)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeat])
  useEffect(() => {
    if (resetKey === 0) return
    go(overview(hall))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // drag to look around (clamped), springs back on release
  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => { drag.current.active = true; drag.current.x = e.clientX; drag.current.y = e.clientY }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d.active) return
      d.yaw = THREE.MathUtils.clamp(d.yaw - (e.clientX - d.x) * 0.004, -0.61, 0.61) // ±35°
      d.pitch = THREE.MathUtils.clamp(d.pitch + (e.clientY - d.y) * 0.004, -0.26, 0.26) // ±15°
      d.x = e.clientX; d.y = e.clientY
    }
    const up = () => { drag.current.active = false }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [gl])

  useFrame((_, dt) => {
    if (t.current < 1) {
      t.current = Math.min(1, t.current + dt / 0.9)
      const k = t.current < 0.5 ? 4 * t.current ** 3 : 1 - (-2 * t.current + 2) ** 3 / 2 // ease-in-out
      camera.position.lerpVectors(from.current.pos, to.current.pos, k)
      look.current.lerpVectors(from.current.look, to.current.look, k)
    }
    const d = drag.current
    if (!d.active) { d.yaw *= 0.9; d.pitch *= 0.9 }
    const dir = look.current.clone().sub(camera.position)
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw)
    dir.y += d.pitch * dir.length()
    camera.lookAt(camera.position.clone().add(dir))
  })
  return null
}

/** fix5: real readiness for the curtain loader = scene has rendered 2 frames (shaders compiled). */
function FirstFrame({ onReady }: { onReady?: () => void }) {
  const n = useRef(0)
  useFrame(() => { if (++n.current === 2) onReady?.() })
  return null
}

/** §14 slow-device net: report each continuous 2s stretch under 30fps. */
function FpsGuard({ onSlow, forceSlow }: { onSlow: () => void; forceSlow?: boolean }) {
  const st = useRef({ frames: 0, t: 0, low: 0, fired: false })
  useFrame((_, dt) => {
    const s = st.current
    if (s.fired) return
    s.frames++; s.t += dt
    if (s.t < 0.5) return
    const fps = forceSlow ? 0 : s.frames / s.t
    s.low = fps < 30 ? s.low + s.t : 0
    s.frames = 0; s.t = 0
    if (s.low >= 2) { s.fired = true; onSlow() }
  })
  return null
}

export default function HallScene3D(p: HallSceneProps & { onReady?: () => void; fpsGuard?: boolean; fpsForceSlow?: boolean; onStillSlow?: () => void }) {
  const maxDpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)
  const [dpr, setDpr] = useState(maxDpr)
  // stage 0: full quality; 1: DPR 1 + no antialias/shadows (Canvas remounts, a GL context can't drop MSAA live); 2: told parent
  const [stage, setStage] = useState(0)
  const low = stage > 0
  const swapping = useRef(false) // old canvas loses its context on the quality-drop remount; not a real loss
  return (
    <Canvas
      key={low ? 'low' : 'full'}
      dpr={low ? 1 : dpr}
      camera={{ fov: 55, near: 0.1, far: 80 }}
      gl={{ antialias: !p.phone && !low, powerPreference: 'high-performance' }}
      shadows={false}
      onCreated={({ gl, scene }) => {
        scene.background = new THREE.Color('#0B0B0F')
        scene.fog = new THREE.Fog('#0B0B0F', 18, 40)
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (!swapping.current) p.onContextLost() })
      }}
      style={{ touchAction: 'pan-y' }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} />
      {p.fpsGuard && stage < 2 && <FpsGuard key={stage} forceSlow={p.fpsForceSlow} onSlow={() => { if (stage === 0) { swapping.current = true; setTimeout(() => { swapping.current = false }, 1500); setStage(1) } else { setStage(2); p.onStillSlow?.() } }} />}
      <Room hall={p.hall} />
      <Seats {...p} />
      <FirstFrame onReady={p.onReady} />
      <CameraRig hall={p.hall} focusSeat={p.focusSeat} resetKey={p.resetKey} instant={p.instant} />
    </Canvas>
  )
}
