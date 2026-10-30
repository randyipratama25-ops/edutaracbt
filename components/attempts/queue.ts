"use client";
import { useEffect, useRef, useState } from "react";
import { pruneAcknowledgedDrafts, clearDeviceDrafts, parseDraft, sameAnswer, type AnswerValue, type RecoveryRow } from "../../lib/attempts/recovery";
export type Value = AnswerValue;
export type Saved = { question_id: string; revision: number; value: Value };
export class AttemptError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function command(input: unknown) {
  const r = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(12000),
  });
  const j = await r.json();
  if (!r.ok) throw new AttemptError(j.error?.message || "Permintaan gagal.", r.status);
  return j.data;
}
type Pending = { value: Value; generation: number };
type Conflict = { revision: number; value: Value };
export function useAnswerQueue(
  writer: { attempt_id: string; client_id: string; epoch: number },
  initial: Saved[],
  onTerminal: (data: unknown) => void,
  recovery?: { ownerId: string; enabled: boolean; finalized?: boolean; questionIds: string[] },
) {
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(initial.map((a) => [a.question_id, a.value])),
  );
  const [status, setStatus] = useState("Semua perubahan sudah diakui server.");
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<Record<string, Conflict>>({});
  const [tick, setTick] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const mounted = useRef(true), transientFailure = useRef(false);
  const storageKey = recovery ? `edutara:draft:v1:${recovery.ownerId}:${writer.attempt_id}:${writer.client_id}` : null;
  const currentValues = useRef(values);
  const serverValues = useRef({ ...values });
  function persist() {
    if (!storageKey || !mounted.current) return;
    try {
      if (!pending.current.size) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ version: 1, epoch: writer.epoch,
        updatedAt: Date.now(), rows: Object.fromEntries(Array.from(pending.current, ([id, row]) =>
          [id, { value: row.value, revision: revisions.current[id] || 0 }])) }));
    } catch {
      setRecoveryMessage("Penyimpanan draf perangkat tidak tersedia/penuh. Jangan muat ulang sebelum jawaban tersimpan di server.");
    }
  }
  const revisions = useRef<Record<string, number>>(
      Object.fromEntries(initial.map((a) => [a.question_id, a.revision])),
    ),
    pending = useRef(new Map<string, Pending>()),
    generation = useRef(0),
    sending = useRef(false),
    stalled = useRef(false),
    retryBatch = useRef<{
      input: unknown;
      rows: { id: string; generation: number }[];
    } | null>(null),
    conflictRef = useRef<Record<string, Conflict>>({});
  function change(id: string, value: Value) {
    if (recovery && !recovery.enabled) return;
    currentValues.current = { ...currentValues.current, [id]: value };
    setValues(currentValues.current);
    pending.current.set(id, { value, generation: ++generation.current });
    persist();
    setPendingCount(pending.current.size);
    setStatus("Ada perubahan belum tersimpan.");
    setTick((t) => t + 1);
  }
  async function flush() {
    if (!mounted.current || (recovery && !recovery.enabled)) return false;
    if (sending.current) return false;
    if (!pending.current.size) return true;
    if (Object.keys(conflictRef.current).length) return false;
    sending.current = true;
    setStatus("Menyimpan jawaban…");
    const batch = retryBatch.current || {
      input: {
        action: "save",
        ...writer,
        request_id: crypto.randomUUID(),
        answers: Array.from(pending.current.entries())
          .slice(0, 100)
          .map(([id, p]) => ({
            question_id: id,
            expected_revision: revisions.current[id] || 0,
            value: p.value,
          })),
      },
      rows: Array.from(pending.current.entries())
        .slice(0, 100)
        .map(([id, p]) => ({ id, generation: p.generation })),
    };
    retryBatch.current = batch;
    try {
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (!mounted.current) return false;
          result = await command(batch.input);
          break;
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Jaringan tidak tersedia.";
          if ((e instanceof AttemptError && e.status < 500) || /CONFLICT|AUTH|valid|terlalu besar/i.test(msg) || attempt === 2)
            throw e;
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt),
          );
        }
      }
      if (!mounted.current) return false;
      transientFailure.current = false;
      if (result?.id && result?.status) {
        stalled.current = true;
        retryBatch.current = null;
        setStatus(
          "Attempt tidak menerima perubahan lagi; gunakan status akhir dari server.",
        );
        if (result.finalized_at && storageKey) {
          try { clearDeviceDrafts(recovery!.ownerId, writer.attempt_id); } catch { /* Keep server receipt available. */ }
        }
        onTerminal(result);
        return false;
      }
      if (!Array.isArray(result?.acknowledgements))
        throw Error("Server belum memberikan pengakuan simpan.");
      if (result.acknowledgements.some((ack: { question_id: string; revision: number; saved: boolean }) =>
        !ack || typeof ack.question_id !== "string" || typeof ack.saved !== "boolean" || !Number.isInteger(ack.revision) || ack.revision < 0))
        throw Error("Pengakuan server tidak valid; jawaban tetap dalam antrean.");
      const received = new Set(result.acknowledgements.map((ack: { question_id: string }) => ack.question_id));
      if (batch.rows.some(row => !received.has(row.id))) throw Error("Pengakuan server tidak lengkap; batch akan diperiksa ulang.");
      const nextConflicts = { ...conflictRef.current };
      for (const ack of result.acknowledgements) {
        const row = batch.rows.find((r) => r.id === ack.question_id);
        if (!row) continue;
        if (ack.saved) {
          revisions.current[ack.question_id] = ack.revision;
          const sent = (batch.input as { answers: { question_id: string; value: Value }[] }).answers.find(answer => answer.question_id === ack.question_id);
          if (sent) {
            serverValues.current[ack.question_id] = sent.value;
            if (recovery) {
              try { pruneAcknowledgedDrafts(recovery.ownerId, writer.attempt_id, ack.question_id, sent.value); }
              catch { setRecoveryMessage("Jawaban diakui server; cache draf perangkat belum dapat dibersihkan."); }
            }
          }
          if (
            pending.current.get(ack.question_id)?.generation === row.generation
          )
            pending.current.delete(ack.question_id);
        } else
          nextConflicts[ack.question_id] = {
            revision: ack.revision,
            value: ack.value || {},
          };
      }
      retryBatch.current = null;
      if (result.acknowledgements.some((ack: { saved: boolean }) => ack.saved)) setLastSavedAt(new Date().toISOString());
      persist();
      conflictRef.current = nextConflicts;
      setConflicts(nextConflicts);
      stalled.current = Object.keys(nextConflicts).length > 0;
      setPendingCount(pending.current.size);
      setStatus(
        stalled.current
          ? "Konflik revisi. Pilih jawaban server atau kirim ulang perubahan Anda."
          : pending.current.size
            ? "Masih ada perubahan menunggu."
            : "Semua perubahan sudah diakui server.",
      );
      return !pending.current.size;
    } catch (e) {
      if (!mounted.current) return false;
      transientFailure.current = !(e instanceof AttemptError && e.status < 500);
      stalled.current = true;
      setStatus(
        (e instanceof Error ? e.message : "Jaringan tidak tersedia.") +
          " Jawaban lokal belum diakui server. Gunakan Coba simpan lagi.",
      );
      return false;
    } finally {
      sending.current = false;
      if (mounted.current) setTick((t) => t + 1);
    }
  }
  async function flushAll() {
    stalled.current = false;
    for (let i = 0; i < 60; i++) {
      if (sending.current) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      await flush();
      if (stalled.current) return false;
      if (!pending.current.size) return true;
    }
    return !pending.current.size;
  }
  function importDraft(id: string, value: Value, baseRevision: number) {
    if (!recovery?.enabled || !recovery.questionIds.includes(id)) return;
    const serverValue = serverValues.current[id] || {};
    const serverRevision = conflictRef.current[id]?.revision ?? (revisions.current[id] || 0);
    delete conflictRef.current[id];
    revisions.current[id] = serverRevision;
    stalled.current = false;
    setConflicts({ ...conflictRef.current });
    change(id, value);
    if (serverRevision !== baseRevision) {
      conflictRef.current[id] = { revision: serverRevision, value: serverValue };
      revisions.current[id] = baseRevision;
      setConflicts({ ...conflictRef.current });
      stalled.current = true;
      persist();
      setStatus("Draf dipulihkan tetapi revisi server berbeda. Pilih jawaban sebelum menyimpan.");
    }
  }
  function resolve(id: string, local: boolean) {
    const c = conflictRef.current[id];
    if (!c) return;
    revisions.current[id] = c.revision;
    serverValues.current[id] = c.value;
    delete conflictRef.current[id];
    setConflicts({ ...conflictRef.current });
    if (!local) {
      pending.current.delete(id);
      currentValues.current = { ...currentValues.current, [id]: c.value };
      setValues(currentValues.current);
    }
    retryBatch.current = null;
    stalled.current = false;
    persist();
    setPendingCount(pending.current.size);
    setTick((t) => t + 1);
  }
  useEffect(() => {
    mounted.current = true;
    if (storageKey) {
      try {
        if (!recovery?.enabled) {
          if (recovery?.finalized) clearDeviceDrafts(recovery.ownerId, writer.attempt_id);
        }
        else {
          const draft = parseDraft(localStorage.getItem(storageKey));
          if (draft && draft.epoch === writer.epoch) {
            const allowed = new Set(recovery.questionIds);
            const server = Object.fromEntries(initial.map(row => [row.question_id, row]));
            for (const [id, row] of Object.entries(draft.rows) as [string, RecoveryRow][]) {
              if (!allowed.has(id)) continue;
              const saved = server[id];
              if (saved && sameAnswer(row.value, saved.value)) continue;
              currentValues.current = { ...currentValues.current, [id]: row.value };
              pending.current.set(id, { value: row.value, generation: ++generation.current });
              if ((saved?.revision || 0) !== row.revision) {
                conflictRef.current[id] = { revision: saved?.revision || 0, value: saved?.value || {} };
                revisions.current[id] = row.revision;
              }
            }
            setValues(currentValues.current);
            setPendingCount(pending.current.size);
            setConflicts({ ...conflictRef.current });
            stalled.current = Object.keys(conflictRef.current).length > 0;
            if (pending.current.size) setRecoveryMessage("Draf perangkat dipulihkan. Status tersimpan hanya diberikan setelah pengakuan server; periksa konflik jika ada.");
            persist();
          } else if (draft) {
            setRecoveryMessage("Draf sesi sebelumnya tidak dikirim karena kewenangan perangkat telah berubah. Jawaban server digunakan; salinan lama dapat dipilih melalui pemulihan draf.");
          }
        }
      } catch { setRecoveryMessage("Penyimpanan draf perangkat tidak tersedia. Jangan muat ulang sebelum simpan selesai."); }
    }
    return () => { mounted.current = false; };
    // A queue is mounted per attempt/epoch. Server reload creates a fresh queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!pending.current.size || stalled.current) return;
    const timer = setTimeout(() => void flush(), 800);
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    const online = () => {
      stalled.current = false;
      setTick((t) => t + 1);
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (pending.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const retryTimer = setInterval(() => {
      if (transientFailure.current && pending.current.size && !sending.current && navigator.onLine !== false) online();
    }, 15000);
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", unload);
    return () => {
      clearInterval(retryTimer);
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  void tick;
  return {
    values,
    getValue: (id: string) => currentValues.current[id],
    change,
    importDraft,
    status,
    pendingCount,
    lastSavedAt,
    recoveryMessage,
    conflicts,
    resolve,
    flushAll,
    retry: () => {
      stalled.current = false;
      void flush();
    },
  };
}
