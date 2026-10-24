# Lumen Cinema — design spec v1

> **Placeholder brand.** "Lumen Cinema" (name), every movie title, poster, synopsis, showtime and price are PLACEHOLDERS marked `[PH]`. Mock data only; no real bookings.
> Reference for inspiration only: Codrops "Cinema Seat Preview" (camera moves to the chosen seat). Do not reuse its code, models, textures, or styling. Rebuild from scratch.

Stack: Vite + React + TypeScript + Tailwind + shadcn/Radix, react-three-fiber + drei for 3D. Mobile first.

## 1. Direction (one call)
**Dark velvet, warm light.** Near-black room, deep burgundy seats, warm amber accents like aisle lights. Let posters and the 3D screen be the colour; UI stays quiet. Why: a cinema is a dark room where the screen is the only bright thing, so the UI should feel the same.

## 2. Tokens
| token | hex | use |
|---|---|---|
| `bg` | `#0B0B0F` | page background |
| `surface` | `#15151C` | cards, sheets |
| `surface-2` | `#1E1E28` | inputs, hover |
| `border` | `#2A2A36` | hairlines |
| `text` | `#F4F1EA` | primary text (17.6:1 on bg) |
| `text-muted` | `#A3A0AE` | secondary (7.6:1 on bg) |
| `accent` | `#F2B544` | amber: primary CTA, selected seat, focus ring |
| `accent-fg` | `#1A1205` | text on amber |
| `velvet` | `#7A1F2B` | free seat colour in 3D/2D |
| `taken` | `#3A3A44` | taken seat |
| `access` | `#3B82F6` | wheelchair / accessible seat |
| `danger` | `#EF4444` | errors |
| `success` | `#22C55E` | booking confirmed |

Radius: `rounded-xl` cards, `rounded-full` buttons & chips. Shadow: none on dark; use `ring-1 ring-border`. Focus: `focus-visible:ring-2 ring-accent ring-offset-2 ring-offset-bg`.

## 3. Type
- Display: **Bebas Neue** (titles, uppercase, `tracking-wide`). Fallback `Oswald, sans-serif`.
- Body/UI: **Inter** 400/500/600.
- Scale: hero `text-5xl md:text-7xl`, h2 `text-3xl md:text-4xl`, h3 `text-xl`, body `text-base`, meta `text-sm text-text-muted`, seat labels `text-xs font-medium tabular-nums`.

Spacing: Tailwind 4px scale; sections `py-16 md:py-24`; container `max-w-6xl px-4 md:px-6`; grid gap `gap-4 md:gap-6`.

## 4. Sitemap & flow
`/` Home → `/now-showing` → `/movie/:id` → `/movie/:id/seats?show=:showId` → `/booking` (summary + fake checkout) → `/booking/confirmed`.
Main path: pick movie → pick showtime → pick seats (with 3D preview) → details → confirmed. A sticky step indicator (Showtime · Seats · Details · Done) runs from the seat page on.

## 5. Pages
**Header (all):** logo left `[PH] LUMEN`, links Now Showing / About `[PH]`, right a "Book tickets" amber pill. Mobile: logo + sheet menu (shadcn `Sheet`). Header `bg-bg/80 backdrop-blur border-b border-border`, sticky.

**Home `/`**
1. Hero: full-bleed still of featured film `[PH]` with bottom gradient to `bg`; title, 1-line tagline, meta (rating · runtime · genre), CTAs "Get tickets" (amber) + "Trailer" (ghost). `min-h-[80svh]`.
2. "Now showing" horizontal poster row (snap-x on mobile, 4-up grid on desktop), "See all" link.
3. "Pick your seat before you buy" feature strip: short looping preview (static image fallback) of the 3D view + one line of copy. This is the hook; keep it.
4. Today's showtimes: date chips (next 7 days, shadcn `ToggleGroup`) + list of films with time pills.
5. Footer: address `[PH]`, hours `[PH]`, small links.

