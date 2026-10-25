import { useEffect, useRef, useState } from 'react';
import { localAiApi } from '../../services/localAiApi';
import type { LocalAiJob,LocalAiOperation,UpscaleMode } from '../../services/localAiApi';
import BeforeAfterCompare from './BeforeAfterCompare';
import './local-ai-panel.css';
const LABELS: Record<LocalAiOperation,string> = {upscale2:'Nâng cấp ảnh 2×',upscale4:'Nâng cấp ảnh 4×',removeBg:'Xóa nền trong suốt',denoise:'Khử nhiễu',enhance:'Tăng chất lượng ảnh',faceRestore:'Phục hồi khuôn mặt'};
export default function LocalAiPanel({operation,projectId,assetId,sourceUrl,disabled,onApply}:{
  operation:LocalAiOperation;projectId:number;assetId:number|null;sourceUrl:string|null;disabled:boolean;onApply:(job:LocalAiJob)=>Promise<void>
}) {
  const [job,setJob]=useState<LocalAiJob|null>(null);
  const [submitting,setSubmitting]=useState(false);
  const [applying,setApplying]=useState(false);
  const [error,setError]=useState('');
  const [startedAt,setStartedAt]=useState<number|null>(null);
  const [elapsed,setElapsed]=useState(0);
  const [upscaleMode,setUpscaleMode]=useState<UpscaleMode>('fast');
  const [compareSource,setCompareSource]=useState<string|null>(null);
  const [compareOpen,setCompareOpen]=useState(false);
  const shownCompareJob=useRef<number|null>(null);
  const jobId=job?.jobId;
  const jobStatus=job?.status;
  useEffect(()=>{
    if(!jobId || !jobStatus || !['QUEUED','RUNNING'].includes(jobStatus))return;
    let cancelled=false; let busy=false;
    const timer=window.setInterval(async()=>{
      if(busy || cancelled)return;busy=true;
      try {const latest=await localAiApi.job(jobId);if(!cancelled)setJob(latest);}
      catch {if(!cancelled)setError('Không đọc được tiến trình. Kiểm tra kết nối Backend.');}
      finally {busy=false;}
    },1800);
    return ()=>{cancelled=true;window.clearInterval(timer)};
  },[jobId,jobStatus]);
  useEffect(()=>{
    if(!startedAt || !jobStatus || !['QUEUED','RUNNING'].includes(jobStatus))return;
    const tick=()=>setElapsed(Math.floor((Date.now()-startedAt)/1000));tick();
    const timer=window.setInterval(tick,1000);return ()=>window.clearInterval(timer);
  },[startedAt,jobStatus]);
  useEffect(()=>{
    if(!job || job.status!=='COMPLETED' || !job.resultUrl || !compareSource
       || (operation!=='upscale2' && operation!=='upscale4')
       || shownCompareJob.current===job.jobId)return;
    shownCompareJob.current=job.jobId;
    setCompareOpen(true);
  },[job,compareSource,operation]);
  const run=async()=>{
    if(!assetId || disabled || submitting || applying)return;
    setSubmitting(true);setError('');setJob(null);setElapsed(0);setStartedAt(Date.now());
    setCompareOpen(false);setCompareSource(sourceUrl);
    try {const accepted=await localAiApi.start(operation,projectId,assetId,upscaleMode);setJob(await localAiApi.job(accepted.jobId));}
    catch(e){console.error('Local AI submit',e);setError('Không tạo được AI Job. Xem Network/Backend và AI Runner 8010.');}
    finally{setSubmitting(false)}
  };
  const apply=async()=>{
    if(!job || job.status!=='COMPLETED' || !job.resultAssetId)return;
    setApplying(true);setError('');
    try{await onApply(job);setCompareOpen(false)}
    catch(e){console.error('Local AI apply',e);setError(e instanceof Error?e.message:'Áp dụng AI thất bại. Chưa thay ảnh hiện tại.');}
    finally{setApplying(false)}
  };
  const working=!!job&&['QUEUED','RUNNING'].includes(job.status);
  const knownPercent=job&&typeof job.progress==='number'&&Number.isFinite(job.progress)&&job.progress>0?Math.max(0,Math.min(100,job.progress)):null;
  return <section className="n1-local-ai">
    <strong>Local AI · N4 — {LABELS[operation]}</strong>
    <p>Chỉ xử lý ảnh đã lưu lên Project. Gemini hoạt động độc lập.</p>
    {operation==='upscale4'&&<label>Chế độ nâng cấp ảnh
      <select value={upscaleMode} onChange={event=>setUpscaleMode(event.target.value as UpscaleMode)}
        disabled={submitting||applying||!!job&&['QUEUED','RUNNING'].includes(job.status)}>
        <option value="fast">⚡ Nhanh · Real-ESRGAN Compact x4</option>
        <option value="quality">✨ Chất lượng cao · RealESRGAN x4plus</option>
      </select>
      <small>{upscaleMode==='fast'
        ? 'Nhanh hơn trên CPU; cần checkpoint realesr-general-x4v3.pth. Vẫn là AI x4 thật.'
        : 'Dùng lại model x4plus hiện có; chạy rất lâu trên CPU với ảnh lớn.'}</small>
    </label>}
    <button type="button" disabled={!assetId||disabled||submitting||applying||working} onClick={()=>void run()}>{submitting?'Đang gửi...':`Chạy ${LABELS[operation]}`}</button>
    {!assetId&&<p className="n1-local-warning">Hãy tải ảnh gốc lên Project trước.</p>}
    {job&&<div className="n1-local-status" aria-live="polite">
      <b>Job #{job.jobId} · {job.status==='QUEUED'?'Đang xếp hàng':job.status==='RUNNING'?'Đang xử lý':job.status==='COMPLETED'?'Hoàn tất':job.status==='FAILED'?'Thất bại':job.status}</b>
      <small>{job.stage||'Chờ tín hiệu từ Backend'} {knownPercent!==null?`· ${knownPercent}%`:''}</small>
      {working ? <progress max={100} value={knownPercent===null?undefined:knownPercent} aria-label="Tiến độ AI từ Backend"/>
        : <progress max={100} value={job.status==='COMPLETED'?100:0}/>}
      {working&&<small>Đã chờ {Math.floor(elapsed/60)} phút {elapsed%60} giây. {knownPercent===null?'Backend chưa gửi tỷ lệ % thực; hiển thị đang chạy thay vì nhảy giả 0–100%.':''}</small>}
      {job.status==='FAILED'&&<p className="n1-local-warning">{job.errorCode||'AI_ERROR'}: {job.error||'Xử lý thất bại'}</p>}
      {job.status==='FAILED'&&job.errorCode==='MODEL_WEIGHTS_MISSING'&&
        <p className="n1-local-warning">Thiếu model nhanh. Tải realesr-general-x4v3.pth theo hướng dẫn trong ZIP hoặc chọn chế độ Chất lượng cao.</p>}
      {job.status==='COMPLETED'&&job.resultAssetId&&<>
        {job.resultUrl&&<img className="n1-local-preview" src={job.resultUrl} alt="Xem trước kết quả Local AI"/>}
        {(operation==='upscale2'||operation==='upscale4')&&compareSource&&job.resultUrl&&
          <button type="button" className="n1-local-compare-button" onClick={()=>setCompareOpen(true)}>
            Kéo thanh so sánh Trước / Sau
          </button>}
        <button type="button" onClick={()=>void apply()} disabled={applying||disabled}>{applying?'Đang lưu Layer...':'Áp dụng kết quả'}</button>
      </>}
    </div>}
    {error&&<p className="n1-local-warning" role="alert">{error}</p>}
    {compareOpen&&compareSource&&job?.status==='COMPLETED'&&job.resultUrl&&
      <BeforeAfterCompare beforeUrl={compareSource} afterUrl={job.resultUrl}
        isApplying={applying} onClose={()=>setCompareOpen(false)} onApply={()=>void apply()}/>}
  </section>;
}
