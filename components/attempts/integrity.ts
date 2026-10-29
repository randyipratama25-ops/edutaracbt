"use client";
import { useEffect, useState } from "react";
import { command } from "./queue";
export function useIntegrity(
  writer: { attempt_id: string; client_id: string; epoch: number },
  active: boolean,
) {
  const [warning, setWarning] = useState("");
  useEffect(() => {
    if (!active) return;
    let hiddenAt = 0,
      blurAt = 0,
      graceUntil = 0,
      typing = false;
    let wake: WakeLockSentinel | null = null;
    let disposed = false;
    const editing = () =>
      !!document.activeElement?.closest(
        'input,textarea,[contenteditable="true"]',
      );
    const send = (kind: string, duration_ms = 0) => {
      const input = {
        action: "event",
        ...writer,
        event_id: crypto.randomUUID(),
        kind,
        duration_ms: Math.max(0, Math.floor(duration_ms)),
        editing: typing || editing(),
        orientation_recent: Date.now() < graceUntil,
      };
      void command(input).catch(() => {});
      if (["focus_loss", "visibility_hidden", "fullscreen_exit"].includes(kind))
        setWarning(
          "Perubahan fokus tercatat untuk peninjauan pengawas. Tidak ada diskualifikasi otomatis.",
        );
    };
    const acquire = async () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator) {
        try {
          const held = await navigator.wakeLock.request("screen");
          if (disposed) await held.release();
          else wake = held;
        } catch {}
      }
    };
    const visibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        typing = editing();
      } else {
        if (hiddenAt) send("visibility_hidden", Date.now() - hiddenAt);
        hiddenAt = 0;
        void acquire();
      }
    };
    const blur = () => {
      blurAt = Date.now();
      typing = editing();
    };
    const focus = () => {
      if (blurAt) send("focus_loss", Date.now() - blurAt);
      blurAt = 0;
      typing = false;
    };
    const resize = () => {
      graceUntil = Date.now() + 3000;
    };
    const full = () => {
      if (!document.fullscreenElement) send("fullscreen_exit");
    };
    const key = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        ["c", "x", "v", "p", "s", "u"].includes(e.key.toLowerCase())
      )
        send("shortcut");
    };
    const copy = () => send("copy"),
      cut = () => send("cut"),
      paste = () => send("paste"),
      menu = () => send("contextmenu");
    const pagehide = () => {
      const input = {
        action: "event",
        ...writer,
        event_id: crypto.randomUUID(),
        kind: "pagehide",
        duration_ms: 0,
        editing: editing(),
        orientation_recent: Date.now() < graceUntil,
      };
      void fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        keepalive: true,
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", focus);
    window.addEventListener("orientationchange", resize);
    window.visualViewport?.addEventListener("resize", resize);
    document.addEventListener("fullscreenchange", full);
    document.addEventListener("keydown", key);
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", paste);
    document.addEventListener("contextmenu", menu);
    window.addEventListener("pagehide", pagehide);
    void acquire();
    return () => {
      disposed = true;
      void wake?.release().catch(() => {});
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", focus);
      window.removeEventListener("orientationchange", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", full);
      document.removeEventListener("keydown", key);
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", paste);
      document.removeEventListener("contextmenu", menu);
      window.removeEventListener("pagehide", pagehide);
    };
  }, [writer, active]);
  return warning;
}
