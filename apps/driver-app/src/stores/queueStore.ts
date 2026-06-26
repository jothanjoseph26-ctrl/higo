import { create } from 'zustand';
import {
  enqueueJob,
  loadQueue,
  processQueue,
  type JobType,
  type QueueJob,
} from '../services/jobQueue';

interface QueueState {
  jobs: QueueJob[];
  isSyncing: boolean;
  lastSyncAt: string | null;
  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
  add: (type: JobType, payload: Record<string, unknown>) => Promise<void>;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  jobs: [],
  isSyncing: false,
  lastSyncAt: null,

  async hydrate() {
    const jobs = await loadQueue();
    set({ jobs });
  },

  async refresh() {
    const jobs = await loadQueue();
    set({ jobs });
  },

  async syncNow() {
    if (get().isSyncing) return;
    set({ isSyncing: true });
    try {
      await processQueue();
      const jobs = await loadQueue();
      set({ jobs, lastSyncAt: new Date().toISOString() });
    } finally {
      set({ isSyncing: false });
    }
  },

  async add(type, payload) {
    const job = await enqueueJob(type, payload);
    set((s) => ({ jobs: [...s.jobs, job] }));
  },
}));