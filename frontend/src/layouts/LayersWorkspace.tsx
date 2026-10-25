import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent, WheelEvent } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Layers3, Lock, Trash2, Unlock, Type, Sticker, Shapes, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { assetApi } from '../services/assetApi';
import { editorStateApi } from '../services/editorStateApi';
import './layers-workspace.css';
import { FILTER_MAP } from './editor-presets';
import { applyEditableCommands } from '../features/gemini/editorToolAdapter';
import type { Step } from '../features/gemini/geminiJobsApi';
import { geminiJobsApi } from '../features/gemini/geminiJobsApi';

export type ImageLayer = {
  id: string; assetId: number; url: string; name: string;
  visible: boolean; locked: boolean; opacity: number;
  x: number; y: number; width: number; rotation?:number; flipped?:boolean; preset?:string; brightness?:number; contrast?:number; saturation?:number; lux?:number; blur?:number; temperature?:number; highlights?:number;
};
export type Composition = { version: 1; layers: ImageLayer[] };
export type N5LayerBridge = {
  flush:()=>Promise<void>;
  prepare:()=>Promise<void>;
  resume:()=>void;
  renderPng:()=>Promise<Blob>;
  pickImage:()=>void;
  pickBackground:()=>void;
  applyCommands:(steps:Step[],expectedStateVersion:number)=>Promise<void>;
  previewCommands:(steps:Step[])=>Promise<Blob>;
};
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export function readComposition(doc: Record<string, unknown>): ImageLayer[] {
  const data = doc.n1Composition;
  if (!isObj(data) || !Array.isArray(data.layers)) return [];
  return (data.layers as unknown[]).filter(isObj).filter(v=>Number.isSafeInteger(v.assetId) && Number(v.assetId)>0 && typeof v.url==='string')
    .map(v=>({id:String(v.id),assetId:Number(v.assetId),url:String(v.url),name:String(v.name || 'Layer'),
      visible:v.visible!==false,locked:v.locked===true,opacity:Math.min(100,Math.max(0,Number(v.opacity??100))),
      x:Number(v.x??0),y:Number(v.y??0),width:Math.max(5,Math.min(200,Number(v.width??100))),
      rotation:Number(v.rotation??0),flipped:v.flipped===true,preset:String(v.preset??'original'),brightness:Number(v.brightness??100),contrast:Number(v.contrast??100),saturation:Number(v.saturation??100),lux:Number(v.lux??100),blur:Number(v.blur??0),temperature:Number(v.temperature??0),highlights:Number(v.highlights??100)}));
}

export type CreativeLayer={id:string;kind:'text'|'sticker'|'shape';value:string;name:string;x:number;y:number;width:number;fontSize:number;color:string;rotation:number;visible:boolean;locked:boolean;opacity:number;fontFamily?:string};
export const TEXT_FONT_STYLES = [{"name": "Tiêu chuẩn", "font": "Arial", "sample": "Aa"}, {"name": "Thanh lịch", "font": "Georgia", "sample": "Aa"}, {"name": "Bìa tạp chí", "font": "Times New Roman", "sample": "EDITORIAL"}, {"name": "Tiêu đề đậm", "font": "Impact", "sample": "POSTER"}, {"name": "Máy chữ", "font": "Courier New", "sample": "TYPE"}, {"name": "Tươi sáng", "font": "Trebuchet MS", "sample": "Creative"}, {"name": "Dễ đọc", "font": "Verdana", "sample": "Design"}, {"name": "Gọn gàng", "font": "Tahoma", "sample": "Minimal"}, {"name": "Cổ điển", "font": "Garamond", "sample": "Luxury"}, {"name": "Sang trọng", "font": "Palatino Linotype", "sample": "Classic"}, {"name": "Vui nhộn", "font": "Comic Sans MS", "sample": "Fun!"}, {"name": "Hiện đại", "font": "Segoe UI", "sample": "MODERN"}, {"name": "Trình bày", "font": "Cambria", "sample": "Serif"}, {"name": "Trẻ trung", "font": "Calibri", "sample": "Fresh"}, {"name": "Code", "font": "Consolas", "sample": "CODE"}, {"name": "Viết tay", "font": "Brush Script MT", "sample": "Script"}, {"name": "Tiêu đề nét đậm", "font": "Arial Black", "sample": "BOLD"}, {"name": "Mềm mại", "font": "Candara", "sample": "Softer"}, {"name": "Thư tín", "font": "Book Antiqua", "sample": "Letters"}, {"name": "Trang báo", "font": "Baskerville", "sample": "The News"}, {"name": "Tạp chí mới", "font": "Century Gothic", "sample": "Vogue"}, {"name": "Bền vững", "font": "Constantia", "sample": "Classic"}, {"name": "Đậm cổ điển", "font": "Franklin Gothic Medium", "sample": "STRONG"}, {"name": "Kỹ thuật", "font": "Lucida Console", "sample": "MONO"}] as const;

const presets:Record<string,string> = FILTER_MAP;
const imageFilter=(l:ImageLayer)=>`brightness(${((l.brightness??100)*(l.lux??100)/10000)*(1+((l.highlights??100)-100)/285)}) contrast(${l.contrast??100}%) saturate(${l.saturation??100}%) ${presets[l.preset??'original']??''} hue-rotate(${(l.temperature??0)/3}deg) blur(${l.blur??0}px)`;
const imageTransform=(l:ImageLayer)=>`rotate(${l.rotation??0}deg) scaleX(${l.flipped?-1:1})`;

function newLayer(asset: {assetId:number; url:string; originalFileName:string|null}, size=50): ImageLayer {
  return {id:`layer-${asset.assetId}-${Date.now()}`,assetId:asset.assetId,url:asset.url,
    name:asset.originalFileName||`Ảnh #${asset.assetId}`,visible:true,locked:false,opacity:100,
    x:size===100?0:25,y:size===100?0:25,width:size};
}
const loadImage = (src:string) => new Promise<HTMLImageElement>((resolve,reject)=>{
  const im=new Image(); im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Không đọc được ảnh: kiểm tra CORS Cloudinary.'));im.src=src;
});

// Match canvas export wrapping to on-screen word wrapping; preserve Vietnamese words.
function wrapCreativeLines(ctx:CanvasRenderingContext2D,text:string,maxWidth:number):string[]{
  const lines:string[]=[];
  for(const paragraph of text.split('\n')){
    if(!paragraph.trim()){lines.push('');continue;}
    let line='';
    for(const word of paragraph.split(/\s+/)){
      const candidate=line?line+' '+word:word;
      if(ctx.measureText(candidate).width<=maxWidth){line=candidate;continue;}
      if(line){lines.push(line);line='';}
      if(ctx.measureText(word).width<=maxWidth){line=word;continue;}
      // An unbroken word wider than the text box must wrap rather than overlap.
      for(const char of Array.from(word)){
        if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}
        line+=char;
      }
    }
    lines.push(line);
  }
  return lines;
}

