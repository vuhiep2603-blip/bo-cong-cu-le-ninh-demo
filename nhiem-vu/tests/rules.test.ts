import {afterAll,beforeAll,test} from 'vitest';
import {allocateTask} from '../src/task-sequence';
import {transitionTask} from '../src/task-transition';
import type {Task} from '../src/model';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,or,query,serverTimestamp,setDoc,Timestamp,updateDoc,where,writeBatch,deleteDoc} from 'firebase/firestore';
import {staff} from './fixtures.mjs';

let env;
beforeAll(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-vpdu',firestore:{rules:await readFile('firestore.rules','utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  await Promise.all(staff.map(({uid,...data})=>setDoc(doc(ctx.firestore(),'users',uid),data)));
 });
});
afterAll(async()=>{ await env?.cleanup(); });
function db(uid,overrides={}) {
 return env.authenticatedContext(uid,{email:uid+'@example.invalid',email_verified:true,firebase:{sign_in_provider:'google.com'},...overrides}).firestore();
}
async function create(admin,year,override={},source=false) {
 return allocateTask(admin,year,(tx,id)=>{
  const at=serverTimestamp();
  tx.set(doc(admin,'tasks',id),{title:'Việc giả lập',detail:'Nội dung tiếng Việt',leadUid:'qa-lead',assignees:['qa-lead','qa-partner'],deadline:'2026-11-20',
    deliverable:'Báo cáo giả lập',status:'ASSIGNED',stage:'DRAFT',progress:0,createdAt:at,updatedAt:at,createdBy:'qa-admin',
    lastEvent:'',lastResult:'',sourceId:source?id:'',delegateUid:'',delegateUntil:null,...override});
  if(source) tx.set(doc(admin,'sourceDocuments',id),{taskId:id,number:'01/QA',subject:'Giả lập',createdAt:at});
 });
}
async function move(client,author,id,group,sequence,kind,patch,options={}) {
 const {stage='DRAFT',progress=0,text='Nội dung kiểm thử'}=options;
 const current=(await getDoc(doc(client,'tasks',id))).data();
 const previousEvent=options.previousEvent??current.lastEvent;
 const resultId=options.resultId??(group==='reviews'?current.lastResult:'');
 const batch=writeBatch(client),entry=group+'_'+sequence,at=serverTimestamp();
 batch.set(doc(client,'tasks',id,group,entry),{kind,text,author,at,stage,progress,previousEvent,resultId});
 batch.update(doc(client,'tasks',id),{updatedAt:at,lastEvent:entry,...patch,...(group==='results'?{lastResult:entry}:{})});
 return batch.commit();
}
test('allowlist with Google verified token; blocked and anonymous accounts cannot read tasks',async()=>{
 const admin=db('qa-admin');
 const id=await assertSucceeds(create(admin,'2026',{},true));
 for(const client of [env.unauthenticatedContext().firestore(),db('qa-locked'),db('unknown'),
   db('qa-admin',{email_verified:false}),db('qa-admin',{email:'other@example.invalid'}),
   db('qa-admin',{firebase:{sign_in_provider:'password'}}),db('qa-deputy')]){
  await assertFails(getDoc(doc(client,'tasks',id)));
 }
 await assertSucceeds(getDoc(doc(db('qa-locked'),'users','qa-locked')));
 await assertSucceeds(getDoc(doc(db('qa-lead'),'tasks',id)));
 await assertSucceeds(getDoc(doc(db('qa-partner'),'tasks',id)));
 await assertSucceeds(getDoc(doc(admin,'sourceDocuments',id)));
 await assertFails(getDoc(doc(db('qa-lead'),'sourceDocuments',id)));
 await assertFails(getDocs(collection(db('qa-lead'),'tasks')));
 await assertSucceeds(getDocs(query(collection(db('qa-lead'),'tasks'),where('assignees','array-contains','qa-lead'))));
 await assertFails(getDocs(collection(db('qa-lead'),'users')));
 await assertFails(updateDoc(doc(db('qa-lead'),'users','qa-lead'),{role:'ADMIN'}));
 await assertFails(updateDoc(doc(admin,'users','qa-lead'),{role:'ADMIN'}));
 await assertFails(updateDoc(doc(admin,'users','qa-lead'),{email:'changed@example.invalid'}));
 await assertSucceeds(updateDoc(doc(admin,'users','qa-lead'),{phone:'',name:'Cán bộ giả lập 03'}));
});
test('creating tasks enforces assignees, schema and atomic counter under contention',async()=>{
 const admin=db('qa-admin');
 const ids=await Promise.all([create(admin,'2027'),create(admin,'2027'),create(admin,'2027')]);
 assert.deepEqual(ids.sort(),['NV-VP-2027-0001','NV-VP-2027-0002','NV-VP-2027-0003']);
 await assertFails(create(db('qa-lead'),'2028'));
 await assertFails(create(admin,'2028',{assignees:['qa-lead','qa-locked']}));
 await assertFails(create(admin,'2028',{assignees:['qa-lead','qa-lead']}));
 await assertFails(create(admin,'2028',{status:'COMPLETE'}));
 await assertFails(create(admin,'2028',{deadline:'để sau'}));
 await assertFails(create(admin,'2028',{unexpected:true}));
 await assertFails(setDoc(doc(admin,'systemSettings','2028'),{number:1,taskId:'NV-VP-2028-0001'}));
 assert.equal(await create(admin,'2028'),'NV-VP-2028-0001');
});
test('worker updates and submissions; append-only reviews and checked delegation',async()=>{
 const admin=db('qa-admin'),lead=db('qa-lead'),deputy=db('qa-deputy'),partner=db('qa-partner');
 const id=await create(admin,'2029');
 await assertFails(move(lead,'qa-lead',id,'results','fake','SUBMIT',{status:'SUBMITTED'}));
 await assertSucceeds(move(lead,'qa-lead',id,'updates','a','ACCEPT',{status:'WORKING'}));
 await assertFails(move(lead,'qa-lead',id,'updates','b','PROGRESS',{deadline:'2027-01-01'}));
 await assertFails(move(lead,'qa-lead',id,'updates','b','PROGRESS',{leadUid:'qa-lead2'}));
 await assertFails(move(lead,'qa-lead',id,'updates','b','PROGRESS',{stage:'INVALID'},{stage:'INVALID'}));
 await assertSucceeds(move(partner,'qa-partner',id,'updates','b','PROGRESS',{stage:'PRESENTED',progress:45},{stage:'PRESENTED',progress:45}));
 await assertFails(updateDoc(doc(lead,'tasks',id,'updates','updates_b'),{text:'Đã thay lịch sử'}));
 await assertFails(deleteDoc(doc(admin,'tasks',id,'updates','updates_b')));
 await assertFails(move(lead,'qa-lead',id,'results','c','SUBMIT',{status:'SUBMITTED',stage:'ISSUED',progress:90},{stage:'ISSUED',progress:90,text:'  '}));
 await assertSucceeds(move(lead,'qa-lead',id,'results','c','SUBMIT',{status:'SUBMITTED',stage:'ISSUED',progress:90},{stage:'ISSUED',progress:90}));
 await assertFails(move(deputy,'qa-deputy',id,'reviews','d','APPROVE',{status:'COMPLETE',progress:100},{stage:'ISSUED',progress:100}));
 await assertFails(move(lead,'qa-lead',id,'reviews','d','APPROVE',{status:'COMPLETE',progress:100},{stage:'ISSUED',progress:100}));
 const expiry=Timestamp.fromMillis(Date.now()+3600000);
 await assertFails(move(admin,'qa-admin',id,'updates','del','ADMIN_SETTINGS',{delegateUid:'qa-partner',delegateUntil:expiry},{stage:'ISSUED',progress:90}));
 await assertFails(move(admin,'qa-admin',id,'updates','del','ADMIN_SETTINGS',{delegateUid:'qa-deputy',delegateUntil:Timestamp.fromMillis(0)},{stage:'ISSUED',progress:90}));
 await assertSucceeds(move(admin,'qa-admin',id,'updates','del','ADMIN_SETTINGS',{delegateUid:'qa-deputy',delegateUntil:expiry,deadline:'2026-11-30'},{stage:'ISSUED',progress:90}));
 await assertSucceeds(getDocs(query(collection(deputy,'tasks'),or(where('assignees','array-contains','qa-deputy'),where('delegateUid','==','qa-deputy')))));
 await assertSucceeds(move(deputy,'qa-deputy',id,'reviews','d','RETURN',{status:'REVISION'},{stage:'ISSUED',progress:90}));
 await assertSucceeds(move(lead,'qa-lead',id,'results','e','SUBMIT',{status:'SUBMITTED',stage:'ISSUED',progress:95},{stage:'ISSUED',progress:95}));
 await assertSucceeds(move(admin,'qa-admin',id,'reviews','f','APPROVE',{status:'COMPLETE',progress:100},{stage:'ISSUED',progress:100}));
 assert.equal((await getDoc(doc(lead,'tasks',id))).data().status,'COMPLETE');
 assert.equal((await getDocs(collection(lead,'tasks',id,'reviews'))).size,2);
});
test('review cannot approve preexisting task without a stored result; invalid extra event is rejected',async()=>{
 const admin=db('qa-admin'),lead=db('qa-lead');
 const id=await create(admin,'2030');
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(doc(ctx.firestore(),'tasks',id),{status:'SUBMITTED',lastResult:'results_missing'});
 });
 await assertFails(move(admin,'qa-admin',id,'reviews','x','APPROVE',{status:'COMPLETE',progress:100},{progress:100}));
 const another=await create(admin,'2030');
 const batch=writeBatch(lead),at=serverTimestamp();
 batch.update(doc(lead,'tasks',another),{status:'WORKING',updatedAt:at,lastEvent:'updates_a'});
 batch.set(doc(lead,'tasks',another,'updates','updates_a'),{kind:'ACCEPT',text:'Đã nhận',author:'qa-lead',at,stage:'DRAFT',progress:0,previousEvent:'',resultId:''});
 batch.set(doc(lead,'tasks',another,'reviews','updates_a'),{kind:'APPROVE',text:'Giả',author:'qa-lead',at,stage:'DRAFT',progress:0,previousEvent:'',resultId:''});
 await assertFails(batch.commit());
});

