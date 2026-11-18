import {useMemo,useState} from 'react';
import {isLate,localDay,statuses} from './model';
import type {Profile,Status,Task} from './model';
import './dashboard.css';

type Period = 'month'|'quarter'|'year'|'all';
type Focus = 'late'|'soon'|'submitted'|'assigned';
const order:Status[]=['ASSIGNED','WORKING','REVISION','SUBMITTED','COMPLETE'];
const focusNames:Record<Focus,string>={
 late:'Quá hạn',soon:'Đến hạn trong 7 ngày',submitted:'Chờ nghiệm thu',assigned:'Chưa tiếp nhận'
};
const formatDay=(day:string)=>day.split('-').reverse().join('/');
function periodMatch(day:string,today:string,period:Period) {
 if(period==='all') return true;
 if(period==='year') return day.slice(0,4)===today.slice(0,4);
 if(period==='month') return day.slice(0,7)===today.slice(0,7);
 return day.slice(0,4)===today.slice(0,4)
  && Math.floor((Number(day.slice(5,7))-1)/3)===Math.floor((Number(today.slice(5,7))-1)/3);
}
function soon(task:Task,today:string) {
 if(task.status==='COMPLETE') return false;
 const delta=(Date.parse(task.deadline+'T12:00:00+07:00')-Date.parse(today+'T12:00:00+07:00'))/86400000;
 return delta>=0&&delta<=7;
}
function matches(task:Task,focus:Focus,today:string) {
 return focus==='late'?isLate(task,today):focus==='soon'?soon(task,today)
  :focus==='submitted'?task.status==='SUBMITTED':task.status==='ASSIGNED';
}
export function Dashboard({tasks,users,profile,onSelect}:{
 tasks:Task[];users:Profile[];profile:Profile;onSelect:(id:string)=>void
}) {
 const [period,setPeriod]=useState<Period>('month');
 const [person,setPerson]=useState('');
 const [focus,setFocus]=useState<Focus>('late');
 const today=localDay();
 const admin=profile.role==='ADMIN';
 // The parent Firestore listener supplies only tasks readable by this profile.
 // No cross-user reads or new aggregates are introduced for the dashboard.
 const filtered=useMemo(()=>tasks.filter(t=>periodMatch(t.deadline,today,period)
  &&(!admin||!person||t.assignees.includes(person))),[tasks,today,period,admin,person]);
 const complete=filtered.filter(t=>t.status==='COMPLETE').length;
 const late=filtered.filter(t=>isLate(t,today)).length;
 const submitted=filtered.filter(t=>t.status==='SUBMITTED').length;
 const dueSoon=filtered.filter(t=>soon(t,today)).length;
 const completion=filtered.length?Math.round(100*complete/filtered.length):0;
 const focusList=filtered.filter(t=>matches(t,focus,today))
  .sort((a,b)=>a.deadline.localeCompare(b.deadline)||a.id.localeCompare(b.id));
 const staff=admin?users:[profile];
 const staffCounts=staff.map(u=>({user:u,count:filtered.filter(t=>t.assignees.includes(u.uid)).length}))
  .sort((a,b)=>b.count-a.count||a.user.code.localeCompare(b.user.code));
 const staffMax=Math.max(1,...staffCounts.map(x=>x.count));
 const breakdown=order.map(status=>({status,count:filtered.filter(t=>t.status===status).length}));
 return <div className="dash">
  <section className="panel dash-filter">
   <div className="fields">
    <label>Kỳ thống kê theo thời hạn
     <select value={period} onChange={e=>setPeriod(e.target.value as Period)}>
      <option value="month">Tháng hiện tại</option><option value="quarter">Quý hiện tại</option>
      <option value="year">Năm hiện tại</option><option value="all">Tất cả thời hạn</option>
     </select></label>
    {admin&&<label>Cán bộ tham gia
     <select value={person} onChange={e=>setPerson(e.target.value)}>
      <option value="">Toàn Văn phòng</option>
      {users.map(u=><option value={u.uid} key={u.uid}>{u.code} · {u.name}</option>)}
     </select></label>}
   </div>
   <p className="muted dash-note">Các số liệu được tính theo thời hạn của nhiệm vụ đang được phép xem; không phải số nhiệm vụ đã hoàn thành trong kỳ.</p>
  </section>
  <div className="dash-kpis">
   {([['Tổng nhiệm vụ',filtered.length],['Hoàn thành',complete],['Đang xử lý',filtered.length-complete],['Quá hạn',late],['Chờ nghiệm thu',submitted],['Đến hạn trong 7 ngày',dueSoon]] as const).map(([label,value])=>
    <div className="dash-kpi" key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </div>
  <div className="dash-grid">
   <section className="panel dash-panel"><h3>Tiến độ và trạng thái</h3>
    <p className="dash-completion"><strong>{completion}%</strong> nhiệm vụ đã hoàn thành</p>
    <div className="dash-track" role="progressbar" aria-label="Tỷ lệ nhiệm vụ hoàn thành" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}>
     <div className="dash-fill" style={{width:completion+'%'}}/></div>
    <div className="dash-breakdown">{breakdown.map(({status,count})=>
     <div className="dash-barrow" key={status}><span>{statuses[status]}</span>
      <div className="dash-track" role="img" aria-label={statuses[status]+': '+count}>
       <div className={'dash-fill dash-'+status.toLowerCase()} style={{width:(filtered.length?100*count/filtered.length:0)+'%'}}/>
      </div><strong>{count}</strong></div>)}</div>
   </section>
   <section className="panel dash-panel"><h3>Khối lượng theo cán bộ</h3>
    <p className="muted dash-note">Nhiệm vụ phối hợp được tính cho từng cán bộ tham gia nên tổng theo người có thể lớn hơn tổng số nhiệm vụ.</p>
    {staffCounts.length===0?<p className="muted">Chưa có cán bộ để thống kê.</p>:staffCounts.map(({user,count})=>
     <div className="dash-staff" key={user.uid}><span title={user.name}>{user.code} · {user.name}</span>
      <div className="dash-track" role="img" aria-label={user.name+': '+count+' nhiệm vụ'}>
       <div className="dash-fill" style={{width:(100*count/staffMax)+'%'}}/>
      </div><strong>{count}</strong></div>)}
   </section>
  </div>
  <section className="panel dash-panel">
   <h3>Danh sách cần quan tâm</h3>
   <div className="dash-tabs" aria-label="Lọc danh sách cần quan tâm">
    {(Object.keys(focusNames) as Focus[]).map(key=>
     <button type="button" key={key} aria-pressed={focus===key} onClick={()=>setFocus(key)}>
      {focusNames[key]} ({filtered.filter(t=>matches(t,key,today)).length})
     </button>)}
   </div>
   {focusList.length===0?<p className="muted">Không có nhiệm vụ thuộc nhóm này trong kỳ lọc.</p>:
    <div className="table-wrap"><table><thead><tr><th>Nhiệm vụ</th><th>Thời hạn</th><th>Trạng thái</th><th>Tiến độ</th></tr></thead>
    <tbody>{focusList.map(task=><tr key={task.id}>
     <td><button type="button" className="link" onClick={()=>onSelect(task.id)}>{task.title}</button><small>{task.id}</small></td>
     <td>{formatDay(task.deadline)}</td><td>{statuses[task.status]}</td><td>{task.progress}%</td>
    </tr>)}</tbody></table></div>}
  </section>
 </div>;
}
