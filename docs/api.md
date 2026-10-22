# Lumen Cinema HTTP API

Contract for the booking back end. The server in [`server/`](../server/) implements it (see [`docs/server.md`](server.md)). The Vite client still uses the mock. `src/lib/api-contract.ts` is the zod module the server, and later the front end, import. It has no server imports. `MovieSchema`, `ShowSchema`, `SeatSchema`, `SeatMapSchema`, `BookingInputSchema`, and `BookingSchema` in that file match `src/lib/api.ts`. The mock keeps its own copy of those six schemas so the current client bundle does not load the hold and booking wire schemas.

The planned server is Express + TypeScript, Postgres via `pg`, zod for every request and response, `express-rate-limit`, `helmet`, and `cors`. No payment provider.

## Conventions

Base path `/api`. JSON only. `Content-Type: application/json; charset=utf-8`.

Success:

```json
{ "ok": true, "data": {} }
```

Failure:

```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "Not found." } }
```

`error.fields` is optional. Keys are the form field (`name`, `email`, `phone`, `seats`, `tickets`, `holdId`, `showId`) or a dotted path (`tickets.0.ticketType`). `error.seatIds` exists only on `SEAT_TAKEN`.

Timestamps are ISO-8601 UTC from `Date#toISOString()` (`2026-10-22T11:30:00.000Z`). Seat ids match `/^[A-Z]\d{1,2}$/` (`A1`, `J16`). A booking holds at most `MAX_SEATS` (8) seats, and the seat ids in one request are unique.

`GET` catalogue responses may be cached for a few seconds. Seat maps, holds, and bookings are `Cache-Control: no-store`.

There is no login. A hold id (UUID) and a booking `ref` are capabilities: anyone who has one can refresh, release, or read it. Generate them with a CSPRNG. Do not use sequential ids.

### Money

Ticket prices and booking totals are integer cents plus `currency: "EUR"`. The client never sends a price. The server snapshots `ticket_prices` onto the booking inside the create transaction.

`Show.price` stays the mock's field: the **adult** price in euros (`900` cents → `9`), so the current `eur(show.price)` formatter still works. `Show.ticketPrices` is authoritative. Placeholder catalogue, stored in the database, not computed in the client:

| format | adult | child |
|---|---:|---:|
| 2D | 900 | 600 |
| 3D | 1200 | 800 |
| IMAX | 1500 | 1000 |

There is no senior ticket.

### Time zone

`Show.start` is an absolute instant. `GET /api/shows?date=YYYY-MM-DD` keeps shows whose start falls on that calendar date in `CINEMA_TZ` (default `Europe/Berlin`, override with env `CINEMA_TZ`). The placeholder brand has no real address; the zone is configuration.

## Config

| env | default | role |
|---|---|---|
| `DATABASE_URL` | required | Postgres connection string. Secret. Do not commit it. |
| `HOLD_SECONDS` | `600` | Hold length. `src/lib/api-contract.ts` exports the same default. |
| `CINEMA_TZ` | `Europe/Berlin` | Date filter and any server-side calendar day. |
| `CORS_ORIGIN` | front-end origin | `cors` allow-list. No cookies. |
| `PORT` | process default | HTTP port. |
| `TRUST_PROXY` | `0` | Hop count for `req.ip`. `0` trusts none, so the rate limit uses the socket address and ignores a client-supplied `X-Forwarded-For`. Set it to the number of proxies in front of the process when hosted. |

`HOLD_SECONDS` must be a positive integer. Clients do not assume 600 seconds; they read `holdExpiresAt`.

## Health

### `GET /api/health`

Not rate limited. `Cache-Control: no-store`. Runs `SELECT 1`.

`200`

```json
{ "ok": true, "data": { "status": "ok", "db": "ok" } }
```

Database unreachable: `503` `UNAVAILABLE`.

## Reads

These `data` payloads match the mock fetcher return values, plus the extra fields noted below. A fetcher that still parses with `MovieSchema` / `ShowSchema` / `SeatMapSchema` can unwrap `data` and ignore unknown keys (zod strips them).

### `GET /api/movies`

