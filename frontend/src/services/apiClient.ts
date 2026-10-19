import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import type { AuthResponse } from './authApi';
import { authSession } from './authSession';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const PUBLIC_AUTH_ROUTES = new Set([
  '/auth/login', '/auth/register', '/auth/refresh', '/auth/google',
  '/auth/otp/request', '/auth/otp/reset',
  '/auth/forgot-password', '/auth/reset-password',
]);
const route = (url?: string) => (url ?? '').split('?')[0].replace(/\/+$/, '');

apiClient.interceptors.request.use(config => {
  // Public Auth requests must not receive an expired JWT.
  if (PUBLIC_AUTH_ROUTES.has(route(config.url))) {
    config.headers.delete('Authorization');
    return config;
  }
  const accessToken = authSession.getAccessToken();
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

// A rotating refresh token may be consumed only once. Share refresh across simultaneous 401s.
type RetryConfig = InternalAxiosRequestConfig & { _luminaRetried?: boolean };
let refreshInFlight: Promise<string | null> | null = null;
apiClient.interceptors.response.use(response => response, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
    return Promise.reject(error);
  }
  const original = error.config as RetryConfig;
  if (original._luminaRetried || PUBLIC_AUTH_ROUTES.has(route(original.url))) {
    return Promise.reject(error);
  }
  const refreshToken = authSession.getRefreshToken();
  if (!refreshToken) {
    authSession.clear();
    return Promise.reject(error);
  }
  original._luminaRetried = true;
  if (!refreshInFlight) {
    // Use the plain axios client to avoid recursive refresh/retry interceptors.
    refreshInFlight = axios.post<AuthResponse>('/api/auth/refresh', { refreshToken })
      .then(({ data }) => {
        if (!data.accessToken) throw new Error('Missing refreshed access token');
        authSession.save(data);
        return data.accessToken;
      })
      .catch(() => {
        authSession.clear();
        return null;
      })
      .finally(() => { refreshInFlight = null; });
  }
  const token = await refreshInFlight;
  if (!token) return Promise.reject(error);
  original.headers.set('Authorization', `Bearer ${token}`);
  return apiClient(original);
});
