// Read font-internal SFNT metadata/cmap; file names are deliberately not trusted.
export const ROLES=['normal','bold','italics','bolditalics'];
export const ROLE_LABELS={normal:'Regular',bold:'Bold',italics:'Italic',bolditalics:'Bold Italic'};
const REQUIRED='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ĐđĂăÂâÊêÔôƠơƯưÀÁÃÈÉÌÍÒÓÕÙÚÝàáãèéìíòóõùúýĨĩŨũ–—•'+Array.from({length:0x1efa-0x1ea0},(_,i)=>String.fromCodePoint(0x1ea0+i)).join('');
const fail=message=>{throw Error(message)};
export function inspectFont(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<64||buffer.byteLength>20*1024*1024)fail('Font không hợp lệ hoặc vượt quá 20 MB.');
 const v=new DataView(buffer),length=v.byteLength;
 const bounds=(p,n)=>{if(!Number.isInteger(p)||p<0||n<0||p+n>length)fail('Cấu trúc font bị lỗi hoặc thiếu dữ liệu.')};
 const u16=p=>{bounds(p,2);return v.getUint16(p)},i16=p=>{bounds(p,2);return v.getInt16(p)},u32=p=>{bounds(p,4);return v.getUint32(p)};
 const tag=p=>{bounds(p,4);return String.fromCharCode(...new Uint8Array(buffer,p,4))};
 if(![0x00010000,0x4f54544f,0x74727565].includes(u32(0)))fail('Chỉ nhận font TTF/OTF đơn, không nhận TTC/WOFF hoặc tệp đổi đuôi.');
 const count=u16(4);if(count<1||count>256)fail('Bảng font không hợp lệ.');bounds(12,count*16);
 const tables={};for(let i=0;i<count;i++){const p=12+i*16,name=tag(p),offset=u32(p+8),size=u32(p+12);bounds(offset,size);if(tables[name])fail('Font có bảng trùng lặp.');tables[name]={offset,size};}
 const table=(name,min)=>{const t=tables[name];if(!t||t.size<min)fail('Font thiếu bảng '+name+'.');return t};
 const nt=table('name',6),n=nt.offset,records=u16(n+2),strings=u16(n+4);if(6+records*12>nt.size||strings>nt.size)fail('Bảng tên font bị lỗi.');
 const names={};
 for(let i=0;i<records;i++){
  const p=n+6+i*12,platform=u16(p),encoding=u16(p+2),lang=u16(p+4),id=u16(p+6),size=u16(p+8),offset=u16(p+10);
  if(![1,2,4,6,16,17].includes(id))continue;if(strings+offset+size>nt.size)fail('Chuỗi tên font nằm ngoài bảng.');
  const bytes=new Uint8Array(buffer,n+strings+offset,size);let text;
  if(platform===0||platform===3){if(size%2)fail('Tên Unicode của font bị lỗi.');text='';for(let j=0;j<size;j+=2)text+=String.fromCharCode((bytes[j]<<8)|bytes[j+1]);}
  else if(platform===1&&encoding===0){text=Array.from(bytes,x=>String.fromCharCode(x)).join('');}else continue;
  text=text.replace(/\0/g,'').trim();if(!text)continue;
  const priority=platform===3&&lang===0x409?100:platform===0?80:platform===3?60:20;
  if(!names[id]||priority>names[id].priority)names[id]={text,priority};
 }
 const text=id=>names[id]?.text||'',family=text(16)||text(1),subfamily=text(17)||text(2),ps=text(6);
 if(family!=='Times New Roman'||text(1)!=='Times New Roman')fail('Font thực tế là “'+(family||'không xác định')+'”, không phải Times New Roman. Đổi tên tệp không làm đổi font.');
 const roles={TimesNewRomanPSMT:'normal','TimesNewRomanPS-BoldMT':'bold','TimesNewRomanPS-ItalicMT':'italics','TimesNewRomanPS-BoldItalicMT':'bolditalics'};
 const role=roles[ps];if(!role)fail('Không xác định được kiểu Times New Roman qua tên PostScript: '+(ps||'(trống)')+'.');
 const os=table('OS/2',64),head=table('head',54),selection=u16(os.offset+62),macStyle=u16(head.offset+44),fsType=u16(os.offset+8);
 if(fsType&0x0002)fail('Font có cờ cấm nhúng (Restricted License Embedding). Hãy chọn font được phép nhúng PDF.');
 if(fsType&0x0100)fail('Font không cho phép subset; bộ xuất hiện tại cần font cho phép subset.');
 if(fsType&0x0200)fail('Font chỉ cho phép nhúng bitmap, không phù hợp bộ xuất PDF.');
 const expectedBold=role==='bold'||role==='bolditalics',expectedItalic=role==='italics'||role==='bolditalics';
 if(!!(selection&32)!==expectedBold||!!(selection&1)!==expectedItalic||!!(macStyle&1)!==expectedBold||!!(macStyle&2)!==expectedItalic)fail('Tên và cờ đậm/nghiêng trong font không khớp nhau.');
 const cm=table('cmap',4),c=cm.offset,cmCount=u16(c+2);if(4+cmCount*8>cm.size)fail('Bảng Unicode bị lỗi.');const maps=[];
 for(let i=0;i<cmCount;i++){
  const p=c+4+i*8,platform=u16(p),encoding=u16(p+2),rel=u32(p+4);if(!(platform===0||platform===3&&[1,10].includes(encoding)))continue;
  if(rel+2>cm.size)fail('Bảng ký tự bị lỗi.');const s=c+rel,format=u16(s);
  if(format===4){const size=u16(s+2),segments=u16(s+6)/2;if(!Number.isInteger(segments)||segments<1||rel+size>cm.size||16+8*segments>size)fail('cmap format 4 bị lỗi.');maps.push(code=>{if(code>65535)return false;const end=s+14,start=end+2*segments+2,delta=start+2*segments,range=delta+2*segments;for(let j=0;j<segments;j++){if(code>u16(end+2*j))continue;if(code<u16(start+2*j))return false;const off=u16(range+2*j);if(!off)return ((code+i16(delta+2*j))&65535)!==0;const pos=range+2*j+off+2*(code-u16(start+2*j));if(pos<s||pos+2>s+size)return false;let glyph=u16(pos);if(glyph)glyph=(glyph+i16(delta+2*j))&65535;return glyph!==0}return false});}
  if(format===12){const size=u32(s+4),groups=u32(s+12);if(rel+size>cm.size||16+12*groups>size)fail('cmap format 12 bị lỗi.');maps.push(code=>{let lo=0,hi=groups-1;while(lo<=hi){const j=(lo+hi)>>1,p=s+16+j*12,a=u32(p),b=u32(p+4);if(code<a)hi=j-1;else if(code>b)lo=j+1;else return u32(p+8)+(code-a)!==0}return false});}
 }
 const hasGlyph=code=>maps.some(m=>m(code));
 const missing=[...new Set(REQUIRED)].filter(ch=>!hasGlyph(ch.codePointAt(0)));if(missing.length)fail('Font '+ROLE_LABELS[role]+' thiếu ký tự tiếng Việt hoặc ký tự văn bản: '+missing.slice(0,8).join(' ')+'.');
 return {info:{family,subfamily,postscriptName:ps,fullName:text(4),role,embeddingFlags:fsType},hasGlyph};
}
export function validateSet(record,text=''){
 if(!record||record.version!==1||!Array.isArray(record.faces)||record.faces.length!==4)fail('Cần đủ 4 font Times New Roman: Regular, Bold, Italic và Bold Italic.');
 const faces={},characters=[...new Set(text.normalize('NFC'))].filter(ch=>!/[\s\u0000-\u001f]/u.test(ch));
 for(const face of record.faces){const parsed=inspectFont(face.buffer),role=parsed.info.role;if(faces[role])fail('Bộ font trùng kiểu '+ROLE_LABELS[role]+'. Cần mỗi kiểu đúng một tệp.');const missing=characters.filter(ch=>!parsed.hasGlyph(ch.codePointAt(0)));if(missing.length)fail('Times New Roman '+ROLE_LABELS[role]+' không có ký tự “'+missing.slice(0,5).join(' ')+'” trong lịch. Không xuất bằng font thay thế.');faces[role]={buffer:face.buffer,info:parsed.info};}
 for(const role of ROLES)if(!faces[role])fail('Thiếu Times New Roman '+ROLE_LABELS[role]+'.');return faces;
}
