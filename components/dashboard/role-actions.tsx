import Link from "next/link";
export function RoleActions({role}:{role:"admin"|"teacher"|"supervisor"}){
 const actions=role==="admin"?[
  ["Siapkan ujian","Periksa peserta, soal dan jadwal sebelum publikasi.","/dashboard/preparation"],
  ["Pantau pelaksanaan","Tinjau kendala peserta dan bantuan yang masuk.","/dashboard/monitor"],
  ["Periksa kesiapan layanan","Tinjau backup, otomasi dan bukti penerimaan.","/dashboard/acceptance"],
 ]:role==="teacher"?[
  ["Susun dan tinjau soal","Kelola soal dalam penugasan kelas dan mapel Anda.","/dashboard/bank"],
  ["Lanjutkan koreksi","Tinjau esai dan moderasi yang menjadi tanggung jawab Anda.","/dashboard/grading"],
  ["Tinjau hasil kelas","Baca hasil dan laporan sesuai cakupan penilaian.","/dashboard/results"],
 ]:[
  ["Pilih ujian dan peserta","Mulai dari daftar ujian dalam penugasan Anda.","#pelaksanaan"],
  ["Tanggapi bantuan","Periksa kendala peserta pada panel bantuan ujian terpilih.","#pelaksanaan"],
  ["Siapkan kartu peserta","Gunakan kartu peserta yang tersedia dalam cakupan tugas.","#kartu-peserta"],
 ];
 return <section aria-label="Prioritas pekerjaan" className="role-actions">{actions.map(([title,description,href])=><Link key={title} className="role-action" href={href}><strong>{title}</strong><span>{description}</span><span className="role-action-link">Buka →</span></Link>)}</section>;
}
