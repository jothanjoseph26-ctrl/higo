import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSocket, connectSocket } from './socket';
import { api } from './api';

const QUEUE_KEY = 'job_queue';
const MAX_ATTEMPTS = 6;

export type JobType =
  | 'location_batch'
  | 'trip_accept'
  | 'trip_decline'
  | 'arrived'
  | 'trip_started'
  | 'trip_completed'
  | 'rating'
  | 'training_progress'
  | 'kyc_upload';

export interface QueueJob {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;
}

export async function loadQueue(): Promise<QueueJob[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueueJob[];
  } catch {
    return [];
  }
}

export async function saveQueue(jobs: QueueJob[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs));
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown>
): Promise<QueueJob> {
  const jobs = await loadQueue();
  const job: QueueJob = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type,
    payload,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  jobs.push(job);
  await saveQueue(jobs);
  
  // Try processing immediately
  void processQueue();
  
  return job;
}

async function processJob(job: QueueJob): Promise<void> {
  const socket = getSocket();

  switch (job.type) {
    case 'location_batch': {
      if (socket?.connected) {
        socket.emit('driver:location_update', job.payload as any);
      } else {
        await api.request({
          method: 'POST',
          url: '/drivers/location',
          data: job.payload,
        });
      }
      break;
    }
    case 'trip_accept': {
      const s = socket?.connected ? socket : await connectSocket();
      s.emit('driver:trip_accept', job.payload as any);
      break;
    }
    case 'trip_decline': {
      const s = socket?.connected ? socket : await connectSocket();
      s.emit('driver:trip_decline', job.payload as any);
      break;
    }
    case 'arrived': {
      const s = socket?.connected ? socket : await connectSocket();
      s.emit('driver:arrived_at_pickup', job.payload as any);
      break;
    }
    case 'trip_started': {
      const s = socket?.connected ? socket : await connectSocket();
      s.emit('driver:trip_started', job.payload as any);
      break;
    }
    case 'trip_completed': {
      const s = socket?.connected ? socket : await connectSocket();
      s.emit('driver:trip_completed', job.payload as any);
      break;
    }
    case 'rating': {
      const { tripId, rating, comment } = job.payload as {
        tripId: string;
        rating: number;
        comment?: string;
      };
      await api.request({
        method: 'POST',
        url: `/trips/${tripId}/rate-passenger`,
        data: { rating, comment },
      });
      break;
    }
    case 'training_progress': {
      await api.request({
        method: 'POST',
        url: '/drivers/training/progress',
        data: job.payload,
      });
      break;
    }
    case 'kyc_upload': {
      const { docType, file } = job.payload as { docType: any; file: any };
      await api.uploadKyc(docType, file);
      break;
    }
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

let isProcessing = false;

export async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    let jobs = await loadQueue();
    while (jobs.length > 0) {
      const job = jobs[0];
      try {
        await processJob(job);
        // Success: remove from queue
        jobs = jobs.filter((j) => j.id !== job.id);
        await saveQueue(jobs);
      } catch (err) {
        console.error(`Failed to process job ${job.id}:`, err);
        job.attempts += 1;
        
        if (job.attempts >= MAX_ATTEMPTS) {
          console.warn(`Job ${job.id} exceeded max attempts, sending to dead letter.`);
          jobs = jobs.filter((j) => j.id !== job.id);
          await saveQueue(jobs);
          
          const deadLettersRaw = await AsyncStorage.getItem('dead_letters');
          const deadLetters = deadLettersRaw ? JSON.parse(deadLettersRaw) : [];
          deadLetters.push(job);
          await AsyncStorage.setItem('dead_letters', JSON.stringify(deadLetters));
        } else {
          // Save updated attempts
          await saveQueue(jobs);
          // Exponential backoff wait: 2^attempts * 1000ms
          const backoffMs = Math.pow(2, job.attempts) * 1000;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          break; // Stop FIFO chain processing on failure
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

// Fallback interval processor (every 30 seconds)
setInterval(() => {
  void processQueue();
}, 30_000);