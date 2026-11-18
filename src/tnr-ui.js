import {importFiles,removeFonts,status} from './tnr-fonts.js';
export async function mountTimesFontControls(){
 const input=document.getElementById('timesFontFiles'),label=document.getElementById('timesFontStatus'),details=document.getElementById('timesFontSettings');if(!input||!label||!details)return;
 const replace=document.getElementById('replaceTimesFonts'),remove=document.getElementById('removeTimesFonts'),remember=document.getElementById('rememberTimesFonts');
 const busy=on=>{input.disabled=replace.disabled=remove.disabled=remember.disabled=on};
 async function refresh(){const s=await status();label.textContent=s.ready?'Đủ 4 kiểu Times New Roman hợp lệ'+(s.sessionOnly?' — chỉ dùng trong phiên này.':' — đã lưu riêng tại trình duyệt.'):'Chưa có bộ font hợp lệ. '+s.message;return s}
 window.addEventListener('tnr-font-required',()=>{details.open=true;label.textContent='Cần chọn đủ 4 font Times New Roman hợp pháp trước khi xuất PDF Lịch. Không tự chuyển sang font khác.'});
 input.addEventListener('change',async()=>{if(!input.files.length)return;busy(true);try{const r=await importFiles([...input.files],{remember:remember.checked});await refresh();if(r.warning)label.textContent+=' '+r.warning}catch(e){label.textContent='Không thay bộ font: '+e.message}finally{input.value='';busy(false)}});
 replace.addEventListener('click',()=>input.click());
 remove.addEventListener('click',async()=>{if(!confirm('Xóa bộ Times New Roman đã lưu? Không xóa lịch hoặc dữ liệu công tác.'))return;busy(true);try{await removeFonts();await refresh()}catch(e){label.textContent='Chưa xóa được bộ font: '+e.message}finally{busy(false)}});
 await refresh();
}
