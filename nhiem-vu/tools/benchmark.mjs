import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {mkdtemp,readFile,readdir,realpath,rm,writeFile} from 'node:fs/promises';
import {basename,dirname,extname,isAbsolute,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {tmpdir} from 'node:os';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {values:args}=parseArgs({options:{
 dir:{type:'string'},truth:{type:'string'},out:{type:'string'},before:{type:'string'},
 channel:{type:'string'},chromium:{type:'string'},model:{type:'string'},characters:{type:'string'},'regions-only':{type:'boolean'},'timeout-ms':{type:'string'}
}});
if(!args.dir||!args.out||Boolean(args.model)!==Boolean(args.characters)){
 throw Error('Dùng --dir PDF_FOLDER --out REPORT.json [--truth TRUTH.json] [--before MODULE_FOLDER] [--channel chrome|msedge] [--model MODEL.onnx --characters DICTIONARY.json]');
}
if(args.channel&&!['chrome','msedge'].includes(args.channel))throw Error('Channel phải là chrome hoặc msedge.');
if(args.channel&&args.chromium)throw Error('Chọn một trong --channel hoặc --chromium.');
const timeout=Number(args['timeout-ms']??240000);
if(!Number.isFinite(timeout)||timeout<1000)throw Error('Timeout phải tối thiểu 1000 ms.');
if(args['regions-only']&&(!args.model||!args.truth||args.before))throw Error('Chế độ regions-only cần model, bảng ký tự và vùng ROI chuẩn.');
const checkout=await realpath(resolve(root,'..'));
async function checkPrivate(path,allowNewFile=false) {
 if(!path)return;
 const location=allowNewFile?resolve(await realpath(dirname(resolve(path))),basename(path)):await realpath(path);
 const difference=relative(checkout,location);
 if(!isAbsolute(difference)&&difference!=='..'&&!difference.startsWith('..'+sep)){
   throw Error('Dữ liệu benchmark và báo cáo phải đặt ngoài checkout Git.');
 }
}
await Promise.all([checkPrivate(args.dir),checkPrivate(args.out,true),checkPrivate(args.truth),
 checkPrivate(args.model),checkPrivate(args.characters)]);
const truth=args.truth?JSON.parse(await readFile(args.truth,'utf8')):{};
const chars=args.characters?JSON.parse(await readFile(args.characters,'utf8')):null;
if(chars&&(!Array.isArray(chars)||!chars.length||!chars.every(item=>typeof item==='string')))throw Error('Bảng ký tự không hợp lệ.');
const names=(await readdir(args.dir,{withFileTypes:true})).filter(entry=>entry.isFile()&&extname(entry.name).toLowerCase()==='.pdf')
 .map(entry=>entry.name).sort();
if(!names.length)throw Error('Không có tệp PDF trong thư mục.');
const normalize=s=>String(s??'').normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,' ').trim();
function errorRate(reference,actual,split){
 const a=split(normalize(reference)),b=split(normalize(actual));
 if(!a.length)return null;
 let last=Array.from({length:b.length+1},(_,i)=>i);
 for(const [i,x] of a.entries()){
  const row=[i+1];
  for(const [j,y] of b.entries())row.push(Math.min(row[j]+1,last[j+1]+1,last[j]+(x!==y)));
  last=row;
 }
 return last.at(-1)/a.length;
}
const words=text=>text?text.split(' '):[];
function scoreTasks(expected,actual){
 if(!Array.isArray(expected))return null;
 const ranked=[];
 const wordSet=text=>new Set(words(normalize(text)));
 const observed=actual.map(task=>wordSet(task.detail));
 for(const [i,task] of expected.entries()){
  const answer=wordSet(task.detail);
  for(const [j,have] of observed.entries()){
   const overlap=[...answer].filter(word=>have.has(word)).length;
   const similarity=overlap/Math.max(1,new Set([...answer,...have]).size);
   if(similarity>=.8)ranked.push({i,j,similarity});
  }
 }
 ranked.sort((a,b)=>b.similarity-a.similarity||a.i-b.i||a.j-b.j);
 const expectedMatched=new Set(),actualMatched=new Set(),fields={};
 for(const {i,j} of ranked){
  if(expectedMatched.has(i)||actualMatched.has(j))continue;
  expectedMatched.add(i);actualMatched.add(j);
  for(const key of ['lead','partners','deadline','deliverable']){
   if(expected[i][key]===undefined)continue;
   const stat=fields[key]??={total:0,correct:0};
   stat.total++;if(normalize(expected[i][key])===normalize(actual[j][key]))stat.correct++;
  }
 }
 const tp=expectedMatched.size,precision=actual.length?tp/actual.length:expected.length?0:null,recall=expected.length?tp/expected.length:null;
 return {tp,fp:actual.length-tp,fn:expected.length-tp,precision,recall,
   f1:precision===null||recall===null?null:precision+recall?2*precision*recall/(precision+recall):0,fields};
}
function metrics(result,expected){
 if(!expected)return null;
 return {
   numberExact:expected.number===undefined?null:normalize(expected.number)===normalize(result.source.number),
   dateExact:expected.documentDate===undefined?null:expected.documentDate===result.documentDate,
   subjectExact:expected.subject===undefined?null:normalize(expected.subject)===normalize(result.source.subject),
   cer:expected.subject===undefined?null:errorRate(expected.subject,result.source.subject,text=>[...text]),
   wer:expected.subject===undefined?null:errorRate(expected.subject,result.source.subject,words),
   tasks:scoreTasks(expected.tasks,result.proposals)
 };
}
function roiValue(text,key){
 if(key==='number')return text.normalize('NFC').match(/\d{1,6}\s*[-/]\s*[\p{L}\p{N}]+(?:\s*[-/]\s*[\p{L}\p{N}]+)*/u)?.[0].replace(/\s/g,'')??'';
 const match=text.match(/(?:^|[^\d])(\d{1,2})\s*(?:tháng|[/.-])\s*(\d{1,2})\s*(?:[\p{L}]{1,3}|[/.-])\s*(\d{4})(?!\d)/iu);
 if(!match)return '';
 const [,d,m,y]=match;
 const date=new Date(Date.UTC(+y,+m-1,+d));
 return date.getUTCFullYear()===+y&&date.getUTCMonth()===+m-1&&date.getUTCDate()===+d?date.toISOString().slice(0,10):'';
}
const browser=await chromium.launch({channel:args.channel,executablePath:args.chromium,headless:true,
 args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
try{
 const results=[];
 const versions=[...(args.before?[{label:'before',root:resolve(args.before)}]:[]),{label:'after',root}];
 for(const version of versions){
  const cacheDir=await mkdtemp(resolve(tmpdir(),'vpdu-ocr-vite-'));
  const server=await createServer({root:version.root,cacheDir,server:{host:'127.0.0.1',port:0,hmr:false,fs:{allow:[resolve(version.root,'..'),resolve(root,'node_modules')]}},logLevel:'error'});
  try{
   await server.listen();
   await Promise.all(['/src/parser.ts','/src/ocr.ts'].map(path=>server.transformRequest(path)));
   const origin=new URL(server.resolvedUrls.local[0]).origin;
   for(const [index,name] of names.entries()){
    const row=(results[index]??={file:index+1});
    const page=await browser.newPage({serviceWorkers:'block'});
    const cdp=await page.context().newCDPSession(page);
    let denied=0,stage='setup',timedOut=false,regionStep;
    page.on('console',message=>{
      if(/^\[vpdu-lab\] [a-z-]+$/.test(message.text()))regionStep=message.text().slice(11);
    });
    const timer=setTimeout(()=>{
      timedOut=true;
      void page.context().close().catch(()=>{});
    },timeout);
    await page.context().route('**/*',async route=>{
      const uri=new URL(route.request().url());
      if(uri.origin!==origin){denied++;return route.abort();}
      if(uri.pathname==='/__vpdu_bench')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Offline OCR benchmark</title>'});
      if(uri.pathname==='/__bench/document')return route.fulfill({path:resolve(args.dir,name),contentType:'application/pdf'});
      if(uri.pathname==='/__bench/model'&&args.model)return route.fulfill({path:resolve(args.model),contentType:'application/octet-stream'});
      if(uri.pathname==='/__bench/ort/ort.wasm.min.mjs'||/^\/__bench\/ort\/ort-wasm-[\w.-]+\.(?:mjs|wasm)$/.test(uri.pathname)){
        const file=basename(uri.pathname);
        return route.fulfill({path:resolve(root,'node_modules/onnxruntime-web/dist',file),
          contentType:file.endsWith('.wasm')?'application/wasm':'text/javascript'});
      }
      return route.continue();
    });
    try{
      await page.goto(origin+'/__vpdu_bench');
      const initial=await cdp.send('Runtime.getHeapUsage');
      const start=performance.now();
      const expected=truth[name];
      if(expected?.regions?.some(region=>!['number','documentDate'].includes(region.key)
        ||!Array.isArray(region.rect)||region.rect.length!==4||!region.rect.every(Number.isFinite)
        ||region.rect[0]<0||region.rect[1]<0||region.rect[2]<=0||region.rect[3]<=0
        ||region.rect[0]+region.rect[2]>1||region.rect[1]+region.rect[3]>1)) throw Error('Vùng ROI không hợp lệ.');
      let hints=[];
      if(!args['regions-only']){
      stage='document';
      const {result,hints:regions}=await page.evaluate(async()=>{
        const parser=await import('/src/parser.ts');
        const file=new File([await (await fetch('/__bench/document')).blob()],'document.pdf');
        const data=await parser.readDocument(file);
        if(parser.analyzeDocument){
          const result=await parser.analyzeDocument(data);
          const hints=[];
          for(const [key,pattern] of [
            ['number',/^số\s*[:：]/iu],['documentDate',/(?:^|,)\s*ngày\s/iu]
          ]){
            const found=data.rows.find(row=>row.page===1&&row.y>=-360&&row.sourceY===undefined
              &&pattern.test(row.cells.map(cell=>cell.text).join(' ')));
            if(found)hints.push({key,page:1,lineY:found.y});
          }
          return {result,hints};
        }
        const old=await parser.ruleAnalyzer.analyze(data.text);
        if(data.ocrHeader){
          const merged=parser.reconcileHeaders({...old.source,documentDate:old.documentDate},data.ocrHeader);
          return {result:{...old,source:{number:merged.number,subject:merged.subject},documentDate:merged.documentDate},hints:[]};
        }
        return {result:old,hints:[]};
      });
      const elapsed=Math.round(performance.now()-start);
      const heap=await cdp.send('Runtime.getHeapUsage');
      row[version.label]={milliseconds:elapsed,jsHeapBeforeBytes:initial.usedSize,jsHeapAfterBytes:heap.usedSize,
        taskCount:result.proposals.length,metrics:metrics(result,expected),blockedExternalRequests:denied};
      hints=regions;
      }
      const regions=expected?.regions??hints;
      if(version.label==='after'&&chars&&regions.length){
        stage='regionPilot';
        const output=await page.evaluate(async({regions,chars})=>
          (await import('/tools/ocr-lab.mjs')).compareRegions(regions,chars),{regions,chars});
        (row[version.label]??={}).blockedExternalRequests=denied;
        row.regionPilot=output.map((region,i)=>{
          const gold=regions[i].value;
          const primary=roiValue(region.primary,region.key);
          const alternate=roiValue(region.alternate,region.key);
          return {key:region.key,primaryExact:gold===undefined?null:normalize(primary)===normalize(gold),alternateExact:gold===undefined?null:normalize(alternate)===normalize(gold),
            primaryMissing:!primary,alternateMissing:!alternate,primaryMs:region.primaryMs,alternateMs:region.alternateMs};
        });
      } else if(version.label==='after'&&chars) {
        row.regionPilotSkipped='Không định vị được vùng số hoặc ngày.';
      }
    }catch(error){
      row[version.label]={...row[version.label],error:timedOut?'Timeout':error?.name??'Error',stage,regionStep,blockedExternalRequests:denied};
    }finally{
      clearTimeout(timer);
      await page.context().close().catch(()=>{});
    }
    console.log(version.label,'#'+(index+1),row[version.label].error??'xong');
   }
  }finally{try{await server.close();}finally{await rm(cacheDir,{recursive:true,force:true});}}
 }
 if(results.some(item=>item.before?.error||item.after?.error))process.exitCode=1;
 await writeFile(args.out,JSON.stringify({browser:browser.version(),channel:args.channel??'chromium',files:results},null,2)+'\n',{flag:'wx'});
}finally{await browser.close();}
