import { ContextHelp } from "../../../components/help/context-help";
import { PasswordForm } from "../../../components/auth/password-form";
export default function Reset() {
  return (
    <main id="main-content" tabIndex={-1} className="auth-wrap">
      <section className="panel">
        <h1>Atur password</h1>
        <p>Buat password untuk mengakses akun Anda.</p>
        <PasswordForm />
        <ContextHelp audience="public" page="/auth/reset" />
      </section>
    </main>
  );
}
