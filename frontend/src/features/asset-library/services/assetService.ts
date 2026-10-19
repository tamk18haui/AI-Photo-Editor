
export type AssetType =
  | 'ORIGINAL'
  | 'IMAGE'
  | 'MASK'
  | 'STICKER'
  | 'AI_OUTPUT'
  | 'THUMBNAIL'
  | 'EXPORT';

export interface Asset {
  assetId: number;
  projectId: number;
  url: string;
  assetType: AssetType;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  originalFileName?: string | null;
  width?: number | null;
  height?: number | null;
}


import { apiClient } from '../../../services/apiClient';

export async function getProjectAssets(
  projectId: number,
  assetType?: AssetType,
): Promise<Asset[]> {
  const response = await apiClient.get<Asset[]>(
    `/projects/${projectId}/assets`,
    {
      params: assetType ? { assetType } : undefined,
    },
  );

  return response.data;
}


export async function uploadProjectAsset(
  projectId: number,
  file: File,
  assetType: AssetType = 'IMAGE',
): Promise<Asset> {
  const formData = new FormData();

  formData.append('file', file);
  formData.append('assetType', assetType);

  const response = await apiClient.post<Asset>(
    `/projects/${projectId}/assets`,
    formData,
  );

  return response.data;
}
