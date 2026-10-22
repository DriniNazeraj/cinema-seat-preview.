-- Cinema booking schema.
-- Seat exclusivity is the primary key on seat_occupancy (show_id, seat_id).
-- A second hold or booking cannot insert the same pair. Expired holds are
-- deleted inside the hold transaction before that insert, and reads ignore
-- kind = 'hold' rows whose expires_at has passed, so a sweeper is not required
-- for correctness.
-- There is no payment table. Confirm only flips status.

CREATE TABLE movies (
  id text PRIMARY KEY,
  title text NOT NULL,
  tagline text NOT NULL,
  runtime_min integer NOT NULL CHECK (runtime_min > 0),
  rating text NOT NULL,
  genres text[] NOT NULL,
  synopsis text NOT NULL,
  palette text[] NOT NULL CHECK (cardinality(palette) = 2),
  placeholder boolean NOT NULL CHECK (placeholder),
  position integer NOT NULL UNIQUE
);

CREATE TABLE halls (
  id text PRIMARY KEY,
  name text NOT NULL,
  columns integer NOT NULL CHECK (columns > 0)
);

CREATE TABLE seats (
  hall_id text NOT NULL REFERENCES halls (id),
  id text NOT NULL CHECK (id ~ '^[A-Z][0-9]{1,2}$'),
  row text NOT NULL CHECK (char_length(row) = 1),
  n integer NOT NULL CHECK (n > 0),
  x integer NOT NULL CHECK (x >= 0),
  type text NOT NULL CHECK (type IN ('std', 'access')),
  PRIMARY KEY (hall_id, id),
  CHECK (id = row || n::text)
);

CREATE TABLE shows (
  id text PRIMARY KEY,
  movie_id text NOT NULL REFERENCES movies (id),
  start timestamptz NOT NULL,
  format text NOT NULL CHECK (format IN ('2D', '3D', 'IMAX')),
  hall_id text NOT NULL REFERENCES halls (id),
  -- Closed by the catalogue. The API soldOut flag is this OR no free seat.
  sold_out boolean NOT NULL DEFAULT false
);

CREATE INDEX shows_start_idx ON shows (start, id);
CREATE INDEX shows_movie_start_idx ON shows (movie_id, start, id);

CREATE TABLE ticket_prices (
  show_id text NOT NULL REFERENCES shows (id),
  ticket_type text NOT NULL CHECK (ticket_type IN ('adult', 'child')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  PRIMARY KEY (show_id, ticket_type)
);

CREATE TABLE holds (
  id uuid PRIMARY KEY,
  show_id text NOT NULL REFERENCES shows (id),
  seats text[] NOT NULL CHECK (cardinality(seats) BETWEEN 1 AND 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  consumed_at timestamptz
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY,
  ref text NOT NULL UNIQUE CHECK (ref ~ '^LUM-[0-9A-F]{32}$'),
  show_id text NOT NULL REFERENCES shows (id),
  hold_id uuid NOT NULL UNIQUE REFERENCES holds (id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  status text NOT NULL CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

-- One row per seat per show. This primary key is the double-booking lock.
CREATE TABLE seat_occupancy (
  show_id text NOT NULL REFERENCES shows (id),
  seat_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('hold', 'booked')),
  hold_id uuid REFERENCES holds (id),
  booking_id uuid REFERENCES bookings (id),
  expires_at timestamptz,
  PRIMARY KEY (show_id, seat_id),
  CHECK (
    (kind = 'hold' AND hold_id IS NOT NULL AND expires_at IS NOT NULL AND booking_id IS NULL)
    OR
    (kind = 'booked' AND booking_id IS NOT NULL AND expires_at IS NULL AND hold_id IS NOT NULL)
  )
);

CREATE INDEX seat_occupancy_hold_expiry_idx
  ON seat_occupancy (expires_at)
  WHERE kind = 'hold';

CREATE INDEX seat_occupancy_hold_id_idx ON seat_occupancy (hold_id);

CREATE TABLE booking_seats (
  booking_id uuid NOT NULL REFERENCES bookings (id),
  seat_id text NOT NULL CHECK (seat_id ~ '^[A-Z][0-9]{1,2}$'),
  ticket_type text NOT NULL CHECK (ticket_type IN ('adult', 'child')),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (booking_id, seat_id)
);

-- Optional Idempotency-Key on POST /api/holds and POST /api/bookings.
CREATE TABLE idempotency_keys (
  key text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 200),
  route text NOT NULL,
  request_hash text NOT NULL,
  status_code integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, route)
);
