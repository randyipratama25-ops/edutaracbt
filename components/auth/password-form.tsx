"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
export function PasswordForm() {
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      window.location.replace(`/auth/confirm?code=${encodeURIComponent(code)}`);
      return;
    }
    if (access_token && refresh_token) {
      fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token, refresh_token }),
      })
        .then(async (r) => {
          window.history.replaceState(null, "", "/auth/reset");
          if (!r.ok) throw Error();
          setReady(true);
        })
        .catch(() => setMessage("Tautan aktivasi tidak valid."));
    } else setReady(true);
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const password = String(f.get("password"));
      if (password !== f.get("confirm"))
        throw Error("Konfirmasi password tidak sama.");
      const r = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message);
      setMessage(j.data.message);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Gagal memperbarui password.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack" aria-busy={busy}>
      <label>
        Password baru
        <input
          name="password"
          type="password"
          aria-describedby="password-policy"
          minLength={12}
          maxLength={128}
          required
          autoComplete="new-password"
        />
      </label>
      <p id="password-policy" className="muted">Gunakan minimal 12 karakter untuk password baru.</p>
      <label>
        Ulangi password
        <input
          name="confirm"
          type="password"
          minLength={12}
          required
          autoComplete="new-password"
        />
      </label>
      <Button disabled={!ready || busy}>Simpan password</Button>
      <p role="status">{message}</p>
      <a href="/login">Kembali ke login</a>
    </form>
  );
}
