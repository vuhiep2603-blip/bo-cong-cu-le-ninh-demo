import {expect,test} from 'vitest';
import {localDay,isLate} from '../src/model';
import type {Task} from '../src/model';
import {extractDocumentHeader,ruleAnalyzer} from '../src/parser';

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
