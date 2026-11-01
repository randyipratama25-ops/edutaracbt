"use client";

import { useEffect, useRef, useState } from "react";
import { homeCallback } from "../../lib/auth/home-callback";

/** Dashboard invitations can return to the configured site root. */
export function ActivationRedirect() {
  const [status, setStatus] = useState<"idle" | "redirecting" | "invalid">("idle");
  const navigating = useRef(false);
  useEffect(() => {
    function check() {
      if (navigating.current) return;
      const callback = homeCallback(window.location.search, window.location.hash);
      if (callback.kind === "redirect") {
        navigating.current = true;
        setStatus("redirecting");
        window.location.replace(callback.href);
      } else if (callback.kind === "invalid") {
        // Remove credentials/provider errors from the address bar, without echoing their values.
        window.history.replaceState(window.history.state, "", callback.cleanHref);
        setStatus("invalid");
      }
    }
    check();
    window.addEventListener("hashchange", check);
    window.addEventListener("popstate", check);
    return () => {
      window.removeEventListener("hashchange", check);
      window.removeEventListener("popstate", check);
    };
  }, []);
  if (status === "idle") return null;
  if (status === "redirecting") return <p className="notice home-feedback" role="status">Membuka pengaturan password…</p>;
  return <p className="home-feedback" role="alert">Tautan akun tidak lengkap atau sudah tidak berlaku. Gunakan tautan terbaru dari email, minta Admin mengirim ulang undangan, atau pilih Lupa password pada halaman masuk.</p>;
}
