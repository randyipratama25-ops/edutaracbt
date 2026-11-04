"use client";
import {FeedbackMessage} from "../feedback/state";
import {useId, type ReactNode} from 'react';
import {Search, X} from 'lucide-react';
import {Button} from './button';
export function SearchField({label,value,onChange,maxLength=150}:{label:string;value:string;onChange:(value:string)=>void;maxLength?:number}) {
 const id=useId();
 return <div className="search-field"><label htmlFor={id}>{label}</label><div className="search-input"><Search size={17} aria-hidden="true"/><input id={id} type="search" autoComplete="off" maxLength={maxLength} value={value} onChange={e=>onChange(e.target.value)} />{value&&<button type="button" className="search-clear" aria-label={`Hapus pencarian: ${label}`} onClick={()=>{onChange('');document.getElementById(id)?.focus();}}><X size={17} aria-hidden="true"/></button>}</div></div>;
}
export function ListFilters({label,active,onReset,total,loading=false,error='',children}:{label:string;active:string[];onReset:()=>void;total?:number;loading?:boolean;error?:string;children:ReactNode}) {
 return <section className="list-filters stack" aria-label={`Pencarian dan filter ${label}`} aria-busy={loading}>
  <div className="toolbar">{children}</div>
  <div className="filter-summary"><FeedbackMessage tone={loading?"loading":error?"info":total===0&&active.length?"no-results":"info"} role="status" aria-live="polite">{loading?'Memuat hasil…':error?'Hasil belum dapat dimuat.':total===undefined?'Pencarian dan filter':`${total} hasil${total===0&&active.length?" · Tidak ada hasil yang cocok":""}`}{active.length?` · ${active.length} filter aktif`:' · Tanpa filter tambahan'}</FeedbackMessage><Button type="button" variant="outline" disabled={!active.length} onClick={onReset}>Reset filter</Button></div>
  {active.length>0&&<ul className="filter-tags" aria-label="Filter aktif">{active.map(a=><li key={a}>{a}</li>)}</ul>}
  {error&&<FeedbackMessage tone="error" role="alert">{error}</FeedbackMessage>}
 </section>;
}