export default function LayersWorkspace(props:{projectId:number; ready:boolean; originalAssetId:number|null; originalUrl:string|null; originalName:string; canvasWidth:number; canvasHeight:number; sourceDocument:Record<string,unknown>|null; active:boolean;panelOpen:boolean;onRequestOriginalImage:()=>void;onStatus:(message:string)=>void;projectName:string;ratio:string;zoom:number;exportCommand:number;historyCommand:{seq:number;action:'undo'|'redo'}|null;frameCommand:{seq:number;frame:string}|null;backgroundCommand:{seq:number;type:'transparent'|'color'|'image';color?:string}|null;groupFilterCommand:{seq:number;filter:string}|null;onHistoryAvailability:(undo:boolean,redo:boolean)=>void;onZoomChange:(zoom:number)=>void;layerBridgeRef:{current:N5LayerBridge};editCommand:{seq:number;patch:object}|null;creativeCommand:{seq:number;kind:'text'|'sticker'|'shape';value:string;fontFamily?:string}|null;creativeEditCommand:{seq:number;id:string;patch:Partial<CreativeLayer>}|null;imageLayerEditCommand:{seq:number;id:string;patch:Partial<ImageLayer>}|null;onSelectImageLayer:(value:{id:string;name:string;width:number;opacity:number;locked:boolean;isBase:boolean}|null)=>void;onSelectCreativeLayer:(value:{id:string;kind:'text'|'sticker'|'shape';value:string;fontFamily:string;color:string;fontSize:number;width:number;rotation:number;opacity:number;locked:boolean}|null)=>void;onSelectBackground:(value:{type:'transparent'|'color'|'image';color:string;url?:string})=>void;onSelectGroupFilter:(filter:string)=>void;onSelectImageEdits:(value:Record<string,number|string|boolean>,asset:{assetId:number;url:string;name:string})=>void}){
  const {projectId,ready,originalAssetId,originalUrl,originalName,canvasWidth,canvasHeight,sourceDocument,active,panelOpen,onRequestOriginalImage,onStatus,projectName,ratio,zoom,exportCommand,historyCommand,frameCommand,backgroundCommand,groupFilterCommand,onHistoryAvailability,onZoomChange,layerBridgeRef,editCommand,creativeCommand,creativeEditCommand,imageLayerEditCommand,onSelectImageLayer,onSelectCreativeLayer,onSelectBackground,onSelectGroupFilter,onSelectImageEdits}=props;
  const [layers,setLayers]=useState<ImageLayer[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [creative,setCreative]=useState<CreativeLayer[]>([]);
  const [frame,setFrame]=useState('none');
  // Non-destructive group filter. Render/Export treat the whole composition as one image.
  const [groupFilter,setGroupFilter]=useState('original');
  const [panelCollapsed,setPanelCollapsed]=useState(false);
  const [editingInline,setEditingInline]=useState<string|null>(null);
  const inlineRef=useRef<HTMLTextAreaElement>(null);
  const [pan,setPan]=useState({x:0,y:0});
  const panning=useRef<{x:number;y:number;panX:number;panY:number}|null>(null);
  const spaceDown=useRef(false);
  const [spaceHeld,setSpaceHeld]=useState(false);
  const nativeResolution=true;
  const [nativeAspect,setNativeAspect]=useState<number|null>(null);
  const [nativePixels,setNativePixels]=useState<{width:number;height:number}|null>(null);
  const resizeRef=useRef<{id:string;kind:'image'|'creative';clientX:number;width:number}|null>(null);
  const [historyPast,setHistoryPast]=useState<string[]>([]);
  const [historyFuture,setHistoryFuture]=useState<string[]>([]);
  const lastHistory=useRef({key:'',time:0});
  const [creativeSelected,setCreativeSelected]=useState<string|null>(null);
  const currentCreative=creative.find(c=>c.id===creativeSelected)||null;
  useEffect(()=>{
    if(currentCreative){
      onSelectCreativeLayer({id:currentCreative.id,kind:currentCreative.kind,value:currentCreative.value,fontFamily:currentCreative.fontFamily||'Arial',color:currentCreative.color,fontSize:currentCreative.fontSize,width:currentCreative.width,rotation:currentCreative.rotation,opacity:currentCreative.opacity,locked:currentCreative.locked});
    }else onSelectCreativeLayer(null);
  },[currentCreative?.id,currentCreative?.kind,currentCreative?.value,currentCreative?.fontFamily,currentCreative?.color,currentCreative?.fontSize,currentCreative?.width,currentCreative?.rotation,currentCreative?.opacity,currentCreative?.locked]);

  const lastEditSeq=useRef<number|null>(null);
  const lastCreativeSeq=useRef<number|null>(null);
  const lastCreativeEditSeq=useRef<number|null>(null);
  const lastImageEditSeq=useRef<number|null>(null);
  const lastHistorySeq=useRef<number|null>(null);
  const lastFrameSeq=useRef<number|null>(null);
  const lastBackgroundSeq=useRef<number|null>(null);
  const lastGroupFilterSeq=useRef<number|null>(null);
  const lastExportSeq=useRef(0);
  const [busy,setBusy]=useState(false);
  const [saveStatus,setSaveStatus]=useState('');
  const [hydrated,setHydrated]=useState(false);
  // Keep filter gallery selection synchronized with layer-history Undo/Redo.
  useEffect(()=>{if(hydrated)onSelectGroupFilter(groupFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[groupFilter,hydrated]);


  const fileRef=useRef<HTMLInputElement>(null);
  const backgroundRef=useRef<HTMLInputElement>(null);
  const [background,setBackground]=useState<{type:'transparent'|'color'|'image';color:string;url:string;assetId:number|null}>({type:'transparent',color:'#ffffff',url:'',assetId:null});

  const [deleteTarget,setDeleteTarget]=useState<string|null>(null);
  useEffect(()=>{onSelectBackground({type:background.type,color:background.color,url:background.url});},[background.type,background.color,background.url]);

  const stageRef=useRef<HTMLDivElement>(null);
  const dragRef=useRef<{id:string;x:number;y:number;startX:number;startY:number}|null>(null);
  const writeQueue=useRef<Promise<void>>(Promise.resolve());
  const suspended=useRef(false);
  const pendingSaveTimer=useRef<number|null>(null);
  const prevFingerprint=useRef('');
  const prevBg=useRef('');
  const prevCreative=useRef('');
  const prevFrame=useRef('none');
  const prevGroupFilter=useRef('original');
  const current=layers.find(l=>l.id===selected)||null;
  useEffect(()=>{
    onSelectImageLayer(current?{id:current.id,name:current.name,width:current.width,opacity:current.opacity,locked:current.locked,isBase:current.x===0&&current.y===0&&current.width===100}:null);
  },[current?.id,current?.name,current?.width,current?.opacity,current?.locked]);
  // Layer snapshots are local to the composition, preserving N3 objects/history.
  const currentSnapshot=JSON.stringify({layers,creative,background,frame,groupFilter});
  const snapshotRef=useRef(currentSnapshot);snapshotRef.current=currentSnapshot;
  const recordHistory=(key:string)=>{
    const now=Date.now();
    // Treat consecutive slider/text input changes as one user operation.
    if(lastHistory.current.key===key && now-lastHistory.current.time<650){lastHistory.current.time=now;return;}
    lastHistory.current={key,time:now};
    const previous=snapshotRef.current;
    setHistoryPast(p=>p.at(-1)===previous?p:[...p.slice(-39),previous]);setHistoryFuture([]);
  };
  const restoreSnapshot=(json:string)=>{
    try{const data=JSON.parse(json) as {layers:ImageLayer[];creative:CreativeLayer[];background:typeof background;frame:string;groupFilter?:string};
      setLayers(data.layers);setCreative(data.creative);setBackground(data.background);setFrame(data.frame);setGroupFilter(data.groupFilter??'original');
      setSelected(null);setCreativeSelected(null);setEditingInline(null);
    }catch(err){console.error('Cannot restore layer snapshot',err);}
  };
  const undoLayer=()=>{
    if(!historyPast.length)return;
    setHistoryFuture(v=>[...v.slice(-39),snapshotRef.current]);
    restoreSnapshot(historyPast[historyPast.length-1]);setHistoryPast(v=>v.slice(0,-1));lastHistory.current={key:'',time:0};
    onStatus('Đã hoàn tác thao tác Layers.');
  };
  const redoLayer=()=>{
    if(!historyFuture.length)return;
    setHistoryPast(v=>[...v.slice(-39),snapshotRef.current]);
    restoreSnapshot(historyFuture[historyFuture.length-1]);setHistoryFuture(v=>v.slice(0,-1));lastHistory.current={key:'',time:0};
    onStatus('Đã làm lại thao tác Layers.');
  };
  useEffect(()=>{onHistoryAvailability(historyPast.length>0,historyFuture.length>0);},[historyPast.length,historyFuture.length,onHistoryAvailability]);
  useEffect(()=>{if(!historyCommand||historyCommand.seq===lastHistorySeq.current)return;lastHistorySeq.current=historyCommand.seq;
    if(historyCommand.action==='undo')undoLayer();else redoLayer();
  // History is command-driven: react only to new command sequence.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[historyCommand]);
  useEffect(()=>{if(!frameCommand||frameCommand.seq===lastFrameSeq.current||!hydrated)return;
    lastFrameSeq.current=frameCommand.seq;recordHistory('frame');setFrame(frameCommand.frame);onStatus('Đã đổi khung ảnh.');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[frameCommand,hydrated]);
  useEffect(()=>{if(!backgroundCommand||backgroundCommand.seq===lastBackgroundSeq.current||!hydrated)return;
    lastBackgroundSeq.current=backgroundCommand.seq;
    if(backgroundCommand.type==='image'&&!background.url){backgroundRef.current?.click();return;}
    recordHistory('background');setBackground(b=>({...b,type:backgroundCommand.type,color:backgroundCommand.color??b.color}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[backgroundCommand,hydrated]);
  useEffect(()=>{if(!groupFilterCommand||groupFilterCommand.seq===lastGroupFilterSeq.current||!hydrated)return;
    lastGroupFilterSeq.current=groupFilterCommand.seq;
    if(groupFilterCommand.filter!==groupFilter){recordHistory('group-filter');setGroupFilter(groupFilterCommand.filter);}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[groupFilterCommand,hydrated]);
  useEffect(()=>{if(!editingInline)return;inlineRef.current?.focus();inlineRef.current?.select();},[editingInline]);
  useEffect(()=>{const down=(e:KeyboardEvent)=>{
      if(e.code!=='Space'||(e.target as HTMLElement|null)?.closest('input,textarea,[contenteditable="true"]'))return;
      e.preventDefault();spaceDown.current=true;setSpaceHeld(true);
    };
    const up=(e:KeyboardEvent)=>{if(e.code==='Space'){spaceDown.current=false;setSpaceHeld(false);panning.current=null;}};
    const blur=()=>{spaceDown.current=false;setSpaceHeld(false);panning.current=null;};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);};
  },[]);
  const startPan=(e:PointerEvent<HTMLDivElement>)=>{
    if(!spaceDown.current && e.button!==1)return;
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);
    panning.current={x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y};
  };
  const movePan=(e:PointerEvent<HTMLDivElement>)=>{
    const v=panning.current;if(!v)return;
    setPan({x:v.panX+e.clientX-v.x,y:v.panY+e.clientY-v.y});
  };
  const wheelZoom=(e:WheelEvent<HTMLDivElement>)=>{
    if(!e.ctrlKey&&!e.metaKey)return;
    e.preventDefault();onZoomChange(Math.min(1600,Math.max(50,zoom+(e.deltaY<0?4:-4))));
  };
  const startResize=(e:PointerEvent<HTMLButtonElement>,id:string,kind:'image'|'creative',width:number)=>{
    e.stopPropagation();e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);recordHistory('resize-'+id);resizeRef.current={id,kind,clientX:e.clientX,width};
  };
  const moveResize=(e:PointerEvent<HTMLButtonElement>)=>{
    const value=resizeRef.current,rect=stageRef.current?.getBoundingClientRect();if(!value||!rect)return;
    const next=Math.min(200,Math.max(5,value.width+(e.clientX-value.clientX)/rect.width*100));
    if(value.kind==='image')setLayers(items=>items.map(l=>l.id===value.id?{...l,width:next}:l));
    else setCreative(items=>items.map(l=>l.id===value.id?{...l,width:next}:l));
  };
  // V4.7: one authoritative photo for aspect ratio, native resolution and PNG export.
  // Previously preview selected the first 100% image while export selected the last:
  // in multi-layer projects this could use the wrong source dimensions.
  const storedComposition=isObj(sourceDocument?.n1Composition)?sourceDocument.n1Composition:{};
  const storedPrimary=Number(storedComposition.primaryAssetId);
  const lastUpscale=isObj(storedComposition.lastUpscale)?storedComposition.lastUpscale:null;
  const fullFrame=(l:ImageLayer)=>l.visible&&l.x===0&&l.y===0&&l.width===100;
  const primaryPhoto=layers.find(l=>fullFrame(l)&&Number.isSafeInteger(storedPrimary)&&storedPrimary>0&&l.assetId===storedPrimary)
    ||layers.find(l=>fullFrame(l)&&l.assetId===originalAssetId)
    ||[...layers].reverse().find(fullFrame)
    ||layers.find(l=>l.visible);
  const topImageUrl=primaryPhoto?.url||null;
  const hasBasePhoto=(l:ImageLayer)=>primaryPhoto?.id===l.id&&fullFrame(l);
  useEffect(()=>{
    if(!topImageUrl){setNativeAspect(null);setNativePixels(null);return;}
    let current=true;
    void loadImage(topImageUrl).then(img=>{
      if(!current)return;
      setNativePixels({width:img.naturalWidth,height:img.naturalHeight});
      setNativeAspect(img.naturalWidth/Math.max(1,img.naturalHeight));
    }).catch(()=>{if(current){setNativeAspect(null);setNativePixels(null);}});
    return()=>{current=false;};
  },[topImageUrl]);
  const aspect=ratio==='Tự do'?(nativeAspect||Math.max(1,canvasWidth)/Math.max(1,canvasHeight)):(
    /^\d+:\d+$/.test(ratio)?Number(ratio.split(':')[0])/Number(ratio.split(':')[1]):Math.max(1,canvasWidth)/Math.max(1,canvasHeight));
  const selectImage=(l:ImageLayer)=>{setCreativeSelected(null);setSelected(l.id);onSelectImageEdits({rotation:l.rotation??0,flipped:l.flipped??false,brightness:l.brightness??100,contrast:l.contrast??100,saturation:l.saturation??100,lux:l.lux??100,blur:l.blur??0,temperature:l.temperature??0,highlights:l.highlights??100},{assetId:l.assetId,url:l.url,name:l.name});};
  useEffect(()=>{if(!editCommand||lastEditSeq.current===editCommand.seq||!hydrated)return;lastEditSeq.current=editCommand.seq;
    if(!selected)return;
    const patch=Object.fromEntries(Object.entries(editCommand.patch).filter(([key])=>['rotation','flipped','preset','brightness','contrast','saturation','lux','blur','temperature','highlights'].includes(key)));
    if(Object.keys(patch).length){recordHistory('image-edits');setLayers(prev=>prev.map(l=>l.id===selected&&!l.locked?{...l,...patch}:l));}
  },[editCommand,selected,hydrated]);
  useEffect(()=>{if(!creativeCommand||lastCreativeSeq.current===creativeCommand.seq||!hydrated)return;lastCreativeSeq.current=creativeCommand.seq;
    const item:CreativeLayer={id:`creative-${creativeCommand.seq}`,kind:creativeCommand.kind,value:creativeCommand.value,name:creativeCommand.kind==='text'?'Văn bản':creativeCommand.kind==='shape'?'Hình khối':'Sticker',x:35,y:35,width:creativeCommand.kind==='text'?45:20,fontSize:creativeCommand.kind==='sticker'?64:42,color:'#ffffff',rotation:0,visible:true,locked:false,opacity:100,fontFamily:creativeCommand.fontFamily||'Arial'};
    recordHistory('create-'+item.id);setCreative(prev=>[...prev,item]);setSelected(null);setCreativeSelected(item.id);if(item.kind==='text'||item.kind==='sticker')setEditingInline(item.id);
  },[creativeCommand,hydrated]);
  const updateCreative=(id:string,patch:Partial<CreativeLayer>)=>{if(creative.find(l=>l.id===id)?.locked && patch.locked===undefined && patch.visible===undefined)return;recordHistory('creative-'+id);setCreative(prev=>prev.map(l=>l.id===id?{...l,...patch}:l));};
  useEffect(()=>{
    if(!creativeEditCommand || lastCreativeEditSeq.current===creativeEditCommand.seq || !hydrated)return;
    lastCreativeEditSeq.current=creativeEditCommand.seq;
    const item=creative.find(l=>l.id===creativeEditCommand.id);
    if(!item||item.locked)return;
    const permitted=['value','fontFamily','color','fontSize','width','rotation','opacity'];
    const patch=Object.fromEntries(Object.entries(creativeEditCommand.patch).filter(([key])=>permitted.includes(key))) as Partial<CreativeLayer>;
    if(Object.keys(patch).length)updateCreative(item.id,patch);
  },[creativeEditCommand,hydrated]);
  useEffect(()=>{
    if(!ready||!sourceDocument)return;
    const existing=readComposition(sourceDocument);
    const initial=existing.length?existing:(originalAssetId&&originalUrl?[newLayer({assetId:originalAssetId,url:originalUrl,originalFileName:originalName},100)]:[]);
    setLayers(initial);setSelected(initial.at(-1)?.id||null);prevFingerprint.current=JSON.stringify(existing);
    const composition=isObj(sourceDocument.n1Composition)?sourceDocument.n1Composition:{};
    const savedCreative=Array.isArray(composition.creative)?composition.creative.filter(isObj).filter(v=>['text','shape','sticker'].includes(String(v.kind))).map(v=>({...v,id:String(v.id),kind:String(v.kind),value:String(v.value??''),name:String(v.name??''),x:Number(v.x??25),y:Number(v.y??25),width:Number(v.width??35),fontSize:Number(v.fontSize??42),color:String(v.color??'#ffffff'),rotation:Number(v.rotation??0),visible:v.visible!==false,locked:v.locked===true,opacity:Number(v.opacity??100),fontFamily:String(v.fontFamily??'Arial')}) as CreativeLayer):[];
    setCreative(savedCreative);prevCreative.current=JSON.stringify(savedCreative);setFrame(typeof composition.frame==='string'?composition.frame:'none');prevFrame.current=typeof composition.frame==='string'?composition.frame:'none';
    const restoredGroupFilter=typeof composition.groupFilter==='string'&&Object.prototype.hasOwnProperty.call(FILTER_MAP,composition.groupFilter)?composition.groupFilter:'original';
    setGroupFilter(restoredGroupFilter);prevGroupFilter.current=restoredGroupFilter;onSelectGroupFilter(restoredGroupFilter);
    const bg=isObj(sourceDocument.n1Composition) ? sourceDocument.n1Composition.background : null;
    if(isObj(bg)) setBackground({type:bg.type==='color'||bg.type==='image'?bg.type:'transparent',color:typeof bg.color==='string'?bg.color:'#ffffff',url:typeof bg.url==='string'?bg.url:'',assetId:typeof bg.assetId==='number'?bg.assetId:null});

    prevBg.current=JSON.stringify(isObj(sourceDocument.n1Composition)?sourceDocument.n1Composition.background??null:null);
    setHistoryPast([]);setHistoryFuture([]);setPan({x:0,y:0});setHydrated(true);
  // Hydrate only when opening a different project, not every time n1Editor autosaves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,ready]);
  useEffect(()=>{
    if(!ready||!hydrated||suspended.current)return;
    const fingerprint=JSON.stringify(layers);
    if(fingerprint===prevFingerprint.current && JSON.stringify(background)===prevBg.current && JSON.stringify(creative)===prevCreative.current && frame===prevFrame.current && groupFilter===prevGroupFilter.current)return;
    setSaveStatus('Đang chờ lưu...');
    const timer=window.setTimeout(()=>{
      const snapshot=layers.map(l=>({...l}));
      const bgSnapshot={...background};
      const filterSnapshot=groupFilter;
      const creativeSnapshot=creative.map(v=>({...v}));
      const next=writeQueue.current.catch(()=>{}).then(async()=>{
        const latest=await editorStateApi.load(projectId);
        await editorStateApi.save(projectId,{...latest,n1Composition:{...(isObj(latest.n1Composition)?latest.n1Composition:{}),version:1,layers:snapshot,background:bgSnapshot,creative:creativeSnapshot,frame,groupFilter:filterSnapshot}});
        prevFingerprint.current=JSON.stringify(snapshot);prevBg.current=JSON.stringify(bgSnapshot);prevCreative.current=JSON.stringify(creativeSnapshot);prevFrame.current=frame;prevGroupFilter.current=filterSnapshot;
      });
      writeQueue.current=next;
      setSaveStatus('Đang lưu...');
      void next.then(()=>setSaveStatus('Đã lưu Layers ✓')).catch(()=>setSaveStatus('Lưu Layers lỗi — hãy thử thay đổi lại'));
    },850);pendingSaveTimer.current=timer;
    return ()=>{window.clearTimeout(timer);if(pendingSaveTimer.current===timer)pendingSaveTimer.current=null;};
  },[layers,background,creative,frame,groupFilter,projectId,ready,hydrated]);
  // Flush composition before N4 Attach; this prevents an in-flight debounce write
  // from overwriting the AI result's new layer during the following reload.
  const flushLayers=async()=>{
    if(!ready||!hydrated)return;
    if(pendingSaveTimer.current){window.clearTimeout(pendingSaveTimer.current);pendingSaveTimer.current=null;}
    await writeQueue.current.catch(()=>{});
    const snapshot=layers.map(l=>({...l})),bg={...background},cre=creative.map(c=>({...c}));
    const latest=await editorStateApi.load(projectId);
    await editorStateApi.save(projectId,{...latest,n1Composition:{...(isObj(latest.n1Composition)?latest.n1Composition:{}),version:1,layers:snapshot,background:bg,creative:cre,frame,groupFilter}});
    prevFingerprint.current=JSON.stringify(snapshot);prevBg.current=JSON.stringify(bg);prevCreative.current=JSON.stringify(cre);prevFrame.current=frame;prevGroupFilter.current=groupFilter;
  };
  /** N5 Tool Adapter: one atomic N1 composition write, retaining editable layers and Undo. */
  const applyN5Commands=async(steps:Step[],expectedStateVersion:number)=>{
    if(!ready||!hydrated)throw new Error('Editor chưa tải xong. Hãy chờ ảnh hiện ra.');
    // Fully validate/prepare all operations before mutating either React state or MySQL.
    const next=applyEditableCommands({layers,creative,background,frame,groupFilter},steps,selected);
    await flushLayers();
    const version=await geminiJobsApi.context(projectId);
    if(version.stateVersion!==expectedStateVersion)
      throw new Error('Project đã thay đổi kể từ lúc tạo bản xem trước. Hãy nhập lại lệnh để tránh ghi đè.');
    const latest=await editorStateApi.load(projectId);
    const composition=isObj(latest.n1Composition)?latest.n1Composition:{};
    await editorStateApi.save(projectId,{...latest,n1Composition:{...composition,version:1,
      layers:next.layers,creative:next.creative,background:next.background,
      frame:next.frame,groupFilter:next.groupFilter}},expectedStateVersion);
    // The persisted write succeeded; now publish one undoable N1 editor operation.
    recordHistory('n5-'+Date.now());
    setLayers(next.layers);setCreative(next.creative);setBackground(next.background);
    setFrame(next.frame);setGroupFilter(next.groupFilter);
    prevFingerprint.current=JSON.stringify(next.layers);
    prevBg.current=JSON.stringify(next.background);
    prevCreative.current=JSON.stringify(next.creative);
    prevFrame.current=next.frame;
    prevGroupFilter.current=next.groupFilter;
    onStatus(`Đã thực hiện ${steps.length} thao tác bằng công cụ Editor, giữ nguyên các layer và Undo/Redo.`);
  };
  layerBridgeRef.current={flush:flushLayers,prepare:async()=>{suspended.current=true;await flushLayers();},resume:()=>{suspended.current=false;},renderPng:()=>exportPng(false),pickImage:()=>fileRef.current?.click(),pickBackground:()=>backgroundRef.current?.click(),applyCommands:applyN5Commands,
    previewCommands:(steps)=>exportPng(false,applyEditableCommands({layers,creative,background,frame,groupFilter},steps,selected))};
  // When the first image is uploaded after an initially empty Project, seed the canvas.
  useEffect(()=>{
    if(!hydrated||!ready||!originalAssetId||!originalUrl)return;
    setLayers(items=>items.length?items:[newLayer({assetId:originalAssetId,url:originalUrl,originalFileName:originalName},100)]);
  },[hydrated,ready,originalAssetId,originalUrl,originalName]);
  const update=(id:string,patch:Partial<ImageLayer>)=>{if(layers.find(l=>l.id===id)?.locked && patch.locked===undefined && patch.visible===undefined)return;recordHistory('layer-'+id);setLayers(items=>items.map(l=>l.id===id?{...l,...patch}:l));};
  useEffect(()=>{
    if(!imageLayerEditCommand||lastImageEditSeq.current===imageLayerEditCommand.seq||!hydrated)return;
    lastImageEditSeq.current=imageLayerEditCommand.seq;
    const photo=layers.find(x=>x.id===imageLayerEditCommand.id);
    if(!photo||photo.locked)return;
    const patch=Object.fromEntries(Object.entries(imageLayerEditCommand.patch).filter(([key])=>['name','width','opacity'].includes(key))) as Partial<ImageLayer>;
    if(photo.x===0&&photo.y===0&&photo.width===100)delete patch.width;
    if(Object.keys(patch).length)update(photo.id,patch);
  },[imageLayerEditCommand,hydrated]);
  const addFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file||!ready)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){onStatus('Chỉ hỗ trợ ảnh JPG, PNG, WebP tối đa 20 MB');return;}
    setBusy(true);
    try{
      const uploaded=await assetApi.upload(projectId,file,'IMAGE');
      const l=newLayer(uploaded);recordHistory('add-image');setLayers(v=>[...v,l]);selectImage(l);
      onStatus('Đã thêm ảnh mới vào Layers và tải lên Project.');
    }catch(err){console.error(err);onStatus('Thêm layer thất bại. Kiểm tra quyền Project hoặc Cloudinary.');}
    finally{setBusy(false);}
  };
  const addBackgroundFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; e.target.value=''; if(!file||!ready)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){onStatus('Nền chỉ hỗ trợ JPG, PNG, WebP tối đa 20 MB');return;}
    setBusy(true);
    try{const uploaded=await assetApi.upload(projectId,file,'IMAGE');recordHistory('new-background');setBackground({type:'image',color:'#ffffff',url:uploaded.url,assetId:uploaded.assetId});onStatus('Đã tải ảnh nền vào Project. Nếu chưa nhìn thấy nền mới, hãy xóa nền ảnh chính bằng N4 và áp dụng kết quả để lộ nền bên dưới.');}
    catch(err){console.error(err);onStatus('Không tải được ảnh nền lên Project.');}finally{setBusy(false);}
  };
  const deleteLayer=(id:string)=>{recordHistory('delete-layer');setLayers(v=>v.filter(l=>l.id!==id));setSelected(v=>v===id?null:v);setDeleteTarget(null);};
  const onDragStart=(e:PointerEvent<HTMLElement>,layer:ImageLayer)=>{
    if(layer.locked)return;if(hasBasePhoto(layer)){selectImage(layer);return;}e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    recordHistory('drag-image');dragRef.current={id:layer.id,x:e.clientX,y:e.clientY,startX:layer.x,startY:layer.y};selectImage(layer);
  };
  const onDragMove=(e:PointerEvent<HTMLElement>)=>{
    const d=dragRef.current,rect=stageRef.current?.getBoundingClientRect();if(!d||!rect)return;
    setLayers(items=>items.map(l=>l.id===d.id?{...l,x:d.startX+(e.clientX-d.x)/rect.width*100,y:d.startY+(e.clientY-d.y)/rect.height*100}:l));
  };
  const creativeDragRef=useRef<{id:string;x:number;y:number;startX:number;startY:number}|null>(null);
  const dragCreativeStart=(e:PointerEvent<HTMLDivElement>,l:CreativeLayer)=>{if(l.locked)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);recordHistory('drag-creative');creativeDragRef.current={id:l.id,x:e.clientX,y:e.clientY,startX:l.x,startY:l.y};setSelected(null);setCreativeSelected(l.id);};
  const dragCreativeMove=(e:PointerEvent<HTMLDivElement>)=>{const d=creativeDragRef.current,rect=stageRef.current?.getBoundingClientRect();if(!d||!rect)return;setCreative(items=>items.map(l=>l.id===d.id?{...l,x:d.startX+(e.clientX-d.x)/rect.width*100,y:d.startY+(e.clientY-d.y)/rect.height*100}:l));};
  const move=(id:string,delta:number)=>{recordHistory('order');setLayers(items=>{const index=items.findIndex(l=>l.id===id),at=index+delta;
    if(index<0||at<0||at>=items.length)return items;
    const copy=[...items];[copy[index],copy[at]]=[copy[at],copy[index]];return copy;
  });};
  const outputPixels=(()=>{
    if(!nativePixels||!primaryPhoto)return null;
    let w=nativePixels.width,h=nativePixels.height;
    if(ratio!=='Tự do'){
      if(w/h>aspect)w=Math.max(1,Math.round(h*aspect));
      else h=Math.max(1,Math.round(w/aspect));
    }
    return {width:w,height:h};
  })();
  const zoomToNativePixels=()=>{
    if(!nativePixels||!stageRef.current){onStatus('Chưa đọc được pixel gốc để xem tỷ lệ 1:1.');return;}
    const shownWidth=stageRef.current.getBoundingClientRect().width/(zoom/100);
    if(shownWidth<1)return;
    // 100% pixel means one native image pixel per CSS pixel, not "fit to view".
    onZoomChange(Math.min(1600,Math.max(50,Math.round(nativePixels.width/shownWidth*100))));
    onStatus(`Xem pixel thật 1:1: ${nativePixels.width}×${nativePixels.height}. Giữ Space để kéo ảnh.`);
  };
  const exportPng=async(download=true,preview?:{layers:ImageLayer[];creative:CreativeLayer[];background:typeof background;frame:string;groupFilter:string}):Promise<Blob>=>{
    const renderLayers=preview?.layers??layers,renderCreative=preview?.creative??creative;
    const renderBackground=preview?.background??background,renderFrame=preview?.frame??frame;
    const renderGroupFilter=preview?.groupFilter??groupFilter;
    if(!renderLayers.length&&!renderCreative.length)throw new Error('Không có lớp ảnh để kết xuất');setBusy(true);
    try{
      let w=Math.max(1,canvasWidth||1024),h=Math.max(1,Math.round(w/aspect));
      // The photo sets output pixels even when text, frames, or other layers exist.
      // Crop the original pixels to the chosen aspect: no blank margins or upscaling.
      if(nativeResolution&&renderLayers.length){
        const photo=primaryPhoto&&hasBasePhoto(primaryPhoto)?primaryPhoto:null;
        if(photo){
          const actual=await loadImage(photo.url);
          w=actual.naturalWidth;h=actual.naturalHeight;
          if(ratio!=='Tự do'){
            if(w/h>aspect)w=Math.max(1,Math.round(h*aspect));
            else h=Math.max(1,Math.round(w/aspect));
          }
        }
      }
      if(w*h>80000000)throw new Error('Export size exceeds 80 megapixels');
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
      if(renderBackground.type==='color'){ctx.fillStyle=renderBackground.color;ctx.fillRect(0,0,w,h);}
      if(renderBackground.type==='image'&&renderBackground.url){
        const bg=await loadImage(renderBackground.url);const scale=Math.max(w/bg.naturalWidth,h/bg.naturalHeight);
        const bw=bg.naturalWidth*scale,bh=bg.naturalHeight*scale;
        ctx.drawImage(bg,(w-bw)/2,(h-bh)/2,bw,bh);
      }
      for(const l of renderLayers){if(!l.visible)continue;
        const img=await loadImage(l.url);ctx.globalAlpha=l.opacity/100;
        const dw=w*l.width/100,dh=dw*img.naturalHeight/img.naturalWidth;
        ctx.save();ctx.translate(w*l.x/100+dw/2,h*l.y/100+dh/2);ctx.rotate((l.rotation??0)*Math.PI/180);ctx.scale(l.flipped?-1:1,1);ctx.filter=imageFilter(l);
        if (hasBasePhoto(l)) {
          const sourceAspect=img.naturalWidth/img.naturalHeight;let sx=0,sy=0,sw=img.naturalWidth,sh=img.naturalHeight;
          if(sourceAspect>aspect){sw=img.naturalHeight*aspect;sx=(img.naturalWidth-sw)/2;}
          else if(sourceAspect<aspect){sh=img.naturalWidth/aspect;sy=(img.naturalHeight-sh)/2;}
          ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-h/2,dw,h);
        } else ctx.drawImage(img,-dw/2,-dh/2,dw,dh);
        ctx.restore();
      }
      ctx.globalAlpha=1;
      for(const l of renderCreative){if(!l.visible)continue;ctx.save();ctx.globalAlpha=l.opacity/100;
        ctx.translate(w*l.x/100,h*l.y/100);ctx.rotate(l.rotation*Math.PI/180);ctx.fillStyle=l.color;
        if(l.kind==='text'||l.kind==='sticker'){const font=Math.round(l.fontSize*w/1024);ctx.font=`${l.kind==='text'?'bold ':''}${font}px "${(l.fontFamily||'Arial').replaceAll('\"','')}", sans-serif`;ctx.textBaseline='top';const wrapped=wrapCreativeLines(ctx,l.value,Math.max(10,w*l.width/100));for(const [i,line] of wrapped.entries())ctx.fillText(line,0,i*font*1.48);}
        else {const size=w*l.width/100;ctx.strokeStyle=l.color;ctx.lineWidth=Math.max(2,w/512);ctx.beginPath();if(l.value==='circle'||l.value==='ellipse'){ctx.ellipse(size/2,size/2,size/2,l.value==='ellipse'?size/3:size/2,0,0,Math.PI*2);}else{ctx.rect(0,0,size,size);}ctx.stroke();}
        ctx.restore();}
      // Template frame is drawn AFTER the image stack so export matches the preview.
      if(renderFrame!=='none'){
        ctx.save();ctx.globalAlpha=1;ctx.filter='none';ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(10,w*.025);
        if(renderFrame==='simple'){ctx.strokeRect(ctx.lineWidth/2,ctx.lineWidth/2,w-ctx.lineWidth,h-ctx.lineWidth);}
        if(renderFrame==='polaroid'){ctx.fillStyle='#fff';const border=Math.round(w*.055);ctx.fillRect(0,0,w,border);ctx.fillRect(0,0,border,h);ctx.fillRect(w-border,0,border,h);ctx.fillRect(0,h-Math.round(w*.16),w,Math.round(w*.16));}
        if(renderFrame==='film'){ctx.fillStyle='#151515';const b=Math.round(w*.07);ctx.fillRect(0,0,w,b);ctx.fillRect(0,h-b,w,b);ctx.fillStyle='#f4f4f4';for(let x=b/2;x<w;x+=b*2){ctx.fillRect(x,Math.round(b*.24),b*.65,b*.52);ctx.fillRect(x,h-Math.round(b*.76),b*.65,b*.52);}}
        if(['minimal','gold','noir','editorial','rounded','double','vintage','neon','pastel','postcard'].includes(renderFrame)){
          const pad=Math.max(5,w*.032);
          const line=(color:string,width:number,space:number)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.strokeRect(space,space,w-2*space,h-2*space);};
          if(renderFrame==='minimal')line('#ffffff',Math.max(3,w*.008),pad);
          if(renderFrame==='gold'){line('#e4b75c',Math.max(6,w*.015),pad);line('#fff4c8',Math.max(2,w*.004),pad+w*.025);}
          if(renderFrame==='noir'){line('#15151d',Math.max(16,w*.06),pad);line('#f9f9ff',Math.max(2,w*.003),pad+w*.025);}
          if(renderFrame==='editorial'){line('#ffffff',Math.max(10,w*.045),pad);ctx.fillStyle='#fff';ctx.fillRect(0,h*.86,w,h*.14);ctx.fillStyle='#222';ctx.font=`bold ${Math.max(14,Math.round(w*.037))}px Georgia`;ctx.fillText('THE PHOTO EDIT',w*.07,h*.93);}
          if(renderFrame==='rounded'){ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(12,w*.033);ctx.beginPath();ctx.roundRect(pad,pad,w-pad*2,h-pad*2,Math.max(16,w*.07));ctx.stroke();}
          if(renderFrame==='double'){line('#fff',Math.max(4,w*.014),pad);line('#fff',Math.max(2,w*.006),pad+w*.05);}
          if(renderFrame==='vintage'){line('#b58b65',Math.max(13,w*.05),pad);line('#f1ddbf',Math.max(3,w*.009),pad+w*.036);}
          if(renderFrame==='neon'){ctx.shadowColor='#e95cfd';ctx.shadowBlur=w*.04;line('#dd89f9',Math.max(5,w*.012),pad);ctx.shadowBlur=0;}
          if(renderFrame==='pastel'){line('#e8c8ed',Math.max(14,w*.05),pad);line('#ffffff',Math.max(3,w*.008),pad+w*.035);}
          if(renderFrame==='postcard'){ctx.fillStyle='#fff7ec';ctx.fillRect(0,h*.82,w,h*.18);ctx.fillStyle='#a26550';ctx.font=`${Math.max(12,Math.round(w*.035))}px Georgia`;ctx.fillText('WISH YOU WERE HERE',w*.06,h*.92);line('#fff7ec',Math.max(4,w*.012),pad);}
        }

        ctx.restore();
      }
      // One global filter AFTER compositing: background, photos, text, stickers and frame.
      // Keep editable layer data; do not rasterize it into Project/Cloudinary.
      const groupCss=FILTER_MAP[renderGroupFilter]??'none';
      if(groupCss!=='none'){
        const merged=document.createElement('canvas');merged.width=w;merged.height=h;
        const mergedCtx=merged.getContext('2d');if(!mergedCtx)throw new Error('Group filter canvas unavailable');
        mergedCtx.filter=groupCss;mergedCtx.drawImage(canvas,0,0);
        ctx.clearRect(0,0,w,h);ctx.filter='none';ctx.globalAlpha=1;ctx.drawImage(merged,0,0);
      }
      const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));
      if(!blob)throw new Error('PNG export failed');
      if(download){
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${projectName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'')||'project'}.png`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
        onStatus(`Đã xuất ${w}×${h} PNG theo tên Project, gồm ảnh, chữ, sticker và nền.`);
      }
      return blob;
    }catch(err){console.error(err);onStatus('Kết xuất ảnh ghép thất bại. Kiểm tra CORS của ảnh Cloudinary.');throw err;}
    finally{setBusy(false);}
  };
  useEffect(()=>{if(!exportCommand||exportCommand===lastExportSeq.current||!hydrated)return;lastExportSeq.current=exportCommand;void exportPng().catch(()=>{});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[exportCommand]);
  return <>
    <input type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void addFile(e)}/>
    <input type="file" ref={backgroundRef} accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void addBackgroundFile(e)}/>
    {active&&<div className={`n1-layer-stage-shell ${spaceHeld?'n1-pan-mode':''}`} onWheel={wheelZoom} onPointerDownCapture={startPan} onPointerMove={movePan} onPointerUp={()=>{panning.current=null}} onPointerCancel={()=>{panning.current=null}}>
      <div className="n1-native-resolution" role="status" aria-live="polite">
        {nativePixels&&outputPixels?<>
          <span>Ảnh chính: <strong>{nativePixels.width} × {nativePixels.height} px</strong>{lastUpscale&&Number(lastUpscale.assetId)===primaryPhoto?.assetId&&[2,4].includes(Number(lastUpscale.scale))?` · AI ×${Number(lastUpscale.scale)} đã áp dụng`:''}</span>
          <span>Xuất PNG: <strong>{outputPixels.width} × {outputPixels.height} px</strong>{ratio!=='Tự do'?' (đã crop)':''}</span>
          <button type="button" onClick={zoomToNativePixels} title="Phóng đến kích thước pixel thật, Space + kéo để di chuyển">Xem 1:1 pixel</button>
        </>:<span>Đang đọc kích thước ảnh gốc…</span>}
      </div>
      {!layers.length && !creative.length && <div className="v43-photo-onboard"><ImagePlus size={32}/><h2>Chọn ảnh để bắt đầu chỉnh sửa</h2><p>Ảnh đầu tiên sẽ làm lớp ảnh gốc. Khung làm việc tự theo tỷ lệ ảnh, không ép nền trắng.</p><button type="button" onClick={onRequestOriginalImage} disabled={!ready||busy}>Chọn ảnh từ máy</button></div>}
      <div className="n1-stage-viewport" style={{width:`min(100%, ${Math.max(10,Math.round(90*aspect))}cqh)`,transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom/100})`,visibility:!layers.length&&!creative.length?'hidden':undefined}}>
      <div ref={stageRef} className="n1-layer-stage" style={{background:background.type==='color'?background.color:'transparent',aspectRatio:String(aspect),filter:FILTER_MAP[groupFilter]??'none'}}>
      {background.type==='image'&&background.url&&<img className="n1-background-image" src={background.url} alt="Ảnh nền" draggable={false}/>}
      {layers.filter(l=>l.visible).map(l=><img key={l.id} draggable={false} alt={l.name} src={l.url}
        className={`n1-layer-canvas-image ${selected===l.id?'selected':''}`} style={{left:hasBasePhoto(l)?'0%':`${l.x}%`,top:hasBasePhoto(l)?'0%':`${l.y}%`,width:`${l.width}%`,height:hasBasePhoto(l)?'100%':undefined,objectFit:hasBasePhoto(l)?'cover':undefined,opacity:l.opacity/100,zIndex:layers.indexOf(l)+1,cursor:l.locked?'default':'grab',filter:imageFilter(l),transform:imageTransform(l)}}
        onPointerDown={e=>onDragStart(e,l)} onPointerMove={onDragMove} onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}/>)}
      {current&&current.visible&&!current.locked&&!hasBasePhoto(current)&&<button className="n1-resize-handle" type="button" title="Kéo ngang để thay đổi kích thước layer" aria-label="Thay đổi kích thước layer"
        style={{left:`${current.x+current.width}%`,top:`${current.y}%`,zIndex:600}}
        onPointerDown={e=>startResize(e,current.id,'image',current.width)} onPointerMove={moveResize} onPointerUp={()=>{resizeRef.current=null}} onPointerCancel={()=>{resizeRef.current=null}}>⇲</button>}

      {creative.filter(l=>l.visible).map(l=><div key={l.id} className={`n1-creative-object ${creativeSelected===l.id?'selected':''}`} onPointerDown={e=>dragCreativeStart(e,l)} onPointerMove={dragCreativeMove} onPointerUp={()=>{creativeDragRef.current=null}} onPointerCancel={()=>{creativeDragRef.current=null}}
        style={{left:`${l.x}%`,top:`${l.y}%`,width:`${l.width}%`,color:l.color,opacity:l.opacity/100,fontSize:`${l.fontSize/1024*100}cqw`,fontFamily:l.fontFamily||'Arial',lineHeight:1.48,overflowWrap:'break-word',wordBreak:'normal',transform:`rotate(${l.rotation}deg)`,zIndex:100+creative.indexOf(l),cursor:l.locked?'default':'move'}} onDoubleClick={()=>{if(!l.locked&&(l.kind==='text'||l.kind==='sticker'))setEditingInline(l.id)}}>
        {editingInline===l.id&&(l.kind==='text'||l.kind==='sticker')?
          <textarea ref={inlineRef} className="n1-inline-editor" rows={l.kind==='text'?3:1} value={l.value}
            onPointerDown={e=>e.stopPropagation()} onChange={e=>updateCreative(l.id,{value:e.target.value})}
            onBlur={()=>setEditingInline(null)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setEditingInline(null)}}}/>
          :l.kind==='text'?<span style={{whiteSpace:'pre-wrap',overflowWrap:'break-word',wordBreak:'normal',lineHeight:1.48}}>{l.value}</span>:l.kind==='sticker'?<span>{l.value}</span>:<div className={`n1-shape n1-shape-${l.value}`} style={{borderColor:l.color}}/>}
      </div>)}
      {currentCreative&&currentCreative.visible&&!currentCreative.locked&&<button className="n1-resize-handle" type="button" title="Kéo để thay đổi kích thước chữ / sticker" aria-label="Thay đổi kích thước đối tượng" style={{left:`${currentCreative.x+currentCreative.width}%`,top:`${currentCreative.y}%`,zIndex:900}} onPointerDown={e=>startResize(e,currentCreative.id,'creative',currentCreative.width)} onPointerMove={moveResize} onPointerUp={()=>{resizeRef.current=null}} onPointerCancel={()=>{resizeRef.current=null}}>⇲</button>}
      {frame!=='none'&&<div className={`n1-template-frame n1-frame-${frame}`} aria-hidden="true"/>}
    </div></div></div>}
    <aside className={`n1-layers-panel ${panelCollapsed?'n1-panel-collapsed':''}`} aria-label="Bảng Layers" style={{display:panelOpen?undefined:'none'}}>
      <div className="n1-layers-title"><strong><Layers3 size={17}/> <span>Layers</span></strong><small>{layers.length+creative.length} lớp</small><button className="n1-panel-toggle" type="button" onClick={()=>setPanelCollapsed(v=>!v)} title={panelCollapsed?'Mở Layers':'Thu gọn Layers'}>{panelCollapsed?<PanelRightOpen size={17}/>:<PanelRightClose size={17}/>}</button></div>
      <div className="n1-layers-controls"><button onClick={()=>{if(!layers.length)onRequestOriginalImage();else fileRef.current?.click();}} disabled={!ready||busy} title="Thêm ảnh vào Project"><ImagePlus size={16}/> Thêm ảnh</button></div>
