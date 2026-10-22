/**
 * Procedural 3D hall: stepped rows, instanced seats, emissive screen, amber aisle lights.
 * Built from scratch with primitive geometry; no external models or textures.
 * This file (and three.js) is only ever loaded through React.lazy on the seat page.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import { makeHallLooks, rowGlow, type HallLooks } from './hallLooks'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Hall, Seat } from '@/lib/api'

export type HallSceneProps = {
  hall: Hall
  taken: Set<string>
  selected: string[]
  focusSeat: Seat | null
  hovered: Seat | null
  /** fix12 §15.z: the 3D preview seat (outline accent 60%, not selected) */
  preview?: Seat | null
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

function eye(p: THREE.Vector3, phone = false) {
  // fix8 (BUILD-NOTES 3): on a portrait phone the seat-eye view was all screen and cropped the selected seats a few rows ahead.
  // Phone: eye a little higher/behind the seat and aimed lower, so rows ahead + the screen both fit (with the wider phone fov).
  if (phone) return { pos: new THREE.Vector3(p.x, p.y + 1.85, p.z + 0.35), look: new THREE.Vector3(p.x * 0.5, SCREEN.y - 1.9, SCREEN.z + 2) }
  // fix9 desktop: aim ~0.9 below the screen centre so the rows ahead sit above the 64px peek bar (+16px inset), screen still in frame
  return { pos: new THREE.Vector3(p.x, p.y + 1.15, p.z + 0.05), look: new THREE.Vector3(0, SCREEN.y - 0.9, SCREEN.z) }
}

const TAKEN = new THREE.Color('#3A2A2E')
/** §15 gold edge: back top rail + back sides + both arms, seat-local (seat origin = row floor). Body stays velvet. */
function edgeGeometry(grow: number, thin = false) {
  // fix9 desktop (thin): seen from above the 5cm rail + glow read as a solid gold top. Thin = 2.5cm rail on the back's rear top edge
  // (velvet stays visible in front of it) and thinner sides/arms.
  const r = thin ? 0.025 : 0.05
  const parts = [
    thin ? [0.52, r, r, 0, 1.01, 0.3] : [0.54, 0.05, 0.05, 0, 1.03, 0.22],
    [r, 0.62, r, -0.27, 0.72, 0.29], [r, 0.62, r, 0.27, 0.72, 0.29],
    [r, r, 0.5, -0.28, 0.5, 0.02], [r, r, 0.5, 0.28, 0.5, 0.02],
  ].map(([w, h, d, x, y, z]) => new THREE.BoxGeometry(w * (w < 0.1 ? grow : 1), h * (h < 0.1 ? grow : 1), d * (d < 0.1 ? grow : 1)).translate(x, y, z))
  return mergeGeometries(parts)!
}
/** fix7: instanced seats, cushion + tilted back merged into one geometry.
 *  fix8 §15: free/selected/access seats = velvet (physical: roughness 0.8, sheen at grazing angles = top edges, 256px fabric normal);
 *  taken seats = a second instanced mesh, muted #3A2A2E, no sheen, no normal. Selected = gold edge + soft glow, 1.5s pulse. */
