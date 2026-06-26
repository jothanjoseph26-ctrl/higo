import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../stores/authStore';
import {
  AdminLoginRequest,
  AdminLoginResponse,
  DashboardOverviewResponse,
  AdminListDriversQuery,
  AdminListDriversResponse,
  SuspendDriverRequest,
  SuspendDriverResponse,
  ReinstateDriverResponse,
  AdminListPassengersQuery,
  AdminListPassengersResponse,
  GetLiveTripsResponse,
  AdminListDisputesQuery,
  AdminListDisputesResponse,
  ResolveDisputeRequest,
  ResolveDisputeResponse,
  FinancialReportQuery,
  FinancialReportResponse,
  UpdatePricingRequest,
  UpdatePricingResponse,
  CreateZoneRequest,
  UpdateZoneRequest,
  ZoneResponse,
  DeleteZoneResponse,
  BroadcastNotificationRequest,
  BroadcastNotificationResponse,
  GetNotificationsResponse,
  ReviewKycRequest,
  ReviewKycResponse,
  ApiResponse,
  PaginationQuery,
  AdminListPromosQuery,
  AdminListPromosResponse,
  CreatePromoRequest,
  PromoCode,
  UpdatePromoRequest,
  DeletePromoResponse,
  TransactionEntry,
  PaymentStatus,
  AdminGetWeeklyKpisResponse,
  AdminGetWeeklyKpisHistoryResponse,
} from '@higo/shared-types';

export interface RefundEligibleItem {
  tripId: string;
  paystackReference: string;
  totalFare: number;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  passengerId: string;
  passengerName: string | null;
  passengerPhone: string;
  tripStatus: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ProcessRefundRequest {
  reference: string;
  amount?: number;
  reason?: string;
}

export interface ProcessRefundResponse {
  tripId: string;
  reference: string;
  refundReference: string;
  amount: number;
  paymentStatus: PaymentStatus;
}

export interface AdminListTransactionsQuery extends PaginationQuery {
  type?: TransactionEntry['type'];
  status?: string;
}

export interface AdminListComplaintsQuery extends PaginationQuery {
  status?: string;
}

export interface PlatformSettings {
  googleMapsOriginRestriction: string;
  smsGatewayChannel: 'termii' | 'africastalking';
  fcmServerKey: string;
  maintenanceMode: boolean;
}

export type UpdatePlatformSettingsRequest = Partial<PlatformSettings>;

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'x-client-platform': 'web',
  },
});

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Global hook to override axios.create to enforce withCredentials: true
try {
  const originalCreate = axios.create;
  axios.create = function (config) {
    return originalCreate({
      ...config,
      withCredentials: true,
    });
  };
} catch (e) {
  // Ignore
}

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<any>) => {
    const originalRequest = error.config as any;
    if (!originalRequest) return Promise.reject(error);

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh') &&
      !originalRequest.url?.includes('/auth/login') &&
      !originalRequest.url?.includes('/auth/admin/login')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const response = await axios.post<ApiResponse<{ accessToken: string }>>(
          `${api.defaults.baseURL}/auth/refresh`,
          { refreshToken: 'cookie' }, // Mock body, backend reads httpOnly cookie
          {
            withCredentials: true,
            headers: {
              'x-client-platform': 'web',
            },
          }
        );
        const data = response.data;
        const accessToken = data.success ? data.data.accessToken : null;

        if (accessToken) {
          const currentAdmin = useAuthStore.getState().admin;
          if (currentAdmin) {
            useAuthStore.getState().setAuth(currentAdmin, accessToken);
          }
          processQueue(null, accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        } else {
          throw new Error('Refresh failed');
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().clearAuth();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response?.data && error.response.data.success === false) {
      return Promise.reject(error.response.data.error);
    }
    return Promise.reject(error);
  }
);

function unwrap<T>(res: { data: ApiResponse<T> }): T {
  if (!res.data.success) {
    throw new Error(res.data.error.message || 'API Error');
  }
  return res.data.data;
}

