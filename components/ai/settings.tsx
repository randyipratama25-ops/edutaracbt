"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {providers} from '../../lib/ai/schema';
import {Button} from '../ui/button';
import {HelpDisclosure} from '../ui/help-disclosure';
type Config={provider:string;model:string;version:number;configured:boolean;consent:boolean;enabled:boolean;tested:boolean;daily_limit:number;last_tested_at:string|null;used_today:number;failed_today:number};
const catalog:Record<string,string>={openai:'https://developers.openai.com/api/docs/models',anthropic:'https://platform.claude.com/docs/en/models/overview',google:'https://ai.google.dev/gemini-api/docs/models',deepseek:'https://api-docs.deepseek.com',mistral:'https://docs.mistral.ai',groq:'https://console.groq.com/docs/models',xai:'https://docs.x.ai',openrouter:'https://openrouter.ai/models'};
async function api(input?:object){const r=await fetch('/api/ai/providers',input?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.error?.message||'Permintaan AI gagal diproses.');return j.data;}
export function AISettings(){
 const [rows,setRows]=useState<Config[]>([]),[provider,setProvider]=useState('openai'),[model,setModel]=useState(''),[key,setKey]=useState(''),[consent,setConsent]=useState(false),[limit,setLimit]=useState(100),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const lock=useRef(false),live=useRef(true),seq=useRef(0);
 const selected=rows.find(r=>r.provider===provider);
 const dirty=model!==(selected?.model||'')||!!key||consent!==(selected?.consent||false)||limit!==(selected?.daily_limit||100);
 function populate(p:string,data:Config[]){const c=data.find(r=>r.provider===p);setProvider(p);setModel(c?.model||'');setKey('');setConsent(c?.consent||false);setLimit(c?.daily_limit||100);}
 const load=useCallback(async()=>{const id=++seq.current;setLoading(true);setFailed(false);try{const data:Config[]=await api();if(live.current&&seq.current===id){setRows(data);populate('openai',data);}}catch(e){if(live.current&&seq.current===id){setFailed(true);setMessage(e instanceof Error?e.message:'Gagal memuat konfigurasi.');}}finally{if(live.current&&seq.current===id)setLoading(false);}},[]);
 useEffect(()=>{live.current=true;void load();return()=>{live.current=false;seq.current++;};},[load]);
 async function act(action:'save'|'test'|'activate'|'disable'){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');const current=provider;
  try{await api(action==='save'?{action,provider:current,model,version:selected?.version||0,consent,daily_limit:limit,...(key?{api_key:key}:{})}:action==='test'?{action,provider:current}:{action,provider:current,version:selected?.version});
   if(live.current)setKey('');const data:Config[]=await api();if(live.current){setRows(data);populate(current,data);setMessage(action==='test'?'Koneksi berhasil diuji. Pilih Aktifkan untuk mulai menggunakannya.':action==='activate'?'Penyedia aktif untuk penilai.':action==='disable'?'Penyedia dinonaktifkan. Riwayat saran dipertahankan.':'Konfigurasi tersimpan. Uji koneksi sebelum mengaktifkan.');}
  }catch(e){if(live.current)setMessage(e instanceof Error?e.message:'Permintaan gagal.');}finally{lock.current=false;if(live.current)setBusy(false);}
 }
 function switchProvider(p:string){if(dirty&&!confirm('Abaikan perubahan yang belum disimpan?'))return;populate(p,rows);setMessage('');}
 return <section className="panel stack"><div className="actions"><h2>Penyedia AI</h2><Button type="button" variant="outline" disabled={busy||loading} onClick={()=>{if(!dirty||confirm('Muat ulang dan abaikan perubahan?'))void load();}}>Muat ulang</Button></div>
 <p>Pilih penyedia → simpan konfigurasi → uji koneksi → aktifkan.</p><p role="status" aria-live="polite">{message}</p>
 {loading?<p role="status">Memuat konfigurasi AI…</p>:failed?<p>Konfigurasi belum tersedia. Gunakan Muat ulang untuk mencoba kembali.</p>:<>
 <div className="ai-provider-grid" aria-label="Status penyedia">{Object.entries(providers).map(([id,label])=>{const c=rows.find(r=>r.provider===id);return <button type="button" className="ai-provider-card" key={id} aria-pressed={provider===id} disabled={busy} onClick={()=>switchProvider(id)}><strong>{label}</strong><span>{c?.enabled?'Aktif':c?.configured?'Nonaktif':'Belum dikonfigurasi'}</span><small>{c?.model||'Model belum dipilih'}</small></button>;})}</div>
 <form className="stack" onSubmit={e=>{e.preventDefault();void act('save');}}><fieldset disabled={busy} className="stack"><legend>{providers[provider as keyof typeof providers]}</legend>
 <div className="form-grid"><label>ID model<input required maxLength={150} pattern="[a-zA-Z0-9_./:\-]+" value={model} onChange={e=>setModel(e.target.value)}/></label><label>API key<input type="password" autoComplete="new-password" minLength={8} maxLength={5000} value={key} onChange={e=>setKey(e.target.value)} placeholder={selected?.configured?'Tersimpan; kosongkan untuk mempertahankan':'Masukkan API key'}/></label><label>Batas esai per hari (UTC)<input required type="number" min={1} max={1000} value={limit} onChange={e=>setLimit(Number(e.target.value))}/></label></div>
 <p>Status: {selected?.enabled?'Aktif':'Nonaktif'} · {selected?.configured?'Key tersimpan':'Belum ada key'} · {selected?.tested?'Konfigurasi teruji':'Perlu uji koneksi'}</p>
 <a href={catalog[provider]} target="_blank" rel="noreferrer">Lihat model pada dokumentasi penyedia</a>
 <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> Izinkan teks soal, rubrik dan jawaban dikirim ke penyedia ini.</label>
 <HelpDisclosure title="Keamanan dan uji koneksi"><p>API key tidak ditampilkan kembali. Penggantian model/key atau penyimpanan konfigurasi menonaktifkan penyedia sampai diuji dan diaktifkan kembali. Nonaktifkan penyedia sebelum menguji ulang. Uji memakai contoh soal dan dapat memakai kuota API.</p></HelpDisclosure>
 <div className="actions"><Button disabled={busy||!dirty}>{busy?'Memproses…':'Simpan konfigurasi'}</Button><Button type="button" variant="outline" disabled={busy||dirty||!selected?.configured||selected?.enabled} onClick={()=>void act('test')}>Uji koneksi tersimpan</Button><Button type="button" disabled={busy||dirty||!selected?.tested||!selected?.consent||selected?.enabled} onClick={()=>void act('activate')}>Aktifkan</Button><Button type="button" variant="outline" disabled={busy||dirty||!selected?.enabled} onClick={()=>void act('disable')}>Nonaktifkan</Button></div>
 </fieldset></form>
 <section className="stack" aria-label="Pemakaian penyedia"><h3>Pemakaian hari ini</h3><p>{selected?`${selected.used_today??0} / ${selected.daily_limit} esai diminta · ${selected.failed_today??0} gagal`:'Belum ada konfigurasi.'}</p><p>Uji koneksi berhasil terakhir: {selected?.last_tested_at?new Date(selected.last_tested_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})+' WIB':'Belum tercatat'}.</p><p className="muted">Batas harian adalah jumlah esai, bukan batas biaya. Permintaan gagal ikut dihitung; uji koneksi memakai batas tersendiri. Biaya dan token tetap diperiksa pada dashboard penyedia.</p></section>
 </>}
 </section>;
}
