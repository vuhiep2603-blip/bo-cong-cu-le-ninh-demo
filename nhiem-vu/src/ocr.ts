import type {PDFPageProxy} from 'pdfjs-dist';
import {createWorker,PSM} from 'tesseract.js';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import {reconstructRows} from './pdf-layout';
import type {DocumentRow} from './document-layout';

function context(canvas:HTMLCanvasElement) {
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx) throw Error('Trình duyệt không hỗ trợ vẽ trang để OCR.');
  return ctx;
}
export async function createOcrSession() {
 const worker=await createWorker('vie',1,{
   workerPath:workerUrl,corePath:coreUrl,langPath:new URL('./ocr/lang',document.baseURI).href,
   workerBlobURL:false,cacheMethod:'none'
 });
 async function scan(page:PDFPageProxy,index:number,header=false,contrast=false,zone?:'left'|'right',lineY?:number) {
   const base=page.getViewport({scale:1});
   const scale=Math.min(header?3.2:2.6,4608/Math.max(base.width,base.height),Math.sqrt(13_000_000/(base.width*base.height)));
   const viewport=page.getViewport({scale});
   const canvas=document.createElement('canvas');
   canvas.width=Math.ceil(viewport.width);
   canvas.height=Math.ceil(viewport.height*(header?.46:1));
   try {
     let ctx=context(canvas);
     await page.render({canvas,canvasContext:ctx,viewport,background:'white'}).promise;
     let offset=0,top=0;
     if(zone){
       offset=zone==='right'?Math.floor(canvas.width*.4):0;
       const width=Math.min(canvas.width-offset,Math.ceil(canvas.width*.6));
       top=lineY===undefined?0:Math.min(canvas.height-1,Math.max(0,Math.floor((-lineY-18)*scale)));
       const height=lineY===undefined?canvas.height:Math.min(canvas.height-top,Math.ceil(28*scale));
       const crop=ctx.getImageData(offset,top,width,height);
       canvas.width=width;canvas.height=height;
       ctx=context(canvas);
       ctx.putImageData(crop,0,0);
     }
     if(contrast){
       const image=ctx.getImageData(0,0,canvas.width,canvas.height);
       for(let i=0;i<image.data.length;i+=4){
         const gray=(image.data[i]*.299+image.data[i+1]*.587+image.data[i+2]*.114);
         const value=Math.max(0,Math.min(255,(gray-110)*1.6+110));
         image.data[i]=image.data[i+1]=image.data[i+2]=value;
       }
       ctx.putImageData(image,0,0);
     }
     await worker.setParameters({tessedit_pageseg_mode:lineY!==undefined?PSM.SINGLE_LINE:contrast?PSM.SPARSE_TEXT:PSM.AUTO});
     const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
     const fragments=(data.blocks??[]).flatMap(block=>block.paragraphs.flatMap(p=>p.lines.flatMap(line=>
       line.words.map(word=>({str:word.text+' ',x:word.bbox.x0+offset,y:-line.baseline.y1-top,
          width:word.bbox.x1-word.bbox.x0,height:line.bbox.y1-line.bbox.y0})))));
     const rows:DocumentRow[]=reconstructRows(fragments,viewport.width,'OCR',index,data.confidence)
       .map(row=>({...row,y:(row.y??0)/scale}));
     return {rows,text:data.text,confidence:data.confidence};
   } finally {
     canvas.width=0;canvas.height=0;
   }
 }
 return {scan,close:()=>worker.terminate()};
}
