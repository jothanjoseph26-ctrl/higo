import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * Single source of truth for ring state across the entire driver app.
 *
 * Lifecycle:
 *   TRIP_NEW_REQUEST → ringManager.start(tripId)
 *   ACCEPT / DECLINE / TIMEOUT / CANCEL / LOGOUT → ringManager.stop()
 *
 * Design rules:
 * - One active ring at a time (previous ring is stopped before starting a new one)
 * - Idempotent: start(sameTripId) is a no-op if already ringing for that trip
 * - stop() is safe to call multiple times
 * - WebView should query ringManager state, not start its own audio
 */
class RingManagerImpl {
  private tripRequestId: string | null = null;
  private ringing = false;
  private player: AudioPlayer | null = null;

  /**
   * Start ringing for a specific trip request.
   * If already ringing for the same trip, no-op (idempotent).
   * If ringing for a different trip, stops the old ring first.
   */
  start(tripRequestId: string): void {
    if (this.tripRequestId === tripRequestId && this.ringing) {
      return; // Already ringing for this trip — idempotent
    }
    this.stop(); // Stop any previous ring

    this.tripRequestId = tripRequestId;
    this.ringing = true;

    try {
      const p = createAudioPlayer(require('../assets/ring.mp3'));
      p.loop = true;
      p.play();
      this.player = p;
    } catch (err) {
      console.warn('Failed to play ring sound:', err);
    }
  }

  /** Stop the ring and clear state. Safe to call multiple times. */
  stop(): void {
    if (this.player) {
      try {
        this.player.pause();
        this.player.remove();
      } catch {}
      this.player = null;
    }
    this.ringing = false;
    this.tripRequestId = null;
  }

  isRinging(): boolean {
    return this.ringing;
  }

  getCurrentTripId(): string | null {
    return this.tripRequestId;
  }
}

/** Singleton — one source of truth for ring state across the entire app. */
export const ringManager = new RingManagerImpl();

// Backward-compatible aliases for gradual migration
export const stopRing = () => ringManager.stop();
export const isRinging = () => ringManager.isRinging();
