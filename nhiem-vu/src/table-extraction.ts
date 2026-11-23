import type {DocumentRow} from './document-layout';
import type {Proposal} from './parser';

type Column = 'index'|'detail'|'lead'|'partners'|'deadline'|'deliverable';
const columns:Record<Column,RegExp>={
 index:/^(?:stt|số\s*(?:tt|thứ tự))$/iu,
 detail:/^(?:nội dung(?: công việc| nhiệm vụ)?|nhiệm vụ|công việc)$/iu,
 lead:/^(?:(?:cơ quan|đơn vị)\s*)?chủ trì$/iu,
 partners:/^(?:(?:cơ quan|đơn vị)\s*)?phối hợp$/iu,
 deadline:/^(?:thời hạn(?: thực hiện)?|tiến độ|thời gian(?: thực hiện)?)$/iu,
 deliverable:/^(?:sản phẩm(?: yêu cầu)?|kết quả(?: yêu cầu)?)$/iu
};
export function normalizeDate(text:string) {
 const value=text.match(/(?:^|[^\d])(\d{1,2})\s*(?:[/.\-]|tháng)\s*(\d{1,2})\s*(?:[/.\-]|năm)\s*(\d{4})(?!\d)/iu);
 if(!value)return '';
 const day=+value[1],month=+value[2],year=+value[3];
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day
  ? date.toISOString().slice(0,10):'';
}
export function extractTables(rows:DocumentRow[]) {
 const proposals:Proposal[]=[];
 const consumed=new Set<DocumentRow>();
 let header:{x:number;key:Column}[]=[];
 let table:string|undefined;
 let current:Partial<Record<Column,string>>={};
 let pages=new Set<number>(), excerpts:string[]=[], first:DocumentRow|undefined;
 function flush(){
   const detail=current.detail?.trim();
   if(detail&&first){
     proposals.push({title:detail.slice(0,180),detail,lead:current.lead??'',partners:current.partners??'',
       deadline:normalizeDate(current.deadline??''),deadlineText:current.deadline??'',deliverable:current.deliverable??'',
       excerpt:excerpts.join('\n'),pages:[...pages],section:current.index?'Hàng '+current.index:'Bảng phân công',
       y:first.y,origin:first.origin,confidence:first.confidence});
   }
   current={};pages=new Set();excerpts=[];first=undefined;
 }
 for(const row of rows){
   const detected=row.cells.flatMap(cell=>Object.entries(columns).filter(([,pattern])=>pattern.test(cell.text.trim().replace(/\s+/g,' ')))
     .map(([key])=>({key:key as Column,x:cell.x})));
   if(detected.some(c=>c.key==='detail')&&detected.length>=3){
     if(row.page===undefined||table!==row.table)flush();
     header=detected.sort((a,b)=>a.x-b.x);table=row.table;
     consumed.add(row);continue;
   }
   if(!header.length)continue;
   if(table!==row.table || /^(?:phụ lục|nơi nhận|[IVX]+\.\s|điều\s+\d+)/iu.test(row.cells[0]?.text??'')){
     flush();header=[];continue;
   }
   const values:Partial<Record<Column,string>>={};
   for(const cell of row.cells){
     // PDF cells may be centered under their label. Prefer the closest column origin.
     const nearest=header.reduce((best,column)=>Math.abs(cell.x-column.x)<Math.abs(cell.x-best.x)?column:best);
     if(cell.text)values[nearest.key]=[values[nearest.key],cell.text].filter(Boolean).join(' ');
   }
   const indexed=header.some(c=>c.key==='index');
   const newRow=/^\d+[.)]?$/u.test(values.index??'')||(!indexed&&Boolean(values.detail)&&(Boolean(row.table)||Object.keys(values).length>=2));
   if(!newRow&&!first)continue;
   if(newRow){flush();first=row;}
   consumed.add(row);
   if(row.page)pages.add(row.page);
   excerpts.push(row.cells.map(c=>c.text).filter(Boolean).join(' | '));
   for(const key of Object.keys(values) as Column[]){
     current[key]=[current[key],values[key]].filter(Boolean).join(' ');
   }
 }
 flush();
 return {proposals,consumed};
}
