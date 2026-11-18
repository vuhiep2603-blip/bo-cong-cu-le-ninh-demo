import {initializeApp} from 'firebase/app';
import {connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithPopup, signOut} from 'firebase/auth';
import {collection, connectFirestoreEmulator, doc, getFirestore, onSnapshot, or, query, serverTimestamp, setDoc, updateDoc, where} from 'firebase/firestore';
import {localDay} from './model';
import {allocateTask} from './task-sequence';
import {transitionTask} from './task-transition';
import type {Settings} from './task-transition';
import type {Action, Event, Profile, Source, Stage, Task, TaskInput} from './model';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const app = Object.values(config).every(Boolean) ? initializeApp(config) : null;
export const auth = app && getAuth(app);
const database = app && getFirestore(app);
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true' && auth && database && config.projectId === 'demo-vpdu') {
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  connectFirestoreEmulator(database,'127.0.0.1',8080);
}
function db() {
  if (!database) throw new Error('Firebase chưa được cấu hình.');
  return database;
}
export async function login() {
  if (!auth) throw new Error('Firebase chưa được cấu hình.');
  await signInWithPopup(auth, new GoogleAuthProvider());
}
export async function logout() {
  if (auth) await signOut(auth);
}
export function watchProfile(uid:string, next:(p:Profile|null)=>void, error:(e:Error)=>void) {
  return onSnapshot(doc(db(),'users',uid), snap=>next(snap.exists()?{uid,...snap.data()} as Profile:null), error);
}
export function watchUsers(next:(p:Profile[])=>void, error:(e:Error)=>void) {
  return onSnapshot(collection(db(),'users'), snap=>next(snap.docs.map(d=>({uid:d.id,...d.data()}) as Profile)), error);
}
export function watchTasks(profile:Profile, next:(t:Task[])=>void, error:(e:Error)=>void) {
  const all = collection(db(),'tasks');
  const assigned = where('assignees','array-contains',profile.uid);
  const visible = profile.role==='DEPUTY' ? query(all,or(assigned,where('delegateUid','==',profile.uid))) : query(all,assigned);
  return onSnapshot(profile.role==='ADMIN' ? all : visible, snap=>next(
    snap.docs.map(d=>({id:d.id,...d.data()}) as Task).sort((a,b)=>a.deadline.localeCompare(b.deadline))
  ),error);
}
const groups = ['updates','results','reviews'] as const;
export function watchHistory(id:string, next:(e:Event[])=>void, error:(e:Error)=>void) {
  const list = new Map<string, Event[]>();
  const stops = groups.map(group=>onSnapshot(collection(db(),'tasks',id,group),snap=>{
    list.set(group,snap.docs.map(d=>({id:d.id,...d.data()}) as Event));
    next([...list.values()].flat().sort((a,b)=>(b.at?.toMillis()??0)-(a.at?.toMillis()??0)));
  },error));
  return ()=>stops.forEach(stop=>stop());
}
export async function createTask(input:TaskInput, author:string, source?:Source) {
  const year = localDay().slice(0,4);
  return allocateTask(db(),year,(tx,id)=>{
    const at = serverTimestamp();
    tx.set(doc(db(),'tasks',id),{
      ...input, status:'ASSIGNED', stage:'DRAFT', progress:0, createdBy:author, createdAt:at, updatedAt:at,
      delegateUid:'',delegateUntil:null,lastEvent:'',lastResult:'',sourceId:source?id:''
    });
    if (source) tx.set(doc(db(),'sourceDocuments',id),{...source,taskId:id,createdAt:at});
  });
}
export async function changeTask(task:Task, author:string, action:Action, text:string, stage:Stage, progress:number, settings?:Settings) {
  return transitionTask(db(),task,author,action,text,stage,progress,settings);
}
export async function addUser(profile:Profile) {
  const {uid,...data} = profile;
  await setDoc(doc(db(),'users',uid),data);
}
export async function editUser(uid:string, changes:Pick<Profile,'name'|'phone'|'active'>) {
  await updateDoc(doc(db(),'users',uid),changes);
}
