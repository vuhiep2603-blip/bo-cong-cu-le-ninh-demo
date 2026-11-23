import type {Source} from './model';
import {extractTaskProposals} from './task-extraction';
import {inspectImages,mergePageRows,orderParagraphRows,reconstructRows} from './pdf-layout';
import {docxRows} from './docx-layout';
import {extractTables} from './table-extraction';
import {rowText} from './document-layout';
import type {DocumentRow,Origin} from './document-layout';

export interface Proposal {
  title:string;detail:string;lead:string;partners:string;deadline:string;deliverable:string;excerpt:string;
  deadlineText?:string;pages?:number[];y?:number;section?:string;origin?:Origin;confidence?:number;
  relevance?:'direct'|'indirect'|'coordination'|'unknown';
}
type HeaderValue = ReturnType<typeof extractDocumentHeader>;
export interface HeaderReading {
  header:HeaderValue; origin:Origin; confidence?:number; page?:number; region:string; excerpt:string;
  fields?: {label:string;value:string;page?:number;y?:number;region?:string}[];
}
export interface Analysis {source:Source;documentDate:string;proposals:Proposal[];readings?:HeaderReading[]}
export interface TaskAnalyzer {analyze(text:string):Promise<Analysis>}
export interface ReadResult {rows:DocumentRow[];headers:HeaderReading[];notice?:string;pageCount?:number}

