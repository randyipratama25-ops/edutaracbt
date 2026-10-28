"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [remember, setRemember] = useState(false);
  const [name, setName] = useState("");
  const [context, setContext] = useState("staff");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("edutara_username");
      if (saved) {
        setName(saved);
        setRemember(true);
      }
    } catch {
      /* storage may be disabled */
    }
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: name,
          password: f.get("password"),
          context,
          pin: f.get("pin") || undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message || "Login gagal.");
      try {
        if (remember) localStorage.setItem("edutara_username", name);
        else localStorage.removeItem("edutara_username");
      } catch {}
      window.location.assign(j.data.next);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Tidak dapat terhubung. Coba lagi.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function recover() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name }),
      });
      const j = await r.json();
      setMessage(r.ok ? j.data.message : j.error?.message);
    } catch {
      setMessage("Tidak dapat meminta pemulihan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <label>
        Konteks masuk
        <select value={context} onChange={(e) => setContext(e.target.value)}>
          <option value="staff">Admin / Guru</option>
          <option value="supervisor">Pengawas</option>
          <option value="student">Siswa</option>
        </select>
      </label>
      <label>
        Username
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          required
          maxLength={64}
        />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
        />
      </label>
      {context === "student" ? (
        <>
          <label>
            PIN ujian
            <input name="pin" inputMode="numeric" pattern="[0-9]+" required />
          </label>
          <p className="muted">
            Login ujian siswa belum diaktifkan pada tahap ini.
          </p>
        </>
      ) : null}
      <label className="check">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Ingat username saja
      </label>
      <Button disabled={busy}>{busy ? "Memproses…" : "Masuk"}</Button>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !name}
        onClick={recover}
      >
        Lupa password
      </Button>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
