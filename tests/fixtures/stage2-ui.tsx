"use client";
// Browser-only fixtures. The verification script mounts this temporarily and removes the route before builds.
import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { ExamPlayer, StudentPortal, type Attempt } from "../../components/attempts/player";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
function makeAttempt(): Attempt {
  return { id:"03000000-0000-4000-8000-000000000001",exam_id:"03000000-0000-4000-8000-000000000002",title:"Asesmen Ilmu Pengetahuan Sosial",status:"in_progress",deadline_at:new Date(Date.now()+1800000).toISOString(),server_now:new Date().toISOString(),epoch:1,finalized_at:null,answers:[],grading_pending:0,score:null,result_visible:false,review_reason:null,
    questions:Array.from({length:18},(_,i)=>({id:`03000000-0000-4000-8000-${String(i+100).padStart(12,"0")}`,version:1,position:i+1,payload:{
      type:i===1?"BS":i===2?"Esai":i===3?"JODOH":"PG",stem:i===2?"<p>Jelaskan peran masyarakat dalam menjaga lingkungan tempat tinggal.</p>":"<p>Perhatikan kegiatan ekonomi di lingkungan sekitar. Pernyataan manakah yang paling sesuai dengan konsep interaksi sosial?</p>",
      options:i===2?[]:[{id:"A",text:"Masyarakat bekerja sama untuk memenuhi kebutuhan bersama."},{id:"B",text:"Setiap individu selalu dapat memenuhi seluruh kebutuhannya sendiri."},{id:"C",text:"Kegiatan ekonomi tidak berhubungan dengan lingkungan."},{id:"D",text:"Interaksi sosial hanya terjadi di lingkungan sekolah."}],
      choices:["Produksi","Distribusi","Konsumsi"],distractors:[],points:5,required:true,minChars:i===2?6:0,direction:"ltr",attachments:[],canvas:{enabled:false,width:1200,height:800},
    }})) } as Attempt;
}
export default function Stage2Fixture() {
  const [mode,setMode]=useState("dashboard"),[role,setRole]=useState<"admin"|"teacher">("admin"),[attempt,setAttempt]=useState(makeAttempt),[open,setOpen]=useState(false);
  useEffect(()=>{const query=new URLSearchParams(window.location.search);setMode(query.get("mode")||"dashboard");setRole(query.get("role")==="teacher"?"teacher":"admin");},[]);
  if(mode==="player")return <div data-mode="player"><ExamPlayer attempt={attempt} clientId="03000000-0000-4000-8000-000000000003" studentId="student-test" onUpdate={setAttempt} onReload={()=>{}} /></div>;
  if(mode==="student")return <div data-mode="student"><StudentPortal studentId="student-test" /></div>;
  return <div data-mode="dashboard"><DashboardShell role={role} name="Pengguna Uji"><h1>Pengguna</h1><p>Kelola akun dan identitas peserta madrasah.</p>
    <div className="cards">{["Pengguna aktif","Kelas","Mata pelajaran"].map((label,i)=><section className="panel" key={label}><h2>{label}</h2><strong className="metric">{[132,6,12][i]}</strong><p className="muted">Dalam cakupan akun Anda</p></section>)}</div>
    <section className="panel"><div className="toolbar"><label>Cari nama<input placeholder="Cari pengguna…" /></label><label>Status<select defaultValue="active"><option value="active">Aktif</option><option>Nonaktif</option></select></label><Button onClick={()=>setOpen(true)}>Tambah pengguna</Button></div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel pengguna; geser untuk melihat kolom lain"><table><thead><tr><th>Nama siswa</th><th>Username</th><th>Kelas</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{Array.from({length:30},(_,i)=><tr key={i}><th scope="row">Siswa Pengujian {i+1}</th><td>siswa-{String(i+1).padStart(3,"0")}</td><td>IX A</td><td>Siswa</td><td>Aktif</td><td><Button variant="outline">Edit</Button></td></tr>)}</tbody></table></div>
    </section>
    <Dialog open={open} onOpenChange={setOpen} title="Tambah pengguna" description="Lengkapi identitas akun peserta."><form className="stack"><label>Nama lengkap<input required /></label><label>Username<input required /></label><label>Email<input type="email" required /></label><Button>Simpan pengguna</Button></form></Dialog>
  </DashboardShell></div>;
}
