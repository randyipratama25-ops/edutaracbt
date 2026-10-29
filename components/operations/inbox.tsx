"use client";
import { useCallback, useEffect, useState } from "react";
import { api, useLive } from "./shared";
import { Button } from "../ui/button";
type Message = {
  id: string;
  message: string;
  created_at: string;
  read_at: string | null;
};
export function Inbox() {
  const [items, setItems] = useState<Message[]>([]),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      setItems(await api<Message[]>("/api/operations?action=inbox"));
      setError("");
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "Pesan gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useLive(load, true);
  const unread = items.filter((m) => !m.read_at).length;
  return (
    <section className="panel">
      <Button variant="outline" onClick={() => setOpen(!open)}>
        Pesan petugas {unread > 0 ? `(${unread} belum dibaca)` : ""}
      </Button>
      <p role="status">{error}</p>
      {open && (
        <div className="stack ops-choice-list">
          {!items.length && <p>Belum ada pesan.</p>}
          {items.map((m) => (
            <article key={m.id}>
              <small>{new Date(m.created_at).toLocaleString("id-ID")}</small>
              <p className="answer-text">{m.message}</p>
              {m.read_at ? (
                <small>
                  Dibaca {new Date(m.read_at).toLocaleString("id-ID")}
                </small>
              ) : (
                <Button
                  disabled={busy === m.id}
                  onClick={() => {
                    setBusy(m.id);
                    void api("/api/operations", { action: "read", id: m.id })
                      .then(load)
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(""));
                  }}
                >
                  Tandai dibaca
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
