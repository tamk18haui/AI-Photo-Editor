import type { Step } from './geminiJobsApi';
import type { ImageLayer, CreativeLayer } from '../../layouts/LayersWorkspace';
import { FILTER_MAP } from '../../layouts/editor-presets';

/** Execute registered N5 FRONTEND commands on N1's real editable composition. */
export type EditorComposition = {
  layers: ImageLayer[];
  creative: CreativeLayer[];
  background: {type:'transparent'|'color'|'image';color:string;url:string;assetId:number|null};
  frame: string;
  groupFilter: string;
};

const EDITOR_COMMANDS = new Set([
  'ROTATE','FLIP','ADJUST','ADD_TEXT','ADD_STICKER','ADD_SHAPE',
  'SET_FILTER','SET_BACKGROUND','SET_FRAME',
]);
const EDIT_PROPERTIES = ['brightness','contrast','saturation','lux','highlights','temperature','blur'] as const;
const FRAMES = new Set(['none','simple','polaroid','film','minimal','gold','noir',
  'editorial','rounded','double','vintage','neon','pastel','postcard']);
const SHAPES = new Set(['square','rectangle','circle','ellipse']);
const hexColor = /^#[0-9a-fA-F]{6}$/;

export function canApplyEditableCommands(steps:Step[]):boolean {
  return steps.length>0 && steps.every(step=>step.executor==='FRONTEND'&&EDITOR_COMMANDS.has(step.tool));
}

function number(args:Step['arguments'],key:string,fallback:number,min:number,max:number):number {
  const value=Number(args[key]??fallback);
  if(!Number.isFinite(value)||value<min||value>max)throw new Error(`Tham số ${key} phải từ ${min} đến ${max}.`);
  return value;
}

function color(args:Step['arguments'],fallback='#ffffff'):string {
  const value=String(args.color??fallback);
  if(!hexColor.test(value))throw new Error('Màu phải là mã HEX, ví dụ #ffffff.');
  return value;
}

export function applyEditableCommands(current:EditorComposition,steps:Step[],
                                       selectedImageId:string|null):EditorComposition {
  if(!canApplyEditableCommands(steps))throw new Error('Kế hoạch có công cụ không thể chỉnh trực tiếp trên layer.');
  const next:EditorComposition={
    layers:current.layers.map(layer=>({...layer})),
    creative:current.creative.map(layer=>({...layer})),
    background:{...current.background},
    frame:current.frame,
    groupFilter:current.groupFilter,
  };
  for(const step of steps){
    const args=step.arguments;
    if(['ROTATE','FLIP','ADJUST'].includes(step.tool)){
      // Respect a deliberately selected image; otherwise use the uppermost unlocked, visible photo.
      const selected=selectedImageId?next.layers.find(layer=>layer.id===selectedImageId):null;
      const photo=selected??[...next.layers].reverse().find(layer=>layer.visible&&!layer.locked);
      if(!photo||photo.locked||!photo.visible)throw new Error('Hãy chọn một layer ảnh không khóa để chỉnh.');
      if(step.tool==='ROTATE'){
        const angle=number(args,'angle',90,-360,360);
        photo.rotation=((photo.rotation??0)+angle)%360;
      }else if(step.tool==='FLIP')photo.flipped=!photo.flipped;
      else{
        const present=EDIT_PROPERTIES.filter(key=>args[key]!==undefined);
        if(!present.length)throw new Error('Lệnh điều chỉnh chưa có thông số.');
        for(const key of present){
          const minimum=key==='temperature'?-100:0;
          const maximum=key==='temperature'?100:key==='blur'?20:200;
          photo[key]=number(args,key,key==='temperature'||key==='blur'?0:100,minimum,maximum);
        }
      }
    }else if(step.tool==='ADD_TEXT'||step.tool==='ADD_STICKER'||step.tool==='ADD_SHAPE'){
      const raw=String(args.text??'').trim();
      const shape=String(args.shape??'rectangle');
      if(step.tool==='ADD_SHAPE'&&!SHAPES.has(shape))throw new Error('Hình khối không được hỗ trợ.');
      if(step.tool!=='ADD_SHAPE'&&(!raw||raw.length>400))throw new Error('Nội dung chữ/sticker phải dài 1–400 ký tự.');
      const font=String(args.fontFamily??'Arial').slice(0,80);
      const kind=step.tool==='ADD_TEXT'?'text':step.tool==='ADD_STICKER'?'sticker':'shape';
      next.creative.push({
        id:`n5-${kind}-${crypto.randomUUID()}`,kind,value:kind==='shape'?shape:raw,
        name:kind==='text'?'Văn bản':kind==='shape'?'Hình khối':'Sticker',
        x:number(args,'x',0.12,0,1)*100,y:number(args,'y',0.12,0,1)*100,
        width:number(args,'width',0.65,0.05,1)*100,
        fontSize:number(args,'fontSize',kind==='sticker'?64:42,10,160),
        color:color(args),rotation:0,visible:true,locked:false,opacity:100,fontFamily:font,
      });
    }else if(step.tool==='SET_FILTER'){
      const filter=String(args.preset??'');
      if(!Object.prototype.hasOwnProperty.call(FILTER_MAP,filter))throw new Error('Bộ lọc không tồn tại trong Editor.');
      next.groupFilter=filter;
    }else if(step.tool==='SET_FRAME'){
      const frame=String(args.frame??'');
      if(!FRAMES.has(frame))throw new Error('Khung ảnh không được hỗ trợ.');
      next.frame=frame;
    }else if(step.tool==='SET_BACKGROUND'){
      const backgroundType=String(args.backgroundType??'color');
      if(backgroundType!=='transparent'&&backgroundType!=='color')throw new Error('Nền này chưa có công cụ tự động.');
      next.background={...next.background,type:backgroundType,color:color(args,next.background.color)};
    }
  }
  return next;
}
