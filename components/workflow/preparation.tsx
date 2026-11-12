"use client";
import { MoreActions } from "../ui/more-actions";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { z } from "zod";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import {
  preparationDataSchema,
  preparationMetaSchema,
  preparationSelection,
  publishReceipt,
} from "../../lib/workflow/preparation-contracts";
import { roomInstant } from "../../lib/operations/rooms";
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
  inDialog = false,
}: {
  exam: Preparation;
  canManage?: boolean;
  inDialog?: boolean;
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
                  <Link
                    href={c.href}
                    target={inDialog ? "_blank" : undefined}
                    rel={inDialog ? "noopener noreferrer" : undefined}
                  >
                    Perbaiki {c.label.toLowerCase()}
                    {inDialog ? " (tab baru)" : ""}
                  </Link>
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
  const [readError, setReadError] = useState(""),
    [tone, setTone] = useState<"info" | "error" | "success">("info"),
    [uncertain, setUncertain] = useState<"draft" | "publish" | null>(null),
    [hasSession, setHasSession] = useState(false);
  const draftRetry = useRef<{
    signature: string;
    id: string;
    input: z.output<typeof examSchema>;
  } | null>(null);
  const publishRetry = useRef<{
    target: string;
    id: string;
    confirmation: string;
  } | null>(null);
  const lock = useRef(false),
    mounted = useRef(true),
    sequence = useRef(0),
    controllers = useRef(new Set<AbortController>()),
    reading = useRef<AbortController | null>(null),
    flight = useRef<Promise<boolean> | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const request = useCallback(async function request<T>(
    url: string,
    input: object | undefined,
    schema: z.ZodType<T>,
    c = new AbortController(),
  ) {
    controllers.current.add(c);
    try {
      const result = await clientRequest(url, input, schema, c, {
        mutation: !!input,
      });
      if (!mounted.current) throw Error("Permintaan dibatalkan.");
      return result;
    } finally {
      controllers.current.delete(c);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current, generation = sequence;
    return () => {
      mounted.current = false;
      generation.current++;
      flight.current = null;
      active.forEach((c) => c.abort());
    };
  }, []);
  const invalidate = useCallback(() => {
    sequence.current++;
    reading.current?.abort();
    flight.current = null;
  }, []);
  const load = useCallback(async (): Promise<boolean> => {
    if (!mounted.current) return false;
    if (flight.current) return flight.current;
    const generation = ++sequence.current,
      c = new AbortController();
    reading.current = c;
    setLoading(true);
    const promise = (async () => {
      try {
        const d = await request(
          "/api/workflow",
          undefined,
          preparationDataSchema,
          c,
        );
        if (generation !== sequence.current) return false;
        setData(d);
        setReadError("");
        setSelected((current) =>
          preparationSelection(
            d.exams,
            current,
            new URLSearchParams(location.search).get("exam"),
          ),
        );
        return true;
      } catch (e) {
        if (mounted.current && generation === sequence.current)
          setReadError(
            e instanceof Error ? e.message : "Kesiapan gagal dimuat.",
          );
        return false;
      } finally {
        if (mounted.current && generation === sequence.current) {
          setLoading(false);
          flight.current = null;
        }
      }
    })();
    flight.current = promise;
    return promise;
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [step, open]);
  const exam = data?.exams.find((e) => e.id === (open ? id : selected));
  const messageFor = (e: unknown, fallback: string) =>
    e instanceof z.ZodError
      ? e.issues.map((i) => i.message).join("; ")
      : e instanceof Error
        ? e.message
        : fallback;
  async function begin(fresh = false) {
    if (lock.current || uncertain) return;
    if (hasSession && !fresh) {
      setOpen(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    setTone("info");
    try {
      const d = await request(
        "/api/authoring",
        undefined,
        preparationMetaSchema,
      );
      if (!d.canManage) throw Error("Hanya Admin dapat membuat jadwal ujian.");
      setMeta({
        classes: d.classes.filter((c) => c.active !== false),
        subjects: d.subjects.filter((c) => c.active !== false),
      });
      setId("");
      draftRetry.current = null;
      publishRetry.current = null;
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
      setHasSession(true);
      setOpen(true);
    } catch (e) {
      if (mounted.current) {
        setTone("error");
        setMessage(messageFor(e, "Data belum dapat dimuat."));
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function draft() {
    const input =
      uncertain === "draft" && draftRetry.current
        ? draftRetry.current.input
        : examSchema.parse({
            ...(id ? { id } : {}),
            title,
            subject_id: subject,
            class_ids: classes,
            starts_at: roomInstant(start),
            ends_at: roomInstant(end),
            duration_minutes: duration,
            ...(pin ? { pin } : {}),
            passing_grade: passing,
            status: "draft",
            bypass_period: false,
            shuffle_questions: shuffleQ,
            shuffle_options: shuffleO,
            configs,
          });
    if (
      Date.parse(input.ends_at) - Date.parse(input.starts_at) <
      input.duration_minutes * 60000
    )
      throw Error("Durasi ujian harus muat dalam rentang jadwal.");
    const signature = JSON.stringify(input);
    if (draftRetry.current?.signature !== signature)
      draftRetry.current = { signature, id: crypto.randomUUID(), input };
    invalidate();
    const result = await request(
      "/api/authoring",
      { action: "exam", request_id: draftRetry.current.id, exam: input },
      z.object({ id: z.uuid() }).refine((r) => !input.id || r.id === input.id),
    );
    draftRetry.current = null;
    setUncertain(null);
    setId(result.id);
    setSelected(result.id);
    setPin("");
    const refreshed = await load();
    setTone(refreshed ? "success" : "info");
    setMessage(
      refreshed
        ? "Draf tersimpan."
        : "Draf tersimpan, tetapi kesiapan belum dapat dimuat. Periksa ulang sebelum melanjutkan.",
    );
  }
  async function next(e?: FormEvent, retry = false) {
    e?.preventDefault();
    if (lock.current || (uncertain && !retry)) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setTone("info");
    try {
      if (step === 0 && (!title.trim() || !subject))
        throw Error("Isi judul dan pilih mata pelajaran.");
      if (step === 1 && !classes.length)
        throw Error("Pilih minimal satu kelas peserta.");
      if (step === 2 || step === 4) await draft();
      if ((step === 3 || step === 5) && !(await load()))
        throw Error(
          "Kesiapan belum dapat dipastikan. Periksa ulang sebelum melanjutkan.",
        );
      if (mounted.current) setStep((s) => Math.min(s + 1, 6));
    } catch (e) {
      if (mounted.current) {
        setTone("error");
        setMessage(messageFor(e, "Draf gagal disimpan."));
        if (e instanceof ClientRequestError && e.uncertain)
          setUncertain("draft");
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function publish(target: string, retry = false) {
    if (lock.current || !data?.admin || (uncertain && !retry)) return;
    if (
      !retry &&
      (!exam?.ready ||
        exam.status !== "draft" ||
        loading ||
        readError ||
        confirmation !== "PUBLIKASIKAN")
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setTone("info");
    try {
      if (!publishRetry.current || publishRetry.current.target !== target)
        publishRetry.current = {
          target,
          id: crypto.randomUUID(),
          confirmation,
        };
      const pending = publishRetry.current;
      invalidate();
      await request(
        "/api/workflow",
        {
          action: "publish",
          exam_id: pending.target,
          request_id: pending.id,
          confirmation: pending.confirmation,
        },
        publishReceipt(pending.target),
      );
      publishRetry.current = null;
      setUncertain(null);
      setOpen(false);
      setHasSession(false);
      setConfirmation("");
      const refreshed = await load();
      setTone("success");
      setMessage(
        refreshed
          ? "Jadwal dipublikasikan. Akses siswa tetap mengikuti kelas, jadwal, dan PIN."
          : "Jadwal dipublikasikan, tetapi daftar belum dapat diperbarui. Muat ulang untuk memeriksa status.",
      );
    } catch (e) {
      if (mounted.current) {
        setTone("error");
        setMessage(messageFor(e, "Publikasi gagal."));
        if (e instanceof ClientRequestError && e.uncertain)
          setUncertain("publish");
        else publishRetry.current = null;
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function closeWizard() {
    if (lock.current) return;
    setOpen(false);
    if (!uncertain) setPin("");
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
    <div className="stack preparation-page">
      <FeedbackMessage
        tone={tone}
        role={tone === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {message}
      </FeedbackMessage>
      <div className="actions">
        {data?.admin && (
          <>
            <Button disabled={busy || !!uncertain} onClick={() => void begin()}>
              {hasSession ? "Lanjutkan persiapan" : "Buat ujian terpandu"}
            </Button>
            {hasSession && (
              <Button
                variant="outline"
                disabled={busy || !!uncertain}
                onClick={() => void begin(true)}
              >
                Mulai draf baru
              </Button>
            )}
          </>
        )}
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Periksa ulang kesiapan
        </Button>
        <MoreActions label="Pengaturan ujian">
          <Button asChild variant="outline">
            <Link href="/dashboard/exams">Bank soal & pengaturan lanjutan</Link>
          </Button>
        </MoreActions>
      </div>
      {readError && (
        <StateCard
          kind="error"
          title="Kesiapan belum dapat dimuat"
          description={readError}
          actions={
            <Button disabled={loading || busy} onClick={() => void load()}>
              Coba muat kesiapan
            </Button>
          }
        />
      )}
      {uncertain && !open && (
        <StateCard
          kind="error"
          title="Hasil tindakan belum pasti"
          description="Jangan membuat permintaan baru. Buka kembali langkah ini dan periksa hasil dengan identitas permintaan yang sama."
          actions={
            <Button
              disabled={busy}
              onClick={() =>
                uncertain === "publish"
                  ? void publish(publishRetry.current?.target || selected, true)
                  : setOpen(true)
              }
            >
              {uncertain === "publish"
                ? "Periksa / ulangi publikasi"
                : "Periksa tindakan tertunda"}
            </Button>
          }
        />
      )}
      {loading && (
        <FeedbackMessage tone="loading" role="status">
          Memeriksa kesiapan…
        </FeedbackMessage>
      )}
      {data && (
        <>
          <label>
            Ujian
            <select
              value={selected}
              disabled={busy || !!uncertain}
              onChange={(e) => {
                setSelected(e.target.value);
                setConfirmation("");
                publishRetry.current = null;
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
            <StateCard kind="empty" className="panel empty-state">
              <h2>Belum ada ujian</h2>
              <p>
                {data.admin
                  ? "Mulai dari identitas, peserta, dan jadwal. Simpan sebagai draf sebelum mengisi soal."
                  : "Ujian yang ditugaskan kepada Anda akan tampil di sini."}
              </p>
            </StateCard>
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
            <ValidatedForm
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void publish(exam.id);
              }}
            >
              <fieldset
                className="preparation-fields stack"
                disabled={busy || !!uncertain || loading || !!readError}
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
              </fieldset>
            </ValidatedForm>
          )}
        </section>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) closeWizard();
        }}
        title="Persiapan ujian terpandu"
        description="Lengkapi tiap tahap. Draf disimpan pada langkah Jadwal dan Aturan; waktu menggunakan WIB."
        className="preparation-dialog"
      >
        <ValidatedForm
          onSubmit={(e) => {
            if (step === 6) {
              e.preventDefault();
              void publish(id);
            } else void next(e);
          }}
          className="stack"
          aria-busy={busy}
        >
          <ol className="wizard-steps" aria-label="Tahap persiapan" data-progress={`Langkah ${step+1} dari ${steps.length}`}>
            {steps.map((s, i) => (
              <li key={s} aria-current={step === i ? "step" : undefined}>
                {i + 1}. {s}
              </li>
            ))}
          </ol>
          <h3 ref={heading} tabIndex={-1}>
            {steps[step]}
          </h3>
          <fieldset
            className="preparation-fields stack"
            disabled={busy || !!uncertain}
          >
            {step === 0 && (
              <>
                {!meta.subjects.length && (
                  <StateCard
                    kind="empty"
                    title="Belum ada mata pelajaran aktif"
                    description="Tambahkan mata pelajaran di Data master sebelum melanjutkan."
                  />
                )}
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
                {!meta.classes.length && (
                  <StateCard
                    kind="empty"
                    title="Belum ada kelas aktif"
                    description="Tambahkan kelas melalui Data master sebelum melanjutkan."
                  />
                )}
                <fieldset className="preparation-classes">
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
                  Mulai (WIB)
                  <input
                    type="datetime-local"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Akhir (WIB)
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
                  Draf akan disimpan sebelum melanjutkan. PIN tidak dicatat ke
                  penyimpanan browser.
                </p>
              </>
            )}
            {step === 3 && (
              <>
                <Button asChild variant="outline">
                  <a
                    href={`/dashboard/exams?exam=${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Buka bank soal (tab baru)
                  </a>
                </Button>
                <p>
                  {!readError && exam ? exam.question_count : "—"} soal
                  tersimpan.
                </p>
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
                  Kuota 0 berarti tanpa batas. Aturan harus sesuai soal yang
                  sudah tersimpan.
                </p>
                <div className="preparation-configs">
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
                            conf(
                              c.type,
                              "max_questions",
                              Number(e.target.value),
                            )
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
                              conf(
                                c.type,
                                "option_count",
                                Number(e.target.value),
                              )
                            }
                          />
                        </label>
                      )}
                    </fieldset>
                  ))}
                </div>
              </>
            )}
            {step === 5 && exam && (
              <Checklist exam={exam} canManage={data?.admin} inDialog />
            )}
            {step === 6 && (
              <>
                <p>
                  <strong>{title}</strong> akan tampil kepada siswa setelah
                  dipublikasikan, dengan akses mulai tetap mengikuti jadwal dan
                  PIN. Hasil ujian diatur terpisah.
                </p>
                {exam && (
                  <Checklist exam={exam} canManage={data?.admin} inDialog />
                )}
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
          </fieldset>
          {step >= 3 && !exam && !loading && (
            <StateCard
              kind="error"
              title="Draf belum tersedia"
              description="Periksa ulang kesiapan. Jangan membuat draf baru sebelum memastikan hasil penyimpanan."
            />
          )}
          {readError && (
            <FeedbackMessage tone="error">{readError}</FeedbackMessage>
          )}
          <FeedbackMessage
            tone={tone}
            role={tone === "error" ? "alert" : "status"}
          >
            {message}
          </FeedbackMessage>
          {uncertain && (
            <div className="notice" role="alert">
              <p>
                Hasil belum pasti. Isian ditahan agar pemeriksaan ulang memakai
                permintaan yang sama.
              </p>
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  uncertain === "draft"
                    ? void next(undefined, true)
                    : void publish(publishRetry.current?.target || id, true)
                }
              >
                Periksa / ulangi{" "}
                {uncertain === "draft" ? "penyimpanan" : "publikasi"}
              </Button>
            </div>
          )}
          {(readError || (step >= 3 && !exam)) && (
            <Button
              type="button"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              Periksa ulang di dialog
            </Button>
          )}
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !!uncertain || step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Kembali
            </Button>
            {step < 6 ? (
              <Button
                disabled={
                  busy ||
                  !!uncertain ||
                  loading ||
                  ((step === 3 || step === 5) && (!!readError || !exam))
                }
              >
                {step === 2 || step === 4 ? "Simpan draf & lanjut" : "Lanjut"}
              </Button>
            ) : (
              <Button
                disabled={
                  busy ||
                  !!uncertain ||
                  loading ||
                  !!readError ||
                  !exam?.ready ||
                  confirmation !== "PUBLIKASIKAN"
                }
              >
                Publikasikan jadwal
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={closeWizard}
            >
              Tutup {id ? "(draf tersimpan)" : "wizard"}
            </Button>
          </div>
        </ValidatedForm>
      </Dialog>
    </div>
  );
}
