import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios';
import {
  ApiError,
  ApiResponse,
  GetKycStatusResponse,
  KycDocType,
  KycUploadResponse,
  LogoutRequest,
  LogoutResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  SendOtpRequest,
  SendOtpResponse,
  VerifyOtpRequest,
  VerifyOtpResponse,
  RequestTripRequest,
  RequestTripResponse,
  GetTripStatusResponse,
  CancelTripRequest,
  CancelTripResponse,
  RateDriverRequest,
  RateResponse,
  GetMyTripsResponse,
  InitializePaymentRequest,
  InitializePaymentResponse,
  TripSosRequest,
  TripSosResponse,
  UpdateMyProfileRequest,
  UpdateMyProfileResponse,
  GetMyProfileResponse,
  PaginationQuery,
} from '@higo/shared-types';
import type { TokenStorage } from './token-storage';

export interface KycUploadFile {
  uri: string;
  name: string;
  type: string;
}

export interface HigoClientOptions {
  baseURL: string;
  tokenStorage: TokenStorage;
  /** Sent as x-client-platform; use 'mobile' so refresh token stays in body. */
  platform?: 'mobile' | 'web';
  onAuthFailure?: () => void;
}

export class HigoApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, string[]>;

  constructor(error: ApiError['error']) {
    super(error.message);
    this.name = 'HigoApiError';
    this.code = error.code;
    this.statusCode = error.statusCode;
    this.details = error.details;
  }
}

function unwrap<T>(payload: ApiResponse<T>): T {
  if (!payload.success) {
    throw new HigoApiError(payload.error);
  }
  return payload.data;
}

export class HigoClient {
  private readonly http: AxiosInstance;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(private readonly options: HigoClientOptions) {
    this.http = axios.create({
      baseURL: options.baseURL.replace(/\/$/, ''),
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'x-client-platform': options.platform ?? 'mobile',
      },
    });

    this.http.interceptors.request.use(async (config) => {
      const token = await options.tokenStorage.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.http.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiResponse<unknown>>) => {
        const original = error.config as
          | (InternalAxiosRequestConfig & { _retry?: boolean })
          | undefined;

        if (
          error.response?.status === 401 &&
          original &&
          !original._retry &&
          !original.url?.includes('/auth/refresh')
        ) {
          original._retry = true;
          const newToken = await this.refreshAccessToken();
          if (newToken) {
            original.headers.Authorization = `Bearer ${newToken}`;
            return this.http(original);
          }
          options.onAuthFailure?.();
        }

        if (error.response?.data && !error.response.data.success) {
          throw new HigoApiError(error.response.data.error);
        }

        throw error;
      },
    );
  }

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.http.request<ApiResponse<T>>(config);
    return unwrap(response.data);
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = await this.options.tokenStorage.getRefreshToken();
    if (!refreshToken) {
      return null;
    }

    try {
      const body: RefreshTokenRequest = { refreshToken };
      const response = await this.http.post<ApiResponse<RefreshTokenResponse>>(
        '/auth/refresh',
        body,
      );
      const data = unwrap(response.data);
      await this.options.tokenStorage.setAccessToken(data.accessToken);
      if (data.refreshToken) {
        await this.options.tokenStorage.setRefreshToken(data.refreshToken);
      }
      return data.accessToken;
    } catch {
      await this.options.tokenStorage.clear();
      return null;
    }
  }

  async sendOtp(dto: SendOtpRequest): Promise<SendOtpResponse> {
    return this.request<SendOtpResponse>({
      method: 'POST',
      url: '/auth/send-otp',
      data: dto,
    });
  }

  async verifyOtp(dto: VerifyOtpRequest): Promise<VerifyOtpResponse> {
    const data = await this.request<VerifyOtpResponse>({
      method: 'POST',
      url: '/auth/verify-otp',
      data: dto,
    });
    await this.options.tokenStorage.setAccessToken(data.accessToken);
    if (data.refreshToken) {
      await this.options.tokenStorage.setRefreshToken(data.refreshToken);
    }
    return data;
  }

  async logout(dto: LogoutRequest = {}): Promise<LogoutResponse> {
    try {
      return await this.request<LogoutResponse>({
        method: 'POST',
        url: '/auth/logout',
        data: dto,
      });
    } finally {
      await this.options.tokenStorage.clear();
    }
  }

  async getKycStatus(): Promise<GetKycStatusResponse> {
    return this.request<GetKycStatusResponse>({
      method: 'GET',
      url: '/kyc/status',
    });
  }

  async uploadKyc(
    docType: KycDocType,
    file: KycUploadFile,
  ): Promise<KycUploadResponse> {
    const form = new FormData();
    form.append('docType', docType);
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as unknown as Blob);

    return this.request<KycUploadResponse>({
      method: 'POST',
      url: '/kyc/upload',
      data: form,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  }

  async getProfile(): Promise<GetMyProfileResponse> {
    return this.request<GetMyProfileResponse>({
      method: 'GET',
      url: '/passengers/me',
    });
  }

  async updateProfile(dto: UpdateMyProfileRequest): Promise<UpdateMyProfileResponse> {
    return this.request<UpdateMyProfileResponse>({
      method: 'PATCH',
      url: '/passengers/me',
      data: dto,
    });
  }

  async requestTrip(dto: RequestTripRequest): Promise<RequestTripResponse> {
    return this.request<RequestTripResponse>({
      method: 'POST',
      url: '/trips/request',
      data: dto,
    });
  }

  async getTripStatus(tripId: string): Promise<GetTripStatusResponse> {
    return this.request<GetTripStatusResponse>({
      method: 'GET',
      url: `/trips/${tripId}/status`,
    });
  }

  async cancelTrip(tripId: string, dto: CancelTripRequest): Promise<CancelTripResponse> {
    return this.request<CancelTripResponse>({
      method: 'POST',
      url: `/trips/${tripId}/cancel`,
      data: dto,
    });
  }

  async rateDriver(tripId: string, dto: RateDriverRequest): Promise<RateResponse> {
    return this.request<RateResponse>({
      method: 'POST',
      url: `/trips/${tripId}/rate-driver`,
      data: dto,
    });
  }

  async getTripHistory(query?: PaginationQuery): Promise<GetMyTripsResponse> {
    return this.request<GetMyTripsResponse>({
      method: 'GET',
      url: '/passengers/me/trips',
      params: query,
    });
  }

  async initializePayment(dto: InitializePaymentRequest): Promise<InitializePaymentResponse> {
    return this.request<InitializePaymentResponse>({
      method: 'POST',
      url: '/payments/initialize',
      data: dto,
    });
  }

  async sendTripSos(tripId: string, dto: TripSosRequest): Promise<TripSosResponse> {
    return this.request<TripSosResponse>({
      method: 'POST',
      url: `/trips/${tripId}/sos`,
      data: dto,
    });
  }
}

export function createHigoClient(options: HigoClientOptions): HigoClient {
  return new HigoClient(options);
}