`200` `{ ok: true, data: Movie[] }` in catalogue order. The first row is the film the home page treats as featured. `Movie.placeholder` is `true` while posters and synopses are still placeholders, which is what `MovieSchema` requires.

### `GET /api/movies/:id`

`200` `{ ok: true, data: Movie }`. Unknown id: `404` `NOT_FOUND`. The mock `getMovie` returns `null` for that case.

### `GET /api/shows`

Query: `movieId` (optional), `date` (`YYYY-MM-DD`, optional). Same names as `listShows({ movieId, date })`.

`200` `{ ok: true, data: ShowResponse[] }`, ordered by `start`, then `id`.

`ShowResponse` is `ShowSchema` plus:

```json
{
  "id": "starlight-run-2026-10-22-1330",
  "movieId": "starlight-run",
  "start": "2026-10-22T11:30:00.000Z",
  "format": "2D",
  "hallId": "h1",
  "price": 9,
  "soldOut": false,
  "currency": "EUR",
  "ticketPrices": [
    { "ticketType": "adult", "priceCents": 900, "currency": "EUR" },
    { "ticketType": "child", "priceCents": 600, "currency": "EUR" }
  ]
}
```

`format` is `2D`, `3D`, or `IMAX`. `soldOut` is true when the show is closed or no seat is available (an expired hold is not an occupied seat). `price` is `adult.priceCents / 100`.

Bad `date`: `400` `VALIDATION_ERROR`.

### `GET /api/shows/:id`

`200` `{ ok: true, data: ShowResponse }`. Unknown id: `404` `NOT_FOUND` (mock `getShow` returns `null`).

### `GET /api/shows/:id/seat-map`

Query: `holdId` (optional UUID).

`200` `{ ok: true, data: SeatMapResponse }`. Unknown show: `404` `NOT_FOUND` (mock `getSeatMap` throws `Error('Show not found')`).

```json
{
  "show": {},
  "hall": {
    "id": "h1",
    "name": "Hall 1",
    "columns": 18,
    "rows": [
      {
        "label": "A",
        "seats": [
          { "id": "A1", "row": "A", "n": 1, "x": 0, "type": "std" }
        ]
      }
    ]
  },
  "taken": ["A3"],
  "statuses": [
    { "seatId": "A1", "status": "available" },
    { "seatId": "A3", "status": "booked" }
  ]
}
```

