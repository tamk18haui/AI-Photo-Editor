
import type { AuthResponse } from './authApi';

const ACCESS_KEY = 'lumina_access_token';
const REFRESH_KEY = 'lumina_refresh_token';

export const authSession = {
  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_KEY);
  },

  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_KEY);
  },

  save(auth: AuthResponse): void {
    sessionStorage.setItem(ACCESS_KEY, auth.accessToken);

    if (auth.refreshToken) {
      sessionStorage.setItem(REFRESH_KEY, auth.refreshToken);
    } else {
      sessionStorage.removeItem(REFRESH_KEY);
    }
  },

  clear(): void {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  },

  isLoggedIn(): boolean {
    return Boolean(this.getAccessToken());
  },
};
