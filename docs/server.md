# Booking API server

Express + TypeScript implementation of [`docs/api.md`](api.md). Schemas are imported from `src/lib/api-contract.ts`. The Vite UI is unchanged and still uses its mock data.

Postgres, parameterized SQL only (no ORM). Confirm marks a booking `confirmed`. It does not take payment.

## Setup

Postgres 14+ running locally. Create a database the app can own, then copy the example env. `server/.env` is gitignored. Do not commit it, and do not put a production password in `.env.example`.

```bash
createuser cinema
createdb cinema --owner=cinema
# or, with a password and TCP:
# CREATE ROLE cinema LOGIN PASSWORD 'cinema';
# CREATE DATABASE cinema OWNER cinema;

cd server
cp .env.example .env
npm install
```

`npm install` also links `zod` for the shared contract when the repo root has not installed it yet. If you already ran `npm install` at the repo root, that copy is used.

| env | role |
|---|---|
| `DATABASE_URL` | required Postgres URL |
| `PORT` | HTTP port, default `3000` |
| `CORS_ORIGIN` | allowed browser origin, comma-separated. Default `http://localhost:5173`. No cookies. |
| `CINEMA_TZ` | IANA zone for `GET /api/shows?date=`. Default `Europe/Berlin`. |
| `HOLD_SECONDS` | positive integer hold length. Default `600`. Clients read `holdExpiresAt`. |
| `TRUST_PROXY` | hop count for the client IP. Default `0` (trust none). `req.ip` is then the socket address, and `X-Forwarded-For` does not bypass the rate limit. When the process sits behind a reverse proxy, set this to the number of proxies in front (for example `1`). |

## Migrate, seed, run

From `server/`:

```bash
npm run migrate   # db/migrations/*.sql, once each, recorded in schema_migrations
npm run seed      # placeholder movies, halls, seats, shows, adult/child/disabled prices in cents
npm run dev       # tsx watch, http://localhost:3000
```

`npm start` runs the same server without the file watcher.

The seed is safe to re-run. Films and halls refresh in place. Shows are the next seven calendar days in Europe/Berlin at 13:30, 16:00, 18:45, and 21:15. Prices are the placeholder cents in `PLACEHOLDER_TICKET_PRICES`: adult 1200, child 800, disabled 800, for every format. There is no senior ticket. The featured film's 21:15 show today is closed (`soldOut`). Halls are rows A–J, 16 seats in blocks of 4 / 8 / 4. On the last row, seats 1, 2, 15, and 16 are `access`, and seats 3 and 14 are `companion`. Other seats are `standard`. Synopses are marked `[PH]`.

Show ids look like `starlight-run-2026-10-22-1330` (13:30 Europe/Berlin is `2026-10-22T11:30:00.000Z` while CEST is in effect).

## Checks

```bash
npm run typecheck
npm test            # two simultaneous holds on one seat; exactly one wins
npm run concurrency # same race against a running server (BASE_URL, default :3000)
```

Migrate before `npm test`. The concurrency script also needs the server listening.

Seat holds last `HOLD_SECONDS`. Expired holds do not block seats: reads ignore them, and the hold transaction deletes them before inserting. A sweeper runs about every 30 seconds so stale rows do not sit around. A late refresh of an expired hold is `409 HOLD_EXPIRED`.

`POST /api/holds`, hold refresh, hold release, `POST /api/bookings`, and confirm are rate limited per `req.ip` (`express-rate-limit`). With the default `TRUST_PROXY=0` that address is the TCP peer. Catalogue `GET`s and `GET /api/health` are not limited. `GET /api/health` runs `SELECT 1` and returns `{ ok: true, data: { status: "ok", db: "ok" } }`, or `503` `UNAVAILABLE` when the database is down. A JSON body over 32 KiB is `413` `PAYLOAD_TOO_LARGE`. `Cache-Control` is a few seconds on catalogue reads and `no-store` on the health check, seat maps, holds, and bookings.
