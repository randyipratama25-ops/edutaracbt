"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {api} from "../operations/shared";
export function GradingPriority(){const [total,setTotal]=useState<number|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
useEffect(()=>{let live=true;setError('');setTotal(null);void api<{total:number}>("/api/results?state=pending&page=1").then(d=>{if(live&&Number.isFinite(d.total))setTotal(d.total);else if(live)setError('Ringkasan koreksi belum tersedia.');}).catch(()=>{if(live)setError('Ringkasan koreksi belum dapat dimuat.');});return()=>{live=false;};},[refresh]);
return <section className="panel stack"><h2>Koreksi dalam cakupan Anda</h2>{error?<p role="status">{error} <button type="button" onClick={()=>setRefresh(v=>v+1)}>Coba lagi</button></p>:total===null?<p role="status">Memuat koreksi tertunda…</p>:<p><strong className="metric">{total}</strong> hasil peserta masih menunggu koreksi esai.</p>}<Link href="/dashboard/grading">Buka antrean koreksi</Link></section>;
}
