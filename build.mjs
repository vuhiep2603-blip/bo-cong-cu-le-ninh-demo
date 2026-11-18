import {build} from 'esbuild';
await build({entryPoints:['src/browser.js'],bundle:true,format:'iife',globalName:'LeNinh',outfile:'assets/app.js',minify:true,legalComments:'linked',target:['es2020']});
