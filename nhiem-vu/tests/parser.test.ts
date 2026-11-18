import {expect,test} from 'vitest';
import {localDay,isLate} from '../src/model';
import type {Task} from '../src/model';
import {ruleAnalyzer} from '../src/parser';

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
