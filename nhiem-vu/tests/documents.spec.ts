import {expect,test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {strToU8,zipSync} from 'fflate';
import {deflateSync} from 'node:zlib';

async function analyze(page:Page,name:string,bytes:Buffer|Uint8Array) {
 await page.route('**/ocr-test-shell',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Document test</title>'}));
 await page.goto('/ocr-test-shell');
 return page.evaluate(async({name,bytes})=>{
   const parser=await import('/src/parser.ts');
   const input=await parser.readDocument(new File([new Uint8Array(bytes)],name));
   return {result:await parser.analyzeDocument(input),input};
 },{name,bytes:Array.from(bytes)});
}
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const p=(text:string)=>'<w:p><w:r><w:t>'+text+'</w:t></w:r></w:p>';
const cell=(text:string,props='')=>'<w:tc><w:tcPr>'+props+'</w:tcPr>'+p(text)+'</w:tc>';
const row=(cells:string[])=>'<w:tr>'+cells.join('')+'</w:tr>';

test('DOCX tables preserve multiple cell paragraphs and vertically merged agencies',async({page})=>{
 const header=row(['STT','Nội dung nhiệm vụ','Cơ quan chủ trì','Cơ quan phối hợp','Thời hạn','Sản phẩm'].map(x=>cell(x)));
 const table='<w:tbl><w:tblGrid>'+'<w:gridCol/>'.repeat(6)+'</w:tblGrid>'+header+
   row([cell('1'),'<w:tc>'+p('Chuẩn bị dự thảo')+p('và tổng hợp ý kiến')+'</w:tc>',
     cell('Văn phòng Đảng ủy','<w:vMerge w:val="restart"/>'),cell('Ban Tổ chức'),cell('30/11/2026'),cell('Báo cáo')])+
   row([cell('2'),cell('Rà soát chương trình'),cell('','<w:vMerge/>'),cell(''),cell('Hằng quý'),cell('Danh mục')])+'</w:tbl>';
 const bytes=zipSync({
  'word/document.xml':strToU8('<w:document xmlns:w="'+NS+'"><w:body>'+p('KẾ HOẠCH')+p('Rà soát công tác quý IV')+p('Căn cứ hướng dẫn')+table+'</w:body></w:document>'),
  'word/header1.xml':strToU8('<w:hdr xmlns:w="'+NS+'">'+p('ĐẢNG ỦY XÃ LỆ NINH')+p('Số: 20/TB-CQTTBCĐ')+p('Lệ Ninh, ngày 23 tháng 11 năm 2026')+'</w:hdr>'),
  'word/footer1.xml':strToU8('<w:ftr xmlns:w="'+NS+'">'+p('BÍ THƯ')+p('Nguyễn Văn Giả Lập')+'</w:ftr>')
 });
 const {result}=await analyze(page,'bang.docx',bytes);
 expect(result.source.number).toBe('20/TB-CQTTBCĐ');
 expect(result.documentDate).toBe('2026-11-23');
 expect(result.readings[0].fields).toEqual(expect.arrayContaining([expect.objectContaining({label:'Chức vụ người ký',value:'BÍ THƯ'})]));
 expect(result.proposals).toHaveLength(2);
 expect(result.proposals[0]).toMatchObject({lead:'Văn phòng Đảng ủy',partners:'Ban Tổ chức',deadline:'2026-11-30',deliverable:'Báo cáo',relevance:'direct'});
 expect(result.proposals[0].detail).toContain('và tổng hợp ý kiến');
 expect(result.proposals[1]).toMatchObject({lead:'Văn phòng Đảng ủy',deadline:'',deadlineText:'Hằng quý'});
});

function imagePdf(rgb:Buffer,width:number,height:number) {
 const img=deflateSync(rgb);
 const stream='q 595 0 0 842 0 0 cm /Im0 Do Q';
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>',
 '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream',
 Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /FlateDecode /Length ${img.length} >>\nstream\n`),img,Buffer.from('\nendstream')])
 ];
 const pdf=[Buffer.from('%PDF-1.4\n')];
 const offsets=[0];
 for(const [i,entry] of objects.entries()){
  offsets.push(pdf.reduce((sum,buf)=>sum+buf.length,0));
  pdf.push(Buffer.from(`${i+1} 0 obj\n`),Buffer.from(entry),Buffer.from('\nendobj\n'));
 }
 const offset=pdf.reduce((sum,buf)=>sum+buf.length,0);
 pdf.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF'));
 return Buffer.concat(pdf);
}
async function raster(page:Page,rotation:boolean) {
 return page.evaluate(rotation=>{
   const canvas=document.createElement('canvas');
   canvas.width=1190;canvas.height=1684;
   const c=canvas.getContext('2d')!;
   c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
   if(rotation){c.translate(canvas.width,canvas.height);c.rotate(Math.PI);}
   c.fillStyle='#111';c.font='28px serif';
   const lines=['ĐẢNG ỦY XÃ LỆ NINH','Số: 31/CT-TTg','Lệ Ninh, ngày 23 tháng 11 năm 2026','CHỈ THỊ',
     'Về tăng cường công tác tổng hợp','Kính gửi: Văn phòng Đảng ủy',
     '1. Văn phòng Đảng ủy chủ trì tổng hợp báo cáo.',
     'Thời hạn: 30/11/2026','Sản phẩm: Báo cáo công tác.'];
   lines.forEach((line,i)=>c.fillText(line,84,120+i*48));
   const rgba=c.getImageData(0,0,canvas.width,canvas.height).data;
   const rgb=new Uint8Array(canvas.width*canvas.height*3);
   for(let s=0,d=0;s<rgba.length;s+=4,d+=3){rgb[d]=rgba[s];rgb[d+1]=rgba[s+1];rgb[d+2]=rgba[s+2];}
   let raw='';
   for(let i=0;i<rgb.length;i+=4096)raw+=String.fromCharCode(...rgb.subarray(i,i+4096));
   return btoa(raw);
 },rotation);
}
test('real Vietnamese OCR recognizes a raster-only PDF; all assets are same-origin',async({page})=>{
 const outside:string[]=[];
 page.context().on('request',req=>{if(!req.url().startsWith('http://127.0.0.1:4182/')) outside.push(req.url());});
 const png=await raster(page,false);
 const start=Date.now();
 const {result,input}=await analyze(page,'scan.pdf',imagePdf(Buffer.from(png,'base64'),1190,1684));
 console.log('Bản scan giả lập, thời gian đọc/phân tích',Date.now()-start,'ms',input.headers.map(h=>({origin:h.origin,header:h.header,confidence:h.confidence})));
 expect(input.rows.some(row=>row.origin==='OCR')).toBe(true);
 expect(result.source.number).toBe('31/CT-TTg');
 expect(result.documentDate).toBe('2026-11-23');
 expect(result.proposals.some(p=>p.detail.includes('tổng hợp báo cáo'))).toBe(true);
 expect(outside).toEqual([]);
});

test('an upside-down raster page can be read with the orientation fallback',async({page})=>{
 const raw=await raster(page,true);
 const {result,input}=await analyze(page,'rotated.pdf',imagePdf(Buffer.from(raw,'base64'),1190,1684));
 expect(input.notice).toContain('180°');
 expect(result.source.number).toBe('31/CT-TTg');
 expect(result.documentDate).toBe('2026-11-23');
 expect(result.proposals).toEqual(expect.arrayContaining([expect.objectContaining({pages:[1]})]));
});
