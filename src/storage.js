import {normalize,parseBackup} from './core.js';
// Repository path scopes data when multiple Pages sites share one origin.
const scope=location.pathname.replace(/[^/]*$/,'');
let opening,queue=Promise.resolve();
function open(){return opening??=new Promise((resolve,reject)=>{const r=indexedDB.open('le-ninh-pages-v1:'+scope,1);r.onupgradeneeded=()=>r.result.createObjectStore('weeks',{keyPath:'start'});r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result)};r.onerror=()=>{opening=null;reject(r.error)};r.onblocked=()=>{opening=null;reject(Error('Hãy đóng các tab cũ để mở dữ liệu.'))}})}
async function tx(mode,fn){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction('weeks',mode),store=t.objectStore('weeks');let request;try{request=fn(store)}catch(e){t.abort();reject(e);return}t.oncomplete=()=>resolve(request?.result);t.onerror=()=>reject(t.error||Error('Không thể lưu dữ liệu.'));t.onabort=()=>reject(t.error||Error('Giao dịch đã bị hủy.'))})}
function write(fn){const task=queue.then(fn);queue=task.catch(()=>{});return task}
export const flush=()=>queue;
export function put(raw,saved=false){const data=normalize(raw);return write(async()=>{const old=await tx('readonly',s=>s.get(data.start));const record={start:data.start,data,updated_at:new Date().toISOString(),saved:saved||old?.saved===true};await tx('readwrite',s=>s.put(record));return record})}
export async function get(start){await queue;return tx('readonly',s=>s.get(start))}
export async function all(){await queue;return (await tx('readonly',s=>s.getAll())).sort((a,b)=>b.start.localeCompare(a.start))}
export const remove=start=>write(()=>tx('readwrite',s=>s.delete(start)));
export async function backup(){return {format:'le-ninh-local-backup',version:1,created_at:new Date().toISOString(),weeks:await all()}}
export function restore(raw){const records=parseBackup(raw);return write(()=>tx('readwrite',s=>{for(const record of records)s.put(record)})).then(()=>records.length)}
