"use client";
import {FeedbackMessage} from "../feedback/state";
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import {api,useLive} from './shared';
import {Button} from '../ui/button';
import {focusNotificationExam,type InboxPage} from '../../lib/notifications/types';
export function Inbox(){
 const [data,setData]=useState<InboxPage|null>(null),[page,setPage]=useState(1),[filter,setFilter]=useState('all'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
 const sequence=useRef(0),lock=useRef(false),toggle=useRef<HTMLButtonElement>(null),id=useId();
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 const load=useCallback(async()=>{
  const seq=++sequence.current;
  try{const d=await api<InboxPage>('/api/operations?'+new URLSearchParams({action:'inbox_page',page:String(page),filter}));if(seq!==sequence.current)return;
   if(!Array.isArray(d.rows)||!Number.isFinite(d.total)||!Number.isFinite(d.unread_total))throw Error('Format notifikasi belum tersedia. Coba muat ulang.');
   if(page>1&&d.total<=(page-1)*20){setPage(Math.max(1,Math.ceil(d.total/20)));return;}
   setData(d);setError('');
  }catch(e){if(seq===sequence.current)setError(e instanceof Error?e.message:'Notifikasi gagal dimuat.');}
  finally{if(seq===sequence.current)setLoading(false);}
 },[page,filter]);
 useEffect(()=>{setLoading(true);setData(null);void load();return invalidate;},[load,invalidate]);
 useLive(load,true);
 async function read(ids:string[]){
  if(lock.current||!ids.length)return;lock.current=true;setBusy(ids.length===1?ids[0]:'page');setNotice('');const source=document.activeElement;
  try{const result=await api<{saved:boolean}>('/api/operations',ids.length===1?{action:'read',id:ids[0]}:{action:'read_batch',ids});if(!result.saved)throw Error('Notifikasi tidak dapat ditandai. Muat ulang untuk memeriksa akses.');setNotice('Status dibaca tersimpan. Ini bukan konfirmasi bahwa tindakan sudah selesai.');await load();}
  catch(e){setNotice(e instanceof Error?e.message:'Status dibaca belum tersimpan. Coba lagi.');}
  finally{lock.current=false;setBusy('');requestAnimationFrame(()=>{if(source&&!source.isConnected&&document.activeElement===document.body)toggle.current?.focus();});}
 }
 const unreadIds=data?.rows.filter(m=>!m.read_at).map(m=>m.id)||[];
 return <section className="panel inbox-panel stack" aria-label="Notifikasi petugas">
  <div className="actions"><Button ref={toggle} type="button" variant="outline" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>Notifikasi{data?` (${data.unread_total} belum dibaca)`:loading?' · memuat…':''}</Button>{error&&<Button type="button" variant="outline" onClick={()=>void load()}>Coba muat notifikasi</Button>}</div>
  {error&&<FeedbackMessage tone="error" role="alert">{error}{data?' Menampilkan data terakhir yang berhasil dimuat.':''}</FeedbackMessage>}
  <FeedbackMessage tone="info" role="status" aria-live="polite">{notice}</FeedbackMessage>
  <div id={id} hidden={!open} className="stack">
   <div className="toolbar"><label>Tampilkan<select disabled={!!busy} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);setNotice('');}}><option value="all">Semua notifikasi</option><option value="unread">Belum dibaca</option></select></label><Button type="button" variant="outline" disabled={!!busy||!unreadIds.length||loading||!!error} onClick={()=>void read(unreadIds)}>Tandai halaman dibaca</Button></div>
   {loading?<FeedbackMessage tone="loading" role="status">Memuat notifikasi…</FeedbackMessage>:!error&&data?.rows.length===0?<p>{filter==='unread'?'Tidak ada notifikasi belum dibaca.':'Belum ada notifikasi.'}</p>:null}
   <div className="notification-list" role="region" aria-label="Daftar notifikasi" tabIndex={0}>{data?.rows.map(m=><article key={m.id} className={`notification-card${m.read_at?'':' is-unread'}`}>
    <div className="actions"><strong>{m.priority==='important'?'Penting':'Informasi'} · {m.read_at?'Sudah dibaca':'Belum dibaca'}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB</time></div>
    <h2>{m.title||'Pesan petugas'}</h2><p className="answer-text">{m.message}</p>
    {m.exam_title&&<p>Ujian: <strong>{m.exam_title}</strong></p>}
    <div className="actions">{m.exam_id&&<Button type="button" variant="outline" onClick={()=>setNotice(focusNotificationExam(m.exam_id!)?'Ujian terkait ditampilkan pada daftar di bawah.':'Ujian terkait belum ditampilkan. Jika sesi sedang berjalan, selesaikan sesi terlebih dahulu. Jika belum, muat ulang daftar ujian atau hubungi pengawas.')}>Lihat ujian terkait</Button>}{!m.read_at&&<Button loading={busy===m.id} type="button" variant="outline" disabled={!!busy} onClick={()=>void read([m.id])}>{busy===m.id?'Menyimpan…':'Tandai dibaca'}</Button>}</div>
    {m.has_exam&&!m.exam_id&&<p className="muted">Ujian terkait tidak tersedia pada akses Anda saat ini. Hubungi pengawas jika perlu.</p>}
    {m.read_at&&<small>Dibaca {new Date(m.read_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB</small>}
   </article>)}</div>
   {data&&<div className="actions"><Button type="button" variant="outline" disabled={page<=1||loading||!!busy} onClick={()=>setPage(p=>p-1)}>Sebelumnya</Button><span>Halaman {page} / {Math.max(1,Math.ceil(data.total/20))} · {data.total} notifikasi</span><Button type="button" variant="outline" disabled={page*20>=data.total||loading||!!busy} onClick={()=>setPage(p=>p+1)}>Berikutnya</Button></div>}
   <p className="muted">Dibaca adalah status pesan, bukan bukti penyelesaian tindakan. Saat offline atau butuh bantuan segera, hubungi pengawas langsung.</p>
  </div>
 </section>;
}
