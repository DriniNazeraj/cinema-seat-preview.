/**
 * Re-export of the shared HTTP contract. Server code imports schemas from here
 * and does not redefine them.
 */
export {
  ApiFailureSchema,
  BookingResponseSchema,
  CHILD_ONLY_MESSAGE,
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
  RATE_LIMITS,
  ReleaseHoldResponseSchema,
  SeatMapQuerySchema,
  seatTakenMessage,
  type ErrorCode,
  type TicketType,
} from '../../src/lib/api-contract.ts'
