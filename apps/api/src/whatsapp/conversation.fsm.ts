import { ConversationState } from './whatsapp.types';

export type ConversationEvent =
  // Registration events
  | 'register_passenger'
  | 'register_driver'
  | 'name_provided'
  | 'city_provided'
  | 'vehicle_provided'

  // Booking events
  | 'book_ride'
  | 'pickup_received'
  | 'destination_received'
  | 'vehicle_selected'
  | 'confirm_ride'
  | 'payment_selected'
  | 'trip_matched'
  | 'trip_active'
  | 'trip_completed'
  | 'rating_submitted'
  | 'no_drivers'

  // Navigation events
  | 'menu'
  | 'help'
  | 'cancel'
  | 'back'
  | 'restart'
  | 'talk_to_human'

  // System events
  | 'session_expired'
  | 'unexpected_input'

  // Driver events
  | 'go_online'
  | 'go_offline'
  | 'accept_trip'
  | 'decline_trip'
  | 'arrived_at_pickup'
  | 'start_trip'
  | 'complete_trip'
  | 'rate_passenger'
  | 'trip_assigned';

interface Transition {
  from: ConversationState;
  to: ConversationState;
  event: ConversationEvent;
}

const TRANSITIONS: Transition[] = [
  // Registration flow (existing)
  { from: ConversationState.IDLE, event: 'register_passenger', to: ConversationState.AWAITING_PASSENGER_NAME },
  { from: ConversationState.IDLE, event: 'register_driver', to: ConversationState.AWAITING_DRIVER_NAME },
  { from: ConversationState.AWAITING_PASSENGER_NAME, event: 'name_provided', to: ConversationState.AWAITING_PASSENGER_CITY },
  { from: ConversationState.AWAITING_PASSENGER_CITY, event: 'city_provided', to: ConversationState.IDLE },
  { from: ConversationState.AWAITING_DRIVER_NAME, event: 'name_provided', to: ConversationState.AWAITING_DRIVER_VEHICLE },
  { from: ConversationState.AWAITING_DRIVER_VEHICLE, event: 'vehicle_provided', to: ConversationState.AWAITING_DRIVER_CITY },
  { from: ConversationState.AWAITING_DRIVER_CITY, event: 'city_provided', to: ConversationState.IDLE },

  // Booking flow
  { from: ConversationState.IDLE, event: 'book_ride', to: ConversationState.AWAITING_PICKUP },
  { from: ConversationState.AWAITING_PICKUP, event: 'pickup_received', to: ConversationState.AWAITING_DESTINATION },
  { from: ConversationState.AWAITING_DESTINATION, event: 'destination_received', to: ConversationState.SELECTING_VEHICLE },
  { from: ConversationState.SELECTING_VEHICLE, event: 'vehicle_selected', to: ConversationState.CONFIRMING_RIDE },
  { from: ConversationState.CONFIRMING_RIDE, event: 'confirm_ride', to: ConversationState.SELECTING_PAYMENT },
  { from: ConversationState.CONFIRMING_RIDE, event: 'pickup_received', to: ConversationState.AWAITING_DESTINATION },
  { from: ConversationState.CONFIRMING_RIDE, event: 'destination_received', to: ConversationState.SELECTING_VEHICLE },
  { from: ConversationState.SELECTING_PAYMENT, event: 'payment_selected', to: ConversationState.WAITING_FOR_MATCH },
  { from: ConversationState.WAITING_FOR_MATCH, event: 'trip_matched', to: ConversationState.TRIP_ACTIVE },
  { from: ConversationState.WAITING_FOR_MATCH, event: 'no_drivers', to: ConversationState.IDLE },
  { from: ConversationState.TRIP_ACTIVE, event: 'trip_completed', to: ConversationState.AWAITING_RATING },
  { from: ConversationState.AWAITING_RATING, event: 'rating_submitted', to: ConversationState.BOOKING_COMPLETED },
  { from: ConversationState.BOOKING_COMPLETED, event: 'book_ride', to: ConversationState.AWAITING_PICKUP },
  { from: ConversationState.BOOKING_COMPLETED, event: 'menu', to: ConversationState.IDLE },

  // Global transitions (available from ANY state except HUMAN_HANDOFF)
  ...Object.values(ConversationState)
    .filter((s) => s !== ConversationState.HUMAN_HANDOFF)
    .flatMap((state) => [
      { from: state, event: 'menu', to: ConversationState.IDLE } as Transition,
      { from: state, event: 'help', to: ConversationState.HUMAN_HANDOFF } as Transition,
      { from: state, event: 'restart', to: ConversationState.IDLE } as Transition,
      { from: state, event: 'cancel', to: ConversationState.IDLE } as Transition,
      { from: state, event: 'session_expired', to: ConversationState.IDLE } as Transition,
    ]),

  // Driver flow
  { from: ConversationState.DRIVER_IDLE, event: 'go_online', to: ConversationState.DRIVER_ONLINE },
  { from: ConversationState.DRIVER_ONLINE, event: 'go_offline', to: ConversationState.DRIVER_IDLE },
  { from: ConversationState.DRIVER_ONLINE, event: 'trip_assigned', to: ConversationState.DRIVER_INCOMING_REQUEST },
  { from: ConversationState.DRIVER_INCOMING_REQUEST, event: 'accept_trip', to: ConversationState.DRIVER_ACCEPTED_TRIP },
  { from: ConversationState.DRIVER_INCOMING_REQUEST, event: 'decline_trip', to: ConversationState.DRIVER_ONLINE },
  { from: ConversationState.DRIVER_ACCEPTED_TRIP, event: 'arrived_at_pickup', to: ConversationState.DRIVER_ARRIVED },
  { from: ConversationState.DRIVER_ARRIVED, event: 'start_trip', to: ConversationState.DRIVER_TRIP_IN_PROGRESS },
  { from: ConversationState.DRIVER_TRIP_IN_PROGRESS, event: 'complete_trip', to: ConversationState.DRIVER_AWAITING_PASSENGER_RATING },
  { from: ConversationState.DRIVER_AWAITING_PASSENGER_RATING, event: 'rate_passenger', to: ConversationState.DRIVER_ONLINE },
];

