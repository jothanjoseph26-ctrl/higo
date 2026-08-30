import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

/**
 * Single source of truth for ring state across the entire driver app.
 *
 * Lifecycle:
 *   TRIP_NEW_REQUEST → ringManager.start(tripId, offerTimeoutSec)
 *   ACCEPT / DECLINE / TIMEOUT / CANCEL / LOGOUT → ringManager.stop()
 *
 * Design rules:
 * - One active ring at a time (previous ring is stopped before starting a new one)
 * - Idempotent: start(sameTripId) is a no-op if already ringing for that trip
 * - stop() is safe to call multiple times
 * - WebView should query ringManager state, not start its own audio
 * - Hard safety timeout prevents infinite ringing if client timer glitches
 */
class RingManagerImpl {
  private tripRequestId: string | null = null;
  private ringing = false;
  private player: AudioPlayer | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Start ringing for a specific trip request.
   * If already ringing for the same trip, no-op (idempotent).
   * If ringing for a different trip, stops the old ring first.
   *
   * @param offerTimeoutSec Server-side offer timeout. Ring auto-stops after
   *   this duration + 15s safety margin, even if stop() was not called.
   */
  start(tripRequestId: string, offerTimeoutSec = 45): void {
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

    // Hard safety timeout: offer lifetime + 15s margin.
    // Prevents infinite ringing if the client countdown or server timeout
    // fails to trigger stop() (e.g., timer glitch, app backgrounded).
    const safetyMs = (offerTimeoutSec + 15) * 1000;
    this.safetyTimer = setTimeout(() => {
      console.warn(`RingManager: safety timeout after ${offerTimeoutSec + 15}s — forcing stop`);
      this.stop();
    }, safetyMs);
  }

  /** Stop the ring and clear state. Safe to call multiple times. */
  stop(): void {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = null;
    }
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
