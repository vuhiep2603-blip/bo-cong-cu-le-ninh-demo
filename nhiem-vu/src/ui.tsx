import {useState} from 'react';
import type {ReactNode} from 'react';
import logo from '../../assets/logo.png';

export const message = (error:unknown)=>error instanceof Error ? error.message : 'Thao tác chưa hoàn tất.';
export function Header({children,home = "../"}:{children?:ReactNode;home?:string|null}) {
 return <header><div className="brand">
  <img src={logo} alt="" width="54" height="54"/>
  <div><div className="org">VĂN PHÒNG ĐẢNG ỦY XÃ LỆ NINH</div><h1>Quản lý nhiệm vụ tham mưu</h1></div>
 </div><div className="header-tools">{home&&<a href={home}>Bộ công cụ</a>}{children}</div></header>;
}
export function Notice({text}:{text:string}) { return text ? <p className="error" role="alert">{text}</p> : null; }
export function useAction() {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(operation:()=>Promise<unknown>) {
  setBusy(true);setError('');
  try { await operation(); } catch(e) { setError(message(e)); } finally {setBusy(false);}
 }
 return {busy,error,run};
}
