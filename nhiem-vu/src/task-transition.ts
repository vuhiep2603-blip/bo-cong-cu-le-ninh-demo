import {collection,doc,getDocFromServer,runTransaction,serverTimestamp} from 'firebase/firestore';
import type {DocumentData,Firestore,Timestamp} from 'firebase/firestore';
import type {Action,Stage,Task} from './model';

const requiredStatus:Record<Action,Task['status'][]> = {
  ACCEPT:['ASSIGNED'],PROGRESS:['WORKING','REVISION'],SUBMIT:['WORKING','REVISION'],
  APPROVE:['SUBMITTED'],RETURN:['SUBMITTED'],ADMIN_SETTINGS:['ASSIGNED','WORKING','SUBMITTED','REVISION'],
  ARCHIVE:['ASSIGNED','WORKING','SUBMITTED','REVISION','COMPLETE'],RESTORE:['ASSIGNED','WORKING','SUBMITTED','REVISION','COMPLETE']
};
export interface Settings {deadline:string;delegateUid:string;delegateUntil:Timestamp|null}
export async function transitionTask(db:Firestore, task:Task, author:string, action:Action, text:string, stage:Stage, progress:number, settings?:Settings) {
  const group = action==='SUBMIT' ? 'results' : ['APPROVE','RETURN'].includes(action) ? 'reviews' : 'updates';
  const target = doc(db,'tasks',task.id);
  const log = collection(target,group);
  const event = doc(log,group+'_'+doc(log).id);
  const stale = () => Error('Nhiệm vụ vừa được cập nhật. Hãy kiểm tra phiên bản mới trước khi gửi lại.');
  await runTransaction(db,async tx=>{
    const current = (await tx.get(target)).data() as Task|undefined;
    if (!current || current.lastEvent!==task.lastEvent || !requiredStatus[action].includes(current.status)) {
      throw stale();
    }
    if ((action==='ARCHIVE' && current.archived===true)
      || (action==='RESTORE' && current.archived!==true)
      || (!['ARCHIVE','RESTORE'].includes(action) && current.archived===true)) throw stale();
    const at = serverTimestamp();
    const patch:DocumentData = {lastEvent:event.id,updatedAt:at};
    if (action==='ACCEPT') patch.status='WORKING';
    if (action==='PROGRESS' || action==='SUBMIT') Object.assign(patch,{stage,progress});
    if (action==='SUBMIT') Object.assign(patch,{status:'SUBMITTED',lastResult:event.id});
    if (action==='APPROVE') Object.assign(patch,{status:'COMPLETE',progress:100});
    if (action==='RETURN') patch.status='REVISION';
    if (action==='ADMIN_SETTINGS') Object.assign(patch,settings);
    if (action==='ARCHIVE') Object.assign(patch,{archived:true,archivedAt:at,archivedBy:author});
    if (action==='RESTORE') Object.assign(patch,{archived:false,archivedAt:null,archivedBy:''});
    tx.set(event,{
      author,at,kind:action,text,stage:patch.stage??current.stage,progress:patch.progress??current.progress,
      previousEvent:current.lastEvent,resultId:group==='reviews'?current.lastResult:''
    });
    tx.update(target,patch);
  }).catch(async error=>{
    // Rules can deny a stale journal link before Firestore reports a transaction conflict.
    if (error?.code==='permission-denied') {
      const latest = (await getDocFromServer(target).catch(()=>null))?.data();
      if (latest && latest.lastEvent!==task.lastEvent) throw stale();
    }
    throw error;
  });
}