// Build lookup map: `state:event` → next state
const TRANSITION_MAP: Map<string, ConversationState> = new Map();
for (const t of TRANSITIONS) {
  TRANSITION_MAP.set(`${t.from}:${t.event}`, t.to);
}

export class ConversationFSM {
  /**
   * Attempt a state transition.
   * Returns the new state if valid, or null if the transition is illegal.
   */
  static transition(currentState: ConversationState, event: ConversationEvent): ConversationState | null {
    const key = `${currentState}:${event}`;
    return TRANSITION_MAP.get(key) ?? null;
  }

  /**
   * Check if a transition is valid without executing it.
   */
  static canTransition(currentState: ConversationState, event: ConversationEvent): boolean {
    return TRANSITION_MAP.has(`${currentState}:${event}`);
  }

  /**
   * Get all valid events for a given state.
   */
  static validEvents(state: ConversationState): ConversationEvent[] {
    return Array.from(TRANSITION_MAP.entries())
      .filter(([key]) => key.startsWith(`${state}:`))
      .map(([, to]) => to as unknown as ConversationEvent);
  }

  /**
   * Check if a state is a terminal/end state for a booking flow.
   */
  static isTerminal(state: ConversationState): boolean {
    return state === ConversationState.BOOKING_COMPLETED ||
           state === ConversationState.HUMAN_HANDOFF;
  }

  /**
   * Check if a state requires trip data.
   */
  static requiresTripData(state: ConversationState): boolean {
    return state === ConversationState.TRIP_ACTIVE ||
           state === ConversationState.AWAITING_RATING;
  }
}
