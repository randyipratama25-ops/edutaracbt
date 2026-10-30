"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../operations/shared";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import type { Help } from "../../lib/workflow/schema";
export function StudentHelp({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Help[]>([]),
    [message, setMessage] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  const retry = useRef<{ text: string; id: string } | null>(null),
    lock = useRef(false);
  const load = useCallback(async () => {
    try {
      setRows(
        await api<Help[]>(
          "/api/workflow?action=help_list&attempt=" + attemptId,
        ),
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Permintaan belum dapat dimuat.",
      );
    }
  }, [attemptId]);
  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [open, load]);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Minta bantuan
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        title="Bantuan pengawas"
        description="Jawaban tetap tersimpan dan waktu terus berjalan. Jika koneksi terputus, hubungi pengawas langsung."
      >
        <form
          className="stack"
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            setMessage("");
            try {
              if (retry.current?.text !== text)
                retry.current = { text, id: crypto.randomUUID() };
              const r = await api<{ message: string }>("/api/workflow", {
                action: "help",
                attempt_id: attemptId,
                request_id: retry.current.id,
                message: text,
              });
              setMessage(r.message);
              retry.current = null;
              setText("");
              await load();
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "Bantuan belum terkirim.",
              );
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          <label>
            Jelaskan kendala
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy || rows.some((r) => !r.resolved_at)}
            />
          </label>
          <Button disabled={busy || rows.some((r) => !r.resolved_at)}>
            Kirim permintaan
          </Button>
          <p role="status">{message}</p>
          <ul className="agenda-list">
            {rows.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>
                    {r.resolved_at ? "Sudah ditangani" : "Menunggu pengawas"}
                  </strong>
                  <p>{r.message}</p>
                  {r.resolution && <p>Tanggapan: {r.resolution}</p>}
                </div>
              </li>
            ))}
          </ul>
          {!rows.length && <p>Belum ada permintaan bantuan.</p>}
        </form>
      </Dialog>
    </>
  );
}
