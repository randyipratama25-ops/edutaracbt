"use client";
import { useId, useRef, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { helpFor, helpPageTitle, type HelpAudience } from '../../lib/help/catalog';
export function ContextHelp(props: { audience: HelpAudience; page: string; duringExam?: boolean }) {
  // Navigation or context changes close the old dialog and clear its search.
  return <HelpPanel key={`${props.audience}:${props.page}`} {...props} />;
}
function HelpPanel({audience,page,duringExam=false}:{audience:HelpAudience;page:string;duringExam?:boolean}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[allPages,setAllPages]=useState(false);
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const rows=helpFor(audience,page,query,allPages);
  const title=helpPageTitle(audience,page);
  return <>
    <Button ref={trigger} type="button" variant="outline" aria-haspopup="dialog" onClick={()=>{setQuery('');setAllPages(false);setOpen(true);}}><CircleHelp size={17} aria-hidden="true" />Bantuan</Button>
    <Dialog open={open} onOpenChange={setOpen} title="Pusat bantuan" description={`Panduan: ${title}.`} className="context-help-dialog" onCloseAutoFocus={e=>{if(trigger.current?.isConnected){e.preventDefault();trigger.current.focus();}}}>
      <div className="stack">
        {duringExam && <p className="notice">Waktu ujian tetap berjalan. Untuk menghubungi pengawas, tutup panduan lalu pilih Minta bantuan pada menu Alat atau layar kendala. Jika offline, hubungi pengawas langsung.</p>}
        <div className="form-grid"><label htmlFor={`${id}-query`}>Cari panduan<input id={`${id}-query`} type="search" maxLength={120} value={query} placeholder="Contoh: simpan, PIN, undangan" onChange={e=>setQuery(e.target.value)} /></label><label htmlFor={`${id}-scope`}>Cakupan<select id={`${id}-scope`} value={allPages?'all':'page'} onChange={e=>setAllPages(e.target.value==='all')}><option value="page">Halaman ini</option><option value="all">Semua panduan peran saya</option></select></label></div>
        <p role="status" aria-live="polite">{rows.length} panduan ditemukan</p>
        {rows.length ? <div className="help-topic-list">{rows.map(t=><details key={t.id} className="help-topic"><summary>{t.title}</summary><ol>{t.steps.map(s=><li key={s}>{s}</li>)}</ol><p className="notice">{t.trouble}</p></details>)}</div> : <div className="empty-state"><p>Tidak ada panduan yang cocok. Coba kata lain atau perluas cakupan.</p><Button type="button" variant="outline" onClick={()=>{setQuery('');setAllPages(true);}}>Tampilkan semua panduan peran saya</Button></div>}
        <p className="muted">Panduan dapat dibaca tanpa mengirim pesan. Hubungi Admin atau pengawas untuk penanganan kendala.</p>
      </div>
    </Dialog>
  </>;
}
