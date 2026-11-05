import { GraduationCap, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { StartHere } from "../components/help/start-here";
import { ContextHelp } from "../components/help/context-help";
import { ActivationRedirect } from "../components/auth/activation-redirect";
import { SignInLink } from "../components/home/sign-in-link";

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1} className="auth-wrap home-page">
      <div className="home-container">
        <header className="home-brand" aria-label="EDUTARA CBT">
          <span className="brand-mark"><GraduationCap size={26} aria-hidden="true" /></span>
          <span>EDUTARA CBT<small>Asesmen digital madrasah</small></span>
        </header>
        <ActivationRedirect />
        <noscript><p className="notice">Aktifkan JavaScript untuk masuk, membuka bantuan, dan mengaktifkan akun.</p></noscript>
        <section className="panel home-hero" aria-labelledby="home-title">
          <div className="home-intro">
            <h1 id="home-title">Ujian madrasah dalam satu aplikasi</h1>
            <div className="actions home-actions">
              <SignInLink />
              <ContextHelp audience="public" page="/" />
            </div>
            <StartHere page="/" />
          </div>
          <aside className="home-access" aria-labelledby="home-access-title">
            <h2 id="home-access-title">Akses sesuai peran</h2>
            <ul>
              <li><UserRound size={21} aria-hidden="true" /><div><h3>Siswa</h3><p>Lihat jadwal dan kerjakan ujian.</p></div></li>
              <li><UsersRound size={21} aria-hidden="true" /><div><h3>Admin &amp; Guru</h3><p>Siapkan soal dan kelola penilaian.</p></div></li>
              <li><ShieldCheck size={21} aria-hidden="true" /><div><h3>Pengawas</h3><p>Pantau peserta sesuai penugasan.</p></div></li>
            </ul>
          </aside>
        </section>
        <footer className="home-footer"><p>Belum memiliki akun? Hubungi Admin madrasah.</p></footer>
      </div>
    </main>
  );
}
