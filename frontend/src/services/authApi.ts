import { apiClient } from './apiClient';

// Preserve N1's typed API contract; add Google linking and password reset.
export interface AuthResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn?: number;
  tokenType: string;
  userId: number;
  displayName: string | null;
}
export interface LoginRequest { email: string; password: string }
export interface RegisterRequest extends LoginRequest { displayName?: string }
export interface ApiError {
  timestamp: string; status: number; code: string; message: string;
  fieldErrors?: Record<string, string> | null;
}
export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> =>
    (await apiClient.post<AuthResponse>('/auth/login', data)).data,
  register: async (data: RegisterRequest): Promise<AuthResponse> =>
    (await apiClient.post<AuthResponse>('/auth/register', data)).data,
  refresh: async (refreshToken: string): Promise<AuthResponse> =>
    (await apiClient.post<AuthResponse>('/auth/refresh', { refreshToken })).data,
  google: async (credential: string): Promise<AuthResponse> =>
    (await apiClient.post<AuthResponse>('/auth/google', { credential })).data,
  linkGoogle: async (credential: string): Promise<void> => {
    await apiClient.post('/auth/google/link', { credential });
  },
  requestPasswordOtp: async (email: string): Promise<void> => {
    await apiClient.post('/auth/otp/request', { email });
  },
  resetPasswordOtp: async (email: string, code: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/otp/reset', { email, code, newPassword });
  },
  forgotPassword: async (email: string): Promise<void> => {
    await apiClient.post('/auth/forgot-password', { email });
  },
  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/reset-password', { token, newPassword });
  },
};
