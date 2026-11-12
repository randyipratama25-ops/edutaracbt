import type { Metadata } from "next";
import {
  ArrowDown, Check, CheckCheck, ClipboardList,
  GraduationCap, Monitor, ShieldCheck, UserRound, UsersRound,
} from "lucide-react";
import { ContextHelp } from "../components/help/context-help";
import { ActivationRedirect } from "../components/auth/activation-redirect";
import { SignInLink } from "../components/home/sign-in-link";

export const metadata: Metadata = {
  title: "EDUTARA CBT — Ruang ujian madrasah",
  description: "Siapkan soal, laksanakan ujian, dan tinjau hasil dalam satu ruang kerja untuk madrasah.",
};

const roles = [
  { title: "Siswa", icon: UserRound, description: "Lihat jadwal, periksa perangkat, lalu kerjakan ujian dengan PIN dari pengawas.", tag: "Fokus mengerjakan" },
  { title: "Admin & Guru", icon: UsersRound, description: "Susun bank soal, atur pelaksanaan, dan lanjutkan koreksi hingga laporan.", tag: "Persiapan sampai penilaian" },
  { title: "Pengawas", icon: ShieldCheck, description: "Pantau peserta sesuai penugasan dan tanggapi kendala selama ujian.", tag: "Dampingi pelaksanaan" },
];

export default function Home() {
  return (
    <main id="main-content" tabIndex={-1} className="home-page">
      <div className="home-container">
        <header className="home-header">
          <div className="home-brand" aria-label="EDUTARA CBT">
            <span className="brand-mark"><GraduationCap size={25} aria-hidden="true" /></span>
            <span>EDUTARA CBT<small>Asesmen digital madrasah</small></span>
          </div>
          <nav className="home-nav" aria-label="Navigasi Beranda">
            <a href="#peran">Untuk siapa</a>
          </nav>
        </header>

        <ActivationRedirect />
        <noscript><p className="notice">Aktifkan JavaScript untuk masuk dan mengaktifkan akun.</p></noscript>

        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-intro">
            <span className="home-eyebrow"><span aria-hidden="true" />Ruang ujian madrasah</span>
            <h1 id="home-title">Ujian tertata.<br /><span>Belajar tetap utama.</span></h1>
            <p className="home-description">Dari menyusun soal hingga meninjau hasil, kelola ujian dalam satu aplikasi untuk seluruh warga madrasah.</p>
            <div className="actions home-actions">
              <SignInLink />
              <ContextHelp audience="public" page="/" />
            </div>
          </div>

          <div className="home-visual" aria-hidden="true">
            <div className="home-visual-heading"><GraduationCap size={22} /><span>Ruang ujian digital</span><span className="home-visual-dots"><i /><i /><i /></span></div>
            <div className="home-paper">
              <div className="home-paper-title"><span className="home-paper-icon"><ClipboardList size={26} /></span><div><strong>Persiapan yang terarah</strong><span>Soal · Jadwal · Peserta</span></div></div>
              <div className="home-paper-line" /><div className="home-paper-line short" />
              <div className="home-paper-options"><span><i /><b /></span><span className="chosen"><i><Check size={12} /></i><b /></span><span><i /><b /></span></div>
              <div className="home-paper-footer"><CheckCheck size={18} /><span>Satu alur sampai penilaian</span></div>
            </div>
            <div className="home-visual-note"><Monitor size={19} /><span>Desktop, tablet, dan ponsel</span></div>
          </div>
        </section>

        <section id="peran" className="home-section" aria-labelledby="home-roles-title">
          <div className="home-section-heading"><div><p className="home-kicker">Sesuai peran Anda</p><h2 id="home-roles-title">Satu aplikasi. Ruang kerja masing-masing.</h2></div><ArrowDown size={22} aria-hidden="true" /></div>
          <div className="home-role-grid">
            {roles.map(({ title, icon: Icon, description, tag }) => (
              <article className="home-role" key={title}>
                <span className="home-role-icon"><Icon size={23} aria-hidden="true" /></span>
                <h3>{title}</h3><p>{description}</p><span className="home-role-tag">{tag}</span>
              </article>
            ))}
          </div>
        </section>

        <footer className="home-footer">
          <span>EDUTARA CBT<span className="home-footer-dot" aria-hidden="true"> · </span>Ruang ujian madrasah</span>
        </footer>
      </div>
    </main>
  );
}
