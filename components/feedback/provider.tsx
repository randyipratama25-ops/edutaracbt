"use client";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { FeedbackContext } from "./context";
import { StateCard } from "./state";
import { Button } from "../ui/button";
import {
  FEEDBACK_REQUEST_EVENT,
  type RequestFeedback,
} from "../../lib/client/feedback-transport";
const SLOW_MS = 8000;
const protectedPage = () =>
  /^\/(dashboard|student|supervisor)(\/|$)/.test(location.pathname);
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(null),
    [slow, setSlow] = useState(false),
    [access, setAccess] = useState<"permission" | "session" | null>(null),
    [checking, setChecking] = useState(false),
    [accessError, setAccessError] = useState("");
  const pathname = usePathname();
  const live = useRef(false),
    probe = useRef<AbortController | null>(null),
    lastProbe = useRef(-Infinity);
  const check = useCallback(async (explicit = false) => {
    if (
      !protectedPage() ||
      probe.current ||
      !navigator.onLine ||
      (!explicit && performance.now() - lastProbe.current < 30000)
    )
      return;
    lastProbe.current = performance.now();
    const page = location.pathname;
    const c = new AbortController();
    probe.current = c;
    setChecking(true);
    setAccessError("");
    const timeout = setTimeout(() => c.abort(), 10000);
    try {
      const r = await fetch("/api/auth/session", {
        cache: "no-store",
        signal: c.signal,
      });
      const j = await r.json();
      if (!live.current || location.pathname !== page) return;
      if (r.status === 401) setAccess("session");
      else if (r.ok && j?.success === true && j.data?.authenticated === true)
        setAccess(explicit ? null : "permission");
      else if (explicit)
        setAccessError(
          "Sesi belum dapat diperiksa. Layanan sedang tidak tersedia; coba lagi nanti.",
        );
    } catch {
      if (live.current && explicit && location.pathname === page)
        setAccessError(
          "Sesi belum dapat diperiksa. Periksa koneksi lalu coba lagi.",
        );
    } finally {
      clearTimeout(timeout);
      if (probe.current === c) {
        probe.current = null;
        if (live.current) setChecking(false);
      }
    }
  }, []);
  useLayoutEffect(() => {
    live.current = true;
    setOnline(navigator.onLine);
    const pending = new Map<
      number,
      { started: number; scope?: string; timer: ReturnType<typeof setTimeout> }
    >();
    const refreshSlow = () =>
      setSlow(
        [...pending.values()].some(
          (x) =>
            (!x.scope || x.scope === location.pathname) &&
            performance.now() - x.started >= SLOW_MS,
        ),
      );
    const connection = () => setOnline(navigator.onLine);
    const event = (e: Event) => {
      const d = (e as CustomEvent<RequestFeedback>).detail;
      if (!d || typeof d.id !== "number") return;
      if (d.phase === "start") {
        pending.set(d.id, {
          started: performance.now(),
          scope: d.scope,
          timer: setTimeout(refreshSlow, SLOW_MS),
        });
      } else {
        const entry = pending.get(d.id);
        if (entry) clearTimeout(entry.timer);
        pending.delete(d.id);
        refreshSlow();
        if (
          (d.status === 401 || d.status === 403) &&
          (!d.scope || d.scope === location.pathname)
        )
          void check();
      }
    };
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    window.addEventListener(FEEDBACK_REQUEST_EVENT, event);
    return () => {
      live.current = false;
      for (const x of pending.values()) clearTimeout(x.timer);
      pending.clear();
      probe.current?.abort();
      probe.current = null;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      window.removeEventListener(FEEDBACK_REQUEST_EVENT, event);
    };
  }, [check]);
  useEffect(() => {
    setAccess(null);
    setAccessError("");
    setSlow(false);
    probe.current?.abort();
    probe.current = null;
    lastProbe.current = -Infinity;
    setChecking(false);
  }, [pathname]);
  return (
    <FeedbackContext.Provider
      value={{
        online,
        slow,
        access,
        checking,
        accessError,
        checkAccess: () => void check(true),
        dismissAccess: () => {
          setAccess(null);
          setAccessError("");
        },
      }}
    >
      <aside className="global-feedback" aria-label="Status koneksi dan sesi">
        <ConnectionNotice />
      </aside>
      {children}
    </FeedbackContext.Provider>
  );
}
export function ConnectionNotice({ compact = false }: { compact?: boolean }) {
  const c = useContext(FeedbackContext);
  const kind =
    c.online === false
      ? "offline"
      : c.access === "session"
        ? "session"
        : c.access === "permission"
          ? "permission"
          : c.slow
            ? "slow"
            : null;
  if (!kind) return null;
  return (
    <div
      className={compact ? "connection-notice compact" : "connection-notice"}
      role={kind === "session" || kind === "permission" ? "alert" : "status"}
      aria-live="polite"
    >
      <StateCard
        kind={kind}
        actions={
          kind === "session" || kind === "permission" ? (
            <>
              {kind === "session" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={c.checking || c.online === false}
                  onClick={c.checkAccess}
                >
                  {c.checking ? "Memeriksa sesi…" : "Periksa sesi lagi"}
                </Button>
              )}
              {kind === "session" ? (
                <a
                  className="button button-primary"
                  href="/login"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Masuk kembali · tab baru
                </a>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={c.dismissAccess}
                >
                  Tutup pemberitahuan
                </Button>
              )}
            </>
          ) : undefined
        }
      />
      {c.accessError && <p role="status">{c.accessError}</p>}
    </div>
  );
}