// Read only the document header; never confuse a deadline in the body with the issue date.
function validDate(day:string,month:string,year:string) {
  const d=Number(day),m=Number(month),y=Number(year);
  const candidate=new Date(Date.UTC(y,m-1,d));
  return y>=1900 && y<=2100 && candidate.getUTCFullYear()===y
    && candidate.getUTCMonth()===m-1 && candidate.getUTCDate()===d
    ? [year,month.padStart(2,'0'),day.padStart(2,'0')].join('-') : '';
}
export function extractDocumentHeader(text:string) {
  const lines=text.normalize('NFC').replace(/\u00a0/g,' ').split(/\r?\n/)
    .map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  const boundary=lines.findIndex((line,index)=>index>2 && /^(?:Kính gửi|Căn cứ|Thực hiện|Nơi nhận)\s*[:：]?/i.test(line));
  const header=boundary<0?lines:lines.slice(0,boundary);

  // Number and designation often occupy separate PDF glyphs/cells:
  // "Số: 20/TB - CQTTBCĐ", "Số 363 -CV/TU", or split after "TB-".
  const numberRows=header.join('\n').replace(/([-–—/])\s*\n\s*(?=[A-ZĐ])/g,'$1');
  const numberMatch=numberRows.match(/(?:^|\n)\s*Số\s*[:：]?\s*(\d{1,6})\s*([-–—/])\s*([A-ZĐa-zđ][\p{L}\p{N}./\-–—\s]{0,40})/iu);
  let number='';
  if(numberMatch) {
    let tail=numberMatch[3].split(/\s{2,}|\n|(?=\s+(?:Quảng|Hà Nội|Lệ Ninh|ĐẢNG|CỘNG HÒA|ngày)\b)/iu)[0];
    tail=tail.replace(/\s*[-–—]\s*/g,'-').replace(/\s*\/\s*/g,'/').replace(/\s+/g,'');
      if(tail&&!/[-/]+$/.test(tail))number=(numberMatch[1]+(numberMatch[2]==='/'?'/':'-')+tail).replace(/[–—]/g,'-');
  }
  // Datelines may be wrapped into separate visual rows or contain spaced digits.
  // Restrict candidate dates to the administrative heading, not the task body.
  const datePattern=/ngày\s*([0-9OoIl]{1,2})\s*tháng\s*([0-9OoIl]{1,2})\s*năm\s*(\d{4})|ngày\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*([0-9OoIl]{1,2})\s*[\/.\-]\s*(\d{4})/iu;
  let documentDate='';
  const shortHeader=header.slice(0,Math.min(header.length,35));
  for(let i=0;i<shortHeader.length;i++) {
    const line=shortHeader[i];
    const datedReference=/^(?:căn cứ|theo|thực hiện|công văn số|quyết định số|nghị quyết số|chỉ thị số)\b/iu.test(line);
    const dateLine=!datedReference&&/(?:^|,)\s*ngày\b/iu.test(line)
      && (/^[^,]{0,90},\s*ngày\b/iu.test(line) || /^\s*ngày\b/iu.test(line));
    const mayWrap=i<shortHeader.length-1 ? line+' '+shortHeader[i+1] : line;
    const match=dateLine ? (mayWrap.match(datePattern)??line.match(datePattern)) : null;
    if(match) {
      // A body sentence beginning with “Ngày …, tại …” is not a dateline.
      const after=(match.input??'').slice((match.index??0)+match[0].length).trim();
      if(/^,|^tại\s|^vào\s/iu.test(after))continue;
      const normalizeOcrDigits=(s:string)=>s.replace(/[Oo]/g,'0').replace(/[Il]/g,'1');
      documentDate=validDate(normalizeOcrDigits(match[1]??match[4]),normalizeOcrDigits(match[2]??match[5]),match[3]??match[6]);
      if(documentDate) break;
    }
  }
  const stop=/^(?:[-_—–]{3,}$|Kính gửi|Căn cứ|Thực hiện|Nơi nhận|Chủ trì\s*:|Phối hợp\s*:|Thời hạn\s*:|Sản phẩm\s*:|[\p{L} ]{2,55},\s*ngày\s+\d+|Ngày\s+\d+\s+tháng|I[. ]|II[. ]|III[. ]|\d{1,2}[.)]\s+)/iu;
  const repeatedAuthority=(line:string)=>line===line.toLocaleUpperCase('vi')
    && /^(?:THỦ TƯỚNG|TRƯỞNG BAN|CHÁNH VĂN PHÒNG|TỔNG BÍ THƯ|CHỦ TỊCH|BỘ TRƯỞNG|BAN THƯỜNG VỤ|BAN CHỈ ĐẠO)\s/iu.test(line);
  const documentType=/(?:^|\s)(?:KẾ HOẠCH|THÔNG BÁO|QUYẾT ĐỊNH|BÁO CÁO|TỜ TRÌNH|CÔNG VĂN|CHƯƠNG TRÌNH|KẾT LUẬN|CHỈ THỊ|NGHỊ QUYẾT|HƯỚNG DẪN|QUY ĐỊNH)[.:\s]*$/u;
  const typeIndex=header.findIndex(line=>documentType.test(line));
  let start=typeIndex;
  let subject='';
  if(start<0){
    for(let i=0;i<header.length;i++){
      const explicit=header[i].match(/^(?:V\/v|Về việc|Trích yếu)\s*[:：]?\s*(.*)$/iu);
      if(explicit){start=i;subject=explicit[1];break;}
    }
  }
  if(start>=0){
    for(const line of header.slice(start+1)){
      if(stop.test(line)||repeatedAuthority(line)||/^(?:ĐẢNG CỘNG SẢN|CỘNG HÒA|Số\s*:|Theo đề nghị)/iu.test(line))break;
      subject+=(subject?' ':'')+line;
    }
  }
  return {number:number.slice(0,120),documentDate,subject:subject.split(/-{3,}/)[0].replace(/\s+/g,' ').trim()};
}

// Detect PDF character-level spacing such as "v ề t ă ng c ườ ng".
export function hasFragmentedVietnameseWords(value:string) {
  const words=value.split(/\s+/).filter(Boolean);
  let singleRuns=0;
  for(let i=0;i<words.length-2;i++){
    const group=words.slice(i,i+3);
    if(group.every(w=>[...w.replace(/[^\p{L}]/gu,'')].length===1))singleRuns++;
  }
  return singleRuns>=1 || words.length>=8 && words.filter(w=>[...w].length===1).length/words.length>0.25;
}

