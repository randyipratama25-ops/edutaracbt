import { PasswordForm } from "../../../components/auth/password-form";
export default function Reset() {
  return (
    <main id="main-content" tabIndex={-1} className="auth-wrap">
      <section className="panel">
        <h1>Atur password akun</h1>
        <p>Gunakan tautan aktivasi atau pemulihan dari email Anda.</p>
        <PasswordForm />
      </section>
    </main>
  );
}