function Seats({ hall, taken, selected, hovered, preview, onPick, onHover, looks, low, still, phone }: Pick<HallSceneProps, 'hall' | 'taken' | 'selected' | 'hovered' | 'preview' | 'onPick' | 'onHover' | 'phone'> & { looks: HallLooks; low: boolean; still: boolean }) {
  const items = useMemo(() => layout(hall), [hall])
  const open = useMemo(() => items.filter((i) => !taken.has(i.seat.id)), [items, taken])
  const shut = useMemo(() => items.filter((i) => taken.has(i.seat.id)), [items, taken])
  const mesh = useRef<THREE.InstancedMesh>(null), takenMesh = useRef<THREE.InstancedMesh>(null)
  const edge = useRef<THREE.InstancedMesh>(null), glow = useRef<THREE.InstancedMesh>(null), hoverEdge = useRef<THREE.InstancedMesh>(null), previewEdge = useRef<THREE.InstancedMesh>(null)
  const edgeMat = useRef<THREE.MeshBasicMaterial>(null), glowMat = useRef<THREE.MeshBasicMaterial>(null)
  const velvet = useRef<THREE.MeshPhysicalMaterial>(null)
  const geo = useMemo(() => {
    const cushion = new THREE.BoxGeometry(0.5, 0.18, 0.5).translate(0, 0.35, 0)
    const back = new THREE.BoxGeometry(0.5, 0.6, 0.12).rotateX(-0.12).translate(0, 0.7, 0.25)
    const g = mergeGeometries([cushion, back])!
    cushion.dispose(); back.dispose()
    return g
  }, [])
  const edgeGeo = useMemo(() => edgeGeometry(1, !phone), [phone]), glowGeo = useMemo(() => edgeGeometry(phone ? 2.6 : 1.8, !phone), [phone])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const MAXSEL = 8

  useEffect(() => {
    const m = mesh.current!, t = takenMesh.current!
    open.forEach(({ seat, pos }, i) => {
      const sel = selected.includes(seat.id)
      tmp.position.set(pos.x, pos.y + (sel ? 0.08 : 0), pos.z); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix)
      m.setColorAt(i, seat.type === 'access' ? C.access : hovered?.id === seat.id && !sel ? C.hover : C.free)
    })
    m.count = open.length
    shut.forEach(({ pos }, i) => { tmp.position.set(pos.x, pos.y, pos.z); tmp.updateMatrix(); t.setMatrixAt(i, tmp.matrix) })
    t.count = shut.length
    for (const x of [m, t]) { x.instanceMatrix.needsUpdate = true; if (x.instanceColor) x.instanceColor.needsUpdate = true; x.computeBoundingSphere() }
    const sel = open.filter((i) => selected.includes(i.seat.id)).slice(0, MAXSEL)
    for (const e of [edge.current!, glow.current!]) {
      sel.forEach(({ pos }, i) => { tmp.position.set(pos.x, pos.y + 0.08, pos.z); tmp.updateMatrix(); e.setMatrixAt(i, tmp.matrix) })
      e.count = sel.length; e.instanceMatrix.needsUpdate = true
    }
    const h = hovered && !selected.includes(hovered.id) && !taken.has(hovered.id) ? items.find((i) => i.seat.id === hovered.id) : undefined
    if (h) { tmp.position.set(h.pos.x, h.pos.y, h.pos.z); tmp.updateMatrix(); hoverEdge.current!.setMatrixAt(0, tmp.matrix) }
    hoverEdge.current!.count = h ? 1 : 0; hoverEdge.current!.instanceMatrix.needsUpdate = true
    const pv = preview && !taken.has(preview.id) ? items.find((i) => i.seat.id === preview.id) : undefined
    if (pv) { tmp.position.set(pv.pos.x, pv.pos.y, pv.pos.z); tmp.updateMatrix(); previewEdge.current!.setMatrixAt(0, tmp.matrix) }
    previewEdge.current!.count = pv ? 1 : 0; previewEdge.current!.instanceMatrix.needsUpdate = true
  }, [items, open, shut, taken, selected, hovered, preview, tmp])
  // QA hook: screen position (CSS px) of a seat, so tests can tap real seats through the raycaster
  const { camera: cam, size } = useThree()
  useEffect(() => {
    const w = window as Window & { __lumenSeatXY?: (id: string) => { x: number; y: number } | null }
    w.__lumenSeatXY = (id) => { const it = items.find((i) => i.seat.id === id); if (!it) return null; const v = new THREE.Vector3(it.pos.x, it.pos.y + 0.45, it.pos.z).project(cam); return { x: (v.x + 1) / 2 * size.width, y: (1 - v.y) / 2 * size.height } }
  }, [items, cam, size])

  // §14 in-place quality drop also drops sheen + normal map (one recompile, at the drop only)
  useEffect(() => { const v = velvet.current; if (!v || !low) return; v.sheen = 0; v.normalMap = null; v.needsUpdate = true }, [low])
  // §15 pulse: opacity 0.7 -> 1 over 1.5s; reduced motion = steady
  useFrame(({ clock }) => {
    const k = still ? 1 : 0.85 + 0.15 * Math.cos(clock.elapsedTime * (2 * Math.PI / 1.5))
    if (edgeMat.current) edgeMat.current.opacity = k
    if (velvet.current && !low) velvet.current.normalScale.setScalar(0.8 * looks.mix.value) // normal map fades in with the bake
    if (glowMat.current) glowMat.current.opacity = (phone ? 0.22 : 0.14) * k
  })

  const handle = (list: typeof items) => (e: ThreeEvent<PointerEvent | MouseEvent>, kind: 'move' | 'click') => {
    e.stopPropagation()
    const item = e.instanceId != null ? list[e.instanceId] : undefined
    if (!item) return
    if (kind === 'click') { if ((e as ThreeEvent<MouseEvent>).delta > 8) return; onPick(item.seat) } // fix12: a drag that ends on a seat is not a tap
    else if (hovered?.id !== item.seat.id) onHover(item.seat)
  }
  const ev = (list: typeof items) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => handle(list)(e, 'click'), onPointerMove: (e: ThreeEvent<PointerEvent>) => handle(list)(e, 'move'), onPointerOut: () => onHover(null),
  })
  const noRay = () => null
  return (
    <>
      <instancedMesh ref={mesh} args={[geo, undefined, items.length]} {...ev(open)}>
        <meshPhysicalMaterial ref={velvet} roughness={0.8} sheen={0.7} sheenRoughness={0.45} sheenColor="#ff8a98" normalMap={looks.normal} normalScale={new THREE.Vector2(0.8, 0.8)} />
      </instancedMesh>
      <instancedMesh ref={takenMesh} args={[geo, undefined, items.length]} {...ev(shut)}>
        <meshStandardMaterial color={TAKEN} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={edge} args={[edgeGeo, undefined, MAXSEL]} raycast={noRay}>
        <meshBasicMaterial ref={edgeMat} color="#F2B544" transparent toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={glow} args={[glowGeo, undefined, MAXSEL]} raycast={noRay}>
        <meshBasicMaterial ref={glowMat} color="#F2B544" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {/* desktop hover: faint gold rim at 40% */}
      <instancedMesh ref={hoverEdge} args={[edgeGeo, undefined, 1]} raycast={noRay}>
        <meshBasicMaterial color="#F2B544" transparent opacity={0.4} toneMapped={false} />
      </instancedMesh>
      {/* fix12 §15.z: 3D preview outline, accent at 60%, no fill */}
      <instancedMesh ref={previewEdge} args={[edgeGeo, undefined, 1]} raycast={noRay}>
        <meshBasicMaterial color="#F2B544" transparent opacity={0.6} toneMapped={false} />
      </instancedMesh>
    </>
  )
}

