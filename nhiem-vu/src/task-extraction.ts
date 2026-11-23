import type {Proposal} from './parser';

const action=/(?:^|[^\p{L}\p{N}])(?:giao|chủ trì|phối hợp|thực hiện|triển khai|rà soát|tham mưu|báo cáo|kiểm tra|đôn đốc|xây dựng|hoàn thành|bố trí|bảo đảm|phân bổ|chịu trách nhiệm|khẩn trương|tập trung|yêu cầu|thu thập|chuẩn bị)(?=$|[^\p{L}\p{N}])/iu;
const heading=/^(?:kính gửi|nơi nhận|căn cứ|điều\s+\d+|phụ lục|chỉ thị|nghị quyết|thông báo|kết luận|trích yếu|v\/v)\b/iu;
const labeled=/^(?:chủ trì|cơ quan chủ trì|phối hợp|cơ quan phối hợp|thời hạn|tiến độ|sản phẩm|kết quả)\s*:/iu;
const actor=/^(?:Ban\s+[^\n,:;]{4,90}|Ủy ban\s+[^\n,:;]{4,90}|UBND\s+[^\n,:;]{4,90}|Văn phòng\s+[^\n,:;]{4,90}|Bộ\s+[^\n,:;]{4,90}|Công an\s+[^\n,:;]{4,90})\s+(?:chủ trì|phối hợp|tham mưu|tổ chức|tập trung|rà soát|thực hiện|chỉ đạo)(?=\s|$)/iu;
const enumerated=/^\s*(?:(?:Điều|Khoản)\s+\d+[.:]|(?:Một|Hai|Ba|Bốn|Năm|Sáu|Bảy|Tám|Chín|Mười)\s+là[,:.]?|(?:\d{1,2}(?:\.\d{1,2}){0,2})[.)]|[a-zđ]\)|[-•])\s+/iu;
const proseIntro=/^(?:(?:Ban Thường vụ|Thường trực|Tỉnh ủy|Đảng ủy).{0,90}(?:yêu cầu|chỉ đạo).{0,50}(?:nhiệm vụ|sau)|(?:Để|Nhằm).{0,190}(?:yêu cầu|đề nghị|giao).{0,65})\s*:/iu;

