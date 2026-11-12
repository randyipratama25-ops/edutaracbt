"use client";
import { feedbackJSON } from "../../lib/client/feedback-transport";

import { useEffect, useRef } from "react";
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  input?: object,
  options?: { signal?: AbortSignal; validateEnvelope?: boolean },
): Promise<T> {
  const { response: r, data: j } = await feedbackJSON<{
    success?: unknown;
    data: T;
    error?: { message?: unknown };
  }>(
    url,
    input
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: options?.signal,
          body: JSON.stringify(input),
        }
      : { cache: "no-store", signal: options?.signal },
  );
  if (!r.ok)
    throw new ApiError(
      typeof j?.error?.message === "string"
        ? j.error.message
        : "Permintaan gagal.",
      r.status,
    );
  if (
    options?.validateEnvelope &&
    (!j || typeof j !== "object" || j.success !== true || !("data" in j))
  )
    throw Error("Respons tidak valid.");
  return j.data as T;
}
export function useLive(
  load: () => Promise<void>,
  inbox = false,
  enabled = true,
  subscribe = true,
) {
  const current = useRef(load);
  useEffect(() => {
    current.current = load;
  }, [load]);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      running = false;
    const refresh = async () => {
      if (!active || running) return;
      running = true;
      try {
        await current.current();
      } catch {
        // Panels own their error feedback; never leak a rejected timer/SSE task.
      } finally {
        running = false;
      }
    };
    const source = subscribe ? new EventSource(
      "/api/operations/live" + (inbox ? "?inbox=1" : ""),
    ) : null;
    if (source) source.onmessage = () => void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const focus = () => void refresh();
    window.addEventListener("online", focus);
    return () => {
      active = false;
      clearInterval(timer);
      source?.close();
      window.removeEventListener("online", focus);
    };
  }, [inbox, enabled, subscribe]);
}
export type Option = { id: string; title: string };
export type Options = {
  admin: boolean;
  organization_id: string;
  exams: Option[];
  staff: { id: string; name: string; role: string }[];
};
