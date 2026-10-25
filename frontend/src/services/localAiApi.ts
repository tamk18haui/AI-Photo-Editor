import { apiClient } from './apiClient';
export type LocalAiOperation='upscale2'|'upscale4'|'removeBg'|'denoise'|'enhance'|'faceRestore';
export type UpscaleMode='fast'|'quality';
export interface LocalAiJob {jobId:number; projectId:number; status:'QUEUED'|'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED'; progress:number|null;stage:string|null;resultAssetId:number|null;resultUrl:string|null;errorCode:string|null;error:string|null;}
export const localAiApi={
  start:async(operation:LocalAiOperation,projectId:number,assetId:number,upscaleMode:UpscaleMode='fast'):Promise<{jobId:number;status:string}>=>{
    const variants:Record<LocalAiOperation,[string,Record<string,unknown>] >={
      upscale2:['/ai/upscale',{scale:2}],
      upscale4:['/ai/upscale',{scale:4,model:upscaleMode,tileSize:upscaleMode==='fast'?256:128}],
      removeBg:['/ai/remove-background',{outputMode:'TRANSPARENT'}],
      denoise:['/ai/denoise',{strength:'MEDIUM'}],
      enhance:['/ai/auto-enhance',{mode:'AUTO',previewOnly:false}],
      faceRestore:['/ai/face-restore',{fidelity:0.7}],
    };
    const [path,extra]=variants[operation];
    return (await apiClient.post(path,{projectId,assetId,...extra})).data;
  },
  job:async(jobId:number):Promise<LocalAiJob>=> (await apiClient.get(`/ai/local/jobs/${jobId}`)).data,
  attach:async(projectId:number,jobId:number)=> (await apiClient.post(`/projects/${projectId}/layers/from-ai-job`,{jobId,name:`Local AI #${jobId}`,visible:true,opacity:1})).data,
};
