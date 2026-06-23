import { create } from 'zustand';
import { enqueueJob, loadQueue, type JobType, type QueueJob } from '../services/jobQueue';

interface QueueState {
  jobs: QueueJob[];
  hydrate: () => Promise<void>;
  add: (type: JobType, payload: Record<string, unknown>) => Promise<void>;
}

export const useQueueStore = create<QueueState>((set) => ({
  jobs: [],

  async hydrate() {
    const jobs = await loadQueue();
    set({ jobs });
  },

  async add(type, payload) {
    const job = await enqueueJob(type, payload);
    set((s) => ({ jobs: [...s.jobs, job] }));
  },
}));