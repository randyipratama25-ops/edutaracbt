"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { z } from "zod";
import { clientRequest } from "../../lib/client/request";
import {
  integrityFollowup,
  integrityHistory,
  integrityLabels,
  type IntegrityHistory,
} from "../../lib/operations/integrity";
import { Button } from "../ui/button";

const endpoint = "/api/operations/integrity";
const receipt = z.object({ saved: z.literal(true) });
const actions = {
  warn: "Kirim peringatan",
  note: "Catat klarifikasi",
  resolve: "Tutup insiden",
} as const;
const time = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "short",
  timeStyle: "medium",
});
type Action = keyof typeof actions;

export function IntegrityReview({
  attempt,
  active,
}: {
  attempt: string;
  active: boolean;
}) {
  const [data, setData] = useState<IntegrityHistory>();
  const [readError, setReadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editing, setEditing] = useState<{ group: string; action: Action }>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const retry = useRef<{ signature: string; id: string } | null>(null);

  const load = useCallback(async () => {
    if (reading.current) return;
    const controller = new AbortController();
    reading.current = controller;
    try {
      const next = await clientRequest(
        endpoint + "?attempt=" + attempt,
        undefined,
        integrityHistory,
        controller,
      );
      if (reading.current === controller) {
        setData(next);
        setReadError("");
      }
    } catch (error) {
      if (reading.current === controller) {
        setData(undefined);
        setReadError(
          error instanceof Error
            ? error.message
            : "Insiden belum dapat dimuat.",
        );
      }
    } finally {
      if (reading.current === controller) reading.current = null;
    }
  }, [attempt]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearInterval(timer);
      reading.current?.abort();
      reading.current = null;
      writing.current?.abort();
      writing.current = null;
    };
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || writing.current) return;
    const input = {
      attempt_id: attempt,
      group_id: editing.group,
      action: editing.action,
      message: message.trim(),
    };
    const signature = JSON.stringify(input);
    if (retry.current?.signature !== signature)
      retry.current = { signature, id: crypto.randomUUID() };
    const controller = new AbortController();
    writing.current = controller;
    setBusy(true);
    setFeedback("");
    try {
      const payload = integrityFollowup.parse({
        ...input,
        request_id: retry.current.id,
      });
      await clientRequest(endpoint, payload, receipt, controller, {
        mutation: true,
      });
      if (writing.current !== controller) return;
      retry.current = null;
      setEditing(undefined);
      setMessage("");
      setFeedback(
        input.action === "warn"
          ? "Peringatan tersimpan. Siswa akan melihatnya saat sesi tersambung."
          : "Tindak lanjut tersimpan.",
      );
    } catch (error) {
      if (writing.current === controller)
        setFeedback(
          error instanceof Error
            ? error.message
            : "Tindak lanjut belum tersimpan.",
        );
    } finally {
      if (writing.current === controller) {
        writing.current = null;
        setBusy(false);
        reading.current?.abort();
        reading.current = null;
        void load();
      }
    }
  }

  const groups = new Map<string, IntegrityHistory["events"]>();
  for (const event of data?.events ?? []) {
    const group = groups.get(event.group_id) ?? [];
    group.push(event);
    groups.set(event.group_id, group);
  }
  const followups = new Map<string, IntegrityHistory["followups"]>();
  for (const item of data?.followups ?? []) {
    const group = followups.get(item.group_id) ?? [];
    group.push(item);
    followups.set(item.group_id, group);
  }
  return (
    <section className="stack" aria-label="Insiden integritas ujian">
      <h3>Rangkaian kejadian</h3>
      <p className="muted">
        Periksa kejadian bersama kondisi siswa. Waktu dari perangkat ditampilkan
        jika tersedia.
      </p>
      {readError ? (
        <p role="alert">{readError}</p>
      ) : !data ? (
        <p role="status">Memuat insiden…</p>
      ) : null}
      {data && !groups.size && <p>Belum ada kejadian tercatat.</p>}
      {feedback && <p role="status">{feedback}</p>}
      {[...groups].map(([id, events]) => {
        const history = followups.get(id) ?? [];
        const closed = history.some((item) => item.action === "resolve");
        const needsReview = data?.open_groups.includes(id);
        const ordered = [...events].sort(
          (a, b) =>
            Date.parse(a.metadata?.occurred_at ?? a.created_at) -
            Date.parse(b.metadata?.occurred_at ?? b.created_at),
        );
        const first = ordered[0];
        return (
          <details key={id} className="panel">
            <summary>
              {closed
                ? "Ditutup"
                : needsReview
                  ? "Perlu ditinjau"
                  : "Informasi"}{" "}
              ·{" "}
              {time.format(
                new Date(first.metadata?.occurred_at ?? first.created_at),
              )}{" "}
              WIB · {events.length} kejadian
            </summary>
            <ol className="monitor-timeline">
              {ordered.map((item) => (
                <li key={item.event_id}>
                  <strong>{integrityLabels[item.kind] ?? item.kind}</strong>
                  <time
                    dateTime={item.metadata?.occurred_at ?? item.created_at}
                  >
                    {time.format(
                      new Date(item.metadata?.occurred_at ?? item.created_at),
                    )}{" "}
                    WIB
                  </time>
                  <p>
                    {item.metadata?.question_number
                      ? `Soal ${item.metadata.question_number} · `
                      : ""}
                    {item.metadata?.duration_ms
                      ? `${(item.metadata.duration_ms / 1000).toLocaleString("id-ID")} detik · `
                      : ""}
                    {item.metadata?.editing ? "Sedang mengisi kolom · " : ""}
                    {item.metadata?.orientation_recent
                      ? "Tampilan baru berubah · "
                      : ""}
                    {item.countable
                      ? "Sinyal untuk ditinjau"
                      : "Catatan informasi"}
                  </p>
                </li>
              ))}
              {[...history].reverse().map((item) => (
                <li key={item.id}>
                  <strong>
                    {actions[item.action]} · {item.actor}
                  </strong>
                  <time dateTime={item.created_at}>
                    {time.format(new Date(item.created_at))} WIB
                  </time>
                  <p className="answer-text">{item.message}</p>
                </li>
              ))}
            </ol>
            {!closed && (
              <div className="actions">
                {(Object.keys(actions) as Action[])
                  .filter((action) => action !== "warn" || active)
                  .map((action) => (
                    <Button
                      key={action}
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditing({ group: id, action });
                        setMessage("");
                        setFeedback("");
                      }}
                    >
                      {actions[action]}
                    </Button>
                  ))}
              </div>
            )}
            {!closed && editing?.group === id && (
              <form className="stack" onSubmit={(event) => void save(event)}>
                <label>
                  {actions[editing.action]}
                  <textarea
                    required
                    minLength={5}
                    maxLength={1000}
                    value={message}
                    disabled={busy}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
                <div className="actions">
                  <Button
                    type="submit"
                    disabled={busy || message.trim().length < 5}
                  >
                    Simpan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing(undefined)}
                  >
                    Batal
                  </Button>
                </div>
              </form>
            )}
          </details>
        );
      })}
    </section>
  );
}
