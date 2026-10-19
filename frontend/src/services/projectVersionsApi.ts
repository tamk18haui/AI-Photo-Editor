import { apiClient } from './apiClient';
export interface ProjectVersion { versionId:number; projectId:number; label:string|null; createdAt:string }
export const projectVersionsApi = {
  list: async(projectId:number):Promise<ProjectVersion[]> =>
    (await apiClient.get<ProjectVersion[]>(`/projects/${projectId}/versions`)).data,
  create: async(projectId:number,label:string):Promise<ProjectVersion> =>
    (await apiClient.post<ProjectVersion>(`/projects/${projectId}/versions`,{label:label||null})).data,
  restore: async(projectId:number,versionId:number):Promise<unknown> =>
    (await apiClient.post(`/projects/${projectId}/versions/${versionId}/restore`)).data,
};
