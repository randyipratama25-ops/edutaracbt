"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { clientRequest } from "../../lib/client/request";
import { pendingTransfers } from "../../lib/operations/exam-policy";
import { Button } from "../ui/button";

const endpoint = "/api/exam-integrity";
type Transfer = z.infer<typeof pendingTransfers>[number];
export function DeviceTransfers({ exam }: { exam: string }) {
  const [rows, setRows] = useState<Transfer[]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [target, setTarget] = useState<{
    row: Transfer;
    action: "approve" | "deny";
  }>();
  const [busy, setBusy] = useState(false);
  const reading = useRef<AbortController | null>(null);
  const writing = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (reading.current || writing.current) return;
    const controller = new AbortController();
    reading.current = controller;
    try {
      const data = await clientRequest(
        endpoint + "?action=transfers&exam=" + exam,
        undefined,
        pendingTransfers,
        controller,
      );
      if (!controller.signal.aborted) {
        setRows(data);
        setError("");
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setRows(undefined);
        setError(
          reason instanceof Error
            ? reason.message
            : "Permintaan perangkat belum dapat dimuat.",
        );
      }
    } finally {
      if (reading.current === controller) reading.current = null;
    }
  }, [exam]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 6000);
    return () => {
      window.clearInterval(timer);
      reading.current?.abort();
      writing.current?.abort();
      reading.current = null;
      writing.current = null;
    };
  }, [load]);
  async function decide() {
    if (!target || writing.current) return;
    const controller = new AbortController();
    writing.current = controller;
    setBusy(true);
    setNotice("");
    try {
      await clientRequest(
        endpoint,
        { action: target.action, id: target.row.id },
        z.object({ saved: z.literal(true) }),
        controller,
        { mutation: true },
      );
      if (!controller.signal.aborted)
        setNotice(
          target.action === "approve"
            ? "Disetujui. Siswa dapat melanjutkan dari perangkat pemohon dalam lima menit."
            : "Permintaan ditolak.",
        );
    } catch (reason) {
      if (!controller.signal.aborted)
        setNotice(
          reason instanceof Error
            ? reason.message
            : "Keputusan belum dapat dipastikan.",
        );
    } finally {
      if (writing.current === controller) {
        writing.current = null;
        reading.current?.abort();
        reading.current = null;
        setBusy(false);
        setTarget(undefined);
        void load();
      }
    }
  }
  return (
    <details
      className="panel"
      aria-label="Permintaan pindah perangkat"
      open={!!rows?.length || undefined}
    >
      <summary>
        Permintaan pindah perangkat{rows?.length ? ` (${rows.length})` : ""}
      </summary>
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows ? (
        <p role="status">Memuat permintaan…</p>
      ) : (
        !rows.length && <p>Belum ada permintaan menunggu.</p>
      )}
      {notice && <p role="status">{notice}</p>}
      <ul className="agenda-list">
        {rows?.map((row) => (
          <li key={row.id}>
            <div>
              <strong>{row.student}</strong>
              <p>
                {row.room ?? "Belum ditempatkan"} · Kode {row.code} ·{" "}
                {new Date(row.created_at).toLocaleTimeString("id-ID", {
                  timeZone: "Asia/Jakarta",
                })}{" "}
                WIB
              </p>
            </div>
            <div className="actions">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setTarget({ row, action: "approve" })}
              >
                Setujui
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setTarget({ row, action: "deny" })}
              >
                Tolak
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {target && (
        <div className="notice stack">
          <p>
            {target.action === "approve"
              ? "Setujui perpindahan"
              : "Tolak permintaan"}{" "}
            untuk <strong>{target.row.student}</strong>?
          </p>
          {target.action === "approve" && (
            <p>
              Cocokkan identitas siswa dan kode perangkat {target.row.code}.
            </p>
          )}
          <div className="actions">
            <Button type="button" disabled={busy} onClick={() => void decide()}>
              Konfirmasi
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setTarget(undefined)}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </details>
  );
}
