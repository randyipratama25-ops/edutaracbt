"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import Link from "next/link";
import {Button} from "../ui/button";
import {api} from "../operations/shared";
import {operationalChecks,type Health} from "../../lib/operational/health";
const date=(v:string|null)=>v?new Date(v).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})+" WIB":"Belum tersedia";
export function OperationalHealth(){
 const [data,setData]=useState<Health|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[message,setMessage]=useState(""),[now,setNow]=useState(()=>Date.now());
 const toggle=useRef<HTMLButtonElement>(null);
 const sequence=useRef(0),lock=useRef(false),retry=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{const seq=++sequence.current;setLoading(true);setError("");try{const next=await api<Health>("/api/operational");if(seq===sequence.current){setData(next);setNow(Date.now());}}catch(e){if(seq===sequence.current){setData(null);setError(e instanceof Error?e.message:"Gagal memuat kondisi.");}}finally{if(seq===sequence.current)setLoading(false);}},[]);
 useEffect(()=>{const tracker=sequence;void load();const t=setInterval(()=>{if(document.visibilityState==="visible"&&!lock.current)void load();},60000);return()=>{tracker.current++;clearInterval(t);};},[load]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(t);},[]);
 async function record(e:FormEvent<HTMLFormElement>){e.preventDefault();if(lock.current)return;const fields=new FormData(e.currentTarget);const completed=new Date(String(fields.get("completed_at")));if(!Number.isFinite(completed.getTime())){setMessage("Waktu selesai tidak valid.");return;}lock.current=true;setBusy(true);setMessage("");const f=fields;const input={action:"record",backup_id:String(f.get("backup_id")),backup_checksum:String(f.get("backup_checksum")),completed_at:completed.toISOString(),duration_seconds:Number(f.get("duration_seconds")),outcome:String(f.get("outcome")),evidence:String(f.get("evidence")),notes:String(f.get("notes")),confirmation:String(f.get("confirmation"))};const key=JSON.stringify(input);if(retry.current?.key!==key)retry.current={key,id:crypto.randomUUID()};try{await api("/api/operational",{...input,request_id:retry.current.id});retry.current=null;setOpen(false);setMessage("Catatan latihan tersimpan; bukti tetap perlu diverifikasi penanggung jawab.");await load();requestAnimationFrame(()=>toggle.current?.focus());}catch(e){setMessage(e instanceof Error?e.message:"Catatan gagal disimpan.");}finally{lock.current=false;setBusy(false);}}
 const checks=data?operationalChecks(data,now):[];
 return <section className="panel stack" aria-label="Pemantauan operasional">
  <div className="actions"><h2>Pemantauan operasional</h2><Button variant="outline" disabled={loading||busy} onClick={()=>void load()}>Periksa sekarang</Button></div>
  {loading&&<p role="status">Memeriksa kondisi…</p>}{error&&<p role="alert">{error} Coba periksa kembali.</p>}
  {data&&<><p className="muted">Diperiksa {date(data.observed_at)} · pembaruan setiap 1 menit saat halaman terlihat.</p><div className="operational-grid">{checks.map(c=><article className="panel stack" key={c.title}><h3>{c.title}</h3><strong>{c.passed?"Terpenuhi":"Perlu tindak lanjut"}</strong><p>{c.detail}</p>{c.href&&<Link href={c.href}>Buka pemeriksaan terkait</Link>}</article>)}</div><p>Heartbeat: {date(data.heartbeat_at)} · Latihan berhasil: {date(data.last_passed_drill_at)}</p></>}
  <div className="actions"><Button ref={toggle} variant="outline" disabled={busy} aria-expanded={open} onClick={()=>setOpen(!open)}>Catat latihan pemulihan</Button><Link href="/dashboard/acceptance">Pemeriksaan penerimaan</Link></div>
  <p role="status">{message}</p>
  {open&&<form className="stack" onSubmit={e=>void record(e)}><p>Gunakan backup asli yang berhasil diunduh dan dipulihkan pada database terisolasi. Catatan ini merupakan laporan Admin, bukan verifikasi otomatis atau perintah restore.</p><div className="toolbar">
   <label>ID backup<input name="backup_id" required maxLength={36} defaultValue={data?.backup?.id||""}/></label><label>SHA-256 manifest<input name="backup_checksum" required pattern="[a-f0-9]{64}" maxLength={64} defaultValue={data?.backup?.checksum||""}/></label>
   <label>Waktu selesai (zona perangkat)<input name="completed_at" type="datetime-local" required/></label><label>Durasi (detik)<input name="duration_seconds" type="number" min={1} max={86400} required/></label><label>Hasil<select name="outcome"><option value="failed">Gagal / perlu perbaikan</option><option value="passed">Berhasil</option></select></label></div>
   <label>Lokasi bukti / nomor laporan<input name="evidence" minLength={5} maxLength={300} required/></label><label>Hasil perbandingan data/media, uji akses dan tindak lanjut<textarea name="notes" minLength={10} maxLength={2000} required/></label><label>Ketik KONFIRMASI<input name="confirmation" pattern="KONFIRMASI" required/></label><Button disabled={busy}>{busy?"Menyimpan…":"Simpan catatan latihan"}</Button>
  </form>}
  {!!data?.drills.length&&<details><summary>Riwayat 10 latihan terakhir</summary><ul className="stack">{data.drills.map(d=><li key={d.id}><strong>{d.outcome==="passed"?"Berhasil":"Gagal"}</strong> · {date(d.completed_at)} · {d.duration_seconds} detik<p>{d.evidence}</p><p>{d.notes}</p></li>)}</ul></details>}
 </section>;
}
