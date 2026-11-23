import type {PDFPageProxy} from 'pdfjs-dist';
import {createWorker,PSM} from 'tesseract.js';
import workerUrl from 'tesseract.js/dist/worker.min.js?url';
import coreUrl from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';
import {reconstructRows} from './pdf-layout';
import type {DocumentRow} from './document-layout';
import {estimateSkew,prepareOcrImage} from './ocr-image';
import type {ImageProfile} from './ocr-image';

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
 async function scan(page:PDFPageProxy,index:number,header=false,contrast=false,zone?:'left'|'right',lineY?:number,profile:ImageProfile=contrast?'contrast':'original',rotation=0) {
   const base=page.getViewport({scale:1});
   const scale=Math.min(lineY!==undefined?4:header?3.2:2.6,4608/Math.max(base.width,base.height),Math.sqrt(13_000_000/(base.width*base.height)));
   const viewport=page.getViewport({scale,rotation:(base.rotation+rotation)%360});
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
     if(profile!=='original'){
       let image=ctx.getImageData(0,0,canvas.width,canvas.height);
       if(profile==='adaptive'&&zone){
         const angle=estimateSkew(image.data,canvas.width,canvas.height);
         if(angle){
           const source=document.createElement('canvas');
           source.width=canvas.width;source.height=canvas.height;
           context(source).putImageData(image,0,0);
           ctx.save();ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
           ctx.translate(canvas.width/2,canvas.height/2);
           ctx.rotate(angle*Math.PI/180);
           ctx.drawImage(source,-canvas.width/2,-canvas.height/2);ctx.restore();
           source.width=0;source.height=0;
           image=ctx.getImageData(0,0,canvas.width,canvas.height);
         }
       }
       prepareOcrImage(image,profile);
       ctx.putImageData(image,0,0);
     }
     await worker.setParameters({tessedit_pageseg_mode:lineY!==undefined?PSM.SINGLE_LINE:contrast?PSM.SPARSE_TEXT:PSM.AUTO});
     const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
     const fragments=(data.blocks??[]).flatMap(block=>block.paragraphs.flatMap(p=>p.lines.flatMap(line=>
       line.words.map(word=>({str:word.text+' ',x:word.bbox.x0+offset,y:-line.baseline.y1-top,
          width:word.bbox.x1-word.bbox.x0,height:line.bbox.y1-line.bbox.y0})))));
     const rows:DocumentRow[]=reconstructRows(fragments,viewport.width,'OCR',index,data.confidence)
       .map(row=>{
         const y=(row.y??0)/scale;
         if(!rotation)return {...row,y};
         const x=(row.cells[0]?.x??0)*viewport.width/1000;
         const position=viewport.convertToPdfPoint(x,-y*scale);
         return {...row,y,sourceY:-base.convertToViewportPoint(position[0],position[1])[1]};
       });
     return {rows,text:data.text,confidence:data.confidence};
   } finally {
     canvas.width=0;canvas.height=0;
   }
 }
 async function scanPage(page:PDFPageProxy,index:number) {
   const original=await scan(page,index);
   const score=(result:typeof original)=>{
     const words=result.text.match(/[\p{L}]{2,}/gu)??[];
     const anchored=result.rows.filter(row=>row.cells.some(cell=>/\p{L}{2,}/u.test(cell.text))).length;
     const administrative=new Set((result.text.normalize('NFC').match(/(?:số\s*:|ngày\s+\d|tháng\s+\d|chủ trì|thời hạn|sản phẩm|kính gửi|nơi nhận|đảng ủy|đảng uỷ)/igu)??[])
       .map(word=>word.toLowerCase())).size;
     return {words:words.length,anchored,administrative};
   };
   const baseline=score(original);
   if(baseline.words>=12&&baseline.anchored>=3&&original.confidence>=55&&(index!==1||baseline.administrative>=1))return {...original,rotation:0};
   let best={...original,rotation:0},bestScore=baseline;
   for(const rotation of [180,90,270]){
     const variant=await scan(page,index,false,false,undefined,undefined,'original',rotation);
     const measure=score(variant);
     const strongerHeader=index===1&&measure.administrative>=Math.max(2,bestScore.administrative+2)&&measure.words>=12;
     if((strongerHeader||measure.words>=Math.max(12,bestScore.words*1.75))&&measure.anchored>=3&&variant.confidence>=45){
       best={...variant,rotation};bestScore=measure;
       break;
     }
   }
   return best;
 }
 return {scan,scanPage,close:()=>worker.terminate()};
}
