import {createTimesPdf} from './tnr-pdf.js';
import {loadOriginalStamp} from './stamp.js';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
import {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,VerticalAlign,WidthType,BorderStyle} from 'docx';
import pdfMake from 'pdfmake/build/pdfmake.js';
import {normalize,date,iso,add,vi,DAYS,sessionItems,activityText} from './core.js';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const docxType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export function save(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
const lines=s=>String(s||'').replace(/\r/g,'').split('\n').map(s=>s.trim()).filter(Boolean);
function invitationData(f){
  for(const k of ['issued','meeting'])date(f[k]);
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time||''))throw Error('Giờ họp không hợp lệ.');
  if(!['btv','tt','other'].includes(f.kind)||!['hiep','phuong'].includes(f.signer))throw Error('Loại cuộc họp hoặc người ký không hợp lệ.');
  for(const k of ['intro','members','location'])if(typeof f[k]!=='string'||!f[k].trim())throw Error('Thiếu thông tin bắt buộc.');
  for(const v of Object.values(f))if(typeof v==='string'&&v.length>50000)throw Error('Nội dung quá dài.');
  const d=date(f.meeting),t=f.time.split(':'),issued=date(f.issued);
  return {
    number:String(f.number||'').trim().replace(/\s*-?GM\/ĐU\s*$/i,''),
    issued:`Lệ Ninh, ngày ${String(issued.getUTCDate()).padStart(2,'0')} tháng ${String(issued.getUTCMonth()+1).padStart(2,'0')} năm ${issued.getUTCFullYear()}`,
    subtitle:String(f.subtitle||'').trim(),intro:f.intro.trim(),
    members:lines(f.members).map((s,i,a)=>'- '+s.replace(/^[-•]\s*/,'').replace(/[;.]+$/,'')+(i===a.length-1?'.':';')),
    agenda:lines(f.agenda).map((s,i)=>`${i+1}. ${s.replace(/^\d+[.)]\s*/,'')}`),
    time:f.time_text?.trim()||`Vào lúc ${t[0]} giờ ${t[1]} phút, ngày ${String(d.getUTCDate()).padStart(2,'0')} tháng ${String(d.getUTCMonth()+1).padStart(2,'0')} năm ${d.getUTCFullYear()} (${['Chủ nhật','thứ Hai','thứ Ba','thứ Tư','thứ Năm','thứ Sáu','thứ Bảy'][d.getUTCDay()]}).`,
    location:(f.location_text?.trim()||f.location.trim()).replace(/[.]+$/,'')+'.',
    note:String(f.note||'').trim(),closing:String(f.closing||'').trim()||'Đề nghị các đồng chí sắp xếp thời gian tham dự.',
    signer:f.signer==='hiep'?'Đặng Thái Vũ Hiệp':'Nguyễn Thị Phương',
    signer_title:f.signer==='hiep'?'CHÁNH VĂN PHÒNG':'PHÓ CHÁNH VĂN PHÒNG'
  };
}
export async function invitationWord(form){
  const d=invitationData(form),name={btv:'mau_btv',tt:'mau_thuong_truc',other:'mau_khac'}[form.kind];
  const response=await fetch(`./assets/templates/${name}.docx`);if(!response.ok)throw Error('Không tải được mẫu Word.');
  const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
  const xml=new DOMParser().parseFromString(strFromU8(files['word/document.xml']),'application/xml');
  if(xml.querySelector('parsererror'))throw Error('Mẫu Word không hợp lệ.');
  const ps=()=>Array.from(xml.getElementsByTagNameNS(W,'p'));
  const ptext=p=>Array.from(p.getElementsByTagNameNS(W,'t')).map(t=>t.textContent).join('');
  function setText(p,value){const ts=Array.from(p.getElementsByTagNameNS(W,'t'));ts.forEach((t,i)=>{t.textContent=i===0?value:'';t.setAttribute('xml:space','preserve')})}
  const membersParagraph=ps().find(p=>ptext(p).includes('LN_MEMBERS'));
  const agendaParagraph=ps().find(p=>ptext(p).includes('LN_AGENDA'));
  function expand(p,values){if(!p)throw Error('Mẫu thiếu trường danh sách.');for(const value of values){const clone=p.cloneNode(true);setText(clone,value);p.before(clone)}p.remove()}
  if(!d.agenda.length)ps().find(p=>ptext(p).includes('* Nội dung:'))?.remove();
  if(!d.subtitle)ps().find(p=>ptext(p).includes('LN_SUBTITLE'))?.remove();
  if(!d.note)ps().find(p=>ptext(p).includes('LN_NOTE'))?.remove();
  const values={LN_NUMBER:d.number,LN_ISSUED:d.issued,LN_SUBTITLE:d.subtitle,LN_INTRO:d.intro,LN_TIME:d.time,LN_LOCATION:d.location.replace(/\.$/,''),LN_NOTE:d.note,LN_CLOSING:d.closing,LN_SIGNER_TITLE:d.signer_title,LN_SIGNER:d.signer};
  for(const t of xml.getElementsByTagNameNS(W,'t')){
    // One pass: user-entered text resembling a token remains literal.
    t.textContent=t.textContent.replace(/LN_(?:SIGNER_TITLE|SIGNER|NUMBER|ISSUED|SUBTITLE|INTRO|TIME|LOCATION|NOTE|CLOSING)\b/g,key=>values[key]);
  }
  expand(membersParagraph,d.members);expand(agendaParagraph,d.agenda);
  files['word/document.xml']=strToU8(new XMLSerializer().serializeToString(xml));
  return new Blob([zipSync(files)],{type:docxType});
}
const twip=cm=>Math.round(cm*567);
const run=(text,opts={})=>new TextRun({text,font:'Times New Roman',size:26,...opts});
const para=(text,opts={})=>new Paragraph({children:[run(text,opts.run)],spacing:{after:0,line:300},...opts,run:undefined});
export async function scheduleWord(raw){
  const d=normalize(raw),noBorder={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
  const header=new Table({width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[twip(7.7),twip(9.45)],borders:{top:noBorder,bottom:noBorder,left:noBorder,right:noBorder,insideHorizontal:noBorder,insideVertical:noBorder},rows:[new TableRow({children:[new TableCell({children:[para('ĐẢNG UỶ XÃ LỆ NINH',{alignment:AlignmentType.CENTER,run:{bold:false}}),para('VĂN PHÒNG',{alignment:AlignmentType.CENTER,run:{bold:true}}),para('*',{alignment:AlignmentType.CENTER})]}),new TableCell({children:[para('LỊCH CÔNG TÁC TUẦN',{alignment:AlignmentType.CENTER,run:{bold:true}}),para('CỦA BAN THƯỜNG VỤ ĐẢNG UỶ',{alignment:AlignmentType.CENTER,run:{bold:true}}),para(`(Từ ngày ${vi(d.start)} đến ${vi(d.end)})`,{alignment:AlignmentType.CENTER,run:{italics:true}}),para('-----',{alignment:AlignmentType.CENTER})]})]})]});
  const rows=DAYS.map((day,i)=>{
    const am=sessionItems(d,i,'Sáng'),pm=sessionItems(d,i,'Chiều'),rest=d.weekend_rest&&i>=5&&!am.length&&!pm.length;
    const children=rest?[para('Nghỉ',{alignment:AlignmentType.CENTER,run:{italics:true}})]:[['Buổi sáng:',am],['Buổi chiều:',pm]].flatMap(([label,items])=>[para(label,{run:{bold:true}}),...items.map(x=>para(activityText(x)))]);
    return new TableRow({children:[new TableCell({width:{size:twip(3),type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,children:[para(day,{alignment:AlignmentType.CENTER,run:{bold:true}}),para(`(${vi(iso(add(date(d.start),i))).slice(0,5)})`,{alignment:AlignmentType.CENTER,run:{bold:true,italics:true}})]}),new TableCell({width:{size:twip(14.1),type:WidthType.DXA},children})]});
  });
  const table=new Table({width:{size:twip(17.1),type:WidthType.DXA},columnWidths:[twip(3),twip(14.1)],margins:{top:85,bottom:85,left:100,right:80},rows});
  return Packer.toBlob(new Document({creator:'Văn phòng Đảng uỷ xã Lệ Ninh – Demo',styles:{default:{document:{run:{font:'Times New Roman',size:26},paragraph:{spacing:{after:0}}}}},sections:[{properties:{page:{size:{width:twip(21),height:twip(29.7)},margin:{top:twip(1.65),bottom:twip(1.7),left:twip(2.1),right:twip(1.7)}}},children:[header,para(''),table,para(d.note,{alignment:AlignmentType.CENTER,spacing:{before:240},run:{italics:true,size:24}})]}]}));
}
let fontsReady;
async function preparePDF(){return fontsReady??=(async()=>{
  const files=['Regular','Bold','Italic','BoldItalic'];const vfs={};
  await Promise.all(files.map(async suffix=>{const name=`LiberationSerif-${suffix}.ttf`,r=await fetch('./assets/fonts/'+name);if(!r.ok)throw Error('Không tải được font tiếng Việt.');const bytes=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));vfs[name]=btoa(s)}));
  pdfMake.addVirtualFileSystem(vfs);pdfMake.addFonts({LiberationSerif:{normal:'LiberationSerif-Regular.ttf',bold:'LiberationSerif-Bold.ttf',italics:'LiberationSerif-Italic.ttf',bolditalics:'LiberationSerif-BoldItalic.ttf'}});
})().catch(e=>{fontsReady=null;throw e})}
async function pdf(content,background){await preparePDF();return new Promise((resolve,reject)=>{try{pdfMake.createPdf({pageSize:'A4',pageMargins:[46,46,43,48],defaultStyle:{font:'LiberationSerif',fontSize:12.8,lineHeight:1.15},background,info:{title:'Tài liệu minh họa – Văn phòng Đảng ủy xã Lệ Ninh',author:'Le Ninh Demo'},content}).getBlob(resolve)}catch(e){reject(e)}})}
export async function schedulePDF(raw,options={}){
  const stamp=options.includeStamp===true?await loadOriginalStamp():null;
  const d=normalize(raw);
  const body=DAYS.map((day,i)=>{
    const am=sessionItems(d,i,'Sáng'),pm=sessionItems(d,i,'Chiều');
    const stack=d.weekend_rest&&i>=5&&!am.length&&!pm.length?[{text:'Nghỉ',italics:true,alignment:'center'}]:[['Buổi sáng:',am],['Buổi chiều:',pm]].flatMap(([text,items])=>[{text,bold:true},...items.map(x=>({text:activityText(x)}))]);
    return [{stack:[{text:day,bold:true},{text:`(${vi(iso(add(date(d.start),i))).slice(0,5)})`,bold:true,italics:true}],alignment:'center'},{stack}];
  });
  return createTimesPdf([{columns:[{width:203,text:[{text:'ĐẢNG UỶ XÃ LỆ NINH',bold:false},{text:'\nVĂN PHÒNG\n*',bold:true}],alignment:'center'},{width:'*',stack:[{text:'LỊCH CÔNG TÁC TUẦN\nCỦA BAN THƯỜNG VỤ ĐẢNG UỶ',bold:true},{text:`(Từ ngày ${vi(d.start)} đến ${vi(d.end)})`,italics:true},{text:'-----'}],alignment:'center'}],margin:[0,0,0,18]},{table:{widths:[80,'*'],body},layout:{paddingTop:()=>5,paddingBottom:()=>5,paddingLeft:()=>6,paddingRight:()=>6}},{text:d.note,italics:true,fontSize:12,alignment:'center',margin:[0,13,0,0]}],stamp?((page)=>page===1?{image:stamp.image,width:stamp.width,height:stamp.height,absolutePosition:{...stamp.absolutePosition}}:null):undefined,JSON.stringify(d));
}
export async function invitationPDF(form){
  const d=invitationData(form);
  return pdf([{columns:[{width:'49%',stack:[{text:'ĐẢNG BỘ TỈNH QUẢNG TRỊ\nĐẢNG UỶ XÃ LỆ NINH\n*',bold:true,alignment:'center'},{text:`Số: ${d.number}-GM/ĐU`,margin:[0,10,0,0]}]},{width:'51%',stack:[{text:'ĐẢNG CỘNG SẢN VIỆT NAM',bold:true,alignment:'center'},{text:d.issued,italics:true,alignment:'right',margin:[0,16,0,0]}]}]},{text:'GIẤY MỜI',bold:true,fontSize:16,alignment:'center',margin:[0,20,0,5]},{text:d.subtitle,bold:true,alignment:'center'},{text:'────',alignment:'center',margin:[0,0,0,12]},{text:d.intro,alignment:'justify',margin:[0,0,0,10]},{text:'* Thành phần mời:',bold:true},...d.members.map(text=>({text})),...(d.agenda.length?[{text:'* Nội dung:',bold:true,margin:[0,8,0,0]},...d.agenda.map(text=>({text}))]:[]),{text:[{text:'* Thời gian: ',bold:true},{text:d.time,bold:true,italics:true}],margin:[0,10,0,5]},{text:[{text:'* Địa điểm: ',bold:true},{text:d.location,bold:true,italics:true}]},...(d.note?[{text:'* '+d.note}]:[]),{text:d.closing,margin:[0,12,0,12]},{columns:[{width:'45%',stack:[{text:'Nơi nhận:',bold:true,italics:true},{text:'- Như thành phần mời;\n- Lưu Văn phòng.',fontSize:11}]},{width:'55%',stack:[{text:'T/L BAN THƯỜNG VỤ\n'+d.signer_title,bold:true},{text:d.signer,bold:true,margin:[0,45,0,0]}],alignment:'center'}]}]);
}
