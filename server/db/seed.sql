-- Placeholder catalogue. Films, halls, and prices are not a real cinema.
-- Ticket prices are integer cents. Adult and child only; there is no senior ticket.
-- Shows are the next seven calendar days in Europe/Berlin (default CINEMA_TZ),
-- at 13:30, 16:00, 18:45, and 21:15. The featured film's 21:15 today is closed.

INSERT INTO movies (
  id, title, tagline, runtime_min, rating, genres, synopsis, palette, placeholder, position
) VALUES
  (
    'starlight-run',
    'Starlight Run',
    'One night. One road. No way back.',
    124,
    'PG-13',
    ARRAY['Action', 'Sci-Fi'],
    'A courier crosses a city that only exists after midnight to deliver a package nobody should open. [PH] synopsis.',
    ARRAY['#7A1F2B', '#F2B544'],
    true,
    0
  ),
  (
    'the-quiet-harbor',
    'The Quiet Harbor',
    'Some tides bring things back.',
    108,
    'PG',
    ARRAY['Drama'],
    'A lighthouse keeper and a stranded sailor share one long winter. [PH] synopsis.',
    ARRAY['#1E3A5F', '#A3C4F3'],
    true,
    1
  ),
  (
    'neon-alley',
    'Neon Alley',
    'Every light hides a secret.',
    97,
    'R',
    ARRAY['Thriller'],
    'A detective with a broken camera follows a trail of pink neon. [PH] synopsis.',
    ARRAY['#3B0A45', '#FF4FA3'],
    true,
    2
  ),
  (
    'paper-moons',
    'Paper Moons',
    'Fold the sky, keep the dream.',
    92,
    'G',
    ARRAY['Animation', 'Family'],
    'Two siblings build a paper moon to light their village. [PH] synopsis.',
    ARRAY['#0F3D3E', '#F4F1EA'],
    true,
    3
  ),
  (
    'iron-orchard',
    'Iron Orchard',
    'What grows here, stays here.',
    131,
    'PG-13',
    ARRAY['Drama', 'Mystery'],
    'A family returns to the orchard where the trees are made of metal. [PH] synopsis.',
    ARRAY['#3D2B1F', '#C9A227'],
    true,
    4
  ),
  (
    'laugh-track',
    'Laugh Track',
    'The show must go wrong.',
    101,
    'PG-13',
    ARRAY['Comedy'],
    'A sitcom cast gets stuck living inside their own reruns. [PH] synopsis.',
    ARRAY['#1F3D1F', '#9BE564'],
    true,
    5
  )
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  tagline = EXCLUDED.tagline,
  runtime_min = EXCLUDED.runtime_min,
  rating = EXCLUDED.rating,
  genres = EXCLUDED.genres,
  synopsis = EXCLUDED.synopsis,
  palette = EXCLUDED.palette,
  placeholder = EXCLUDED.placeholder,
  position = EXCLUDED.position;

INSERT INTO halls (id, name, columns) VALUES
  ('h1', 'Hall 1 [PH]', 18),
  ('h2', 'Hall 2 [PH]', 18)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  columns = EXCLUDED.columns;

-- Rows A–J, 16 seats in blocks of 4 / 8 / 4. x includes the aisle gaps (columns 18).
-- Row J seats 1, 2, 15, and 16 are the placeholder wheelchair spaces.
INSERT INTO seats (hall_id, id, row, n, x, type)
SELECT
  h.id,
  chr(65 + r.i) || n.i::text,
  chr(65 + r.i),
  n.i,
  CASE
    WHEN n.i <= 4 THEN n.i - 1
    WHEN n.i <= 12 THEN n.i
    ELSE n.i + 1
  END,
  CASE
    WHEN r.i = 9 AND n.i IN (1, 2, 15, 16) THEN 'access'
    ELSE 'std'
  END
FROM halls h
CROSS JOIN generate_series(0, 9) AS r(i)
CROSS JOIN generate_series(1, 16) AS n(i)
ON CONFLICT (hall_id, id) DO UPDATE SET
  row = EXCLUDED.row,
  n = EXCLUDED.n,
  x = EXCLUDED.x,
  type = EXCLUDED.type;

WITH days AS (
  SELECT d::date AS day
  FROM generate_series(
    (timezone('Europe/Berlin', now()))::date,
    (timezone('Europe/Berlin', now()))::date + 6,
    interval '1 day'
  ) AS d
),
movie_rows AS (
  SELECT id, position FROM movies
),
times AS (
  SELECT *
  FROM (VALUES
    (0, TIME '13:30'),
    (1, TIME '16:00'),
    (2, TIME '18:45'),
    (3, TIME '21:15')
  ) AS t(idx, tod)
),
slots AS (
  SELECT
    m.id AS movie_id,
    m.position AS mi,
    d.day,
    t.idx AS ti,
    t.tod,
    (ARRAY['2D', '3D', 'IMAX'])[((m.position + t.idx) % 3) + 1] AS format,
    (ARRAY['h1', 'h2'])[((m.position + t.idx) % 2) + 1] AS hall_id
  FROM movie_rows m
  CROSS JOIN days d
  CROSS JOIN times t
)
INSERT INTO shows (id, movie_id, start, format, hall_id, sold_out)
SELECT
  movie_id || '-' || to_char(day, 'YYYY-MM-DD') || '-' || to_char(tod, 'HH24MI'),
  movie_id,
  (day + tod) AT TIME ZONE 'Europe/Berlin',
  format,
  hall_id,
  (mi = 0 AND ti = 3 AND day = (SELECT min(day) FROM days))
FROM slots
ON CONFLICT (id) DO NOTHING;

-- 2D 900/600, 3D 1200/800, IMAX 1500/1000. Integer cents, currency EUR.
INSERT INTO ticket_prices (show_id, ticket_type, price_cents, currency)
SELECT s.id, p.ticket_type, p.price_cents, 'EUR'
FROM shows s
JOIN (VALUES
  ('2D', 'adult', 900),
  ('2D', 'child', 600),
  ('3D', 'adult', 1200),
  ('3D', 'child', 800),
  ('IMAX', 'adult', 1500),
  ('IMAX', 'child', 1000)
) AS p(format, ticket_type, price_cents) ON p.format = s.format
ON CONFLICT (show_id, ticket_type) DO UPDATE SET
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency;
