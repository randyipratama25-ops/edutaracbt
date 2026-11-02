"use client";
import {useState} from 'react';
import type {analyze} from '../../lib/results/analytics';
import {matchesSearch} from '../../lib/lists/search';
import {types} from '../../lib/authoring/schema';
import {Button} from '../ui/button';
import {ListFilters,SearchField} from '../ui/list-filters';
type Analysis=ReturnType<typeof analyze>;
function Participants({rows}:{rows:{student:string;attempt_id?:string;earned?:number|null;max?:number}[]}){
 const [limit,setLimit]=useState(10);
 return !rows.length?<p className="muted">Tidak ada peserta pada kelompok ini.</p>:<div><ul>{rows.slice(0,limit).map((r,i)=><li key={r.attempt_id||i}>{r.student}{r.max!==undefined?`: ${r.earned??'Menunggu'} / ${r.max}`:''}</li>)}</ul>{limit<rows.length&&<Button type="button" variant="outline" onClick={()=>setLimit(n=>n+20)}>Tampilkan lainnya ({rows.length-limit})</Button>}</div>;
}
export function AnalysisView({analysis,exams}:{analysis:Analysis;exams:Record<string,string>}){
 const [search,setSearch]=useState(''),[type,setType]=useState('all'),[page,setPage]=useState(1),[expanded,setExpanded]=useState<Record<string,boolean>>({});
 const shown=analysis.items.filter(q=>(type==='all'||q.type===type)&&matchesSearch((exams[q.exam_id]||q.exam_id)+' '+q.stem.replace(/<[^>]*>/g,''),search));
 const current=Math.min(page,Math.max(1,Math.ceil(shown.length/20)));
 return <section className="panel stack analysis-view" aria-label="Hasil analisis butir">
  <h2>Analisis lima tipe</h2>
  <dl className="analysis-metrics"><div><dt>Hasil layak</dt><dd>{analysis.eligible}</dd></div><div><dt>Dikecualikan</dt><dd>{analysis.excluded}</dd></div><div><dt>Butir soal</dt><dd>{analysis.items.length}</dd></div></dl>
  <details className="analysis-guide"><summary>Cara membaca analisis</summary><p>Satu hasil final terbaru per siswa pada setiap ujian. Hasil pending, diskualifikasi, attempt lama, atau data tidak lengkap tidak masuk analisis. Versi soal dipisahkan. P = proporsi poin; untuk PG sama dengan proporsi benar. D = selisih kelompok atas/bawah max(1, floor(27% × N)). D belum cukup untuk disimpulkan bila N &lt; 4; N &lt; 30 ditandai sampel kecil.</p></details>
  {!analysis.items.length?<div className="empty-state"><h3>Belum ada butir yang dapat dianalisis</h3><p>Periksa pilihan hasil dan selesaikan koreksi agar tersedia nilai final.</p></div>:<>
   <ListFilters label="butir analisis" active={[search&&'Pencarian',type!=='all'&&'Tipe soal'].filter(Boolean) as string[]} total={shown.length} onReset={()=>{setSearch('');setType('all');setPage(1);}}><SearchField label="Cari ujian atau isi soal" value={search} onChange={v=>{setSearch(v);setPage(1);}}/><label>Tipe soal<select value={type} onChange={e=>{setType(e.target.value);setPage(1);}}><option value="all">Semua tipe</option>{types.map(t=><option key={t}>{t}</option>)}</select></label></ListFilters>
   {!shown.length&&<p role="status">Tidak ada butir sesuai pencarian. Ubah atau reset filter analisis.</p>}
   {shown.slice((current-1)*20,current*20).map(q=><details className="analysis-item" key={q.id} open={!!expanded[q.id]} onToggle={e=>{const open=e.currentTarget.open;setExpanded(prev=>prev[q.id]===open?prev:{...prev,[q.id]:open});}}>
    <summary><span>{exams[q.exam_id]||'Ujian '+q.exam_id} · {q.type} · versi {q.version}</span><span className="analysis-caption">N={q.n} · P={q.p} ({q.difficulty}) · D={q.d} ({q.discrimination}){q.small_sample?' · sampel kecil':''}</span></summary>
    {expanded[q.id]&&<div className="stack"><p dir="auto">{q.stem.replace(/<[^>]*>/g,'')}</p><p className="muted">Kelompok atas dan bawah: {q.group_size} hasil per sisi.</p><h3>Peserta salah / parsial</h3><Participants rows={q.wrong}/>
     {!!q.options.length&&<div className="table-wrap" tabIndex={0} role="region" aria-label="Sebaran jawaban; geser untuk melihat seluruh kolom"><table className="analysis-options"><thead><tr><th>Opsi / pernyataan</th><th>Sebaran jawaban</th><th>Indikator</th></tr></thead><tbody>{q.options.map(o=><tr key={o.id}><th scope="row">{o.id}. {o.text}</th><td>{Object.entries(o.choices).length?<ul>{Object.entries(o.choices).map(([value,count])=><li key={value}>{value==='selected'&&(q.type==='PG'||q.type==='PG_KOMPLEKS')?'Dipilih':q.type==='BS'&&value==='true'?'Benar':q.type==='BS'&&value==='false'?'Salah':value}: {count}</li>)}</ul>:<span>Tidak dipilih</span>}</td><td>{q.type==='PG'||q.type==='PG_KOMPLEKS'?<><p>{o.is_key?'Kunci':'Pengecoh'} · {(100*o.selection_rate).toFixed(1)}% memilih</p>{o.nonfunctional&&<p>Pengecoh dipilih kurang dari 5%.</p>}</>:<><p>Benar: {o.correct} / {q.n}</p><details><summary>Peserta salah ({o.wrong.length})</summary><Participants rows={o.wrong}/></details></>}</td></tr>)}</tbody></table></div>}
     {!!q.essay.length&&<><h3>Sebaran nilai esai</h3><Participants rows={q.essay}/></>}
    </div>}
   </details>)}
   <nav className="actions analysis-pagination" aria-label="Halaman butir analisis"><Button type="button" variant="outline" disabled={current===1} onClick={()=>setPage(current-1)}>Butir sebelumnya</Button><span>Halaman {current} · {shown.length} butir</span><Button type="button" variant="outline" disabled={current*20>=shown.length} onClick={()=>setPage(current+1)}>Butir berikutnya</Button></nav>
  </>}
 </section>;
}
