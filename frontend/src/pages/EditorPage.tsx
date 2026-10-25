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
  Redo2, RotateCw, Save, SlidersHorizontal, History, BookmarkPlus,
  Sparkles, Sticker, Type, Undo2, WandSparkles, ZoomIn, ZoomOut,
} from 'lucide-react';
import GeminiChat from '../features/gemini/GeminiFullChat';
import type { Step } from '../features/gemini/geminiJobsApi';
import LocalAiPanel from '../features/localai/LocalAiPanel';
import LayersWorkspace, { readComposition, TEXT_FONT_STYLES } from '../layouts/LayersWorkspace';
import type { N5LayerBridge } from '../layouts/LayersWorkspace';
import { localAiApi } from '../services/localAiApi';
import { FILTER_PRESETS, FRAME_PRESETS } from '../layouts/editor-presets';
import type { LocalAiJob, LocalAiOperation } from '../services/localAiApi';
import './editor-modern.css';
import './editor-v4.css';
import './editor-versions-n1.css';

import ShapeTool, { type ShapeType } from '../features/editor/creative/shapes/ShapeTool';
import StickerTool, { type StickerItem } from '../features/editor/creative/stickers/StickerTool';
type Category = 'template' | 'edit' | 'beauty' | 'design' | 'remove' | 'filters' | 'adjust' | 'effects' | 'background' | 'ai';
type ToolItem = { id: string; label: string; status?: 'soon'; icon?: typeof Sparkles };
type CategoryItem = { id: Category; label: string; icon: typeof Sparkles; children: ToolItem[] };

const categories: CategoryItem[] = [
  { id: 'template', label: 'Template', icon: LayoutTemplate, children: [
    {id:'frame-none',label:'Không khung',icon:LayoutTemplate},{id:'frame-simple',label:'Khung viền',icon:LayoutTemplate},{id:'frame-polaroid',label:'Polaroid',icon:LayoutTemplate},{id:'frame-film',label:'Cuộn phim',icon:LayoutTemplate} ] },
  { id: 'edit', label: 'Chỉnh sửa', icon: Crop, children: [
    {id:'crop',label:'Cắt tỷ lệ',icon:Crop},{id:'rotate',label:'Xoay ảnh',icon:RotateCw},{id:'flip',label:'Lật ngang',icon:FlipHorizontal},
    {id:'expand',label:'Mở rộng AI',icon:Expand,status:'soon'} ] },
  { id: 'beauty', label: 'Nâng cao AI', icon: Heart, children: [
    {id:'n4-upscale2',label:'AI Upscale 2×',icon:Sparkles},{id:'n4-upscale4',label:'AI Upscale 4×',icon:Sparkles},{id:'n4-denoise',label:'AI khử nhiễu',icon:WandSparkles},{id:'n4-faceRestore',label:'Phục hồi khuôn mặt AI',icon:WandSparkles},{id:'beauty-auto',label:'Tự động',status:'soon'},{id:'face',label:'Chỉnh mặt',status:'soon'},{id:'slim',label:'Kéo thon',status:'soon'},
    {id:'lift',label:'Nâng cơ',status:'soon'},{id:'skin',label:'Chỉnh da',status:'soon'},{id:'body',label:'Chỉnh thể',status:'soon'},
    {id:'makeup',label:'Trang điểm',status:'soon'},{id:'brush',label:'Cọ',status:'soon'},{id:'skin-tone',label:'Tông da',status:'soon'},
    {id:'hair',label:'Chỉnh tóc',status:'soon'},{id:'beauty-ai',label:'Chỉnh bằng AI',status:'soon'} ] },
  { id:'design',label:'Thiết kế',icon:Layers3,children:[
    {id:'text',label:'Văn bản',icon:Type},
    {id:'sticker',label:'Nhãn / Sticker',icon:Sticker},
    {id:'add-image',label:'Thêm ảnh',icon:ImagePlus},
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
    {id:'bg-color',label:'Nền màu'},{id:'bg-image',label:'Nền hình ảnh'},
    {id:'bg-transparent',label:'Nền trong suốt',icon:ImageIcon} ] },
  { id:'ai',label:'Chỉnh theo AI',icon:WandSparkles,children:[
    {id:'prompt',label:'Chỉnh ảnh bằng câu lệnh',icon:WandSparkles} ] },
];

// Only verified N4 endpoints are directly selectable here. Mask-dependent operations remain pending N2 canvas integration.
const N4_TOOLS: Record<string, LocalAiOperation> = {
  'n4-upscale2':'upscale2', 'n4-upscale4':'upscale4',
  'n4-denoise':'denoise', 'n4-enhance':'enhance',
  'n4-faceRestore':'faceRestore', 'n4-removeBg':'removeBg',
};

