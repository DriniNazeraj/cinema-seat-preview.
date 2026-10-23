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
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
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
  /** fix15 §15.u rev 3: the screen is >90° off-centre on this side (null = facing it) */
  onFacing?: (side: 'left' | 'right' | null) => void
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

// fix14 §15.v seat style A (classic red velvet): flat PBR colours, no new textures
const FABRIC = new THREE.Color('#8E1B24'), ACCESS = new THREE.Color('#3B82F6')
const TAKEN = new THREE.Color('#4A2A2D')
const WOOD = '#3B2416', BRASS = '#C9A24A'
/** walnut side panels, seat-local */
function woodGeometry() {
  return mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.05, 0.5, 0.56).translate(sx * 0.28, 0.27, 0.02)))!
}
/** brass caps on the front of both armrests */
function brassGeometry() {
  return mergeGeometries([-1, 1].map((sx) => new THREE.BoxGeometry(0.065, 0.03, 0.1).translate(sx * 0.28, 0.535, -0.2)))!
}
/** wheelchair icon decal (geometry, no texture) on the back's rear face, seen from the rows behind */
function wheelchairGeometry() {
  const wheel = new THREE.TorusGeometry(0.075, 0.016, 6, 20).translate(0.01, -0.06, 0)
  const head = new THREE.CircleGeometry(0.025, 12).translate(-0.02, 0.12, 0)
  const body = new THREE.PlaneGeometry(0.03, 0.12).translate(-0.02, 0.03, 0)
  const leg = new THREE.PlaneGeometry(0.09, 0.03).translate(0.02, -0.03, 0)
  const g = mergeGeometries([wheel, head, body, leg].map((x) => x.toNonIndexed()))!
  return g.rotateY(Math.PI).rotateX(-0.12).translate(0, 0.72, 0.32)
}
/** §15 gold edge: back top rail + back sides + both arms, seat-local (seat origin = row floor). Body stays velvet. */
function edgeGeometry(grow: number, thin = false) {
  // fix9 desktop (thin): seen from above the 5cm rail + glow read as a solid gold top. Thin = 2.5cm rail on the back's rear top edge
  // (velvet stays visible in front of it) and thinner sides/arms.
  const r = thin ? 0.025 : 0.05
  const parts = [
    thin ? [0.48, r, r, 0, 1.03, 0.3] : [0.5, 0.05, 0.05, 0, 1.05, 0.22],
    [r, 0.62, r, -0.27, 0.72, 0.29], [r, 0.62, r, 0.27, 0.72, 0.29],
    [r, r, 0.5, -0.28, 0.54, 0.02], [r, r, 0.5, 0.28, 0.54, 0.02],
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
    // fix14 §15.v: bevelled cushion + rounded back (fabric parts; still the only raycast targets).
    // The back keeps the fix13 silhouette height: a taller back hid the front-row centre seats (A7–A10) from the overview camera and broke the hit test.
    const cushion = new RoundedBoxGeometry(0.5, 0.18, 0.5, 2, 0.05).translate(0, 0.35, 0)
    const back = new RoundedBoxGeometry(0.5, 0.62, 0.12, 3, 0.055).rotateX(-0.12).translate(0, 0.71, 0.25)
    const g = mergeGeometries([cushion, back])!
    cushion.dispose(); back.dispose()
    return g
  }, [])
  const woodGeo = useMemo(woodGeometry, []), brassGeo = useMemo(brassGeometry, []), chairGeo = useMemo(wheelchairGeometry, [])
  const wood = useRef<THREE.InstancedMesh>(null), brass = useRef<THREE.InstancedMesh>(null), chair = useRef<THREE.InstancedMesh>(null), chairTaken = useRef<THREE.InstancedMesh>(null)
  const edgeGeo = useMemo(() => edgeGeometry(1, !phone), [phone]), glowGeo = useMemo(() => edgeGeometry(phone ? 2.6 : 1.8, !phone), [phone])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  const MAXSEL = 8

  useEffect(() => {
    const m = mesh.current!, t = takenMesh.current!
    open.forEach(({ seat, pos }, i) => {
      const sel = selected.includes(seat.id)
      tmp.position.set(pos.x, pos.y + (sel ? 0.08 : 0), pos.z); tmp.updateMatrix(); m.setMatrixAt(i, tmp.matrix)
      m.setColorAt(i, seat.type === 'access' ? ACCESS : FABRIC) // fix14: hover = 30% rim only, no fabric tint
    })
    m.count = open.length
    shut.forEach(({ pos }, i) => { tmp.position.set(pos.x, pos.y, pos.z); tmp.updateMatrix(); t.setMatrixAt(i, tmp.matrix) })
    t.count = shut.length
    // fix14: walnut panels + brass caps on every seat (lift with a selected seat); wheelchair decal on free access seats
    items.forEach(({ seat, pos }, i) => {
      tmp.position.set(pos.x, pos.y + (selected.includes(seat.id) && !taken.has(seat.id) ? 0.08 : 0), pos.z); tmp.updateMatrix()
      wood.current!.setMatrixAt(i, tmp.matrix); brass.current!.setMatrixAt(i, tmp.matrix)
    })
    const acc = open.filter((i) => i.seat.type === 'access')
    acc.forEach(({ seat, pos }, i) => { tmp.position.set(pos.x, pos.y + (selected.includes(seat.id) ? 0.08 : 0), pos.z); tmp.updateMatrix(); chair.current!.setMatrixAt(i, tmp.matrix) })
    chair.current!.count = acc.length
    // fix15 §15.v: taken access seats keep the wheelchair icon, 40% opacity on the taken colour
    const accT = shut.filter((i) => i.seat.type === 'access')
    accT.forEach(({ pos }, i) => { tmp.position.set(pos.x, pos.y, pos.z); tmp.updateMatrix(); chairTaken.current!.setMatrixAt(i, tmp.matrix) })
    chairTaken.current!.count = accT.length
    for (const x of [wood.current!, brass.current!, chair.current!, chairTaken.current!]) { x.instanceMatrix.needsUpdate = true; x.computeBoundingSphere() }
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
  const { camera: cam, size } = useThree()
    // fix13 hit test: return a screen point where a tap really lands on THIS seat (raycast-verified against both seat meshes);
  // the old single cushion point was often hidden by the row nearer the camera, so taps there opened the neighbour.
  useEffect(() => {
    const w = window as Window & { __lumenSeatXY?: (id: string) => { x: number; y: number } | null }
    const rc = new THREE.Raycaster()
    w.__lumenSeatXY = (id) => {
      const it = items.find((i) => i.seat.id === id); if (!it) return null
      const isOpen = !taken.has(id), list = isOpen ? open : shut, m = isOpen ? mesh.current : takenMesh.current
      if (!m) return null
      let fallback: { x: number; y: number } | null = null
      for (const [dx, dy, dz] of [[0, 0.95, 0.24], [0, 0.75, 0.27], [0, 0.44, 0], [0, 0.44, -0.2], [-0.15, 0.9, 0.24], [0.15, 0.9, 0.24], [0, 1.0, 0.3]]) {
        const v = new THREE.Vector3(it.pos.x + dx, it.pos.y + dy, it.pos.z + dz).project(cam)
        if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue
        const at = (nx: number, ny: number) => {
          rc.setFromCamera(new THREE.Vector2(nx, ny), cam)
          const hit = rc.intersectObjects([mesh.current!, takenMesh.current!], false)[0]
          return hit?.instanceId != null ? (hit.object === mesh.current ? open : shut)[hit.instanceId]?.seat.id : undefined
        }
        if (at(v.x, v.y) !== id) continue
        // a finger is not a pixel: keep the point only if it is 4px clear of the neighbouring seats (fallback below)
        const ex = 8 / size.width, ey = 8 / size.height
        const xy = { x: (v.x + 1) / 2 * size.width, y: (1 - v.y) / 2 * size.height }
        if ([[ex, 0], [-ex, 0], [0, ey], [0, -ey]].every(([a, b]) => at(v.x + a, v.y + b) === id)) return xy
        fallback ??= xy
      }
      void list; return fallback
    }
  }, [items, open, shut, taken, cam, size])

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
        <meshPhysicalMaterial ref={velvet} roughness={0.9} sheen={0.7} sheenRoughness={0.45} sheenColor="#ff8a98" normalMap={looks.normal} normalScale={new THREE.Vector2(0.8, 0.8)} />
      </instancedMesh>
      <instancedMesh ref={takenMesh} args={[geo, undefined, items.length]} {...ev(shut)}>
        <meshStandardMaterial color={TAKEN} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={wood} args={[woodGeo, undefined, items.length]} raycast={noRay}>
        <meshStandardMaterial color={WOOD} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={brass} args={[brassGeo, undefined, items.length]} raycast={noRay}>
        <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.35} />
      </instancedMesh>
      <instancedMesh ref={chair} args={[chairGeo, undefined, items.length]} raycast={noRay}>
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={chairTaken} args={[chairGeo, undefined, items.length]} raycast={noRay}>
        <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} toneMapped={false} transparent opacity={0.4} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={edge} args={[edgeGeo, undefined, MAXSEL]} raycast={noRay}>
        <meshBasicMaterial ref={edgeMat} color="#F2B544" transparent toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={glow} args={[glowGeo, undefined, MAXSEL]} raycast={noRay}>
        <meshBasicMaterial ref={glowMat} color="#F2B544" transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {/* desktop hover: gold rim at 30% (§15.v) */}
      <instancedMesh ref={hoverEdge} args={[edgeGeo, undefined, 1]} raycast={noRay}>
        <meshBasicMaterial color="#F2B544" transparent opacity={0.3} toneMapped={false} />
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

