# Lumen Cinema [PH] — cinema seat preview

Demo cinema site: browse films, pick a showtime, choose seats on a 2D map with a live 3D "view from your seat", fake checkout. **Everything is placeholder; no real bookings or payments.**

Stack: Vite 5 + React 18 + TypeScript + Tailwind 3, React Router 6, @react-three/fiber + drei (seat page only), zod, sonner, lucide.
Design spec: [`docs/design.md`](docs/design.md).

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + client build + SSR prerender into dist/
npm run preview    # vite preview of dist/ on 0.0.0.0:4174 (plugin maps routes like a static host)
npm run serve:prod [-- 4180]  # tiny no-deps static server (default port 4175): dist/<route>/index.html, else dist/200.html; use this for Lighthouse
node scripts/screenshots.mjs   # headless screenshots (needs preview running)
node scripts/flow-smoke.mjs    # seat -> booking -> confirmed smoke test
```
No env vars are needed for the Vite app. Don't commit `.env*`.

## API server

The booking HTTP API is a separate Express app in [`server/`](server/). Contract: [`docs/api.md`](docs/api.md) and `src/lib/api-contract.ts`. This UI still reads the mock in `src/lib/api.ts`.

Migrate, seed placeholder films and cents prices, and run the dev server: [`docs/server.md`](docs/server.md).

## How it's put together
- `src/lib/api.ts` — **the only data module**: zod schemas, async mock functions (`listMovies`, `listShows`, `getSeatMap`, `createBooking`, …). Seat ids are stable `A1`…`J16`. Swap bodies for `fetch` calls when the back end lands.
- `src/pages/Seats.tsx` — seat picker. The 2D map (`SeatMap2D`, `role="grid"`, roving tabindex, arrow keys, Enter/Space, full `aria-label`s, `aria-pressed`) is the source of truth; the 3D hall mirrors it.
- `src/three/HallScene3D.tsx` — procedural hall (boxes/planes, 2 `InstancedMesh`es for 160 seats, emissive canvas-texture screen, amber step lights). No external models/textures. Camera tweens 900 ms to the seat's eye point looking at screen centre; drag to look (yaw ±35°, pitch ±15°), springs back; Reset view. Loaded only via `React.lazy` on the seat page; dpr capped at 2 and drops to 1 via drei `PerformanceMonitor`.
- Fallback "view from seat" card (`ViewFromSeatCard`, generated SVG per 9 zones) when: no WebGL, `saveData`, `prefers-reduced-motion`, ≤2 cores, `?simple=1` / "Simple view" toggle, or WebGL context lost. Low-memory phones (`deviceMemory ≤ 4`) get a "Preview in 3D" button instead of auto-loading.
- Prerender: `scripts/prerender.ts` renders `/`, `/now-showing`, `/movie/:id` (×6), `/booking`, `/booking/confirmed` to static HTML with own title/description/canonical/OG; MovieTheater JSON-LD on home/now-showing/movie pages, Movie JSON-LD per movie (all marked placeholder). Also writes `sitemap.xml`. Seat picker is not prerendered: hosts should serve `dist/200.html` as the SPA fallback (noindex).

## Placeholders [PH]
- Brand name "Lumen Cinema", logo, address, hours, contact, domain `lumen-cinema.example`, `og.png` (not created yet)
- All 6 films (titles, taglines, synopses, ratings, runtimes), generated SVG posters/backdrops, trailer dialog
- Showtimes, formats (2D/3D/IMAX), halls, prices (€9/€12/€15), taken seats (seeded random), sold-out shows
- Booking refs, wheelchair companion note, "view from seat" illustrations (stand-ins for 9 pre-rendered stills), 3D screen content (static "NOW PLAYING" texture, no trailer clip)

## Seat page flags (fix5)
- `?3d=1` force the 3D path (skips device checks); also disables the fps guard.
- `?simple=1` simple view (no 3D, no curtains); the "Simple view" button / slow toast saves `localStorage lumen.simple=1`.
- `?nofps=1` disable the §14 fps guard on any URL.
- `?fps=slow` force the fps guard to act as if <30fps: quality drop (DPR 1, no AA) after 2s, then the one-time "Running slow?" toast after 2s more.
- `/movie/:id?noprefetch=1` skip the idle 3D chunk prefetch (A/B measurement only).
