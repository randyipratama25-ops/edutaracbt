"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ValidatedForm } from "../feedback/validated-form";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";
import { clientRequest } from "../../lib/client/request";
const helpRows = z.array(
  z.object({
    id: z.string(),
    attempt_id: z.string(),
    student: z.string(),
    message: z.string(),
    created_at: z.iso.datetime({ offset: true }),
    resolved_at: z.iso.datetime({ offset: true }).nullable(),
    resolution: z.string().nullable(),
    can_resolve: z.boolean(),
  }),
);
export function StudentHelp({ attemptId }: { attemptId: string }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<z.infer<typeof helpRows>>([]),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false);
  const retry = useRef<{ text: string; id: string } | null>(null),
    lock = useRef(false),
    mounted = useRef(false),
    sequence = useRef(0),
    read = useRef<AbortController | null>(null),
    write = useRef<AbortController | null>(null),
    flight = useRef<Promise<void> | null>(null);
  const load = useCallback(
    (force = false): Promise<void> => {
      if (!mounted.current || (!force && lock.current))
        return Promise.resolve();
      if (flight.current) return flight.current;
      const seq = ++sequence.current,
        c = new AbortController();
      read.current = c;
      setLoading(true);
      const promise = (async () => {
        try {
          const next = await clientRequest(
            "/api/workflow?action=help_list&attempt=" +
              encodeURIComponent(attemptId),
            undefined,
            helpRows,
            c,
          );
          if (!mounted.current || seq !== sequence.current) return;
          setRows(next);
          setLoaded(true);
          setError("");
          if (next.some((r) => !r.resolved_at)) retry.current = null;
        } catch (e) {
          if (mounted.current && seq === sequence.current)
            setError(
              e instanceof Error
                ? e.message
                : "Permintaan bantuan belum dapat dimuat.",
            );
        } finally {
          if (mounted.current && seq === sequence.current) {
            setLoading(false);
            flight.current = null;
          }
        }
      })();
      flight.current = promise;
      return promise;
    },
    [attemptId],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      read.current?.abort();
      write.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const generation = sequence;
    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (active) timer = setTimeout(() => void tick(), 10000);
    };
    void tick();
    return () => {
      active = false;
      generation.current++;
      read.current?.abort();
      flight.current = null;
      clearTimeout(timer);
    };
  }, [open, load]);
  const pending = rows.some((r) => !r.resolved_at);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Minta bantuan
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!lock.current) setOpen(v);
        }}
        title="Bantuan pengawas"
        description="Waktu ujian tetap berjalan. Periksa status simpan jawaban. Saat koneksi terputus, hubungi pengawas langsung."
      >
        {loading && (
          <FeedbackMessage tone="loading" role="status">
            Memuat permintaan bantuan…
          </FeedbackMessage>
        )}
        {error && (
          <StateCard
            kind="error"
            description={error}
            actions={
              <Button
                type="button"
                disabled={busy || loading}
                onClick={() => void load()}
              >
                Coba muat bantuan
              </Button>
            }
          />
        )}
        <ValidatedForm
          className="stack"
          aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            if (lock.current || !loaded || error || pending) return;
            if (text.trim().length < 5) {
              setMessage("Jelaskan kendala minimal 5 karakter, selain spasi.");
              return;
            }
            lock.current = true;
            sequence.current++;
            read.current?.abort();
            flight.current = null;
            setBusy(true);
            setLoading(false);
            setMessage("");
            const c = new AbortController();
            write.current = c;
            try {
              if (retry.current?.text !== text)
                retry.current = { text, id: crypto.randomUUID() };
              const r = await clientRequest(
                "/api/workflow",
                {
                  action: "help",
                  attempt_id: attemptId,
                  request_id: retry.current.id,
                  message: text,
                },
                z.object({ id: z.string().min(1), message: z.string().min(1) }),
                c,
                { mutation: true },
              );
              if (!mounted.current) return;
              retry.current = null;
              setText("");
              setMessage(r.message);
              await load(true);
            } catch (e) {
              if (mounted.current)
                setMessage(
                  e instanceof Error ? e.message : "Bantuan belum terkirim.",
                );
            } finally {
              lock.current = false;
              if (mounted.current) setBusy(false);
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
              disabled={busy || pending || !loaded || !!error}
            />
          </label>
          <Button disabled={busy || pending || !loaded || !!error}>
            {busy ? "Mengirim…" : "Kirim permintaan"}
          </Button>
          <FeedbackMessage tone="info" role="status">
            {message}
          </FeedbackMessage>
          {pending && (
            <p className="muted">
              Permintaan Anda sedang menunggu tanggapan. Tidak perlu mengirim
              ulang.
            </p>
          )}
        </ValidatedForm>
        <ul className="agenda-list student-help-history">
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
        {loaded && !loading && !error && !rows.length && (
          <p>Belum ada permintaan bantuan.</p>
        )}
      </Dialog>
    </>
  );
}
