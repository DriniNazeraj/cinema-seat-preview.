"""fix8 §15 offline bake: public/hall/hall-light.webp (lightmap atlas) + public/hall/velvet-normal.webp (256px fabric normal).
Gradient bake (same approach as the render-lab prototype) with the BUILD-NOTES fixes: wall glow fades smoothly over the front
third (smoothstep, no hard line) at ~40% less strength. Atlas 256x512, rows (canvas y, top first):
  0-255 floor  (u = hall width left->right, y down = towards the back;  z = -7 + 30*y/256)
  256-383 riser AO (prototype band: AO under the row + side falloff)
  384-447 left wall (warm)  448-511 right wall (cool)   (u = 0 front ... 1 back; z = -7 + 30*u)
Run: python3 scripts/bake-hall-maps.py"""
import numpy as np
from PIL import Image
W = 256
def hexc(h): return np.array([int(h[i:i+2], 16) for i in (1, 3, 5)], float) / 255
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
BG, WARM, MID, COOL = hexc('#0B0B0F'), hexc('#F2B544'), hexc('#9a4a50'), hexc('#4a6a9a')
atlas = np.zeros((512, W, 3))
# floor (fix9): soft warm spill from the screen, #F2B544 at ~14% fading to black over ~2 rows (screen z=0, rows start z=5, 1.05 deep)
y = np.arange(256)[:, None, None]; z = -7 + 30 * y / 256
u = np.linspace(0, 1, W)[None, :, None]
k = 0.14 * (1 - ss(0.0, 7.5, z)) * (1 - 0.35 * np.abs(u - 0.5) * 2)  # strongest centre-front, softer at the side walls
atlas[0:256] = BG + (WARM - BG) * k + 0 * u
# riser AO (white = unshadowed; multiplied by the per-row colour in the material)
v = np.arange(128)[:, None] / 127
def interp(x, xs, ys): return np.interp(x, xs, ys)
ao = interp(v, [0, .35, .6, .85, 1], [0, .55, .7, .15, .35])
uu = np.linspace(0, 1, W)[None, :]
side = interp(uu, [0, .2, .8, 1], [.5, 0, 0, .5])
atlas[256:384] = ((1 - ao) * (1 - side))[..., None]
# walls (fix9): prototype curve (alpha 0.55; stops u 0 -> 1, 0.12 -> 0.67, 0.4 -> 0) minus 40% = 0.33 peak, linear stops (no hard line)
uw = np.linspace(0, 1, W)[None, :, None]; vy = np.linspace(0, 1, 64)[:, None, None]
proto = np.interp(uw, [0, .12, .4, 1], [1, .67, 0, 0])
for row, col in ((384, WARM), (448, COOL)):
  k = 0.55 * 0.6 * proto * (0.75 + 0.25 * vy)
  atlas[row:row + 64] = BG + (col - BG) * k
Image.fromarray((np.clip(atlas, 0, 1) * 255 + .5).astype(np.uint8)).save('public/hall/hall-light.webp', quality=88, method=6)
# fabric normal (prototype weave + noise)
N = 256; yy, xx = np.mgrid[0:N, 0:N]; rng = np.random.default_rng(1234)
h = 0.5 * np.sin(xx * 0.8) * np.sin(yy * 0.8) + 0.35 * np.sin((xx + yy) * 0.25) + rng.random((N, N)) * 0.6
dx = np.roll(h, -1, 1) - np.roll(h, 1, 1); dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
n = np.dstack([-dx * 0.6, -dy * 0.6, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255 + .5).astype(np.uint8)).save('public/hall/velvet-normal.webp', quality=90, method=6)
