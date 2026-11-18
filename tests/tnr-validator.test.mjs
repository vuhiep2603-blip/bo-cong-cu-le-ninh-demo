import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {inspectFont,validateSet} from '../src/tnr-validate.js';
const buffer=async path=>{const b=await readFile(path);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
test('actual Liberation Serif is rejected even if the user calls the file times.ttf',async()=>{const b=await buffer(new URL('../assets/fonts/LiberationSerif-Regular.ttf',import.meta.url));assert.throws(()=>inspectFont(b),/Liberation Serif.*không phải Times New Roman/)});
test('rejects truncated, malformed and non-font inputs',()=>{for(const b of [new ArrayBuffer(0),new ArrayBuffer(64),new TextEncoder().encode('not a font'.repeat(20)).buffer])assert.throws(()=>inspectFont(b));assert.throws(()=>validateSet({version:1,faces:[]}),/đủ 4/)});
const dir=process.env.FONT_QA_DIR;
test('private external Times New Roman set validates all four actual font styles', {skip:!dir},async()=>{const files=['Times.TTF','Timesbd.TTF','Timesi.TTF','Timesbi.TTF'];const faces=await Promise.all(files.map(async n=>({buffer:await buffer(dir+'/'+n)})));const result=validateSet({version:1,faces},'Đảng ủy xã Lệ Ninh – Thứ Hai đến Chủ nhật; Tiếng Việt đầy đủ dấu.');assert.deepEqual(Object.keys(result).sort(),['normal','bold','italics','bolditalics'].sort());assert.equal(result.bolditalics.info.postscriptName,'TimesNewRomanPS-BoldItalicMT');assert.throws(()=>validateSet({version:1,faces:[faces[0],faces[0],faces[2],faces[3]]}),/trùng kiểu/);assert.throws(()=>validateSet({version:1,faces},'Không có emoji 😀'),/không có ký tự/)});
// Metadata-only negative fixtures are not usable fonts and contain no outlines/font data.
function metadataOnly(fsType,selection=0,macStyle=0){
 const entries=[[1,'Times New Roman'],[2,'Regular'],[4,'Times New Roman'],[6,'TimesNewRomanPSMT']];
 const strings=entries.map(([,s])=>Uint8Array.from([...s].flatMap(c=>[0,c.charCodeAt(0)])));const name=new Uint8Array(6+12*entries.length+strings.reduce((n,b)=>n+b.length,0)),nv=new DataView(name.buffer);nv.setUint16(2,entries.length);nv.setUint16(4,6+12*entries.length);let offset=0;
 entries.forEach(([id],i)=>{const p=6+i*12;[3,1,0x409,id,strings[i].length,offset].forEach((x,j)=>nv.setUint16(p+j*2,x));name.set(strings[i],6+12*entries.length+offset);offset+=strings[i].length});
 const os=new Uint8Array(64),head=new Uint8Array(54);new DataView(os.buffer).setUint16(8,fsType);new DataView(os.buffer).setUint16(62,selection);new DataView(head.buffer).setUint16(44,macStyle);
 const tables=[['name',name],['OS/2',os],['head',head]],buffer=new ArrayBuffer(12+48+name.length+os.length+head.length),v=new DataView(buffer),bytes=new Uint8Array(buffer);v.setUint32(0,0x00010000);v.setUint16(4,3);let p=60;
 tables.forEach(([tag,data],i)=>{const at=12+i*16;bytes.set([...tag].map(c=>c.charCodeAt(0)),at);v.setUint32(at+8,p);v.setUint32(at+12,data.length);bytes.set(data,p);p+=data.length});return buffer;
}
test('rejects restricted, no-subsetting and bitmap-only embedding permissions',()=>{assert.throws(()=>inspectFont(metadataOnly(2)),/cấm nhúng/);assert.throws(()=>inspectFont(metadataOnly(0x100)),/subset/);assert.throws(()=>inspectFont(metadataOnly(0x200)),/bitmap/)});
test('rejects contradictory bold/italic flags instead of assigning the wrong face',()=>{assert.throws(()=>inspectFont(metadataOnly(0,32,1)),/không khớp/)});
