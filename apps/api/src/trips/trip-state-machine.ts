import { TripStatus } from '@higo/shared-types';

/**
 * Canonical trip state machine.
 *
 * REQUESTED → MATCHED → ARRIVED → ACTIVE → COMPLETED
 *                                          ↗
 * Any cancellable state → CANCELLED
 *
 * The backend is the single source of truth.
 * Clients must not invent local state — they update from server events.
 */
export const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.REQUESTED]: [TripStatus.MATCHED, TripStatus.CANCELLED],
  [TripStatus.MATCHED]: [TripStatus.ARRIVED, TripStatus.CANCELLED],
  [TripStatus.ARRIVED]: [TripStatus.ACTIVE, TripStatus.CANCELLED],
  [TripStatus.ACTIVE]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

export function validateTransition(from: TripStatus, to: TripStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