function Room({ hall, looks }: { hall: Hall; looks: HallLooks }) {
  // flat = the pre-bake colours (fix7/8 look); the bake cross-fades in over them
  const bakeFloor = useMemo(() => looks.bake('#121218'), [looks]), bakeRiser = useMemo(() => looks.bake('#ffffff'), [looks]), bakeWall = useMemo(() => looks.bake('#17131a'), [looks])
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
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, 8]}><planeGeometry args={[width + 2, 30]} /><meshBasicMaterial map={looks.floor} toneMapped={false} {...bakeFloor} /></mesh>
      {hall.rows.map((_, ri) => (
        <mesh key={ri} position={[0, ri * ROW_RISE / 2, FIRST_ROW_Z + ri * ROW_DEPTH + 0.1]}>
          <boxGeometry args={[width, ri * ROW_RISE + 0.01, ROW_DEPTH]} />
          {/* §15 baked: AO band x per-row screen falloff (unlit) */}
          <meshBasicMaterial map={looks.riser} color={new THREE.Color('#5a3a3c').multiplyScalar(rowGlow(ri))} toneMapped={false} {...bakeRiser} />
        </mesh>
      ))}
      {/* side walls with step lights */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (width / 2 + 0.6), 3, 8]} rotation-y={-s * Math.PI / 2}><planeGeometry args={[30, 8]} /><meshBasicMaterial map={s < 0 ? looks.wallL : looks.wallR} side={THREE.DoubleSide} toneMapped={false} {...bakeWall} /></mesh>
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
      {/* §15: the 6 aisle point lights are gone; their glow is in the bake, the step dots stay */}
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#f6dcb0", "#0B0B0F", 0.6]} />
    </group>
  )
}

