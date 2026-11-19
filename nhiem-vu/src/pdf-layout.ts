export interface TextFragment {
  str:string;x:number;y:number;width:number;height?:number;
}
/** Build words from glyph geometry instead of blindly adding one space after each PDF item. */
export function reconstructPageLines(items:TextFragment[]):string {
  const positioned=items.filter(x=>x.str.length && Number.isFinite(x.x) && Number.isFinite(x.y))
    .sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines:{y:number;parts:TextFragment[]}[]=[];
  for(const item of positioned){
    const line=lines.at(-1);
    if(line && Math.abs(line.y-item.y)<=Math.min(4,Math.max(2,(item.height||8)*.35)))line.parts.push(item);
    else lines.push({y:item.y,parts:[item]});
  }
  return lines.map(line=>{
    const parts=line.parts.sort((a,b)=>a.x-b.x);
    let result='',end=0,previous='';
    for(const item of parts){
      const glyphWidth=item.width/Math.max(1,[...item.str.trim()].length);
      const gap=item.x-end;
      const threshold=Math.max(.9,Math.min(7,glyphWidth*.55));
      const separator=result && !/\s$/.test(previous) && !/^\s/.test(item.str)
        ? gap>threshold*8?'   ':gap>threshold?' ':'':'';
      result+=separator+item.str;
      previous=item.str;end=item.x+Math.max(0,item.width);
    }
    return result.replace(/[ \t]+/g,' ').trim();
  }).filter(Boolean).join('\n');
}