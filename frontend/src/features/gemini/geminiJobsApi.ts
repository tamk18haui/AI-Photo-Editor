import { apiClient } from '../../services/apiClient';
import { assetApi } from '../../services/assetApi';
import { authSession } from '../../services/authSession';
import { FILTER_MAP } from '../../layouts/editor-presets';

export type JobStatus = 'QUEUED'|'RUNNING'|'COMPLETED'|'FAILED'|'CANCELLED';
export type Job = {
  jobId: number; projectId: number; status: JobStatus; stage: string|null;
  progress: number|null; resultAssetId: number|null; resultUrl: string|null;
  errorCode: string|null; error: string|null;
};
export type Step = {order:number;executor:'FRONTEND'|'LOCAL_AI'|'GEMINI_IMAGE';tool:string;arguments:Record<string,string|number>};
export type Plan = {steps:Step[]};
export type Run = {runId:number;status:JobStatus;completedSteps:number;totalSteps:number;stage:string;
  nextStep:Step|null;pendingJobId:number|null;currentAssetId:number;resultAssetId:number|null};

export const geminiJobsApi = {
  context: async(projectId:number):Promise<{projectId:number;stateVersion:number}> =>
    (await apiClient.get(`/ai/gemini/projects/${projectId}/context`)).data,
  upload: async(projectId:number,image:Blob)=>
    assetApi.upload(projectId,new File([image],'current-render.png',{type:'image/png'}),'IMAGE'),
  create: async(projectId:number,inputAssetId:number,prompt:string,baseStateVersion:number,
                paidOperationConfirmed:boolean)=>
    (await apiClient.post<{jobId:number}>(`/ai/gemini/operations`,{
      projectId,inputAssetId,prompt,operation:'GENERATIVE_EDIT',baseStateVersion,
      idempotencyKey:crypto.randomUUID(),paidOperationConfirmed,
    })).data,
  createText: async(projectId:number,prompt:string,baseStateVersion:number,
                    paidOperationConfirmed:boolean)=>
    (await apiClient.post<{jobId:number}>(`/ai/gemini/text-to-image`,{
      projectId,prompt,baseStateVersion,idempotencyKey:crypto.randomUUID(),paidOperationConfirmed,
    })).data,
  job: async(jobId:number):Promise<Job> => (await apiClient.get(`/ai/jobs/${jobId}`)).data,
  cancel: async(jobId:number) => (await apiClient.post(`/ai/jobs/${jobId}/cancel`)).data,
  apply: async(projectId:number,jobId:number,expectedStateVersion:number) =>
    (await apiClient.post(`/ai/gemini/jobs/${jobId}/apply`,{projectId,expectedStateVersion})).data,
  plan: async(projectId:number,inputAssetId:number,baseStateVersion:number,prompt:string):Promise<{plan:Plan;plannerSource:string}> =>
    (await apiClient.post('/natural-edit/plan',{projectId,inputAssetId,baseStateVersion,prompt})).data,
  execute: async(projectId:number,inputAssetId:number,baseStateVersion:number,plan:Plan,
                 paidOperationConfirmed:boolean):Promise<Run> =>
    (await apiClient.post('/natural-edit/execute',{projectId,inputAssetId,baseStateVersion,plan,confirmed:true,
      paidOperationConfirmed,idempotencyKey:crypto.randomUUID()})).data,
  advance: async(runId:number,expectedStep:number,completedAssetId?:number):Promise<Run> =>
    (await apiClient.post(`/natural-edit/runs/${runId}/advance`,{expectedStep,completedAssetId})).data,
  cancelRun: async(runId:number):Promise<Run> =>
    (await apiClient.post(`/natural-edit/runs/${runId}/cancel`)).data,
};

const terminal = (status:JobStatus) => ['COMPLETED','FAILED','CANCELLED'].includes(status);
const wait = (ms:number,signal:AbortSignal) => new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});
});

