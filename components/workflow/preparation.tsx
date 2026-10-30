"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { api } from "../operations/shared";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { examSchema, types, type Kind } from "../../lib/authoring/schema";
import type { Preparation, WorkflowData } from "../../lib/workflow/schema";
const steps = [
  "Identitas",
  "Peserta",
  "Jadwal",
  "Soal",
  "Aturan",
  "Pemeriksaan",
  "Publikasi",
];
const defaults = () =>
  types.map((type) => ({
    type,
    enabled: true,
    max_questions: 0,
    option_count: 4,
    default_points: 1,
  }));
export function Checklist({
  exam,
  canManage = false,
}: {
  exam: Preparation;
  canManage?: boolean;
}) {
  return (
    <>
      <div className="actions">
        <span className={`status-pill ${exam.ready ? "saved" : "pending"}`}>
          {exam.lifecycle}
        </span>
        <span>
          {exam.participants} siswa · {exam.question_count} soal
        </span>
      </div>
      <ul className="readiness-list">
        {exam.checks.map((c) => (
          <li
            key={c.code}
            className={
              c.ok ? "check-ok" : c.blocking ? "check-blocked" : "check-warning"
            }
          >
            <span aria-hidden="true">
              {c.ok ? "✓" : c.blocking ? "!" : "i"}
            </span>
            <div>
              <strong>{c.label}</strong>
              <p>{c.detail}</p>
              {!c.ok &&
                (!canManage && ["rooms", "accounts"].includes(c.code) ? (
                  <p className="muted">Minta Admin meninjau kesiapan ini.</p>
                ) : (
                  <Link href={c.href}>Perbaiki {c.label.toLowerCase()}</Link>
                ))}
            </div>
            <small>
              {c.ok
                ? "Siap"
                : c.blocking
                  ? "Wajib dilengkapi"
                  : "Perlu ditinjau"}
            </small>
          </li>
        ))}
      </ul>
    </>
  );
}
export function PreparationPanel() {
  const [data, setData] = useState<WorkflowData | null>(null),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [id, setId] = useState("");
  const [meta, setMeta] = useState<{
    classes: { id: string; name: string }[];
    subjects: { id: string; name: string }[];
  }>({ classes: [], subjects: [] });
  const [title, setTitle] = useState(""),
    [subject, setSubject] = useState(""),
    [classes, setClasses] = useState<string[]>([]),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [duration, setDuration] = useState(60),
    [pin, setPin] = useState(""),
    [passing, setPassing] = useState(0),
    [shuffleQ, setShuffleQ] = useState(false),
    [shuffleO, setShuffleO] = useState(false),
    [configs, setConfigs] = useState(defaults),
    [confirmation, setConfirmation] = useState("");
  const draftRetry = useRef<{ signature: string; id: string } | null>(null);
  const lock = useRef(false),
    publishId = useRef<string | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<WorkflowData>("/api/workflow");
      setData(d);
      setSelected(
        (s) =>
          s ||
          new URLSearchParams(location.search).get("exam") ||
          d.exams.find((e) => e.status !== "archived")?.id ||
          "",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kesiapan gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [step, open]);
  const exam = data?.exams.find((e) => e.id === (open ? id : selected));
  async function begin() {
    setBusy(true);
    try {
      const d = await api<typeof meta>("/api/authoring");
      setMeta(d);
      setId("");
      draftRetry.current = null;
      publishId.current = null;
      setTitle("");
      setSubject("");
      setClasses([]);
      setStart("");
      setEnd("");
      setPin("");
      setDuration(60);
      setConfigs(defaults());
      setPassing(0);
      setShuffleQ(false);
      setShuffleO(false);
      setConfirmation("");
      setStep(0);
      setMessage("");
      setOpen(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Data belum dapat dimuat.");
    } finally {
      setBusy(false);
    }
  }
  async function draft() {
    const input = examSchema.parse({
      ...(id ? { id } : {}),
      title,
      subject_id: subject,
      class_ids: classes,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      duration_minutes: duration,
      ...(pin ? { pin } : {}),
      passing_grade: passing,
      status: "draft",
      bypass_period: false,
      shuffle_questions: shuffleQ,
      shuffle_options: shuffleO,
      configs,
    });
    const signature = JSON.stringify(input);
    if (draftRetry.current?.signature !== signature)
      draftRetry.current = { signature, id: crypto.randomUUID() };
    const result = await api<{ id: string }>("/api/authoring", {
      action: "exam",
      request_id: draftRetry.current.id,
      exam: input,
    });
    draftRetry.current = null;
    setId(result.id);
    setSelected(result.id);
    setPin("");
    await load();
    return result.id;
  }
  async function next(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (step === 1 && !classes.length)
        throw Error("Pilih minimal satu kelas peserta.");
      if (step === 2 || step === 4) await draft();
      if (step === 3 || step === 5) await load();
      setStep((s) => Math.min(s + 1, 6));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Draf gagal disimpan.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function publish(target: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      publishId.current ??= crypto.randomUUID();
      await api("/api/workflow", {
        action: "publish",
        exam_id: target,
        request_id: publishId.current,
        confirmation,
      });
      publishId.current = null;
      setOpen(false);
      setConfirmation("");
      await load();
      setMessage(
        "Jadwal dipublikasikan. Ujian tampil kepada siswa sesuai kelas dan waktu pelaksanaan.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Publikasi gagal.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function conf(
    type: Kind,
    key: "enabled" | "option_count" | "max_questions" | "default_points",
    value: number | boolean,
  ) {
    setConfigs((xs) =>
      xs.map((c) => (c.type === type ? { ...c, [key]: value } : c)),
    );
  }
  return (
    <div className="stack">
      <p role="status" aria-live="polite">
        {message}
      </p>
      <div className="actions">
        {data?.admin && (
          <Button disabled={busy} onClick={() => void begin()}>
            Buat ujian terpandu
          </Button>
        )}
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Periksa ulang kesiapan
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/exams">Bank soal & pengaturan lanjutan</Link>
        </Button>
      </div>
      {loading && <p role="status">Memeriksa kesiapan…</p>}
      {data && (
        <>
          <label>
            Ujian
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setConfirmation("");
                publishId.current = null;
              }}
            >
              <option value="">Pilih ujian</option>
              {data.exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {e.lifecycle}
                </option>
              ))}
            </select>
          </label>
          {!data.exams.length && (
            <section className="panel empty-state">
              <h2>Belum ada ujian</h2>
              <p>
                {data.admin
                  ? "Mulai dari identitas, peserta, dan jadwal. Simpan sebagai draf sebelum mengisi soal."
                  : "Ujian yang ditugaskan kepada Anda akan tampil di sini."}
              </p>
            </section>
          )}
        </>
      )}
      {exam && !open && (
        <section className="panel stack">
          <h2>{exam.title}</h2>
          <Checklist exam={exam} canManage={data?.admin} />
          <p className="muted">
            Jadwal:{" "}
            {new Date(exam.starts_at).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB · Durasi {exam.duration_minutes} menit. Kesiapan akun
            menunjukkan konfirmasi email, bukan bukti uji login perangkat.
          </p>
          <div className="actions">
            <Button asChild variant="outline">
              <Link href={`/dashboard/exams?exam=${exam.id}`}>
                Kelola soal dan jadwal
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/monitor">Pelaksanaan</Link>
            </Button>
            {data?.admin && (
              <Button asChild variant="outline">
                <Link href="/dashboard/rooms">Ruang & pengawas</Link>
              </Button>
            )}
          </div>
          {data?.admin && exam.status === "draft" && (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void publish(exam.id);
              }}
            >
              <p>
                Publikasi jadwal berbeda dari publikasi hasil. Pemeriksaan
                server dijalankan kembali saat menyimpan.
              </p>
              <label>
                Ketik PUBLIKASIKAN
                <input
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  required
                  pattern="PUBLIKASIKAN"
                  autoComplete="off"
                />
              </label>
              <Button
                disabled={
                  busy || !exam.ready || confirmation !== "PUBLIKASIKAN"
                }
              >
                Publikasikan jadwal
              </Button>
            </form>
          )}
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) {
            setOpen(v);
            if (!v) setPin("");
          }
        }}
        title="Persiapan ujian terpandu"
        description="Draf disimpan pada langkah Jadwal dan Aturan. Waktu input mengikuti zona waktu perangkat."
      >
        <form onSubmit={next} className="stack" aria-busy={busy}>
          <ol className="wizard-steps" aria-label="Tahap persiapan">
            {steps.map((s, i) => (
              <li key={s} aria-current={step === i ? "step" : undefined}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
          <h3 ref={heading} tabIndex={-1}>
            {steps[step]}
          </h3>
          {step === 0 && (
            <>
              <label>
                Judul ujian
                <input
                  required
                  maxLength={150}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label>
                Mata pelajaran
                <select
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                >
                  <option value="">Pilih mapel</option>
                  {meta.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <p>
                Siswa aktif pada kelas berikut menjadi peserta eligible.
                Perubahan keanggotaan kelas dapat mengubah daftar ini.
              </p>
              <fieldset>
                <legend>Kelas peserta</legend>
                {meta.classes.map((c) => (
                  <label key={c.id} className="check">
                    <input
                      type="checkbox"
                      checked={classes.includes(c.id)}
                      onChange={(e) =>
                        setClasses((xs) =>
                          e.target.checked
                            ? [...xs, c.id]
                            : xs.filter((x) => x !== c.id),
                        )
                      }
                    />
                    {c.name}
                  </label>
                ))}
              </fieldset>
            </>
          )}
          {step === 2 && (
            <>
              <label>
                Mulai
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </label>
              <label>
                Akhir
                <input
                  type="datetime-local"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
              <label>
                Durasi (menit)
                <input
                  type="number"
                  required
                  min={1}
                  max={1440}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                />
              </label>
              <label>
                PIN {id ? "(kosongkan jika tetap)" : "4–12 digit"}
                <input
                  type="password"
                  required={!id}
                  pattern="[0-9]{4,12}"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <p>
                Draf akan disimpan sebelum melanjutkan. PIN tidak disimpan di
                perangkat.
              </p>
            </>
          )}
          {step === 3 && (
            <>
              <p>
                Isi soal dari bank soal, lalu kembali ke wizard ini untuk
                memeriksa kesiapan. Tautan membuka tab baru agar langkah Anda
                tetap tersedia.
              </p>
              <Button asChild variant="outline">
                <a
                  href={`/dashboard/exams?exam=${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Buka bank soal (tab baru)
                </a>
              </Button>
              <p>{exam?.question_count || 0} soal tersimpan.</p>
            </>
          )}
          {step === 4 && (
            <>
              <label>
                Nilai kelulusan
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  required
                  value={passing}
                  onChange={(e) => setPassing(Number(e.target.value))}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={shuffleQ}
                  onChange={(e) => setShuffleQ(e.target.checked)}
                />
                Acak urutan soal per tipe
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={shuffleO}
                  onChange={(e) => setShuffleO(e.target.checked)}
                />
                Acak pilihan jawaban
              </label>
              <p>
                Kuota 0 berarti tanpa batas. Aturan harus sesuai soal yang sudah
                tersimpan.
              </p>
              {configs.map((c) => (
                <fieldset key={c.type}>
                  <legend>{c.type}</legend>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) =>
                        conf(c.type, "enabled", e.target.checked)
                      }
                    />
                    Aktif
                  </label>
                  <label>
                    Kuota soal
                    <input
                      type="number"
                      required
                      min={0}
                      max={10000}
                      value={c.max_questions}
                      onChange={(e) =>
                        conf(c.type, "max_questions", Number(e.target.value))
                      }
                    />
                  </label>
                  {["PG", "PG_KOMPLEKS"].includes(c.type) && (
                    <label>
                      Jumlah opsi
                      <input
                        type="number"
                        required
                        min={2}
                        max={6}
                        value={c.option_count}
                        onChange={(e) =>
                          conf(c.type, "option_count", Number(e.target.value))
                        }
                      />
                    </label>
                  )}
                </fieldset>
              ))}
            </>
          )}
          {step === 5 && exam && (
            <Checklist exam={exam} canManage={data?.admin} />
          )}
          {step === 6 && (
            <>
              <p>
                <strong>{title}</strong> akan tampil kepada siswa setelah
                dipublikasikan, dengan akses mulai tetap mengikuti jadwal dan
                PIN. Hasil ujian diatur terpisah.
              </p>
              {exam && <Checklist exam={exam} canManage={data?.admin} />}
              <label>
                Ketik PUBLIKASIKAN
                <input
                  required
                  pattern="PUBLIKASIKAN"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          )}
          <p role="status">{message}</p>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy || step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Kembali
            </Button>
            {step < 6 ? (
              <Button disabled={busy}>
                {step === 2 || step === 4 ? "Simpan draf & lanjut" : "Lanjut"}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={
                  busy || !exam?.ready || confirmation !== "PUBLIKASIKAN"
                }
                onClick={() => void publish(id)}
              >
                Publikasikan jadwal
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setPin("");
              }}
            >
              Tutup {id ? "(draf tersimpan)" : "wizard"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