**Now showing `/now-showing`:** date chips sticky under header, filter chips (genre), poster grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`. Card: 2:3 poster, title, runtime · rating, next 3 time pills. Hover: poster `scale-[1.03]`, ring-accent. Empty state: "No shows on this day" + next available date button.

**Movie `/movie/:id`:** backdrop header, poster + title + meta + synopsis `[PH]`, trailer button (dialog). Showtimes grouped by date → format (2D / 3D / IMAX `[PH]`), each a pill with price; sold-out pills disabled with "Sold out". Selecting a time goes to seats.

**Seat picker `/movie/:id/seats`** (see §6).

**Booking `/booking`:** order summary card (film, time, hall, seats as chips, price `[PH]`), form: name, email, (phone optional). Fake pay button "Confirm booking (demo)". Clear "Demo, no payment taken" note. Seat hold countdown (10:00) top of card; at 0, toast + back to seats.

**Confirmed:** big check, booking ref `[PH]`, seat chips, "Add to calendar" (ics), mini 2D map highlighting their seats, "Back to home".

## 6. Seat picker — the core
### Layout
- **Desktop (≥1024):** two columns. Left `flex-1`: 3D view (aspect ~16:10, `rounded-xl overflow-hidden`). Right `w-[360px]` panel: showtime info, 2D seat map (always visible, it's the main input), legend, selected seats list, total, "Continue" amber button.
- **Tablet/mobile:** 3D view on top (`aspect-video`, max `40svh`), 2D map below, sticky bottom bar with "2 seats · €XX [PH]  [Continue]". 3D panel can collapse to a "Preview view" button to give the map room.

### Interaction
- The **2D map is the source of truth**; the 3D room mirrors it. Seats can be picked in either.
- Clicking a free seat: selects it AND flies the camera to that seat's eye position, looking at the screen centre. Camera tween 900ms ease-in-out (`prefers-reduced-motion`: instant cut).
- Hover a seat (desktop): seat brightens, tooltip "Row F · Seat 8" + price. In 3D, hovering seat glows amber outline.
- In 3D view: drag to look around a little (yaw ±35°, pitch ±15°, clamped), then springs back. "Reset view" button (top-right overlay) returns to the overview shot behind the last row.
- Screen in 3D plays a muted looping trailer clip `[PH]` or a still, so the "view from here" feels real. Overlay chip bottom-left: "View from Row F, Seat 8".
- Max 8 seats per booking; picking a 9th shows inline message, not a modal.
- Picking a taken seat: no camera move, short shake + toast "That seat's taken".
- Accessible seats: selecting one shows a small note "Wheelchair space — companion seat next to it is free" `[PH]`.

### Seat states (same in 2D and 3D)
| state | 2D | 3D | extra cue (not colour only) |
|---|---|---|---|
| free | `bg-velvet` | velvet fabric | — |
| hover/focus | `ring-2 ring-accent` | amber outline | tooltip |
| selected | `bg-accent text-accent-fg` | amber, slight lift | check icon in 2D |
| taken | `bg-taken` 50% opacity, `cursor-not-allowed` | dark grey | × icon in 2D |
| accessible | `bg-access` | blue | wheelchair icon |
| accessible + selected | amber with wheelchair icon | amber | icon |

2D seat: 28px square (`size-7 rounded-t-md`) desktop, 24px mobile with pinch-zoom/pan wrapper; aisle gaps; row letters both sides; "SCREEN" curved bar at top. Each seat is a `button` with `aria-label="Row F, seat 8, free, €12 [PH]"` and `aria-pressed`. Arrow keys move between seats, Enter/Space toggles. Whole map in a `role="grid"`.

### 3D scene (art direction)
- Simple low-poly hall built by us: stepped rows, one seat model instanced (`InstancedMesh`) ~150 seats, side walls with warm amber step lights, big screen as emissive plane. No external models from the reference.
- Lighting: dim ambient, screen as main light source, small amber points along aisles. No real-time shadows on mobile.
- Loading: 2D map shows immediately; 3D area shows a skeleton with "Loading the hall…" and fades in. Never block seat picking on 3D loading.

### Fallback (no WebGL, low-end, or save-data)
- Detect WebGL failure or `navigator.connection.saveData`, or let users toggle "Simple view".
- Replace 3D panel with a **2D "view from seat" card**: a pre-rendered still per zone (front / middle / back × left / centre / right = 9 images `[PH]`) picked by the selected seat, with the caption "Approximate view from Row F". Everything else works the same.
- Mobile default: 3D loads only after the user taps "Preview view" if the device is low-memory (`deviceMemory ≤ 4`); otherwise auto. Lazy-load the whole three.js bundle on the seat page only.

## 7. Components (shadcn)
Button, Badge (format chips), ToggleGroup (dates), Card, Dialog (trailer), Sheet (mobile menu, mobile seat summary), Tooltip, Toast/Sonner, Form + Input, Skeleton, Separator. Custom: `PosterCard`, `ShowtimePill`, `SeatMap2D`, `Seat`, `SeatLegend`, `HallScene3D`, `ViewFromSeatCard`, `StickyBookingBar`, `StepIndicator`, `HoldTimer`.

## 8. States checklist
- Loading: skeleton posters, skeleton seat map rows.
- Empty: no showtimes that day; sold-out show (map visible but all taken + "Try another time" button).
- Error: mock data fails → card with retry; WebGL context lost → swap to fallback card silently with a small note.
- Hold expired → toast, seats released.
- Mobile: tap targets ≥ 44px for pills/buttons (seats use zoom to reach that), sticky bar never covers the last row (pad bottom).
- Reduced motion: no camera tweens, no poster hover scale.

## 9. Mock data shape (front end only)
`Movie {id,title,runtime,rating,genres,poster,backdrop,synopsis}`, `Show {id,movieId,start,format,hallId,price}`, `Hall {id,rows:[{label,seats:[{n,x,type:'std'|'access'|'gap'}]}]}`, `takenSeats: Record<showId,string[]>`. All `[PH]`.
