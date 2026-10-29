"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
type Row = {
  id: string;
  title: string;
  student: string;
  status: string;
  deadline_at: string;
  events: number;
  countable_events: number;
  finalized_at: string | null;
  review_reason: string | null;
};
export function ReviewPanel() {
  const [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [action, setAction] = useState("events"),
    [events, setEvents] = useState<
      {
        kind: string;
        countable: boolean;
        created_at: string;
        metadata: unknown;
      }[]
    >([]),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/review");
    const j = await r.json();
    if (!r.ok) throw Error(j.error?.message);
    setRows(j.data);
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  async function run(kind: string, row: Row) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind,
          attempt_id: row.id,
          ...(kind === "events" ? {} : { reason }),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message);
      if (kind === "events") setEvents(j.data);
      else {
        setSelected(null);
        setMessage(
          j.data.message || "Keputusan tersimpan; deadline tidak ditambah.",
        );
        await load();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel stack">
      <p>
        Hanya attempt dalam cakupan penugasan efektif yang ditampilkan. Kejadian
        browser adalah bahan peninjauan, bukan bukti tunggal kecurangan.
      </p>
      <Button
        variant="outline"
        onClick={() => void load().catch((e) => setMessage(e.message))}
      >
        Muat ulang monitor
      </Button>
      <p role="status">{message}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Siswa</th>
              <th>Ujian</th>
              <th>Status</th>
              <th>Kejadian</th>
              <th>Deadline</th>
              <th>Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.student}</td>
                <td>{r.title}</td>
                <td>{r.status}</td>
                <td>
                  {r.countable_events} perlu ditinjau / {r.events} tercatat
                </td>
                <td>{new Date(r.deadline_at).toLocaleString("id-ID")}</td>
                <td>
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setSelected(r);
                        setAction("events");
                        setEvents([]);
                        void run("events", r);
                      }}
                    >
                      Lihat kejadian
                    </Button>
                    {!r.finalized_at && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setSelected(r);
                          setAction(
                            r.status === "disqualified"
                              ? "unlock"
                              : "disqualify",
                          );
                          setReason("");
                        }}
                      >
                        {r.status === "disqualified"
                          ? "Buka kunci"
                          : "Tinjau diskualifikasi"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>Belum ada attempt yang dapat ditinjau.</p>}
      <Dialog
        open={!!selected}
        onOpenChange={() => setSelected(null)}
        title={
          action === "events"
            ? "Riwayat kejadian"
            : action === "unlock"
              ? "Buka kunci attempt"
              : "Tinjau diskualifikasi"
        }
        description="Keputusan dilakukan oleh pengawas/Admin berizin dan dicatat dengan alasan. Membuka kunci tidak menambah waktu."
      >
        {action === "events" ? (
          <ol>
            {events.map((e, i) => (
              <li key={i}>
                {new Date(e.created_at).toLocaleString("id-ID")} · {e.kind} ·{" "}
                {e.countable ? "Perlu ditinjau" : "Informasi/toleransi"}
                <pre>{JSON.stringify(e.metadata, null, 2)}</pre>
              </li>
            ))}
          </ol>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selected) void run(action, selected);
            }}
            className="stack"
          >
            <label>
              Alasan keputusan
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button disabled={busy}>Simpan keputusan</Button>
          </form>
        )}
        <p role="status">{message}</p>
      </Dialog>
    </section>
  );
}
