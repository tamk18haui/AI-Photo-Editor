import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, ImagePlus, Layers3, Lock, Trash2, Unlock, Palette, RotateCcw, Type, Sticker, Shapes } from 'lucide-react';
import { assetApi } from '../services/assetApi';
import { editorStateApi } from '../services/editorStateApi';
import './layers-workspace.css';

export type ImageLayer = {
  id: string; assetId: number; url: string; name: string;
  visible: boolean; locked: boolean; opacity: number;
  x: number; y: number; width: number; rotation?:number; flipped?:boolean; preset?:string; brightness?:number; contrast?:number; saturation?:number; lux?:number; blur?:number;
};
export type Composition = { version: 1; layers: ImageLayer[] };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export function readComposition(doc: Record<string, unknown>): ImageLayer[] {
  const data = doc.n1Composition;
  if (!isObj(data) || !Array.isArray(data.layers)) return [];
  return (data.layers as unknown[]).filter(isObj).filter(v=>Number.isSafeInteger(v.assetId) && Number(v.assetId)>0 && typeof v.url==='string')
    .map(v=>({id:String(v.id),assetId:Number(v.assetId),url:String(v.url),name:String(v.name || 'Layer'),
      visible:v.visible!==false,locked:v.locked===true,opacity:Math.min(100,Math.max(0,Number(v.opacity??100))),
      x:Number(v.x??0),y:Number(v.y??0),width:Math.max(5,Math.min(200,Number(v.width??100))),
      rotation:Number(v.rotation??0),flipped:v.flipped===true,preset:String(v.preset??'original'),brightness:Number(v.brightness??100),contrast:Number(v.contrast??100),saturation:Number(v.saturation??100),lux:Number(v.lux??100),blur:Number(v.blur??0)}));
}

type CreativeLayer={id:string;kind:'text'|'sticker'|'shape';value:string;name:string;x:number;y:number;width:number;fontSize:number;color:string;rotation:number;visible:boolean;locked:boolean;opacity:number};
const presets:Record<string,string>={original:'',bw:'grayscale(1)',vintage:'sepia(.55) contrast(.92)',warm:'sepia(.28) saturate(1.14)',cool:'hue-rotate(18deg) saturate(.92)',vivid:'saturate(1.65) contrast(1.1)',soft:'contrast(.87) saturate(.85)',dramatic:'contrast(1.32) saturate(.9)'};
const imageFilter=(l:ImageLayer)=>`brightness(${(l.brightness??100)*(l.lux??100)/10000}) contrast(${l.contrast??100}%) saturate(${l.saturation??100}%) ${presets[l.preset??'original']??''} blur(${l.blur??0}px)`;
const imageTransform=(l:ImageLayer)=>`rotate(${l.rotation??0}deg) scaleX(${l.flipped?-1:1})`;

function newLayer(asset: {assetId:number; url:string; originalFileName:string|null}, size=50): ImageLayer {
  return {id:`layer-${asset.assetId}-${Date.now()}`,assetId:asset.assetId,url:asset.url,
    name:asset.originalFileName||`Ảnh #${asset.assetId}`,visible:true,locked:false,opacity:100,
    x:size===100?0:25,y:size===100?0:25,width:size};
}
const loadImage = (src:string) => new Promise<HTMLImageElement>((resolve,reject)=>{
  const im=new Image(); im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Không đọc được ảnh: kiểm tra CORS Cloudinary.'));im.src=src;
});

