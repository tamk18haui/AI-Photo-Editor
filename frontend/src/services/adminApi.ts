import axios from 'axios';
import type { NavigateFunction } from 'react-router-dom';
import { apiClient } from './apiClient';

export type AccountRole = 'USER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'BLOCKED';
export type SubscriptionPlan = 'FREE' | 'PREMIUM';
export interface AdminMe { id: number; email: string; displayName: string | null; role: AccountRole }
export interface AdminUser {
  id: number; email: string; displayName: string | null; role: AccountRole;
  status: AccountStatus; plan: SubscriptionPlan; premiumUntil: string | null;
  createdAt: string; lastLoginAt: string | null; projectsCount: number; aiJobsCount: number;
}
export interface AdminPage<T> { items: T[]; page: number; size: number; totalElements: number; totalPages: number }
export interface DayMetric { day: string; requests: number; activeUsers: number; signups: number }
export interface AdminDashboard {
  usersTotal: number; usersActive: number; usersBlocked: number; admins: number; premiumActive: number;
  newUsers7d: number; projectsTotal: number; assetsTotal: number; totalStorageBytes: number;
  aiJobsTotal: number; aiJobsCompleted: number; editSaves7d: number;
  apiRequestsToday: number; apiRequests7d: number; activeUsers7d: number; trend: DayMetric[];
}
export interface AdminAudit {
  id: number; actorUserId: number; actorEmail: string; targetUserId: number;
  targetEmail: string; action: string; detail: string | null; createdAt: string;
}
export const adminApi = {
  me: async () => (await apiClient.get<AdminMe>('/admin/me')).data,
  dashboard: async () => (await apiClient.get<AdminDashboard>('/admin/dashboard')).data,
  users: async (params: { page:number; size:number; search?:string; role?:string; status?:string; plan?:string }) =>
    (await apiClient.get<AdminPage<AdminUser>>('/admin/users', { params })).data,
  user: async (id: number) => (await apiClient.get<AdminUser>(`/admin/users/${id}`)).data,
  setRole: async (id:number, role:AccountRole) =>
    (await apiClient.patch<AdminUser>(`/admin/users/${id}/role`, { role })).data,
  setStatus: async (id:number, status:AccountStatus) =>
    (await apiClient.patch<AdminUser>(`/admin/users/${id}/status`, { status })).data,
  setPlan: async (id:number, plan:SubscriptionPlan, premiumUntil:string|null) =>
    (await apiClient.patch<AdminUser>(`/admin/users/${id}/plan`, { plan, premiumUntil })).data,
  audit: async (page:number) =>
    (await apiClient.get<AdminPage<AdminAudit>>('/admin/audit', {params:{page,size:15}})).data,
};

/** Reuse the existing Login page. A 403 is a normal USER account, not a login failure. */
export async function adminLanding(navigate: NavigateFunction): Promise<void> {
  try {
    await adminApi.me();
    navigate('/admin', { replace:true });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      navigate('/login', { replace:true });
    } else {
      navigate('/projects', { replace:true });
    }
  }
}
