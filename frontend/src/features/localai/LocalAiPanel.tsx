import { useEffect, useState } from 'react';
import { localAiApi } from '../../services/localAiApi';
import type { LocalAiJob,LocalAiOperation } from '../../services/localAiApi';
import './local-ai-panel.css';
const LABELS: Record<LocalAiOperation,string> = {upscale2:'Nâng cấp ảnh 2×',upscale4:'Nâng cấp ảnh 4×',removeBg:'Xóa nền trong suốt',denoise:'Khử nhiễu',enhance:'Tăng chất lượng ảnh',faceRestore:'Phục hồi khuôn mặt'};
export default function LocalAiPanel({operation,projectId,assetId,disabled,onApply}:{
  operation:LocalAiOperation;projectId:number;assetId:number|null;disabled:boolean;onApply:(job:LocalAiJob)=>Promise<void>
}) {
  const [job,setJob]=useState<LocalAiJob|null>(null);
  const [submitting,setSubmitting]=useState(false);
  const [applying,setApplying]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    if(!job || !['QUEUED','RUNNING'].includes(job.status))return;
    let cancelled=false; let busy=false;
    const timer=window.setInterval(async()=>{
      if(busy || cancelled)return;busy=true;
      try {const latest=await localAiApi.job(job.jobId);if(!cancelled)setJob(latest);}
      catch {if(!cancelled)setError('Không đọc được tiến trình. Kiểm tra kết nối Backend.');}
      finally {busy=false;}
    },1800);
    return ()=>{cancelled=true;window.clearInterval(timer)};
  },[job?.jobId,job?.status]);
  const run=async()=>{
    if(!assetId || disabled || submitting || applying)return;
    setSubmitting(true);setError('');setJob(null);
    try {const accepted=await localAiApi.start(operation,projectId,assetId);setJob(await localAiApi.job(accepted.jobId));}
    catch(e){console.error('Local AI submit',e);setError('Không tạo được AI Job. Xem Network/Backend và AI Runner 8010.');}
    finally{setSubmitting(false)}
  };
  const apply=async()=>{
    if(!job || job.status!=='COMPLETED' || !job.resultAssetId)return;
    setApplying(true);setError('');
    try{await onApply(job)}catch(e){console.error('Local AI apply',e);setError('Áp dụng AI thất bại. Chưa thay ảnh hiện tại. Xem Network và log Backend.');setApplying(false)}
  };
  return <section className="n1-local-ai">
    <strong>Local AI · N4 — {LABELS[operation]}</strong>
    <p>Chỉ xử lý ảnh đã lưu lên Project. Gemini hoạt động độc lập.</p>
    <button type="button" disabled={!assetId||disabled||submitting||applying||!!job&&['QUEUED','RUNNING'].includes(job.status)} onClick={()=>void run()}>{submitting?'Đang gửi...':`Chạy ${LABELS[operation]}`}</button>
    {!assetId&&<p className="n1-local-warning">Hãy upload ảnh gốc trước. Ảnh Gemini chỉ xem trước không được sử dụng làm Asset.</p>}
    {job&&<div className="n1-local-status">
      <b>Job #{job.jobId} · {job.status}</b>
      <small>{job.stage||'Đang chờ xử lý'} · {job.progress??0}%</small>
      <progress max={100} value={Math.max(0,Math.min(100,job.progress??0))}/>
      {job.status==='FAILED'&&<p className="n1-local-warning">{job.errorCode||'AI_ERROR'}: {job.error||'Xử lý thất bại'}</p>}
      {job.status==='COMPLETED'&&job.resultAssetId&&<>
        {job.resultUrl&&<img className="n1-local-preview" src={job.resultUrl} alt="Xem trước kết quả Local AI"/>}
        <button type="button" onClick={()=>void apply()} disabled={applying||disabled}>{applying?'Đang lưu Layer...':'Áp dụng kết quả'}</button>
      </>}
    </div>}
    {error&&<p className="n1-local-warning" role="alert">{error}</p>}
  </section>;
}
