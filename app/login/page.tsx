import Image from "next/image";
import { LoginForm } from "../../components/auth/login-form";
import { branding } from "../../lib/system/branding";
export const dynamic = "force-dynamic";
export default async function Login() {
  const b = await branding();
  return (
    <main
      className="auth-wrap"
      style={
        b.background
          ? {
              backgroundImage: `linear-gradient(#ffffffaa,#ffffffaa),url("${b.background}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <section className="panel auth-card">
        {b.logo && (
          <Image
            src={b.logo}
            alt="Logo madrasah"
            width={64}
            height={64}
            unoptimized
            style={{ objectFit: "contain" }}
          />
        )}
        <p className="eyebrow">{b.name}</p>
        <h1>Selamat datang kembali</h1>
        <p className="muted">{b.subtitle}</p>
        <LoginForm />
      </section>
    </main>
  );
}
