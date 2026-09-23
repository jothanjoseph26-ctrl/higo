import { ConversationFSM } from './conversation.fsm';
import { ConversationState } from './whatsapp.types';

describe('ConversationFSM', () => {
  describe('transition', () => {
    it('should transition IDLE → AWAITING_PICKUP on book_ride', () => {
      const result = ConversationFSM.transition(ConversationState.IDLE, 'book_ride');
      expect(result).toBe(ConversationState.AWAITING_PICKUP);
    });

    it('should transition AWAITING_PICKUP → AWAITING_DESTINATION on pickup_received', () => {
      const result = ConversationFSM.transition(ConversationState.AWAITING_PICKUP, 'pickup_received');
      expect(result).toBe(ConversationState.AWAITING_DESTINATION);
    });

    it('should transition AWAITING_DESTINATION → SELECTING_VEHICLE on destination_received', () => {
      const result = ConversationFSM.transition(ConversationState.AWAITING_DESTINATION, 'destination_received');
      expect(result).toBe(ConversationState.SELECTING_VEHICLE);
    });

    it('should transition SELECTING_VEHICLE → CONFIRMING_RIDE on vehicle_selected', () => {
      const result = ConversationFSM.transition(ConversationState.SELECTING_VEHICLE, 'vehicle_selected');
      expect(result).toBe(ConversationState.CONFIRMING_RIDE);
    });

    it('should transition CONFIRMING_RIDE → SELECTING_PAYMENT on confirm_ride', () => {
      const result = ConversationFSM.transition(ConversationState.CONFIRMING_RIDE, 'confirm_ride');
      expect(result).toBe(ConversationState.SELECTING_PAYMENT);
    });

    it('should transition SELECTING_PAYMENT → WAITING_FOR_MATCH on payment_selected', () => {
      const result = ConversationFSM.transition(ConversationState.SELECTING_PAYMENT, 'payment_selected');
      expect(result).toBe(ConversationState.WAITING_FOR_MATCH);
    });

    it('should transition WAITING_FOR_MATCH → TRIP_ACTIVE on trip_matched', () => {
      const result = ConversationFSM.transition(ConversationState.WAITING_FOR_MATCH, 'trip_matched');
      expect(result).toBe(ConversationState.TRIP_ACTIVE);
    });

    it('should transition TRIP_ACTIVE → AWAITING_RATING on trip_completed', () => {
      const result = ConversationFSM.transition(ConversationState.TRIP_ACTIVE, 'trip_completed');
      expect(result).toBe(ConversationState.AWAITING_RATING);
    });

    it('should transition AWAITING_RATING → BOOKING_COMPLETED on rating_submitted', () => {
      const result = ConversationFSM.transition(ConversationState.AWAITING_RATING, 'rating_submitted');
      expect(result).toBe(ConversationState.BOOKING_COMPLETED);
    });

    it('should allow menu from any non-handoff state', () => {
      const states = Object.values(ConversationState).filter(
        (s) => s !== ConversationState.HUMAN_HANDOFF,
      );
      for (const state of states) {
        const result = ConversationFSM.transition(state as ConversationState, 'menu');
        expect(result).toBe(ConversationState.IDLE);
      }
    });

    it('should return null for illegal transitions', () => {
      const result = ConversationFSM.transition(ConversationState.IDLE, 'trip_completed');
      expect(result).toBeNull();
    });

    it('should handle complete booking flow', () => {
      let state = ConversationState.IDLE;

      state = ConversationFSM.transition(state, 'book_ride')!;
      expect(state).toBe(ConversationState.AWAITING_PICKUP);

      state = ConversationFSM.transition(state, 'pickup_received')!;
      expect(state).toBe(ConversationState.AWAITING_DESTINATION);

      state = ConversationFSM.transition(state, 'destination_received')!;
      expect(state).toBe(ConversationState.SELECTING_VEHICLE);

      state = ConversationFSM.transition(state, 'vehicle_selected')!;
      expect(state).toBe(ConversationState.CONFIRMING_RIDE);

      state = ConversationFSM.transition(state, 'confirm_ride')!;
      expect(state).toBe(ConversationState.SELECTING_PAYMENT);

      state = ConversationFSM.transition(state, 'payment_selected')!;
      expect(state).toBe(ConversationState.WAITING_FOR_MATCH);

      state = ConversationFSM.transition(state, 'trip_matched')!;
      expect(state).toBe(ConversationState.TRIP_ACTIVE);

      state = ConversationFSM.transition(state, 'trip_completed')!;
      expect(state).toBe(ConversationState.AWAITING_RATING);

      state = ConversationFSM.transition(state, 'rating_submitted')!;
      expect(state).toBe(ConversationState.BOOKING_COMPLETED);
    });
  });
});
