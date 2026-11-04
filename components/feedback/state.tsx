"use client";
import {
  Children,
  isValidElement,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Inbox,
  LoaderCircle,
  SearchX,
  ShieldX,
  Timer,
  WifiOff,
  LogIn,
  Info,
} from "lucide-react";
import { FeedbackContext } from "./context";
export type StateKind =
  | "empty"
  | "loading"
  | "error"
  | "offline"
  | "slow"
  | "no-results"
  | "permission"
  | "session"
  | "validation"
  | "success"
  | "info";
const icons = {
  empty: Inbox,
  loading: LoaderCircle,
  error: CircleAlert,
  offline: WifiOff,
  slow: Timer,
  "no-results": SearchX,
  permission: ShieldX,
  session: LogIn,
  validation: CircleHelp,
  success: CheckCircle2,
  info: Info,
};
const defaults: Record<StateKind, { title: string; description: string }> = {
  empty: {
    title: "Belum ada data",
    description:
      "Data akan tampil setelah tersedia. Gunakan tindakan di halaman ini untuk memulai.",
  },
  loading: {
    title: "Sedang memuat data",
    description: "Mohon tunggu. Anda dapat melanjutkan setelah data siap.",
  },
  error: {
    title: "Data belum dapat dimuat",
    description:
      "Periksa koneksi lalu coba lagi. Jika sebelumnya menyimpan, periksa hasilnya sebelum mengulang.",
  },
  offline: {
    title: "Tidak ada koneksi internet",
    description:
      "Periksa Wi-Fi atau data seluler. Tetap di halaman ini dan periksa status penyimpanan sebelum mencoba lagi.",
  },
  slow: {
    title: "Respons lebih lama dari biasanya",
    description:
      "Koneksi atau layanan mungkin lambat. Tetap di halaman ini; jangan kirim ulang penyimpanan yang sedang diproses.",
  },
  "no-results": {
    title: "Tidak ada hasil yang cocok",
    description:
      "Coba kata kunci lain atau reset filter untuk memperluas hasil pencarian.",
  },
  permission: {
    title: "Akses belum diizinkan",
    description:
      "Akun Anda belum memiliki izin untuk tindakan ini. Periksa penugasan atau hubungi Admin madrasah.",
  },
  session: {
    title: "Sesi akun berakhir",
    description:
      "Masuk kembali pada tab baru agar halaman dan isian Anda tetap terbuka. Setelah itu, periksa sesi dan hasil penyimpanan sebelum melanjutkan.",
  },
  validation: {
    title: "Periksa kembali isian",
    description:
      "Lengkapi atau perbaiki kolom yang ditandai, lalu kirim kembali.",
  },
  success: {
    title: "Perubahan berhasil disimpan",
    description:
      "Data sudah diterima. Anda dapat melanjutkan pekerjaan berikutnya.",
  },
  info: {
    title: "Informasi",
    description: "Periksa informasi berikut sebelum melanjutkan.",
  },
};
export function StateCard({
  kind = "empty",
  heading = "h2",
  title,
  description,
  children,
  actions,
  className = "",
  ...props
}: {
  kind?: StateKind;
  heading?: "h1" | "h2" | "h3";
  title?: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
} & Omit<ComponentProps<"section">, "title">) {
  const Icon = icons[kind],
    Heading = heading;
  return (
    <section
      {...props}
      className={`state-card state-${kind} ${className}`}
      data-state={kind}
      aria-busy={kind === "loading" || undefined}
    >
      {!Children.toArray(children).some(
        (c) =>
          isValidElement<{ "aria-hidden"?: boolean }>(c) &&
          c.props["aria-hidden"],
      ) && (
        <span className="state-icon" aria-hidden="true">
          <Icon size={28} />
        </span>
      )}
      <div className="state-content">
        {children ?? (
          <>
            <Heading>{title ?? defaults[kind].title}</Heading>
            <p>{description ?? defaults[kind].description}</p>
          </>
        )}
        {actions && <div className="actions state-actions">{actions}</div>}
      </div>
    </section>
  );
}
export function FeedbackMessage({
  tone = "info",
  className = "",
  children,
  role,
  ...props
}: ComponentProps<"p"> & { tone?: StateKind }) {
  const { online } = useContext(FeedbackContext);
  if (
    !Children.toArray(children).some((c) => typeof c !== "string" || c.trim())
  )
    return props.id ? (
      <p {...props} className={className} role={role ?? "status"} />
    ) : null;
  const kind = tone === "error" && online === false ? "offline" : tone,
    Icon = icons[kind];
  return (
    <p
      {...props}
      className={`feedback-message state-${kind} ${className}`}
      data-state={kind}
      role={
        role ?? (kind === "error" || kind === "validation" ? "alert" : "status")
      }
    >
      <Icon className="feedback-icon" size={19} aria-hidden="true" />
      <span>
        {children}
        {kind === "offline" && (
          <small className="feedback-hint">
            Periksa koneksi. Jika sedang menyimpan, periksa hasil sebelum
            mengulang.
          </small>
        )}
      </span>
    </p>
  );
}
