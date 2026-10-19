import { apiClient } from './apiClient';

export interface Project {
  id: number;
  name: string;
  ownerId: number;
  canvasWidth: number;
  canvasHeight: number;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
export type ProjectSort = 'UPDATED_DESC' | 'UPDATED_ASC' | 'NAME_ASC' | 'NAME_DESC';
export interface ProjectPage {
  items: Project[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export interface CreateProject {
  name: string;
  canvasWidth?: number;
  canvasHeight?: number;
  background?: string;
}
export const projectApi = {
  list: async (params: {page: number; size: number; search?: string; sort: ProjectSort}): Promise<ProjectPage> =>
    (await apiClient.get<ProjectPage>('/projects', {params})).data,
  get: async (id: number): Promise<Project> =>
    (await apiClient.get<Project>(`/projects/${id}`)).data,
  create: async (body: CreateProject): Promise<Project> =>
    (await apiClient.post<Project>('/projects', body)).data,
  rename: async (id: number, name: string): Promise<Project> =>
    (await apiClient.patch<Project>(`/projects/${id}`, {name})).data,
  duplicate: async (id: number): Promise<Project> =>
    (await apiClient.post<Project>(`/projects/${id}/duplicate`, {})).data,
  remove: async (id: number): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },
};
