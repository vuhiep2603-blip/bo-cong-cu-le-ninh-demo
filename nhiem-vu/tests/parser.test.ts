import {decideHeaderField} from "../src/header-consensus";
import {estimateSkew,prepareOcrImage} from "../src/ocr-image";
import {expect,test} from 'vitest';
import {localDay,isLate} from '../src/model';
import type {Task} from '../src/model';
import {extractDocumentHeader,ruleAnalyzer,reconcileHeaders,isSparsePdfPage,analyzeDocument} from '../src/parser';
import {reconstructPageLines} from '../src/pdf-layout';
import {extractTaskProposals} from '../src/task-extraction';

test('extracts metadata, fields and traceable separate proposals without external services',async()=>{
 const result=await ruleAnalyzer.analyze(`Số: 12-KH/ĐU
Trích yếu: Kiểm thử nhiệm vụ
1. Giao Văn phòng chuẩn bị tài liệu.
Chủ trì: Văn phòng
Phối hợp: Ban Xây dựng Đảng
Thời hạn: 5/12/2026
Sản phẩm: Báo cáo
2. Giao Bộ phận tổng hợp lập danh sách.
Kết quả: Danh sách cán bộ`.normalize('NFD'));
 expect(result.source).toEqual({number:'12-KH/ĐU',subject:'Kiểm thử nhiệm vụ'});
 expect(result.proposals).toHaveLength(2);
 expect(result.proposals[0]).toMatchObject({lead:'Văn phòng',partners:'Ban Xây dựng Đảng',deadline:'2026-12-05',deliverable:'Báo cáo'});
 expect(result.proposals[0].excerpt).toContain('Thời hạn: 5/12/2026');
 expect(result.proposals[1].deliverable).toBe('Danh sách cán bộ');
});
test('does not invent a deadline or assignment from metadata alone',async()=>{
 const result=await ruleAnalyzer.analyze('V/v thông tin chung\nPhối hợp: Văn phòng\nNơi nhận: Như trên');
 expect(result.proposals).toEqual([]);
 expect(result.source.subject).toBe('thông tin chung');
});
test('overdue uses Hanoi calendar and excludes completed tasks',()=>{
 const day=localDay(new Date('2026-12-31T18:30:00Z'));
 expect(day).toBe('2027-01-01');
 expect(isLate({status:'WORKING',deadline:'2026-12-31'} as Task,day)).toBe(true);
 expect(isLate({status:'COMPLETE',deadline:'2026-12-31'} as Task,day)).toBe(false);
});

test('reads Vietnamese issue number, date and subject from document heading',async()=>{
 const text=`ĐẢNG BỘ TỈNH QUẢNG TRỊ
ĐẢNG ỦY XÃ LỆ NINH
Số: 123-CV/ĐU
ĐẢNG CỘNG SẢN VIỆT NAM
Lệ Ninh, ngày 18 tháng 11 năm 2026
V/v đôn đốc thực hiện nhiệm vụ năm 2026
Kính gửi: Các cơ quan tham mưu
1. Giao Văn phòng tổng hợp báo cáo.`;
 const header=extractDocumentHeader(text);
 expect(header).toEqual({number:'123-CV/ĐU',documentDate:'2026-11-18',
  subject:'đôn đốc thực hiện nhiệm vụ năm 2026'});
 const analyzed=await ruleAnalyzer.analyze(text);
 expect(analyzed.source).toEqual({number:header.number,subject:header.subject});
 expect(analyzed.documentDate).toBe('2026-11-18');
});
test('accepts compact issue dates, avoids mistaking task deadlines for issuance',()=>{
 expect(extractDocumentHeader('Số: 15/TB-ĐU\nLệ Ninh, ngày 05/12/2026\nTrích yếu: Kết luận cuộc họp'))
  .toEqual({number:'15/TB-ĐU',documentDate:'2026-12-05',subject:'Kết luận cuộc họp'});
 expect(extractDocumentHeader('Số: 22-KH/ĐU\nGiao việc trước ngày 20/12/2026'))
  .toMatchObject({number:'22-KH/ĐU',documentDate:''});
});

