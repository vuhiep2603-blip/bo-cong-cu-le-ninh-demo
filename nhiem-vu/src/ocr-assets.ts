import {readdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import type {Plugin} from 'vite';

export function localOcrAssets():Plugin {
  const root=new URL('../node_modules/',import.meta.url);
  const assets=new Map([
    ['ocr/lang/vie.traineddata.gz','@tesseract.js-data/vie/4.0.0_best_int/vie.traineddata.gz'],
    ['ocr/LICENSE-tesseract.txt','tesseract.js/LICENSE.md'],
    ['ocr/LICENSE-worker.txt','tesseract.js/dist/worker.min.js.LICENSE.txt'],
    ['ocr/LICENSE-core.txt','tesseract.js-core/LICENSE'],
    ['pdf-assets/LICENSE','pdfjs-dist/LICENSE']
  ]);
  for(const folder of ['wasm','cmaps','standard_fonts','iccs']){
    for(const entry of readdirSync(new URL('pdfjs-dist/'+folder+'/',root),{withFileTypes:true})){
      if(entry.isFile())assets.set('pdf-assets/'+folder+'/'+entry.name,'pdfjs-dist/'+folder+'/'+entry.name);
    }
  }
  const asset=(path:string)=>readFile(new URL(path,root));
  return {
    name:'local-document-assets',
    configureServer(server) {
      server.middlewares.use((req,res,next)=>{
        const path=(req.url??'').split('?')[0].replace(/^\//,'');
        const file=assets.get(path);
        if (!file) return next();
        void asset(file).then(bytes=>{
          res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':
            path.endsWith('.wasm')?'application/wasm':'application/octet-stream');
          res.end(bytes);
        },next);
      });
    },
    async generateBundle() {
      for (const [fileName,path] of assets) {
        this.emitFile({type:'asset',fileName,source:await asset(path)});
      }
    }
  };
}
