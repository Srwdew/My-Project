import PageSkeleton from './PageSkeleton';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, useSessionKey } from '../auth';
import { apiFetch } from '../api';
import '../pages/Login.css';
export default function ProtectedRoute({ children, setupPage=false }: { children: ReactNode; setupPage?:boolean }) {
  const session = useSessionKey();
  return session ? <SetupGate key={session} session={session} setupPage={setupPage}>{children}</SetupGate> : <Navigate to="/login" replace />;
}

function SetupGate({session,setupPage,children}:{session:string;setupPage:boolean;children:ReactNode}) {
  const {pathname}=useLocation();
  const [state,setState]=useState<{path:string;role:string;required:boolean}|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setState(null);setError(false);
    void(async()=>{try{
      const response=await apiFetch('/auth/me',{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw Error();
      const user=await response.json();
      if(!['USER','ADMIN'].includes(user.role)||typeof user.showSetup!=='boolean')throw Error();
      if(!controller.signal.aborted&&getToken()===session)setState({path:pathname,role:user.role,required:user.showSetup});
    }catch{if(!controller.signal.aborted&&getToken()===session)setError(true);}})();
    return()=>controller.abort();
  },[session,pathname,retry]);
  if((!state||state.path!==pathname)&&!error)return <PageSkeleton />;
  if(!state||state.path!==pathname)return <main className="login-page"><section className="login-card">
    {error?<div role="alert"><p>ตรวจสอบสถานะบัญชีไม่สำเร็จ</p><button onClick={()=>setRetry(n=>n+1)}>ลองใหม่</button></div>:<p role="status">กำลังตรวจสอบบัญชี…</p>}
  </section></main>;
  if(setupPage&&state.role==='ADMIN')return <Navigate to="/admin" replace/>;
  if(state.required&&!setupPage)return <Navigate to="/setup" replace/>;
  if(setupPage&&!state.required)return <Navigate to="/overview" replace/>;
  return children;
}
