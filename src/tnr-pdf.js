import pdfMake from 'pdfmake/build/pdfmake.js';
import {resources} from './tnr-fonts.js';
const nfc=value=>typeof value==='string'?value.normalize('NFC'):Array.isArray(value)?value.map(nfc):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,nfc(v)])):value;
export async function createTimesPdf(content,background,text){
 const {fonts,vfs}=await resources(text);
 return new Promise((resolve,reject)=>{
  const failure=e=>reject(Error('Không tạo được PDF Times New Roman: '+(e?.message||String(e))+'. Không sử dụng font thay thế.'));
  try{
   // Same definition as the existing PDF path, only the document font changes.
   const definition={pageSize:'A4',pageMargins:[46,46,43,48],defaultStyle:{font:'TimesNewRoman',fontSize:12.8,lineHeight:1.15},background,info:{title:'Tài liệu minh họa – Văn phòng Đảng ủy xã Lệ Ninh',author:'Le Ninh Demo'},content:nfc(content)};
   // Private resources per document; never register/replace invitation fonts globally.
   // getStream performs synchronous layout so malformed font/layout errors are caught.
   const stream=pdfMake.createPdf(definition,undefined,fonts,vfs).getStream(),chunks=[];
   stream.on('data',chunk=>chunks.push(chunk));stream.on('error',failure);stream.on('end',()=>resolve(new Blob(chunks,{type:'application/pdf'})));stream.end();
  }catch(e){failure(e)}
 });
}
