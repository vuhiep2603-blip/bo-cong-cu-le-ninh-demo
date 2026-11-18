export const NOTE='(Trong quá trình thực hiện, tùy theo tình hình cụ thể TVĐU sẽ điều chỉnh phù hợp)';
export const DAYS=['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ nhật'];
export function date(s){
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Ngày không hợp lệ.');
  const d=new Date(s+'T12:00:00Z');
  if(isNaN(d)||d.toISOString().slice(0,10)!==s||d.getUTCFullYear()<2020||d.getUTCFullYear()>2100)throw Error('Ngày phải nằm trong 2020–2100.');
  return d;
}
export const iso=d=>d.toISOString().slice(0,10);
export const add=(d,n)=>new Date(d.getTime()+n*86400000);
export const vi=s=>{const d=date(s);return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`};
export function monday(s){const d=date(s);return iso(add(d,-((d.getUTCDay()+6)%7)))}
const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw Error(`${label}: dữ liệu không hợp lệ hoặc quá dài.`);return v.trim()};
export function normalize(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Dữ liệu lịch không hợp lệ.');
  const start=monday(raw.start),end=iso(add(date(start),6));
  if(raw.end&&raw.end!==end)throw Error('Lịch phải đủ 7 ngày từ thứ Hai đến Chủ nhật.');
  if(!Array.isArray(raw.items)||raw.items.length>280)throw Error('Lịch tối đa 280 hoạt động.');
  const ids=new Set();
  const items=raw.items.map((x,i)=>{
    if(!x||typeof x!=='object'||!Number.isInteger(x.day)||x.day<0||x.day>6)throw Error('Ngày hoạt động không hợp lệ.');
    const end_day=x.end_day??x.day;
    if(!Number.isInteger(end_day)||end_day<x.day||end_day>6)throw Error('Khoảng ngày phải nằm trong tuần.');
    if(!['Sáng','Chiều','Cả ngày'].includes(x.session))throw Error('Buổi làm việc không hợp lệ.');
    let people=Array.isArray(x.people)?x.people:(x.person||'').split(',').filter(Boolean);
    if(people.length>20)throw Error('Tối đa 20 người mỗi hoạt động.');
    people=people.map(p=>text(p,90,'Người tham gia')).filter(Boolean);
    const person=people.map((p,j)=>j?p[0].toLowerCase()+p.slice(1):p).join(', ');
    if(person.length>260)throw Error('Danh sách người tham gia quá dài.');
    // Never interpolate imported IDs into the editor's inline event attributes.
    let id=typeof x.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x.id)?x.id:`import_${i}`;
    let suffix=0;while(ids.has(id))id=`import_${i}_${++suffix}`;
    ids.add(id);
    const content=text(x.content,1600,'Nội dung');if(!content)throw Error('Hoạt động thiếu nội dung.');
    return {id,day:x.day,end_day,session:x.session,people,person,content,time:text(x.time??'',80,'Giờ'),location:text(x.location??'',220,'Địa điểm'),auto_office:!!x.auto_office};
  });
  return {start,end,items,note:text(raw.note??NOTE,600,'Ghi chú')||NOTE,weekend_rest:raw.weekend_rest!==false,include_stamp:false};
}
export const sessionItems=(data,day,session)=>data.items.filter(x=>x.day<=day&&day<=x.end_day&&(x.session===session||(session==='Sáng'&&x.session==='Cả ngày')));
export function activityText(x){let t=(x.person.trim().replace(/:$/,'')?(x.person.trim().replace(/:$/,'')+': '):'')+x.content.trim().replace(/^[- ]+/,'').replace(/[ .;]+$/,'');if(x.time)t+=` (Lúc ${x.time})`;if(x.location)t+=` – ${x.location}`;if(x.session==='Cả ngày'&&!t.toLowerCase().includes('cả ngày'))t+=' (Cả ngày)';return '- '+t.replace(/[ .;]+$/,'')+'.'}
export function parseBackup(value){
  if(!value||value.format!=='le-ninh-local-backup'||value.version!==1||!Array.isArray(value.weeks)||value.weeks.length>1000)throw Error('Không đúng định dạng sao lưu phiên bản 1.');
  const seen=new Set();return value.weeks.map(w=>{const data=normalize(w.data);if(seen.has(data.start))throw Error('Tệp có tuần trùng lặp.');seen.add(data.start);return {start:data.start,data,saved:w.saved===true,updated_at:new Date().toISOString()}});
}
