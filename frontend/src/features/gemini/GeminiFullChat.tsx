import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Image as ImageIcon, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { awaitJob, executeFrontendStep, geminiJobsApi } from './geminiJobsApi';
import { canApplyEditableCommands } from './editorToolAdapter';
import type { Job, Plan, Run, Step } from './geminiJobsApi';
import './gemini.css';

type Message = { id:number; role:'user'|'assistant'; text:string };
type PendingPlan = { plan:Plan; assetId:number; stateVersion:number };
type Props = { projectId:number; originalPreview:string; createSource:()=>Promise<Blob>;
               onPreviewEditorTools:(steps:Step[])=>Promise<Blob>;
               onApplyEditorTools:(steps:Step[],expectedStateVersion:number)=>Promise<void>;
               onFlushEditor:()=>Promise<void>;
               onApplied:()=>void; onClose:()=>void };

/** Uses N3 Project/Asset/History and N4's shared Job Core, without direct model credentials. */
export default function GeminiFullChat({projectId,originalPreview,createSource,onPreviewEditorTools,onApplyEditorTools,onFlushEditor,onApplied,onClose}:Props){
  const [mode,setMode]=useState<'command'|'create'>('command');
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [previewUrl,setPreviewUrl]=useState('');
  const basePreviewRef=useRef(originalPreview);
  const [resultJob,setResultJob]=useState<Job|null>(null);
  const [draftAssetId,setDraftAssetId]=useState<number|null>(null);
  const [plan,setPlan]=useState<PendingPlan|null>(null);
  const [pendingCreate,setPendingCreate]=useState<string|null>(null);
  const [pendingEditorPlan,setPendingEditorPlan]=useState<Plan|null>(null);
  const [costAcknowledged,setCostAcknowledged]=useState(false);
  const [stage,setStage]=useState('');
  const [activeJobId,setActiveJobId]=useState<number|null>(null);
  const activeRunRef=useRef<number|null>(null);
  const versionRef=useRef<number|null>(null);
  const abortRef=useRef<AbortController|null>(null);
  const localPreviewRef=useRef<string|null>(null);
  const scrollRef=useRef<HTMLDivElement>(null);
  const seq=useRef(0);
  useEffect(()=>{scrollRef.current?.scrollTo({top:scrollRef.current.scrollHeight,behavior:'smooth'});},[messages,busy,plan]);
  useEffect(()=>()=>{abortRef.current?.abort();if(localPreviewRef.current)URL.revokeObjectURL(localPreviewRef.current);},[]);
  useEffect(() => {
  let active = true;
  let snapshotUrl: string | null = null;

  const loadCurrentImage = async () => {
    try {
      const blob = await createSource();
      const url = URL.createObjectURL(blob);

      if (!active) {
        URL.revokeObjectURL(url);
        return;
      }

      snapshotUrl = url;
      basePreviewRef.current = url;
      setPreviewUrl(url);
    } catch (error) {
      console.error('Cannot render current editor image', error);

      if (active) {
        basePreviewRef.current = originalPreview;
        setPreviewUrl(originalPreview);
      }
    }
  };

  void loadCurrentImage();

  return () => {
    active = false;

    if (snapshotUrl) {
      URL.revokeObjectURL(snapshotUrl);
    }
  };
}, []);
  const say=(role:Message['role'],text:string)=>setMessages(list=>[...list,{id:++seq.current,role,text}]);
  const validateMixedSteps=(steps:Step[])=>{
    // These are real layer properties; once a local/remote AI operation has rasterized
    // the composition, setting them on a PNG would produce the wrong result.
    const unsupported=steps.find(step=>step.executor==='FRONTEND'&&(
      (step.tool==='SET_FRAME'&&!['simple','polaroid','gold','noir'].includes(String(step.arguments.frame)))||
      (step.tool==='SET_BACKGROUND'&&step.arguments.backgroundType==='transparent')));
    if(unsupported)throw new Error('Thao tác nền trong suốt/khung này chỉ hiển thị chính xác trên layer chỉnh sửa được. Hãy thực hiện lệnh đó riêng, sau đó chạy các công cụ AI khác.');
  };
  const prepare=async(needsImage:boolean)=>{
    await onFlushEditor();
    const current=await geminiJobsApi.context(projectId);
    if(versionRef.current!==null && current.stateVersion!==versionRef.current)
      throw new Error('Project đã thay đổi. Hãy tải lại Editor để tránh áp dụng lên bản cũ.');
    versionRef.current=current.stateVersion;
    if(!needsImage)return {assetId:null,version:current.stateVersion};
    if(draftAssetId)return {assetId:draftAssetId,version:current.stateVersion};
    const saved=await geminiJobsApi.upload(projectId,await createSource());
    return {assetId:saved.assetId,version:current.stateVersion};
  };
  const watch=async(jobId:number,signal:AbortSignal):Promise<Job>=>{
    setActiveJobId(jobId);
    const result=await awaitJob(jobId,job=>setStage(job.stage||job.status),signal);
    if(result.status!=='COMPLETED'||!result.resultAssetId||!result.resultUrl)
      throw new Error(result.error||`Tác vụ dừng: ${result.errorCode||result.status}`);
    return result;
  };
  const finishPreview=(result:Job)=>{
    setResultJob(result);setDraftAssetId(result.resultAssetId);setPreviewUrl(result.resultUrl||basePreviewRef.current);
    say('assistant','Đã có bản xem trước. Có thể chỉnh tiếp, chọn Áp dụng hoặc hủy mà không đổi ảnh đang lưu.');
  };

  async function runSteps(draft:PendingPlan,paidOperationConfirmed:boolean,signal:AbortSignal){
    let run:Run=await geminiJobsApi.execute(projectId,draft.assetId,draft.stateVersion,
      draft.plan,paidOperationConfirmed);
    activeRunRef.current=run.runId;
    try{
    if(signal.aborted)throw new Error('Đã dừng');
    for(let guard=0;guard<20&&run.status==='RUNNING';guard++){
      if(signal.aborted)throw new Error('Đã dừng');
      const step=run.nextStep;if(!step)break;
      setStage(`Bước ${step.order}/${run.totalSteps}: ${step.tool}`);
      if(step.executor==='FRONTEND'){
        const output=await executeFrontendStep(projectId,run.currentAssetId,step);
        run=await geminiJobsApi.advance(run.runId,step.order,output);
      }else{
        if(!run.pendingJobId)throw new Error('Kế hoạch thiếu Job cho bước AI');
        try{await watch(run.pendingJobId,signal);}
        catch(error){
          // Reconcile the parent Job on child failure; do not leave it RUNNING indefinitely.
          if(!signal.aborted)await geminiJobsApi.advance(run.runId,step.order).catch(()=>{});
          throw error;
        }
        run=await geminiJobsApi.advance(run.runId,step.order);
      }
    }
    if(run.status!=='COMPLETED')throw new Error(`Lệnh chưa hoàn tất (${run.stage})`);
    finishPreview(await geminiJobsApi.job(run.runId));
    }catch(error){
      await geminiJobsApi.cancelRun(run.runId).catch(()=>{});
      throw error;
    }finally{activeRunRef.current=null;}
  }

  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const prompt=input.trim();
    if(busy||plan||pendingCreate||pendingEditorPlan||!prompt||prompt.length>1500)return;
    setBusy(true);setError('');setInput('');say('user',prompt);
    const controller=new AbortController();abortRef.current=controller;
    try{
      const {assetId,version}=await prepare(mode!=='create');
      if(mode==='command'){
        if(!assetId)throw new Error('Chưa có ảnh để lập kế hoạch');
        setStage('Đang tìm công cụ phù hợp');
        const proposal=await geminiJobsApi.plan(projectId,assetId,version,prompt);
        const draft={plan:proposal.plan,assetId,stateVersion:version};
        const paid=proposal.plan.steps.some(step=>step.executor==='GEMINI_IMAGE');
        if(!canApplyEditableCommands(proposal.plan.steps))validateMixedSteps(proposal.plan.steps);
        if(paid){
          setCostAcknowledged(false);setPlan(draft);
          say('assistant','Các công cụ web/local chưa đủ cho toàn bộ yêu cầu. Có bước cần Gemini tạo/chỉnh ảnh và có thể phát sinh phí. Xem và xác nhận riêng nếu muốn tiếp tục.');
        }else if(canApplyEditableCommands(proposal.plan.steps)){
          if(resultJob)throw new Error('Hãy Áp dụng hoặc hủy ảnh xem trước hiện tại trước khi chỉnh các layer.');
          setStage('Đang tạo bản xem trước từ các layer thật');
          const preview=await onPreviewEditorTools(proposal.plan.steps);
          if(localPreviewRef.current)URL.revokeObjectURL(localPreviewRef.current);
          const objectUrl=URL.createObjectURL(preview);
          localPreviewRef.current=objectUrl;
          setPreviewUrl(objectUrl);
          setPendingEditorPlan(proposal.plan);
          say('assistant',`Đã xem trước ${proposal.plan.steps.length} thay đổi trên công cụ Editor. Bấm Áp dụng nếu muốn giữ các layer chỉnh sửa được và có Undo/Redo.`);
        }else{
          say('assistant',`Đã chọn ${proposal.plan.steps.length} công cụ web/local. Đang tự động thực hiện theo thứ tự.`);
          await runSteps(draft,false,controller.signal);
        }
      }else{
        setCostAcknowledged(false);setPendingCreate(prompt);
        say('assistant','Tạo ảnh mới cần Gemini Image và có thể phát sinh phí. Xác nhận riêng bên dưới nếu muốn tạo.');
      }
    }catch(err){setError(err instanceof Error?err.message:'Không thể thực hiện Gemini');setInput(prompt);}
    finally{setActiveJobId(null);setStage('');setBusy(false);abortRef.current=null;}
  }

  async function executePlan(){
    if(!plan||busy||!costAcknowledged)return;
    setBusy(true);setError('');const controller=new AbortController();abortRef.current=controller;
    try{
      const draft=plan;
      setPlan(null);
      setCostAcknowledged(false);
      await runSteps(draft,true,controller.signal);
    }catch(err){setError(err instanceof Error?err.message:'Không thể thực thi kế hoạch');}
    finally{setActiveJobId(null);setStage('');setBusy(false);abortRef.current=null;}
  }

  async function confirmCreate(){
    if(!pendingCreate||!costAcknowledged||busy)return;
    setBusy(true);setError('');const controller=new AbortController();abortRef.current=controller;
    try{
      const {version}=await prepare(false);
      const prompt=pendingCreate;
      setPendingCreate(null);setCostAcknowledged(false);setStage('Đang tạo ảnh với Gemini');
      const receipt=await geminiJobsApi.createText(projectId,prompt,version,true);
      finishPreview(await watch(receipt.jobId,controller.signal));
    }catch(err){setError(err instanceof Error?err.message:'Không thể tạo ảnh');}
    finally{setActiveJobId(null);setStage('');setBusy(false);abortRef.current=null;}
  }

  async function apply(){
    if((!resultJob&&!pendingEditorPlan)||versionRef.current===null||busy)return;
    setBusy(true);setError('');
    try{
      if(pendingEditorPlan){
        const context=await geminiJobsApi.context(projectId);
        if(context.stateVersion!==versionRef.current)throw new Error('Project đã thay đổi từ khi xem trước. Hãy tạo lại lệnh.');
        await onApplyEditorTools(pendingEditorPlan.steps,versionRef.current);
        setPendingEditorPlan(null);onClose();
      }else if(resultJob){
        await geminiJobsApi.apply(projectId,resultJob.jobId,versionRef.current);onApplied();
      }
    }
    catch(err){setError(err instanceof Error?err.message:'Không thể lưu vào History');setBusy(false);}
  }
  async function stop(){
    abortRef.current?.abort();
    const runId=activeRunRef.current;
    if(runId){await geminiJobsApi.cancelRun(runId).catch(()=>{});activeRunRef.current=null;}
    else if(activeJobId)await geminiJobsApi.cancel(activeJobId).catch(()=>{});
    setStage('Đã gửi yêu cầu dừng');
  }

  return <div className="n5-backdrop" role="presentation">
    <section className="n5-modal" role="dialog" aria-modal="true" aria-label="Gemini Chat chỉnh ảnh">
      <div className="n5-preview-pane">
        <header className="n5-pane-head"><span><ImageIcon size={18}/> Xem trước ảnh</span><button type="button" onClick={onClose} aria-label="Đóng" disabled={busy}><X size={19}/></button></header>
        <div className="n5-preview-stage">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Ảnh Editor hiện tại"
            />
          ) : (
            <span>Đang dựng ảnh từ các layer...</span>
      )}
    </div>
        <footer className="n5-preview-footer"><span>{pendingEditorPlan?'Bản xem trước · Layer chưa thay đổi':resultJob?'Đã lưu Asset · Chưa áp dụng':'Project vẫn nguyên trạng'}</span>
          <button className="n5-apply" type="button" disabled={(!resultJob&&!pendingEditorPlan)||busy} onClick={()=>void apply()}><Check size={17}/> Áp dụng vào Editor</button></footer>
      </div>
      <div className="n5-chat-pane">
        <header className="n5-chat-head"><span className="n5-avatar"><Sparkles size={21}/></span><span><strong>Chỉnh ảnh bằng câu lệnh</strong></span></header>
        <nav className="n5-modes" aria-label="Chế độ chỉnh ảnh">
          <button type="button" className={mode==='command'?'active':''} disabled={busy||!!plan||!!pendingCreate} onClick={()=>setMode('command')}>Lệnh thông minh</button>
          <button type="button" className={mode==='create'?'active':''} disabled={busy||!!plan||!!pendingCreate} onClick={()=>setMode('create')}>Tạo ảnh bằng AI (có phí)</button>
        </nav>
        <div className="n5-chat-scroll" ref={scrollRef} aria-live="polite">
          <div className="n5-welcome"><Sparkles size={26}/><strong>Bạn muốn chỉnh gì trên ảnh?</strong><p>Ví dụ: “Xoay phải 90 độ, tăng sáng 20% rồi làm nét x2”.</p></div>
          {messages.map(m=><div key={m.id} className={`n5-bubble n5-${m.role}`}>{m.text}</div>)}
          {plan&&<div className="n5-plan"><strong>Cần Gemini Image — có thể phát sinh phí</strong><p>Công cụ miễn phí được ưu tiên; chuỗi dưới đây chứa thao tác tạo/chỉnh ảnh bằng Gemini. Ảnh sẽ chưa được áp dụng cho tới khi bạn bấm Áp dụng.</p><ol>{plan.plan.steps.map(s=><li key={s.order}><b>{s.tool}</b> — {s.executor==='GEMINI_IMAGE'?'Gemini (có phí)':s.executor==='LOCAL_AI'?'AI local':'Công cụ web'}<small className="n5-plan-args">{JSON.stringify(s.arguments)}</small></li>)}</ol>
            <label className="n5-cost"><input type="checkbox" checked={costAcknowledged} onChange={event=>setCostAcknowledged(event.target.checked)} /> Tôi đồng ý dùng Gemini Image và hiểu có thể phát sinh phí API.</label>
            <div className="n5-plan-buttons"><button type="button" disabled={busy} onClick={()=>{setPlan(null);setCostAcknowledged(false);}}>Hủy</button><button type="button" disabled={busy||!costAcknowledged} onClick={()=>void executePlan()}>Xác nhận dùng Gemini</button></div></div>}
          {pendingCreate&&<div className="n5-plan"><strong>Xác nhận tạo ảnh bằng Gemini</strong><p>Lệnh: {pendingCreate}</p><p>Thao tác này gọi API tạo ảnh và có thể phát sinh phí.</p>
            <label className="n5-cost"><input type="checkbox" checked={costAcknowledged} onChange={event=>setCostAcknowledged(event.target.checked)} /> Tôi đồng ý dùng Gemini Image.</label>
            <div className="n5-plan-buttons"><button type="button" disabled={busy} onClick={()=>{setPendingCreate(null);setCostAcknowledged(false);}}>Hủy</button><button type="button" disabled={busy||!costAcknowledged} onClick={()=>void confirmCreate()}>Tạo ảnh</button></div></div>}
          {pendingEditorPlan&&<div className="n5-plan"><strong>Công cụ Editor đã tạo ảnh xem trước</strong><ol>{pendingEditorPlan.steps.map(s=><li key={s.order}><b>{s.tool}</b></li>)}</ol>
            <div className="n5-plan-buttons"><button type="button" disabled={busy} onClick={()=>{setPendingEditorPlan(null);setPreviewUrl(basePreviewRef.current);if(localPreviewRef.current)URL.revokeObjectURL(localPreviewRef.current);localPreviewRef.current=null;}}>Hủy bản xem trước</button><button type="button" disabled={busy} onClick={()=>void apply()}>Áp dụng và giữ layer</button></div></div>}
          {busy&&<div className="n5-wait"><LoaderCircle className="n5-spin" size={17}/>{stage||'Đang xử lý...'}</div>}
          {busy&&<button type="button" className="n5-stop" onClick={()=>void stop()}>Dừng xử lý</button>}
          {error&&<p className="n5-error" role="alert">{error}</p>}
        </div>
        <form className="n5-composer" onSubmit={send}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} maxLength={1500} rows={3} disabled={busy||!!plan||!!pendingCreate||!!pendingEditorPlan} placeholder={mode==='command'?'Ví dụ: Xóa nền rồi làm nét x2':'Mô tả ảnh cần tạo bằng Gemini...'} aria-label="Nhập lệnh chỉnh ảnh" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
          <div className="n5-composer-bottom"><small>{input.length}/1500 · Enter để gửi</small><button type="submit" disabled={busy||!!plan||!!pendingCreate||!!pendingEditorPlan||!input.trim()}><Send size={16}/> Thực hiện</button></div>
        </form>
      </div>
    </section>
  </div>;
}
