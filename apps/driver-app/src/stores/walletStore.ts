import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  WalletBalance,
  DriverLedgerEntry,
  CashSettlementRecord,
} from '@higo/shared-types';
import { api } from '../services/api';

const WALLET_CACHE_KEY = '@higo/driver/wallet_balance';

interface WalletState {
  balance: WalletBalance | null;
  ledger: DriverLedgerEntry[];
  settlementHistory: CashSettlementRecord[];
  canAcceptCash: { allowed: boolean; reason?: string } | null;
  isLoading: boolean;
  error: string | null;

  fetchBalance: () => Promise<void>;
  fetchLedger: (page?: number) => Promise<void>;
  fetchSettlementHistory: () => Promise<void>;
  checkCashEligibility: () => Promise<void>;
  settleCommission: (amount: number, method: string) => Promise<any>;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: null,
  ledger: [],
  settlementHistory: [],
  canAcceptCash: null,
  isLoading: false,
  error: null,

  async fetchBalance() {
    set({ isLoading: true, error: null });
    try {
      // Try cache first
      const cacheRaw = await AsyncStorage.getItem(WALLET_CACHE_KEY);
      if (cacheRaw) {
        set({ balance: JSON.parse(cacheRaw) as WalletBalance });
      }

      const response = await api.request<WalletBalance>({
        method: 'GET',
        url: '/payments/wallet',
      });

      await AsyncStorage.setItem(WALLET_CACHE_KEY, JSON.stringify(response));
      set({ balance: response });
    } catch (err: unknown) {
      console.error('Failed to fetch wallet balance:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to load wallet balance',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  async fetchLedger(page = 1) {
    set({ isLoading: true, error: null });
    try {
      const response = await api.request<{ items: DriverLedgerEntry[] }>({
        method: 'GET',
        url: '/payments/wallet/ledger',
        params: { limit: 20, cursor: undefined },
      });
      set({ ledger: response.items || [] });
    } catch (err: unknown) {
      console.error('Failed to fetch ledger:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to load ledger',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  async fetchSettlementHistory() {
    set({ isLoading: true, error: null });
    try {
      const response = await api.request<{ items: CashSettlementRecord[] }>({
        method: 'GET',
        url: '/payments/wallet/settlement-history',
        params: { limit: 20 },
      });
      set({ settlementHistory: response.items || [] });
    } catch (err: unknown) {
      console.error('Failed to fetch settlement history:', err);
      set({
        error: err instanceof Error ? err.message : 'Failed to load settlement history',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  async checkCashEligibility() {
    try {
      const response = await api.request<{ allowed: boolean; reason?: string }>({
        method: 'GET',
        url: '/payments/wallet/can-accept-cash',
      });
      set({ canAcceptCash: response });
    } catch (err: unknown) {
      console.error('Failed to check cash eligibility:', err);
    }
  },

  async settleCommission(amount: number, method: string) {
    set({ isLoading: true, error: null });
    try {
      const response = await api.request({
        method: 'POST',
        url: '/payments/wallet/settle',
        data: { amount, method },
      });
      // Refresh balance after settlement
      await this.fetchBalance();
      await this.fetchSettlementHistory();
      return response;
    } catch (err: unknown) {
      console.error('Settlement failed:', err);
      set({
        error: err instanceof Error ? err.message : 'Settlement failed',
      });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },
}));
