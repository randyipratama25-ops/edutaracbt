"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {z} from "zod";
import {clientRequest,ClientRequestError} from "../../lib/client/request";
import {signalsSchema,helpListSchema} from "../../lib/operations/contracts";
import {workflowCommand} from "../../lib/workflow/schema";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import type { Help, Signal } from "../../lib/workflow/schema";
type Participant = {
  student_id: string;
  student: string;
  attempt_id: string | null;
  version: number|null;
  status: string;
  logged_in: boolean;
  can_act: boolean;
};
export function IncidentPanel({
  exam,
  rows,
  admin,
  onChanged,
  paused=false,
}: {
  exam: string;
  rows: Participant[];
  admin: boolean;
  onChanged: () => Promise<void>;
  paused?:boolean;
}) {
  const [signals, setSignals] = useState<Signal[]>([]),
    [help, setHelp] = useState<Help[]>([]),
    [message, setMessage] = useState(""),
    [target, setTarget] = useState<Participant | null>(null),
    [ticket, setTicket] = useState<Help | null>(null),
    [minutes, setMinutes] = useState(5),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),[readError,setReadError]=useState(''),[loading,setLoading]=useState(true),[uncertain,setUncertain]=useState(false);
  const seq=useRef(0),mounted=useRef(true),lock=useRef(false),pause=useRef(paused),dialogOpen=useRef(false),controllers=useRef(new Set<AbortController>()),flight=useRef<Promise<void>|null>(null),retry=useRef<{signature:string;id:string}|null>(null);
  const request=useCallback(async function request<T>(url:string,input:object|undefined,schema:z.ZodType<T>){
    const c=new AbortController();controllers.current.add(c);
    try{const value=await clientRequest(url,input,schema,c,{mutation:!!input});if(!mounted.current)throw Error('Permintaan dibatalkan.');return value;}finally{controllers.current.delete(c);}
  },[]);
  useEffect(()=>{mounted.current=true;const active=controllers.current,sequence=seq;return()=>{mounted.current=false;sequence.current++;flight.current=null;active.forEach(c=>c.abort());};},[]);
  const load=useCallback(async()=>{
    if(!mounted.current||pause.current||dialogOpen.current||lock.current)return;
    if(flight.current)return flight.current;
    const generation=++seq.current;
    const promise=(async()=>{try{
      const [a,b]=await Promise.all([request('/api/workflow?action=signals&exam='+exam,undefined,signalsSchema),request('/api/workflow?action=help_list&exam='+exam,undefined,helpListSchema)]);
      if(generation===seq.current){setSignals(a);setHelp(b);setReadError('');}
    }catch(e){if(mounted.current&&generation===seq.current){setSignals([]);setHelp([]);setReadError(e instanceof Error?e.message:'Status pelaksanaan belum dapat dimuat.');}}
    finally{if(mounted.current&&generation===seq.current){setLoading(false);flight.current=null;}}})();
    flight.current=promise;return promise;
  },[exam,request]);
  useEffect(()=>{pause.current=paused;if(!paused)void load();},[paused,load]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),5000);return()=>{clearInterval(timer);};},[load]);
  function close(){if(lock.current)return;dialogOpen.current=false;setTarget(null);setTicket(null);setUncertain(false);setMessage('');void Promise.all([load(),onChanged()]);}
  const active = rows.filter((r) => r.status === "in_progress"&&r.attempt_id&&r.version!==null),
    stale = active.filter(
      (r) =>
        signals.find((s) => s.attempt_id === r.attempt_id)?.connection ===
        "stale",
    ),
    pending = help.filter((h) => !h.resolved_at);
  async function save() {
    if (lock.current||uncertain) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const input = ticket
        ? { action: "resolve", id: ticket.id, reason }
        : {
            action: "extend",
            attempt_id: target?.attempt_id,
            version: target?.version,
            minutes,
            reason,
            confirmation: confirm,
          };
      const signature = JSON.stringify(input);
      if (retry.current?.signature !== signature)
        retry.current = { signature, id: crypto.randomUUID() };
      const parsed=workflowCommand.parse({...input,request_id:retry.current.id});
      await request<unknown>("/api/workflow",parsed,ticket?z.object({resolved:z.literal(true)}):z.object({deadline_at:z.string().refine(v=>Number.isFinite(Date.parse(v))),minutes:z.number().int().min(1).max(60)}));
      retry.current = null;
      dialogOpen.current=false;setTarget(null);setTicket(null);setUncertain(false);lock.current=false;
      await Promise.all([load(), onChanged()]);
      if(!mounted.current)return;
      setMessage(
        ticket
          ? "Permintaan telah ditangani."
          : "Dispensasi tercatat. Timer siswa diperbarui pada pemeriksaan server berikutnya.",
      );
    } catch (e) {
      if(mounted.current){setMessage(e instanceof ClientRequestError?e.message:"Periksa tanggapan, alasan, menit dan konfirmasi.");if(e instanceof ClientRequestError&&(e.uncertain||e.status===409))setUncertain(true);}
    } finally {
      lock.current = false;
      if(mounted.current)setBusy(false);
    }
  }
  return (
    <section
      className="stack incident-panel"
      aria-label="Ringkasan pelaksanaan"
    >
      <h2>Pelaksanaan dan bantuan</h2>
      {(loading||paused)&&<p role="status">Memuat status pelaksanaan…</p>}
      {readError&&<div role="alert"><p>{readError}</p><Button variant="outline" onClick={()=>void load()}>Coba muat bantuan</Button></div>}
      <div className="cards">
        <div>
          <strong className="metric">{paused?"—":active.length}</strong>
          <p>Sedang mengerjakan</p>
        </div>
        <div>
          <strong className="metric">
            {paused?"—":rows.filter((r) => r.status === "not_started").length}
          </strong>
          <p>
            Belum mulai ·{" "}
            {
              rows.filter((r) => r.status === "not_started" && !r.logged_in)
                .length
            }{" "}
            tanpa sesi login
          </p>
        </div>
        <div>
          <strong className="metric">{loading||readError||paused?"—":stale.length}</strong>
          <p>Perlu cek koneksi</p>
        </div>
        <div>
          <strong className="metric">{loading||readError||paused?"—":pending.length}</strong>
          <p>Menunggu bantuan</p>
        </div>
      </div>
      <details><summary>Tentang indikator koneksi</summary><p className="muted">
        Indikator koneksi memakai kontak server terakhir; lebih dari 45 detik
        perlu diperiksa, bukan bukti pelanggaran. Sesi login tersedia belum
        membuktikan siswa hadir di ruang.
      </p></details>
      <p role="status">{message}</p>
      {stale.length > 0 && (
        <div className="notice">
          <strong>Periksa peserta berikut</strong>
          <ul>
            {stale.map((r) => (
              <li key={r.student_id}>
                {r.student} — kontak terakhir{" "}
                {new Date(
                  signals.find((s) => s.attempt_id === r.attempt_id)?.last_seen_at||NaN,
                ).toLocaleTimeString("id-ID")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="incident-actions">
        <div>
          <details><summary>Panduan penanganan peserta</summary>
          <p>
            Lanjut sesi: siswa masuk kembali. Buka kunci: batalkan penguncian
            setelah peninjauan. Reset: mulai percobaan baru dengan riwayat dan
            deadline lama tetap dipertahankan. Dispensasi: tambahan waktu
            eksplisit oleh Admin.
          </p></details>
        </div>
        {admin && (
          <label>
            Dispensasi untuk peserta
            <select
              disabled={busy||paused||!!readError||loading}
              value=""
              onChange={(e) => {
                const r = rows.find((r) => r.attempt_id === e.target.value);
                if (r&&!lock.current) {
                  dialogOpen.current=true;setMessage('');setUncertain(false);
                  setTarget({ ...r });
                  setTicket(null);
                  setReason("");
                  setConfirm("");
                  setMinutes(5);
                }
              }}
            >
              <option value="">Pilih sesi aktif…</option>
              {active.map((r) => (
                <option key={r.student_id} value={r.attempt_id!}>
                  {r.student}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <details open={pending.length > 0}>
        <summary>Permintaan bantuan ({loading||readError?"status belum tersedia":pending.length+" terbuka"})</summary>
        <ul className="agenda-list">
          {help.map((h) => (
            <li key={h.id}>
              <div>
                <strong>
                  {h.student} · {h.resolved_at ? "Ditangani" : "Menunggu"}
                </strong>
                <p>{h.message}</p>
                {h.resolution && <p>Tanggapan: {h.resolution}</p>}
              </div>
              {!h.resolved_at && h.can_resolve && (
                <Button
                  variant="outline"
                  disabled={busy||paused||!!readError}
                  onClick={() => {
                    if(lock.current)return;dialogOpen.current=true;setMessage('');setUncertain(false);
                    setTicket({...h});
                    setTarget(null);
                    setReason("");
                  }}
                >
                  Tangani
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!loading&&!readError&&!help.length && <p>Belum ada permintaan bantuan.</p>}
      </details>
      <Dialog
        open={!!target || !!ticket}
        onOpenChange={(v) => {
          if (!v) close();
        }}
        title={
          ticket ? "Tanggapi permintaan bantuan" : "Dispensasi waktu ujian"
        }
        description={
          ticket
            ? "Tanggapan tersimpan dalam riwayat dan ditampilkan kepada siswa."
            : "Hanya sesi aktif sebelum deadline. Maksimal 60 menit per tindakan, tidak boleh melewati akhir jadwal."
        }
      >
        <form
          className="stack"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="monitor-controls stack" disabled={busy||uncertain}>
          <p>
            Peserta: <strong>{ticket?.student || target?.student}</strong>
          </p>
          {ticket ? (
            <blockquote>{ticket.message}</blockquote>
          ) : (
            <label>
              Tambahan menit
              <input
                type="number"
                min={1}
                max={60}
                required
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          )}
          <label>
            {ticket ? "Tanggapan pengawas" : "Alasan dispensasi"}
            <textarea
              minLength={5}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {!ticket && (
            <label>
              Ketik TAMBAH WAKTU
              <input
                required
                pattern="TAMBAH WAKTU"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}
          <Button disabled={busy||uncertain}>
            {ticket ? "Tandai ditangani" : "Berikan dispensasi"}
          </Button>
          <p role="status">{message}</p>
          </fieldset>
          {uncertain&&<div role="alert"><p>Periksa ulang status bantuan atau deadline sebelum mengirim lagi.</p><Button type="button" variant="outline" onClick={close}>Tutup dan periksa ulang</Button></div>}
        </form>
      </Dialog>
    </section>
  );
}
