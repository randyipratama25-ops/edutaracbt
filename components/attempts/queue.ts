"use client";
import { useEffect, useRef, useState } from "react";
export type Value = string[] | Record<string, string>;
export type Saved = { question_id: string; revision: number; value: Value };
export async function command(input: unknown) {
  const r = await fetch("/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(12000),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error?.message || "Permintaan gagal.");
  return j.data;
}
type Pending = { value: Value; generation: number };
type Conflict = { revision: number; value: Value };
export function useAnswerQueue(
  writer: { attempt_id: string; client_id: string; epoch: number },
  initial: Saved[],
  onTerminal: (data: unknown) => void,
) {
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(initial.map((a) => [a.question_id, a.value])),
  );
  const [status, setStatus] = useState("Semua perubahan sudah diakui server.");
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<Record<string, Conflict>>({});
  const [tick, setTick] = useState(0);
  const currentValues = useRef(values);
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
    currentValues.current = { ...currentValues.current, [id]: value };
    setValues(currentValues.current);
    pending.current.set(id, { value, generation: ++generation.current });
    setPendingCount(pending.current.size);
    setStatus("Ada perubahan belum tersimpan.");
    setTick((t) => t + 1);
  }
  async function flush() {
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
          result = await command(batch.input);
          break;
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : "Jaringan tidak tersedia.";
          if (/CONFLICT|AUTH|valid|terlalu besar/i.test(msg) || attempt === 2)
            throw e;
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt),
          );
        }
      }
      if (result?.id && result?.status) {
        stalled.current = true;
        retryBatch.current = null;
        setStatus(
          "Attempt tidak menerima perubahan lagi; gunakan status akhir dari server.",
        );
        onTerminal(result);
        return false;
      }
      if (!Array.isArray(result?.acknowledgements))
        throw Error("Server belum memberikan pengakuan simpan.");
      const nextConflicts = { ...conflictRef.current };
      for (const ack of result.acknowledgements) {
        const row = batch.rows.find((r) => r.id === ack.question_id);
        if (!row) continue;
        if (ack.saved) {
          revisions.current[ack.question_id] = ack.revision;
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
      stalled.current = true;
      setStatus(
        (e instanceof Error ? e.message : "Jaringan tidak tersedia.") +
          " Jawaban lokal belum diakui server. Gunakan Coba simpan lagi.",
      );
      return false;
    } finally {
      sending.current = false;
      setTick((t) => t + 1);
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
  function resolve(id: string, local: boolean) {
    const c = conflictRef.current[id];
    if (!c) return;
    revisions.current[id] = c.revision;
    delete conflictRef.current[id];
    setConflicts({ ...conflictRef.current });
    if (!local) {
      pending.current.delete(id);
      currentValues.current = { ...currentValues.current, [id]: c.value };
      setValues(currentValues.current);
    }
    retryBatch.current = null;
    stalled.current = false;
    setPendingCount(pending.current.size);
    setTick((t) => t + 1);
  }
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
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  void tick;
  return {
    values,
    getValue: (id: string) => currentValues.current[id],
    change,
    status,
    pendingCount,
    conflicts,
    resolve,
    flushAll,
    retry: () => {
      stalled.current = false;
      void flush();
    },
  };
}
