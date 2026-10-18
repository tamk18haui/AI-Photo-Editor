
import { apiClient } from './apiClient';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn?: number;
  tokenType: string;
  userId: number;
  displayName: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  displayName?: string;
}

export interface ApiError {
  timestamp: string;
  status: number;
  code: string;
  message: string;
  fieldErrors?: Record<string, string> | null;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      '/auth/login',
      data
    );
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      '/auth/register',
      data
    );
    return response.data;
  },

  refresh: async (refreshToken: string): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>(
      '/auth/refresh',
      { refreshToken }
    );
    return response.data;
  },
};
