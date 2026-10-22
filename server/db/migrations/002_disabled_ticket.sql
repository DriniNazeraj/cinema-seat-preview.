-- Disabled tickets, and seat kind (standard, access, companion).
-- seats.kind is the booking rule. seats.type stays the mock's std | access.
-- Occupancy kind (hold | booked) is a different column on seat_occupancy.

ALTER TABLE seats
  ADD COLUMN kind text NOT NULL DEFAULT 'standard'
  CONSTRAINT seats_kind_check CHECK (kind IN ('standard', 'access', 'companion'));

ALTER TABLE ticket_prices DROP CONSTRAINT ticket_prices_ticket_type_check;
ALTER TABLE ticket_prices
  ADD CONSTRAINT ticket_prices_ticket_type_check
  CHECK (ticket_type IN ('adult', 'child', 'disabled'));

ALTER TABLE booking_seats DROP CONSTRAINT booking_seats_ticket_type_check;
ALTER TABLE booking_seats
  ADD CONSTRAINT booking_seats_ticket_type_check
  CHECK (ticket_type IN ('adult', 'child', 'disabled'));
