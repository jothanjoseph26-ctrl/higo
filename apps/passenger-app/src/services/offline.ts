import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { HEALTH_CHECK_URL } from '../config';
import { api } from './api';

const OFFLINE_QUEUE_KEY = '@higo/passenger/offlineQueue';

interface QueuedRequest {
  id: string;
  type: 'fare-estimate';
  payload: any;
  attempts: number;
}

const HEALTH_CHECK_INTERVAL_MS = 15_000;

export class OfflineManager {
  private static isConnected = true;
  private static listeners: Array<(connected: boolean) => void> = [];
  private static monitorTimer: ReturnType<typeof setInterval> | null = null;
  private static monitoring = false;

  static init(onStatusChange?: (connected: boolean) => void) {
    if (onStatusChange) {
      this.listeners.push(onStatusChange);
    }

    if (this.monitoring) return;
    this.monitoring = true;

    void this.checkConnection();

    this.monitorTimer = setInterval(() => {
      void this.checkConnection();
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  static async checkConnection(): Promise<boolean> {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setConnectionStatus(false);
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(HEALTH_CHECK_URL, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const connected = response.ok;
      this.setConnectionStatus(connected);
      return connected;
    } catch {
      this.setConnectionStatus(false);
      return false;
    }
  }

  static setConnectionStatus(connected: boolean) {
    if (this.isConnected === connected) return;
    this.isConnected = connected;
    this.listeners.forEach((listener) => listener(connected));
    
    if (connected) {
      void this.flushQueue();
    }
  }

  static getIsConnected() {
    return this.isConnected;
  }

  static addListener(cb: (connected: boolean) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  static async queueRequest(type: 'fare-estimate', payload: any) {
    const queueRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: QueuedRequest[] = queueRaw ? JSON.parse(queueRaw) : [];
    
    const request: QueuedRequest = {
      id: Math.random().toString(36).substring(7),
      type,
      payload,
      attempts: 0,
    };
    
    queue.push(request);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }

  private static async flushQueue() {
    const queueRaw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueRaw) return;

    const queue: QueuedRequest[] = JSON.parse(queueRaw);
    if (queue.length === 0) return;

    console.log(`Flushing ${queue.length} queued offline requests`);
    const remaining: QueuedRequest[] = [];

    for (const req of queue) {
      try {
        if (req.type === 'fare-estimate') {
          // Re-attempt fare request/estimate
          await api.requestTrip(req.payload);
        }
      } catch (error) {
        req.attempts++;
        // If we failed and under max attempts (e.g. 5), keep it in the queue for next retry
        if (req.attempts < 5) {
          remaining.push(req);
        }
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  }
}
