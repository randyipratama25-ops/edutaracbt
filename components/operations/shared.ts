"use client";
import { useEffect, useRef } from "react";
export async function api<T>(url: string, input?: object): Promise<T> {
  const r = await fetch(
    url,
    input
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      : { cache: "no-store" },
  );
  const j = await r.json();
  if (!r.ok) throw Error(j.error?.message || "Permintaan gagal.");
  return j.data as T;
}
export function useLive(load: () => Promise<void>, inbox = false) {
  const current = useRef(load);
  useEffect(() => {
    current.current = load;
  }, [load]);
  useEffect(() => {
    let active = true,
      running = false;
    const refresh = async () => {
      if (!active || running) return;
      running = true;
      try {
        await current.current();
      } finally {
        running = false;
      }
    };
    const source = new EventSource(
      "/api/operations/live" + (inbox ? "?inbox=1" : ""),
    );
    source.onmessage = () => void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const focus = () => void refresh();
    window.addEventListener("online", focus);
    return () => {
      active = false;
      clearInterval(timer);
      source.close();
      window.removeEventListener("online", focus);
    };
  }, [inbox]);
}
export type Option = { id: string; title: string };
export type Options = {
  admin: boolean;
  organization_id: string;
  exams: Option[];
  staff: { id: string; name: string; role: string }[];
};
