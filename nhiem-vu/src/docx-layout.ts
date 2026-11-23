import {strFromU8,unzipSync} from 'fflate';
import type {DocumentRow} from './document-layout';

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function direct(node:Element,name:string) {
  return Array.from(node.children).filter(child=>child.namespaceURI===W&&child.localName===name);
}
function paragraph(node:Element) {
  return Array.from(node.getElementsByTagNameNS(W,'t')).map(t=>t.textContent??'').join('');
}
function xml(bytes:Uint8Array) {
  const doc=new DOMParser().parseFromString(strFromU8(bytes),'application/xml');
  if(doc.querySelector('parsererror')) throw Error('DOCX chứa phần XML không hợp lệ.');
  return doc.documentElement;
}
export function docxRows(data:Uint8Array):DocumentRow[] {
  let size=0;
  const files=unzipSync(data,{filter:file=>{
    if(!/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(file.name)) return false;
    size+=file.originalSize;
    if(size>32*1024*1024) throw Error('Nội dung DOCX sau giải nén vượt quá 32 MB.');
    return true;
  }});
  if(!files['word/document.xml'])throw Error('Không tìm thấy phần nội dung chính của DOCX.');
  const out:DocumentRow[]=[];
  let tableIndex=0;
  function readContainer(container:Element,region:string) {
    for(const node of Array.from(container.children)){
      if(node.namespaceURI!==W)continue;
      if(node.localName==='p'){
        const text=paragraph(node).trim();
        if(text)out.push({cells:[{x:0,text}],origin:'DOCX',region});
      }
      if(node.localName!=='tbl')continue;
      const table='docx-'+(++tableIndex);
      const grid=direct(node,'tblGrid')[0];
      const count=grid?direct(grid,'gridCol').length:0;
      const inherited=new Map<number,string>();
      for(const tr of direct(node,'tr')){
        const cells:DocumentRow['cells']=[];
        let column=0;
        for(const tc of direct(tr,'tc')){
          const properties=direct(tc,'tcPr')[0];
          const span=properties?Number(direct(properties,'gridSpan')[0]?.getAttributeNS(W,'val'))||1:1;
          const merge=properties?direct(properties,'vMerge')[0]:undefined;
          const text=direct(tc,'p').map(paragraph).filter(Boolean).join('\n');
          if(merge?.getAttributeNS(W,'val')==='restart') inherited.set(column,text);
          else if(!merge) inherited.delete(column);
          cells.push({x:column*1000/Math.max(count,1),text:merge&&!text?inherited.get(column)??'':text});
          column+=span;
        }
        out.push({cells,origin:'DOCX',region:'bảng '+tableIndex,table});
      }
    }
  }
  for(const name of Object.keys(files).filter(name=>name.startsWith('word/header')).sort())readContainer(xml(files[name]),'đầu trang');
  const body=direct(xml(files['word/document.xml']),'body')[0];
  if(!body)throw Error('Không tìm thấy thân văn bản DOCX.');
  readContainer(body,'thân văn bản');
  for(const name of Object.keys(files).filter(name=>name.startsWith('word/footer')).sort())readContainer(xml(files[name]),'chân trang');
  return out;
}