export function reconcileHeaders(
  embedded:ReturnType<typeof extractDocumentHeader>,
  scanned:ReturnType<typeof extractDocumentHeader>
) {
  const a=embedded.number.replace(/\s+/g,'').toUpperCase();
  const b=scanned.number.replace(/\s+/g,'').toUpperCase();
  // A shorter partial code (20/TB) must not outrank a matching complete code
  // (20/TB-CQTTBCĐ), but unrelated OCR guesses cannot overwrite a PDF value.
  const number=!a ? scanned.number : (b.startsWith(a) && b.length>a.length ? scanned.number : embedded.number);
  const conflicts:string[]=[];
  if(a&&b&&a!==b&&!b.startsWith(a)&&!a.startsWith(b)) conflicts.push('số, ký hiệu');
  if(embedded.documentDate&&scanned.documentDate&&embedded.documentDate!==scanned.documentDate) conflicts.push('ngày ban hành');
  if(embedded.subject&&scanned.subject&&embedded.subject!==scanned.subject
    && !scanned.subject.startsWith(embedded.subject)&&!embedded.subject.startsWith(scanned.subject)) conflicts.push('trích yếu');
  const garbled=hasFragmentedVietnameseWords(embedded.subject);
  const clearer=garbled && Boolean(scanned.subject) && !hasFragmentedVietnameseWords(scanned.subject);
  return {
    number, documentDate:embedded.documentDate||scanned.documentDate,
    subject:(clearer || !embedded.subject || (scanned.subject.startsWith(embedded.subject)&&scanned.subject.length>embedded.subject.length))
      ? scanned.subject : embedded.subject,
    conflicts
  };
}

export const ruleAnalyzer:TaskAnalyzer = {
  async analyze(text) {
    const {number,documentDate,subject}=extractDocumentHeader(text);
    return {source:{number,subject},documentDate,proposals:extractTaskProposals(text)};
  }
};

export function isSparsePdfPage(text:string):boolean {
  const body=text.split(/\r?\n/).filter(line=>!signatureMetadata.test(line)).join(' ');
  const meaningful=body.match(/[\p{L}\p{N}]{2,}/gu)??[];
  return meaningful.length<10 || (meaningful.length<25 && body.replace(/\s/g,'').length<140);
}
const signatureMetadata=/^(?:ký số|người ký\s*:|thời gian ký\s*:|cơ quan(?: phát hành)?\s*:|email\s*:|digitally signed|signature)/iu;

function reading(rows:DocumentRow[],origin:Origin,region:string,confidence?:number,fallback='',whole=rows):HeaderReading {
 const rowsWithText=rows.map(row=>({row,text:rowText(row)}));
 const excerpt=rowsWithText.map(row=>row.text).filter(line=>!signatureMetadata.test(line)).join('\n')||fallback;
 const header=extractDocumentHeader(excerpt);
 const fields:NonNullable<HeaderReading['fields']>=[];
 function add(label:string,value:string,row?:DocumentRow){
   if(value)fields.push({label,value,page:row?.page,y:row?.y,region:row?.region??region});
 }
 const issuerPattern=/^(?:đảng (?:bộ|[ủu]y)|tỉnh [ủu]y|huyện [ủu]y|ban |văn phòng|[ủu]y ban|ubnd|hội đồng|bộ |thủ tướng|chính phủ)/iu;
 const typePattern=/^(?:công văn|chỉ thị|nghị quyết|quyết định|kế hoạch|thông báo|kết luận|báo cáo|hướng dẫn|quy định|tờ trình|chương trình)$/iu;
 const issuer=[...rowsWithText].reverse().find(item=>item.row.cells.some(cell=>issuerPattern.test(cell.text)&&cell.text===cell.text.toLocaleUpperCase('vi')));
 const foundType=rowsWithText.find(item=>typePattern.test(item.text));
 const explicitSigner=whole.find(row=>/^người ký\s*:/iu.test(rowText(row))&&!/^người ký\s*:\s*(?:cục|ban|văn phòng|bộ|[ủu]y ban)\s/iu.test(rowText(row)));
 const signIndex=whole.findIndex((row,index)=>(row.region==='chân trang'||index>=rows.length||/^(?:kt|tm|tl|tuq)\./iu.test(rowText(row)))&&/^(?:(?:kt|tm|tl|tuq)\.\s*)?(?:bí thư|phó bí thư|chủ tịch|phó chủ tịch|bộ trưởng|thủ tướng|chánh văn phòng|phó chánh văn phòng)(?:\s+[\p{L} ]+)?$/iu.test(rowText(row)));
 const signTitle=signIndex>=0?whole[signIndex]:undefined;
 const explicitName=signTitle&&whole.slice(signIndex+1,signIndex+6).find(row=>/^(?:[\p{Lu}][\p{L}]+\s+){1,5}[\p{Lu}][\p{L}]+$/u.test(rowText(row))&&!issuerPattern.test(rowText(row)));
 add('Cơ quan ban hành',issuer?.row.cells.find(cell=>issuerPattern.test(cell.text))?.text??'',issuer?.row);
 add('Loại văn bản',foundType?.text??(/^(?:v\/v|về việc)\b/imu.test(excerpt)?'Công văn (theo thể thức)':''),foundType?.row);
 add('Số, ký hiệu',header.number,rowsWithText.find(x=>/\bSố\s*[:：]?\s*\d/iu.test(x.text))?.row);
 add('Ngày ban hành',header.documentDate,rowsWithText.find(x=>/(?:^|,)\s*ngày/iu.test(x.text))?.row);
 add('Trích yếu',header.subject,rowsWithText.find(x=>/^(?:v\/v|trích yếu|về việc)/iu.test(x.text))?.row??foundType?.row);
 add('Chức vụ người ký',signTitle?rowText(signTitle):'',signTitle);
 add('Người ký',explicitSigner?rowText(explicitSigner).replace(/^người ký\s*:\s*/iu,''):explicitName?rowText(explicitName):'',explicitSigner??explicitName);
 return {header,origin,page:rows[0]?.page,region,confidence,excerpt,fields};
}

