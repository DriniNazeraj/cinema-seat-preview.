/**
 * Re-export of the shared HTTP contract. Server code imports schemas from here
 * and does not redefine them.
 */
export {
  ACCESS_SEAT_MISMATCH_MESSAGE,
  ApiFailureSchema,
  BookingResponseSchema,
  CHILD_ONLY_MESSAGE,
  COUNTS_AS_ADULT,
  countsAsAdult,
  CURRENCY,
  CreateBookingBodySchema,
  CreateHoldBodySchema,
  ERROR_MESSAGE,
  ERROR_STATUS,
  GetMovieResponseSchema,
  HealthResponseSchema,
  GetSeatMapResponseSchema,
  GetShowResponseSchema,
  HoldResponseSchema,
  ListMoviesResponseSchema,
  ListShowsQuerySchema,
  ListShowsResponseSchema,
  PLACEHOLDER_TICKET_PRICES,
  RATE_LIMITS,
  ReleaseHoldResponseSchema,
  SeatMapQuerySchema,
  seatTakenMessage,
  type ErrorCode,
  type SeatKind,
  type TicketType,
} from '../../src/lib/api-contract.ts'
