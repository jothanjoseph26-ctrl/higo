import { TripStatus } from '@higo/shared-types';

export const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.REQUESTED]: [TripStatus.MATCHED, TripStatus.CANCELLED],
  [TripStatus.MATCHED]: [TripStatus.EN_ROUTE, TripStatus.CANCELLED],
  [TripStatus.EN_ROUTE]: [TripStatus.ACTIVE, TripStatus.CANCELLED],
  [TripStatus.ACTIVE]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

export function validateTransition(from: TripStatus, to: TripStatus): boolean {
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
