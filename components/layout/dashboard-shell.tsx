"use client";
import { ContextHelp } from "../help/context-help";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, BookOpen, CalendarDays, ClipboardCheck, DoorOpen, GraduationCap, ImageIcon, LayoutDashboard, Menu, Printer, Settings, ShieldCheck, Users, Workflow } from "lucide-react";
import { LogoutButton } from "../auth/logout-button";
import { Button } from "../ui/button";
import { SearchField } from "../ui/list-filters";
import { matchesSearch } from "../../lib/lists/search";
import { pageGuides } from "../../lib/help/start-here";
import { Dialog } from "../ui/dialog";

const groups = [
  { label: "Akun & data madrasah", items: [
    { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
    { href: "/dashboard/users", label: "Pengguna", icon: Users },
    { href: "/dashboard/master-data", label: "Data akademik", icon: BookOpen },
  ] },
  { label: "Persiapan ujian", items: [
    { href: "/dashboard/bank", label: "Bank soal", icon: BookOpen },
    { href: "/dashboard/preparation", label: "Persiapan ujian", icon: ClipboardCheck },
    { href: "/dashboard/exams", label: "Ujian & bank soal", icon: CalendarDays },
    { href: "/dashboard/media", label: "Media soal", icon: ImageIcon },
  ] },
  { label: "Pelaksanaan ujian", items: [
    { href: "/dashboard/monitor", label: "Pantau ujian", icon: Activity },
    { href: "/dashboard/rooms", label: "Ruang & pengawas", icon: DoorOpen, admin: true },
    { href: "/dashboard/cards", label: "Kartu peserta", icon: Printer },
  ] },
  { label: "Nilai & laporan", items: [
    { href: "/dashboard/grading", label: "Koreksi & moderasi", icon: ClipboardCheck },
    { href: "/dashboard/results", label: "Hasil & koreksi", icon: ClipboardCheck },
    { href: "/dashboard/analytics", label: "Analitik & laporan", icon: BarChart3 },
  ] },
  { label: "Administrasi", items: [
    { href: "/dashboard/advanced", label: "Fitur lanjutan", icon: Settings, admin: true },
    { href: "/dashboard/acceptance", label: "Penerimaan operasional", icon: ClipboardCheck, admin: true },
    { href: "/dashboard/settings", label: "Pengaturan", icon: Settings, admin: true },
    { href: "/dashboard/audit", label: "Audit aktivitas", icon: ShieldCheck, admin: true },
    { href: "/dashboard/jobs", label: "Otomasi & backup", icon: Workflow, admin: true },
  ] },
];
export function DashboardNavigation({ role, pathname, onNavigate }: { role: "admin" | "teacher"; pathname: string; onNavigate?: () => void }) {
  const [query, setQuery] = useState("");
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const visibleGroups = groups.map(group => ({
    ...group,
    items: group.items.filter(item =>
      (!("admin" in item && item.admin) || role === "admin") &&
      terms.every(term => matchesSearch(`${item.label} ${pageGuides[item.href]?.keywords ?? ""}`, term))
    ),
  })).filter(group => group.items.length > 0);
  return <nav aria-label="Navigasi utama" className="dashboard-navigation">
    <div className="dashboard-menu-search"><SearchField label="Cari menu" value={query} onChange={setQuery} maxLength={80} /></div>
    {visibleGroups.length === 0 && <p className="muted dashboard-menu-empty" role="status">Menu tidak ditemukan. Coba kata lain, misalnya “soal” atau “nilai”.</p>}
    {visibleGroups.map(group => {
      const items = group.items;
      return items.length > 0 ? <section key={group.label} className="nav-group">
        <p className="nav-group-label">{group.label}</p>
        {items.map(({ href, label, icon: Icon }) => <Link href={href} key={href} onClick={onNavigate} aria-current={pathname === href ? "page" : undefined}>
          <Icon size={19} aria-hidden="true" /><span>{label}</span>
        </Link>)}
      </section> : null;
    })}
  </nav>;
}
export function DashboardShell({ name, role, children }: { name: string; role: "admin" | "teacher"; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const previousPath = useRef(pathname);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const frame = requestAnimationFrame(() => {
      document.getElementById("main-content")?.focus();
      const heading=document.querySelector("#main-content h1")?.textContent?.trim()||"Ruang kerja";
      setAnnouncement(`Halaman ${heading}.`);
    });
    setAnnouncement("");
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  const page = groups.flatMap(group => group.items).find(item => item.href === pathname)?.label || "Ruang kerja";
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" href="/dashboard"><span className="brand-mark"><GraduationCap size={24} aria-hidden="true" /></span><span>EDUTARA<span className="brand-caption">Computer Based Test</span></span></Link>
      <DashboardNavigation role={role} pathname={pathname} />
      <div className="sidebar-account"><span className="avatar" aria-hidden="true">{name.slice(0,1).toUpperCase()}</span><div><strong>{name}</strong><span>{role === "admin" ? "Administrator" : "Guru"}</span></div></div>
      <LogoutButton />
    </aside>
    <div className="shell-body">
      <header className="workspace-header">
        <Button ref={menuTrigger} className="mobile-menu" variant="outline" aria-label="Buka navigasi" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} aria-hidden="true" /><span>Menu</span></Button>
        <nav aria-label="Jejak navigasi" className="breadcrumbs"><Link href="/dashboard">Ruang kerja</Link><span aria-hidden="true">/</span><span>{page}</span></nav>
        <ContextHelp audience={role} page={pathname} />
        <span className="role-badge">{role === "admin" ? "Admin" : "Guru"}</span>
      </header>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      <main id="main-content" tabIndex={-1} className="workspace dashboard-workspace">{children}</main>
      <footer className="workspace-footer">EDUTARA CBT<span>Ruang pengelolaan madrasah</span></footer>
    </div>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen} title="Navigasi aplikasi" description="Pilih halaman ruang kerja Anda." className="navigation-dialog" onCloseAutoFocus={event=>{
      // A rotation can hide the mobile trigger while its dialog is open.
      if(menuTrigger.current && menuTrigger.current.getClientRects().length === 0){
        event.preventDefault();document.getElementById("main-content")?.focus();
      }
    }}>
      <DashboardNavigation role={role} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
      <div className="mobile-account"><p>{name} · {role === "admin" ? "Admin" : "Guru"}</p><LogoutButton /></div>
    </Dialog>
  </div>;
}
