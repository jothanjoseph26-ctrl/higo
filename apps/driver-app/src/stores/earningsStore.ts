import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

const EARNINGS_CACHE_KEY = '@higo/driver/earnings_summary';

export interface EarningsDaily {
  date: string;
  amount: number; // in kobo
}

export interface EarningsSummary {
  summary: string; // Pidgin voice summary
  totals: number; // in kobo
  daily: EarningsDaily[];
}

interface EarningsState {
  summary: EarningsSummary | null;
  history: any[] | null;
  isLoading: boolean;
  error: string | null;

  fetchSummary: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  withdrawEarnings: (amountKobo: number) => Promise<void>;
}

export const useEarningsStore = create<EarningsState>((set) => ({
  summary: null,
  history: null,
  isLoading: false,
  error: null,

  async fetchSummary() {
    set({ isLoading: true, error: null });
    try {
      // Load cache first in case of offline / 3G slow load
      const cacheRaw = await AsyncStorage.getItem(EARNINGS_CACHE_KEY);
      if (cacheRaw) {
        set({ summary: JSON.parse(cacheRaw) });
      }

      const response = await api.request<EarningsSummary>({
        method: 'GET',
        url: '/payments/earnings/summary',
        params: { date: 'today' },
      });

      await AsyncStorage.setItem(EARNINGS_CACHE_KEY, JSON.stringify(response));
      set({ summary: response });
    } catch (err: any) {
      console.error('Failed to fetch earnings summary:', err);
      // If we failed but have cached data, don't clear it
      set({ error: err.message || 'Failed to load earnings summary' });
    } finally {
      set({ isLoading: false });
    }
  },

  async fetchHistory() {
    set({ isLoading: true, error: null });
    try {
      const response = await api.request<{ earnings: any[] }>({
        method: 'GET',
        url: '/payments/earnings',
      });
      // Handle response correctly
      const earningsList = Array.isArray(response) ? response : response.earnings || [];
      set({ history: earningsList });
    } catch (err: any) {
      console.error('Failed to fetch history:', err);
      set({ error: err.message || 'Failed to load history' });
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
    } catch (err: any) {
      console.error('Withdrawal failed:', err);
      set({ error: err.message || 'Withdrawal failed' });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
}));
