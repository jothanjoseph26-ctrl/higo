import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EarningEntry, GetEarningsSummaryResponse } from '@higo/shared-types';
import { api } from '../services/api';

const EARNINGS_CACHE_KEY = '@higo/driver/earnings_summary';

interface EarningsState {
  summary: GetEarningsSummaryResponse | null;
  history: EarningEntry[];
  isLoading: boolean;
  error: string | null;

  fetchSummary: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  withdrawEarnings: (amountKobo: number) => Promise<void>;
}

export const useEarningsStore = create<EarningsState>((set) => ({
  summary: null,
  history: [],
  isLoading: false,
  error: null,

  async fetchSummary() {
    set({ isLoading: true, error: null });
    try {
      const cacheRaw = await AsyncStorage.getItem(EARNINGS_CACHE_KEY);
      if (cacheRaw) {
        set({ summary: JSON.parse(cacheRaw) as GetEarningsSummaryResponse });
      }

      const response = await api.request<GetEarningsSummaryResponse>({
        method: 'GET',
        url: '/payments/earnings/summary',
        params: { date: 'today' },
      });

      await AsyncStorage.setItem(EARNINGS_CACHE_KEY, JSON.stringify(response));
      set({ summary: response });
    } catch (err: unknown) {
      console.error('Failed to fetch earnings summary:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to load earnings summary',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  async fetchHistory() {
    set({ isLoading: true, error: null });
    try {
      const response = await api.request<{ items: EarningEntry[] }>({
        method: 'GET',
        url: '/payments/earnings',
        params: { limit: 20 },
      });
      set({ history: response.items || [] });
    } catch (err: unknown) {
      console.error('Failed to fetch history:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to load history',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  async withdrawEarnings(amountKobo) {
    set({ isLoading: true, error: null });
    try {
      await api.request({
        method: 'POST',
        url: '/payments/withdraw',
        data: { amount: amountKobo },
      });
    } catch (err: unknown) {
      console.error('Withdrawal failed:', err);
      set({
        error: err instanceof Error ? err.message : 'Withdrawal failed',
      });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
}));