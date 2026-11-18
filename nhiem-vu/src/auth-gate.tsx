import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import {onAuthStateChanged} from 'firebase/auth';
import {auth,login,logout,watchProfile} from './backend';
import type {Profile} from './model';
import {Header,Notice,message,useAction} from './ui';

export interface AuthorizedSession {
 profile: Profile;
 onLogout: () => void;
 logoutError: string;
}
export function AuthGate({renderWorkspace}:{renderWorkspace?:(session:AuthorizedSession)=>ReactNode}) {
 const [uid,setUid]=useState<string|null|undefined>(auth?undefined:null);
 const [profile,setProfile]=useState<Profile|null|undefined>();
 const [error,setError]=useState('');
 const action=useAction();
 useEffect(()=>auth ? onAuthStateChanged(auth,user=>setUid(user?.uid??null),e=>setError(message(e))) : undefined,[]);
 useEffect(()=>{
  setProfile(undefined);setError('');
  if (uid) return watchProfile(uid,setProfile,()=>{
   setProfile(null);
   setError('Không đọc được hồ sơ cán bộ. Tài khoản có thể chưa được cấp quyền hoặc hệ thống chưa mở quyền truy cập.');
  });
 },[uid]);
 const authorizedProfile = uid && profile?.uid===uid && profile.active ? profile : null;
 if (authorizedProfile && renderWorkspace) {
  return renderWorkspace({profile:authorizedProfile,onLogout:()=>void action.run(logout),logoutError:action.error});
 }
 const waiting = uid===undefined || (uid && profile===undefined);
 return <><Header home={renderWorkspace ? "../" : null}>{uid&&<button onClick={()=>void action.run(logout)} disabled={action.busy}>Đăng xuất</button>}</Header>
  <main className="login"><section className="panel"><h2>{renderWorkspace?'Đăng nhập':'Nghiệm thu đăng nhập Google'}</h2>
   <p>{waiting?'Đang kiểm tra tài khoản…':authorizedProfile?'Đã xác thực. Bản kiểm thử chỉ hỗ trợ nghiệm thu đăng nhập và đăng xuất.':profile&&!profile.active?'Tài khoản đang bị khóa. Liên hệ Chánh Văn phòng.':uid?'Tài khoản chưa được cấp quyền. Liên hệ Chánh Văn phòng.':'Sử dụng tài khoản Google đã được Văn phòng cấp quyền.'}</p>
   {!auth&&<p className="info">Môi trường này chưa cấu hình Firebase. Xem README để thiết lập bản thử nghiệm.</p>}
   <Notice text={error||action.error}/>
   {!uid&&<button className="primary" disabled={!auth||action.busy||Boolean(waiting)} onClick={()=>void action.run(login)}>Đăng nhập bằng Google</button>}
  </section></main></>;
}