export async function analyzeDocument(input:ReadResult):Promise<Analysis> {
 const {proposals:tables,consumed}=extractTables(input.rows);
 const text=orderParagraphRows(input.rows.filter(row=>!consumed.has(row)&&row.region!=='chân trang'&&!signatureMetadata.test(rowText(row))));
 const proposals=extractTaskProposals(text.map(rowText).join('\n')).map(prop=>{
   const excerpt=prop.excerpt.split('\n');
   const start=text.findIndex(row=>rowText(row).replace(/\s+/g,' ').trim()===excerpt[0]);
   const locations=start<0?[]:text.slice(start,start+excerpt.length);
   return {...prop,pages:[...new Set(locations.flatMap(row=>row.page?[row.page]:[]))],
     y:locations[0]?.y,origin:locations[0]?.origin,confidence:locations[0]?.confidence};
 });
 for(const prop of [...tables,...proposals]){
   const scope=(prop.lead+' '+prop.partners+' '+prop.detail).normalize('NFC');
   prop.relevance=/(?:văn phòng\s+đảng\s+(?:ủy|uỷ)|vpđu|vpđư)/iu.test(scope)?'direct':
     prop.partners.trim()||/phối hợp/iu.test(scope)?'coordination':
     /đảng [ủu]y|tham mưu|tổng hợp|báo cáo|theo dõi|đôn đốc/iu.test(scope)?'indirect':'unknown';
 }
 const first=input.headers.find(h=>h.origin!=='OCR')??input.headers[0];
 let header=first?.header??{number:'',documentDate:'',subject:''};
 for(const alternative of input.headers){
   if(alternative===first)continue;
   header=reconcileHeaders(header,alternative.header);
 }
 // An ambiguous number/date is a decision for the operator, never an OCR override.
 for(const key of ['number','documentDate'] as const){
   const values=[...new Set(input.headers.map(x=>x.header[key]).filter(Boolean))];
   const longest=values.sort((a,b)=>b.length-a.length)[0];
   if(longest&&values.some(value=>key==='number'
     ? value!==longest&&!longest.startsWith(value+'-') : value!==longest)) {
     header={...header,[key]:''};
   }
 }
 return {source:{number:header.number,subject:header.subject},documentDate:header.documentDate,
   proposals:[...proposals,...tables],readings:input.headers};
}

function pdfOptions(data:ArrayBuffer) {
 const asset=(path:string)=>new URL('./pdf-assets/'+path+'/',document.baseURI).href;
 return {data,enableXfa:false,useSystemFonts:true,wasmUrl:asset('wasm'),cMapUrl:asset('cmaps'),
   cMapPacked:true,standardFontDataUrl:asset('standard_fonts'),iccUrl:asset('iccs')};
}

