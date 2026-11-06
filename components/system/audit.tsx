"use client";
import {FeedbackMessage, StateCard} from "../feedback/state";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { ListFilters, SearchField } from "../ui/list-filters";
import { clientRequest } from "../../lib/client/request";
import { roomDate } from "../../lib/operations/rooms";
import {
  AUDIT_PAGE_SIZE,
  auditListSchema,
  auditQuery,
  auditCSV,
  collectAudit,
  type AuditRow,
  type AuditFilters,
} from "../../lib/system/audit";
const empty: AuditFilters = { search: "", from: "", until: "" };
export function AuditPanel() {
  const [filters, setFilters] = useState(empty),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<AuditRow[]>([]),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [exporting, setExporting] = useState(false),
    [message, setMessage] = useState(""),
    [detail, setDetail] = useState<AuditRow | null>(null);
  const [messageTone,setMessageTone]=useState<"info"|"success"|"error">("info");
  const mounted = useRef(true);
  const sequence = useRef(0),
    read = useRef<AbortController | null>(null),
    exportController = useRef<AbortController | null>(null),
    lock = useRef(false);
  let invalid = "";
  try {
    auditQuery(filters, page);
  } catch (e) {
    invalid = e instanceof Error ? e.message : "Waktu tidak valid.";
  }
  const cancelRead = useCallback(() => {
    sequence.current++;
    read.current?.abort();
  }, []);
  const invalidate = useCallback(() => {
    cancelRead();
    setLoading(true);
    setError("");
    setRows([]);
    setMessage("");
  }, [cancelRead]);
  const change = (next: AuditFilters) => {
    invalidate();
    setFilters(next);
    setPage(1);
  };
  useEffect(() => {
    const id = ++sequence.current,
      c = new AbortController();
    read.current = c;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const d = await clientRequest(
          auditQuery(filters, page),
          undefined,
          auditListSchema,
          c,
        );
        if (id !== sequence.current || c.signal.aborted) return;
        const last = Math.max(1, Math.ceil(d.total / AUDIT_PAGE_SIZE));
        if (page > last) {
          setPage(last);
          return;
        }
        if (d.total > 0 && !d.rows.length)
          throw Error("Catatan belum lengkap. Muat ulang untuk mencoba lagi.");
        setRows(d.rows);
        setTotal(d.total);
        setLoading(false);
      } catch (e) {
        if (id === sequence.current) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      cancelRead();
      c.abort();
    };
  }, [filters, page, version, cancelRead]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      exportController.current?.abort();
      exportController.current = null;
    };
  }, []);
  async function download() {
    if (lock.current || loading || error || invalid) return;
    lock.current = true;
    setExporting(true);setMessageTone("info");
    setMessage("");
    const c = new AbortController();
    exportController.current = c;
    // Freeze the filter and exclude events recorded after export begins.
    const q = new URL(auditQuery(filters, 1), "https://audit.local")
        .searchParams,
      now = new Date().toISOString();
    if (!q.get("until") || q.get("until")! > now) q.set("until", now);
    const deadline = setTimeout(() => c.abort(), 120000);
    try {
      const data = await collectAudit(async (p) => {
        q.set("page", String(p));
        return clientRequest("/api/system?" + q, undefined, auditListSchema, c);
      });
      if (c.signal.aborted) return;
      const url = URL.createObjectURL(
          new Blob([auditCSV(data)], { type: "text/csv;charset=utf-8" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "audit-edutara.csv";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(`${data.length} catatan diekspor.`);setMessageTone("success");
    } catch (e) {
      if (!mounted.current) return;
      setMessageTone(c.signal.aborted?"info":"error");
      if (!c.signal.aborted)
        setMessage(e instanceof Error ? e.message : "Ekspor gagal.");
      else
        setMessage(
          "Ekspor dibatalkan atau melewati batas waktu. Persempit filter untuk mencoba lagi.",
        );
    } finally {
      clearTimeout(deadline);
      lock.current = false;
      if (exportController.current === c) {
        exportController.current = null;
        setExporting(false);
      }
    }
  }
  return (
    <section className="panel stack audit-page" aria-label="Audit aktivitas">
      <div className="summary-heading">
        <div>
          <h2>Riwayat aktivitas</h2>
          <p className="muted">
            Waktu ditampilkan dalam WIB. Catatan hanya dapat dibaca.
          </p>
        </div>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            disabled={loading || exporting}
            onClick={() => {
              invalidate();
              setVersion((v) => v + 1);
            }}
          >
            Muat ulang
          </Button>
          <Button
            loading={exporting}
            type="button"
            disabled={loading || exporting || !!error || !!invalid || !total}
            onClick={() => void download()}
          >
            {exporting ? "Menyiapkan CSV…" : "Ekspor CSV"}
          </Button>
          {exporting && (
            <Button
              type="button"
              variant="outline"
              onClick={() => exportController.current?.abort()}
            >
              Batalkan ekspor
            </Button>
          )}
        </div>
      </div>
      <fieldset className="audit-filters stack" disabled={exporting}>
        <legend className="sr-only">Filter aktivitas</legend>
        <ListFilters
          label="audit"
          active={
            [
              filters.search && "Pencarian",
              filters.from && "Dari",
              filters.until && "Sebelum",
            ].filter(Boolean) as string[]
          }
          onReset={() => change(empty)}
          total={total}
          loading={loading}
          error={invalid || error}
        >
          <SearchField
            label="Aktor/aksi/objek"
            maxLength={100}
            value={filters.search}
            onChange={(search) => change({ ...filters, search })}
          />
          <label>
            Dari (WIB)
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => change({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            Sebelum (WIB)
            <input
              type="datetime-local"
              value={filters.until}
              onChange={(e) => change({ ...filters, until: e.target.value })}
            />
          </label>
        </ListFilters>
      </fieldset>
      <FeedbackMessage tone={messageTone} role={messageTone==="error"?"alert":"status"} aria-live="polite">
        {message}
      </FeedbackMessage>
      {loading ? (
        <FeedbackMessage tone="loading" role="status">Memuat catatan aktivitas…</FeedbackMessage>
      ) : error || invalid ? (
        <StateCard kind="error" className="empty-state">
          <h3>Catatan belum dapat ditampilkan</h3>
          <p>
            {invalid
              ? "Perbaiki rentang waktu di atas."
              : "Periksa koneksi lalu muat ulang."}
          </p>
        </StateCard>
      ) : !rows.length ? (
        <StateCard kind="no-results" className="empty-state">
          <h3>Belum ada catatan sesuai filter</h3>
          <p>Ubah pencarian atau rentang waktu untuk melihat aktivitas lain.</p>
        </StateCard>
      ) : (
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Catatan aktivitas; geser untuk melihat kolom lain"
        >
          <table className="audit-table">
            <thead>
              <tr>
                <th>Waktu (WIB)</th>
                <th>Aktor</th>
                <th>Aksi</th>
                <th>Objek</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">
                    <time dateTime={r.created_at}>
                      {roomDate(r.created_at)}
                    </time>
                  </th>
                  <td>{r.actor ?? "Otomasi"}</td>
                  <td>{r.action}</td>
                  <td>{r.target_type}</td>
                  <td>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDetail(r)}
                      aria-label={`Detail ${r.action}`}
                    >
                      Detail
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="actions" aria-label="Halaman catatan audit">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || loading || exporting || !!error || !!invalid}
          onClick={() => {
            invalidate();
            setPage((p) => p - 1);
          }}
        >
          Sebelumnya
        </Button>
        <span>
          {loading
            ? "Memuat…"
            : error || invalid
              ? "Jumlah belum tersedia"
              : `${total} catatan · halaman ${page} / ${Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))}`}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={
            page * AUDIT_PAGE_SIZE >= total ||
            loading ||
            exporting ||
            !!error ||
            !!invalid
          }
          onClick={() => {
            invalidate();
            setPage((p) => p + 1);
          }}
        >
          Berikutnya
        </Button>
      </nav>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title="Detail aktivitas"
        description="Identitas catatan dan sasaran tindakan."
        className="audit-dialog"
      >
        {detail && (
          <dl className="audit-detail">
            {Object.entries({
              "ID catatan": detail.id,
              "Waktu (WIB)": roomDate(detail.created_at),
              Aktor: detail.actor ?? "Otomasi",
              Aksi: detail.action,
              Objek: detail.target_type,
              "ID objek": detail.target_id ?? "—",
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Dialog>
    </section>
  );
}
