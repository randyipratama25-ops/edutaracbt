import Link from "next/link";
import { KeyRound } from "lucide-react";
import { ContextHelp } from "../../../components/help/context-help";
import { PasswordForm } from "../../../components/auth/password-form";
export const metadata = { title: "Atur password | EDUTARA CBT" };
export default function Reset() {
  return (
    <main id="main-content" tabIndex={-1} className="auth-wrap reset-page">
      <section
        className="panel auth-card reset-card"
        aria-labelledby="reset-title"
      >
        <div className="reset-brand">
          <span className="brand-mark">
            <KeyRound size={24} aria-hidden="true" />
          </span>
          <p className="eyebrow">EDUTARA CBT</p>
        </div>
        <h1 id="reset-title">Atur password</h1>

        <PasswordForm />
        <footer className="reset-footer">
          <Link href="/">Kembali ke Beranda</Link>
          <ContextHelp audience="public" page="/auth/reset" />
        </footer>
        <noscript>
          <p className="notice">
            Aktifkan JavaScript untuk memverifikasi sesi dan mengatur password.
          </p>
        </noscript>
      </section>
    </main>
  );
}