function deadline(text:string) {
 const m=text.match(/(?:trước\s+ngày|chậm nhất(?:\s+ngày)?|hoàn thành\s+(?:trước|trong)\s+ngày|thời hạn\s*:)\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/iu);
 if(!m)return '';
 const d=Number(m[1]),mo=Number(m[2]),y=Number(m[3]);
 const date=new Date(Date.UTC(y,mo-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d
  ? [m[3],m[2].padStart(2,'0'),m[1].padStart(2,'0')].join('-'):'';
}
function labeledValue(text:string,key:RegExp) {
 return text.split('\n').map(x=>x.match(key)?.[1]?.trim()??'').find(Boolean)??'';
}
function cleanLine(line:string) {
 return line.normalize('NFC').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
}
/**
 * Preserve complete numbered clauses and their subordinate paragraphs rather than
 * emitting one task per line containing "giao" or "chủ trì".
 * Suggestions are review-only: assignment to local VPĐU staff is never inferred.
 */
export function locateTaskProposals(source:string[]) {
 const indexes:number[]=[];
 const all=source.flatMap((value,index)=>{
   const line=cleanLine(value);
   if(!line)return [];
   indexes.push(index);return [line];
 });
 // Strip front matter. An explicit assignment list is the safest structural anchor.
 const intro=all.findIndex(line=>proseIntro.test(line));
 const firstNumber=all.findIndex(line=>enumerated.test(line)&&(action.test(line)||/^(?:Điều|Khoản)\s+\d/iu.test(line)));
 const begin=intro>=0?intro+1:firstNumber>=0?firstNumber:0;
 const content=all.slice(begin);
 const blocks:{lines:string[];annex:boolean;locations:number[]}[]=[];
 let current:string[]=[];
 let locations:number[]=[];
 let annex=false,skipToAnnex=false,numberedMode=false;
 const flush=()=>{if(current.length){blocks.push({lines:current,annex,locations});current=[];locations=[];}};
 for(const [index,line] of content.entries()) {
   const push=()=>{current.push(line);locations.push(indexes[begin+index]);};
   if(/^\[Trang\s+\d+\]$/iu.test(line))continue;
   if(/^(?:phụ\s+lục|phụ lục kèm theo)/iu.test(line)){
     flush();annex=true;skipToAnnex=false;numberedMode=false;continue;
   }
   if(/^(?:Nơi nhận|KT\.\s*|TM\.\s*)/iu.test(line)){
     flush();skipToAnnex=true;continue;
   }
   if(skipToAnnex)continue;
   if(annex && /^(?:STT|Số TT|Nhiệm vụ\s+Cơ quan)/iu.test(line))continue;
   if(heading.test(line) && !enumerated.test(line) && !action.test(line)){flush();continue;}
   const numbered=enumerated.test(line);
   const appendixRow=annex && /^\d{1,2}\s+(?=[\p{L}])/iu.test(line);
   const subordinate=numberedMode&&/^[-•]/u.test(line);
   const starts=(numbered&&!subordinate)||appendixRow||(!numberedMode&&actor.test(line));
   if(starts){
     flush();push();
     if(numbered)numberedMode=true;
     continue;
   }
   if(labeled.test(line)){if(current.length)push();continue;}
   if(!current.length){if(action.test(line) && line.length>28)push();continue;}
   push();
 }
 flush();
 const dedup=new Set<string>();
 const proposals:{proposal:Proposal;locations:number[]}[]=[];
 for(const block of blocks) {
   const {lines,annex,locations}=block;
   const first=lines[0];
   const full=lines.join(' ').replace(/[ \t]+/g,' ').trim();
   if((!annex&&!action.test(full)) || full.length<24 || proseIntro.test(first))continue;
   const title=full.replace(enumerated,'').replace(annex?/^\d{1,2}\s+/:/$^/,'').slice(0,180);
   const key=title.toLowerCase().replace(/\s+/g,' ');
   const identity=key+'\n'+full.toLocaleLowerCase('vi');
   if(dedup.has(identity))continue;
   dedup.add(identity);
   const firstBody=first.replace(enumerated,'');
   const lead=labeledValue(lines.join('\n'),/^(?:cơ quan\s+)?chủ trì\s*:\s*(.+)$/iu)
     ||firstBody.match(/^(.+?)\s+(?:chủ trì|tổ chức|tham mưu)(?=\s|$)/iu)?.[1]||'';
   proposals.push({locations,proposal:{
     title,detail:lines.map((line,index)=>index===0?line.replace(enumerated,''):line).join('\n'),excerpt:lines.join('\n'),
     section:first.match(enumerated)?.[0].trim(),lead:lead.replace(/^Giao\s+/iu,''),
     partners:labeledValue(lines.join('\n'),/^(?:cơ quan\s+)?phối hợp\s*:\s*(.+)$/iu)
       ||full.match(/phối hợp với\s+([^;:.]{3,150})(?=[;:.]|$)/iu)?.[1]?.trim()||'',

     deadline:deadline(full),
     deadlineText:labeledValue(lines.join('\n'),/^(?:thời hạn|tiến độ)\s*:\s*(.+)$/iu)
       ||full.match(/(?:^|[\s,;])((?:định kỳ|thường xuyên|hằng (?:tuần|tháng|quý|năm))[^.;,]{0,30})/iu)?.[1]?.trim(),
     deliverable:labeledValue(lines.join('\n'),/^(?:sản phẩm|kết quả)\s*:\s*(.+)$/iu)
   }});
 }
 return proposals.slice(0,300);
}

export function extractTaskProposals(text:string) {
 return locateTaskProposals(text.split(/\r?\n/)).map(item=>item.proposal);
}