/** Fetch-based JWT SSE, falling back to authenticated Axios polling. */
export async function awaitJob(jobId:number,onChange:(job:Job)=>void,signal:AbortSignal):Promise<Job>{
  const token=authSession.getAccessToken();
  if(token){
    try{
      const response=await fetch(`/api/ai/jobs/${jobId}/events`,{headers:{Authorization:`Bearer ${token}`,'Accept':'text/event-stream'},signal});
      if(response.ok && response.body){
        const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='';
        while(true){
          const {value,done}=await reader.read();if(done)break;
          buffer+=decoder.decode(value,{stream:true});
          const events=buffer.split(/\r?\n\r?\n/);buffer=events.pop()||'';
          for(const event of events){
            const data=event.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('');
            if(!data)continue;
            const progress=JSON.parse(data) as Job;
            if(progress.status)onChange(progress);
            if(progress.status && terminal(progress.status)){
              await reader.cancel();return geminiJobsApi.job(jobId);
            }
          }
        }
      }
    }catch(error){if(signal.aborted)throw error;}
  }
  for(let attempt=0;attempt<90;attempt++){
    if(signal.aborted)throw new DOMException('Cancelled','AbortError');
    const result=await geminiJobsApi.job(jobId);
    onChange(result);
    if(terminal(result.status))return result;
    await wait(2000,signal);
  }
  throw new Error('Tác vụ xử lý quá lâu. Có thể mở lại Job để xem tiến độ.');
}