const UP = new THREE.Vector3(0, 1, 0)
const deg = THREE.MathUtils.degToRad
// fix15 §15.u rev 3 tilt (up = +): overview looks down to 30° / up to 10°; seat view down 25° / up 20°. Zoom = overview distance ×.
const TILT_OVERVIEW: [number, number] = [-deg(30), deg(10)], TILT_SEAT: [number, number] = [-deg(25), deg(20)], ZOOM: [number, number] = [0.75, 1.25]
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a)) // (-π, π]: Reset never unwinds several turns
function CameraRig({ hall, focusSeat, resetKey, instant, phone, onFacing }: Pick<HallSceneProps, 'hall' | 'focusSeat' | 'resetKey' | 'instant' | 'phone' | 'onFacing'>) {
  const { camera, gl, invalidate } = useThree()
  const items = useMemo(() => layout(hall), [hall])
  const from = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() })
  const to = useRef(overview(hall))
  const look = useRef(overview(hall).look.clone())
  const t = useRef(1)
  const drag = useRef({ active: false, x: 0, y: 0, yaw: 0, pitch: 0, zoom: 1 })
  const fromDrag = useRef({ yaw: 0, pitch: 0, zoom: 1 })
  const base = useRef(overview(hall).pos.clone()) // un-zoomed eye; camera = look + (base - look) × zoom
  const seatView = useRef(false)
  seatView.current = !!focusSeat
  const t0 = useRef(0)
  const facing = useRef<'left' | 'right' | null | undefined>(null)

  useEffect(() => { camera.position.copy(to.current.pos); base.current.copy(to.current.pos); camera.lookAt(to.current.look) }, [camera])

  const go = (target: { pos: THREE.Vector3; look: THREE.Vector3 }) => {
    from.current = { pos: base.current.clone(), look: look.current.clone() }
    drag.current.yaw = wrap(drag.current.yaw)
    to.current = target
    fromDrag.current = { yaw: drag.current.yaw, pitch: drag.current.pitch, zoom: drag.current.zoom } // fix12: the drag offset glides back to 0 with the move
    t.current = instant ? 1 : 0
    t0.current = -1 // fix12: time-based glide; the 400ms clock starts on the first frame after the click (wall clock, not summed dt)
    drag.current.active = false
    facing.current = undefined // fix15.1: force the Screen chip state to be re-sent on the next frame after any reset/move
    if (instant) {
      facing.current = null; onFacing?.(null)
      base.current.copy(target.pos); camera.position.copy(target.pos); look.current.copy(target.look); drag.current.yaw = 0; drag.current.pitch = 0; drag.current.zoom = 1
      const dir = target.look.clone().sub(target.pos); camera.lookAt(target.look); invalidate()
      ;(window as Window & { __lumenDrag?: unknown }).__lumenDrag = { yaw: 0, pitch: 0, zoom: 1, dx: dir.x, dy: dir.y, dz: dir.z, facing: null, px: target.pos.x, py: target.pos.y, pz: target.pos.z } // QA hook, same frame
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
    // fix13 §15.z rev 5: in the seat view, Reset view returns to that seat's default angle; otherwise to the overview
    const item = focusSeat ? items.find((i) => i.seat.id === focusSeat.id) : undefined
    go(item ? eye(item.pos, phone) : overview(hall))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  // fix15 §15.u rev 3: look around in place. Yaw is unlimited (360°, both views); tilt is clamped per view; zoom (overview only)
  // moves the eye along its view line 0.75×–1.25×. Grab-style directions as fix11: drag right -> look LEFT (yaw +), drag down -> look UP.
  // No snap-back / no auto-rotate: only Reset view (or a seat tap / Back) moves the camera.
  useEffect(() => {
    const el = gl.domElement
    const pts = new Map<number, { x: number; y: number }>()
    let pinch0 = 0, zoom0 = 1
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 2) { pinch0 = dist(); zoom0 = drag.current.zoom; drag.current.active = false; return }
      drag.current.active = true; drag.current.x = e.clientX; drag.current.y = e.clientY
    }
    const move = (e: PointerEvent) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const d = drag.current
      if (pts.size === 2 && pinch0 > 0) { if (!seatView.current) d.zoom = THREE.MathUtils.clamp(zoom0 * pinch0 / Math.max(1, dist()), ZOOM[0], ZOOM[1]); return }
      if (!d.active) return
      const [lo, hi] = seatView.current ? TILT_SEAT : TILT_OVERVIEW
      d.yaw += (e.clientX - d.x) * 0.004 // unlimited; normalised before any glide
      d.pitch = THREE.MathUtils.clamp(d.pitch + (e.clientY - d.y) * 0.004, lo, hi)
      d.x = e.clientX; d.y = e.clientY
    }
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (e.pointerType === 'mouse' || e.type !== 'pointerup') pts.clear(); if (pts.size < 2) pinch0 = 0; drag.current.active = false }
    const wheel = (e: WheelEvent) => { if (seatView.current) return; e.preventDefault(); drag.current.zoom = THREE.MathUtils.clamp(drag.current.zoom * Math.exp(e.deltaY * 0.001), ZOOM[0], ZOOM[1]) }
    // desktop a11y: ← / → turn 15° per press while the canvas has focus
    const key = (e: KeyboardEvent) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); drag.current.yaw += (e.key === 'ArrowLeft' ? 1 : -1) * Math.PI / 12; invalidate() }
    el.tabIndex = 0; el.setAttribute('aria-label', 'Cinema hall 3D view. Arrow keys turn left and right. [PH]')
    el.style.touchAction = 'none' // fix15: pinch zoom + 360° drag belong to the hall, not the page
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up as EventListener)
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('keydown', key)
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); el.removeEventListener('lostpointercapture', up); el.removeEventListener('wheel', wheel); el.removeEventListener('keydown', key) }
  }, [gl, invalidate])

  useFrame(() => {
    const d = drag.current
    if (t.current < 1) {
      // fix12/13/15: 400ms ease-out glide (seat tap, Back, Reset); instant under reduced motion (see go()). Yaw was normalised in go(): short way round.
      if (t0.current < 0) t0.current = performance.now()
      t.current = Math.min(1, (performance.now() - t0.current) / 400)
      const k = 1 - (1 - t.current) ** 3 // ease-out cubic
      base.current.lerpVectors(from.current.pos, to.current.pos, k)
      look.current.lerpVectors(from.current.look, to.current.look, k)
      if (!d.active) { d.yaw = fromDrag.current.yaw * (1 - k); d.pitch = fromDrag.current.pitch * (1 - k); d.zoom = 1 + (fromDrag.current.zoom - 1) * (1 - k) }
      if (t.current >= 1) { d.yaw = 0; d.pitch = 0; d.zoom = 1; d.active = false } // fix15.1 (QA): Reset/move always lands exactly on 0
    }
    const z = seatView.current ? 1 : d.zoom
    camera.position.copy(look.current).addScaledVector(look.current.clone().sub(base.current), -z)
    const dir = look.current.clone().sub(base.current)
    dir.applyAxisAngle(UP, d.yaw)
    const right = dir.clone().cross(UP).normalize()
    dir.applyAxisAngle(right, d.pitch)
    camera.lookAt(camera.position.clone().add(dir))
    // §15.u rev 3 screen hint: which side the screen is on once it is more than 90° off-centre
    const tgt = SCREEN_CENTER.clone().sub(camera.position)
    const a = Math.atan2(dir.z * tgt.x - dir.x * tgt.z, dir.x * tgt.x + dir.z * tgt.z)
    const f = Math.abs(a) > Math.PI / 2 ? (a > 0 ? 'left' : 'right') : null
    if (f !== facing.current) { facing.current = f; onFacing?.(f) }
    ;(window as Window & { __lumenDrag?: unknown }).__lumenDrag = { yaw: d.yaw, pitch: d.pitch, zoom: z, dx: dir.x, dy: dir.y, dz: dir.z, facing: f, px: camera.position.x, py: camera.position.y, pz: camera.position.z } // QA hook
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
      <CameraRig hall={p.hall} focusSeat={p.focusSeat} resetKey={p.resetKey} instant={p.instant} phone={p.phone} onFacing={p.onFacing} />
    </Canvas>
    </div>
  )
}
