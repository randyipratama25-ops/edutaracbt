"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [remember, setRemember] = useState(false);
  const [name, setName] = useState("");
  const [context, setContext] = useState("staff");
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryName, setRecoveryName] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recovering, setRecovering] = useState(false);
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
  async function recover(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRecoveryMessage("");
    setRecovering(true);
    try {
      const r = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: recoveryName.trim() }),
      });
      const j = await r.json();
      setRecoveryMessage(
        r.ok
          ? j.data.message
          : j.error?.message || "Pemulihan belum berhasil. Coba lagi.",
      );
    } catch {
      setRecoveryMessage("Tidak dapat meminta pemulihan. Coba lagi.");
    } finally {
      setRecovering(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="stack" aria-busy={busy}>
        <label>
          Konteks masuk
          <select disabled={busy} value={context} onChange={(e) => setContext(e.target.value)}>
            <option value="staff">Admin / Guru</option>
            <option value="supervisor">Pengawas</option>
            <option value="student">Siswa</option>
          </select>
        </label>
        <label>
          Username
          <input
            disabled={busy}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            required
            maxLength={64}
          />
        </label>
        <label>
          Password
          <span className="password-field"><input
            id="login-password"
            disabled={busy}
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={256}
          /><button type="button" className="password-toggle" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} aria-controls="login-password" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}</button></span>
        </label>
        {context === "student" && (
          <p className="muted">
            Pilih ujian dan masukkan PIN setelah berhasil masuk.
          </p>
        )}
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
          disabled={busy}
          onClick={() => {
            setRecoveryName(name);
            setRecoveryMessage("");
            setRecoveryOpen(true);
          }}
        >
          Lupa password
        </Button>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </form>
      <Dialog
        open={recoveryOpen}
        onOpenChange={(open) => {
          if (!recovering) setRecoveryOpen(open);
        }}
        title="Pulihkan password"
        description="Masukkan username akun Anda. Petunjuk pemulihan dikirim ke email yang terdaftar. Jika tidak memiliki akses email, hubungi Admin madrasah."
      >
        <form onSubmit={recover} className="stack" aria-busy={recovering}>
          <label>
            Username pemulihan
            <input
              value={recoveryName}
              onChange={(e) => setRecoveryName(e.target.value)}
              autoComplete="username"
              required
              maxLength={64}
              pattern={".*\\S.*"}
              disabled={recovering}
            />
          </label>
          <Button disabled={recovering}>
            {recovering ? "Mengirim permintaan…" : "Kirim petunjuk pemulihan"}
          </Button>
          <p role="status" aria-live="polite">
            {recoveryMessage}
          </p>
        </form>
      </Dialog>
    </>
  );
}
