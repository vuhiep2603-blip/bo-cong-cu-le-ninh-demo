import {collection,doc,runTransaction,serverTimestamp} from 'firebase/firestore';
import type {DocumentData,Firestore,Timestamp} from 'firebase/firestore';
import type {Action,Stage,Task} from './model';

const requiredStatus:Record<Action,Task['status'][]> = {
  ACCEPT:['ASSIGNED'],PROGRESS:['WORKING','REVISION'],SUBMIT:['WORKING','REVISION'],
  APPROVE:['SUBMITTED'],RETURN:['SUBMITTED'],ADMIN_SETTINGS:['ASSIGNED','WORKING','SUBMITTED','REVISION']
};
export interface Settings {deadline:string;delegateUid:string;delegateUntil:Timestamp|null}
export async function transitionTask(db:Firestore, task:Task, author:string, action:Action, text:string, stage:Stage, progress:number, settings?:Settings) {
  const group = action==='SUBMIT' ? 'results' : ['APPROVE','RETURN'].includes(action) ? 'reviews' : 'updates';
  const target = doc(db,'tasks',task.id);
  const log = collection(target,group);
  const event = doc(log,group+'_'+doc(log).id);
  await runTransaction(db,async tx=>{
    const current = (await tx.get(target)).data() as Task|undefined;
    if (!current || current.lastEvent!==task.lastEvent || !requiredStatus[action].includes(current.status)) {
      throw Error('Nhiệm vụ vừa được cập nhật. Hãy kiểm tra phiên bản mới trước khi gửi lại.');
    }
    const at = serverTimestamp();
    const patch:DocumentData = {lastEvent:event.id,updatedAt:at};
    if (action==='ACCEPT') patch.status='WORKING';
    if (action==='PROGRESS' || action==='SUBMIT') Object.assign(patch,{stage,progress});
    if (action==='SUBMIT') Object.assign(patch,{status:'SUBMITTED',lastResult:event.id});
    if (action==='APPROVE') Object.assign(patch,{status:'COMPLETE',progress:100});
    if (action==='RETURN') patch.status='REVISION';
    if (action==='ADMIN_SETTINGS') Object.assign(patch,settings);
    tx.set(event,{author,at,kind:action,text,stage:patch.stage??current.stage,progress:patch.progress??current.progress});
    tx.update(target,patch);
  });
}