/** Browser-owned canvas actions in confirmed mixed plans produce a NEW persisted input asset. */
export async function executeFrontendStep(projectId:number,assetId:number,step:Step):Promise<number>{
  const asset=await assetApi.get(projectId,assetId);
  const input=new Image();input.crossOrigin='anonymous';
  await new Promise<void>((resolve,reject)=>{input.onload=()=>resolve();input.onerror=()=>reject(new Error('Không đọc được ảnh nguồn'));input.src=asset.url;});
  const args=step.arguments;
  const numeric=(key:string,fallback:number)=>{
    const value=Number(args[key]??fallback);if(!Number.isFinite(value))throw new Error(`Tham số ${key} không hợp lệ`);return value;
  };
  const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas không khả dụng');
  if(step.tool==='CROP'){
    const x=numeric('x',0),y=numeric('y',0),w=numeric('width',1),h=numeric('height',1);
    if(x<0||y<0||w<=0||h<=0||x+w>1||y+h>1)throw new Error('Crop phải dùng tọa độ tỷ lệ 0–1');
    canvas.width=Math.max(1,Math.round(input.naturalWidth*w));canvas.height=Math.max(1,Math.round(input.naturalHeight*h));
    ctx.drawImage(input,input.naturalWidth*x,input.naturalHeight*y,input.naturalWidth*w,input.naturalHeight*h,0,0,canvas.width,canvas.height);
  }else if(step.tool==='ROTATE'){
    const angle=numeric('angle',0);if(Math.abs(angle)>360)throw new Error('Góc xoay không hợp lệ');
    const rad=angle*Math.PI/180;const cos=Math.abs(Math.cos(rad)),sin=Math.abs(Math.sin(rad));
    canvas.width=Math.ceil(input.naturalWidth*cos+input.naturalHeight*sin);
    canvas.height=Math.ceil(input.naturalWidth*sin+input.naturalHeight*cos);
    ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rad);
    ctx.drawImage(input,-input.naturalWidth/2,-input.naturalHeight/2);
  }else if(step.tool==='ADJUST'){
    canvas.width=input.naturalWidth;canvas.height=input.naturalHeight;
    const brightness=numeric('brightness',100),lux=numeric('lux',100),highlights=numeric('highlights',100);
    ctx.filter=`brightness(${brightness*lux/10000*(1+(highlights-100)/285)}) contrast(${numeric('contrast',100)}%) saturate(${numeric('saturation',100)}%) hue-rotate(${numeric('temperature',0)/3}deg) blur(${numeric('blur',0)}px)`;
    ctx.drawImage(input,0,0);
  }else if(step.tool==='FLIP'){
    canvas.width=input.naturalWidth;canvas.height=input.naturalHeight;
    ctx.translate(canvas.width,0);ctx.scale(-1,1);
    ctx.drawImage(input,0,0);
  }else if(['ADD_TEXT','ADD_STICKER','ADD_SHAPE','SET_FILTER','SET_BACKGROUND','SET_FRAME'].includes(step.tool)){
    canvas.width=input.naturalWidth;canvas.height=input.naturalHeight;
    if(step.tool==='SET_BACKGROUND'&&args.backgroundType==='transparent')
      throw new Error('Ảnh đã kết xuất không thể xóa nền bằng CSS. Hãy dùng BiRefNet.');
    const color=String(args.color??'#ffffff');
    if(!/^#[0-9a-fA-F]{6}$/.test(color))throw new Error('Mã màu không hợp lệ');
    if(step.tool==='SET_BACKGROUND'&&args.backgroundType==='color'){
      ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);
    }
    if(step.tool==='SET_FILTER'){
      const preset=String(args.preset??'');
      if(!Object.prototype.hasOwnProperty.call(FILTER_MAP,preset))throw new Error('Bộ lọc chưa được hỗ trợ');
      ctx.filter=FILTER_MAP[preset];
    }
    ctx.drawImage(input,0,0);
    ctx.filter='none';
    if(step.tool==='ADD_TEXT'||step.tool==='ADD_STICKER'){
      const text=String(args.text??'');
      if(!text||text.length>400)throw new Error('Nội dung chữ hoặc sticker không hợp lệ');
      const size=numeric('fontSize',step.tool==='ADD_STICKER'?64:42);
      if(size<10||size>160)throw new Error('Kích cỡ chữ không hợp lệ');
      const font=String(args.fontFamily??'Arial').replace(/[^a-zA-Z0-9 ]/g,'').slice(0,60);
      ctx.font=`${step.tool==='ADD_TEXT'?'bold ':''}${Math.round(size*canvas.width/1024)}px "${font}", sans-serif`;
      ctx.textBaseline='top';ctx.fillStyle=color;
      const x=numeric('x',.12),y=numeric('y',.12),width=numeric('width',.65);
      ctx.fillText(text,x*canvas.width,y*canvas.height,Math.max(20,width*canvas.width));
    }else if(step.tool==='ADD_SHAPE'){
      const x=numeric('x',.12)*canvas.width,y=numeric('y',.12)*canvas.height;
      const width=numeric('width',.3)*canvas.width;
      ctx.strokeStyle=color;ctx.lineWidth=Math.max(2,canvas.width/512);
      const shape=String(args.shape??'');
      if(shape==='circle'||shape==='ellipse'){
        ctx.beginPath();ctx.ellipse(x+width/2,y+width/2,width/2,shape==='ellipse'?width/3:width/2,0,0,2*Math.PI);ctx.stroke();
      }else if(shape==='square'||shape==='rectangle')ctx.strokeRect(x,y,width,width);
      else throw new Error('Hình khối không được hỗ trợ');
    }else if(step.tool==='SET_FRAME'){
      const frame=String(args.frame??'');
      const border=Math.max(5,canvas.width*.025);
      if(frame==='none')throw new Error('Không thể xóa khung trên ảnh đã kết xuất; hãy dùng công cụ Editor.');
      else if(frame==='polaroid'){
        ctx.fillStyle='#fff';const thick=Math.round(canvas.width*.055);
        ctx.fillRect(0,0,canvas.width,thick);ctx.fillRect(0,0,thick,canvas.height);
        ctx.fillRect(canvas.width-thick,0,thick,canvas.height);
        ctx.fillRect(0,canvas.height-Math.round(canvas.width*.16),canvas.width,Math.round(canvas.width*.16));
      }else{
        const stroke=frame==='gold'?'#e4b75c':frame==='noir'?'#15151d':'#ffffff';
        ctx.strokeStyle=stroke;ctx.lineWidth=border;ctx.strokeRect(border/2,border/2,canvas.width-border,canvas.height-border);
      }
    }
  }else throw new Error('Công cụ Frontend không được hỗ trợ');
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Không thể kết xuất Canvas')),'image/png'));
  return (await geminiJobsApi.upload(projectId,blob)).assetId;
}
