"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../operations/shared";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import type { Help, Signal } from "../../lib/workflow/schema";
type Participant = {
  student_id: string;
  student: string;
  attempt_id: string | null;
  version: number;
  status: string;
  logged_in: boolean;
  can_act: boolean;
};
export function IncidentPanel({
  exam,
  rows,
  admin,
  onChanged,
}: {
  exam: string;
  rows: Participant[];
  admin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [signals, setSignals] = useState<Signal[]>([]),
    [help, setHelp] = useState<Help[]>([]),
    [message, setMessage] = useState(""),
    [target, setTarget] = useState<Participant | null>(null),
    [ticket, setTicket] = useState<Help | null>(null),
    [minutes, setMinutes] = useState(5),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false);
  const seq = useRef(0),
    lock = useRef(false),
    retry = useRef<{ signature: string; id: string } | null>(null);
  const load = useCallback(async () => {
    const s = ++seq.current;
    try {
      const [a, b] = await Promise.all([
        api<Signal[]>("/api/workflow?action=signals&exam=" + exam),
        api<Help[]>("/api/workflow?action=help_list&exam=" + exam),
      ]);
      if (s === seq.current) {
        setSignals(a);
        setHelp(b);
      }
    } catch (e) {
      if (s === seq.current) {
        setSignals([]);
        setHelp([]);
        setMessage(
          e instanceof Error
            ? e.message
            : "Status pelaksanaan belum dapat dimuat.",
        );
      }
    }
  }, [exam]);
  const invalidateRequests=useCallback(()=>{seq.current++;},[]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearInterval(timer);
      invalidateRequests();
    };
  }, [load,invalidateRequests]);
  const active = rows.filter((r) => r.status === "in_progress"),
    stale = active.filter(
      (r) =>
        signals.find((s) => s.attempt_id === r.attempt_id)?.connection ===
        "stale",
    ),
    pending = help.filter((h) => !h.resolved_at);
  async function save() {
    if (lock.current) return;
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
      await api("/api/workflow", { ...input, request_id: retry.current.id });
      retry.current = null;
      setTarget(null);
      setTicket(null);
      await Promise.all([load(), onChanged()]);
      setMessage(
        ticket
          ? "Permintaan telah ditangani."
          : "Dispensasi tercatat. Timer siswa diperbarui pada pemeriksaan server berikutnya.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Tindakan gagal.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="stack incident-panel"
      aria-label="Ringkasan pelaksanaan"
    >
      <h2>Pelaksanaan dan bantuan</h2>
      <div className="cards">
        <div>
          <strong className="metric">{active.length}</strong>
          <p>Sedang mengerjakan</p>
        </div>
        <div>
          <strong className="metric">
            {rows.filter((r) => r.status === "not_started").length}
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
          <strong className="metric">{stale.length}</strong>
          <p>Perlu cek koneksi</p>
        </div>
        <div>
          <strong className="metric">{pending.length}</strong>
          <p>Menunggu bantuan</p>
        </div>
      </div>
      <p className="muted">
        Indikator koneksi memakai kontak server terakhir; lebih dari 45 detik
        perlu diperiksa, bukan bukti pelanggaran. Sesi login tersedia belum
        membuktikan siswa hadir di ruang.
      </p>
      <p role="status">{message}</p>
      {stale.length > 0 && (
        <div className="notice">
          <strong>Periksa peserta berikut</strong>
          <ul>
            {stale.map((r) => (
              <li key={r.student_id}>
                {r.student} — kontak terakhir{" "}
                {new Date(
                  signals.find((s) => s.attempt_id === r.attempt_id)!
                    .last_seen_at!,
                ).toLocaleTimeString("id-ID")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="incident-actions">
        <div>
          <h3>Pilih penanganan sesuai masalah</h3>
          <p>
            Lanjut sesi: siswa masuk kembali. Buka kunci: batalkan penguncian
            setelah peninjauan. Reset: mulai percobaan baru dengan riwayat dan
            deadline lama tetap dipertahankan. Dispensasi: tambahan waktu
            eksplisit oleh Admin.
          </p>
        </div>
        {admin && (
          <label>
            Dispensasi untuk peserta
            <select
              value=""
              onChange={(e) => {
                const r = rows.find((r) => r.attempt_id === e.target.value);
                if (r) {
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
        <summary>Permintaan bantuan ({pending.length} terbuka)</summary>
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
                  onClick={() => {
                    setTicket(h);
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
        {!help.length && <p>Belum ada permintaan bantuan.</p>}
      </details>
      <Dialog
        open={!!target || !!ticket}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setTarget(null);
            setTicket(null);
          }
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
          <Button disabled={busy}>
            {ticket ? "Tandai ditangani" : "Berikan dispensasi"}
          </Button>
          <p role="status">{message}</p>
        </form>
      </Dialog>
    </section>
  );
}
