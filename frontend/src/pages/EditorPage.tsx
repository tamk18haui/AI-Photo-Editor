import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { editorStateApi } from '../services/editorStateApi';
import { projectVersionsApi } from '../services/projectVersionsApi';
import type { ProjectVersion } from '../services/projectVersionsApi';
import { assetApi } from '../services/assetApi';
import { authSession } from '../services/authSession';
import {
  ArrowLeft, Brush, ChevronLeft, ChevronRight,
  CircleHelp, Cloud, Crop, Download, Eraser, Expand,
  FlipHorizontal, FolderOpen, Grid2X2, Heart, Image as ImageIcon,
  ImagePlus, Layers3, LayoutTemplate, Move, Paintbrush, Palette,
  Redo2, RotateCcw, RotateCw, Save, SlidersHorizontal, History, BookmarkPlus,
  Sparkles, Sticker, Sun, Type, Undo2, WandSparkles, ZoomIn, ZoomOut,
} from 'lucide-react';
import GeminiChat from '../features/gemini/GeminiChat';
import LocalAiPanel from '../features/localai/LocalAiPanel';
import LayersWorkspace, { readComposition } from '../layouts/LayersWorkspace';
import { localAiApi } from '../services/localAiApi';
import type { LocalAiJob, LocalAiOperation } from '../services/localAiApi';
import './editor-modern.css';
import './editor-versions-n1.css';

import TextTool from '../features/editor/creative/text/TextTool';
import ShapeTool, { type ShapeType } from '../features/editor/creative/shapes/ShapeTool';
import StickerTool, { type StickerItem } from '../features/editor/creative/stickers/StickerTool';
type Category = 'template' | 'edit' | 'beauty' | 'design' | 'remove' | 'filters' | 'adjust' | 'effects' | 'background' | 'ai';
type ToolItem = { id: string; label: string; status?: 'soon'; icon?: typeof Sparkles };
type CategoryItem = { id: Category; label: string; icon: typeof Sparkles; children: ToolItem[] };

const categories: CategoryItem[] = [
  { id: 'template', label: 'Template', icon: LayoutTemplate, children: [
    {id:'social',label:'Mạng xã hội',status:'soon'},{id:'poster',label:'Poster',status:'soon'},{id:'banner',label:'Banner',status:'soon'},{id:'collage-template',label:'Bố cục mẫu',status:'soon'} ] },
  { id: 'edit', label: 'Chỉnh sửa', icon: Crop, children: [
    {id:'crop',label:'Cắt tỷ lệ',icon:Crop},{id:'rotate',label:'Xoay ảnh',icon:RotateCw},{id:'flip',label:'Lật ngang',icon:FlipHorizontal},
    {id:'light',label:'Ánh sáng',icon:Sun},{id:'n4-upscale2',label:'Nâng cấp AI 2×',icon:Sparkles},{id:'n4-upscale4',label:'Nâng cấp AI 4×',icon:Sparkles},{id:'n4-denoise',label:'Khử nhiễu AI',icon:WandSparkles},{id:'expand',label:'Mở rộng AI',icon:Expand,status:'soon'} ] },
  { id: 'beauty', label: 'Làm đẹp', icon: Heart, children: [
    {id:'n4-faceRestore',label:'Phục hồi khuôn mặt AI',icon:WandSparkles},{id:'beauty-auto',label:'Tự động',status:'soon'},{id:'face',label:'Chỉnh mặt',status:'soon'},{id:'slim',label:'Kéo thon',status:'soon'},
    {id:'lift',label:'Nâng cơ',status:'soon'},{id:'skin',label:'Chỉnh da',status:'soon'},{id:'body',label:'Chỉnh thể',status:'soon'},
    {id:'makeup',label:'Trang điểm',status:'soon'},{id:'brush',label:'Cọ',status:'soon'},{id:'skin-tone',label:'Tông da',status:'soon'},
    {id:'hair',label:'Chỉnh tóc',status:'soon'},{id:'beauty-ai',label:'Chỉnh bằng AI',status:'soon'} ] },
  { id:'design',label:'Thiết kế',icon:Layers3,children:[
    {id:'text',label:'Văn bản',icon:Type},
    {id:'sticker',label:'Nhãn / Sticker',icon:Sticker,status:'soon'},
    {id:'add-image',label:'Thêm ảnh',icon:ImagePlus,status:'soon'},
    {id:'photo-collage',label:'Ghép ảnh',icon:Grid2X2,status:'soon'},
    {id:'shape',label:'Hình khối'},
    {id:'drawing',label:'Vẽ tự do',icon:Brush,status:'soon'} ] },
  { id:'remove',label:'Xóa',icon:Eraser,children:[
    {id:'remove-object',label:'Xóa vật thể',status:'soon'},{id:'remove-manual',label:'Xóa thủ công',icon:Paintbrush,status:'soon'},
    {id:'remove-ai',label:'Xóa bằng AI',icon:WandSparkles,status:'soon'},{id:'n4-removeBg',label:'Xóa nền AI N4',icon:WandSparkles} ] },
  { id:'filters',label:'Bộ lọc',icon:Palette,children:[
    {id:'original',label:'Ảnh gốc'},{id:'bw',label:'Đen trắng'},{id:'vintage',label:'Vintage'},{id:'warm',label:'Ấm áp'},
    {id:'cool',label:'Lạnh'},{id:'vivid',label:'Rực rỡ'},{id:'soft',label:'Mềm mại'},{id:'dramatic',label:'Điện ảnh'} ] },
  { id:'adjust',label:'Điều chỉnh',icon:SlidersHorizontal,children:[
    {id:'auto',label:'Tự động'},{id:'n4-enhance',label:'Tăng chất lượng AI',icon:Sparkles},{id:'color',label:'Màu sắc'},{id:'lux',label:'Lux'},
    {id:'brightness',label:'Độ sáng'},{id:'contrast',label:'Tương phản'},{id:'highlights',label:'Độ chói'},
    {id:'saturation',label:'Bão hòa'},{id:'temperature',label:'Nhiệt độ màu'},{id:'blur',label:'Làm mờ'} ] },
  { id:'effects',label:'Hiệu ứng',icon:Sparkles,children:[
    {id:'glow',label:'Glow',status:'soon'},{id:'grain',label:'Hạt film',status:'soon'},
    {id:'blur-effect',label:'Làm mờ nghệ thuật',status:'soon'},{id:'light-leak',label:'Ánh sáng rò',status:'soon'} ] },
  { id:'background',label:'Nền',icon:ImageIcon,children:[
    {id:'bg-color',label:'Nền màu',status:'soon'},{id:'bg-image',label:'Nền hình ảnh',status:'soon'},
    {id:'bg-ai',label:'Đổi nền AI',status:'soon'},{id:'n4-removeBg',label:'Tách nền trong suốt',icon:WandSparkles} ] },
  { id:'ai',label:'Chỉnh theo AI',icon:WandSparkles,children:[
    {id:'prompt',label:'Chỉnh ảnh bằng câu lệnh',icon:WandSparkles} ] },
];

