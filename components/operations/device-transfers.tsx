"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { clientRequest } from "../../lib/client/request";
import { pendingTransfers } from "../../lib/operations/exam-policy";
import { Dialog } from "../ui/dialog";
import { Button } from "../ui/button";

const endpoint = "/api/exam-integrity";
type Transfer = z.infer<typeof pendingTransfers>[number];
export function DeviceTransfers({
  exam, canOperate = true, supervisor = false,
}: { exam: string; canOperate?: boolean; supervisor?: boolean }) {
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
        setTarget((current) => current && data.some((row) => row.id === current.row.id) ? current : undefined);
        setError("");
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        setRows(undefined);
        setTarget(undefined);
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
    if (!canOperate || !target || writing.current || !rows?.some((row) => row.id === target.row.id)) return;
    reading.current?.abort();
    reading.current = null;
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
        setBusy(false);
        setTarget(undefined);
        void load();
      }
    }
  }
  const decisionActions = (
    <div className="actions">
      <Button type="button" loading={busy} disabled={busy || !canOperate} onClick={() => void decide()}>
        {supervisor ? (target?.action === "approve" ? "Setujui perpindahan" : "Tolak permintaan") : "Konfirmasi"}
      </Button>
      <Button type="button" variant="outline" disabled={busy} onClick={() => setTarget(undefined)}>
        Batal
      </Button>
    </div>
  );
  return (
    <details
      className="panel"
      aria-label="Permintaan pindah perangkat"
      open={!!(rows?.length || notice || error) || undefined}
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
                disabled={busy || !canOperate}
                onClick={() => setTarget({ row, action: "approve" })}
              >
                Setujui
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !canOperate}
                onClick={() => setTarget({ row, action: "deny" })}
              >
                Tolak
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {target && (supervisor ? (
        <Dialog
          open={canOperate}
          onOpenChange={(open) => { if (!open && !busy) setTarget(undefined); }}
          className="supervision-dialog"
          title={target.action === "approve" ? "Setujui pindah perangkat?" : "Tolak pindah perangkat?"}
          description={target.action === "approve"
            ? "Cocokkan identitas siswa dan kode permintaan pada perangkat baru. Persetujuan berlaku selama lima menit."
            : "Permintaan ini akan ditutup. Siswa dapat mengajukan permintaan baru jika masih membutuhkan bantuan."}
        >
          <dl className="supervision-dialog-summary">
            <div><dt>Peserta</dt><dd>{target.row.student}</dd></div>
            <div><dt>Ruang</dt><dd>{target.row.room ?? "Belum ditempatkan"}</dd></div>
            <div><dt>Kode permintaan</dt><dd>{target.row.code}</dd></div>
          </dl>
          {decisionActions}
        </Dialog>
      ) : (
        <div className="notice stack">
          <p>{target.action === "approve" ? "Setujui perpindahan" : "Tolak permintaan"} untuk <strong>{target.row.student}</strong>?</p>
          {target.action === "approve" && <p>Cocokkan identitas siswa dan kode perangkat {target.row.code}.</p>}
          {decisionActions}
        </div>
      ))}
    </details>
  );
}
