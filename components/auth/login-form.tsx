"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {Eye,EyeOff} from "lucide-react";
import {Button} from "../ui/button";
import {Dialog} from "../ui/dialog";
import {username} from "../../lib/domain/validation";
import {accountRequest,activationErrorMessage,loginDestination,recoveryAcceptedMessage} from "../../lib/auth/account-request";
type Feedback={kind:"error"|"success";text:string}|null;
export function LoginForm({activationError=false}:{activationError?:boolean}) {
 const [busy,setBusy]=useState(false),[showPassword,setShowPassword]=useState(false),[remember,setRemember]=useState(false);
 const [feedback,setFeedback]=useState<Feedback>(activationError?{kind:"error",text:activationErrorMessage}:null);
 const [context,setContext]=useState("staff"),[invalidName,setInvalidName]=useState(false);
 const [recoveryOpen,setRecoveryOpen]=useState(false),[recoveryName,setRecoveryName]=useState("");
 const [recoveryFeedback,setRecoveryFeedback]=useState<Feedback>(null),[recovering,setRecovering]=useState(false),[invalidRecovery,setInvalidRecovery]=useState(false);
 const lock=useRef(false),generation=useRef(0),controllers=useRef(new Set<AbortController>()),touched=useRef(false);
 // Uncontrolled username preserves autofill across unrelated React state updates.
 const nameInput=useRef<HTMLInputElement>(null),recoveryInput=useRef<HTMLInputElement>(null),recoveryTrigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const requests=controllers.current,lifetime=generation;
  try {const saved=username.safeParse(localStorage.getItem("edutara_username"));if(saved.success&&!touched.current&&nameInput.current&&!nameInput.current.value){nameInput.current.value=saved.data;setRemember(true);}}catch{/* Optional storage never blocks login. */}
  return()=>{lifetime.current++;for(const request of requests)request.abort();requests.clear();};
 },[]);
 const blocked=busy||recovering;
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(lock.current)return;
  const fields=new FormData(e.currentTarget),parsed=username.safeParse(fields.get("username"));
  if(!parsed.success){setInvalidName(true);setFeedback({kind:"error",text:parsed.error.issues[0].message});nameInput.current?.focus();return;}
  const input={username:parsed.data,password:String(fields.get("password")||""),context};
  if(!input.password||input.password.length>256){setFeedback({kind:"error",text:"Isi password akun Anda (maksimal 256 karakter)."});return;}
  lock.current=true;setBusy(true);setFeedback(null);setInvalidName(false);if(nameInput.current)nameInput.current.value=parsed.data;
  const controller=new AbortController(),seq=generation.current;controllers.current.add(controller);let navigating=false;
  try{
   const data=await accountRequest("login",input,controller);if(seq!==generation.current)return;
   const next=loginDestination(input.context);if(data.next!==next)throw Error("Respons login tidak sesuai. Muat ulang halaman sebelum mencoba kembali.");
   try{if(remember)localStorage.setItem("edutara_username",input.username);else localStorage.removeItem("edutara_username");}catch{/* Storage is optional. */}
   setFeedback({kind:"success",text:"Berhasil masuk. Membuka halaman Anda…"});navigating=true;window.location.assign(next);
  }catch(error){navigating=false;if(seq===generation.current)setFeedback({kind:"error",text:error instanceof Error?error.message:"Login belum berhasil. Coba lagi."});}
  finally{controllers.current.delete(controller);if(!navigating){lock.current=false;if(seq===generation.current)setBusy(false);}}
 }
 async function recover(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(lock.current)return;const parsed=username.safeParse(new FormData(e.currentTarget).get("username"));
  if(!parsed.success){setInvalidRecovery(true);setRecoveryFeedback({kind:"error",text:parsed.error.issues[0].message});recoveryInput.current?.focus();return;}
  lock.current=true;setRecovering(true);setRecoveryFeedback(null);setInvalidRecovery(false);setRecoveryName(parsed.data);
  const controller=new AbortController(),seq=generation.current;controllers.current.add(controller);
  try{const data=await accountRequest("recover",{username:parsed.data},controller);if(typeof data.message!=="string"||!data.message.trim())throw Error("Hasil permintaan belum dapat dipastikan. Periksa inbox dan spam sebelum mencoba kembali.");if(seq===generation.current)setRecoveryFeedback({kind:"success",text:recoveryAcceptedMessage});}
  catch(error){if(seq===generation.current)setRecoveryFeedback({kind:"error",text:error instanceof Error?error.message:"Permintaan belum berhasil. Coba lagi."});}
  finally{lock.current=false;controllers.current.delete(controller);if(seq===generation.current)setRecovering(false);}
 }
 return <>
  <form method="post" action="/api/auth/login" onSubmit={submit} className="stack login-form" aria-busy={blocked}>
   <label htmlFor="login-context">Konteks masuk<select id="login-context" name="context" disabled={blocked} value={context} onChange={e=>{setContext(e.target.value);setFeedback(null);}}><option value="staff">Admin / Guru</option><option value="supervisor">Pengawas</option><option value="student">Siswa</option></select></label>
   <label htmlFor="login-username">Username<input ref={nameInput} id="login-username" name="username" disabled={blocked} onChange={()=>{touched.current=true;setInvalidName(false);setFeedback(null);}} autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={invalidName||undefined} aria-describedby="login-feedback" required maxLength={64}/></label>
   <label htmlFor="login-password">Password<span className="password-field"><input id="login-password" name="password" type={showPassword?"text":"password"} disabled={blocked} onChange={()=>setFeedback(null)} autoComplete="current-password" required maxLength={256} aria-describedby="login-feedback"/><button type="button" className="password-toggle" disabled={blocked} aria-label={showPassword?"Sembunyikan password":"Tampilkan password"} aria-controls="login-password" aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={19} aria-hidden="true"/>:<Eye size={19} aria-hidden="true"/>}</button></span></label>
   {context==="student"&&<p className="muted login-hint">Pilih ujian dan masukkan PIN setelah berhasil masuk.</p>}
   <div className="login-options"><label className="check"><input type="checkbox" disabled={blocked} checked={remember} onChange={e=>{setRemember(e.target.checked);if(!e.target.checked){try{localStorage.removeItem("edutara_username");}catch{}}}}/>Ingat username saja</label><Button ref={recoveryTrigger} type="button" variant="outline" disabled={busy} aria-haspopup="dialog" onClick={()=>{if(lock.current&&!recovering)return;if(!recovering&&!recoveryFeedback)setRecoveryName(nameInput.current?.value||"");setRecoveryOpen(true);}}>Lupa password</Button></div>
   <Button disabled={blocked}>{busy?"Memproses…":"Masuk"}</Button>
   {feedback?<p id="login-feedback" role={feedback.kind==="error"?"alert":"status"}>{feedback.text}</p>:<span id="login-feedback" className="sr-only"/>}
   {recovering&&!recoveryOpen&&<p role="status">Permintaan pemulihan sedang diproses. Buka Lupa password untuk melihat perkembangannya.</p>}
   {!recovering&&!recoveryOpen&&recoveryFeedback&&<p role={recoveryFeedback.kind==="error"?"alert":"status"}>{recoveryFeedback.text}</p>}
  </form>
  <Dialog open={recoveryOpen} onOpenChange={open=>{if(!open&&!recovering&&recoveryInput.current)setRecoveryName(recoveryInput.current.value);setRecoveryOpen(open);}} title="Pulihkan password" className="login-recovery-dialog" description="Gunakan username akun Anda. Petunjuk dikirim ke email terdaftar jika akun tersedia. Tanpa akses email, hubungi Admin madrasah." onCloseAutoFocus={e=>{if(recoveryTrigger.current?.isConnected){e.preventDefault();recoveryTrigger.current.focus();}}}>
   <form method="post" action="/api/auth/recover" onSubmit={recover} className="stack" aria-busy={recovering}>
    <label htmlFor="login-recovery-username">Username pemulihan<input ref={recoveryInput} id="login-recovery-username" name="username" value={recoveryName} onChange={e=>{setRecoveryName(e.target.value);setRecoveryFeedback(null);setInvalidRecovery(false);}} autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} disabled={recovering} aria-invalid={invalidRecovery||undefined} aria-describedby="recovery-feedback"/></label>
    <Button disabled={recovering}>{recovering?"Mengirim permintaan…":"Kirim petunjuk pemulihan"}</Button>
    {recovering&&<p role="status">Anda dapat menutup dialog. Permintaan tetap diproses; membukanya kembali tidak mengirim ulang.</p>}
    <p id="recovery-feedback" role={recoveryFeedback?.kind==="error"?"alert":"status"}>{recoveryFeedback?.text}</p>
    {recoveryFeedback?.kind==="success"&&<p className="muted">Periksa inbox dan spam. Gunakan tautan terbaru dari email untuk mengatur password.</p>}
   </form>
  </Dialog>
 </>;
}
