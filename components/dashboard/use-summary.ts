"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { api } from "../operations/shared";

/** Read-only dashboard snapshots; discard stale responses and abort on unmount/deadline. */
export function useSummary<T>(url: string, schema: z.ZodType<T>) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: boolean;
  }>({ data: null, loading: true, error: false });
  const [revision, setRevision] = useState(0);
  const pending = useRef(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    pending.current = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    const timer = setTimeout(() => controller.abort(), 15000);
    void Promise.race([
      api<unknown>(url, undefined, {
        signal: controller.signal,
        validateEnvelope: true,
      }).then((value) => schema.parse(value)),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(Error("Aborted")),
          { once: true },
        ),
      ),
    ])
      .then((data) => {
        if (active) setState({ data, loading: false, error: false });
      })
      .catch(() => {
        if (active) setState((s) => ({ ...s, loading: false, error: true }));
      })
      .finally(() => {
        clearTimeout(timer);
        if (active) pending.current = false;
      });
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url, schema, revision]);
  function refresh() {
    if (pending.current) return;
    pending.current = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    setRevision((v) => v + 1);
  }
  return { ...state, refresh };
}
