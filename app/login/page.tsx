import Link from "next/link";
import { StartHere } from "../../components/help/start-here";
import { ContextHelp } from "../../components/help/context-help";
import { LoginForm } from "../../components/auth/login-form";
import { LoginBrand } from "../../components/auth/login-brand";
import { branding } from "../../lib/system/branding";
export const dynamic = "force-dynamic";
export const metadata = { title: "Masuk | EDUTARA CBT" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [b, params] = await Promise.all([branding(), searchParams]);
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="auth-wrap login-page"
      style={
        b.background
          ? {
              backgroundImage: `linear-gradient(#ffffffcc,#ffffffcc),url("${b.background}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <section
        className="panel auth-card login-card"
        aria-labelledby="login-title"
      >
        <LoginBrand key={b.logo} name={b.name} logo={b.logo} />
        <h1 id="login-title">Masuk ke EDUTARA</h1>
        <p className="muted">{b.subtitle}</p>
      <StartHere page="/login" />
        <LoginForm
          key={params.error === "activation" ? "activation" : "login"}
          activationError={params.error === "activation"}
        />
        <footer className="login-footer">
          <Link href="/">Kembali ke Beranda</Link>
          <ContextHelp audience="public" page="/login" />
        </footer>
        <noscript>
          <p className="notice">
            Aktifkan JavaScript untuk masuk dan meminta pemulihan akun.
          </p>
        </noscript>
      </section>
    </main>
  );
}