`hall.rows[].seats[]` is the grid. `type` is the seat kind: `std` or `access` (the mock's wheelchair spaces). `x` is the column index and already includes aisle gaps. The placeholder halls are rows `A`–`J`, 16 seats in blocks of 4 / 8 / 4 (`columns` 18). The schema allows any hall with those fields; the client renders `hall`, it does not assume 10×16 except where it already does.

`statuses` has one entry per hall seat. `status` is `available`, `held`, or `booked`.

`taken` is the list the current seat map already understands (unavailable). It contains every `booked` seat, and every `held` seat that is not part of a live `holdId` query. The caller's own held seats stay out of `taken` so the UI does not paint them as taken. Without `holdId`, every held or booked seat is in `taken`. Expired holds are `available` and are not in `taken`.

## Holds

A hold reserves seats for one show for `HOLD_SECONDS` (default 600). Two people must never hold or book the same seat. The guarantee is the primary key on `seat_occupancy (show_id, seat_id)` inside a transaction, not a prior "is this free?" check in the application.

A hold is **live** when `expires_at > now()`, it has not been released, it has not been consumed by a confirmed booking, and it still has one occupancy row per seat.

Every hold response includes `holdExpiresAt` (create, refresh, and release).

### `POST /api/holds`

Limiter: 10 requests / 10 minutes / IP. Optional `Idempotency-Key` header (see below).

```json
{ "showId": "starlight-run-2026-10-22-1330", "seats": ["A1", "A2"] }
```

`201`:

```json
{
  "ok": true,
  "data": {
    "id": "5b1d1c0a-3e4f-4a5b-8c6d-7e8f90123456",
    "showId": "starlight-run-2026-10-22-1330",
    "seats": ["A1", "A2"],
    "holdExpiresAt": "2026-10-22T12:00:00.000Z",
    "createdAt": "2026-10-22T11:50:00.000Z"
  }
}
```

`holdExpiresAt` is `now + HOLD_SECONDS`.

| condition | status | code |
|---|---|---|
| bad body, duplicate ids, unknown seat, more than 8 | 400 | `VALIDATION_ERROR` |
| show missing | 404 | `NOT_FOUND` |
| show sold out | 409 | `SHOW_SOLD_OUT` |
| any requested seat is already held or booked | 409 | `SEAT_TAKEN` |
| over the limit | 429 | `RATE_LIMITED` |

`SEAT_TAKEN` always includes `error.seatIds`, the seats from this request that are occupied. `seatTakenMessage(seatIds)` in the contract file builds the mock's sentence: `Seat(s) no longer free: A1, A2.` The whole request fails; the server does not hold the free subset.

```json
{
  "ok": false,
  "error": {
    "code": "SEAT_TAKEN",
    "message": "Seat(s) no longer free: A1, A2.",
    "seatIds": ["A1", "A2"]
  }
}
```

Transaction (Read Committed is enough; the unique index is the lock):

```text
begin;
delete from seat_occupancy
 where show_id = $show
   and seat_id = any($seats)
   and kind = 'hold'
   and expires_at <= now();
insert into seat_occupancy (show_id, seat_id, kind, hold_id, expires_at)
values (...)
on conflict (show_id, seat_id) do nothing
returning seat_id;
```

If the returned ids are not the full request, roll the transaction back and respond `SEAT_TAKEN` with the missing ids. A concurrent transaction that also saw the seats as free loses on the primary key. Do not treat a `SELECT` of free seats as permission to insert.

### `POST /api/holds/:id/refresh`

Limiter: 30 / 10 minutes / IP. No body.

If the hold is live, set `expires_at` on the hold and on its occupancy rows to `now + HOLD_SECONDS` (a reset, not an extension of the remaining time) and return `200` with the hold, including the new `holdExpiresAt`.

If the hold is not live (expired, released, or already confirmed): `409` `HOLD_EXPIRED`. Unknown id: `404` `NOT_FOUND`.

Do this under `SELECT … FOR UPDATE` on the hold row so a refresh cannot race a confirm or a release. If the occupancy rows are already gone, the hold is not live.

### `DELETE /api/holds/:id`

Limiter: 30 / 10 minutes / IP.

Releases a live hold: delete its occupancy rows, set `released_at`, and if a `pending` booking points at the hold, mark that booking `cancelled`. `200`:

```json
{
  "ok": true,
  "data": {
    "id": "5b1d1c0a-3e4f-4a5b-8c6d-7e8f90123456",
    "released": true,
    "holdExpiresAt": "2026-10-22T12:00:00.000Z"
  }
}
```

Already expired or already released: the same `200` (idempotent), with the stored `holdExpiresAt`. Confirmed booking: `409` `HOLD_CONSUMED` and the booked seats stay booked. Unknown id: `404` `NOT_FOUND`.

### Expiry

Expired holds free themselves without a client call.

1. Reads treat `kind = 'hold' and expires_at <= now()` as available.
2. The hold transaction above deletes those rows for the seats it is about to take, before the insert.
3. A sweeper (`delete from seat_occupancy where kind = 'hold' and expires_at <= now()`, about every 30 seconds) keeps stale rows from sitting in the table. Correctness does not depend on the sweeper. The sweeper does not delete the `holds` row, so a late refresh still resolves to `HOLD_EXPIRED` rather than `NOT_FOUND`. A pending booking whose hold has expired becomes `expired`.

## Bookings

Ticket type is per seat: `adult` or `child`. A booking with no adult is rejected. The check runs in the create transaction before any row is written, and `CreateBookingBodySchema` rejects it too. The HTTP code is `CHILD_ONLY_BOOKING`, not `VALIDATION_ERROR`, when that is the reason.

### `POST /api/bookings`

Creates a **pending** booking from a live hold. Limiter: 8 / 10 minutes / IP. Optional `Idempotency-Key`.

```json
{
  "holdId": "5b1d1c0a-3e4f-4a5b-8c6d-7e8f90123456",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "phone": "+355000000",
  "tickets": [
    { "seatId": "A1", "ticketType": "adult" },
    { "seatId": "A2", "ticketType": "child" }
  ]
}
```

`phone` is optional, same rule as the mock (`trim`, omit when absent). The ticket seat ids must be exactly the hold's seats. Prices are filled by the server.

`201` `BookingRecord`:

```json
{
  "ok": true,
  "data": {
    "ref": "LUM-0123456789ABCDEF0123456789ABCDEF",
    "showId": "starlight-run-2026-10-22-1330",
    "seats": ["A1", "A2"],
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "phone": "+355000000",
    "total": 1500,
    "currency": "EUR",
    "createdAt": "2026-10-22T11:51:00.000Z",
    "status": "pending",
    "holdId": "5b1d1c0a-3e4f-4a5b-8c6d-7e8f90123456",
    "holdExpiresAt": "2026-10-22T12:00:00.000Z",
    "tickets": [
      { "seatId": "A1", "ticketType": "adult", "priceCents": 900 },
      { "seatId": "A2", "ticketType": "child", "priceCents": 600 }
    ]
  }
}
```

`total` is the sum of `priceCents` (integer cents). `ref` is `LUM-` plus 32 uppercase hex characters (128 bits). `holdExpiresAt` is present only while `status` is `pending`.

The hold stays live. Occupancy rows stay `kind = 'hold'` until confirm. One pending booking per hold. A retry with the same `holdId` and the same name, email, phone, and tickets returns that pending booking with `200`. A different body for the same hold is `409` `CONFLICT`.

| condition | status | code |
|---|---|---|
| bad body, duplicate seats | 400 | `VALIDATION_ERROR` |
| no adult ticket | 422 | `CHILD_ONLY_BOOKING` |
| hold id unknown | 404 | `NOT_FOUND` |
| hold expired or released | 409 | `HOLD_EXPIRED` |
| hold already confirmed | 409 | `HOLD_CONSUMED` |
| tickets are not the hold's seats | 409 | `HOLD_SEAT_MISMATCH` |
| seats lost (occupancy gone) | 409 | `SEAT_TAKEN` |
| over the limit | 429 | `RATE_LIMITED` |

`VALIDATION_ERROR` for `name` and `email` uses the mock messages: `Please enter your name`, `Please enter a valid email`.

### `POST /api/bookings/:ref/confirm`

Limiter: 8 / 10 minutes / IP. No body.

> **PAYMENT STEP — not implemented. Do not charge anyone.**
>
> This endpoint marks the booking `confirmed` and the seats `booked`. It does not take payment. There is no card, no PSP, and no payment id on the body.
>
> When a payment step is added, it slots in **immediately before** the status flip, inside the same transaction: take a successful payment for `total` cents in `currency`, then set `confirmed`. Until that exists, confirm is only the status change. Do not add payment fields to this contract version.

`200` returns the booking with `status: "confirmed"`, `confirmedAt` set, and `holdExpiresAt` omitted. Seats move in one transaction:

```text
begin;
select the hold for update;
-- expired -> HOLD_EXPIRED, delete occupancy, booking status = expired
-- already confirmed -> return the booking (idempotent 200)
-- not pending -> BOOKING_NOT_CONFIRMABLE
update seat_occupancy
   set kind = 'booked', expires_at = null, booking_id = $booking
 where hold_id = $hold;
update bookings set status = 'confirmed', confirmed_at = now() where ref = $ref;
update holds set consumed_at = now() where id = $hold;
commit;
```

Updating the existing occupancy row (instead of delete + insert) keeps the primary key continuously held, so a second buyer cannot slip in between.

Already confirmed: `200` with the confirmed booking. Expired hold: `409` `HOLD_EXPIRED`. Cancelled, or any other status that cannot move to confirmed: `409` `BOOKING_NOT_CONFIRMABLE`. Unknown ref: `404` `NOT_FOUND`.

### `GET /api/bookings/:ref`

`200` `{ ok: true, data: BookingRecord }`. Unknown ref: `404` `NOT_FOUND`. The mock `getBooking` returns `null` instead of an error.

`BookingRecord` is what the server returns. It is not the mock `BookingSchema`. The mock schema also requires `placeholder: true` and treats `total` as euros. See [Front end changes needed](#front-end-changes-needed).

## Errors

| code | HTTP | when |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Body or query failed zod. `fields` carries the messages. |
| `NOT_FOUND` | 404 | Movie, show, hold, or booking id does not exist. |
| `SEAT_TAKEN` | 409 | Seats were held or booked in the meantime. `seatIds` lists them. |
| `HOLD_EXPIRED` | 409 | Refresh, booking create, or confirm found a hold that is not live. Refresh uses this for every not-live hold. |
| `HOLD_CONSUMED` | 409 | The hold already became a confirmed booking. Release must not free those seats. |
| `HOLD_SEAT_MISMATCH` | 409 | Ticket seats are not exactly the hold's seats. |
| `CHILD_ONLY_BOOKING` | 422 | The booking has no adult ticket. |
| `SHOW_SOLD_OUT` | 409 | Hold requested on a sold-out show. |
| `BOOKING_NOT_CONFIRMABLE` | 409 | Confirm cannot move this booking to `confirmed`. |
| `CONFLICT` | 409 | Same hold booked again with a different body, or an unexpected unique violation. |
| `RATE_LIMITED` | 429 | Hold or booking limiter. |
| `PAYLOAD_TOO_LARGE` | 413 | JSON body is larger than 32 KiB. |
| `UNAVAILABLE` | 503 | `GET /api/health` could not reach the database. |
| `INTERNAL` | 500 | Unexpected failure. No stack trace in the body. |

Codes are uppercase. The status map is `ERROR_STATUS` in `src/lib/api-contract.ts`.

## Rate limits

`express-rate-limit`, one limiter per row, keyed by `req.ip`. `TRUST_PROXY` is the hop count (default `0`). At `0` the socket address is the client, so a spoofed `X-Forwarded-For` does not open a new bucket. Set it to the number of proxies in front of the process when hosted. Do not set it to `true`.

| route | limit | window |
|---|---:|---|
| `POST /api/holds` | 10 | 10 minutes |
| `POST /api/holds/:id/refresh` | 30 | 10 minutes |
| `DELETE /api/holds/:id` | 30 | 10 minutes |
| `POST /api/bookings` | 8 | 10 minutes |
| `POST /api/bookings/:ref/confirm` | 8 | 10 minutes |

The limited response is the JSON envelope with `RATE_LIMITED`, not the package's default text body. Also send `Retry-After` (seconds) and draft-7 `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`.

Catalogue `GET`s and `GET /api/health` are outside these limiters. JSON bodies larger than 32 KiB are `413` `PAYLOAD_TOO_LARGE`, not `400`.

## Idempotency

`POST /api/holds` and `POST /api/bookings` accept an optional `Idempotency-Key` header (8 to 200 characters). Store it unique on `(key, route)` with the request hash and the response. The same key and the same body replay the stored response. The same key and a different body is `409` `CONFLICT`. Confirm is idempotent by booking status and does not need the header.

## Tables

Sketch only. Names track the JSON fields; the server can map snake_case columns.

```text
movies (
  id text primary key,
  title text not null,
  tagline text not null,
  runtime_min int not null,
  rating text not null,
  genres text[] not null,
  synopsis text not null,
  palette text[] not null,          -- two hex colours
  placeholder boolean not null,
  position int not null             -- catalogue order, featured first
)

halls (
  id text primary key,
  name text not null,
  columns int not null
)

seats (
  hall_id text not null references halls (id),
  id text not null,                 -- A1, matches /^[A-Z]\d{1,2}$/
  row text not null,
  n int not null,
  x int not null,
  type text not null check (type in ('std', 'access')),
  primary key (hall_id, id)
)

shows (
  id text primary key,
  movie_id text not null references movies (id),
  start timestamptz not null,
  format text not null check (format in ('2D', '3D', 'IMAX')),
  hall_id text not null references halls (id),
  sold_out boolean not null default false
)

ticket_prices (
  show_id text not null references shows (id),
  ticket_type text not null check (ticket_type in ('adult', 'child')),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'EUR',
  primary key (show_id, ticket_type)
)

holds (
  id uuid primary key,
  show_id text not null references shows (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  consumed_at timestamptz
)

-- The guarantee. One row per seat per show.
-- A second hold or booking cannot insert the same pair.
seat_occupancy (
  show_id text not null references shows (id),
  seat_id text not null,
  kind text not null check (kind in ('hold', 'booked')),
  hold_id uuid references holds (id),
  booking_id uuid,
  expires_at timestamptz,
  primary key (show_id, seat_id),
  check (
    (kind = 'hold' and hold_id is not null and expires_at is not null and booking_id is null)
    or
    (kind = 'booked' and booking_id is not null and expires_at is null and hold_id is not null)
  )
)

bookings (
  id uuid primary key,
  ref text not null unique,         -- LUM- + 32 hex
  show_id text not null references shows (id),
  hold_id uuid not null unique references holds (id),
  name text not null,
  email text not null,
  phone text,
  status text not null check (status in ('pending', 'confirmed', 'expired', 'cancelled')),
  currency text not null default 'EUR',
  total_cents int not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
  -- PAYMENT STEP: a payment id and payment status column go here.
  -- Confirm must see a succeeded payment before status becomes 'confirmed'.
)

booking_seats (
  booking_id uuid not null references bookings (id),
  seat_id text not null,
  ticket_type text not null check (ticket_type in ('adult', 'child')),
  price_cents int not null,
  primary key (booking_id, seat_id)
)
```

Index suggestion: `(expires_at) where kind = 'hold'` on `seat_occupancy`, for the sweeper.

At least one adult is enforced in the create transaction (and by `CreateBookingBodySchema`). It is a business rule, not a uniqueness race. The seat lock is the primary key.

## Fetcher names

The mock function names stay. HTTP `data` is what they return today, except where this table says the call has to change.

| function | HTTP | unwrap |
|---|---|---|
| `listMovies()` | `GET /api/movies` | `data` as `Movie[]` |
| `getMovie(id)` | `GET /api/movies/:id` | `data` as `Movie`; `404` → `null` |
| `listShows({ movieId, date })` | `GET /api/shows` | `data` as `Show[]` if parsed with `ShowSchema` (`ticketPrices` and `currency` drop) |
| `getShow(id)` | `GET /api/shows/:id` | `data` as `Show`; `404` → `null` |
| `getSeatMap(showId)` | `GET /api/shows/:id/seat-map` | `data` satisfies `SeatMapSchema`; pass `holdId` once the client has one |
| `createBooking(input)` | `POST /api/bookings` then `POST /api/bookings/:ref/confirm` | input and result change; see below |
| `getBooking(ref)` | `GET /api/bookings/:ref` | `404` → `null`; parse `BookingRecordSchema` |

New calls the mock does not have: `createHold`, `refreshHold`, `releaseHold`, `confirmBooking`.

## Front end changes needed

The read path (`listMovies`, `getMovie`, `listShows`, `getShow`, and `getSeatMap` without a hold) can switch to these URLs and keep parsing with the mock schemas. Everything else below is a real difference. UI components are unchanged in this PR.

1. **Envelope.** Responses are `{ ok: true, data }` or `{ ok: false, error: { code, message, fields?, seatIds? } }`. The mock returns the bare value and throws `new Error(string)`. `Booking.tsx` toasts `err.message`. A thin wrapper can throw `new Error(error.message)` and the toast still works; `code` and `seatIds` are new.

2. **`SEAT_TAKEN`.** The mock throws `Seat(s) no longer free: A1, A2`. The API uses that sentence as `error.message` and also returns `409` with `error.seatIds`. The seat page does not read a server error today; it only shakes a seat that is already in `taken`.

3. **Holds are local.** `startHold` in `src/lib/booking.tsx` sets `holdUntil` to `Date.now() + HOLD_SECONDS * 1000` and never calls the server. Continuing from the seat page needs `POST /api/holds`. The timer should read `holdExpiresAt` (ISO) instead of a client-computed epoch. `HOLD_SECONDS` is already 600, so the length matches; the clock source does not. Refresh (`POST /api/holds/:id/refresh`) and release (`DELETE /api/holds/:id`) have no UI yet. When the countdown hits zero, the client should release (or simply stop; the server frees the seats anyway) and already navigates back to the seats.

4. **Own seats look taken after a refetch.** `taken` includes other people's holds. Seats in the caller's live hold are omitted from `taken` only when the map is loaded with `?holdId=`. `getSeatMap` currently takes just the show id. Coming back to the seat page after a hold needs that query, or `pick` refuses the seats (`taken.has(seat.id)`).

5. **Held vs booked.** The map UI has `free | taken | selected` (`SeatMap2D`). The API adds `statuses[]` with `available | held | booked`. Parsing with `SeatMapSchema` drops `statuses`. Held and booked both render as taken until the map reads `statuses`. Seat kind stays `type: "std" | "access"`.

6. **Ticket type per seat.** `BookingInputSchema` is `{ showId, seats, name, email, phone? }`. Create sends `{ holdId, name, email, phone?, tickets: [{ seatId, ticketType }] }` and does not send a price. The details form has no adult/child control. Child-only bookings are `422` `CHILD_ONLY_BOOKING`. There is no senior type. Do not add one.

7. **One-shot create vs hold → pending → confirm.** `createBooking` checks `taken`, writes a booking, and the page navigates straight to `/booking/confirmed?ref=`. The API create leaves `status: "pending"`. The confirm button should `POST /api/bookings` and then `POST /api/bookings/:ref/confirm`. Confirm does not charge; the "Demo, no payment taken" copy can stay until the payment slot in the confirm section is filled. The client must not treat create as confirmed.

8. **`Booking.total` and `placeholder`.** The mock `total` is `seats.length * show.price` in euros, and `BookingSchema` requires `placeholder: true`. The API `total` is integer cents, `currency` is `"EUR"`, and `placeholder` is absent. `getBooking` parses with `BookingSchema`, so a real payload will fail that parse until the client uses `BookingRecordSchema`. The confirmed page does not render `total`. The details summary still does `seats.length * show.price`, which charges every seat the adult price. Mixed adult/child totals have to sum `tickets[].priceCents`.

9. **`Show.price` vs ticket prices.** `price` remains the adult price in euros (`9`, `12`, `15` for 2D / 3D / IMAX) so showtime pills and the seat tooltip keep working on a URL swap. `ticketPrices` and `currency` are extra and are stripped by `ShowSchema`. Child prices exist only on `ticketPrices`.

10. **Null vs 404.** `getMovie`, `getShow`, and `getBooking` return `null` when the mock has no row. The API returns `404` `NOT_FOUND`. The wrappers should map that to `null` if the signatures stay. `getSeatMap` already throws; the seat page shows `ErrorCard`.

11. **Booking ref.** The mock ref is `LUM-` plus 6 base36 characters from `Math.random`. The API ref is `LUM-` plus 32 uppercase hex characters, because `GET /api/bookings/:ref` is public. The confirmed page prints `ref` and puts it in `?ref=`; it does not check the shape. `ref` is the booking id. There is no second id in the JSON.

12. **Date chips use the browser zone.** `dayKey` in `src/lib/format.ts` groups showtimes in the browser's local timezone. The API `date` query uses `CINEMA_TZ`. Today's pages load every show and filter locally, so they do not send `date`. A later caller that sends `date` from `dayKey` can move a show across midnight when the two zones differ.

13. **Validation on the server.** The details form only runs `BookingInputSchema` in the browser. The API echoes the same `name` and `email` messages on `error.fields`. The catch path can assign those onto the inputs; it currently toasts a single string.

14. **Movies stay `placeholder: true`.** `MovieSchema` requires that literal, and the API will send it while the catalogue is still placeholder copy. A later real catalogue has to relax the schema. No change for the current UI.
