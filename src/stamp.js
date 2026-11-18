// The original PNG is supplied once by the project owner, never drawn or replaced.
export const STAMP_ASSET='./assets/dau_van_phong_can_tron.png';
let ready;
export async function loadOriginalStamp(){
 return ready??=(async()=>{
  const response=await fetch(STAMP_ASSET);
  if(!response.ok)throw Error('Chưa có ảnh dấu treo gốc trong bộ website. Cần bổ sung assets/dau_van_phong_can_tron.png trước khi xuất PDF có dấu.');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length<33||bytes.length>4*1024*1024||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw Error('Tệp dấu treo gốc phải là ảnh PNG hợp lệ, tối đa 4 MB.');
  const blob=new Blob([bytes],{type:'image/png'}),url=URL.createObjectURL(blob);
  let dimensions;
  try{dimensions=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>reject(Error('Không đọc được ảnh dấu treo gốc.'));image.src=url})}finally{URL.revokeObjectURL(url)}
  if(!dimensions.width||!dimensions.height)throw Error('Kích thước ảnh dấu treo không hợp lệ.');
  let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const scale=113/Math.max(dimensions.width,dimensions.height),width=dimensions.width*scale,height=dimensions.height*scale;
  // Same center as the desktop PDF engine: x=46+203/2, y=46+2*17+8.5 from the top.
  return {image:'data:image/png;base64,'+btoa(data),width,height,absolutePosition:{x:147.5-width/2,y:88.5-height/2}};
 })().catch(error=>{ready=null;throw error});
}