test('simultaneous edits cannot silently overwrite a newer task version',async()=>{
 const id=await create(db('qa-admin'),'2031');
 const lead=db('qa-lead'),partner=db('qa-partner');
 await move(lead,'qa-lead',id,'updates','a','ACCEPT',{status:'WORKING'});
 const snapshot=await getDoc(doc(lead,'tasks',id));
 const original={...snapshot.data(),id} as Task;
 const attempts=await Promise.allSettled([
  transitionTask(lead,original,'qa-lead','PROGRESS','Tiến độ cán bộ 03','PRESENTED',20),
  transitionTask(partner,original,'qa-partner','PROGRESS','Tiến độ cán bộ 04','PRESENTED',30)
 ]);
 assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
 assert.equal(attempts.filter(a=>a.status==='rejected' && a.reason.message.includes('vừa được cập nhật')).length,1);
 assert.equal((await getDocs(collection(lead,'tasks',id,'updates'))).size,2);
});

test('rules reject stale direct updates and reviews tied to a superseded result',async()=>{
 const admin=db('qa-admin'),lead=db('qa-lead');
 const id=await create(admin,'2032');
 await move(lead,'qa-lead',id,'updates','a','ACCEPT',{status:'WORKING'});
 await move(lead,'qa-lead',id,'updates','b','PROGRESS',{progress:35},{progress:35});
 await assertFails(move(lead,'qa-lead',id,'updates','c','PROGRESS',{progress:20},{progress:20,previousEvent:'updates_a'}));
 assert.equal((await getDoc(doc(lead,'tasks',id))).data().progress,35);
 await move(lead,'qa-lead',id,'results','a','SUBMIT',{status:'SUBMITTED',progress:80},{progress:80});
 await move(admin,'qa-admin',id,'reviews','a','RETURN',{status:'REVISION'},{progress:80});
 await move(lead,'qa-lead',id,'results','b','SUBMIT',{status:'SUBMITTED',progress:90},{progress:90});
 await assertFails(move(admin,'qa-admin',id,'reviews','b','APPROVE',{status:'COMPLETE',progress:100},{progress:100,resultId:'results_a'}));
 await move(admin,'qa-admin',id,'reviews','c','APPROVE',{status:'COMPLETE',progress:100},{progress:100});
 const review=(await getDoc(doc(admin,'tasks',id,'reviews','reviews_c'))).data();
 assert.equal(review.previousEvent,'results_b');
 assert.equal(review.resultId,'results_b');
 assert.equal((await getDocs(collection(admin,'tasks',id,'reviews'))).size,2);
});
test('expired or revoked delegation and own submissions cannot be approved by DEPUTY',async()=>{
 const admin=db('qa-admin'),deputy=db('qa-deputy'),lead=db('qa-lead');
 const id=await create(admin,'2033',{assignees:['qa-lead','qa-deputy']});
 await move(lead,'qa-lead',id,'updates','a','ACCEPT',{status:'WORKING'});
 await move(deputy,'qa-deputy',id,'results','a','SUBMIT',{status:'SUBMITTED',progress:90},{progress:90});
 const until=Timestamp.fromMillis(Date.now()+3600000);
 await move(admin,'qa-admin',id,'updates','b','ADMIN_SETTINGS',{delegateUid:'qa-deputy',delegateUntil:until},{progress:90});
 const approve=()=>move(deputy,'qa-deputy',id,'reviews','test','APPROVE',{status:'COMPLETE',progress:100},{progress:100});
 await assertFails(approve());
 await move(admin,'qa-admin',id,'reviews','a','RETURN',{status:'REVISION'},{progress:90});
 await move(lead,'qa-lead',id,'results','b','SUBMIT',{status:'SUBMITTED',progress:90},{progress:90});
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'tasks',id),{delegateUntil:Timestamp.fromMillis(0)}));
 await assertFails(approve());
 await move(admin,'qa-admin',id,'updates','c','ADMIN_SETTINGS',{delegateUid:'',delegateUntil:null},{progress:90});
 await assertFails(approve());
 await move(admin,'qa-admin',id,'reviews','b','APPROVE',{status:'COMPLETE',progress:100},{progress:100});
});
test('a role label alone and unprovisioned or locked accounts cannot grant themselves access',async()=>{
 const admin=db('qa-admin');
 for (const uid of ['unknown','qa-locked','qa-deputy','qa-lead']) {
  await assertFails(setDoc(doc(db(uid),'users',uid),{code:'VP01',role:'ADMIN',active:true,name:'Giả lập',phone:'',email:uid+'@example.invalid'}));
 }
 await assertFails(setDoc(doc(admin,'users','second-admin'),{code:'VP01',role:'ADMIN',active:true,name:'Giả lập',phone:'',email:'second-admin@example.invalid'}));
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users','wrong-code'),{code:'VP03',role:'ADMIN',active:true,name:'Giả lập',phone:'',email:'wrong-code@example.invalid'}));
 await assertFails(getDocs(collection(db('wrong-code'),'users')));
 await assertFails(create(db('wrong-code'),'2034'));
});

