
import axios from 'axios'

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

import { authSession } from './authSession';

apiClient.interceptors.request.use((config) => {
  const token = authSession.getAccessToken();

  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }

  return config;
});