test('reads multi-line conclusion title without confusing it with body',()=>{
 const header=`Số: 20/TB-CQTTBCĐ
Quảng Trị, ngày 14 tháng 10 năm 2026
THÔNG BÁO
Kết luận của đồng chí Bí thư Tỉnh ủy, Trưởng Ban Chỉ đạo về phát triển
khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số tỉnh Quảng Trị tại
phiên họp chuyên đề về khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số
phục vụ phát triển kinh tế - xã hội và đánh giá kết quả công tác quý III/2026
Ngày 13 tháng 10 năm 2026, tại trụ sở Tỉnh ủy, diễn ra phiên họp.`;
 const result=extractDocumentHeader(header);
 expect(result.number).toBe('20/TB-CQTTBCĐ');
 expect(result.documentDate).toBe('2026-10-14');
 expect(result.subject).toContain('đánh giá kết quả công tác quý III/2026');
 expect(result.subject).not.toContain('Ngày 13');
});
test('reads official number with no colon, an overlaid day and multi-line v/v',()=>{
 const header=`Số 363 -CV/TU Quảng Trị, ngày 22 tháng 7 năm 2026
về việc triển khai thực hiện Công văn số
777/TTg-TCCV, ngày 10/7/2026 và
814/TTg-TCCV, ngày 20/7/2026
của Thủ tướng Chính phủ
Kính gửi: các cơ quan tham mưu`;
 const result=extractDocumentHeader(header);
 expect(result.number).toBe('363-CV/TU');
 expect(result.documentDate).toBe('2026-07-22');
 expect(result.subject).toContain('của Thủ tướng Chính phủ');
 expect(result.subject).not.toContain('Kính gửi');
});

test('detects an issuance date wrapped onto the next text row',()=>{
 const h='ĐẢNG ỦY XÃ LỆ NINH\nSố: 102-CV/ĐU\nLệ Ninh, ngày\n18 tháng 11 năm 2026\nV/v chỉ đạo nhiệm vụ';
 expect(extractDocumentHeader(h).documentDate).toBe('2026-11-18');
});
test('does not guess an absent issuance day',()=>{
 const h='TỈNH ỦY QUẢNG TRỊ\nSố -CV/TU\nQuảng Trị, ngày tháng 7 năm 2026\nV/v triển khai công việc';
 expect(extractDocumentHeader(h).documentDate).toBe('');
});

test('OCR scan header identifies issue date and stops the summary at place/date',()=>{
 const scan=`THỦ TƯỚNG CHÍNH PHỦ
Số: ††/TTg-TCCV
V/v sắp xếp cơ sở giáo dục mầm
non, phổ thông, thường xuyên,
giáo dục nghề nghiệp công lập
cấp tỉnh, cấp xã
Hà Nội, ngày 10 tháng 7 năm 2026
Kính gửi: Bộ Giáo dục và Đào tạo`;
 const result=extractDocumentHeader(scan);
 expect(result.number).toBe(''); // handwritten number not reliably OCR readable
 expect(result.documentDate).toBe('2026-07-10');
 expect(result.subject).toBe('sắp xếp cơ sở giáo dục mầm non, phổ thông, thường xuyên, giáo dục nghề nghiệp công lập cấp tỉnh, cấp xã');
});
test('OCR mixed heading preserves issue date on shared number/date row',()=>{
 const ocr='Số: 20/TB-CQTTBCĐ Quảng Trị, ngày 14 tháng 10 năm 2026\nTHÔNG BÁO';
 const result=extractDocumentHeader(ocr);
 expect(result.number).toBe('20/TB-CQTTBCĐ');
 expect(result.documentDate).toBe('2026-10-14');
});

test('repair partial number 20/TB with same-prefix OCR code, never override unrelated number',()=>{
 const embedded={number:'20/TB',documentDate:'2026-10-14',subject:'Kết luận của đồng chí Bí thư Tỉnh ủy'};
 const scanned={number:'20/TB-CQTTBCĐ',documentDate:'2026-10-14',subject:'Kết luận của đồng chí Bí thư Tỉnh ủy, Trưởng Ban Chỉ đạo'};
 expect(reconcileHeaders(embedded,scanned)).toMatchObject({number:'20/TB-CQTTBCĐ',subject:scanned.subject,conflicts:[]});
 expect(reconcileHeaders(embedded,{...scanned,number:'34/CT-TTg'})).toMatchObject({number:'20/TB',conflicts:['số, ký hiệu']});
});
test('number with spaced suffix and OCR dateline',()=>{
 const h='Số: 20/TB - CQTTBCĐ\nQuảng Trị, ngày 14 tháng 10 năm 2026';
 expect(extractDocumentHeader(h)).toMatchObject({number:'20/TB-CQTTBCĐ',documentDate:'2026-10-14'});
});

