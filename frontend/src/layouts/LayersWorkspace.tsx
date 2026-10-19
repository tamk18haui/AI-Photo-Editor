import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, ImagePlus, Layers3, Lock, Trash2, Unlock, Palette, RotateCcw } from 'lucide-react';
import { assetApi } from '../services/assetApi';
import { editorStateApi } from '../services/editorStateApi';
import './layers-workspace.css';

export type ImageLayer = {
  id: string; assetId: number; url: string; name: string;
  visible: boolean; locked: boolean; opacity: number;
  x: number; y: number; width: number;
};
export type Composition = { version: 1; layers: ImageLayer[] };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
export function readComposition(doc: Record<string, unknown>): ImageLayer[] {
  const data = doc.n1Composition;
  if (!isObj(data) || !Array.isArray(data.layers)) return [];
  return (data.layers as unknown[]).filter(isObj).filter(v=>Number.isSafeInteger(v.assetId) && Number(v.assetId)>0 && typeof v.url==='string')
    .map(v=>({id:String(v.id),assetId:Number(v.assetId),url:String(v.url),name:String(v.name || 'Layer'),
      visible:v.visible!==false,locked:v.locked===true,opacity:Math.min(100,Math.max(0,Number(v.opacity??100))),
      x:Number(v.x??0),y:Number(v.y??0),width:Math.max(5,Math.min(200,Number(v.width??100)))}));
}
function newLayer(asset: {assetId:number; url:string; originalFileName:string|null}, size=50): ImageLayer {
  return {id:`layer-${asset.assetId}-${Date.now()}`,assetId:asset.assetId,url:asset.url,
    name:asset.originalFileName||`Ảnh #${asset.assetId}`,visible:true,locked:false,opacity:100,
    x:size===100?0:25,y:size===100?0:25,width:size};
}
const loadImage = (src:string) => new Promise<HTMLImageElement>((resolve,reject)=>{
  const im=new Image(); im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Không đọc được ảnh: kiểm tra CORS Cloudinary.'));im.src=src;
});

