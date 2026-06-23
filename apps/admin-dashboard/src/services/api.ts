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
  PaginationQuery
} from '@higo/shared-types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
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
      !originalRequest.url?.includes('/admin/auth/login')
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

export const apiService = {
  async login(dto: AdminLoginRequest): Promise<AdminLoginResponse> {
    const res = await api.post<ApiResponse<AdminLoginResponse>>('/admin/auth/login', dto);
    // fallback if admin endpoints are not set up on backend yet: try mock or direct auth
    return unwrap(res);
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
    useAuthStore.getState().clearAuth();
  },

  async getDashboardOverview(): Promise<DashboardOverviewResponse> {
    const res = await api.get<ApiResponse<DashboardOverviewResponse>>('/admin/dashboard/overview');
    return unwrap(res);
  },

  async getDrivers(query: AdminListDriversQuery): Promise<AdminListDriversResponse> {
    const res = await api.get<ApiResponse<AdminListDriversResponse>>('/admin/drivers', { params: query });
    return unwrap(res);
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
    const res = await api.get<ApiResponse<AdminListPassengersResponse>>('/admin/passengers', { params: query });
    return unwrap(res);
  },

  async getLiveTrips(): Promise<GetLiveTripsResponse> {
    const res = await api.get<ApiResponse<GetLiveTripsResponse>>('/admin/trips/live');
    return unwrap(res);
  },

  async getDisputes(query: AdminListDisputesQuery): Promise<AdminListDisputesResponse> {
    const res = await api.get<ApiResponse<AdminListDisputesResponse>>('/admin/disputes', { params: query });
    return unwrap(res);
  },

  async resolveDispute(disputeId: string, dto: ResolveDisputeRequest): Promise<ResolveDisputeResponse> {
    const res = await api.put<ApiResponse<ResolveDisputeResponse>>(`/admin/disputes/${disputeId}/resolve`, dto);
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
    // Assuming backend returns a list of zones
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
    const res = await api.get<ApiResponse<GetNotificationsResponse>>('/admin/notifications', { params: query });
    return unwrap(res);
  },

  async reviewKyc(driverId: string, dto: ReviewKycRequest): Promise<ReviewKycResponse> {
    const res = await api.put<ApiResponse<ReviewKycResponse>>(`/kyc/${driverId}/review`, dto);
    return unwrap(res);
  },
};
