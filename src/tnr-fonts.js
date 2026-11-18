import {validateSet,ROLES} from './tnr-validate.js';
const scope=location.pathname.replace(/[^/]*$/,'');
let session=null,sessionOnly=false;
function database(){return new Promise((resolve,reject)=>{const r=indexedDB.open('le-ninh-tnr-fonts-v1:'+scope,1);r.onupgradeneeded=()=>r.result.createObjectStore('sets');r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Hãy đóng các tab cũ để mở kho font.'))})}
async function stored(mode,fn){const db=await database();try{return await new Promise((resolve,reject)=>{const t=db.transaction('sets',mode);let request;try{request=fn(t.objectStore('sets'))}catch(e){t.abort();reject(e);return}t.oncomplete=()=>resolve(request?.result);t.onerror=()=>reject(t.error||Error('Không lưu được font.'));t.onabort=()=>reject(t.error||Error('Giao dịch font bị hủy.'))})}finally{db.close()}}
function recordOf(faces){return {version:1,faces:ROLES.map(role=>({buffer:faces[role].buffer}))}}
async function active(){
 if(sessionOnly&&session)return session;
 try{const saved=await stored('readonly',s=>s.get('active'));if(saved){validateSet(saved);session=saved;return saved}session=null}catch(e){throw Error('Chưa đọc được bộ Times New Roman đã lưu. Chọn đủ 4 tệp font hợp pháp để dùng trong phiên này. '+e.message)}
 throw Error('Chưa có đủ bộ Times New Roman. Mở “Font Times New Roman cho PDF Lịch”, chọn đủ 4 tệp Regular, Bold, Italic, Bold Italic từ máy tính. Không sử dụng font thay thế.');
}
export async function importFiles(files,{remember=true}={}){
 if(files.length!==4)throw Error('Hãy chọn cùng lúc đúng 4 tệp font Times New Roman: Regular, Bold, Italic, Bold Italic.');
 const buffers=[];let total=0;for(const file of files){if(file.size>20*1024*1024)throw Error('Một tệp font vượt quá 20 MB.');total+=file.size;if(total>40*1024*1024)throw Error('Bộ font vượt quá 40 MB.');buffers.push({buffer:await file.arrayBuffer()})}
 const record=recordOf(validateSet({version:1,faces:buffers}));let warning='',persisted=false;
 try{await stored('readwrite',s=>remember?s.put(record,'active'):s.delete('active'));persisted=remember}catch(e){warning='Bộ font hợp lệ, nhưng không cập nhật được kho font: '+e.message+'. Chỉ dùng bộ mới trong phiên này; bộ cũ có thể còn sau khi tải lại.'}
 session=record;sessionOnly=!persisted;return {persisted,warning,faces:Object.values(validateSet(record)).map(f=>f.info)};
}
export async function removeFonts(){await stored('readwrite',s=>s.delete('active'));session=null;sessionOnly=false;}
export async function status(){try{const record=await active();return {ready:true,sessionOnly,faces:Object.values(validateSet(record)).map(f=>f.info)}}catch(e){return {ready:false,message:e.message}}}
export async function resources(text=''){
 let record;try{record=await active()}catch(e){window.dispatchEvent(new Event('tnr-font-required'));throw e}
 let faces;try{faces=validateSet(record,text)}catch(e){window.dispatchEvent(new Event('tnr-font-required'));throw e}
 const vfs={},map={};for(const role of ROLES){const file='local-times-new-roman-'+role+'.ttf',bytes=new Uint8Array(faces[role].buffer);let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));vfs[file]=btoa(value);map[role]=file;}
 return {fonts:{TimesNewRoman:map},vfs};
}