test('the supplied directive 31 scan has the title and the OCR dateline O5',()=>{
 const extracted=`Người ký: CỤC THÔNG TIN VÀ TRUYỀN THÔNG CHÍNH PHỦ
Cơ quan phát hành: VĂN PHÒNG CHÍNH PHỦ
Thời gian ký: 06.08.2026 15:23:06 +07:00
THỦ TƯỚNG CHÍNH PHỦ CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Số: 34 /CT-TTg Hà Nội, ngày O5 tháng 8 năm 2026
CHỈ THỊ
Về thực hiện các nhiệm vụ trọng tâm năm học 2026 - 2027
Thực hiện Nghị quyết số 71-NQ/TW ngày 22 tháng 8 năm 2025`;
 const header=extractDocumentHeader(extracted);
 expect(header.documentDate).toBe('2026-08-05');
 expect(header.subject).toBe('Về thực hiện các nhiệm vụ trọng tâm năm học 2026 - 2027');
 expect(header.number).toBe('34/CT-TTg'); // raw OCR candidate may misread scanned 31 as 34
});

test('join PDF glyph fragments inside Vietnamese words, keep actual word gaps',()=>{
  const letters=[
    {str:'v',x:0,y:80,width:8},{str:'ề',x:8,y:80,width:9},
    {str:'t',x:24,y:80,width:6},{str:'ă',x:30,y:80,width:8},
    {str:'n',x:38,y:80,width:8},{str:'g',x:46,y:80,width:8},
    {str:'cường',x:66,y:80,width:38}
  ];
  expect(reconstructPageLines(letters)).toBe('về tăng cường');
});
test('keep the complete directive clause and subordinate owner and product paragraphs',()=>{
 const body=`BAN THƯỜNG VỤ TỈNH ỦY YÊU CẦU TẬP TRUNG THỰC HIỆN CÁC NHIỆM VỤ SAU:
1. Ban Tuyên giáo Tỉnh ủy chủ trì hướng dẫn quán triệt,
tuyên truyền Chỉ thị; phối hợp với các cơ quan liên quan.
Thời hạn: 30/11/2026
Sản phẩm: Báo cáo tổng hợp
2. UBND tỉnh tập trung rà soát, phân bổ
nguồn lực và xử lý khó khăn, vướng mắc.
Kết quả: Kế hoạch triển khai`;
 const p=extractTaskProposals(body);
 expect(p).toHaveLength(2);
 expect(p[0].detail).toContain('tuyên truyền Chỉ thị; phối hợp');
 expect(p[0].lead).toBe('Ban Tuyên giáo Tỉnh ủy');
 expect(p[0].deliverable).toBe('Báo cáo tổng hợp');
 expect(p[0].deadline).toBe('2026-11-30');
 expect(p[1].detail).toContain('nguồn lực và xử lý');
 expect(p[1].deliverable).toBe('Kế hoạch triển khai');
});
test('avoid turning letterhead and general introductory directive into tasks',()=>{
 const text=`TỈNH ỦY QUẢNG TRỊ
Số: 24-CT/TU
Ban Thường vụ Tỉnh ủy yêu cầu tập trung thực hiện các nhiệm vụ sau:
1. Ban Xây dựng Đảng chủ trì tổ chức thực hiện kế hoạch.
Văn phòng Đảng ủy phối hợp tổng hợp kết quả.`;
 const p=extractTaskProposals(text);
 expect(p).toHaveLength(1);
 expect(p[0].detail).toContain('Văn phòng Đảng ủy phối hợp');
});

test('prefer OCR for Vietnamese syllables broken into character spaces',()=>{
 const embedded={number:'24-CT/TU',documentDate:'2026-10-12',subject:'CỦA BAN THƯỜNG VỤ TỈNH ỦY v ề t ă ng c ườ ng s ự lãnh đạo'};
 const scanned={number:'24-CT/TU',documentDate:'2026-10-12',subject:'Của Ban Thường vụ Tỉnh ủy về tăng cường sự lãnh đạo'};
 expect(reconcileHeaders(embedded,scanned).subject).toBe(scanned.subject);
});

