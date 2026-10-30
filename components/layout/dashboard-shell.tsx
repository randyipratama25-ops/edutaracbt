"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BarChart3, BookOpen, CalendarDays, ClipboardCheck, DoorOpen, GraduationCap, ImageIcon, LayoutDashboard, Menu, Printer, Settings, ShieldCheck, Users, Workflow } from "lucide-react";
import { LogoutButton } from "../auth/logout-button";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const groups = [
  { label: "Ruang kerja", items: [
    { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard },
    { href: "/dashboard/users", label: "Pengguna", icon: Users },
    { href: "/dashboard/master-data", label: "Data akademik", icon: BookOpen },
  ] },
  { label: "Ujian", items: [
    { href: "/dashboard/bank", label: "Bank soal", icon: BookOpen },
    { href: "/dashboard/preparation", label: "Persiapan ujian", icon: ClipboardCheck },
    { href: "/dashboard/exams", label: "Ujian & bank soal", icon: CalendarDays },
    { href: "/dashboard/monitor", label: "Monitoring", icon: Activity },
    { href: "/dashboard/rooms", label: "Ruang & pengawas", icon: DoorOpen, admin: true },
    { href: "/dashboard/cards", label: "Kartu peserta", icon: Printer },
    { href: "/dashboard/media", label: "Media soal", icon: ImageIcon },
  ] },
  { label: "Penilaian", items: [
    { href: "/dashboard/grading", label: "Koreksi & moderasi", icon: ClipboardCheck },
    { href: "/dashboard/results", label: "Hasil & koreksi", icon: ClipboardCheck },
    { href: "/dashboard/analytics", label: "Analitik & laporan", icon: BarChart3 },
  ] },
  { label: "Administrasi", items: [
    { href: "/dashboard/acceptance", label: "Penerimaan operasional", icon: ClipboardCheck, admin: true },
    { href: "/dashboard/settings", label: "Pengaturan", icon: Settings, admin: true },
    { href: "/dashboard/audit", label: "Audit aktivitas", icon: ShieldCheck, admin: true },
    { href: "/dashboard/jobs", label: "Otomasi & backup", icon: Workflow, admin: true },
  ] },
];
export function DashboardNavigation({ role, pathname, onNavigate }: { role: "admin" | "teacher"; pathname: string; onNavigate?: () => void }) {
  return <nav aria-label="Navigasi utama" className="dashboard-navigation">
    {groups.map(group => {
      const items = group.items.filter(item => !("admin" in item && item.admin) || role === "admin");
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
        <Button className="mobile-menu" variant="outline" aria-label="Buka navigasi" onClick={() => setMenuOpen(true)}><Menu size={20} aria-hidden="true" /></Button>
        <nav aria-label="Jejak navigasi" className="breadcrumbs"><Link href="/dashboard">Ruang kerja</Link><span aria-hidden="true">/</span><span>{page}</span></nav>
        <span className="role-badge">{role === "admin" ? "Admin" : "Guru"}</span>
      </header>
      <main id="main-content" tabIndex={-1} className="workspace dashboard-workspace">{children}</main>
      <footer className="workspace-footer">EDUTARA CBT<span>Ruang pengelolaan madrasah</span></footer>
    </div>
    <Dialog open={menuOpen} onOpenChange={setMenuOpen} title="Navigasi aplikasi" description="Pilih halaman ruang kerja Anda." className="navigation-dialog">
      <DashboardNavigation role={role} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
      <div className="mobile-account"><p>{name} · {role === "admin" ? "Admin" : "Guru"}</p><LogoutButton /></div>
    </Dialog>
  </div>;
}