function CameraRig({ hall, focusSeat, resetKey, instant, phone }: Pick<HallSceneProps, 'hall' | 'focusSeat' | 'resetKey' | 'instant' | 'phone'>) {
  const { camera, gl, invalidate } = useThree()
  const items = useMemo(() => layout(hall), [hall])
  const from = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const to = useRef(overview(hall))
  const look = useRef(overview(hall).look.clone())
  const t = useRef(1)
  const drag = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0 })
  const fromDrag = useRef({ yaw: 0, pitch: 0 })
  const t0 = useRef(0)

  useEffect(() => { camera.position.copy(to.current.pos); camera.lookAt(to.current.look) }, [camera])

  const go = (target: { pos: THREE.Vector3; look: THREE.Vector3 }) => {
    from.current = { pos: camera.position.clone(), look: look.current.clone() }
    to.current = target
    fromDrag.current = { yaw: drag.current.yaw, pitch: drag.current.pitch } // fix12: the drag offset glides back to 0 with the move
    t.current = instant ? 1 : 0
    t0.current = -1 // fix12: time-based glide; the 400ms clock starts on the first frame after the click (wall clock, not summed dt)
    drag.current.active = false
    if (instant) {
      camera.position.copy(target.pos); look.current.copy(target.look); drag.current.yaw = 0; drag.current.pitch = 0
      const dir = target.look.clone().sub(target.pos); camera.lookAt(target.look); invalidate()
      ;(window as Window & { __lumenDrag?: unknown }).__lumenDrag = { yaw: 0, pitch: 0, dx: dir.x, dy: dir.y } // QA hook, same frame
    }
  }
  useEffect(() => {
    if (!focusSeat) return
    const item = items.find((i) => i.seat.id === focusSeat.id)
    if (item) { go(eye(item.pos, phone)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSeat])
  useEffect(() => {
    if (resetKey === 0) return
    go(overview(hall))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // drag to look around (clamped); fix12: stays where released (no spring-back).
  // fix11 (DESIGN §15, Street View grab): drag right -> hall follows the finger -> camera looks LEFT (yaw +); drag down -> looks UP (pitch +).
  // yaw used to be subtracted (looked toward the drag) while pitch was grab-style; same handler serves mouse + touch, overview + seat view.
  useEffect(() => {
    const el = gl.domElement
    const down = (e: PointerEvent) => { drag.current.active = true; drag.current.x = e.clientX; drag.current.y = e.clientY }
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d.active) return
      d.yaw = THREE.MathUtils.clamp(d.yaw + (e.clientX - d.x) * 0.004, -0.61, 0.61) // ±35°
      d.pitch = THREE.MathUtils.clamp(d.pitch + (e.clientY - d.y) * 0.004, -0.26, 0.26) // ±15°
      d.x = e.clientX; d.y = e.clientY
    }
    const up = () => { drag.current.active = false }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up) // fix11: touch scroll (pan-y) cancels the pointer; without this the drag stuck "active"
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up) }
  }, [gl])

  useFrame((_, dt) => {
    if (t.current < 1) {
      // fix12: 400ms ease-out glide (enter seat view, Change seats, Reset view); instant under reduced motion (see go())
      if (t0.current < 0) t0.current = performance.now()
      t.current = Math.min(1, (performance.now() - t0.current) / 400)
      const k = 1 - (1 - t.current) ** 3 // ease-out cubic
      camera.position.lerpVectors(from.current.pos, to.current.pos, k)
      look.current.lerpVectors(from.current.look, to.current.look, k)
      if (!drag.current.active) { drag.current.yaw = fromDrag.current.yaw * (1 - k); drag.current.pitch = fromDrag.current.pitch * (1 - k) }
    }
    const d = drag.current
    // fix12: no spring-back. After a drag the view stays where the user left it (no automatic camera move after drag/zoom).
    const dir = look.current.clone().sub(camera.position)
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw)
    dir.y += d.pitch * dir.length()
    camera.lookAt(camera.position.clone().add(dir))
    ;(window as Window & { __lumenDrag?: { yaw: number; pitch: number; dx: number; dy: number } }).__lumenDrag = { yaw: d.yaw, pitch: d.pitch, dx: dir.x, dy: dir.y } // QA hook
  })
  return null
}

type IdleWin = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
/** next idle slot (Safari: setTimeout); returns a cancel fn */
function onIdle(cb: () => void) {
  const w = window as IdleWin
  if (w.requestIdleCallback) { const id = w.requestIdleCallback(cb, { timeout: 400 }); return () => w.cancelIdleCallback?.(id) }
  const t = setTimeout(cb, 16); return () => clearTimeout(t)
}

