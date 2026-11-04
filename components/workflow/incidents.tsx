"use client";
import { FeedbackMessage } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchesSearch } from "../../lib/lists/search";
import { SearchField } from "../ui/list-filters";
import { z } from "zod";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { signalsSchema, helpListSchema } from "../../lib/operations/contracts";
import { workflowCommand } from "../../lib/workflow/schema";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import type { Help, Signal } from "../../lib/workflow/schema";
type Participant = {
  student_id: string;
  student: string;
  attempt_id: string | null;
  version: number | null;
  status: string;
  logged_in: boolean;
  can_act: boolean;
};
export function IncidentPanel({
  exam,
  rows,
  admin,
  onChanged,
  paused = false,
  onDialogChange,
}: {
  exam: string;
  rows: Participant[];
  admin: boolean;
  onChanged: () => Promise<void>;
  paused?: boolean;
  onDialogChange?: (open: boolean) => void;
}) {
  const [signals, setSignals] = useState<Signal[]>([]),
    [help, setHelp] = useState<Help[]>([]),
    [message, setMessage] = useState(""),
    [target, setTarget] = useState<Participant | null>(null),
    [ticket, setTicket] = useState<Help | null>(null),
    [minutes, setMinutes] = useState(5),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [readError, setReadError] = useState(""),
    [loading, setLoading] = useState(true),
    [uncertain, setUncertain] = useState(false);
  const [search, setSearch] = useState(""),
    [helpFilter, setHelpFilter] = useState("pending"),
    [page, setPage] = useState(1);
  const reading = useRef<AbortController | null>(null);
  const seq = useRef(0),
    mounted = useRef(true),
    lock = useRef(false),
    pause = useRef(paused),
    dialogOpen = useRef(false),
    controllers = useRef(new Set<AbortController>()),
    flight = useRef<Promise<void> | null>(null),
    retry = useRef<{ signature: string; id: string } | null>(null);
  const request = useCallback(async function request<T>(
    url: string,
    input: object | undefined,
    schema: z.ZodType<T>,
    c = new AbortController(),
  ) {
    controllers.current.add(c);
    try {
      const value = await clientRequest(url, input, schema, c, {
        mutation: !!input,
      });
      if (!mounted.current) throw Error("Permintaan dibatalkan.");
      return value;
    } finally {
      controllers.current.delete(c);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current,
      sequence = seq;
    return () => {
      mounted.current = false;
      sequence.current++;
      flight.current = null;
      reading.current?.abort();
      active.forEach((c) => c.abort());
    };
  }, []);
  const load = useCallback(async () => {
    if (!mounted.current || pause.current || dialogOpen.current || lock.current)
      return;
    if (flight.current) return flight.current;
    const generation = ++seq.current,
      c = new AbortController();
    reading.current = c;
    const promise = (async () => {
      try {
        const results = await Promise.allSettled([
          request(
            "/api/workflow?action=signals&exam=" + exam,
            undefined,
            signalsSchema,
            c,
          ),
          request(
            "/api/workflow?action=help_list&exam=" + exam,
            undefined,
            helpListSchema,
            c,
          ),
        ]);
        const [a, b] = results;
        if (a.status !== "fulfilled") throw a.reason;
        if (b.status !== "fulfilled") throw b.reason;
        if (generation === seq.current) {
          setSignals(a.value);
          setHelp(b.value);
          setReadError("");
        }
      } catch (e) {
        if (mounted.current && generation === seq.current) {
          setSignals([]);
          setHelp([]);
          setReadError(
            e instanceof Error
              ? e.message
              : "Status pelaksanaan belum dapat dimuat.",
          );
        }
      } finally {
        if (mounted.current && generation === seq.current) {
          setLoading(false);
          flight.current = null;
        }
      }
    })();
    flight.current = promise;
    return promise;
  }, [exam, request]);
  useEffect(() => {
    pause.current = paused;
    if (!paused) void load();
  }, [paused, load]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearInterval(timer);
    };
  }, [load]);
  function openDialog() {
    seq.current++;
    reading.current?.abort();
    flight.current = null;
    setLoading(false);
    dialogOpen.current = true;
    onDialogChange?.(true);
  }
  function close() {
    if (lock.current) return;
    dialogOpen.current = false;
    onDialogChange?.(false);
    setTarget(null);
    setTicket(null);
    setUncertain(false);
    setMessage("");
    void Promise.allSettled([load(), onChanged()]);
  }
  const active = rows.filter(
      (r) => r.status === "in_progress" && r.attempt_id && r.version !== null,
    ),
    stale = active.filter(
      (r) =>
        signals.find((s) => s.attempt_id === r.attempt_id)?.connection ===
        "stale",
    ),
    pending = help.filter((h) => !h.resolved_at);
  async function save() {
    if (lock.current || uncertain) return;
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
      const parsed = workflowCommand.parse({
        ...input,
        request_id: retry.current.id,
      });
      await request<unknown>(
        "/api/workflow",
        parsed,
        ticket
          ? z.object({ resolved: z.literal(true) })
          : z.object({
              deadline_at: z
                .string()
                .refine((v) => Number.isFinite(Date.parse(v))),
              minutes: z.number().int().min(1).max(60),
            }),
      );
      retry.current = null;
      dialogOpen.current = false;
      onDialogChange?.(false);
      setTarget(null);
      setTicket(null);
      setUncertain(false);
      lock.current = false;
      const refreshed = await Promise.allSettled([load(), onChanged()]);
      if (!mounted.current) return;
      setMessage(
        refreshed.some((r) => r.status === "rejected")
          ? "Tindakan tersimpan, tetapi status terbaru belum dapat dimuat. Muat ulang untuk memeriksa."
          : ticket
            ? "Permintaan telah ditangani."
            : "Dispensasi tercatat. Timer siswa diperbarui pada pemeriksaan server berikutnya.",
      );
    } catch (e) {
      if (mounted.current) {
        setMessage(
          e instanceof ClientRequestError
            ? e.message
            : "Periksa tanggapan, alasan, menit dan konfirmasi.",
        );
        if (
          e instanceof ClientRequestError &&
          (e.uncertain || e.status === 409)
        )
          setUncertain(true);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const filteredHelp = help.filter(
    (h) =>
      (helpFilter === "all" ||
        (helpFilter === "pending" ? !h.resolved_at : !!h.resolved_at)) &&
      matchesSearch(
        h.student + " " + h.message + " " + (h.resolution || ""),
        search,
      ),
  );
  const helpPages = Math.max(1, Math.ceil(filteredHelp.length / 10)),
    helpPage = Math.min(page, helpPages);
  return (
    <section
      id="bantuan-peserta"
      className="stack incident-panel"
      aria-label="Ringkasan pelaksanaan"
    >
      <h2>Pelaksanaan dan bantuan</h2>
      {loading && !paused && (
        <FeedbackMessage tone="loading" role="status">
          Memuat status pelaksanaan…
        </FeedbackMessage>
      )}
      {paused && (
        <p className="muted">
          Pembaruan bantuan dijeda selama tindakan atau pemuatan peserta.
        </p>
      )}
      {readError && (
        <div role="alert">
          <p>{readError}</p>
          <Button variant="outline" onClick={() => void load()}>
            Coba muat bantuan
          </Button>
        </div>
      )}
      <div className="cards">
        <div>
          <strong className="metric">{paused ? "—" : active.length}</strong>
          <p>Sedang mengerjakan</p>
        </div>
        <div>
          <strong className="metric">
            {paused
              ? "—"
              : rows.filter((r) => r.status === "not_started").length}
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
          <strong className="metric">
            {loading || readError || paused ? "—" : stale.length}
          </strong>
          <p>Perlu cek koneksi</p>
        </div>
        <div>
          <strong className="metric">
            {loading || readError || paused ? "—" : pending.length}
          </strong>
          <p>Menunggu bantuan</p>
        </div>
      </div>
      <details>
        <summary>Tentang indikator koneksi</summary>
        <p className="muted">
          Indikator koneksi memakai kontak server terakhir; lebih dari 45 detik
          perlu diperiksa, bukan bukti pelanggaran. Sesi login tersedia belum
          membuktikan siswa hadir di ruang.
        </p>
      </details>
      <FeedbackMessage tone="info" role="status">
        {message}
      </FeedbackMessage>
      {!paused && !loading && !readError && stale.length > 0 && (
        <details className="notice">
          <summary>Periksa koneksi {stale.length} peserta</summary>
          <ul className="incident-connection-list">
            {stale.map((r) => (
              <li key={r.student_id}>
                {r.student} — kontak terakhir{" "}
                {(() => {const seen=signals.find(s=>s.attempt_id===r.attempt_id)?.last_seen_at;return seen ? new Date(seen).toLocaleTimeString("id-ID",{timeZone:"Asia/Jakarta"})+" WIB" : "belum tersedia";})()}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="incident-actions">
        <div>
          <details>
            <summary>Panduan penanganan peserta</summary>
            <p>
              Lanjut sesi: siswa masuk kembali. Buka kunci: batalkan penguncian
              setelah peninjauan. Reset: mulai percobaan baru dengan riwayat dan
              deadline lama tetap dipertahankan. Dispensasi: tambahan waktu
              eksplisit oleh Admin.
            </p>
          </details>
        </div>
        {admin && (
          <label>
            Dispensasi untuk peserta
            <select
              disabled={busy || paused || !!readError || loading}
              value=""
              onChange={(e) => {
                const r = rows.find((r) => r.attempt_id === e.target.value);
                if (r && !lock.current) {
                  openDialog();
                  setMessage("");
                  setUncertain(false);
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
      <details open={pending.length > 0 || undefined}>
        <summary>
          Permintaan bantuan (
          {loading || readError
            ? "status belum tersedia"
            : pending.length + " terbuka"}
          )
        </summary>
        <div className="incident-help-filters">
          <SearchField
            label="Cari bantuan"
            value={search}
            maxLength={150}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <label>
            Status bantuan
            <select
              value={helpFilter}
              onChange={(e) => {
                setHelpFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="pending">Menunggu</option>
              <option value="resolved">Ditangani</option>
              <option value="all">Semua</option>
            </select>
          </label>
        </div>
        <ul className="agenda-list">
          {filteredHelp.slice((helpPage - 1) * 10, helpPage * 10).map((h) => (
            <li key={h.id}>
              <div>
                <strong>
                  {h.student} · {h.resolved_at ? "Ditangani" : "Menunggu"}
                </strong>
                <p className="answer-text">{h.message}</p>
                <small>
                  {new Date(h.created_at).toLocaleString("id-ID", {
                    timeZone: "Asia/Jakarta",
                  })}{" "}
                  WIB
                </small>
                {h.resolution && <p>Tanggapan: {h.resolution}</p>}
              </div>
              {!h.resolved_at && h.can_resolve && (
                <Button
                  variant="outline"
                  disabled={busy || paused || !!readError}
                  onClick={() => {
                    if (lock.current) return;
                    openDialog();
                    setMessage("");
                    setUncertain(false);
                    setTicket({ ...h });
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
        {!loading && !readError && !filteredHelp.length && (
          <p>
            {help.length
              ? "Tidak ada bantuan yang cocok dengan pencarian dan status ini."
              : "Belum ada permintaan bantuan."}
          </p>
        )}
        {helpPages > 1 && (
          <nav className="actions" aria-label="Halaman bantuan">
            <Button
              variant="outline"
              disabled={helpPage <= 1}
              onClick={() => setPage(helpPage - 1)}
            >
              Bantuan sebelumnya
            </Button>
            <span>
              {helpPage} / {helpPages}
            </span>
            <Button
              variant="outline"
              disabled={helpPage >= helpPages}
              onClick={() => setPage(helpPage + 1)}
            >
              Bantuan berikutnya
            </Button>
          </nav>
        )}
      </details>
      <Dialog
        open={!!target || !!ticket}
        onOpenChange={(v) => {
          if (!v) close();
        }}
        title={
          ticket ? "Tanggapi permintaan bantuan" : "Dispensasi waktu ujian"
        }
        className="incident-dialog"
        description={
          ticket
            ? "Tanggapan tersimpan dalam riwayat dan ditampilkan kepada siswa."
            : "Hanya sesi aktif sebelum deadline. Maksimal 60 menit per tindakan, tidak boleh melewati akhir jadwal."
        }
      >
        <ValidatedForm
          className="stack"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset
            className="monitor-controls stack"
            disabled={busy || uncertain}
          >
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
            <Button disabled={busy || uncertain}>
              {busy
                ? "Menyimpan…"
                : ticket
                  ? "Tandai ditangani"
                  : "Berikan dispensasi"}
            </Button>
            <FeedbackMessage tone="info" role="status">
              {message}
            </FeedbackMessage>
          </fieldset>
          {uncertain && (
            <div role="alert">
              <p>
                Periksa ulang status bantuan atau deadline sebelum mengirim
                lagi.
              </p>
              <Button type="button" variant="outline" onClick={close}>
                Tutup dan periksa ulang
              </Button>
            </div>
          )}
        </ValidatedForm>
      </Dialog>
    </section>
  );
}
