import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {doc,runTransaction,Timestamp} from 'firebase/firestore';
import {staff} from './fixtures.mjs';

// Both services are fixed to the loopback demo project. No production credentials are read.
async function emulatorUid({uid,email}) {
  const token = JSON.stringify({sub:uid,email,email_verified:true});
  const query = new URLSearchParams({providerId:'google.com',id_token:token});
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo-key',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({postBody:query.toString(),requestUri:'http://127.0.0.1:4180/',returnSecureToken:true})
  });
  const {localId} = await response.json();
  if (!response.ok || !localId) throw Error('Không tạo được tài khoản giả lập trong Auth Emulator.');
  return localId;
}
const uids = await Promise.all(staff.map(emulatorUid));
const env = await initializeTestEnvironment({projectId:'demo-vpdu',firestore:{host:'127.0.0.1',port:8080}});
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const now = Timestamp.now();
    const today = new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'})
      .format(new Date()).split('/').reverse().join('-');
    const year = today.slice(0,4);
    const seed = doc(db,'systemSettings','demo-fixtures');
    const counter = doc(db,'systemSettings',year);
    await runTransaction(db,async transaction => {
      if ((await transaction.get(seed)).exists()) return;
      const sequence = (await transaction.get(counter)).data()?.number ?? 0;
      if (sequence > 9996) throw Error('Không còn đủ mã nhiệm vụ thử nghiệm trong năm.');
      for (const [index,{uid:unused,...profile}] of staff.entries()) {
        transaction.set(doc(db,'users',uids[index]),profile);
      }
      const [admin,deputy,lead,partner] = uids;
      const topics = [
        {title:'Tổng hợp lịch họp tuần tới',status:'ASSIGNED',stage:'DRAFT',progress:0},
        {title:'Chuẩn bị tài liệu hội nghị',status:'WORKING',stage:'PRESENTED',progress:55},
        {title:'Hoàn thiện báo cáo công tác tháng',status:'SUBMITTED',stage:'ISSUED',progress:90}
      ];
      for (const [index,topic] of topics.entries()) {
        const number = sequence+index+1;
        const id = 'NV-VP-'+year+'-'+String(number).padStart(4,'0');
        const pending = topic.status==='SUBMITTED';
        const result = 'results_demo';
        const task = doc(db,'tasks',id);
        transaction.set(task,{
          ...topic,detail:'Nhiệm vụ minh họa để kiểm tra giao việc và nghiệm thu.',deliverable:'Báo cáo giả lập',
          leadUid:lead,assignees:[lead,partner],deadline:index===1?year+'-01-01':today,
          createdBy:admin,createdAt:now,updatedAt:now,sourceId:'',lastEvent:pending?result:'',lastResult:pending?result:'',
          delegateUid:pending?deputy:'',delegateUntil:pending?Timestamp.fromMillis(now.toMillis()+86400000):null
        });
        if (pending) transaction.set(doc(task,'results',result),{
          author:lead,at:now,kind:'SUBMIT',text:'Đã hoàn thành báo cáo minh họa.',stage:topic.stage,progress:topic.progress,previousEvent:'',resultId:''
        });
        if (index===topics.length-1) transaction.set(counter,{number,taskId:id});
      }
      transaction.set(seed,{at:now});
    });
  });
  console.log('Danh mục và nhiệm vụ giả lập đã sẵn sàng trong demo-vpdu.');
} finally {
  await env.cleanup();
}
