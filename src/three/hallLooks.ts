/** §15 hall upgrade 1+2: baked light atlas + velvet normal, both real webp files from scripts/bake-hall-maps.py.
 *  Textures exist from the first frame as 1x1 placeholders (so every shader program is compiled once, up front, by Warmup);
 *  the real images are fetched only after the curtains are gone (and via the <link rel=prefetch> path before that, see
 *  lib/prefetch3d.ts), then swapped in with an upload only, no shader recompile. */
import * as THREE from 'three'

export const HALL_LIGHT_URL = '/hall/hall-light.webp'
export const VELVET_NORMAL_URL = '/hall/velvet-normal.webp'

/** placeholder canvas at the real image size, so the later swap is a same-size re-upload (no reallocation, no recompile) */
function canvasTex(w: number, h: number, fills: [string, number, number][]): THREE.Texture<HTMLImageElement> {
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!
  for (const [col, y0, y1] of fills) { g.fillStyle = col; g.fillRect(0, y0, w, y1 - y0) }
  return new THREE.Texture(c as unknown as HTMLImageElement)
}
/** atlas region (canvas rows y0..y1 of 512); flip = mirror u (left wall faces the other way). Clones share one Source/GL upload. */
function region(src: THREE.Texture, y0: number, y1: number, flip = false) {
  const t = src.clone()
  const a = y0 + 1, b = y1 - 1 // 1px inset: bilinear filtering must not bleed the neighbouring region in
  t.repeat.set(flip ? -1 : 1, (b - a) / 512)
  t.offset.set(flip ? 1 : 0, 1 - b / 512)
  return t
}

export function makeHallLooks() {
  // placeholders = the pre-§15 flat colours, so the hall looks like fix7 until the bake arrives
  const atlas = canvasTex(256, 512, [['#121218', 0, 256], ['#ffffff', 256, 384], ['#17131a', 384, 512]])
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.wrapS = THREE.RepeatWrapping; atlas.wrapT = THREE.ClampToEdgeWrapping; atlas.needsUpdate = true
  const floor = region(atlas, 0, 256), riser = region(atlas, 256, 384), wallL = region(atlas, 384, 448, true), wallR = region(atlas, 448, 512)
  const normal = canvasTex(256, 256, [['rgb(128,128,255)', 0, 256]])
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.needsUpdate = true
  // fix9: cross-fade flat -> baked, riding the 500 ms hall fade-in (designer). One uniform per material, blended in the
  // map_fragment chunk; compiled once up front, so the blend costs no recompile. Reduced motion = instant.
  const mix = { value: 0 }
  function bake(flat: string) {
    const uFlat = { value: new THREE.Color(flat) }
    return {
      customProgramCacheKey: () => 'lumen-bake',
      onBeforeCompile: (sh: { uniforms: Record<string, unknown>; fragmentShader: string }) => {
        sh.uniforms.uMix = mix; sh.uniforms.uFlat = uFlat
        sh.fragmentShader = 'uniform float uMix;\nuniform vec3 uFlat;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          '#ifdef USE_MAP\n  vec4 sampledDiffuseColor = texture2D( map, vMapUv );\n  diffuseColor *= mix( vec4( uFlat, 1.0 ), sampledDiffuseColor, uMix );\n#endif')
      },
    }
  }
  let pending = 2, instant = false
  const landed = () => {
    if (--pending) return
    performance.mark('lumen:hall-bake-blend-start')
    if (instant) { mix.value = 1; performance.mark('lumen:hall-bake-blend-end'); return }
    const t0 = performance.now()
    const tick = () => { mix.value = Math.min(1, (performance.now() - t0) / 500); if (mix.value < 1) requestAnimationFrame(tick); else performance.mark('lumen:hall-bake-blend-end') }
    requestAnimationFrame(tick)
  }
  let loaded = false
  function load(reduce = false) {
    instant = reduce
    if (loaded) return; loaded = true
    const L = new THREE.ImageLoader()
    // fix9: each clone must be flagged too; three re-uploads per texture version, not per shared Source (fix8 never showed the bake)
    L.load(HALL_LIGHT_URL, (img) => { atlas.source.data = img; for (const t of [atlas, floor, riser, wallL, wallR]) t.needsUpdate = true; performance.mark('lumen:hall-bake-applied'); landed() })
    L.load(VELVET_NORMAL_URL, (img) => { normal.source.data = img; normal.needsUpdate = true; performance.mark('lumen:hall-normal-applied'); landed() })
  }
  return { floor, riser, wallL, wallR, normal, load, mix, bake }
}
export type HallLooks = ReturnType<typeof makeHallLooks>
/** row brightness from the screen (prototype), baked into each riser's colour */
export const rowGlow = (ri: number) => 0.12 + 0.88 / (1 + ri * 0.6)