// Only verified N4 endpoints are directly selectable here. Mask-dependent operations remain pending N2 canvas integration.
const N4_TOOLS: Record<string, LocalAiOperation> = {
  'n4-upscale2':'upscale2', 'n4-upscale4':'upscale4',
  'n4-denoise':'denoise', 'n4-enhance':'enhance',
  'n4-faceRestore':'faceRestore', 'n4-removeBg':'removeBg',
};

const presets = [
  { id:'original',name:'Gốc',filter:'none' },
  { id:'bw',name:'Đen trắng',filter:'grayscale(1)' },
  { id:'vintage',name:'Vintage',filter:'sepia(.55) contrast(.92)' },
  { id:'warm',name:'Ấm áp',filter:'sepia(.28) saturate(1.14)' },
  { id:'cool',name:'Lạnh',filter:'hue-rotate(18deg) saturate(.92)' },
  { id:'vivid',name:'Rực rỡ',filter:'saturate(1.65) contrast(1.1)' },
  { id:'soft',name:'Mềm mại',filter:'contrast(.87) saturate(.85)' },
  { id:'dramatic',name:'Điện ảnh',filter:'contrast(1.32) saturate(.9)' },
] as const;

type Edits = { brightness:number; contrast:number; saturation:number; lux:number; highlights:number; temperature:number; blur:number; rotation:number; flipped:boolean; zoom:number; ratio:string; preset:string };
const initial: Edits = {brightness:100,contrast:100,saturation:100,lux:100,highlights:100,temperature:0,blur:0,rotation:0,flipped:false,zoom:100,ratio:'Tự do',preset:'original'};
const MAX_BYTES=20*1024*1024;

type PositionedItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};
export default function EditorPage(){
  const navigate=useNavigate();
  const {projectId: projectIdRaw}=useParams();
  const projectId=Number(projectIdRaw);
  const [projectName,setProjectName]=useState('Đang tải dự án...');
  const [projectReady,setProjectReady]=useState(false);
  const [projectState,setProjectState]=useState<Record<string, unknown>|null>(null);
  const [projectBusy,setProjectBusy]=useState(false);
  const [assetBusy,setAssetBusy]=useState(false);
  const [activeAssetId,setActiveAssetId]=useState<number|null>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [active,setActive]=useState<Category>('edit');
  const [selected,setSelected]=useState('crop');
  const [image,setImage]=useState<string|null>(null);
  const [layersOpen,setLayersOpen]=useState(true);
  const [canvasSize,setCanvasSize]=useState({width:1024,height:1024});
  const [geminiOpen, setGeminiOpen] = useState(false);
  const [fileName,setFileName]=useState('Chưa có ảnh');
  const [edits,setEdits]=useState<Edits>(initial);
  const [textItems, setTextItems] = useState<
    (PositionedItem & { text: string })[]
  >([]);

  const [shapeItems, setShapeItems] = useState<
    (PositionedItem & { shape: ShapeType })[]
  >([]);

  const [stickerItems, setStickerItems] = useState<
    (PositionedItem & { sticker: StickerItem })[]
  >([]);

  const [, setActiveObjectId] = useState<string | null>(null);
  const [past,setPast]=useState<Edits[]>([]);
  const [future,setFuture]=useState<Edits[]>([]);
  // N1_AUTOSAVE_V1: debounce, single-writer queue, and no blind overwrites.
  const [autosaveReady,setAutosaveReady]=useState(false);
  const [savePhase,setSavePhase]=useState<'idle'|'pending'|'saving'|'saved'|'error'>('idle');
  const lastSavedRef=useRef('');
  const saveQueueRef=useRef<Promise<void>>(Promise.resolve());
  const latestSaveRef=useRef<() => Promise<void>>(async()=>{});

  // N1_HISTORY_V1: preserve Undo/Redo stacks alongside edits in EditorState.

  const [status,setStatus]=useState('Sẵn sàng chỉnh sửa ảnh');
  const [isBusy,setBusy]=useState(false);
 
  // N1_VERSIONS_V1: manual checkpoints + explicit restore; no periodic snapshots.
  const [versionsOpen,setVersionsOpen]=useState(false);
  const [versions,setVersions]=useState<ProjectVersion[]>([]);
  const [versionsBusy,setVersionsBusy]=useState(false);
  const [versionsError,setVersionsError]=useState('');
  const [versionLabel,setVersionLabel]=useState('');
  const currentCategory=categories.find(x=>x.id===active)!;

  // N1_PROJECT_EDITOR_BRIDGE_V1 - preserve shared EditorState objects from N2/N3.
  useEffect(()=>{
    if (!authSession.isLoggedIn()) { navigate('/login',{replace:true}); return; }
    if (!Number.isSafeInteger(projectId) || projectId<1) {
      setStatus('Project ID không hợp lệ. Hãy mở dự án từ thư viện.');
      navigate('/projects',{replace:true});return;
    }
    let activeRequest=true;
    setProjectReady(false);
    setAutosaveReady(false);
    setProjectName('Đang tải dự án...');
    setImage(null);setFileName('Chưa có ảnh');setEdits(initial);setPast([]);setFuture([]);
    Promise.all([editorStateApi.project(projectId), editorStateApi.load(projectId)])
      .then(async ([meta,document])=>{
        if (!activeRequest) return;
        setProjectName(meta.name);
        setCanvasSize({width:Math.max(1,meta.canvasWidth||1024),height:Math.max(1,meta.canvasHeight||1024)});
        setProjectState(document);
        // N1_ASSET_CLOUDINARY_BRIDGE_V1
        const assetId=document.n1Editor && typeof document.n1Editor==='object'
          ? (document.n1Editor as Record<string,unknown>).activeAssetId : null;
        if(typeof assetId==='number' && Number.isSafeInteger(assetId) && assetId>0) {
          try {
            const asset=await assetApi.get(projectId,assetId);
            if (!activeRequest) return;
            setImage(asset.url);
            setFileName(asset.originalFileName||'Ảnh dự án');
            setActiveAssetId(asset.assetId);
            if (!meta.thumbnailUrl) {
              try { await assetApi.setProjectThumbnail(projectId,asset.assetId); }
              catch (err) { console.warn('Cannot backfill thumbnail',err); }
            }
          } catch {
            if (activeRequest) setStatus('Project đã tải nhưng ảnh lưu trước đó không khả dụng.');
          }
        } else setActiveAssetId(null);
        const stored=document.n1Editor;
        if(stored && typeof stored==='object' && !Array.isArray(stored)) {
          const d=stored as Record<string,unknown>;
          const e=d.edits;
          if(e && typeof e==='object' && !Array.isArray(e)) {
            const patch=e as Partial<Edits>;
            setEdits({...initial,...patch});
          }
          const readStack=(input:unknown):Edits[]=>Array.isArray(input)
            ? input.filter(x=>x && typeof x==='object' && !Array.isArray(x))
                .slice(-40).map(x=>({...initial,...(x as Partial<Edits>)})) : [];
          setPast(readStack(d.past));
          setFuture(readStack(d.future));
        }
        // Establish baseline from persisted data, so F5 does not write needlessly.
        const e0 = (stored && typeof stored==='object' && !Array.isArray(stored))
          ? stored as Record<string,unknown> : {};
        const normalize=(v:unknown):Edits[]=>Array.isArray(v)
          ? v.filter(x=>x && typeof x==='object' && !Array.isArray(x)).slice(-40)
             .map(x=>({...initial,...(x as Partial<Edits>)})) : [];
        const initialEdits={...initial,...(e0.edits && typeof e0.edits==='object' && !Array.isArray(e0.edits)
          ? e0.edits as Partial<Edits> : {})};
        lastSavedRef.current=JSON.stringify({edits:initialEdits,past:normalize(e0.past),future:normalize(e0.future),activeAssetId:typeof assetId==='number'?assetId:null});
        setStatus('Đã tải Project và trạng thái chỉnh sửa.');
        setProjectReady(true);
        setAutosaveReady(true);
      })
      .catch(()=>{
        if(activeRequest){setProjectReady(false);setStatus('Không tải được Project. Kiểm tra quyền truy cập hoặc Backend.');}
      });
    return ()=>{activeRequest=false;};
  },[projectId,navigate]);

  const saveToProject=async()=>{
    if(!projectReady || !autosaveReady || !projectState || assetBusy || !Number.isSafeInteger(projectId)) return;
    // Do not persist a local Gemini preview as if it were a durable project image.
    if(image?.startsWith('blob:') && activeAssetId===null) {
      setStatus('Ảnh Gemini đang ở bản xem trước, chưa upload lên Project; không thể tự lưu ảnh này.');
      return;
    }
    const snapshot={edits, past:past.slice(-40), future:future.slice(-40), activeAssetId};
    const fingerprint=JSON.stringify(snapshot);
    if(fingerprint===lastSavedRef.current) {setSavePhase('saved');return;}
    setSavePhase('saving');
    // Serial writes: one save cannot race the previous save.
    const doSave=async()=>{
      const latest=await editorStateApi.load(projectId);
      const previous=(latest.n1Editor && typeof latest.n1Editor==='object' && !Array.isArray(latest.n1Editor))
        ? latest.n1Editor as Record<string,unknown> : {};
      const updated={...latest,n1Editor:{...previous,...snapshot,updatedAt:new Date().toISOString()}};
      await editorStateApi.save(projectId,updated);
      setProjectState(updated);
      lastSavedRef.current=fingerprint;
    };
    const job=saveQueueRef.current.catch(()=>{}).then(doSave);
    saveQueueRef.current=job;
    try {
      setProjectBusy(true);
      await job;
      setSavePhase('saved');
      setStatus('Đã lưu thay đổi vào Project.');
    } catch(err) {
      console.error('N1 autosave failed',err);
      setSavePhase('error');
      setStatus('Lưu tự động thất bại. Nhấn Lưu Project để thử lại.');
    } finally {setProjectBusy(false);}
  };
  latestSaveRef.current=saveToProject;

  useEffect(()=>{
    if(!autosaveReady || !projectReady || assetBusy) return;
    if(image?.startsWith('blob:') && activeAssetId===null) return;
    const fingerprint=JSON.stringify({edits,past:past.slice(-40),future:future.slice(-40),activeAssetId});
    if(fingerprint===lastSavedRef.current) return;
    setSavePhase('pending');
    const timer=window.setTimeout(()=>{void latestSaveRef.current();},1800);
    return ()=>window.clearTimeout(timer);
  },[edits,past,future,activeAssetId,autosaveReady,projectReady,assetBusy,image]);

  useEffect(()=>()=>{if(image?.startsWith('blob:'))URL.revokeObjectURL(image)},[image]);
  const mutate=(patch:Partial<Edits>)=>{
    setEdits(prev=>{
      const next={...prev,...patch};
      if(JSON.stringify(prev)===JSON.stringify(next))return prev;
      setPast(items=>[...items.slice(-39),prev]);setFuture([]);
      return next;
    });
  };
  const undo=()=>{if(!past.length)return;const prev=past[past.length-1];setPast(x=>x.slice(0,-1));setFuture(x=>[...x,edits]);setEdits(prev);};
  const redo=()=>{if(!future.length)return;const next=future[future.length-1];setFuture(x=>x.slice(0,-1));setPast(x=>[...x,edits]);setEdits(next);};
  const loadFile=async(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setStatus('Chỉ hỗ trợ JPG, PNG, WebP');return;}
    if(file.size>MAX_BYTES){setStatus('Ảnh vượt quá 20MB');return;}
    if(!projectReady||assetBusy||projectBusy){setStatus('Hãy chờ Project tải xong trước khi thêm ảnh.');return;}
    setAssetBusy(true);setStatus('Đang tải ảnh lên Cloudinary...');
    try {
      // Upload FIRST; do not replace currently saved image on failure.
      const uploaded=await assetApi.upload(projectId,file,'ORIGINAL');
      // Persist the asset reference before replacing the visible image.
      const latest=await editorStateApi.load(projectId);
      const previous=(latest.n1Editor && typeof latest.n1Editor==='object' && !Array.isArray(latest.n1Editor))
        ? latest.n1Editor as Record<string,unknown> : {};
      const next={...latest,n1Editor:{...previous,edits:initial,activeAssetId:uploaded.assetId,updatedAt:new Date().toISOString()}};
      await editorStateApi.save(projectId,next);
      setProjectState(next);
      lastSavedRef.current=JSON.stringify({edits:initial,past:[],future:[],activeAssetId:uploaded.assetId});
      // N1_PROJECT_THUMBNAIL_V1
      let thumbnailUpdated = true;
      try { await assetApi.setProjectThumbnail(projectId,uploaded.assetId); }
      catch (err) { thumbnailUpdated=false; console.warn('Cannot set thumbnail',err); }
      setImage(uploaded.url);
      setActiveAssetId(uploaded.assetId);
      setFileName(uploaded.originalFileName||file.name);
      setEdits(initial);setPast([]);setFuture([]);
      setStatus(thumbnailUpdated?'Đã lưu ảnh và cập nhật ảnh bìa Project.':'Đã lưu ảnh nhưng cập nhật ảnh bìa thất bại. Kiểm tra Network.');
    } catch(err) {
      setStatus('Không thể lưu ảnh vào Project. Kiểm tra Cloudinary/API trên Network. Ảnh trước vẫn được giữ.');
      console.error('Asset upload/save failed',err);
    } finally {setAssetBusy(false);}
  };
  const adjustedFilter=()=>{
    const p=presets.find(p=>p.id===edits.preset)?.filter??'none';
    return `brightness(${edits.brightness*edits.lux/10000}) contrast(${edits.contrast}%) saturate(${edits.saturation}%) ${p==='none'?'':p} blur(${edits.blur}px)`;
  };
  const currentImageForGemini=async ():Promise<Blob>=>{
    if(!image)throw new Error('Hãy chọn ảnh trước.');
    return new Promise<Blob>((resolve,reject)=>{
      const img=new Image();
      img.crossOrigin='anonymous';
      img.onload=()=>{
        const sideways=Math.abs(edits.rotation/90)%2===1;
        const canvas=document.createElement('canvas');
        canvas.width=sideways?img.naturalHeight:img.naturalWidth;
        canvas.height=sideways?img.naturalWidth:img.naturalHeight;
        const context=canvas.getContext('2d');
        if(!context){reject(new Error('Không thể dựng ảnh'));return;}
        context.translate(canvas.width/2,canvas.height/2);
        context.rotate(edits.rotation*Math.PI/180);
        context.scale(edits.flipped?-1:1,1);
        context.filter=adjustedFilter();
        context.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Không thể xuất ảnh hiện tại')),'image/png');
      };
      img.onerror=()=>reject(new Error('Không tải được ảnh hiện tại'));
      img.src=image;
    });
  };
  const openVersions=async()=>{
    if(!projectReady || assetBusy || projectBusy) return;
    setVersionsOpen(true);setVersionsBusy(true);setVersionsError('');
    try {setVersions(await projectVersionsApi.list(projectId));}
    catch(err) {console.error('Versions list failed',err);setVersionsError('Không tải được các phiên bản. Kiểm tra API /versions.');}
    finally {setVersionsBusy(false);}
  };
  const createVersion=async()=>{
    if(!projectReady || assetBusy || projectBusy || versionsBusy) return;
    if(image?.startsWith('blob:') && activeAssetId===null){
      setVersionsError('Ảnh Gemini vẫn là bản xem trước. Hãy upload ảnh lên Project trước khi tạo mốc.');return;
    }
    setVersionsBusy(true);setVersionsError('');
    try {
      // A checkpoint must match persisted data, not unsaved screen changes.
      await latestSaveRef.current();
      await saveQueueRef.current;
      const expected=JSON.stringify({edits,past:past.slice(-40),future:future.slice(-40),activeAssetId});
      if(lastSavedRef.current!==expected) throw new Error('Save did not reach latest changes');
      await projectVersionsApi.create(projectId,versionLabel.trim().slice(0,150));
      setVersions(await projectVersionsApi.list(projectId));
      setVersionLabel('');setStatus('Đã tạo mốc phiên bản của Project.');
    } catch(err) {console.error('Create version failed',err);setVersionsError('Chưa thể lưu phiên bản. Kiểm tra kết nối và thử nhấn Lưu Project.');}
    finally {setVersionsBusy(false);}
  };
  const restoreVersion=async(v:ProjectVersion)=>{
    if(versionsBusy || projectBusy || assetBusy) return;
    if(!window.confirm(`Khôi phục phiên bản "${v.label||'Không đặt tên'}"?\n\nTrạng thái hiện tại sẽ được N3 lưu thành một mốc an toàn trước khi khôi phục. Các chỉnh sửa chưa được lưu có thể mất.`))return;
    setVersionsBusy(true);setVersionsError('');
    try {
      // Drain any in-flight autosave before restoring server state.
      setAutosaveReady(false);
      await saveQueueRef.current.catch(()=>{});
      await projectVersionsApi.restore(projectId,v.versionId);
      window.location.reload();
    } catch(err) {
      console.error('Restore version failed',err);
      setVersionsError('Khôi phục thất bại. Trạng thái hiện tại chưa được thay thế; hãy thử lại.');
      setAutosaveReady(true);setVersionsBusy(false);
    }
  };


  // N1_LOCAL_AI_BRIDGE_V1 - preserve N3 layers and persist N1 active image.
  const applyLocalAi=async(job:LocalAiJob)=>{
    if(!job.resultAssetId || job.status!=='COMPLETED' || job.projectId!==projectId)throw new Error('Invalid Local AI Job');
    setAutosaveReady(false);
    try {
      await saveQueueRef.current.catch(()=>{});
      await localAiApi.attach(projectId,job.jobId);
      const latest=await editorStateApi.load(projectId);
      const previous=latest.n1Editor && typeof latest.n1Editor==='object' && !Array.isArray(latest.n1Editor)
        ? latest.n1Editor as Record<string,unknown> : {};
      const resultAsset=await assetApi.get(projectId,job.resultAssetId);
      const existing=readComposition(latest);
      const base=existing.length?existing:(activeAssetId && image && !image.startsWith('blob:')
        ? [{id:`original-${activeAssetId}`,assetId:activeAssetId,url:image,name:fileName,
            visible:true,locked:false,opacity:100,x:0,y:0,width:100}]:[]);
      const newLayer={id:`ai-${job.jobId}-${job.resultAssetId}`,assetId:job.resultAssetId,
        url:resultAsset.url,name:resultAsset.originalFileName||`AI ${job.jobId}`,
        visible:true,locked:false,opacity:100,x:0,y:0,width:100};
      // Preserve N3 objects/history; only touch N1's separate composition slot.
      await editorStateApi.save(projectId,{...latest,n1Composition:{version:1,layers:[...base,newLayer]},
        n1Editor:{...previous,activeAssetId:job.resultAssetId,
        edits:initial,past:[],future:[],updatedAt:new Date().toISOString()}});
      try{await assetApi.setProjectThumbnail(projectId,job.resultAssetId)}
      catch(err){console.warn('Local AI thumbnail update failed',err)}
      window.location.reload();
    }catch(err){setAutosaveReady(true);throw err}
  };

  const saveTemporary=()=>{
    try{sessionStorage.setItem('lumina-editor-settings',JSON.stringify({edits, fileName, savedAt:new Date().toISOString()}));setStatus('Đã lưu tạm thiết lập chỉnh sửa trong phiên này; ảnh gốc chưa được lưu');}
    catch{setStatus('Không thể lưu tạm trong trình duyệt');}
  };
  const exportImage=()=>{
    if(!image){setStatus('Hãy chọn ảnh trước khi xuất');return;}
    setBusy(true);
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>{
      const sideways=Math.abs(edits.rotation/90)%2===1;
      const canvas=document.createElement('canvas');canvas.width=sideways?img.naturalHeight:img.naturalWidth;canvas.height=sideways?img.naturalWidth:img.naturalHeight;
      const context=canvas.getContext('2d');if(!context){setBusy(false);setStatus('Không tạo được ảnh xuất');return;}
      context.translate(canvas.width/2,canvas.height/2);context.rotate(edits.rotation*Math.PI/180);context.scale(edits.flipped?-1:1,1);context.filter=adjustedFilter();context.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
      canvas.toBlob(blob=>{setBusy(false);if(!blob){setStatus('Không thể xuất ảnh');return;}
        const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='lumina-edited.png';anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Đã xuất PNG về máy');},'image/png');
    };
    img.onerror=()=>{setBusy(false);setStatus('Không đọc được ảnh để xuất; kiểm tra Cloudinary CORS.');};img.src=image;
  };
  const handleTool=(id:string)=>{
    setSelected(id);
    if(N4_TOOLS[id])return;
    if(id==='prompt'){if(image)setGeminiOpen(true);else setStatus('Hãy mở một ảnh trước khi dùng Gemini');return;}
    if(id==='rotate')mutate({rotation:(edits.rotation+90)%360});
    if(id==='flip')mutate({flipped:!edits.flipped});
    if(id==='auto')mutate({brightness:108,contrast:108,saturation:110,lux:105});
    if(presets.some(p=>p.id===id))mutate({preset:id});
    if(currentCategory.children.find(x=>x.id===id)?.status==='soon')setStatus('Công cụ này đang chờ module AI / Creative của nhóm tích hợp');
  };
  const slider=(label:string,key:keyof Edits,min:number,max:number,unit='%')=>(
    <label className="lv3-slider" key={key}><span>{label}<b>{edits[key]}{unit}</b></span>
      <input type="range" min={min} max={max} value={Number(edits[key])} onChange={e=>mutate({[key]:Number(e.target.value)} as Partial<Edits>)} disabled={!image}/>
    </label>
  );
  const viewStyle:CSSProperties={filter:adjustedFilter(),transform:`rotate(${edits.rotation}deg) scaleX(${edits.flipped?-1:1}) scale(${edits.zoom/100})`};
  return <div className="lv3-root">
    <input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={loadFile}/>
    <aside className={`lv3-rail ${sidebarOpen?'':'lv3-rail-small'}`} aria-label="Các nhóm công cụ">
      <button className="lv3-rail-brand" title="Lumina Studio" onClick={()=>navigate('/')}><Sparkles size={26}/>{sidebarOpen&&<strong>LUMINA <small>STUDIO</small></strong>}</button>
      <button className="lv3-rail-collapse" onClick={()=>setSidebarOpen(v=>!v)} title={sidebarOpen?'Thu gọn':'Mở rộng'} aria-label={sidebarOpen?'Thu gọn thanh công cụ':'Mở rộng thanh công cụ'}>{sidebarOpen?<ChevronLeft size={18}/>:<ChevronRight size={18}/>}</button>
      <nav className="lv3-rail-scroll">{categories.map(c=>{const Icon=c.icon;return <button type="button" key={c.id} className={`lv3-rail-item ${active===c.id?'active':''}`} title={c.label} aria-label={c.label} onClick={()=>{setActive(c.id);setSelected(c.children[0]?.id||'');}}><Icon size={21}/>{sidebarOpen&&<span>{c.label}</span>}{active===c.id&&sidebarOpen&&<ChevronRight size={15} className="lv3-end"/>}</button>})}</nav>
      <div className="lv3-rail-bottom"><span title="Bản MVP"><CircleHelp size={17}/>{sidebarOpen&&'Hướng dẫn'}</span></div>
    </aside>
    <div className="lv3-main">
      <header className="lv3-topbar">
        <div className="lv3-top-left"><button className="lv3-icon-btn" title="Quay về thư viện" onClick={()=>navigate('/projects')}><ArrowLeft size={18}/></button><div className="lv3-project"><strong>{projectName}</strong><small>{fileName}</small></div><span className="lv3-draft-tag">Bản nháp</span></div>
        <div className="lv3-top-actions"><button type="button" onClick={()=>void openVersions()} disabled={!projectReady||projectBusy||assetBusy} title="Mốc phiên bản Project"><History size={18}/><span>Phiên bản</span></button><button onClick={undo} disabled={!past.length} title="Hoàn tác"><Undo2 size={18}/><span>Hoàn tác</span></button><button onClick={redo} disabled={!future.length} title="Làm lại"><Redo2 size={18}/><span>Làm lại</span></button><span className="lv3-split"/><button onClick={saveTemporary} title="Lưu tạm thiết lập phiên làm việc"><Save size={18}/><span>Lưu tạm</span></button><button onClick={()=>void saveToProject()} disabled={!projectReady||projectBusy||assetBusy} title="Lưu thông số Editor vào MySQL"><Cloud size={18}/><span>{projectBusy?'Đang lưu...':'Lưu Project'}</span></button><span title="Tự lưu sau 1,8 giây không thao tác" aria-live="polite" style={{fontSize:12,whiteSpace:'nowrap',color:savePhase==='error'?'#ba314e':'#796c95'}}>{savePhase==='pending'?'Chờ tự lưu…':savePhase==='saving'?'Đang lưu…':savePhase==='saved'?'Đã lưu ✓':savePhase==='error'?'Lưu lỗi!':'Tự lưu bật'}</span><button className="lv3-purple-button" onClick={exportImage} disabled={!image||isBusy}><Download size={18}/>Xuất ảnh</button></div>
      </header>
      <div className="lv3-body">
        <section className="lv3-toolbox" aria-label={`Công cụ ${currentCategory.label}`}>
          <div className="lv3-toolbox-title"><div><small>CÔNG CỤ</small><h2>{currentCategory.label}</h2></div><button className="lv3-icon-btn" title="Đóng bảng công cụ" onClick={()=>setSidebarOpen(false)}><ChevronLeft size={18}/></button></div>
          <div className="lv3-tool-grid">{currentCategory.children.map(t=>{const Icon=t.icon||WandSparkles;return <button key={t.id} className={`lv3-tool-item ${selected===t.id?'selected':''}`} onClick={()=>handleTool(t.id)} title={t.label}><span className="lv3-tool-symbol"><Icon size={21}/></span><span>{t.label}</span>{t.status==='soon'&&<small>SAU</small>}</button>})}</div>
          {(active==='edit'||active==='adjust')&&<div className="lv3-settings"><div className="lv3-heading"><SlidersHorizontal size={17}/> Tinh chỉnh trực tiếp</div>{active==='edit'&&<div className="lv3-ratios">{['Tự do','1:1','4:3','9:16','16:9'].map(r=><button key={r} className={edits.ratio===r?'chosen':''} onClick={()=>mutate({ratio:r})}>{r}</button>)}</div>}{slider('Độ sáng','brightness',40,160)}{slider('Tương phản','contrast',40,160)}{slider('Bão hòa','saturation',0,200)}{active==='adjust'&&<>{slider('Lux','lux',50,150)}{slider('Làm mờ','blur',0,12,'px')}</>}</div>}
          {active==='filters'&&<div className="lv3-filters-grid">{presets.map(p=><button key={p.id} onClick={()=>handleTool(p.id)} className={edits.preset===p.id?'chosen':''}><span className="lv3-filter-thumb">{image?<img src={image} alt="" style={{filter:p.filter}}/>:<Palette size={30}/>}</span><span>{p.name}</span></button>)}</div>}
          {N4_TOOLS[selected] && <LocalAiPanel key={selected} operation={N4_TOOLS[selected]} projectId={projectId} assetId={activeAssetId} disabled={!projectReady||assetBusy||projectBusy||!autosaveReady||!!(image?.startsWith('blob:'))} onApply={applyLocalAi}/>}
          {active==='ai'&&<div className="lv3-ai-box"><strong><Sparkles size={17}/> Gemini Chat</strong><p>Chỉnh ảnh bằng câu lệnh. Có xem trước và Apply; không dùng Local AI N4.</p><button type="button" disabled={!image} onClick={()=>setGeminiOpen(true)}><WandSparkles size={17}/> Mở Gemini Chat</button></div>}
          {active==='beauty'&&<p className="lv3-soon-note">Các công cụ làm đẹp sẽ được Thắng (N2) tích hợp tại đây, các mô hình AI xử lý qua Backend.</p>}
          {active === 'design' && selected === 'text' && (
            <div className="lv3-settings">
              <div className="lv3-heading">
                <Type size={17} /> Thêm văn bản
              </div>
              <TextTool
                onAddText={(text) => {
                  const id = `${Date.now()}-${Math.random()}`;

                  setTextItems((items) => [
                    ...items,
                    {
                      id,
                      text,
                      x: 50,
                      y: 50,
                      width: 200,
                      height: 60,
                      rotation: 0,
                    },
                  ]);

                  setActiveObjectId(id);
                  setStatus('Đã thêm văn bản vào ảnh');
                }}
              />
            </div>
          )}

          {active === 'design' && selected === 'shape' && (
            <div className="lv3-settings">
              <div className="lv3-heading">Thêm hình khối</div>
              <ShapeTool
                onAddShape={(shape) => {
                  const id = `${Date.now()}-${Math.random()}`;

                  setShapeItems((items) => [
                    ...items,
                    {
                      id,
                      shape,
                      x: 50,
                      y: 50,
                      width: 70,
                      height: 70,
                      rotation: 0,
                    },
                  ]);

                  setActiveObjectId(id);
                  setStatus('Đã thêm hình khối vào ảnh');
                }}
              />
            </div>
          )}

          {active === 'design' && selected === 'sticker' && (
            <div className="lv3-settings">
              <div className="lv3-heading">
                <Sticker size={17} /> Thêm sticker
              </div>
              <StickerTool
                onAddSticker={(sticker) => {
                  const id = `${Date.now()}-${Math.random()}`;

                  setStickerItems((items) => [
                    ...items,
                    {
                      id,
                      sticker,
                      x: 50,
                      y: 50,
                      width: 60,
                      height: 60,
                      rotation: 0,
                    },
                  ]);

                  setActiveObjectId(id);
                  setStatus('Đã thêm sticker vào ảnh');
                }}
              />
            </div>
          )}

          <div className="lv3-toolbox-footer"><CircleHelp size={16}/> Công cụ có nhãn SAU chưa thực thi.</div>
        </section>
        <section className="lv3-center">
          <div className="lv3-canvas-toolbar"><div className="lv3-toolbar-label"><Move size={16}/> Không gian chỉnh sửa</div><div className="lv3-toolbar-tools"><button type="button" onClick={()=>setLayersOpen(v=>!v)}><Layers3 size={16}/>{layersOpen?'Ảnh đơn':'Layers'}</button><button onClick={()=>inputRef.current?.click()}><FolderOpen size={16}/> Mở ảnh</button><span className="lv3-line"/><button onClick={()=>mutate({rotation:(edits.rotation+270)%360})} title="Xoay trái"><RotateCcw size={17}/></button><button onClick={()=>mutate({rotation:(edits.rotation+90)%360})} title="Xoay phải"><RotateCw size={17}/></button><button onClick={()=>mutate({flipped:!edits.flipped})} title="Lật ngang"><FlipHorizontal size={17}/></button></div></div>
          <div className={`lv3-canvas-space ${layersOpen?'n1-with-layers':''}`}>
            {projectReady&&<LayersWorkspace projectId={projectId} ready={projectReady} originalAssetId={activeAssetId} originalUrl={image}
              originalName={fileName} canvasWidth={canvasSize.width} canvasHeight={canvasSize.height}
              sourceDocument={projectState} active={layersOpen} onStatus={setStatus}/>}
            {!layersOpen && (image ? (
              <div className="lv3-image-stage">
                <img
                  src={image}
                  alt="Ảnh đang chỉnh sửa"
                  style={viewStyle}
                />

                {textItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      left: '50%',
                      top: `${35 + index * 8}%`,
                      transform: 'translate(-50%, -50%)',
                      color: '#ffffff',
                      fontSize: 28,
                      fontWeight: 700,
                      textShadow: '0 2px 5px #000000',
                      pointerEvents: 'none',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {item.text}
                  </div>
                ))}

                {shapeItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      left: `${35 + index * 8}%`,
                      top: '50%',
                      width: 70,
                      height: 70,
                      border: '3px solid #8b5cf6',
                      borderRadius:
                        item.shape === 'circle' ? '50%' :
                          item.shape === 'ellipse' ? '50%' :
                            item.shape === 'rounded-rectangle' ? '12px' : '0',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {stickerItems.map((item, index) => (
                  <div
                    key={item.id}
                    style={{
                      position: 'absolute',
                      left: `${60 + index * 8}%`,
                      top: `${35 + index * 8}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: 42,
                      pointerEvents: 'none',
                    }}
                  >
                    {item.sticker.emoji}
                  </div>
                ))}
              </div>
            ) : (
              <div className="lv3-empty">
                <div className="lv3-empty-orb">
                  <ImagePlus size={40} />
                </div>
                <h2>Bắt đầu với một bức ảnh</h2>
                <p>Thêm ảnh để sử dụng công cụ chỉnh sửa, bộ lọc và xem trước.</p>
                <button onClick={() => inputRef.current?.click()}>
                  <ImagePlus size={18} /> Chọn ảnh từ thiết bị
                </button>
                <small>JPG, PNG, WebP · Tối đa 20MB</small>
              </div>
            ))}
          </div>
          <div className="lv3-bottom"><span className="lv3-message" role="status">{status}</span><div className="lv3-zoom"><button onClick={()=>mutate({zoom:Math.max(40,edits.zoom-10)})} title="Thu nhỏ"><ZoomOut size={17}/></button><b>{edits.zoom}%</b><button onClick={()=>mutate({zoom:Math.min(200,edits.zoom+10)})} title="Phóng to"><ZoomIn size={17}/></button><button onClick={()=>mutate({zoom:100})} title="Về 100%">100%</button></div></div>
                </section>
      </div>
    </div>
    {versionsOpen&&<div className="n1-versions-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!versionsBusy)setVersionsOpen(false)}}>
      <section className="n1-versions-panel" role="dialog" aria-modal="true" aria-label="Phiên bản Project">
        <header className="n1-versions-head"><div><small>HISTORY / PROJECT</small><h2>Phiên bản của {projectName}</h2></div><button type="button" aria-label="Đóng" disabled={versionsBusy} onClick={()=>setVersionsOpen(false)}>✕</button></header>
        <p className="n1-versions-hint">Tạo mốc lưu trước khi chỉnh sửa lớn. Khôi phục sẽ tải lại Editor với trạng thái đã chọn.</p>
        <div className="n1-versions-create"><input aria-label="Nhãn phiên bản" maxLength={150} value={versionLabel} placeholder="Ví dụ: Trước khi chỉnh màu" onChange={e=>setVersionLabel(e.target.value)} disabled={versionsBusy}/><button type="button" onClick={()=>void createVersion()} disabled={versionsBusy||assetBusy||projectBusy}><BookmarkPlus size={16}/> Tạo mốc</button></div>
        {versionsError&&<p role="alert" className="n1-versions-error">{versionsError}</p>}
        <div className="n1-versions-list">{versionsBusy&&versions.length===0?<p>Đang tải phiên bản…</p>:versions.length===0?<p>Chưa có phiên bản nào. Hãy tạo mốc lưu đầu tiên.</p>:versions.map(v=><div className="n1-versions-item" key={v.versionId}><div><strong>{v.label||`Phiên bản #${v.versionId}`}</strong><small>{new Date(v.createdAt).toLocaleString('vi-VN')}</small></div><button type="button" disabled={versionsBusy||assetBusy||projectBusy} onClick={()=>void restoreVersion(v)}>Khôi phục</button></div>)}</div>
      </section>
    </div>}
    {geminiOpen&&image&&<GeminiChat originalPreview={image} createSource={currentImageForGemini}
      onApply={blob=>{
        // Gemini preview stays local until separately uploaded. Do not associate it with an old asset.
        setImage(URL.createObjectURL(blob));setFileName('gemini-edited.png');
        setActiveAssetId(null);
        setEdits(initial);setPast([]);setFuture([]);
        setStatus('Đã Apply Gemini trong trình duyệt; cần upload ảnh kết quả vào Project trước khi lưu lâu dài.');
        setGeminiOpen(false);
      }} onClose={()=>setGeminiOpen(false)}/>}
  </div>;
}
