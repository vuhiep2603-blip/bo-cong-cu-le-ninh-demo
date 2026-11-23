import {useEffect,useRef,useState} from 'react';
import {previewDocumentPage} from './parser';
import type {OcrZone} from './parser';

export interface PreviewFocus {page:number;y?:number;zone?:OcrZone}
export function DocumentPreview({file,pageCount,focus,selectPage,onRetry,busy}:{
 file:File;pageCount:number;focus:PreviewFocus;selectPage:(focus:PreviewFocus)=>void;onRetry:(zone:OcrZone)=>void;busy:boolean;
}){
 const [image,setImage]=useState<Awaited<ReturnType<typeof previewDocumentPage>>>();
 const [error,setError]=useState('');
 const [zone,setZone]=useState<OcrZone>('page');
 const highlight=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   let current=true;
   setImage(undefined);setError('');
   void previewDocumentPage(file,focus.page).then(value=>{if(current)setImage(value);},
     error=>{if(current)setError(error instanceof Error?error.message:'Không mở được trang PDF.');});
   return ()=>{current=false;};
 },[file,focus.page]);
 useEffect(()=>{if(focus.zone)setZone(focus.zone);},[focus]);
 useEffect(()=>{highlight.current?.scrollIntoView({block:'nearest'});},[image,focus]);
 const y=image&&focus.y!==undefined?Math.max(0,Math.min(97,-focus.y*100/image.height)):undefined;
 return <section aria-label="Xem trước PDF gốc" className="document-preview">
  <h4>Xem trước PDF gốc</h4>
  <div className="buttons">
   <button type="button" disabled={focus.page<=1||busy} onClick={()=>selectPage({page:focus.page-1})}>Trang trước</button>
   <span>Trang {focus.page}/{pageCount}</span>
   <button type="button" disabled={focus.page>=pageCount||busy} onClick={()=>selectPage({page:focus.page+1})}>Trang sau</button>
  </div>
  {error?<p role="alert">{error}</p>:image?
    <div className="document-preview-scroll"><div className="document-preview-page">
     <img src={image.image} alt={'PDF gốc, trang '+focus.page}/>
     {y!==undefined&&<div ref={highlight} className="document-highlight" style={{top:y+'%'}} aria-label="Dòng được chọn"/>}
    </div></div>:<p role="status">Đang tải trang PDF…</p>}
  <label>Vùng OCR lại<select value={zone} disabled={busy} onChange={event=>setZone(event.target.value as OcrZone)}>
   <option value="page">Cả trang hiện tại</option><option value="header">Đầu trang</option>
   <option value="left">Vùng trái đầu trang</option><option value="right">Vùng phải đầu trang</option>
  </select></label>
  <button type="button" disabled={busy||!image} onClick={()=>onRetry(zone)}>OCR lại vùng chọn</button>
 </section>;
}
