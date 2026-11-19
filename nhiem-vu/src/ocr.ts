import type {PDFPageProxy} from 'pdfjs-dist';
// OCR assets are served from THIS GitHub Pages app origin; never use remote OCR APIs.
// Bundled by the QA/production Pages workflow from pinned npm dependencies.
interface OCRWorker {
  recognize(image:HTMLCanvasElement):Promise<{data:{text:string;confidence:number}}>;
  terminate():Promise<unknown>;
}
interface OCRRuntime {
  createWorker(lang:string,oem:number,options:Record<string,unknown>):Promise<OCRWorker>;
}
declare global {interface Window {Tesseract?:OCRRuntime}}
let loader:Promise<OCRRuntime>|null=null;
function ocrAssets(path:string) {
  return new URL('./ocr/'+path,document.baseURI).toString();
}
function loadRuntime():Promise<OCRRuntime> {
  if(loader) return loader;
  loader=new Promise<OCRRuntime>((resolve,reject)=>{
    if(window.Tesseract) {resolve(window.Tesseract);return;}
    const script=document.createElement('script');
    script.src=ocrAssets('tesseract.min.js');
    script.async=true;
    script.onload=()=>window.Tesseract?resolve(window.Tesseract):reject(Error('Không khởi tạo được bộ OCR nội bộ.'));
    script.onerror=()=>reject(Error('Thiếu bộ OCR cài tại website. Không tải dữ liệu văn bản sang dịch vụ khác.'));
    document.head.appendChild(script);
  }).catch(error=>{loader=null;throw error;});
  return loader!;
}
export async function recognizePdfHeader(page:PDFPageProxy):Promise<{text:string;confidence:number}> {
  const viewport=page.getViewport({scale:2.25});
  const canvas=document.createElement('canvas');
  // Cropping the heading minimizes accidental capture of deadlines in the body.
  canvas.width=Math.ceil(viewport.width);
  canvas.height=Math.ceil(viewport.height*0.48);
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('Trình duyệt không hỗ trợ vẽ trang PDF để nhận diện.');
  // Canvas clipping is applied by the output canvas height.
  await page.render({canvas,canvasContext:context,viewport}).promise;
  const Tesseract=await loadRuntime();
  const worker=await Tesseract.createWorker('vie',1,{
    workerPath:ocrAssets('worker.min.js'),
    corePath:ocrAssets('core'),
    langPath:ocrAssets('lang'),
    workerBlobURL:false,
    cacheMethod:'none'
  });
  try {
    const result=await worker.recognize(canvas);
    return {text:result.data.text??'',confidence:result.data.confidence??0};
  } finally {
    await worker.terminate();
    canvas.width=0;canvas.height=0;
  }
}

/** OCR each scanned PDF page in sequence using ONE local Vietnamese model worker. */
export async function recognizePdfPages(
  pages:PDFPageProxy[],
  onProgress?:(complete:number,total:number)=>void
):Promise<string[]> {
  if(!pages.length)return [];
  const Tesseract=await loadRuntime();
  const worker=await Tesseract.createWorker('vie',1,{
    workerPath:ocrAssets('worker.min.js'),
    corePath:ocrAssets('core'),
    langPath:ocrAssets('lang'),
    workerBlobURL:false,
    cacheMethod:'none'
  });
  const output:string[]=[];
  try {
    for(let i=0;i<pages.length;i++){
      const page=pages[i];
      const viewport=page.getViewport({scale:2.2});
      const canvas=document.createElement('canvas');
      canvas.width=Math.ceil(viewport.width);
      canvas.height=Math.ceil(viewport.height);
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw Error('Không tạo được vùng ảnh phục vụ OCR.');
      try {
        await page.render({canvas,canvasContext:context,viewport}).promise;
        const result=await worker.recognize(canvas);
        output.push(result.data.text??'');
      } finally {
        canvas.width=0;canvas.height=0;
      }
      onProgress?.(i+1,pages.length);
    }
    return output;
  } finally {
    await worker.terminate();
  }
}
