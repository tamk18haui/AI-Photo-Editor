import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Brush, ChevronLeft, ChevronRight,
  CircleHelp, Cloud, Crop, Download, Eraser, Expand,
  FlipHorizontal, FolderOpen, Grid2X2, Heart, Image as ImageIcon,
  ImagePlus, Layers3, LayoutTemplate, Move, Paintbrush, Palette,
  Redo2, RotateCcw, RotateCw, Save, SlidersHorizontal,
  Sparkles, Sticker, Sun, Type, Undo2, WandSparkles, ZoomIn, ZoomOut,
} from 'lucide-react';
import './editor-modern.css';

type Category = 'template' | 'edit' | 'beauty' | 'design' | 'remove' | 'filters' | 'adjust' | 'effects' | 'background' | 'ai';
type ToolItem = { id: string; label: string; status?: 'soon'; icon?: typeof Sparkles };
type CategoryItem = { id: Category; label: string; icon: typeof Sparkles; children: ToolItem[] };

const categories: CategoryItem[] = [
  { id: 'template', label: 'Template', icon: LayoutTemplate, children: [
    {id:'social',label:'Mạng xã hội',status:'soon'},{id:'poster',label:'Poster',status:'soon'},{id:'banner',label:'Banner',status:'soon'},{id:'collage-template',label:'Bố cục mẫu',status:'soon'} ] },
  { id: 'edit', label: 'Chỉnh sửa', icon: Crop, children: [
    {id:'crop',label:'Cắt tỷ lệ',icon:Crop},{id:'rotate',label:'Xoay ảnh',icon:RotateCw},{id:'flip',label:'Lật ngang',icon:FlipHorizontal},
    {id:'light',label:'Ánh sáng',icon:Sun},{id:'expand',label:'Mở rộng AI',icon:Expand,status:'soon'} ] },
  { id: 'beauty', label: 'Làm đẹp', icon: Heart, children: [
    {id:'beauty-auto',label:'Tự động',status:'soon'},{id:'face',label:'Chỉnh mặt',status:'soon'},{id:'slim',label:'Kéo thon',status:'soon'},
    {id:'lift',label:'Nâng cơ',status:'soon'},{id:'skin',label:'Chỉnh da',status:'soon'},{id:'body',label:'Chỉnh thể',status:'soon'},
    {id:'makeup',label:'Trang điểm',status:'soon'},{id:'brush',label:'Cọ',status:'soon'},{id:'skin-tone',label:'Tông da',status:'soon'},
    {id:'hair',label:'Chỉnh tóc',status:'soon'},{id:'beauty-ai',label:'Chỉnh bằng AI',status:'soon'} ] },
  { id:'design',label:'Thiết kế',icon:Layers3,children:[
    {id:'text',label:'Văn bản',icon:Type,status:'soon'},{id:'sticker',label:'Nhãn / Sticker',icon:Sticker,status:'soon'},
    {id:'add-image',label:'Thêm ảnh',icon:ImagePlus,status:'soon'},{id:'photo-collage',label:'Ghép ảnh',icon:Grid2X2,status:'soon'},
    {id:'shape',label:'Hình khối',status:'soon'},{id:'drawing',label:'Vẽ tự do',icon:Brush,status:'soon'} ] },
  { id:'remove',label:'Xóa',icon:Eraser,children:[
    {id:'remove-object',label:'Xóa vật thể',status:'soon'},{id:'remove-manual',label:'Xóa thủ công',icon:Paintbrush,status:'soon'},
    {id:'remove-ai',label:'Xóa bằng AI',icon:WandSparkles,status:'soon'},{id:'remove-bg',label:'Xóa nền AI',status:'soon'} ] },
  { id:'filters',label:'Bộ lọc',icon:Palette,children:[
    {id:'original',label:'Ảnh gốc'},{id:'bw',label:'Đen trắng'},{id:'vintage',label:'Vintage'},{id:'warm',label:'Ấm áp'},
    {id:'cool',label:'Lạnh'},{id:'vivid',label:'Rực rỡ'},{id:'soft',label:'Mềm mại'},{id:'dramatic',label:'Điện ảnh'} ] },
  { id:'adjust',label:'Điều chỉnh',icon:SlidersHorizontal,children:[
    {id:'auto',label:'Tự động'},{id:'color',label:'Màu sắc'},{id:'lux',label:'Lux'},
    {id:'brightness',label:'Độ sáng'},{id:'contrast',label:'Tương phản'},{id:'highlights',label:'Độ chói'},
    {id:'saturation',label:'Bão hòa'},{id:'temperature',label:'Nhiệt độ màu'},{id:'blur',label:'Làm mờ'} ] },
  { id:'effects',label:'Hiệu ứng',icon:Sparkles,children:[
    {id:'glow',label:'Glow',status:'soon'},{id:'grain',label:'Hạt film',status:'soon'},
    {id:'blur-effect',label:'Làm mờ nghệ thuật',status:'soon'},{id:'light-leak',label:'Ánh sáng rò',status:'soon'} ] },
  { id:'background',label:'Nền',icon:ImageIcon,children:[
    {id:'bg-color',label:'Nền màu',status:'soon'},{id:'bg-image',label:'Nền hình ảnh',status:'soon'},
    {id:'bg-ai',label:'Đổi nền AI',status:'soon'} ] },
  { id:'ai',label:'Chỉnh theo AI',icon:WandSparkles,children:[
    {id:'prompt',label:'Nhập yêu cầu AI',icon:WandSparkles,status:'soon'} ] },
];

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

