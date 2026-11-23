import type {Cell,DocumentRow,Origin} from './document-layout';
import {rowText} from './document-layout';

export interface TextFragment {
  str:string;x:number;y:number;width:number;height?:number;
}
export function reconstructRows(items:TextFragment[],width:number,origin:Origin,page?:number,confidence?:number):DocumentRow[] {
 const positioned=items.filter(x=>x.str.trim() && Number.isFinite(x.x) && Number.isFinite(x.y))
   .sort((a,b)=>b.y-a.y||a.x-b.x);
 const lines:{y:number;parts:TextFragment[]}[]=[];
 for(const item of positioned){
   const line=lines.at(-1);
   if(line && Math.abs(line.y-item.y)<=Math.max(2,(item.height||8)*.32))line.parts.push(item);
   else lines.push({y:item.y,parts:[item]});
 }
 return lines.map(({y,parts})=>{
   const cells:Cell[]=[];
   let end=0;
   for(const part of parts.sort((a,b)=>a.x-b.x)){
     const glyphWidth=part.width/Math.max(1,[...part.str.trim()].length);
     const threshold=Math.max(.9,glyphWidth*.48);
     const gap=part.x-end;
     const cell=cells.at(-1);
     if (!cell||gap>Math.max(width*.028,threshold*6)) cells.push({text:part.str.trimStart(),x:part.x*1000/width});
     else cell.text+=(gap>threshold&&!/\s$/.test(cell.text)&&!/^\s/.test(part.str)?' ':'')+part.str;
     end=Math.max(part.x,part.x+part.width);
   }
   return {cells:cells.map(c=>({...c,text:c.text.trim()})),page,y,origin,confidence};
 });
}
export function reconstructPageLines(items:TextFragment[]):string {
  const width=Math.max(1,...items.map(item=>item.x+item.width));
  return reconstructRows(items,width,'PDF').map(rowText).join('\n');
}

type Matrix = [number,number,number,number,number,number];
const identity:Matrix=[1,0,0,1,0,0];
function multiply([a,b,c,d,e,f]:Matrix,[g,h,i,j,k,l]:Matrix):Matrix{
 return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
}
export function inspectImages(operations:{fnArray:number[];argsArray:unknown[]},ops:Record<string,number>,pageArea:number){
 let total=0,hasImage=false;
 let matrix=identity;
 const stack:Matrix[]=[];
 const images=new Set([ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject,ops.paintImageXObjectRepeat]);
 for(const [index,op] of operations.fnArray.entries()){
   if(op===ops.save||op===ops.paintFormXObjectBegin)stack.push(matrix);
   if(op===ops.restore||op===ops.paintFormXObjectEnd)matrix=stack.pop()??identity;
   if(op===ops.transform||op===ops.paintFormXObjectBegin){
     const params=operations.argsArray[index] as unknown[]|null;
     const transform=op===ops.transform?params:params?.[0];
     if(Array.isArray(transform)&&transform.length===6&&transform.every(Number.isFinite))matrix=multiply(matrix,transform as Matrix);
   }
   if(images.has(op)){
     hasImage=true;
     total+=Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2]);
   }
 }
 return {hasImage,coverage:Math.min(1,total/Math.max(1,pageArea))};
}
export function mergePageRows(embedded:DocumentRow[],ocr:DocumentRow[]):DocumentRow[]{
 const rows=[...embedded];
 for(const candidate of ocr){
   const sameBand=embedded.find(row=>Math.abs((row.y??0)-(candidate.y??0))<9);
   if(!sameBand){rows.push(candidate);continue;}
   const rightEdge=(cell:Cell)=>cell.x+cell.text.length*7;
   const absent=candidate.cells.filter(cell=>!sameBand.cells.some(old=>
     cell.x<rightEdge(old)+20&&old.x<rightEdge(cell)+20
   ));
   if(absent.length)rows.push({...candidate,cells:absent});
 }
 return rows.sort((a,b)=>(b.y??0)-(a.y??0));
}

export function orderParagraphRows(rows:DocumentRow[]):DocumentRow[] {
 const result:DocumentRow[]=[];
 let run:DocumentRow[]=[];
 function flush(){
   if(run.length>=4){
     for(const side of [0,1]){
       result.push(...run.map(row=>({...row,cells:[row.cells[side]]})));
     }
   }else result.push(...run);
   run=[];
 }
 for(const row of rows){
   const [left,right]=row.cells;
   const columns=row.origin!=='DOCX'&&row.page&&row.cells.length===2&&left.x<425&&right.x>490
     &&right.x-left.x>310&&left.text.length>16&&right.text.length>16;
   if(!columns||run[0]?.page!==row.page)flush();
   if(columns)run.push(row);else result.push(row);
 }
 flush();
 return result;
}