function offsetFromCursor(cursor?: string): number {
  if (!cursor) return 0;
  const parsed = Number.parseInt(cursor, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function toPaginatedResponse<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number
) {
  const nextOffset = offset + limit;
  return {
    items,
    pageInfo: {
      nextCursor: nextOffset < total ? String(nextOffset) : null,
      hasNextPage: nextOffset < total,
      count: items.length,
    },
  };
}

export const apiService = {
  async login(dto: AdminLoginRequest): Promise<AdminLoginResponse> {
    const res = await api.post<ApiResponse<{
      response?: { accessToken: string; accessTokenExpiresIn?: number };
      user?: AdminLoginResponse['admin'];
      admin?: AdminLoginResponse['admin'];
      accessToken?: string;
      accessTokenExpiresIn?: number;
    }>>('/auth/admin/login', dto);
    const data = unwrap(res);
    const accessToken = data.response?.accessToken ?? data.accessToken;
    const admin = data.user ?? data.admin;

    if (!accessToken || !admin) {
      throw new Error('Invalid login response from server');
    }

    return {
      accessToken,
      accessTokenExpiresIn: data.response?.accessTokenExpiresIn ?? data.accessTokenExpiresIn ?? 0,
      admin,
    };
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
    useAuthStore.getState().clearAuth();
  },

  async getDashboardOverview(): Promise<DashboardOverviewResponse> {
    const res = await api.get<ApiResponse<DashboardOverviewResponse>>('/admin/dashboard/overview');
    return unwrap(res);
  },

  async getWeeklyKpis(from?: string, to?: string): Promise<AdminGetWeeklyKpisResponse> {
    const res = await api.get<ApiResponse<AdminGetWeeklyKpisResponse>>('/admin/weekly-kpis', {
      params: { from, to },
    });
    return unwrap(res);
  },

  async getWeeklyKpisHistory(
    weeks = 12,
  ): Promise<AdminGetWeeklyKpisHistoryResponse> {
    const res = await api.get<ApiResponse<AdminGetWeeklyKpisHistoryResponse>>(
      '/admin/weekly-kpis/history',
      { params: { weeks } },
    );
    return unwrap(res);
  },

  async getDrivers(query: AdminListDriversQuery): Promise<AdminListDriversResponse> {
    const limit = query.limit ?? 10;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      drivers: AdminListDriversResponse['items'];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/drivers', {
      params: {
        limit,
        offset,
        kycStatus: query.kycStatus,
        isOnline: query.isOnline,
        isSuspended: query.isSuspended,
        search: query.search,
      },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.drivers, data.total, limit, offset);
  },

  async suspendDriver(driverId: string, reason: string): Promise<SuspendDriverResponse> {
    const res = await api.put<ApiResponse<SuspendDriverResponse>>(`/admin/drivers/${driverId}/suspend`, { reason });
    return unwrap(res);
  },

  async reinstateDriver(driverId: string): Promise<ReinstateDriverResponse> {
    const res = await api.put<ApiResponse<ReinstateDriverResponse>>(`/admin/drivers/${driverId}/reinstate`);
    return unwrap(res);
  },

  async getPassengers(query: AdminListPassengersQuery): Promise<AdminListPassengersResponse> {
    const limit = query.limit ?? 10;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      users: AdminListPassengersResponse['items'];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/users', {
      params: {
        limit,
        offset,
        search: query.search,
        isBlocked: query.isBlocked,
      },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.users, data.total, limit, offset);
  },

  async blockPassenger(passengerId: string): Promise<void> {
    await api.put(`/admin/users/${passengerId}/block`);
  },

  async unblockPassenger(passengerId: string): Promise<void> {
    await api.put(`/admin/users/${passengerId}/unblock`);
  },

  async getLiveTrips(): Promise<GetLiveTripsResponse> {
    const res = await api.get<ApiResponse<GetLiveTripsResponse>>('/admin/trips/live');
    return unwrap(res);
  },

  async getDisputes(query: AdminListDisputesQuery): Promise<AdminListDisputesResponse> {
    const limit = query.limit ?? 10;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      disputes: AdminListDisputesResponse['items'];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/disputes', {
      params: {
        limit,
        offset,
        status: query.status,
      },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.disputes, data.total, limit, offset);
  },

  async resolveDispute(disputeId: string, dto: ResolveDisputeRequest): Promise<ResolveDisputeResponse> {
    const res = await api.put<ApiResponse<ResolveDisputeResponse>>(`/admin/disputes/${disputeId}`, dto);
    return unwrap(res);
  },

  async getFinancialReport(query: FinancialReportQuery): Promise<FinancialReportResponse> {
    const res = await api.get<ApiResponse<FinancialReportResponse>>('/admin/financial/report', { params: query });
    return unwrap(res);
  },

  async updatePricing(dto: UpdatePricingRequest): Promise<UpdatePricingResponse> {
    const res = await api.put<ApiResponse<UpdatePricingResponse>>('/admin/pricing', dto);
    return unwrap(res);
  },

  async getZones(): Promise<ZoneResponse[]> {
    const res = await api.get<ApiResponse<ZoneResponse[]>>('/admin/zones');
    return unwrap(res);
  },

  async createZone(dto: CreateZoneRequest): Promise<ZoneResponse> {
    const res = await api.post<ApiResponse<ZoneResponse>>('/admin/zones', dto);
    return unwrap(res);
  },

  async updateZone(zoneId: string, dto: UpdateZoneRequest): Promise<ZoneResponse> {
    const res = await api.put<ApiResponse<ZoneResponse>>(`/admin/zones/${zoneId}`, dto);
    return unwrap(res);
  },

  async deleteZone(zoneId: string): Promise<DeleteZoneResponse> {
    const res = await api.delete<ApiResponse<DeleteZoneResponse>>(`/admin/zones/${zoneId}`);
    return unwrap(res);
  },

  async broadcastNotification(dto: BroadcastNotificationRequest): Promise<BroadcastNotificationResponse> {
    const res = await api.post<ApiResponse<BroadcastNotificationResponse>>('/admin/notifications/broadcast', dto);
    return unwrap(res);
  },

  async getNotifications(query: PaginationQuery): Promise<GetNotificationsResponse> {
    const limit = query.limit ?? 10;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      notifications: GetNotificationsResponse['items'];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/notifications', {
      params: { limit, offset },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.notifications, data.total, limit, offset);
  },

  async reviewKyc(driverId: string, dto: ReviewKycRequest): Promise<ReviewKycResponse> {
    const res = await api.put<ApiResponse<ReviewKycResponse>>(`/kyc/${driverId}/review`, dto);
    return unwrap(res);
  },

  async getSettings(): Promise<PlatformSettings> {
    const res = await api.get<ApiResponse<PlatformSettings>>('/admin/settings');
    return unwrap(res);
  },

  async updateSettings(dto: UpdatePlatformSettingsRequest): Promise<PlatformSettings> {
    const res = await api.put<ApiResponse<PlatformSettings>>('/admin/settings', dto);
    return unwrap(res);
  },

  async getPromos(query: AdminListPromosQuery = {}): Promise<AdminListPromosResponse> {
    const limit = query.limit ?? 50;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      promos: PromoCode[];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/promos', { params: { limit, offset } });
    const data = unwrap(res);
    return toPaginatedResponse(data.promos, data.total, limit, offset);
  },

  async createPromo(dto: CreatePromoRequest): Promise<PromoCode> {
    const res = await api.post<ApiResponse<PromoCode>>('/admin/promos', dto);
    return unwrap(res);
  },

  async updatePromo(promoId: string, dto: UpdatePromoRequest): Promise<PromoCode> {
    const res = await api.put<ApiResponse<PromoCode>>(`/admin/promos/${promoId}`, dto);
    return unwrap(res);
  },

  async deletePromo(promoId: string): Promise<DeletePromoResponse> {
    const res = await api.delete<ApiResponse<DeletePromoResponse>>(`/admin/promos/${promoId}`);
    return unwrap(res);
  },

  async getTransactions(query: AdminListTransactionsQuery) {
    const limit = query.limit ?? 20;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      transactions: TransactionEntry[];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/finance/transactions', {
      params: {
        limit,
        offset,
        type: query.type,
        status: query.status,
      },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.transactions, data.total, limit, offset);
  },

  async getRefundEligible(query: PaginationQuery = {}) {
    const limit = query.limit ?? 15;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      items: RefundEligibleItem[];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/finance/refunds/eligible', {
      params: { limit, offset },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.items, data.total, limit, offset);
  },

  async processRefund(dto: ProcessRefundRequest): Promise<ProcessRefundResponse> {
    const res = await api.post<ApiResponse<ProcessRefundResponse>>('/admin/finance/refunds', dto);
    return unwrap(res);
  },

  async getComplaints(query: AdminListComplaintsQuery = {}) {
    const limit = query.limit ?? 10;
    const offset = offsetFromCursor(query.cursor);
    const res = await api.get<ApiResponse<{
      complaints: AdminListDisputesResponse['items'];
      total: number;
      limit: number;
      offset: number;
    }>>('/admin/finance/complaints', {
      params: {
        limit,
        offset,
        status: query.status || undefined,
      },
    });
    const data = unwrap(res);
    return toPaginatedResponse(data.complaints, data.total, limit, offset);
  },
};