export default function EditorPage(){
  const navigate=useNavigate();
  const inputRef=useRef<HTMLInputElement>(null);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [active,setActive]=useState<Category>('edit');
  const [selected,setSelected]=useState('crop');
  const [image,setImage]=useState<string|null>(null);
  const [fileName,setFileName]=useState('Chưa có ảnh');
  const [edits,setEdits]=useState<Edits>(initial);
  const [past,setPast]=useState<Edits[]>([]);
  const [future,setFuture]=useState<Edits[]>([]);
  const [status,setStatus]=useState('Sẵn sàng chỉnh sửa ảnh');
  const [prompt,setPrompt]=useState('');
  const [isBusy,setBusy]=useState(false);
  const currentCategory=categories.find(x=>x.id===active)!;

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
  const loadFile=(event:ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setStatus('Chỉ hỗ trợ JPG, PNG, WebP');return;}
    if(file.size>MAX_BYTES){setStatus('Ảnh vượt quá 20MB');return;}
    setImage(URL.createObjectURL(file));setFileName(file.name);setEdits(initial);setPast([]);setFuture([]);setStatus(`Đang chỉnh: ${file.name}`);
  };
  const adjustedFilter=()=>{
    const p=presets.find(p=>p.id===edits.preset)?.filter??'none';
    return `brightness(${edits.brightness*edits.lux/10000}) contrast(${edits.contrast}%) saturate(${edits.saturation}%) ${p==='none'?'':p} blur(${edits.blur}px)`;
  };
  const saveTemporary=()=>{
    try{sessionStorage.setItem('lumina-editor-settings',JSON.stringify({edits, fileName, savedAt:new Date().toISOString()}));setStatus('Đã lưu tạm thiết lập chỉnh sửa trong phiên này; ảnh gốc chưa được lưu');}
    catch{setStatus('Không thể lưu tạm trong trình duyệt');}
  };
  const exportImage=()=>{
    if(!image){setStatus('Hãy chọn ảnh trước khi xuất');return;}
    setBusy(true);
    const img=new Image();
    img.onload=()=>{
      const sideways=Math.abs(edits.rotation/90)%2===1;
      const canvas=document.createElement('canvas');canvas.width=sideways?img.naturalHeight:img.naturalWidth;canvas.height=sideways?img.naturalWidth:img.naturalHeight;
      const context=canvas.getContext('2d');if(!context){setBusy(false);setStatus('Không tạo được ảnh xuất');return;}
      context.translate(canvas.width/2,canvas.height/2);context.rotate(edits.rotation*Math.PI/180);context.scale(edits.flipped?-1:1,1);context.filter=adjustedFilter();context.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);
      canvas.toBlob(blob=>{setBusy(false);if(!blob){setStatus('Không thể xuất ảnh');return;}
        const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='lumina-edited.png';anchor.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Đã xuất PNG về máy');},'image/png');
    };
    img.onerror=()=>{setBusy(false);setStatus('Không đọc được ảnh để xuất');};img.src=image;
  };
  const handleTool=(id:string)=>{
    setSelected(id);
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
        <div className="lv3-top-left"><button className="lv3-icon-btn" title="Quay về thư viện" onClick={()=>navigate('/projects')}><ArrowLeft size={18}/></button><div className="lv3-project"><strong>Studio chỉnh ảnh</strong><small>{fileName}</small></div><span className="lv3-draft-tag">Bản nháp</span></div>
        <div className="lv3-top-actions"><button onClick={undo} disabled={!past.length} title="Hoàn tác"><Undo2 size={18}/><span>Hoàn tác</span></button><button onClick={redo} disabled={!future.length} title="Làm lại"><Redo2 size={18}/><span>Làm lại</span></button><span className="lv3-split"/><button onClick={saveTemporary} title="Lưu tạm thiết lập phiên làm việc"><Save size={18}/><span>Lưu tạm</span></button><button onClick={()=>setStatus('Lưu vĩnh viễn cần Project/Asset/EditorState API từ Backend; chưa lưu lên Cloudinary')} title="Chờ Backend"><Cloud size={18}/><span>Lưu hẳn</span></button><button className="lv3-purple-button" onClick={exportImage} disabled={!image||isBusy}><Download size={18}/>Xuất ảnh</button></div>
      </header>
      <div className="lv3-body">
        <section className="lv3-toolbox" aria-label={`Công cụ ${currentCategory.label}`}>
          <div className="lv3-toolbox-title"><div><small>CÔNG CỤ</small><h2>{currentCategory.label}</h2></div><button className="lv3-icon-btn" title="Đóng bảng công cụ" onClick={()=>setSidebarOpen(false)}><ChevronLeft size={18}/></button></div>
          <div className="lv3-tool-grid">{currentCategory.children.map(t=>{const Icon=t.icon||WandSparkles;return <button key={t.id} className={`lv3-tool-item ${selected===t.id?'selected':''}`} onClick={()=>handleTool(t.id)} title={t.label}><span className="lv3-tool-symbol"><Icon size={21}/></span><span>{t.label}</span>{t.status==='soon'&&<small>SAU</small>}</button>})}</div>
          {(active==='edit'||active==='adjust')&&<div className="lv3-settings"><div className="lv3-heading"><SlidersHorizontal size={17}/> Tinh chỉnh trực tiếp</div>{active==='edit'&&<div className="lv3-ratios">{['Tự do','1:1','4:3','9:16','16:9'].map(r=><button key={r} className={edits.ratio===r?'chosen':''} onClick={()=>mutate({ratio:r})}>{r}</button>)}</div>}{slider('Độ sáng','brightness',40,160)}{slider('Tương phản','contrast',40,160)}{slider('Bão hòa','saturation',0,200)}{active==='adjust'&&<>{slider('Lux','lux',50,150)}{slider('Làm mờ','blur',0,12,'px')}</>}</div>}
          {active==='filters'&&<div className="lv3-filters-grid">{presets.map(p=><button key={p.id} onClick={()=>handleTool(p.id)} className={edits.preset===p.id?'chosen':''}><span className="lv3-filter-thumb">{image?<img src={image} alt="" style={{filter:p.filter}}/>:<Palette size={30}/>}</span><span>{p.name}</span></button>)}</div>}
          {active==='ai'&&<div className="lv3-ai-box"><strong><Sparkles size={17}/> Nhập mô tả chỉnh sửa</strong><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} maxLength={1500} rows={6} placeholder="Ví dụ: Làm sáng ảnh, xóa vật thể phía sau và đổi nền thành bãi biển..."/><button onClick={()=>setStatus('Chỉnh sửa bằng ngôn ngữ cần Natural Edit API từ Backend. Prompt chưa được gửi đi.')} disabled={!prompt.trim()}><WandSparkles size={17}/> Tạo kế hoạch AI</button><p>Hiện chưa kết nối Gemini / Natural Edit, nên không tự thực thi yêu cầu.</p></div>}
          {active==='beauty'&&<p className="lv3-soon-note">Các công cụ làm đẹp sẽ được Thắng (N2) tích hợp tại đây, các mô hình AI xử lý qua Backend.</p>}
          {active==='design'&&<p className="lv3-soon-note">Văn bản, sticker, layer và ghép ảnh thuộc Creative module của Thắng (N2).</p>}
          <div className="lv3-toolbox-footer"><CircleHelp size={16}/> Công cụ có nhãn SAU chưa thực thi.</div>
        </section>
        <section className="lv3-center">
          <div className="lv3-canvas-toolbar"><div className="lv3-toolbar-label"><Move size={16}/> Không gian chỉnh sửa</div><div className="lv3-toolbar-tools"><button onClick={()=>inputRef.current?.click()}><FolderOpen size={16}/> Mở ảnh</button><span className="lv3-line"/><button onClick={()=>mutate({rotation:(edits.rotation+270)%360})} title="Xoay trái"><RotateCcw size={17}/></button><button onClick={()=>mutate({rotation:(edits.rotation+90)%360})} title="Xoay phải"><RotateCw size={17}/></button><button onClick={()=>mutate({flipped:!edits.flipped})} title="Lật ngang"><FlipHorizontal size={17}/></button></div></div>
          <div className="lv3-canvas-space">
            {image?<div className="lv3-image-stage"><img src={image} alt="Ảnh đang chỉnh sửa" style={viewStyle}/></div>:<div className="lv3-empty"><div className="lv3-empty-orb"><ImagePlus size={40}/></div><h2>Bắt đầu với một bức ảnh</h2><p>Thêm ảnh để sử dụng công cụ chỉnh sửa, bộ lọc và xem trước.</p><button onClick={()=>inputRef.current?.click()}><ImagePlus size={18}/> Chọn ảnh từ thiết bị</button><small>JPG, PNG, WebP · Tối đa 20MB</small></div>}
          </div>
          <div className="lv3-bottom"><span className="lv3-message" role="status">{status}</span><div className="lv3-zoom"><button onClick={()=>mutate({zoom:Math.max(40,edits.zoom-10)})} title="Thu nhỏ"><ZoomOut size={17}/></button><b>{edits.zoom}%</b><button onClick={()=>mutate({zoom:Math.min(200,edits.zoom+10)})} title="Phóng to"><ZoomIn size={17}/></button><button onClick={()=>mutate({zoom:100})} title="Về 100%">100%</button></div></div>
        </section>
      </div>
    </div>
  </div>;
}
