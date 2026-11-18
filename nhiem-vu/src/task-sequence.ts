import {doc,getDocFromServer,runTransaction} from 'firebase/firestore';
import type {Firestore,Transaction} from 'firebase/firestore';

export async function allocateTask(db:Firestore, year:string, writeTask:(tx:Transaction,id:string)=>void) {
  const counter = doc(db,'systemSettings',year);
  for (let retry=0; retry<4; retry++) {
    let observed:number|undefined;
    try {
      return await runTransaction(db,async tx=>{
        const last:number = (await tx.get(counter)).data()?.number ?? 0;
        observed = last;
        const number = last+1;
        if (number>9999) throw Error('Đã hết mã nhiệm vụ trong năm.');
        const id = 'NV-VP-'+year+'-'+String(number).padStart(4,'0');
        tx.set(counter,{number,taskId:id});
        writeTask(tx,id);
        return id;
      });
    } catch (error) {
      // Rules can reject a stale counter before the transaction reports a conflict.
      // Retry only when a fresh read confirms another writer advanced this counter.
      if (retry===3 || observed===undefined || (error as {code?:string})?.code!=='permission-denied'
          || ((await getDocFromServer(counter)).data()?.number??0)<=observed) throw error;
    }
  }
  throw Error('Không cấp được mã nhiệm vụ.');
}
