// Executed only by the localhost benchmark, outside the production entry graph.
export async function compareRegions(regions, characters) {
 console.debug('[vpdu-lab] pdf');
  const pdfjs=await import('/node_modules/pdfjs-dist/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.min.mjs';
  const data=new Uint8Array(await (await fetch('/__bench/document')).arrayBuffer());
  const loading=pdfjs.getDocument({data,enableXfa:false,wasmUrl:location.origin+'/pdf-assets/wasm/',
    cMapUrl:location.origin+'/pdf-assets/cmaps/',cMapPacked:true,standardFontDataUrl:location.origin+'/pdf-assets/standard_fonts/'});
 console.debug('[vpdu-lab] runtime');
  const runtime=location.origin+'/__bench/ort/ort.wasm.min.mjs';
  const ort=await import(/* @vite-ignore */ runtime);
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=location.origin+'/__bench/ort/';
 console.debug('[vpdu-lab] session');
  const rec=await ort.InferenceSession.create('/__bench/model',{executionProviders:['wasm']});
 console.debug('[vpdu-lab] primary');
  const {createOcrSession}=await import('/src/ocr.ts');
  const primary=await createOcrSession();
  const results=[];
  async function predict(image) {
    const height=48,width=Math.max(16,Math.min(1800,Math.round(height*image.width/image.height)));
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(image,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data;
    const count=width*height, values=new Float32Array(count*3);
    for(let i=0;i<count;i++) for(let c=0;c<3;c++)values[c*count+i]=rgba[i*4+2-c]/127.5-1;
    const input=new ort.Tensor('float32',values,[1,3,height,width]);
    const output=(await rec.run({[rec.inputNames[0]]:input}))[rec.outputNames[0]];
    try {
      const [,steps,classes]=output.dims;
      if(classes!==characters.length+2)throw Error('Bảng ký tự không khớp mô hình Latin PP-OCRv5.');
      let previous=0,text='';
      for(let step=0;step<steps;step++){
        let best=0;
        for(let letter=1;letter<classes;letter++) if(output.data[step*classes+letter]>output.data[step*classes+best])best=letter;
        if(best&&best!==previous)text+=characters[best-1]??' ';
        previous=best;
      }
      return text;
    } finally {output.dispose();input.dispose();}
  }
  try{
 console.debug('[vpdu-lab] render');
    const pdf=await loading.promise;
    for(const region of regions){
      const page=await pdf.getPage(region.page??1);
      const viewport=page.getViewport({scale:2.5});
      const line=-region.lineY*2.5/viewport.height;
      const rect=region.rect??(region.key==='number'
        ?[.02,Math.max(0,line-.025),.52,.038] : [.4,Math.max(0,line-.025),.57,.038]);
      const [x,y,w,h]=rect;
      const crop=document.createElement('canvas');
      crop.width=Math.ceil(w*viewport.width);crop.height=Math.ceil(h*viewport.height);
      await page.render({canvas:crop,canvasContext:crop.getContext('2d'),viewport,background:'white',
        transform:[1,0,0,1,-x*viewport.width,-y*viewport.height]}).promise;
      // The adapter renders the same cropped pixels for both engines.
      const stub={
        getViewport:({scale})=>({width:crop.width*scale,height:crop.height*scale,rotation:0}),
        render:({canvasContext,viewport})=>{canvasContext.drawImage(crop,0,0,viewport.width,viewport.height);return {promise:Promise.resolve()};}
      };
      const start=performance.now();
 console.debug('[vpdu-lab] primary-roi');
      const base=await primary.scan(stub,region.page??1,false,false,undefined,-5);
      const afterPrimary=performance.now();
 console.debug('[vpdu-lab] alternate-roi');
      const alternate=await predict(crop);
      results.push({key:region.key,primary:base.text.trim(),alternate:alternate.trim(),
        primaryMs:Math.round(afterPrimary-start),alternateMs:Math.round(performance.now()-afterPrimary)});
    }
    return results;
  } finally {try{await primary.close();}finally{try{await rec.release();}finally{await loading.destroy();}}}
}
