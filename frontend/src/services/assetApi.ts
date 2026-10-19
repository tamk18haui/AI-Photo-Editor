import { apiClient } from './apiClient';

export interface AssetResponse {
  assetId: number;
  projectId: number;
  url: string;
  assetType: 'ORIGINAL' | 'IMAGE' | 'MASK' | 'STICKER' | 'AI_OUTPUT' | 'THUMBNAIL' | 'EXPORT';
  originalFileName: string | null;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}
export const assetApi = {
  setProjectThumbnail: async (projectId: number, assetId: number): Promise<void> => {
    await apiClient.patch(`/projects/${projectId}`, {thumbnailAssetId: assetId});
  },
  get: async (projectId: number, assetId: number): Promise<AssetResponse> =>
    (await apiClient.get<AssetResponse>(`/projects/${projectId}/assets/${assetId}`)).data,
  upload: async (projectId: number, file: File, assetType: AssetResponse['assetType']='ORIGINAL'): Promise<AssetResponse> => {
    const form = new FormData();
    form.append('file', file);
    // Override axios instance's application/json default for multipart boundary handling.
    const response = await apiClient.post<AssetResponse>(
      `/projects/${projectId}/assets`,
      form,
      { params: {assetType}, headers: {'Content-Type': undefined} }
    );
    return response.data;
  }
};