test('a task cannot change without its event or be reviewed against an invalid result',async()=>{
 const admin=db('qa-admin'),lead=db('qa-lead');
 const id=await create(admin,'2035');
 const task=doc(lead,'tasks',id);
 await assertFails(updateDoc(task,{status:'WORKING',updatedAt:serverTimestamp(),lastEvent:'updates_missing'}));
 await assertFails(setDoc(doc(task,'updates','updates_orphan'),{
  author:'qa-lead',at:serverTimestamp(),kind:'ACCEPT',text:'Không có giao dịch nhiệm vụ',
  stage:'DRAFT',progress:0,previousEvent:'',resultId:''
 }));
 await assertFails(move(lead,'qa-admin',id,'updates','forged','ACCEPT',{status:'WORKING'}));
 await move(lead,'qa-lead',id,'updates','a','ACCEPT',{status:'WORKING'});
 await move(lead,'qa-lead',id,'results','a','SUBMIT',{status:'SUBMITTED',progress:80},{progress:80});
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'tasks',id,'results','results_a'),{author:'qa-locked'}));
 await assertFails(move(admin,'qa-admin',id,'reviews','a','APPROVE',{status:'COMPLETE',progress:100},{progress:100}));
 assert.equal((await getDoc(task)).data().status,'SUBMITTED');
 assert.equal((await getDocs(collection(task,'reviews'))).size,0);
});