export default function LayersWorkspace(props:{projectId:number; ready:boolean; originalAssetId:number|null; originalUrl:string|null; originalName:string; canvasWidth:number; canvasHeight:number; sourceDocument:Record<string,unknown>|null; active:boolean; onStatus:(message:string)=>void}){
  const {projectId,ready,originalAssetId,originalUrl,originalName,canvasWidth,canvasHeight,sourceDocument,active,onStatus}=props;
  const [layers,setLayers]=useState<ImageLayer[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
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
  const current=layers.find(l=>l.id===selected)||null;
  useEffect(()=>{
    if(!ready||!sourceDocument)return;
    const existing=readComposition(sourceDocument);
    const initial=existing.length?existing:(originalAssetId&&originalUrl?[newLayer({assetId:originalAssetId,url:originalUrl,originalFileName:originalName},100)]:[]);
    setLayers(initial);setSelected(initial.at(-1)?.id||null);prevFingerprint.current=JSON.stringify(existing);
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
    if(fingerprint===prevFingerprint.current && JSON.stringify(background)===prevBg.current)return;
    setSaveStatus('Đang chờ lưu...');
    const timer=window.setTimeout(()=>{
      const snapshot=layers.map(l=>({...l}));
      const bgSnapshot={...background};
      const next=writeQueue.current.catch(()=>{}).then(async()=>{
        const latest=await editorStateApi.load(projectId);
        await editorStateApi.save(projectId,{...latest,n1Composition:{version:1,layers:snapshot,background:bgSnapshot}});
        prevFingerprint.current=JSON.stringify(snapshot);prevBg.current=JSON.stringify(bgSnapshot);
      });
      writeQueue.current=next;
      setSaveStatus('Đang lưu...');
      void next.then(()=>setSaveStatus('Đã lưu Layers ✓')).catch(()=>setSaveStatus('Lưu Layers lỗi — hãy thử thay đổi lại'));
    },850);
    return ()=>window.clearTimeout(timer);
  },[layers,background,projectId,ready,hydrated]);
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
      const l=newLayer(uploaded);setLayers(v=>[...v,l]);setSelected(l.id);
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
  const onDragStart=(e:PointerEvent<HTMLImageElement>,layer:ImageLayer)=>{
    if(layer.locked)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current={id:layer.id,x:e.clientX,y:e.clientY,startX:layer.x,startY:layer.y};setSelected(layer.id);
  };
  const onDragMove=(e:PointerEvent<HTMLImageElement>)=>{
    const d=dragRef.current,rect=stageRef.current?.getBoundingClientRect();if(!d||!rect)return;
    update(d.id,{x:d.startX+(e.clientX-d.x)/rect.width*100,y:d.startY+(e.clientY-d.y)/rect.height*100});
  };
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
        ctx.drawImage(img,w*l.x/100,h*l.y/100,dw,dh);
      }
      ctx.globalAlpha=1;
      const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/png'));
      if(!blob)throw new Error('PNG export failed');
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='lumina-layers.png';a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1500);
      onStatus('Đã xuất PNG gồm các lớp ảnh và nền đã chọn.');
    }catch(err){console.error(err);onStatus('Xuất ảnh ghép thất bại. Kiểm tra CORS của ảnh Cloudinary.');}
    finally{setBusy(false);}
  };
  return <>
    <input type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void addFile(e)}/>
    <input type="file" ref={backgroundRef} accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void addBackgroundFile(e)}/>
    {active&&<div className="n1-layer-stage-shell"><div ref={stageRef} className="n1-layer-stage" style={{background:background.type==='color'?background.color:undefined,aspectRatio:`${Math.max(1,canvasWidth||1)}/${Math.max(1,canvasHeight||1)}`}}>
      {background.type==='image'&&background.url&&<img className="n1-background-image" src={background.url} alt="Ảnh nền" draggable={false}/>}
      {layers.filter(l=>l.visible).map(l=><img key={l.id} draggable={false} alt={l.name} src={l.url}
        className={`n1-layer-canvas-image ${selected===l.id?'selected':''}`} style={{left:`${l.x}%`,top:`${l.y}%`,width:`${l.width}%`,opacity:l.opacity/100,zIndex:layers.indexOf(l)+1,cursor:l.locked?'default':'grab'}}
        onPointerDown={e=>onDragStart(e,l)} onPointerMove={onDragMove} onPointerUp={()=>{dragRef.current=null}} onPointerCancel={()=>{dragRef.current=null}}/>)}</div></div>}
    <aside className="n1-layers-panel" aria-label="Bảng Layers">
      <div className="n1-layers-title"><strong><Layers3 size={17}/> Layers</strong><small>{layers.length} lớp</small></div>
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
      <div className="n1-layer-items">{[...layers].reverse().map(l=><div key={l.id} className={`n1-layer-item ${selected===l.id?'active':''}`} onClick={()=>setSelected(l.id)}>
        <img src={l.url} alt=""/><div className="n1-layer-info"><strong title={l.name}>{l.name}</strong><small>Asset #{l.assetId}</small></div>
        <button type="button" title={l.visible?'Ẩn layer':'Hiện layer'} onClick={e=>{e.stopPropagation();update(l.id,{visible:!l.visible})}}>{l.visible?<Eye size={15}/>:<EyeOff size={15}/>}</button>
      </div>)}</div>
      {current&&<div className="n1-layer-properties"><label>Tên lớp<input value={current.name} onChange={e=>update(current.id,{name:e.target.value.slice(0,90)})}/></label>
        <label>Độ mờ <b>{current.opacity}%</b><input type="range" min="0" max="100" value={current.opacity} onChange={e=>update(current.id,{opacity:Number(e.target.value)})}/></label>
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
