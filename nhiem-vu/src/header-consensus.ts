export interface FieldEvidence {
 value:string;
 origin:'PDF'|'OCR'|'DOCX';
 engine?:string;
 region:string;
 page?:number;
 confidence?:number;
 contextualAnchor?:boolean;
}
export type HeaderKey = 'number'|'documentDate';
export function trustworthyDate(value:string) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 return year>=1900&&year<=2100&&date.toISOString().slice(0,10)===value;
}
function sameNumber(a:string,b:string) {
 return a.normalize('NFC').toLocaleUpperCase('vi')===b.normalize('NFC').toLocaleUpperCase('vi');
}
export function decideHeaderField(key:HeaderKey,evidence:FieldEvidence[]) {
 const candidates=evidence.filter(item=>(item.page===undefined||item.page===1)&&(
   key==='documentDate'?trustworthyDate(item.value):/^\d{1,6}[-/][\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*$/u.test(item.value)
 ));
 if(!candidates.length)return {value:'',reason:'missing' as const};
 const byValue=new Map<string,FieldEvidence[]>();
 for(const item of candidates){
   const key=item.value.normalize('NFC').toLocaleUpperCase('vi');
   const sources=byValue.get(key)??[];
   sources.push(item);byValue.set(key,sources);
 }
 const families=[...byValue.values()].sort((a,b)=>b[0].value.length-a[0].value.length);
 const primary=families[0],longest=primary[0].value;
 const incompatible=families.some(([item])=>key==='number'
   ? !sameNumber(item.value,longest)&&!sameNumber(longest.slice(0,item.value.length+1),item.value+'-')
   : item.value!==longest);
 if(incompatible)return {value:'',reason:'conflict' as const};
 const anchored=primary.some(source=>source.origin!=='OCR'||source.contextualAnchor);
 const positions=new Set(primary.map(source=>source.region));
 const engines=new Set(primary.map(source=>source.engine).filter(Boolean));
 // Repeated values in one region or a high engine confidence alone are insufficient.
 if(anchored||engines.size>=2||positions.size>=2)return {value:longest,reason:'supported' as const};
 return {value:'',reason:'review' as const};
}