<div className="n1-layer-list-head">Danh sách lớp <small>Trên cùng → dưới cùng</small></div>
      <div className="n1-layer-items">{[...creative].reverse().map(l=><div key={l.id} className={`n1-layer-item ${creativeSelected===l.id?'active':''}`} onClick={()=>{setSelected(null);setCreativeSelected(l.id)}}>
        <span className="n1-creative-thumb">{l.kind==='text'?<Type size={18}/>:l.kind==='shape'?<Shapes size={18}/>:<Sticker size={18}/>}</span><div className="n1-layer-info"><strong>{l.name}</strong><small>{l.value.slice(0,26)}</small></div>
        <button type="button" title="Ẩn/hiện" onClick={e=>{e.stopPropagation();updateCreative(l.id,{visible:!l.visible})}}>{l.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      </div>)}{[...layers].reverse().map(l=><div key={l.id} className={`n1-layer-item ${selected===l.id?'active':''}`} onClick={()=>selectImage(l)}>
        <img src={l.url} alt=""/><div className="n1-layer-info"><strong title={l.name}>{l.name}</strong><small>Asset #{l.assetId}</small></div>
        <button type="button" title={l.visible?'Ẩn layer':'Hiện layer'} onClick={e=>{e.stopPropagation();update(l.id,{visible:!l.visible})}}>{l.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      </div>)}
      {background.type!=='transparent'&&<div className="n1-layer-item v46-background-layer" title="Nền nằm dưới tất cả các lớp ảnh">
        {background.type==='image'&&background.url?<img src={background.url} alt="Nền đang dùng"/>:<span className="v46-background-swatch" style={{background:background.color}}/>}
        <div className="n1-layer-info"><strong>Nền {background.type==='image'?'hình ảnh':'màu'}</strong><small>Dưới cùng · Toàn bố cục</small></div>
        <button type="button" onClick={()=>backgroundRef.current?.click()} title="Thay nền bằng ảnh">Đổi</button>
      </div>}
      </div>
      {currentCreative&&<div className="n1-layer-manager-actions">
        <strong>Lớp: {currentCreative.name}</strong>
        <div className="n1-layer-actions">
          <button title="Đưa lên" onClick={()=>{recordHistory('creative-order');setCreative(a=>{const n=a.findIndex(x=>x.id===currentCreative.id);if(n>=a.length-1)return a;const b=[...a];[b[n],b[n+1]]=[b[n+1],b[n]];return b;});}}><ArrowUp size={16}/></button>
          <button title="Đưa xuống" onClick={()=>{recordHistory('creative-order');setCreative(a=>{const n=a.findIndex(x=>x.id===currentCreative.id);if(n<1)return a;const b=[...a];[b[n],b[n-1]]=[b[n-1],b[n]];return b;});}}><ArrowDown size={16}/></button>
          <button type="button" title={currentCreative.locked?'Mở khóa':'Khóa'} onClick={()=>updateCreative(currentCreative.id,{locked:!currentCreative.locked})}>{currentCreative.locked?<Lock size={16}/>:<Unlock size={16}/>}</button>
          <button type="button" title="Xóa lớp" disabled={currentCreative.locked} onClick={()=>{recordHistory('delete-creative');setCreative(v=>v.filter(x=>x.id!==currentCreative.id));setCreativeSelected(null)}}><Trash2 size={16}/></button>
        </div>
      </div>}
      {current&&<div className="n1-layer-manager-actions">
        <strong>Lớp: {current.name}</strong>
        <div className="n1-layer-actions">
          <button title="Đưa lên" aria-label="Đưa lớp lên" onClick={()=>move(current.id,1)}><ArrowUp size={16}/></button>
          <button title="Đưa xuống" aria-label="Đưa lớp xuống" onClick={()=>move(current.id,-1)}><ArrowDown size={16}/></button>
          <button title={current.locked?'Mở khóa':'Khóa lớp'} onClick={()=>update(current.id,{locked:!current.locked})}>{current.locked?<Lock size={16}/>:<Unlock size={16}/>}</button>
          <button title="Xóa lớp khỏi bố cục" disabled={current.locked} onClick={()=>setDeleteTarget(current.id)}><Trash2 size={16}/></button>
        </div>
        {deleteTarget===current.id&&<div className="n1-layer-confirm">Xóa lớp “{current.name}” khỏi bố cục? Asset gốc vẫn lưu trong Project.<div><button onClick={()=>setDeleteTarget(null)}>Hủy</button><button className="danger" onClick={()=>deleteLayer(current.id)}>Xóa lớp</button></div></div>}
      </div>}
      <div className="n1-layer-footer">{saveStatus||'Bố cục được lưu vào Project'}<br/>Lọc chung: <strong>{groupFilter==='original'?'Không lọc':groupFilter}</strong> · Các lớp vẫn độc lập để chỉnh sửa.</div>
    </aside>
  </>;
}
