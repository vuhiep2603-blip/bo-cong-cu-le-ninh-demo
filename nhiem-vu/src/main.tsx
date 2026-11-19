import {StrictMode,useEffect,useState} from 'react';
import type {FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {Timestamp} from 'firebase/firestore';
import {watchUsers,watchTasks,watchHistory,createTask,changeTask,addUser,editUser} from './backend';
import {actions,isLate,roles,stages,statuses} from './model';
import type {Action,Event,Profile,Role,Stage,Task} from './model';
import {readDocument,ruleAnalyzer,reconcileHeaders} from './parser';
import type {Analysis,Proposal} from './parser';
import {AuthGate} from './auth-gate';
import {Header,Notice,message,useAction} from './ui';
import {Dashboard} from './dashboard';
import './style.css';

type Page = 'overview'|'assign'|'mine'|'review'|'reports'|'users';
const menus:Record<Page,string> = {overview:'Dashboard',assign:'Giao nhiệm vụ',mine:'Nhiệm vụ của tôi',review:'Kiểm tra, nghiệm thu',reports:'Báo cáo',users:'Quản trị cán bộ'};
const blankProposal:Proposal={title:'',detail:'',lead:'',partners:'',deadline:'',deliverable:'',excerpt:''};
const dateTime = new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'});
const dateLabel = (day:string)=>day.split('-').reverse().join('/');
function Workspace({profile,onLogout,logoutError}:{profile:Profile;onLogout:()=>void;logoutError:string}) {
 const [page,setPage]=useState<Page>('overview'),[tasks,setTasks]=useState<Task[]>([]),[users,setUsers]=useState<Profile[]>([]);
 const [error,setError]=useState(''),[selected,setSelected]=useState('');
 const [loaded,setLoaded]=useState(false);
 const admin=profile.role==='ADMIN', reviewer=profile.role!=='SPECIALIST';
 useEffect(()=>{
  setLoaded(false);
  return watchTasks(profile,t=>{setTasks(t);setLoaded(true);},e=>{setError(message(e));setLoaded(true);});
 },[profile]);
 useEffect(()=>admin?watchUsers(setUsers,e=>setError(message(e))):undefined,[admin]);
 const displayed = (Object.keys(menus) as Page[]).filter(p=>!['assign','users'].includes(p)||admin)
  .filter(p=>p!=='review'||reviewer);
 const current=tasks.find(t=>t.id===selected);
 const own=tasks.filter(t=>t.assignees.includes(profile.uid));
 const review=tasks.filter(t=>t.status==='SUBMITTED'&&(admin||t.delegateUid===profile.uid&&(t.delegateUntil?.toMillis()??0)>Date.now()));
 const nameOf=(uid:string)=>users.find(u=>u.uid===uid)?.name??(uid===profile.uid?profile.name:'');
 function navigate(next:Page) {setSelected('');setPage(next);}
 return <><Header><span>{profile.name} · {roles[profile.role]}</span><button onClick={onLogout}>Đăng xuất</button></Header>
  <nav aria-label="Chức năng">{displayed.map(p=><button key={p} aria-current={p===page?'page':undefined} onClick={()=>navigate(p)}>{menus[p]}</button>)}</nav>
  <main><h2>{menus[page]}</h2><Notice text={error||logoutError}/>
   {!loaded&&<p role="status">Đang tải nhiệm vụ…</p>}
   {current?<TaskDetail key={current.id} task={current} profile={profile} users={users} nameOf={nameOf} close={()=>setSelected('')}/>:
    page==='assign'&&admin?<Assignment users={users} profile={profile}/>:
    page==='users'&&admin?<Directory users={users}/>:
    page==='reports'?<Reports tasks={tasks} users={admin?users:[profile]} admin={admin}/>:
    page==='overview'?<Dashboard tasks={tasks} users={users} profile={profile} onSelect={setSelected}/>:
    <TaskList tasks={page==='mine'?own:page==='review'?review:tasks} users={users} select={setSelected} summary={false}/>}
  </main></>;
}
function Totals({tasks}:{tasks:Task[]}) {
 const complete=tasks.filter(task=>task.status==='COMPLETE').length;
 return <dl className="totals">{[
  ['Hoàn thành',complete],['Chưa hoàn thành',tasks.length-complete],
  ['Quá hạn',tasks.filter(t=>isLate(t)).length],['Chờ duyệt',tasks.filter(t=>t.status==='SUBMITTED').length]
 ].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>;
}
function TaskList({tasks,users,select,summary}:{tasks:Task[];users:Profile[];select:(id:string)=>void;summary:boolean}) {
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('');
 const visible=tasks.filter(t=>(!filter||(filter==='LATE'?isLate(t):t.status===filter))
   &&(t.id+' '+t.title).toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi')));
 return <>{summary&&<Totals tasks={tasks}/>}<section className="panel">
  <div className="fields"><label>Tìm theo tên hoặc mã<input type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <label>Trạng thái<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Tất cả</option><option value="LATE">Quá hạn</option>
    {Object.entries(statuses).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label></div>
  {!visible.length?<p className="muted">Chưa có nhiệm vụ phù hợp.</p>:<div className="table-wrap"><table>
   <thead><tr><th>Nhiệm vụ</th>{Boolean(users.length)&&<th>Chủ trì</th>}<th>Thời hạn</th><th>Trạng thái</th><th>Tiến độ</th></tr></thead>
   <tbody>{visible.map(t=><tr key={t.id}><td><button className="link" onClick={()=>select(t.id)}>{t.title}</button><small>{t.id}</small></td>
    {Boolean(users.length)&&<td>{users.find(u=>u.uid===t.leadUid)?.name??'—'}</td>}
    <td>{dateLabel(t.deadline)}{isLate(t)&&<small className="late">Quá hạn</small>}</td><td>{statuses[t.status]}</td><td>{t.progress}%</td></tr>)}</tbody>
  </table></div>}
 </section></>;
}
function Assignment({users,profile}:{users:Profile[];profile:Profile}) {
 const [analysis,setAnalysis]=useState<Analysis>({source:{number:'',subject:''},documentDate:'',proposals:[]});
 const [draft,setDraft]=useState<Proposal>(blankProposal),[selected,setSelected]=useState<number[]>([]);
 const [activeIndex,setActiveIndex]=useState<number|null>(null);
 const [lead,setLead]=useState(''),[partners,setPartners]=useState<string[]>([]);
 const [done,setDone]=useState(''),[associate,setAssociate]=useState(false);
 const [fileInfo,setFileInfo]=useState('');
 const action=useAction();
 const members=users.filter(u=>u.active);
 function updateDraft(field:keyof Proposal,value:string) {setDraft(d=>({...d,[field]:value}));}
 function useProposal(p:Proposal,index:number) {setDraft(p);setActiveIndex(index);setLead('');setPartners([]);setAssociate(true);}
 function removeSelected() {
  setAnalysis(a=>({...a,proposals:a.proposals.filter((_,index)=>!selected.includes(index))}));
  if(activeIndex!==null && selected.includes(activeIndex)) {
   setActiveIndex(null);setDraft(blankProposal);setLead('');setPartners([]);setAssociate(false);
  } else if(activeIndex!==null) {
   setActiveIndex(activeIndex-selected.filter(index=>index<activeIndex).length);
  }
  setSelected([]);
 }
 function mergeSelected() {
  const items=analysis.proposals.filter((_,i)=>selected.includes(i));
  if (items.length<2) return;
  const combined={...items[0],detail:items.map(p=>p.detail).join('\n'),excerpt:items.map(p=>p.excerpt).join('\n\n')};
  const proposals=analysis.proposals.filter((_,i)=>!selected.includes(i));
  proposals.push(combined);
  setAnalysis(a=>({...a,proposals}));setSelected([]);useProposal(combined,proposals.length-1);
 }
 function splitDraft() {
  const lines=draft.detail.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  if(lines.length<2) return;
  const proposals=analysis.proposals.filter((_,i)=>i!==activeIndex);
  proposals.push(...lines.map(line=>({...draft,title:line.slice(0,180),detail:line})));
  setAnalysis(a=>({...a,proposals}));setSelected([]);useProposal(proposals[proposals.length-lines.length],proposals.length-lines.length);
 }
 function submit(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();setDone('');
  void action.run(async()=>{
   if (![draft.title,draft.detail,draft.deliverable].every(value=>value.trim())) throw Error('Điền tiêu đề, nội dung và sản phẩm.');
   const assignees=[lead,...partners.filter(uid=>uid!==lead)];
   const id=await createTask({title:draft.title.trim(),detail:draft.detail.trim(),deadline:draft.deadline,
    deliverable:draft.deliverable.trim(),leadUid:lead,assignees},profile.uid,associate?analysis.source:undefined);
   if(activeIndex!==null) setAnalysis(a=>({...a,proposals:a.proposals.filter((_,i)=>i!==activeIndex)}));
   setDraft(blankProposal);setActiveIndex(null);setLead('');setPartners([]);setSelected([]);setAssociate(false);setDone('Đã duyệt và giao '+id+'.');
  });
 }
 return <div className="columns"><section className="panel"><h3>Đọc văn bản</h3>
  <label>Tệp DOCX hoặc PDF (hỗ trợ OCR trang đầu khi thiếu dữ liệu)<input type="file" accept=".docx,.pdf" disabled={action.busy} onChange={e=>{
   const file=e.currentTarget.files?.[0];e.currentTarget.value='';
   if(file) void action.run(async()=>{
    setFileInfo(file.name);
    setDone('Đang đọc nội dung tệp...');
    const extracted=await readDocument(file,(label)=>setDone(label));
    const result=await ruleAnalyzer.analyze(extracted.text);
    let conflictNotice='';
    const scanNumberOnly=Boolean(extracted.ocrHeader?.number && !result.source.number);
    if(scanNumberOnly) conflictNotice='Số, ký hiệu do OCR đọc từ ảnh, CHƯA XÁC MINH. Các chữ số in mờ có thể bị nhầm (ví dụ 31 thành 34); bắt buộc đối chiếu trực tiếp trang đầu trước khi giao nhiệm vụ.';
    if(extracted.ocrHeader) {
      const merged=reconcileHeaders({...result.source,documentDate:result.documentDate},extracted.ocrHeader);
      result.source.number=merged.number;
      result.source.subject=merged.subject;
      result.documentDate=merged.documentDate;
      if(merged.conflicts.length) conflictNotice='PDF và OCR cho kết quả khác nhau ở: '+merged.conflicts.join(', ')+'. Vui lòng đối chiếu bản gốc.';
    }
    setAnalysis(result);setSelected([]);setActiveIndex(null);setDraft(blankProposal);setLead('');setPartners([]);setAssociate(true);
    setDone([extracted.notice,conflictNotice,!result.proposals.length?'Chưa nhận diện được nhiệm vụ từ nội dung tệp. Hãy kiểm tra và nhập thủ công nếu cần.':''].filter(Boolean).join(' '));
   });
  }}/><small>Tệp vừa đọc: {fileInfo||"Chưa chọn tệp"}</small></label>
  <div className="fields"><label>Số, ký hiệu<input maxLength={120} value={analysis.source.number} onChange={e=>setAnalysis(a=>({...a,source:{...a.source,number:e.target.value}}))}/></label>
  <label>Ngày ban hành<input type="date" value={analysis.documentDate} onChange={e=>setAnalysis(a=>({...a,documentDate:e.target.value}))}/></label>
  <label>Trích yếu<textarea rows={4} maxLength={600} value={analysis.source.subject} onChange={e=>setAnalysis(a=>({...a,source:{...a.source,subject:e.target.value}}))}/></label></div>
  <p className="muted">Số, ngày ban hành và trích yếu là thông tin gợi ý, cần kiểm tra với văn bản gốc trước khi giao việc. Ngày ban hành chưa được lưu trong Firestore.</p>
  {!analysis.documentDate&&analysis.source.number&&<p role="status" className="info">Chưa đọc được ngày ban hành. Tệp PDF có thể bị thiếu chữ số ngày trong lớp văn bản hoặc ngày được chèn dưới dạng ảnh. Hãy xem trang đầu và nhập ngày thủ công; không lấy ngày từ nội dung, số hiệu hay tên tệp.</p>}
  {!analysis.source.number&&analysis.source.subject&&<p role="status" className="info">Chưa xác định được số, ký hiệu từ tệp. Vui lòng đối chiếu trang đầu văn bản.</p>}
  <ul className="proposals">{analysis.proposals.map((p,i)=><li key={i}>
   <input type="checkbox" aria-label={'Chọn đề xuất '+(i+1)} checked={selected.includes(i)} onChange={e=>setSelected(x=>e.target.checked?[...x,i]:x.filter(n=>n!==i))}/>
   <button type="button" className="link" onClick={()=>useProposal(p,i)}>{p.title}</button>
  </li>)}</ul>
  <div className="buttons"><button disabled={selected.length<2} onClick={mergeSelected}>Gộp đề xuất</button>
   <button disabled={!selected.length} onClick={removeSelected}>Loại bỏ đề xuất</button>
   <button onClick={()=>{const proposals=[...analysis.proposals,{...blankProposal,title:'Đề xuất mới'}];setAnalysis(a=>({...a,proposals}));useProposal(proposals.at(-1)!,proposals.length-1);}}>Thêm đề xuất</button></div>
 </section><section className="panel"><h3>Thông tin giao nhiệm vụ</h3>
  <Notice text={action.error}/>{done&&<p role="status" className="info">{done}</p>}
  <form onSubmit={submit}>
   {draft.excerpt&&<details open><summary>Đoạn văn bản nguồn</summary><blockquote>{draft.excerpt}</blockquote>
    <p>Chủ trì gợi ý: {draft.lead||'—'} · Phối hợp gợi ý: {draft.partners||'—'}</p></details>}
   <label>Tên nhiệm vụ<input required maxLength={240} value={draft.title} onChange={e=>updateDraft('title',e.target.value)}/></label>
   <label>Nội dung<textarea required maxLength={8000} rows={5} value={draft.detail} onChange={e=>updateDraft('detail',e.target.value)}/></label>
   <button type="button" disabled={draft.detail.split(/\n+/).filter(x=>x.trim()).length<2} onClick={splitDraft}>Tách theo dòng nội dung</button>
   {activeIndex!==null&&<button type="button" onClick={()=>setAnalysis(a=>({...a,proposals:a.proposals.map((p,i)=>i===activeIndex?draft:p)}))}>Lưu chỉnh sửa đề xuất</button>}
   <div className="fields"><label>Chủ trì<select required value={lead} onChange={e=>setLead(e.target.value)}><option value="">Chọn cán bộ</option>{members.map(u=><option key={u.uid} value={u.uid}>{u.code} · {u.name}</option>)}</select></label>
   <label>Thời hạn<input required type="date" value={draft.deadline} onChange={e=>updateDraft('deadline',e.target.value)}/></label></div>
   <fieldset><legend>Phối hợp</legend>{members.filter(u=>u.uid!==lead).map(u=><label className="check" key={u.uid}><input type="checkbox" checked={partners.includes(u.uid)} onChange={e=>setPartners(x=>e.target.checked?[...x,u.uid]:x.filter(v=>v!==u.uid))}/>{u.name}</label>)}</fieldset>
   <label>Sản phẩm yêu cầu<textarea required maxLength={1000} value={draft.deliverable} onChange={e=>updateDraft('deliverable',e.target.value)}/></label>
   <label className="check"><input type="checkbox" checked={associate} onChange={e=>setAssociate(e.target.checked)}/>Lưu số, ký hiệu và trích yếu văn bản nguồn</label>
   <button className="primary" disabled={action.busy}>Duyệt và giao nhiệm vụ</button>
  </form></section></div>;
}
function TaskDetail({task,profile,users,nameOf,close}:{task:Task;profile:Profile;users:Profile[];nameOf:(uid:string)=>string;close:()=>void}) {
 const [events,setEvents]=useState<Event[]>([]),[historyError,setHistoryError]=useState('');
 const [text,setText]=useState(''),[stage,setStage]=useState(task.stage),[progress,setProgress]=useState(task.progress);
 const [editVersion,setEditVersion]=useState<string|null>(null);
 const [deadline,setDeadline]=useState(task.deadline),[delegateUid,setDelegateUid]=useState(task.delegateUid);
 const [until,setUntil]=useState(()=>task.delegateUntil?new Date(task.delegateUntil.toMillis()+7*3600000).toISOString().slice(0,16):'');
 const action=useAction();
 useEffect(()=>watchHistory(task.id,setEvents,e=>setHistoryError(message(e))),[task.id]);
 useEffect(()=>{
  if(editVersion!==null) return;
  setStage(task.stage);setProgress(task.progress);setDeadline(task.deadline);setDelegateUid(task.delegateUid);
  setUntil(task.delegateUntil?new Date(task.delegateUntil.toMillis()+7*3600000).toISOString().slice(0,16):'');
 },[task,editVersion]);
 const stale=editVersion!==null&&editVersion!==task.lastEvent;
 function startEditing(){setEditVersion(version=>version??task.lastEvent);}
 function confirmVersion(){if(stale) throw Error('Nhiệm vụ vừa thay đổi. Hãy nạp lại thông tin.');}
 const worker=task.assignees.includes(profile.uid);
 const canWork=worker&&['WORKING','REVISION'].includes(task.status);
 const admin=profile.role==='ADMIN';
 const canReviewStatus=task.status==='SUBMITTED'&&(admin||(profile.role==='DEPUTY'&&task.delegateUid===profile.uid&&(task.delegateUntil?.toMillis()??0)>Date.now()));
 const latestResult=events.find(event=>event.id===task.lastResult && event.kind==='SUBMIT');
 const ownSubmission=Boolean(!admin&&latestResult?.author===profile.uid);
 const canReview=canReviewStatus&&Boolean(latestResult)&&!ownSubmission;
 function send(kind:Action) {
  void action.run(async()=>{
   confirmVersion();
   const note=kind==='ACCEPT'?'Đã tiếp nhận nhiệm vụ.':text.trim();
   if(!note) throw Error('Nhập nội dung cập nhật, kết quả hoặc ý kiến nghiệm thu.');
   if(!Number.isInteger(progress)||progress<0||progress>100) throw Error('Tiến độ phải là số nguyên từ 0 đến 100.');
   await changeTask(task,profile.uid,kind,note,stage,progress);
   setText('');setEditVersion(null);
  });
 }
 return <section className="panel"><button className="link" onClick={close}>← Danh sách</button>
  <h3>{task.title}</h3><p className="muted">{task.id} · {statuses[task.status]} · {stages[task.stage]} · {task.progress}%</p>
  <p className="preserve">{task.detail}</p><p><strong>Sản phẩm:</strong> {task.deliverable}</p><p><strong>Thời hạn:</strong> {dateLabel(task.deadline)} {isLate(task)&&<span className="late">Quá hạn</span>}</p>
  {nameOf(task.leadUid)&&<p><strong>Chủ trì:</strong> {nameOf(task.leadUid)}</p>}
  {admin&&task.assignees.length>1&&<p><strong>Phối hợp:</strong> {task.assignees.slice(1).map(nameOf).filter(Boolean).join(', ')}</p>}
  <Notice text={action.error||historyError}/>
  {canReviewStatus&&ownSubmission&&<p className="info">Người được ủy quyền không nghiệm thu kết quả do chính mình nộp.</p>}
  {stale&&<p className="info">Nhiệm vụ vừa thay đổi. <button onClick={()=>{setText('');setEditVersion(null);}}>Nạp lại thông tin</button></p>}
  {worker&&task.status==='ASSIGNED'&&<button className="primary" disabled={action.busy} onClick={()=>send('ACCEPT')}>Tiếp nhận</button>}
  {(canWork||canReview)&&<div className="action-box">
   {canWork&&<div className="fields"><label>Giai đoạn<select value={stage} disabled={action.busy} onChange={e=>{startEditing();setStage(e.target.value as Stage);}}>{Object.entries(stages).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
    <label>Tiến độ (%)<input type="number" min={0} max={100} value={progress} disabled={action.busy} onChange={e=>{startEditing();setProgress(Number(e.target.value));}}/></label></div>}
   <label>{canReview?'Ý kiến nghiệm thu':'Tiến độ hoặc kết quả (mô tả / đường dẫn)' }<textarea maxLength={8000} rows={4} value={text} disabled={action.busy} onChange={e=>{startEditing();setText(e.target.value);}}/></label>
   <div className="buttons">{(canReview?['APPROVE','RETURN']:['PROGRESS','SUBMIT']).map(kind=><button type="button" className={kind==='APPROVE'||kind==='SUBMIT'?'primary':''} disabled={action.busy||stale} key={kind} onClick={()=>send(kind as Action)}>{actions[kind as Action]}</button>)}</div>
  </div>}
  {admin&&task.status!=='COMPLETE'&&<details><summary>Thời hạn và ủy quyền nghiệm thu</summary>
   <form onSubmit={e=>{e.preventDefault();void action.run(async()=>{
    confirmVersion();
    const expiration=delegateUid?Timestamp.fromDate(new Date(until+'+07:00')):null;
    const audit='Thời hạn: '+task.deadline+' → '+deadline+'. '+(delegateUid?'Ủy quyền: '+nameOf(delegateUid)+' đến '+until.replace('T',' ')+' (giờ Việt Nam).':'Không ủy quyền.');
    await changeTask(task,profile.uid,'ADMIN_SETTINGS',audit,task.stage,task.progress,{deadline,delegateUid,delegateUntil:expiration});
    setEditVersion(null);
   });}}>
    <div className="fields"><label>Thời hạn<input required type="date" value={deadline} disabled={action.busy} onChange={e=>{startEditing();setDeadline(e.target.value);}}/></label>
    <label>Người được ủy quyền<select value={delegateUid} disabled={action.busy} onChange={e=>{startEditing();setDelegateUid(e.target.value);}}><option value="">Không ủy quyền</option>{users.filter(u=>u.active&&u.role==='DEPUTY').map(u=><option key={u.uid} value={u.uid}>{u.name}</option>)}</select></label></div>
    {delegateUid&&<label>Hết hạn ủy quyền (giờ Việt Nam)<input required type="datetime-local" value={until} disabled={action.busy} onChange={e=>{startEditing();setUntil(e.target.value);}}/></label>}
    <button disabled={action.busy||stale}>Lưu thiết lập</button>
   </form></details>}
  <h3>Lịch sử nhiệm vụ</h3>
  <ol className="history">{events.map(event=><li key={event.id}><strong>{actions[event.kind]}</strong>
   <small>{event.at?dateTime.format(event.at.toMillis()):'Đang lưu'} {nameOf(event.author)}</small><p className="preserve">{event.text}</p>
   <small>{stages[event.stage]} · {event.progress}%</small></li>)}
   <li><strong>Giao nhiệm vụ</strong><small>{task.createdAt?dateTime.format(task.createdAt.toMillis()):'Đang lưu'} {nameOf(task.createdBy)}</small></li>
  </ol>
 </section>;
}
function Reports({tasks,users,admin}:{tasks:Task[];users:Profile[];admin:boolean}) {
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[person,setPerson]=useState('');
 const period=tasks.filter(t=>(!from||t.deadline>=from)&&(!to||t.deadline<=to));
 const filtered=person?period.filter(t=>t.assignees.includes(person)):period;
 return <section className="panel"><div className="fields">
  <label>Thời hạn từ ngày<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
  <label>Thời hạn đến ngày<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  {admin&&<label>Cán bộ<select value={person} onChange={e=>setPerson(e.target.value)}><option value="">Tất cả</option>{users.map(u=><option key={u.uid} value={u.uid}>{u.name}</option>)}</select></label>}</div>
  <Totals tasks={filtered}/>
  {admin&&<div className="table-wrap"><table><thead><tr><th>Cán bộ</th><th>Hoàn thành</th><th>Chưa hoàn thành</th><th>Quá hạn</th><th>Chờ duyệt</th></tr></thead><tbody>
   {users.filter(u=>!person||person===u.uid).map(u=>{
    const list=period.filter(t=>t.assignees.includes(u.uid));
    const complete=list.filter(t=>t.status==='COMPLETE').length;
    return <tr key={u.uid}><th>{u.name}</th><td>{complete}</td><td>{list.length-complete}</td><td>{list.filter(t=>isLate(t)).length}</td><td>{list.filter(t=>t.status==='SUBMITTED').length}</td></tr>;
   })}
  </tbody></table></div>}
 </section>;
}
const codes=['VP02','VP03','VP04','VP05'];
function Directory({users}:{users:Profile[]}) {
 const [uid,setUid]=useState(''),[code,setCode]=useState('VP02'),[name,setName]=useState(''),[email,setEmail]=useState(''),[phone,setPhone]=useState('');
 const [editing,setEditing]=useState<Profile|null>(null);
 const action=useAction();
 function submit(e:FormEvent) {
  e.preventDefault();void action.run(async()=>{
   if (editing) {
    await editUser(editing.uid,{name:editing.name.trim(),phone:editing.phone.trim(),active:editing.active});
    setEditing(null);return;
   }
   if(/[\/\s]/.test(uid.trim())||!uid.trim()) throw Error('UID không hợp lệ.');
   if(users.some(u=>u.uid===uid.trim()||u.code===code)) throw Error('UID hoặc mã cán bộ đã được sử dụng.');
   const role:Role=code==='VP02'?'DEPUTY':'SPECIALIST';
   await addUser({uid:uid.trim(),code,name:name.trim(),email:email.trim(),phone:phone.trim(),active:true,role});
   setUid('');setEmail('');setName('');setPhone('');
  });
 }
 return <div className="columns"><section className="panel"><h3>Danh mục</h3>
  <div className="table-wrap"><table><thead><tr><th>Cán bộ</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>{users.map(u=><tr key={u.uid}>
   <td>{u.role==='ADMIN'?u.name:<button className="link" onClick={()=>setEditing(u)}>{u.name}</button>}<small>{u.code}</small></td><td>{roles[u.role]}</td><td>{u.active?'Hoạt động':'Đã khóa'}</td>
  </tr>)}</tbody></table></div></section>
 <section className="panel"><h3>{editing?'Chỉnh sửa cán bộ':'Cấp quyền cho cán bộ'}</h3><Notice text={action.error}/>
  {!editing&&<p className="muted">Lấy UID và email Google đã xác minh từ Firebase Authentication.</p>}
  <form onSubmit={submit}>{editing?<>
   <label>Họ tên<input required maxLength={120} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label>
   <label>Số điện thoại<input type="tel" maxLength={30} value={editing.phone} onChange={e=>setEditing({...editing,phone:e.target.value})}/></label>
   <label className="check"><input type="checkbox" checked={editing.active} onChange={e=>setEditing({...editing,active:e.target.checked})}/>Đang hoạt động</label>
   <button type="button" onClick={()=>setEditing(null)}>Bỏ qua</button>
  </>:<>
   <label>Mã cán bộ<select value={code} onChange={e=>setCode(e.target.value)}>{codes.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>UID<input required maxLength={128} value={uid} onChange={e=>setUid(e.target.value)}/></label>
   <label>Email Google<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label>Họ tên<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label>
   <label>Số điện thoại<input type="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)}/></label>
  </>}<button className="primary" disabled={action.busy}>Lưu cán bộ</button></form>
 </section></div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><AuthGate renderWorkspace={session=><Workspace key={session.profile.uid} {...session}/>}/></StrictMode>);
