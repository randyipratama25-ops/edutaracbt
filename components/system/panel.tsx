"use client";
import {ListFilters, SearchField} from "../ui/list-filters";
import { HelpDisclosure } from "../ui/help-disclosure";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { api } from "../operations/shared";
import {SettingsPanel} from "./settings";
type Job = {
  id: string;
  kind: string;
  status: string;
  progress: number;
  attempts: number;
  error: string | null;
  created_at: string;
  outcome: string | null;
};
type Audit = {
  id: string;
  created_at: string;
  actor: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
};
type Part = {
  number: number;
  kind: string;
  bytes: number;
  sha256: string;
  path: string;
};
export function SystemPanel({mode}:{mode:"settings"|"audit"|"jobs"}){return mode==='settings'?<SettingsPanel/>:<SystemLists mode={mode}/>;}
function SystemLists({mode}:{mode:"audit"|"jobs"}){
  const [jobs, setJobs] = useState<Job[]>([]),
    [audit, setAudit] = useState<Audit[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [loading,setLoading]=useState(false),[listError,setListError]=useState(""),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [parts, setParts] = useState<Part[]>([]),
    [backupId, setBackupId] = useState(""),
    [decision, setDecision] = useState<{
      action: string;
      id: string;
      resolution?: string;
    } | null>(null),
    [decisionReason, setDecisionReason] = useState(""),
    [decisionConfirm, setDecisionConfirm] = useState("");
  const sequence = useRef(0),
    retry = useRef<{ key: string; id: string } | null>(null);
  const auditURL = useCallback(
    (p: number) => {
      if(from&&until&&new Date(from)>=new Date(until))throw Error("Tanggal Dari harus sebelum tanggal Sebelum.");
      const q = new URLSearchParams({
        action: "audit",
        page: String(p),
        search:search.trim(),
      });
      if (from) q.set("from", new Date(from).toISOString());
      if (until) q.set("until", new Date(until).toISOString());
      return "/api/system?" + q;
    },
    [search, from, until],
  );
  const invalidateRequests=useCallback(()=>{sequence.current++;},[]);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    if(mode==="audit"){setLoading(true);setListError("");}
    try {
      if (mode === "jobs") {
        const j = await api<Job[]>("/api/system?action=jobs");
        if (seq === sequence.current) setJobs(j);
      } else {
        const a = await api<{ rows: Audit[]; total: number }>(auditURL(page));
        if (seq === sequence.current) {
          setAudit(a.rows);
          setTotal(a.total);
        }
      }
    } catch (e) {
      if(seq===sequence.current){if(mode==="audit"){setAudit([]);setTotal(0);setListError(e instanceof Error ? e.message : "Data belum dapat dimuat.");}else setMessage(e instanceof Error ? e.message : "Data belum dapat dimuat.");}
    }finally{if(seq===sequence.current)setLoading(false);}
  }, [mode, page, auditURL]);
  useEffect(() => {
    if(mode==="audit")setLoading(true);const timer=setTimeout(()=>void load(),mode==="audit"?250:0);
    return()=>{clearTimeout(timer);invalidateRequests();};
  }, [load,mode,invalidateRequests]);
  useEffect(() => {
    if (mode !== "jobs") return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [mode, load]);
  async function save(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      let data = input;
      if (input.action === "backup") {
        const k = JSON.stringify(input);
        if (retry.current?.key !== k)
          retry.current = { key: k, id: crypto.randomUUID() };
        data = { ...input, request_id: retry.current.id };
      }
      await api("/api/system", data);
      retry.current = null;
      setDecision(null);
      setMessage("Permintaan tersimpan.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function exportAudit() {
    setBusy(true);
    try {
      const rows: Audit[] = [];
      let p = 1;
      for (;;) {
        const d = await api<{ rows: Audit[]; total: number }>(auditURL(p));
        if (d.total > 10000)
          throw Error(
            "Persempit tanggal/filter: maksimum 10.000 baris per ekspor.",
          );
        rows.push(...d.rows);
        if (rows.length >= d.total) break;
        p++;
      }
      const cell = (v: unknown) => {
        const s = String(v ?? "");
        return (
          '"' + (/^[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
        );
      };
      const csv =
        "\ufeff" +
        [
          ["Waktu", "Aktor", "Aksi", "Objek", "ID"],
          ...rows.map((r) => [
            r.created_at,
            r.actor,
            r.action,
            r.target_type,
            r.target_id,
          ]),
        ]
          .map((r) => r.map(cell).join(","))
          .join("\r\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-edutara.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ekspor gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <p role="status">{message}</p>
      {mode === "audit" && (
        <>
          <ListFilters label="audit" active={[search&&"Pencarian",from&&"Dari",until&&"Sebelum"].filter(Boolean) as string[]} onReset={()=>{setSearch("");setFrom("");setUntil("");setPage(1);}} total={total} loading={loading} error={listError}>
            <SearchField label="Aktor/aksi/objek" value={search} maxLength={100} onChange={value=>{setSearch(value);setPage(1);}} />
            <label>
              Dari
              <input
                type="datetime-local"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Sebelum
              <input
                type="datetime-local"
                value={until}
                onChange={(e) => {
                  setUntil(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void exportAudit()}
            >
              Ekspor CSV
            </Button>
          </ListFilters>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel administrasi; geser untuk melihat kolom lain">
            <table>
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>Aktor</th>
                  <th>Aksi</th>
                  <th>Objek</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {(loading||listError?[]:audit).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString("id-ID")}</td>
                    <td>{r.actor || "Otomasi"}</td>
                    <td>{r.action}</td>
                    <td>{r.target_type}</td>
                    <td>{r.target_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <Button
              variant="outline"
              disabled={page <= 1||loading||!!listError}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </Button>
            <span>
              {total} catatan · halaman {page}
            </span>
            <Button
              variant="outline"
              disabled={page * 50 >= total||loading||!!listError}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </>
      )}
      {mode === "jobs" && (
        <>
          <div className="actions">
            <Button
              disabled={busy}
              onClick={() => void save({ action: "backup" })}
            >
              Buat backup manual
            </Button>
            <Button variant="outline" onClick={() => void load()}>
              Muat ulang
            </Button>
          </div>
          <HelpDisclosure><p>
            Backup mencakup data aplikasi, konfigurasi/template dan bytes media.
            Kredensial Auth, sesi dan nilai secret tidak diekspor; pemulihan
            akun memerlukan aktivasi ulang. Dump PostgreSQL/PITR dan escrow
            secret tetap dikelola terpisah.
          </p></HelpDisclosure>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel administrasi; geser untuk melihat kolom lain">
            <table>
              <thead>
                <tr>
                  <th>Waktu / jenis</th>
                  <th>Status</th>
                  <th>Progres</th>
                  <th>Hasil / tindakan</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <td>
                      {new Date(j.created_at).toLocaleString("id-ID")}
                      <br />
                      {j.kind}
                    </td>
                    <td>
                      {j.status} {j.outcome && <small>{j.outcome}</small>}
                    </td>
                    <td>
                      <progress
                        max={100}
                        value={j.progress}
                        aria-label="Progres job"
                      />{" "}
                      {j.progress}%
                    </td>
                    <td>
                      {j.error && <p>{j.error}</p>}
                      {j.kind === "backup" && j.status === "succeeded" && (
                        <div className="actions">
                          <a href={"/api/backups/download?id=" + j.id}>
                            Manifest
                          </a>
                          <a href={"/api/backups/export?id=" + j.id}>
                            ZIP (hingga 50 MiB)
                          </a>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setBackupId(j.id);
                              void api<Part[]>(
                                "/api/system?action=parts&id=" + j.id,
                              )
                                .then(setParts)
                                .catch((e) => setMessage(e.message));
                            }}
                          >
                            Lihat bagian
                          </Button>
                        </div>
                      )}
                      {["failed", "blocked"].includes(j.status) &&
                        j.outcome !== "cancelled" && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void save({ action: "retry", id: j.id })
                            }
                          >
                            Coba ulang
                          </Button>
                        )}
                      {j.kind === "backup" &&
                        j.status !== "succeeded" &&
                        j.outcome !== "cancelled" && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setDecision({
                                action: "cancel_backup",
                                id: j.id,
                              });
                              setDecisionReason("");
                              setDecisionConfirm("");
                            }}
                          >
                            Batalkan backup
                          </Button>
                        )}
                      {j.status === "uncertain" && (
                        <>
                          <p>Periksa mailbox/provider sebelum rekonsiliasi.</p>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDecision({
                                action: "resolve_email",
                                id: j.id,
                                resolution: "sent",
                              });
                              setDecisionReason("");
                              setDecisionConfirm("");
                            }}
                          >
                            Konfirmasi sudah terkirim
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setDecision({
                                action: "resolve_email",
                                id: j.id,
                                resolution: "not_sent",
                              });
                              setDecisionReason("");
                              setDecisionConfirm("");
                            }}
                          >
                            Konfirmasi belum terkirim
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>100 job terbaru. Scheduler tunggal: Supabase Cron.</p>
          {parts.length > 0 && (
            <details open>
              <summary>Bagian backup {backupId}</summary>
              <ul>
                {parts.map((p) => (
                  <li key={p.number}>
                    <a
                      href={
                        "/api/backups/download?id=" +
                        backupId +
                        "&part=" +
                        p.number
                      }
                    >
                      {p.kind} · {(p.bytes / 1024).toFixed(1)} KiB
                    </a>{" "}
                    · SHA-256 <code>{p.sha256}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Dialog
        open={!!decision}
        onOpenChange={(v) => {
          if (!v && !busy) setDecision(null);
        }}
        title={
          decision?.action === "cancel_backup"
            ? "Batalkan backup"
            : "Rekonsiliasi pengiriman"
        }
        description="Periksa status pengiriman sebelum mengonfirmasi. Email yang belum terkirim dapat dijadwalkan ulang jika penerima masih memenuhi syarat."
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (decision)
              void save({
                ...decision,
                reason: decisionReason,
                confirmation: decisionConfirm,
              });
          }}
        >
          <label>
            Alasan pemeriksaan
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={decisionReason}
              onChange={(e) => setDecisionReason(e.target.value)}
            />
          </label>
          <label>
            Ketik KONFIRMASI
            <input
              required
              pattern="KONFIRMASI"
              value={decisionConfirm}
              onChange={(e) => setDecisionConfirm(e.target.value)}
            />
          </label>
          <p role="status">{message}</p>
          <Button disabled={busy}>Konfirmasi tindakan</Button>
        </form>
      </Dialog>
    </section>
  );
}