export async function readDocument(file:File,onProgress?:(label:string)=>void):Promise<ReadResult> {
  if(file.size>15*1024*1024)throw Error('Tệp vượt quá 15 MB.');
  if(/\.docx$/i.test(file.name)){
    const rows=docxRows(new Uint8Array(await file.arrayBuffer()));
    if(!rows.some(row=>rowText(row)))throw Error('DOCX không có văn bản đọc được.');
    return {rows,headers:[reading(rows.filter(row=>row.region!=='chân trang'),'DOCX','đầu tài liệu',undefined,'',rows)]};
  }
  if(!/\.pdf$/i.test(file.name))throw Error('Chỉ hỗ trợ PDF và DOCX.');
  const pdfjs=await import('pdfjs-dist');
  const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
  const loading=pdfjs.getDocument(pdfOptions(await file.arrayBuffer()));
  let ocr:Awaited<ReturnType<typeof import('./ocr')['createOcrSession']>>|undefined;
  try {
    const pdf=await loading.promise;
    if(pdf.numPages>150)throw Error('PDF vượt quá 150 trang.');
    const pages:DocumentRow[][]=[];
    const needsOcr:number[]=[];
    const mixedPages=new Set<number>();
    let firstHasImage=false;
    async function engine(){return ocr??=(await (await import('./ocr')).createOcrSession());}
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const content=await page.getTextContent();
      const width=page.getViewport({scale:1}).width;
      const viewport=page.getViewport({scale:1});
      const rows=reconstructRows(content.items.filter(item=>'str' in item).map(item=>{
        const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
        return {str:item.str,x,y:-y,width:item.width,height:item.height};
      }),width,'PDF',i);
      pages.push(rows);
      const text=rows.map(rowText).join('\n');
      const operations=await page.getOperatorList();
      const {hasImage:image,coverage}=inspectImages(operations,pdfjs.OPS,width*viewport.height);
      if(i===1)firstHasImage=image;
      const textBands=new Set(rows.filter(row=>!signatureMetadata.test(rowText(row))).map(row=>Math.floor((row.y??0)/35)));
      const sparse=!rows.length||(image&&(isSparsePdfPage(text)||textBands.size<4));
      if(!sparse&&coverage>=.25)mixedPages.add(i);
      if(sparse||mixedPages.has(i))needsOcr.push(i);
      page.cleanup();
    }
    const first=await pdf.getPage(1);
    const top=-(first.getViewport({scale:1}).height*.52);
    const headers=[reading(pages[0].filter(row=>(row.y??0)>=top),'PDF','đầu trang 1',undefined,'',pages.flat())];
    const notices:string[]=[];
    for(const index of needsOcr.slice(0,20)){
      onProgress?.('Đang OCR tiếng Việt trang '+index+'/'+pdf.numPages+'…');
      try{
        const scan=await (await engine()).scan(await pdf.getPage(index),index);
        if(index===1){
          headers.push(reading(scan.rows.filter(row=>(row.y??0)>=top),
            'OCR','đầu trang 1 (từ ảnh quét)',scan.confidence,'',scan.rows));
        }
        // An image page may only have a PDF signature overlay; keep the OCR geometry for the body.
        if(mixedPages.has(index))pages[index-1]=mergePageRows(pages[index-1],scan.rows);
        else if(scan.rows.length&&!isSparsePdfPage(scan.rows.map(rowText).join('\n')))pages[index-1]=scan.rows;
        else if(!pages[index-1].some(row=>!signatureMetadata.test(rowText(row))))pages[index-1]=scan.rows;
        else notices.push('Trang '+index+' có ít chữ đọc được, cần đối chiếu ảnh gốc.');
      }catch(error){
        notices.push('Không hoàn tất OCR trang '+index+': '+(error instanceof Error?error.message:String(error)));
        break;
      }
    }
    const {header}=headers[0];
    if(firstHasImage||needsOcr.includes(1)||hasFragmentedVietnameseWords(header.subject)){
      onProgress?.('Đang đối chiếu số và ngày tại đầu trang…');
      try{
        const scan=await (await engine()).scan(first,1,true,true);
        const enhanced=reading(scan.rows,'OCR','đầu trang 1 (tăng tương phản)',scan.confidence,scan.text);
        headers.push(enhanced);
        for(const [key,zone,label] of [
          ['number','left','số và ký hiệu'],['documentDate','right','địa danh và ngày']
        ] as const){
          const candidates=new Set(headers.map(item=>item.header[key]).filter(Boolean));
          if(candidates.size===1&&enhanced.header[key]&&scan.confidence>=75)continue;
          const labelRow=[...scan.rows,...pages[0]].find(row=>key==='number'
             ? /^số\s*[:：]/iu.test(rowText(row))
             : /(?:^|,)\s*ngày\s/iu.test(rowText(row)));
          let crop=await (await engine()).scan(first,1,true,true,zone,labelRow?.y);
          let result=reading(crop.rows,'OCR','vùng '+label,crop.confidence,crop.text);
          if(!result.header[key]&&labelRow){
            crop=await (await engine()).scan(first,1,true,true,zone);
            result=reading(crop.rows,'OCR','vùng '+label,crop.confidence,crop.text);
          }
          // A cropped area is not evidence about fields outside that area.
          if(result.header[key])headers.push({...result,header:{number:'',documentDate:'',subject:'',[key]:result.header[key]},
            fields:result.fields?.filter(field=>field.value===result.header[key])});
        }
      }catch(error){notices.push('Không đối chiếu được OCR đầu trang: '+(error instanceof Error?error.message:String(error)));}
    }
    if(needsOcr.length>20)notices.push('Chỉ OCR 20 trang đầu trong '+needsOcr.length+' trang cần nhận diện.');
    if(!pages.some(rows=>rows.some(row=>rowText(row))))notices.push('Chưa nhận diện được nội dung; có thể xem ảnh gốc hoặc OCR lại vùng chọn.');
    return {rows:pages.flat(),headers,notice:notices.join(' '),pageCount:pdf.numPages};
  }catch(error){
    if(error instanceof Error&&error.name==='PasswordException')throw Error('PDF có mật khẩu. Hãy dùng bản đã mở khóa hợp lệ.');
    throw error;
  }finally{try{await ocr?.close();}finally{await loading.destroy();}}
}

