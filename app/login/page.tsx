import { LoginForm } from "../../components/auth/login-form";
export default function Login() {
  return (
    <main className="auth-wrap">
      <section className="panel auth-card">
        <p className="eyebrow">EDUTARA CBT</p>
        <h1>Selamat datang kembali</h1>
        <p className="muted">
          Masuk menggunakan akun yang diberikan pengelola madrasah.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