/** fix7: the hall used to build + link every shader + draw in one ~550ms task (4x CPU). Now each distinct shader program
 *  (material type x instancing x map x side) is compiled against the real scene lights in its own idle callback,
 *  then the first frame runs in another one. No single task does more than one program link. */
function Warmup({ onDone }: { onDone: () => void }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    performance.mark('lumen:hall-compile-start')
    const seen = new Set<string>(), reps: THREE.Object3D[] = []
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material & { map?: unknown }
      if (!(o as THREE.Mesh).isMesh || !m) return
      const k = `${m.type}|${(o as THREE.InstancedMesh).isInstancedMesh ? 1 : 0}|${m.map ? 1 : 0}|${m.side}`
      if (!seen.has(k)) { seen.add(k); reps.push(o) }
    })
    let i = 0, cancel = () => {}
    const step = () => {
      if (i < reps.length) { gl.compile(reps[i++], camera, scene); cancel = onIdle(step) }
      else { performance.mark('lumen:hall-compiled'); onDone() }
    }
    cancel = onIdle(step)
    return () => cancel()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
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

export default function HallScene3D(p: HallSceneProps & { onReady?: () => void; fpsGuard?: boolean; fpsForceSlow?: boolean; onStillSlow?: () => void; paused?: boolean; applyLooks?: boolean }) {
  // §15 textures: placeholders now, real webp files fetched once the curtains are gone
  const looks = useMemo(() => makeHallLooks(), [])
  useEffect(() => { if (p.applyLooks) looks.load(p.instant) }, [p.applyLooks, looks, p.instant])
  const maxDpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)
  const [dpr, setDpr] = useState(maxDpr)
  // §14 stage 0: full quality; 1: quality dropped IN PLACE (DPR 1 -> 0.75 on hi-dpi phones, no adaptive incline,
  // velvet sheen + normal map off) on the same Canvas/GL context, no remount; 2: still slow -> told parent (one-time toast).
  const [stage, setStage] = useState(0)
  const low = stage > 0
  const lowDpr = maxDpr > 1.5 ? 0.75 : 1
  const [compiled, setCompiled] = useState(false)
  // fix7: build the scene graph in two commits (room + lights, then the instanced seats) in separate idle slots
  const [built, setBuilt] = useState(false)
  useEffect(() => onIdle(() => setBuilt(true)), [])
  return (
    <div data-quality={low ? 'low' : 'full'} className="size-full">
    <Canvas
      dpr={low ? lowDpr : dpr}
      // fix6: frozen while the curtains slide, so software/weak GPUs give the compositor the whole frame budget
      frameloop={p.paused || !compiled ? 'never' : 'always'}
      camera={{ fov: p.phone ? 66 : 55, near: 0.1, far: 80 }}
      gl={{ antialias: !p.phone, powerPreference: 'high-performance' }}
      shadows={false}
      onCreated={({ gl, scene }) => {
        const w = window as Window & { __lumenGL?: number }; w.__lumenGL = (w.__lumenGL ?? 0) + 1 // QA: GL contexts created
        scene.background = new THREE.Color('#0B0B0F')
        scene.fog = new THREE.Fog('#0B0B0F', 18, 40)
        gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); p.onContextLost() })
      }}
      style={{ touchAction: 'none' }} // fix11: was pan-y, so a vertical finger drag scrolled the page instead of tilting; page still scrolls outside the canvas / in simple view
    >
      {!low && <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(maxDpr)} />}
      {p.fpsGuard && stage < 2 && <FpsGuard key={stage} forceSlow={p.fpsForceSlow} onSlow={() => { if (stage === 0) setStage(1); else { setStage(2); p.onStillSlow?.() } }} />}
      <Room hall={p.hall} looks={looks} />
      {built && <Seats {...p} looks={looks} low={low} still={p.instant} />}
      <FirstFrame onReady={p.onReady} />
      {built && !compiled && <Warmup onDone={() => setCompiled(true)} />}
      <CameraRig hall={p.hall} focusSeat={p.focusSeat} resetKey={p.resetKey} instant={p.instant} phone={p.phone} />
    </Canvas>
    </div>
  )
}