test('read annex numbered task rows after the signature page',()=>{
 const s=`CHỈ THỊ
Về thực hiện các nhiệm vụ trọng tâm năm học
1. Bộ Giáo dục và Đào tạo chủ trì xây dựng kế hoạch.
Nơi nhận:
- Như trên
KT. THỦ TƯỚNG
Phụ lục
STT Nhiệm vụ Cơ quan chủ trì Cơ quan phối hợp
1 Xây dựng bộ chỉ số theo dõi thực hiện các mục tiêu
phát triển giáo dục và đào tạo Bộ Giáo dục và Đào tạo
2 Hoàn thiện các tiêu chí, tiêu chuẩn, định mức về
trường học để thực hiện chương trình mới`;
 const p=extractTaskProposals(s);
 expect(p.length).toBeGreaterThanOrEqual(3);
 expect(p.some(x=>x.title.includes('Xây dựng bộ chỉ số'))).toBe(true);
 expect(p.some(x=>x.title.includes('Hoàn thiện các tiêu chí'))).toBe(true);
});

test('identify image-only PDF pages despite embedded whitespace and ignore normal text pages',()=>{
 expect(isSparsePdfPage('   \n \t    ')).toBe(true);
 expect(isSparsePdfPage(('Nội dung văn bản đầy đủ có lớp chữ tiếng Việt ').repeat(6))).toBe(false);
 expect(isSparsePdfPage('Ký số điện tử\nNgười ký: VP\n')).toBe(true);
});

test('leaves conflicting document number and date empty and exposes both readings',async()=>{
 const result=await analyzeDocument({rows:[],headers:[
  {origin:'PDF',page:1,region:'đầu trang',excerpt:'Số: 31/CT-TTg',header:{number:'31/CT-TTg',documentDate:'2026-11-23',subject:'Công tác tháng 11'}},
  {origin:'OCR',page:1,region:'vùng số',confidence:79,excerpt:'Số: 34/CT-TTg',header:{number:'34/CT-TTg',documentDate:'2026-11-24',subject:'Công tác tháng 11'}}
 ]});
 expect(result.source.number).toBe('');
 expect(result.documentDate).toBe('');
 expect(result.readings?.map(reading=>reading.header.number)).toEqual(['31/CT-TTg','34/CT-TTg']);
});
test('layout tables keep the same task across pages with repeated headers',async()=>{
 const row=(page:number,entries:[number,string][])=>({origin:'PDF' as const,page,cells:entries.map(([x,text])=>({x,text}))});
 const heading:[[number,string],[number,string],[number,string],[number,string]]=[[10,'STT'],[120,'Nội dung'],[540,'Chủ trì'],[810,'Sản phẩm']];
 const result=await analyzeDocument({headers:[],rows:[
  row(1,heading),row(1,[[10,'1'],[120,'Lập báo cáo'],[540,'Văn phòng Đảng ủy']]),
  row(2,heading),row(2,[[120,'và đối chiếu số liệu'],[810,'Báo cáo quý']]),
  row(2,[[10,'2'],[120,'Hoàn thành quy trình'],[540,'Ban Tổ chức']])
 ]});
 expect(result.proposals).toHaveLength(2);
 expect(result.proposals[0]).toMatchObject({detail:'Lập báo cáo và đối chiếu số liệu',pages:[1,2],deliverable:'Báo cáo quý',relevance:'direct'});
 expect(result.proposals[1].lead).toBe('Ban Tổ chức');
});
test('keeps ordinal task clauses and subordinate bullets without guessing a recurring date',()=>{
 const out=extractTaskProposals('Một là, Văn phòng Đảng ủy chủ trì tổng hợp báo cáo.\n- Tham mưu trình lãnh đạo.\nThời hạn: Hằng quý\nHai là, Ban Tổ chức rà soát hồ sơ và tài liệu.');
 expect(out).toHaveLength(2);
 expect(out[0]).toMatchObject({section:'Một là,',deadlineText:'Hằng quý',deadline:''});
 expect(out[0].detail).toContain('Tham mưu trình lãnh đạo.');
});
test('long summaries are preserved, while a body dateline cannot supply issue date',()=>{
 const subject='Tăng cường công tác tổng hợp và báo cáo, '.repeat(12)+'quý IV năm 2026';
 const header=extractDocumentHeader('Số: 12/TB-ĐU\nTHÔNG BÁO\n'+subject+'\nNgày 23 tháng 11 năm 2026, tại trụ sở diễn ra cuộc họp.');
 expect(header.subject).toBe(subject);
 expect(header.documentDate).toBe('');
});

test('statutory heading starts the operative body even when its verb differs from task keywords',()=>{
 const out=extractTaskProposals('BAN CHỈ ĐẠO TRUNG ƯƠNG\nTHỰC HIỆN CHƯƠNG TRÌNH MỤC TIÊU\nQUYẾT ĐỊNH\nBan Chỉ đạo thực hiện chương trình hằng năm.\nĐiều 1. Ban hành kèm theo Quyết định này\nchương trình và kế hoạch triển khai.');
 expect(out).toHaveLength(1);
 expect(out[0].section).toBe('Điều 1.');
});

