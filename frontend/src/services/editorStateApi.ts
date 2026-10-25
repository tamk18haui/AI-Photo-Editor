import { apiClient } from './apiClient';

export type EditorDocument = Record<string, unknown>;
export interface ProjectInfo {
  id: number; name: string; ownerId: number; canvasWidth: number;
  canvasHeight: number; thumbnailUrl: string | null;
  createdAt: string; updatedAt: string;
}
export interface StateSaved {projectId:number; savedAt:string; stateVersion:number}
export const editorStateApi = {
  project: async (id:number): Promise<ProjectInfo> =>
    (await apiClient.get<ProjectInfo>(`/projects/${id}`)).data,
  load: async (id:number): Promise<EditorDocument> =>
    (await apiClient.get<EditorDocument>(`/projects/${id}/state`)).data,
  save: async (id:number, state:EditorDocument, expectedStateVersion?:number): Promise<StateSaved> =>
    (await apiClient.put<StateSaved>(`/projects/${id}/state`,state,{
      params:expectedStateVersion===undefined?undefined:{expectedStateVersion},
    })).data,
};
