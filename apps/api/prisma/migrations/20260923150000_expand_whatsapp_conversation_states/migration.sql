-- Expand WhatsAppConversationState with booking-flow and driver states
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'awaiting_pickup';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'awaiting_destination';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'selecting_vehicle';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'confirming_ride';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'selecting_payment';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'waiting_for_match';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'trip_active';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'awaiting_rating';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'booking_completed';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_idle';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_online';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_incoming_request';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_accepted_trip';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_navigating_to_pickup';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_arrived';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_trip_in_progress';
ALTER TYPE "WhatsAppConversationState" ADD VALUE IF NOT EXISTS 'driver_awaiting_passenger_rating';