test('header consensus rejects invalid or single-engine isolated candidates regardless of confidence',()=>{
 const candidate={region:'trái đầu trang',origin:'OCR' as const,confidence:99,engine:'Tesseract',page:1};
 expect(decideHeaderField('number',[{...candidate,value:'31/CT-TTg'}])).toEqual({value:'',reason:'review'});
 expect(decideHeaderField('documentDate',[{...candidate,value:'2026-02-30'}]).reason).toBe('missing');
 expect(decideHeaderField('number',[{...candidate,value:'31/CT-TTg',page:2}]).reason).toBe('missing');
 expect(decideHeaderField('number',[
  {...candidate,value:'31/CT-TTg'},{...candidate,engine:'ONNX',value:'31/CT-TTg'}
 ]).value).toBe('31/CT-TTg');
 expect(decideHeaderField('number',[
  {...candidate,value:'31/CT-TTg'},{...candidate,engine:'ONNX',value:'34/CT-TTg'}
 ]).reason).toBe('conflict');
});

test('adaptive preparation reduces isolated noise and keeps a connected dark stroke',()=>{
 const width=41,height=41,data=new Uint8ClampedArray(width*height*4).fill(252);
 const set=(x:number,y:number,color:number[])=>data.set(color,(y*width+x)*4);
 set(8,8,[5,5,5,255]);set(9,9,[240,40,50,255]);
 for(let x=14;x<29;x++)set(x,22,[12,12,12,255]);
 prepareOcrImage({width,height,data,colorSpace:'srgb'},'adaptive');
 expect(data[(8*width+8)*4]).toBe(255);
 expect(data[(9*width+9)*4]).toBe(255);
 expect(data[(22*width+20)*4]).toBe(0);
});

test('skips an administrative introduction and tracks a continuing block across pages',async()=>{
 const texts=['Để thực hiện chương trình, đề nghị các đơn vị triển khai như sau:',
  '1. Văn phòng chủ trì chuẩn bị dự thảo,', 'phối hợp với Ban Tổ chức; tổng hợp và gửi báo cáo.',
  'Sản phẩm: Dự thảo báo cáo','2. Ban Tổ chức thu thập hồ sơ và chuẩn bị tài liệu.'];
 const result=await analyzeDocument({headers:[],rows:texts.map((text,i)=>({origin:'PDF',page:i<2?1:2,cells:[{x:30,text}]}))});
 expect(result.proposals).toHaveLength(2);
 expect(result.proposals[0]).toMatchObject({lead:'Văn phòng',partners:'Ban Tổ chức',pages:[1,2],deliverable:'Dự thảo báo cáo'});
 expect(result.proposals[0].detail).toContain('tổng hợp và gửi báo cáo');
});


test('small-angle projection corrects coherent skew and leaves a blank crop unchanged',()=>{
 const w=480,h=230,rgba=new Uint8ClampedArray(w*h*4).fill(255);
 expect(estimateSkew(rgba,w,h)).toBe(0);
 for(const base of [30,62,94,126,158,190]){
   for(let x=18;x<w-18;x++){
     const y=base+Math.round(x*.0524);
     for(let k=0;k<3;k++)rgba.set([5,5,5,255],((y+k)*w+x)*4);
   }
 }
 expect(estimateSkew(rgba,w,h)).toBeLessThanOrEqual(-2);
 expect(estimateSkew(rgba,w,h)).toBeGreaterThanOrEqual(-4);
});


test('a corroborated dateline and labeled spatial anchor support an isolated number',async()=>{
 const header={number:'451/TB-VPCP',documentDate:'2026-11-20',subject:''};
 const full={origin:'OCR' as const,engine:'Tesseract',region:'đầu trang',page:1,confidence:93,excerpt:'',
    header,fields:[{label:'Số, ký hiệu',value:header.number,page:1,y:-125}]};
 const dateRegion={...full,region:'vùng ngày',header:{...header,number:''},fields:[]};
 expect((await analyzeDocument({rows:[],headers:[full,dateRegion]})).source.number).toBe(header.number);
 expect((await analyzeDocument({rows:[],headers:[full]})).source.number).toBe('');
 expect((await analyzeDocument({rows:[],headers:[{...full,fields:[{...full.fields[0],y:-450}]},dateRegion]})).source.number).toBe('');
});
