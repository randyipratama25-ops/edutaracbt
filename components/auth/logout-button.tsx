"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
export function LogoutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Logout belum berhasil. Coba lagi.");
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Keluar
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Keluar dari aplikasi?"
        description="Sesi pada perangkat ini akan ditutup."
      >
        <div className="actions">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={busy} onClick={logout}>
            {busy ? "Memproses…" : "Ya, keluar"}
          </Button>
        </div>
        <p role="alert">{error}</p>
      </Dialog>
    </>
  );
}