export default function LayersWorkspace(props:{projectId:number; ready:boolean; originalAssetId:number|null; originalUrl:string|null; originalName:string; canvasWidth:number; canvasHeight:number; sourceDocument:Record<string,unknown>|null; active:boolean; onStatus:(message:string)=>void;editCommand:{seq:number;patch:object}|null;creativeCommand:{seq:number;kind:'text'|'sticker'|'shape';value:string}|null;onSelectImageEdits:(value:Record<string,number|string|boolean>)=>void}){
  const {projectId,ready,originalAssetId,originalUrl,originalName,canvasWidth,canvasHeight,sourceDocument,active,onStatus,editCommand,creativeCommand,onSelectImageEdits}=props;
  const [layers,setLayers]=useState<ImageLayer[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [creative,setCreative]=useState<CreativeLayer[]>([]);
  const [creativeSelected,setCreativeSelected]=useState<string|null>(null);
  const currentCreative=creative.find(c=>c.id===creativeSelected)||null;
  const lastEditSeq=useRef<number|null>(null);
  const lastCreativeSeq=useRef<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [saveStatus,setSaveStatus]=useState('');
  const [hydrated,setHydrated]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const backgroundRef=useRef<HTMLInputElement>(null);
  const [background,setBackground]=useState<{type:'transparent'|'color'|'image';color:string;url:string;assetId:number|null}>({type:'transparent',color:'#ffffff',url:'',assetId:null});
  const [backgroundOpen,setBackgroundOpen]=useState(false);
  const [deleteTarget,setDeleteTarget]=useState<string|null>(null);

  const stageRef=useRef<HTMLDivElement>(null);
  const dragRef=useRef<{id:string;x:number;y:number;startX:number;startY:number}|null>(null);
  const writeQueue=useRef<Promise<void>>(Promise.resolve());
  const prevFingerprint=useRef('');
  const prevBg=useRef('');
  const prevCreative=useRef('');
  const current=layers.find(l=>l.id===selected)||null;
  const selectImage=(l:ImageLayer)=>{setCreativeSelected(null);setSelected(l.id);onSelectImageEdits({rotation:l.rotation??0,flipped:l.flipped??false,preset:l.preset??'original',brightness:l.brightness??100,contrast:l.contrast??100,saturation:l.saturation??100,lux:l.lux??100,blur:l.blur??0});};
  useEffect(()=>{if(!editCommand||lastEditSeq.current===editCommand.seq||!hydrated)return;lastEditSeq.current=editCommand.seq;
    if(!selected)return;
    const patch=Object.fromEntries(Object.entries(editCommand.patch).filter(([key])=>['rotation','flipped','preset','brightness','contrast','saturation','lux','blur'].includes(key)));
    setLayers(prev=>prev.map(l=>l.id===selected&&!l.locked?{...l,...patch}:l));
  },[editCommand,selected,hydrated]);
  useEffect(()=>{if(!creativeCommand||lastCreativeSeq.current===creativeCommand.seq||!hydrated)return;lastCreativeSeq.current=creativeCommand.seq;
    const item:CreativeLayer={id:`creative-${creativeCommand.seq}`,kind:creativeCommand.kind,value:creativeCommand.value,name:creativeCommand.kind==='text'?'Văn bản':creativeCommand.kind==='shape'?'Hình khối':'Sticker',x:35,y:35,width:creativeCommand.kind==='text'?45:20,fontSize:creativeCommand.kind==='sticker'?64:42,color:'#ffffff',rotation:0,visible:true,locked:false,opacity:100};
    setCreative(prev=>[...prev,item]);setSelected(null);setCreativeSelected(item.id);
  },[creativeCommand,hydrated]);
  const updateCreative=(id:string,patch:Partial<CreativeLayer>)=>setCreative(prev=>prev.map(l=>l.id===id?{...l,...patch}:l));
  useEffect(()=>{
    if(!ready||!sourceDocument)return;
    const existing=readComposition(sourceDocument);
    const initial=existing.length?existing:(originalAssetId&&originalUrl?[newLayer({assetId:originalAssetId,url:originalUrl,originalFileName:originalName},100)]:[]);
    setLayers(initial);setSelected(initial.at(-1)?.id||null);prevFingerprint.current=JSON.stringify(existing);
    const composition=isObj(sourceDocument.n1Composition)?sourceDocument.n1Composition:{};
    const savedCreative=Array.isArray(composition.creative)?composition.creative.filter(isObj).filter(v=>['text','shape','sticker'].includes(String(v.kind))).map(v=>({...v,id:String(v.id),kind:String(v.kind),value:String(v.value??''),name:String(v.name??''),x:Number(v.x??25),y:Number(v.y??25),width:Number(v.width??35),fontSize:Number(v.fontSize??42),color:String(v.color??'#ffffff'),rotation:Number(v.rotation??0),visible:v.visible!==false,locked:v.locked===true,opacity:Number(v.opacity??100)}) as CreativeLayer):[];
    setCreative(savedCreative);prevCreative.current=JSON.stringify(savedCreative);
    const bg=isObj(sourceDocument.n1Composition) ? sourceDocument.n1Composition.background : null;
    if(isObj(bg)) setBackground({type:bg.type==='color'||bg.type==='image'?bg.type:'transparent',color:typeof bg.color==='string'?bg.color:'#ffffff',url:typeof bg.url==='string'?bg.url:'',assetId:typeof bg.assetId==='number'?bg.assetId:null});

    prevBg.current=JSON.stringify(isObj(sourceDocument.n1Composition)?sourceDocument.n1Composition.background??null:null);
    setHydrated(true);
  // Hydrate only when opening a different project, not every time n1Editor autosaves.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[projectId,ready]);
  useEffect(()=>{
    if(!ready||!hydrated)return;
    const fingerprint=JSON.stringify(layers);
    if(fingerprint===prevFingerprint.current && JSON.stringify(background)===prevBg.current && JSON.stringify(creative)===prevCreative.current)return;
    setSaveStatus('Đang chờ lưu...');
    const timer=window.setTimeout(()=>{
      const snapshot=layers.map(l=>({...l}));
      const bgSnapshot={...background};
      const creativeSnapshot=creative.map(v=>({...v}));
      const next=writeQueue.current.catch(()=>{}).then(async()=>{
        const latest=await editorStateApi.load(projectId);
        await editorStateApi.save(projectId,{...latest,n1Composition:{...(isObj(latest.n1Composition)?latest.n1Composition:{}),version:1,layers:snapshot,background:bgSnapshot,creative:creativeSnapshot}});
        prevFingerprint.current=JSON.stringify(snapshot);prevBg.current=JSON.stringify(bgSnapshot);prevCreative.current=JSON.stringify(creativeSnapshot);
      });
      writeQueue.current=next;
      setSaveStatus('Đang lưu...');
      void next.then(()=>setSaveStatus('Đã lưu Layers ✓')).catch(()=>setSaveStatus('Lưu Layers lỗi — hãy thử thay đổi lại'));
    },850);
    return ()=>window.clearTimeout(timer);
  },[layers,background,creative,projectId,ready,hydrated]);
  // When the first image is uploaded after an initially empty Project, seed the canvas.
  useEffect(()=>{
    if(!hydrated||!ready||!originalAssetId||!originalUrl)return;
    setLayers(items=>items.length?items:[newLayer({assetId:originalAssetId,url:originalUrl,originalFileName:originalName},100)]);
  },[hydrated,ready,originalAssetId,originalUrl,originalName]);
  const update=(id:string,patch:Partial<ImageLayer>)=>setLayers(items=>items.map(l=>l.id===id?{...l,...patch}:l));
  const addFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file||!ready)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){onStatus('Chỉ hỗ trợ ảnh JPG, PNG, WebP tối đa 20 MB');return;}
    setBusy(true);
    try{
      const uploaded=await assetApi.upload(projectId,file,'IMAGE');
      const l=newLayer(uploaded);setLayers(v=>[...v,l]);selectImage(l);
      onStatus('Đã thêm ảnh mới vào Layers và tải lên Project.');
    }catch(err){console.error(err);onStatus('Thêm layer thất bại. Kiểm tra quyền Project hoặc Cloudinary.');}
    finally{setBusy(false);}
  };
  const addBackgroundFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; e.target.value=''; if(!file||!ready)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024){onStatus('Nền chỉ hỗ trợ JPG, PNG, WebP tối đa 20 MB');return;}
    setBusy(true);
    try{const uploaded=await assetApi.upload(projectId,file,'IMAGE');setBackground({type:'image',color:'#ffffff',url:uploaded.url,assetId:uploaded.assetId});onStatus('Đã thêm ảnh nền, thay đổi được và sẽ lưu cùng bố cục.');}
    catch(err){console.error(err);onStatus('Không tải được ảnh nền lên Project.');}finally{setBusy(false);}
  };
  const deleteLayer=(id:string)=>{setLayers(v=>v.filter(l=>l.id!==id));setSelected(v=>v===id?null:v);setDeleteTarget(null);};
  const onDragStart=(e:PointerEvent<HTMLElement>,layer:ImageLayer)=>{
    if(layer.locked)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current={id:layer.id,x:e.clientX,y:e.clientY,startX:layer.x,startY:layer.y};setSelected(layer.id);
  };
  const onDragMove=(e:PointerEvent<HTMLElement>)=>{
    const d=dragRef.current,rect=stageRef.current?.getBoundingClientRect();if(!d||!rect)return;
    update(d.id,{x:d.startX+(e.clientX-d.x)/rect.width*100,y:d.startY+(e.clientY-d.y)/rect.height*100});
  };
  const creativeDragRef=useRef<{id:string;x:number;y:number;startX:number;startY:number}|null>(null);
  const dragCreativeStart=(e:PointerEvent<HTMLDivElement>,l:CreativeLayer)=>{if(l.locked)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);creativeDragRef.current={id:l.id,x:e.clientX,y:e.clientY,startX:l.x,startY:l.y};setSelected(null);setCreativeSelected(l.id);};
  const dragCreativeMove=(e:PointerEvent<HTMLDivElement>)=>{const d=creativeDragRef.current,rect=stageRef.current?.getBoundingClientRect();if(!d||!rect)return;updateCreative(d.id,{x:d.startX+(e.clientX-d.x)/rect.width*100,y:d.startY+(e.clientY-d.y)/rect.height*100});};
  const move=(id:string,delta:number)=>setLayers(items=>{const index=items.findIndex(l=>l.id===id),at=index+delta;
    if(index<0||at<0||at>=items.length)return items;
    const copy=[...items];[copy[index],copy[at]]=[copy[at],copy[index]];return copy;
  });
  const exportPng=async()=>{
    if(!layers.length)return;setBusy(true);
    try{
      const w=Math.max(1,canvasWidth||1024),h=Math.max(1,canvasHeight||1024);
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
      if(background.type==='color'){ctx.fillStyle=background.color;ctx.fillRect(0,0,w,h);}
      if(background.type==='image'&&background.url){
        const bg=await loadImage(background.url);const scale=Math.max(w/bg.naturalWidth,h/bg.naturalHeight);
        const bw=bg.naturalWidth*scale,bh=bg.naturalHeight*scale;
        ctx.drawImage(bg,(w-bw)/2,(h-bh)/2,bw,bh);
      }
      for(const l of layers){if(!l.visible)continue;
        const img=await loadImage(l.url);ctx.globalAlpha=l.opacity/100;
        const dw=w*l.width/100,dh=dw*img.naturalHeight/img.naturalWidth;
        ctx.save();ctx.translate(w*l.x/100+dw/2,h*l.y/100+dh/2);ctx.rotate((l.rotation??0)*Math.PI/180);ctx.scale(l.flipped?-1:1,1);ctx.filter=imageFilter(l);ctx.drawImage(img,-dw/2,-dh/2,dw,dh);ctx.restore();
      }
      ctx.globalAlpha=1;
      for(const l of creative){if(!l.visible)continue;ctx.save();ctx.globalAlpha=l.opacity/100;
        ctx.translate(w*l.x/100,h*l.y/100);ctx.rotate(l.rotation*Math.PI/180);ctx.fillStyle=l.color;
        if(l.kind==='text'||l.kind==='sticker'){const font=Math.round(l.fontSize*w/1024);ctx.font=`${l.kind==='text'?'bold ':''}${font}px Arial, sans-serif`;ctx.textBaseline='top';for(const [i,line] of l.value.split('\n').entries())ctx.fillText(line,0,i*font*1.2);}
        else {const size=w*l.width/100;ctx.strokeStyle=l.color;ctx.lineWidth=Math.max(2,w/512);ctx.beginPath();if(l.value==='circle'||l.value==='ellipse'){ctx.ellipse(size/2,size/2,size/2,l.value==='ellipse'?size/3:size/2,0,0,Math.PI*2);}else{ctx.rect(0,0,size,size);}ctx.stroke();}
        ctx.restore();}
      const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));
      if(!blob)throw new Error('PNG export failed');
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lumina-layers.png';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
      onStatus('Đã xuất PNG gồm ảnh, chữ, hình khối, sticker và nền.');
    }catch(err){console.error(err);onStatus('Xuất ảnh ghép thất bại. Kiểm tra CORS của ảnh Cloudinary.');}
    finally{setBusy(false);}
  };
  return <>
    <input type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void addFile(e)}/>
    <input type="file" ref={backgroundRef} accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void addBackgroundFile(e)}/>
    {active&&<div className="n1-layer-stage-shell"><div ref={stageRef} className="n1-layer-stage" style={{background:background.type==='color'?background.color:undefined,aspectRatio:`${Math.max(1,canvasWidth||1)}/${Math.max(1,canvasHeight||1)}`}}>
      {background.type==='image'&&background.url&&<img className="n1-background-image" src={background.url} alt="Ảnh nền" draggable={false}/>}
      {layers.filter(l=>l.visible).map(l=><img key={l.id} draggable={false} alt={l.name} src={l.url}
        className={`n1-layer-canvas-image ${selected===l.id?'selected':''}`} style={{left:`${l.x}%`,top:`${l.y}%`,width:`${l.width}%`,opacity:l.opacity/100,zIndex:layers.indexOf(l)+1,cursor:l.locked?'default':'grab',filter:imageFilter(l),transform:imageTransform(l)}}
        onPointerDown={e=>onDragStart(e,l)} onPointerMove={onDragMove} onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}/>)}
      {creative.filter(l=>l.visible).map(l=><div key={l.id} className={`n1-creative-object ${creativeSelected===l.id?'selected':''}`} onPointerDown={e=>dragCreativeStart(e,l)} onPointerMove={dragCreativeMove} onPointerUp={()=>{creativeDragRef.current=null}} onPointerCancel={()=>{creativeDragRef.current=null}}
        style={{left:`${l.x}%`,top:`${l.y}%`,width:`${l.width}%`,color:l.color,opacity:l.opacity/100,fontSize:`${l.fontSize/1024*100}cqw`,transform:`rotate(${l.rotation}deg)`,zIndex:100+creative.indexOf(l),cursor:l.locked?'default':'move'}}>
        {l.kind==='text'?<span style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{l.value}</span>:l.kind==='sticker'?<span>{l.value}</span>:<div className={`n1-shape n1-shape-${l.value}`} style={{borderColor:l.color}}/>}
      </div>)}
    </div></div>}
    <aside className="n1-layers-panel" aria-label="Bảng Layers">
      <div className="n1-layers-title"><strong><Layers3 size={17}/> Layers</strong><small>{layers.length+creative.length} lớp</small></div>
      <div className="n1-layers-controls"><button onClick={()=>fileRef.current?.click()} disabled={!ready||busy} title="Thêm ảnh vào Project"><ImagePlus size={16}/> Thêm ảnh</button><button onClick={()=>void exportPng()} disabled={busy||!layers.length} title="Xuất ảnh ghép PNG"><Download size={16}/> PNG</button></div>
      <div className="n1-background"><button type="button" className="n1-background-toggle" onClick={()=>setBackgroundOpen(v=>!v)}><Palette size={16}/> Nền ảnh <span>{backgroundOpen?'▴':'▾'}</span></button>
        {backgroundOpen&&<div className="n1-background-options">
          <div className="n1-background-modes"><button className={background.type==='transparent'?'active':''} onClick={()=>setBackground(v=>({...v,type:'transparent'}))}>Trong suốt</button><button className={background.type==='color'?'active':''} onClick={()=>setBackground(v=>({...v,type:'color'}))}>Màu</button><button className={background.type==='image'?'active':''} onClick={()=>{if(background.url)setBackground(v=>({...v,type:'image'}));else backgroundRef.current?.click()}}>Ảnh</button></div>
          {background.type==='color'&&<label className="n1-background-picker">Chọn màu nền <input type="color" aria-label="Màu nền" value={background.color} onChange={e=>setBackground(v=>({...v,color:e.target.value}))}/><span>{background.color}</span></label>}
          <button type="button" className="n1-background-upload" disabled={busy||!ready} onClick={()=>backgroundRef.current?.click()}><ImagePlus size={15}/> {background.url?'Đổi ảnh nền':'Tải ảnh nền'}</button>
          {background.type==='image'&&background.url&&<button type="button" className="n1-background-upload" onClick={()=>setBackground(v=>({...v,type:'transparent'}))}><RotateCcw size={14}/> Bỏ nền ảnh</button>}
        </div>}
      </div>
      <div className="n1-layer-list-head">Danh sách lớp <small>Trên cùng → dưới cùng</small></div>
      <div className="n1-layer-items">{[...creative].reverse().map(l=><div key={l.id} className={`n1-layer-item ${creativeSelected===l.id?'active':''}`} onClick={()=>{setSelected(null);setCreativeSelected(l.id)}}>
        <span className="n1-creative-thumb">{l.kind==='text'?<Type size={18}/>:l.kind==='shape'?<Shapes size={18}/>:<Sticker size={18}/>}</span><div className="n1-layer-info"><strong>{l.name}</strong><small>{l.value.slice(0,26)}</small></div>
        <button type="button" title="Ẩn/hiện" onClick={e=>{e.stopPropagation();updateCreative(l.id,{visible:!l.visible})}}>{l.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      </div>)}{[...layers].reverse().map(l=><div key={l.id} className={`n1-layer-item ${selected===l.id?'active':''}`} onClick={()=>selectImage(l)}>
        <img src={l.url} alt=""/><div className="n1-layer-info"><strong title={l.name}>{l.name}</strong><small>Asset #{l.assetId}</small></div>
        <button type="button" title={l.visible?'Ẩn layer':'Hiện layer'} onClick={e=>{e.stopPropagation();update(l.id,{visible:!l.visible})}}>{l.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      </div>)}</div>
      {currentCreative&&<div className="n1-layer-properties n1-creative-properties">
        <strong>Chỉnh {currentCreative.name}</strong>
        {(currentCreative.kind==='text'||currentCreative.kind==='sticker')&&<label>Nội dung<textarea rows={currentCreative.kind==='text'?3:1} value={currentCreative.value} onChange={e=>updateCreative(currentCreative.id,{value:e.target.value})}/></label>}
        {currentCreative.kind==='text'&&<label>Màu chữ<input type="color" value={currentCreative.color} onChange={e=>updateCreative(currentCreative.id,{color:e.target.value})}/></label>}
        {currentCreative.kind==='shape'&&<label>Màu viền<input type="color" value={currentCreative.color} onChange={e=>updateCreative(currentCreative.id,{color:e.target.value})}/></label>}
        <label>Kích thước <b>{Math.round(currentCreative.width)}%</b><input type="range" min="5" max="120" value={currentCreative.width} onChange={e=>updateCreative(currentCreative.id,{width:Number(e.target.value)})}/></label>
        {(currentCreative.kind==='text'||currentCreative.kind==='sticker')&&<label>Cỡ chữ <b>{currentCreative.fontSize}</b><input type="range" min="12" max="180" value={currentCreative.fontSize} onChange={e=>updateCreative(currentCreative.id,{fontSize:Number(e.target.value)})}/></label>}
        <label>Góc xoay <b>{currentCreative.rotation}°</b><input type="range" min="-180" max="180" value={currentCreative.rotation} onChange={e=>updateCreative(currentCreative.id,{rotation:Number(e.target.value)})}/></label>
        <div className="n1-layer-actions"><button type="button" onClick={()=>updateCreative(currentCreative.id,{locked:!currentCreative.locked})}>{currentCreative.locked?<Lock size={16}/>:<Unlock size={16}/>}</button><button type="button" onClick={()=>{setCreative(v=>v.filter(x=>x.id!==currentCreative.id));setCreativeSelected(null)}}><Trash2 size={16}/></button></div>
      </div>}
      {current&&<div className="n1-layer-properties"><label>Tên lớp<input value={current.name} onChange={e=>update(current.id,{name:e.target.value.slice(0,90)})}/></label>
        <label>Độ mờ <b>{current.opacity}%</b><input type="range" min="0" max="100" value={current.opacity} onChange={e=>update(current.id,{opacity:Number(e.target.value)})}/></label>
        <label>Xoay ảnh <b>{current.rotation??0}°</b><input type="range" min="-180" max="180" value={current.rotation??0} onChange={e=>update(current.id,{rotation:Number(e.target.value)})}/></label>
        <label>Kích thước <b>{Math.round(current.width)}%</b><input type="range" min="5" max="150" value={current.width} onChange={e=>update(current.id,{width:Number(e.target.value)})}/></label>
        <div className="n1-layer-actions"><button type="button" title="Đưa lớp lên trên" aria-label="Đưa lớp lên trên" onClick={()=>move(current.id,1)}><ArrowUp size={16}/></button><button type="button" title="Đưa lớp xuống dưới" aria-label="Đưa lớp xuống dưới" onClick={()=>move(current.id,-1)}><ArrowDown size={16}/></button><button type="button" title={current.locked?'Mở khóa':'Khóa lớp'} onClick={()=>update(current.id,{locked:!current.locked})}>{current.locked?<Lock size={16}/>:<Unlock size={16}/>}</button><button type="button" title="Xóa lớp khỏi bố cục (không xóa Asset)" onClick={()=>setDeleteTarget(current.id)}><Trash2 size={16}/></button></div>
        <div className="n1-layer-action-text"><span>Đưa lên</span><span>Đưa xuống</span><span>{current.locked?'Mở khóa':'Khóa'}</span><span>Xóa lớp</span></div>
        {deleteTarget===current.id&&<div className="n1-layer-confirm">Xóa lớp “{current.name}” khỏi bố cục? Ảnh gốc vẫn trong Project.<div><button onClick={()=>setDeleteTarget(null)}>Hủy</button><button className="danger" onClick={()=>deleteLayer(current.id)}>Xóa lớp</button></div></div>}
        <small>Kéo ảnh trực tiếp trên canvas để đổi vị trí. Thứ tự hiển thị từ dưới lên trên.</small>
      </div>}
      <div className="n1-layer-footer">{saveStatus||'Bố cục được lưu vào Project'}<br/>Ảnh nền nằm dưới các lớp. Xóa lớp không xóa ảnh gốc.</div>
    </aside>
  </>;
}