const presets = FILTER_PRESETS;

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
  const [layerCommand,setLayerCommand]=useState<{seq:number;patch:Partial<Edits>}|null>(null);
  const [historyCommand,setHistoryCommand]=useState<{seq:number;action:'undo'|'redo'}|null>(null);
  const [exportCommand,setExportCommand]=useState(0);
  const [frameCommand,setFrameCommand]=useState<{seq:number;frame:string}|null>(null);
  const [groupFilterCommand,setGroupFilterCommand]=useState<{seq:number;filter:string}|null>(null);
  const [backgroundCommand,setBackgroundCommand]=useState<{seq:number;type:'color'|'image'|'transparent';color?:string}|null>(null);
  const [backgroundSelection,setBackgroundSelection]=useState<{type:'color'|'image'|'transparent';color:string;url?:string}>({type:'transparent',color:'#ffffff'});
  const layersBridgeRef=useRef<N5LayerBridge>({flush:async()=>{},prepare:async()=>{},resume:()=>{},renderPng:async()=>{throw new Error('Canvas chưa sẵn sàng');},pickImage:()=>{},pickBackground:()=>{},applyCommands:async()=>{throw new Error('Editor chưa sẵn sàng');},previewCommands:async()=>{throw new Error('Editor chưa sẵn sàng');}});
  const [layerCanUndo,setLayerCanUndo]=useState(false);
  const [layerCanRedo,setLayerCanRedo]=useState(false);
  const [toolboxCollapsed,setToolboxCollapsed]=useState(false);
  const [creativeCommand,setCreativeCommand]=useState<{seq:number;kind:'text'|'sticker'|'shape';value:string;fontFamily?:string}|null>(null);
  const [selectedCreativeLayer,setSelectedCreativeLayer]=useState<{id:string;kind:'text'|'sticker'|'shape';value:string;fontFamily:string;color:string;fontSize:number;width:number;rotation:number;opacity:number;locked:boolean}|null>(null);
  const [creativeEditCommand,setCreativeEditCommand]=useState<{seq:number;id:string;patch:Partial<{value:string;fontFamily:string;color:string;fontSize:number;width:number;rotation:number;opacity:number}>}|null>(null);
  const [newTextFont,setNewTextFont]=useState('Arial');
  const [selectedImageLayer,setSelectedImageLayer]=useState<{id:string;name:string;width:number;opacity:number;locked:boolean;isBase:boolean}|null>(null);
  const [imageLayerEditCommand,setImageLayerEditCommand]=useState<{seq:number;id:string;patch:Partial<{name:string;width:number;opacity:number}>}|null>(null);
  const lastImageSelection=useRef<string|null>(null);
  const editImageLayer=(patch:Partial<{name:string;width:number;opacity:number}>)=>{
    if(!selectedImageLayer||selectedImageLayer.locked)return;
    setImageLayerEditCommand({seq:Date.now()+Math.random(),id:selectedImageLayer.id,patch});
  };
  const handleImageLayerSelection=(value:typeof selectedImageLayer)=>{
    setSelectedImageLayer(value);
    if(value?.id&&value.id!==lastImageSelection.current){
      lastImageSelection.current=value.id;
      setActive('edit');setSelected('crop');setToolboxCollapsed(false);
    }else if(!value){lastImageSelection.current=null;}
  };
  const lastCreativeSelection=useRef<string|null>(null);
  const editCreative=(patch:Partial<{value:string;fontFamily:string;color:string;fontSize:number;width:number;rotation:number;opacity:number}>)=>{
    if(!selectedCreativeLayer || selectedCreativeLayer.locked)return;
    setCreativeEditCommand({seq:Date.now()+Math.random(),id:selectedCreativeLayer.id,patch});
  };
  const handleCreativeSelection=(value:typeof selectedCreativeLayer)=>{
    setSelectedCreativeLayer(value);
    if(value?.id && value.id!==lastCreativeSelection.current){
      lastCreativeSelection.current=value.id;
      setActive('design');setSelected(value.kind==='text'?'text':value.kind==='shape'?'shape':'stickers');
      setSidebarOpen(true);setToolboxCollapsed(false);
    } else if(!value){lastCreativeSelection.current=null;}
  };
  const [canvasSize,setCanvasSize]=useState({width:1024,height:1024});
  const [geminiOpen, setGeminiOpen] = useState(false);
  const [projectRefresh,setProjectRefresh]=useState(0);
  const [fileName,setFileName]=useState('Chưa có ảnh');
  const [edits,setEdits]=useState<Edits>(initial);
  const [textItems] = useState<
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
  },[projectId,navigate,projectRefresh]);

  const saveToProject=async()=>{
    if(!projectReady || !autosaveReady || !projectState || assetBusy || !Number.isSafeInteger(projectId)) return;
    // Do not persist a local Gemini preview as if it were a durable project image.
    if(image?.startsWith('blob:') && activeAssetId===null) {
      setStatus('Ảnh Gemini đang ở bản xem trước, chưa upload lên Project; không thể tự lưu ảnh này.');
      return;
    }
    // Layer changes are also part of Save Project, not only the legacy CSS edits.
    // This is a no-op when the layer workspace has not loaded yet.
    try { await layersBridgeRef.current.flush(); } catch(err) {
      console.error('Cannot flush Layers before saving Project',err);setSavePhase('error');setStatus('Lưu Layers thất bại; hãy kiểm tra Backend trước khi tiếp tục.');return;
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
    if(projectReady) setLayerCommand({seq:Date.now()+Math.random(),patch});
    setEdits(prev=>{
      const next={...prev,...patch};
      if(JSON.stringify(prev)===JSON.stringify(next))return prev;
      setPast(items=>[...items.slice(-39),prev]);setFuture([]);
      return next;
    });
  };
  const undo=()=>{if(layerCanUndo){setHistoryCommand({seq:Date.now()+Math.random(),action:'undo'});return;}
    if(!past.length)return;const prev=past[past.length-1];setPast(x=>x.slice(0,-1));setFuture(x=>[...x,edits]);setEdits(prev);
  };
  const redo=()=>{if(layerCanRedo){setHistoryCommand({seq:Date.now()+Math.random(),action:'redo'});return;}
    if(!future.length)return;const next=future[future.length-1];setFuture(x=>x.slice(0,-1));setPast(x=>[...x,edits]);setEdits(next);
  };
  const undoCallback=useRef(undo),redoCallback=useRef(redo);
  undoCallback.current=undo;redoCallback.current=redo;
  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      const el=event.target as HTMLElement|null;
      if(el?.closest('input,textarea,[contenteditable="true"]'))return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){
        event.preventDefault();if(event.shiftKey)redoCallback.current();else undoCallback.current();
      } else if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){
        event.preventDefault();redoCallback.current();
      }
    };
    window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[]);
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
    return `brightness(${edits.brightness*edits.lux/10000}) contrast(${edits.contrast}%) saturate(${edits.saturation}%) hue-rotate(${edits.temperature/3}deg) ${p==='none'?'':p} blur(${edits.blur}px)`;
  };
  const currentImageForGemini=async ():Promise<Blob>=>{
    if(!image)throw new Error('Hãy chọn ảnh trước.');
    if(projectReady) return layersBridgeRef.current.renderPng();
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
      await layersBridgeRef.current.prepare();
      const resultAsset=await assetApi.get(projectId,job.resultAssetId);
      // Upscale MUST be a native-pixel change, not a CSS filter or canvas scale.
      // Fail closed if N4/Cloudinary returned the original resolution.
      if ((selected==='n4-upscale2'||selected==='n4-upscale4') && image) {
        const factor=selected==='n4-upscale2'?2:4;
        const getPixels=(url:string)=>new Promise<{width:number;height:number}>((resolve,reject)=>{
          const probe=new Image();probe.onload=()=>resolve({width:probe.naturalWidth,height:probe.naturalHeight});
          probe.onerror=()=>reject(new Error('Không đọc được pixel ảnh từ Cloudinary. Kiểm tra CORS/URL.'));probe.src=url;
        });
        const [before,after]=await Promise.all([getPixels(image),getPixels(resultAsset.url)]);
        if (Math.abs(after.width-before.width*factor)>2||Math.abs(after.height-before.height*factor)>2) {
          throw new Error(`AI Upscale ${factor}× không hợp lệ: ảnh ${before.width}×${before.height}, kết quả ${after.width}×${after.height}; cần ${before.width*factor}×${before.height*factor}. Kiểm tra N4 RealESRGAN.`);
        }
        setStatus(`N4 đã trả ảnh ${after.width}×${after.height} pixel thực. Đang áp dụng…`);
      }
      // Validate native pixel dimensions BEFORE attaching the AI job or touching N3 state.
      await localAiApi.attach(projectId,job.jobId);
      const latest=await editorStateApi.load(projectId);
      const previous=latest.n1Editor && typeof latest.n1Editor==='object' && !Array.isArray(latest.n1Editor)
        ? latest.n1Editor as Record<string,unknown> : {};
      const existing=readComposition(latest);
      const base=existing.length?existing:(activeAssetId && image && !image.startsWith('blob:')
        ? [{id:`original-${activeAssetId}`,assetId:activeAssetId,url:image,name:fileName,
            visible:true,locked:false,opacity:100,x:0,y:0,width:100}]:[]);
      // AI edits REPLACE the selected source photo in the composition, rather than
      // stacking a transparent cut-out over the old opaque image.
      // This does NOT delete the original Cloudinary asset or N3 history.
      const processedIndex=base.findIndex(l=>l.assetId===activeAssetId);
      const sourceIndex=processedIndex>=0?processedIndex:base.findIndex(l=>l.x===0&&l.y===0&&l.width===100);
      const output={id:sourceIndex>=0?base[sourceIndex].id:`ai-${job.jobId}-${job.resultAssetId}`,
        assetId:job.resultAssetId,url:resultAsset.url,
        name:resultAsset.originalFileName||`AI ${job.jobId}`,
        visible:true,locked:false,opacity:100,
        x:sourceIndex>=0?base[sourceIndex].x:0,
        y:sourceIndex>=0?base[sourceIndex].y:0,
        width:sourceIndex>=0?base[sourceIndex].width:100,
        rotation:sourceIndex>=0?base[sourceIndex].rotation??0:0,
        flipped:sourceIndex>=0?base[sourceIndex].flipped??false:false,
        preset:'original',brightness:100,contrast:100,saturation:100,lux:100,blur:0,temperature:0,highlights:100};
      const replacingBackground=selected==='n4-removeBg';
      const resultLayers=sourceIndex<0?[output]:base.map((layer,index)=>{
        if(index===sourceIndex)return output;
        // For background removal, hide old full-frame photo duplicates,
        // above OR below the output, so transparent pixels reveal no old photo.
        // Auxiliary objects, stickers and partial image layers are untouched.
        if(replacingBackground && layer.x===0 && layer.y===0 && layer.width===100){
          return {...layer,visible:false};
        }
        return layer;
      });
      // Preserve N3 objects/history; only touch N1's separate composition slot.
      const oldComposition=typeof latest.n1Composition==='object' && latest.n1Composition && !Array.isArray(latest.n1Composition)
        ?latest.n1Composition as Record<string,unknown>:{};
      const oldBackground=oldComposition.background && typeof oldComposition.background==='object' && !Array.isArray(oldComposition.background)
        ?oldComposition.background as Record<string,unknown>:{};
      // Persist the authoritative primary asset. Canvas display dimensions are
      // intentionally viewport-fit, while export must use native AI pixels.
      const upscaleScale=selected==='n4-upscale2'?2:selected==='n4-upscale4'?4:null;
      const nextComposition={...oldComposition,version:1,layers:resultLayers,
        primaryAssetId:job.resultAssetId,
        ...(upscaleScale?{lastUpscale:{scale:upscaleScale,assetId:job.resultAssetId,jobId:job.jobId}}:{}),
        // Keep the user's chosen replacement background; only default to transparent
        // when they have not explicitly chosen a color/image background.
        ...(replacingBackground && (!oldBackground.type || oldBackground.type==='transparent')?{background:{...oldBackground,type:'transparent'}}:{})};
      await editorStateApi.save(projectId,{...latest,n1Composition:nextComposition,
        n1Editor:{...previous,activeAssetId:job.resultAssetId,
        edits:initial,past:[],future:[],updatedAt:new Date().toISOString()}});
      try{await assetApi.setProjectThumbnail(projectId,job.resultAssetId)}
      catch(err){console.warn('Local AI thumbnail update failed',err)}
      window.location.reload();
    }catch(err){layersBridgeRef.current.resume();setAutosaveReady(true);setStatus(err instanceof Error?err.message:'Không thể áp dụng kết quả N4');throw err}
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
        const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`${projectName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'project'}.png`;anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Đã xuất PNG về máy');},'image/png');
    };
    img.onerror=()=>{setBusy(false);setStatus('Không đọc được ảnh để xuất; kiểm tra Cloudinary CORS.');};img.src=image;
  };
  const handleTool=(id:string)=>{
    setSelected(id);
    if(id==='add-image'){layersBridgeRef.current.pickImage();setStatus('Chọn ảnh để chèn lên ảnh chính. Các ảnh vẫn là layer chỉnh được.');return;}
    if(id==='bg-color'||id==='bg-image'||id==='bg-transparent'){if(id==='bg-image')layersBridgeRef.current.pickBackground();else setBackgroundCommand({seq:Date.now()+Math.random(),type:id==='bg-color'?'color':'transparent'});return;}
    if(id.startsWith('frame-')){setFrameCommand({seq:Date.now()+Math.random(),frame:id.slice(6)});return;}
    if(N4_TOOLS[id])return;
    if(id==='prompt'){if(image)setGeminiOpen(true);else setStatus('Hãy mở một ảnh trước khi dùng Gemini');return;}
    if(id==='rotate')mutate({rotation:(edits.rotation+90)%360});
    if(id==='flip')mutate({flipped:!edits.flipped});
    if(id==='auto')mutate({brightness:108,contrast:108,saturation:110,lux:105});
    if(id==='crop'){setStatus('Chọn tỷ lệ để cắt ảnh theo tâm. Khung hình xuất sẽ đúng tỷ lệ đã chọn.');}
    if(presets.some(p=>p.id===id)){
      setGroupFilterCommand({seq:Date.now()+Math.random(),filter:id});
      setEdits(v=>({...v,preset:id}));
      setStatus('Đã áp dụng bộ lọc cho TOÀN BỘ bố cục: nền + ảnh + chữ + sticker. Các layer vẫn sửa riêng được.');
      return;
    }
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
        <div className="lv3-top-actions"><button type="button" onClick={()=>void openVersions()} disabled={!projectReady||projectBusy||assetBusy} title="Mốc phiên bản Project"><History size={18}/><span>Phiên bản</span></button><button onClick={undo} disabled={!past.length&&!layerCanUndo} title="Hoàn tác"><Undo2 size={18}/><span>Hoàn tác</span></button><button onClick={redo} disabled={!future.length&&!layerCanRedo} title="Làm lại"><Redo2 size={18}/><span>Làm lại</span></button><span className="lv3-split"/><button onClick={saveTemporary} title="Lưu tạm thiết lập phiên làm việc"><Save size={18}/><span>Lưu tạm</span></button><button onClick={()=>void saveToProject()} disabled={!projectReady||projectBusy||assetBusy} title="Lưu thông số Editor vào MySQL"><Cloud size={18}/><span>{projectBusy?'Đang lưu...':'Lưu Project'}</span></button><span title="Tự lưu sau 1,8 giây không thao tác" aria-live="polite" style={{fontSize:12,whiteSpace:'nowrap',color:savePhase==='error'?'#ba314e':'#796c95'}}>{savePhase==='pending'?'Chờ tự lưu…':savePhase==='saving'?'Đang lưu…':savePhase==='saved'?'Đã lưu ✓':savePhase==='error'?'Lưu lỗi!':'Tự lưu bật'}</span><button className="lv3-purple-button" onClick={()=>{if(projectReady)setExportCommand(v=>v+1);else exportImage();}} disabled={!image||isBusy}><Download size={18}/>Xuất ảnh</button></div>
      </header>
      <div className="lv3-body">
        <section className={`lv3-toolbox ${toolboxCollapsed?'lv3-toolbox-collapsed':''}`} aria-label={`Công cụ ${currentCategory.label}`}>
          <div className="lv3-toolbox-title"><div><small>CÔNG CỤ</small><h2>{currentCategory.label}</h2></div><button className="lv3-icon-btn" title={toolboxCollapsed?"Mở bảng công cụ":"Thu gọn bảng công cụ"} onClick={()=>setToolboxCollapsed(v=>!v)}><ChevronLeft size={18}/></button></div>
          {!toolboxCollapsed&&<button type="button" className="v46-background-quick-button" disabled={!projectReady||assetBusy}
            onClick={()=>{setActive('background');setSelected('bg-image');layersBridgeRef.current.pickBackground();}}
            title="Chọn ảnh nền mới từ máy để ghép phía sau chủ thể">
            <ImagePlus size={17}/> <span>{backgroundSelection.type==='image'?'Đổi ảnh nền đang dùng':'Thay nền bằng ảnh'}</span><ChevronRight size={15}/>
          </button>}
          <div className="lv3-tool-grid" style={{display:active==='filters'||active==='adjust'||active==='template'?'none':undefined}}>{currentCategory.children.map(t=>{const Icon=t.icon||WandSparkles;return <button key={t.id} className={`lv3-tool-item ${selected===t.id?'selected':''}`} onClick={()=>handleTool(t.id)} title={t.label}><span className="lv3-tool-symbol"><Icon size={21}/></span><span>{t.label}</span>{t.status==='soon'&&<small>SAU</small>}</button>})}</div>
          {active==='edit'&&<div className="lv3-settings"><div className="lv3-heading"><Crop size={17}/> Cắt / Tỷ lệ khung hình</div><div className="lv3-ratios">{['Tự do','1:1','1:2','2:3','3:4','4:3','9:16','16:9'].map(r=><button key={r} className={edits.ratio===r?'chosen':''} onClick={()=>mutate({ratio:r})}>{r}</button>)}</div><small>Ảnh thật là khung cắt. Tỷ lệ mới cắt từ tâm ảnh, không tạo canvas trắng hay nền phụ. PNG giữ pixel gốc tương ứng vùng cắt.</small>
            {selectedImageLayer&&<div className="v44-image-inspector">
              <h3>Ảnh đang chọn</h3>
              <label>Tên lớp <input type="text" maxLength={90} disabled={selectedImageLayer.locked} value={selectedImageLayer.name} onChange={ev=>editImageLayer({name:ev.target.value})}/></label>
              <label>Độ mờ <b>{selectedImageLayer.opacity}%</b><input type="range" min="0" max="100" disabled={selectedImageLayer.locked} value={selectedImageLayer.opacity} onChange={ev=>editImageLayer({opacity:Number(ev.target.value)})}/></label>
              {!selectedImageLayer.isBase?<label>Kích thước lớp phụ <b>{Math.round(selectedImageLayer.width)}%</b><input type="range" min="5" max="150" disabled={selectedImageLayer.locked} value={selectedImageLayer.width} onChange={ev=>editImageLayer({width:Number(ev.target.value)})}/></label>:
              <p className="v44-empty-hint">Ảnh chính luôn phủ đúng khung cắt; không thay đổi kích thước canvas riêng.</p>}
            </div>}
          </div>}
          {active==='background'&&<div className="lv3-settings v44-background-tools v46-background-panel">
            <div className="lv3-heading"><ImageIcon size={17}/> Thay nền ảnh</div>
            <p className="v44-hint">Chọn ảnh nền từ máy. Ảnh nền sẽ nằm <b>phía sau chủ thể</b>, được lưu cùng Project và tham gia bộ lọc khi xuất ảnh.</p>
            <button type="button" className="v46-background-primary" disabled={!projectReady||assetBusy} onClick={()=>layersBridgeRef.current.pickBackground()}>
              <ImagePlus size={19}/> {backgroundSelection.type==='image'?'Chọn ảnh nền khác':'Tải ảnh nền từ máy'}
            </button>
            {backgroundSelection.type==='image'&&backgroundSelection.url&&<div className="v46-background-preview">
              <img src={backgroundSelection.url} alt="Xem trước nền hiện tại"/>
              <span><strong>Đã chọn nền ảnh</strong><small>Đang nằm dưới ảnh chính, có thể đổi bất cứ lúc nào</small></span>
            </div>}
            <p className="v46-background-help">Nếu đã chọn nền mà <b>không thấy thay đổi</b>, ảnh chính đang che kín nền. Hãy vào <b>Xóa → Xóa nền AI N4</b>, chờ hoàn tất rồi bấm <b>Áp dụng kết quả</b>.</p>
            <button type="button" className="v46-remove-bg-link" onClick={()=>{setActive('remove');setSelected('n4-removeBg');}}>Mở công cụ Xóa nền AI N4 <ChevronRight size={15}/></button>
            <div className="v46-background-variants">
              <button type="button" className={backgroundSelection.type==='transparent'?'chosen':''} onClick={()=>setBackgroundCommand({seq:Date.now()+Math.random(),type:'transparent'})}>Trong suốt</button>
              <button type="button" className={backgroundSelection.type==='color'?'chosen':''} onClick={()=>setBackgroundCommand({seq:Date.now()+Math.random(),type:'color'})}>Nền màu</button>
            </div>
            {backgroundSelection.type==='color'&&<label className="v44-input-label">Màu nền <input type="color" value={backgroundSelection.color} onChange={ev=>setBackgroundCommand({seq:Date.now()+Math.random(),type:'color',color:ev.target.value})}/></label>}
          </div>}
          {active==='adjust'&&<div className="lv3-settings"><div className="lv3-heading"><SlidersHorizontal size={17}/> Điều chỉnh ảnh đang chọn</div><button className="n1-reset-adjust" type="button" onClick={()=>mutate({brightness:100,contrast:100,saturation:100,lux:100,blur:0,temperature:0,highlights:100})}>Đặt lại thông số</button>{slider('Độ sáng','brightness',0,200)}{slider('Tương phản','contrast',0,200)}{slider('Bão hòa','saturation',0,200)}{slider('Lux','lux',0,200)}{slider('Nhiệt độ màu','temperature',-100,100,'°')}{slider('Độ chói','highlights',0,200)}{slider('Làm mờ','blur',0,20,'px')}<div className="n1-adjust-actions"><button onClick={()=>handleTool('auto')}>Tự động</button><button onClick={()=>handleTool('n4-enhance')}>AI tăng chất lượng</button></div></div>}
          {active==='template'&&<div className="n1-template-grid">{FRAME_PRESETS.map(({id,name})=><button key={id} onClick={()=>handleTool('frame-'+id)}><span className={'n1-template-preview n1-frame-'+id}><span/></span><strong>{name}</strong></button>)}</div>}
          {active==='filters'&&<div className="v43-filter-sections"><p className="v45-mode-hint"><b>Bộ lọc toàn bố cục</b>: ảnh chính, ảnh chèn, nền, chữ, sticker và khung được xem như một hình duy nhất khi lọc/xuất. Layer vẫn chỉnh được ở bên phải.</p>{[...new Set(presets.map(p=>p.group))].map(group=><section key={group}><h3>{group}</h3><div className="lv3-filters-grid">{presets.filter(p=>p.group===group).map(p=><button key={p.id} onClick={()=>handleTool(p.id)} className={edits.preset===p.id?'chosen':''}><span className="lv3-filter-thumb">{image?<img src={image} alt="" style={{filter:p.filter}}/>:<Palette size={30}/>}</span><span>{p.name}</span></button>)}</div></section>)}</div>}
          {N4_TOOLS[selected] && <LocalAiPanel key={selected} operation={N4_TOOLS[selected]} projectId={projectId} assetId={activeAssetId} sourceUrl={image} disabled={!projectReady||assetBusy||projectBusy||!autosaveReady||!!(image?.startsWith('blob:'))} onApply={applyLocalAi}/>}
          {active==='ai'&&<div className="lv3-ai-box"><strong><Sparkles size={17}/> Lệnh chỉnh ảnh thông minh</strong>
          <p> Mô tả những thay đổi bạn muốn thực hiện.
              AI sẽ hỗ trợ chỉnh sửa ảnh theo yêu cầu.</p>
            <button type="button" disabled={!image} onClick={()=>setGeminiOpen(true)}><WandSparkles size={17}/> Nhập câu lệnh</button></div>}
          {active==='beauty'&&<p className="lv3-soon-note">Các công cụ làm đẹp sẽ được Thắng (N2) tích hợp tại đây, các mô hình AI xử lý qua Backend.</p>}
          {active === 'design' && selected === 'text' && (
            <div className="lv3-settings v44-text-tools">
              <div className="lv3-heading"><Type size={17}/> Văn bản</div>
              <p className="v44-hint">Chọn một mẫu kiểu chữ trước khi thêm. Khi đã chọn lớp chữ, bấm mẫu sẽ <b>đổi font cho chính lớp đó</b>, không tạo chữ mới.</p>
              <button type="button" className="v42-add-text" onClick={()=>{setCreativeCommand({seq:Date.now()+Math.random(),kind:'text',fontFamily:selectedCreativeLayer?.kind==='text'?selectedCreativeLayer.fontFamily:newTextFont,value:'Nhấp đúp để nhập chữ'});setLayersOpen(true);}}>+ Thêm chữ mới</button>
              {selectedCreativeLayer?.kind==='text'?<>
                <div className="v44-inspector-head"><strong>Đang chỉnh chữ đã chọn</strong><small>{selectedCreativeLayer.locked?'Đã khóa — mở khóa trong Layers':'Sửa ở đây hoặc nhấp đúp lên chữ'}</small></div>
                <label className="v44-input-label">Nội dung
                  <textarea rows={3} value={selectedCreativeLayer.value} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({value:ev.target.value})}/>
                </label>
              </>:<p className="v44-empty-hint">Chưa chọn lớp chữ. Chọn font trước rồi bấm “Thêm chữ mới”.</p>}
              <h3 className="v44-gallery-heading">Kiểu chữ <small>{TEXT_FONT_STYLES.length} mẫu</small></h3>
              <div className="v44-font-gallery">{TEXT_FONT_STYLES.map(font=><button type="button" key={font.name}
                className={`v44-font-card ${(selectedCreativeLayer?.kind==='text'?selectedCreativeLayer.fontFamily:newTextFont)===font.font?'active':''}`}
                disabled={selectedCreativeLayer?.locked===true}
                onClick={()=>{setNewTextFont(font.font);if(selectedCreativeLayer?.kind==='text')editCreative({fontFamily:font.font});}}
                title={font.name}>
                <span className="v44-font-preview" style={{fontFamily:`"${font.font}", sans-serif`}}>{font.sample}</span><small>{font.name}</small>
              </button>)}</div>
              {selectedCreativeLayer?.kind==='text'&&<div className="v44-text-properties">
                <label>Màu chữ <input type="color" value={selectedCreativeLayer.color} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({color:ev.target.value})}/></label>
                <label>Cỡ chữ <b>{selectedCreativeLayer.fontSize}px</b><input type="range" min="10" max="180" value={selectedCreativeLayer.fontSize} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({fontSize:Number(ev.target.value)})}/></label>
                <label>Độ rộng <b>{Math.round(selectedCreativeLayer.width)}%</b><input type="range" min="10" max="100" value={selectedCreativeLayer.width} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({width:Number(ev.target.value)})}/></label>
                <label>Góc xoay <b>{selectedCreativeLayer.rotation}°</b><input type="range" min="-180" max="180" value={selectedCreativeLayer.rotation} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({rotation:Number(ev.target.value)})}/></label>
                <label>Độ mờ <b>{selectedCreativeLayer.opacity}%</b><input type="range" min="0" max="100" value={selectedCreativeLayer.opacity} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({opacity:Number(ev.target.value)})}/></label>
              </div>}
              <p className="v44-hint">Bên phải chỉ còn danh sách Layers: chọn, ẩn/hiện, khóa, đổi thứ tự và xóa lớp.</p>
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
                  setCreativeCommand({seq:Date.now()+Math.random(),kind:'shape',value:shape});
                  setLayersOpen(true);
                  setStatus('Đã thêm hình khối. Có thể kéo, đổi màu và kích thước trên canvas.');
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
                  setCreativeCommand({seq:Date.now()+Math.random(),kind:'sticker',value:sticker.emoji});
                  setLayersOpen(true);
                  setStatus('Đã thêm sticker. Có thể kéo, thu phóng và xóa như một layer.');
                }}
              />
            </div>
          )}

          {active==='design' && selectedCreativeLayer && selectedCreativeLayer.kind!=='text' && (
            <div className="lv3-settings v44-text-properties v44-other-tools">
              <div className="lv3-heading">Chỉnh {selectedCreativeLayer.kind==='shape'?'hình khối':'sticker'} đã chọn</div>
              {selectedCreativeLayer.kind==='sticker'&&<label>Nội dung <textarea rows={2} value={selectedCreativeLayer.value} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({value:ev.target.value})}/></label>}
              {selectedCreativeLayer.kind==='shape'&&<label>Màu viền <input type="color" value={selectedCreativeLayer.color} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({color:ev.target.value})}/></label>}
              <label>Kích thước <b>{Math.round(selectedCreativeLayer.width)}%</b><input type="range" min="5" max="120" value={selectedCreativeLayer.width} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({width:Number(ev.target.value)})}/></label>
              <label>Góc xoay <b>{selectedCreativeLayer.rotation}°</b><input type="range" min="-180" max="180" value={selectedCreativeLayer.rotation} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({rotation:Number(ev.target.value)})}/></label>
              <label>Độ mờ <b>{selectedCreativeLayer.opacity}%</b><input type="range" min="0" max="100" value={selectedCreativeLayer.opacity} disabled={selectedCreativeLayer.locked} onChange={ev=>editCreative({opacity:Number(ev.target.value)})}/></label>
            </div>)}
          <div className="lv3-toolbox-footer"><CircleHelp size={16}/> Công cụ có nhãn SAU chưa thực thi.</div>
        </section>
        <section className="lv3-center">
          <div className="lv3-canvas-toolbar"><div className="lv3-toolbar-label"><Move size={16}/> Không gian chỉnh sửa</div><div className="lv3-toolbar-tools"><button type="button" onClick={()=>setLayersOpen(v=>!v)}><Layers3 size={16}/>{layersOpen?'Ẩn Layers':'Hiện Layers'}</button><button onClick={()=>inputRef.current?.click()}><FolderOpen size={16}/> Mở ảnh</button></div></div>
          <div className="lv3-canvas-space n1-with-layers">
            {projectReady&&<LayersWorkspace projectId={projectId} ready={projectReady} originalAssetId={activeAssetId} originalUrl={image}
              originalName={fileName} canvasWidth={canvasSize.width} canvasHeight={canvasSize.height}
              sourceDocument={projectState} active={true} panelOpen={layersOpen} onRequestOriginalImage={()=>inputRef.current?.click()} layerBridgeRef={layersBridgeRef} onZoomChange={next=>setEdits(v=>({...v,zoom:next}))} onStatus={setStatus} projectName={projectName} ratio={edits.ratio} zoom={edits.zoom} exportCommand={exportCommand} historyCommand={historyCommand} frameCommand={frameCommand} backgroundCommand={backgroundCommand} groupFilterCommand={groupFilterCommand} onHistoryAvailability={(canUndo,canRedo)=>{setLayerCanUndo(canUndo);setLayerCanRedo(canRedo);}}
              editCommand={layerCommand} creativeCommand={creativeCommand} creativeEditCommand={creativeEditCommand} imageLayerEditCommand={imageLayerEditCommand} onSelectCreativeLayer={handleCreativeSelection} onSelectImageLayer={handleImageLayerSelection} onSelectBackground={setBackgroundSelection} onSelectGroupFilter={filter=>setEdits(v=>v.preset===filter?v:{...v,preset:filter})}
              onSelectImageEdits={(v,asset)=>{setEdits(old=>({...old,...v} as Edits));if(asset){setActiveAssetId(asset.assetId);setImage(asset.url);setFileName(asset.name);}}}/>}
            {!projectReady && (image ? (
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
          <div className="lv3-bottom"><span className="lv3-message" role="status">{status}</span><div className="lv3-zoom"><button onClick={()=>setEdits(v=>({...v,zoom:Math.max(50,v.zoom-5)}))} title="Thu nhỏ"><ZoomOut size={17}/></button><b>{edits.zoom}%</b><button onClick={()=>setEdits(v=>({...v,zoom:Math.min(1600,v.zoom+5)}))} title="Phóng to"><ZoomIn size={17}/></button><button onClick={()=>setEdits(v=>({...v,zoom:100}))} title="Về 100%">100%</button></div></div>
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
    {geminiOpen&&image&&<GeminiChat projectId={projectId} originalPreview={image} createSource={currentImageForGemini}
      onPreviewEditorTools={(steps:Step[])=>layersBridgeRef.current.previewCommands(steps)}
      onApplyEditorTools={(steps:Step[],version:number)=>layersBridgeRef.current.applyCommands(steps,version)}
      onFlushEditor={()=>layersBridgeRef.current.flush()}
      onApplied={()=>{setGeminiOpen(false);setProjectRefresh(count=>count+1);}} onClose={()=>setGeminiOpen(false)}/>}
  </div>;
}