export type OcrZone = 'page'|'header'|'left'|'right';
async function withPdfPage<T>(file:File,index:number,operation:(page:import('pdfjs-dist').PDFPageProxy)=>Promise<T>) {
 const pdfjs=await import('pdfjs-dist');
 const worker=await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
 pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
 const loading=pdfjs.getDocument(pdfOptions(await file.arrayBuffer()));
 try {
   const pdf=await loading.promise;
   return await operation(await pdf.getPage(index));
 } finally {await loading.destroy();}
}
export function previewDocumentPage(file:File,index:number) {
 return withPdfPage(file,index,async page=>{
   const original=page.getViewport({scale:1});
   const viewport=page.getViewport({scale:Math.min(1.6,1120/original.width,3072/original.height)});
   const canvas=document.createElement('canvas');
   canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   const context=canvas.getContext('2d');
   if(!context)throw Error('Không tạo được bản xem trước.');
   try {
     await page.render({canvas,canvasContext:context,viewport,background:'white'}).promise;
     return {image:canvas.toDataURL('image/png'),height:original.height};
   } finally {canvas.width=0;canvas.height=0;}
 });
}
export function retryDocumentOcr(file:File,index:number,zone:OcrZone) {
 return withPdfPage(file,index,async page=>{
   const engine=await (await import('./ocr')).createOcrSession();
   try{
     const scan=await engine.scan(page,index,zone!=='page',true,zone==='left'||zone==='right'?zone:undefined);
     const region=({page:'trang',header:'đầu trang',left:'vùng trái đầu trang',right:'vùng phải đầu trang'})[zone];
     const top=-.52*page.getViewport({scale:1}).height;
     const raw=reading(scan.rows.filter(row=>(row.y??0)>=top),'OCR',region,scan.confidence,'',scan.rows);
     const header=index===1?raw:undefined;
     if(header&&(zone==='left'||zone==='right')){
       const key=zone==='left'?'number':'documentDate';
       header.fields=header.fields?.filter(field=>field.value===header.header[key]);
       header.header={number:'',documentDate:'',subject:'',[key]:header.header[key]};
     }
     return {rows:zone==='page'?scan.rows:[],header};
   } finally {await engine.close();}
 });
}
