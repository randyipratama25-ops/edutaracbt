"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { z } from "zod";
import { integrityEvent } from "../../lib/attempts/validation";
import { AttemptError, command } from "./queue";

type Event = z.infer<typeof integrityEvent>;
type Kind = Event["kind"];
type Interval = { at: number; group: string; editing: boolean };

const backlog = z.object({
  epoch: z.number().int().positive(),
  events: z.array(integrityEvent).max(160),
  hidden: z
    .object({ at: z.number(), group: z.uuid(), editing: z.boolean() })
    .optional(),
});
const maximumDuration = 86_400_000;
const maxPending = 160;

export function useIntegrity(
  writer: { attempt_id: string; client_id: string; epoch: number },
  active: boolean,
  questionId?: string,
) {
  const [warning, setWarning] = useState("");
  const currentQuestion = useEffectEvent(() => questionId);

  useEffect(() => {
    const key = `edutara:integrity:v1:${writer.attempt_id}:${writer.client_id}`;
    if (!active) {
      try {
        localStorage.removeItem(key);
      } catch {}
      return;
    }
    let pending: Event[] = [];
    let hidden: Interval | undefined;
    try {
      const saved = backlog.safeParse(
        JSON.parse(localStorage.getItem(key) ?? "null"),
      );
      if (saved.success && saved.data.epoch === writer.epoch) {
        pending = saved.data.events.filter(
          (event) =>
            event.attempt_id === writer.attempt_id &&
            event.client_id === writer.client_id &&
            event.epoch === writer.epoch &&
            Date.now() - Date.parse(event.occurred_at ?? "") < maximumDuration,
        );
        hidden = saved.data.hidden;
      }
    } catch {}
    let blur: Interval | undefined;
    let disconnected: Interval | undefined;
    let graceUntil = 0;
    let group: { id: string; at: number } | undefined;
    let wake: WakeLockSentinel | null = null;
    let acquiring = false;
    let disposed = false;
    let sending = false;
    const controller = new AbortController();
    const editing = () =>
      !!document.activeElement?.closest(
        'input,textarea,[contenteditable="true"]',
      );
    const persist = () => {
      try {
        if (!pending.length && !hidden) localStorage.removeItem(key);
        else
          localStorage.setItem(
            key,
            JSON.stringify({ epoch: writer.epoch, events: pending, hidden }),
          );
      } catch {
        /* Keep the in-memory queue usable when storage is unavailable. */
      }
    };
    const flush = async () => {
      if (disposed || sending || !navigator.onLine || !pending.length) return;
      sending = true;
      try {
        // Yield between requests so telemetry does not crowd out answer saves.
        for (let sent = 0; sent < 8 && !disposed && pending.length; sent++) {
          const event = pending[0];
          try {
            const result = await command(event, { signal: controller.signal });
            if (disposed) return;
            if (result?.recorded !== true) {
              if (result?.finalized_at || result?.status === "disqualified") {
                pending = [];
                hidden = undefined;
                persist();
              }
              return;
            }
          } catch (error) {
            if (disposed) return;
            if (!(error instanceof AttemptError)) return;
            if ([403, 409].includes(error.status)) {
              pending = [];
              hidden = undefined;
              persist();
              return;
            }
            if (error.status !== 422) return;
          }
          pending = pending.filter((item) => item.event_id !== event.event_id);
          persist();
        }
      } finally {
        sending = false;
      }
    };
    const groupFor = (at: number) => {
      if (!group || at - group.at > 10000)
        group = { id: crypto.randomUUID(), at };
      return group.id;
    };
    const begin = (preferred?: string): Interval => {
      const at = Date.now();
      return { at, group: preferred ?? groupFor(at), editing: editing() };
    };
    const send = (kind: Kind, interval?: Interval, ending = false) => {
      const at = Date.now();
      pending = [
        ...pending,
        {
          action: "event" as const,
          ...writer,
          event_id: crypto.randomUUID(),
          kind,
          group_id:
            interval?.group ?? hidden?.group ?? blur?.group ?? groupFor(at),
          occurred_at: new Date(at).toISOString(),
          question_id: currentQuestion(),
          duration_ms:
            interval && ending
              ? Math.min(maximumDuration, Math.max(0, at - interval.at))
              : 0,
          editing: interval?.editing ?? editing(),
          orientation_recent:
            at < graceUntil || (interval?.at ?? at) < graceUntil - 3000,
        },
      ].slice(-maxPending);
      persist();
      void flush();
      if (["focus_loss", "visibility_hidden", "fullscreen_exit"].includes(kind))
        setWarning("Perubahan fokus tercatat untuk peninjauan pengawas.");
    };
    const acquire = async () => {
      if (
        acquiring ||
        (wake && !wake.released) ||
        document.hidden ||
        !("wakeLock" in navigator)
      )
        return;
      acquiring = true;
      try {
        const held = await navigator.wakeLock.request("screen");
        if (disposed) await held.release();
        else wake = held;
      } catch {
      } finally {
        acquiring = false;
      }
    };
    const visibility = () => {
      if (document.hidden && !hidden) {
        hidden = begin(blur?.group);
        send("visibility_start", hidden);
      } else if (!document.hidden) {
        if (hidden) {
          const interval = hidden;
          hidden = undefined;
          send("visibility_hidden", interval, true);
        }
        void acquire();
      }
    };
    const loseFocus = () => {
      blur ??= begin(hidden?.group);
    };
    const regainFocus = () => {
      if (!blur) return;
      const interval = blur;
      blur = undefined;
      send("focus_loss", interval, true);
    };
    const resize = () => {
      graceUntil = Date.now() + 3000;
    };
    const full = () => {
      if (!document.fullscreenElement) send("fullscreen_exit");
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        !event.repeat &&
        (event.ctrlKey || event.metaKey) &&
        ["c", "x", "v", "p", "s", "u"].includes(event.key.toLowerCase())
      )
        send("shortcut");
    };
    const offline = () => {
      if (disconnected) return;
      disconnected = begin();
      send("connection_lost", disconnected);
    };
    const online = () => {
      if (disconnected) {
        const interval = disconnected;
        disconnected = undefined;
        send("connection_restored", interval, true);
      } else void flush();
    };
    const listeners = [
      ["copy", () => send("copy")],
      ["cut", () => send("cut")],
      ["paste", () => send("paste")],
      ["contextmenu", () => send("contextmenu")],
    ] as const;
    for (const [name, listener] of listeners)
      document.addEventListener(name, listener);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("fullscreenchange", full);
    document.addEventListener("keydown", keydown);
    const pagehide = () => send("pagehide");
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("blur", loseFocus);
    window.addEventListener("focus", regainFocus);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("orientationchange", resize);
    window.visualViewport?.addEventListener("resize", resize);
    const timer = window.setInterval(() => void flush(), 5000);
    visibility();
    if (!navigator.onLine) offline();
    void flush();
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      void wake?.release().catch(() => {});
      for (const [name, listener] of listeners)
        document.removeEventListener(name, listener);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("fullscreenchange", full);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("blur", loseFocus);
      window.removeEventListener("focus", regainFocus);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, [writer, active]);
  return warning;
}
