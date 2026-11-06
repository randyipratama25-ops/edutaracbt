"use client";
import { TaskTabs } from "../ui/task-tabs";
import { MoreActions } from "../ui/more-actions";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { ListFilters } from "../ui/list-filters";
import { HelpDisclosure } from "../ui/help-disclosure";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { ApiError, api } from "../operations/shared";
import type { ResultQuestion } from "../../lib/results/types";
const Preview = dynamic(
  () => import("../authoring/preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
import { z } from "zod";
import {
  assessmentList,
  assessmentDetail,
  assessmentModerations,
  assessmentPublications,
  assessmentExams,
  assessmentReceipt,
} from "../../lib/assessment/contracts";
import { gradeValue, revisionReason } from "../../lib/results/contracts";

type Row = z.infer<typeof assessmentList>["rows"][number];
type Detail = z.infer<typeof assessmentDetail>;
type Moderation = z.infer<typeof assessmentModerations>[number];
type Publication = z.infer<typeof assessmentPublications>[number];

async function read<T>(
  url: string,
  schema: z.ZodType<T>,
  signal = AbortSignal.timeout(18000),
) {
  const result = schema.safeParse(
    await api<unknown>(url, undefined, { signal, validateEnvelope: true }),
  );
  if (!result.success)
    throw Error("Data penilaian tidak dapat dibaca. Silakan muat ulang.");
  return result.data;
}
const pubLabels: Record<string, string> = {
  scheduled: "Terjadwal",
  published: "Dipublikasikan",
  cancelled: "Dibatalkan",
  blocked: "Perlu tinjauan ulang",
};
function Canvas({ id }: { id: string }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void read(
      "/api/results/media?kind=canvas&id=" + encodeURIComponent(id),
      z.object({ url: z.url() }),
      AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]),
    )
      .then((d) => {
        if (!controller.signal.aborted) {
          setUrl(d.url);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Canvas gagal dimuat.");
      });
    return () => controller.abort();
  }, [id, version]);
  return url ? (
    <Image
      src={url}
      width={1200}
      height={800}
      alt="Canvas jawaban peserta anonim"
      unoptimized
      className="assessment-canvas"
      onError={() => {
        setUrl("");
        setError("Canvas belum berhasil ditampilkan.");
      }}
    />
  ) : (
    <div>
      <FeedbackMessage tone="info" role="status">
        {error || "Memuat canvas…"}
      </FeedbackMessage>
      {error && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setVersion((v) => v + 1)}
        >
          Coba muat canvas
        </Button>
      )}
    </div>
  );
}
export function AssessmentPanel() {
  const [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [admin, setAdmin] = useState(false),
    [exam, setExam] = useState(""),
    [exams, setExams] = useState<{ id: string; title: string }[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [qid, setQid] = useState(""),
    [criteria, setCriteria] = useState<Record<string, string>>({}),
    [points, setPoints] = useState(""),
    [comment, setComment] = useState(""),
    [reason, setReason] = useState(""),
    [mods, setMods] = useState<Moderation[]>([]),
    [publications, setPublications] = useState<Publication[]>([]),
    [listError, setListError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<{
      id: string;
      decision: "approved" | "rejected";
    } | null>(null),
    [decisionNote, setDecisionNote] = useState(""),
    [date, setDate] = useState(""),
    [scheduleReason, setScheduleReason] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [cancelTarget, setCancelTarget] = useState("");
  const lock = useRef(false),
    retry = useRef(new Map<string, string>());
  const request = useRef<AbortController | null>(null);
  const workspace = useRef<HTMLElement | null>(null);
  const [notice, setNotice] = useState<{
    tone: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [sectionErrors, setSectionErrors] = useState({
    moderation: false,
    publication: false,
    exams: false,
  });
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(18000),
    ]);
    setLoading(true);
    setListError("");
    const suffix = exam ? "&exam=" + exam : "";
    const [queue, moderations, schedules, options] = await Promise.allSettled([
      read(`/api/assessment?page=${page}${suffix}`, assessmentList, signal),
      read(
        "/api/assessment?action=moderations" + suffix,
        assessmentModerations,
        signal,
      ),
      read(
        "/api/assessment?action=publications",
        assessmentPublications,
        signal,
      ),
      read("/api/operations", assessmentExams, signal),
    ]);
    if (controller.signal.aborted) return;
    if (queue.status === "fulfilled") {
      const { rows, total, admin } = queue.value;
      setAdmin(admin);
      const last = Math.max(1, Math.min(10000, Math.ceil(total / 25)));
      if (page > last) {
        setPage(last);
        return;
      }
      setRows(rows);
      setTotal(total);
    } else {
      setRows([]);
      setTotal(0);
      setListError(
        queue.reason instanceof Error
          ? queue.reason.message
          : "Antrean koreksi belum dapat dimuat.",
      );
    }
    setMods(moderations.status === "fulfilled" ? moderations.value : []);
    setPublications(schedules.status === "fulfilled" ? schedules.value : []);
    setExams(options.status === "fulfilled" ? options.value.exams : []);
    setSectionErrors({
      moderation: moderations.status === "rejected",
      publication: schedules.status === "rejected",
      exams: options.status === "rejected",
    });
    setLoading(false);
  }, [page, exam]);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setNotice({
        tone: "error",
        text:
          e instanceof ApiError && e.status === 409
            ? "Revisi berubah. Muat ulang detail atau antrean sebelum mencoba lagi."
            : e instanceof Error
              ? e.message
              : "Perubahan gagal.",
      });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send(
    url: string,
    input: { action: string; [key: string]: unknown },
  ) {
    const signature = JSON.stringify({ url, input });
    const id = retry.current.get(signature) ?? crypto.randomUUID();
    retry.current.set(signature, id);
    try {
      const response = await api<unknown>(
        url,
        { ...input, request_id: id },
        { signal: AbortSignal.timeout(25000), validateEnvelope: true },
      );
      const receipt = assessmentReceipt(url, input).safeParse(response);
      if (!receipt.success) throw Error("Bukti penyimpanan tidak valid.");
      retry.current.delete(signature);
      return receipt.data;
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status &&
        [400, 401, 403, 409, 413, 422].includes(e.status)
      ) {
        retry.current.delete(signature);
        throw e;
      }
      throw Error(
        "Status penyimpanan belum pasti. Untuk mencoba lagi dengan aman, kirim ulang isian yang sama.",
      );
    }
  }
  function select(q: ResultQuestion | undefined) {
    setQid(q?.id || "");
    setCriteria(
      Object.fromEntries(
        Object.entries(q?.criteria || {}).map(([k, v]) => [k, String(v)]),
      ),
    );
    setPoints(q?.earned == null ? "" : String(q.earned));
    setComment(q?.comment || "");
    setReason("");
  }
  async function open(id: string, selected?: string) {
    const next = await read(
      "/api/assessment?action=detail&attempt=" + id,
      assessmentDetail,
    );
    setDetail(next);
    const essays = next.questions.filter(
      (item) => item.payload.type === "Esai",
    );
    select(essays.find((item) => item.id === selected) ?? essays[0]);
  }
  async function refreshAfterWrite(text: string, refreshDetail = true) {
    let detailFailed = false;
    if (detail && refreshDetail) {
      try {
        await open(detail.attempt.id, qid);
      } catch {
        setDetail(null);
        detailFailed = true;
      }
    }
    await load();
    setNotice({
      tone: "success",
      text: detailFailed
        ? text +
          " Detail terbaru belum dapat dimuat. Buka kembali ruang koreksi."
        : text,
    });
  }
  const q = detail?.questions.find((q) => q.id === qid),
    cs = q?.payload.rubricCriteria || [];
  const complete = cs.length
    ? cs.every((c) => Boolean(criteria[c.id]?.trim()))
    : Boolean(points.trim());
  const sum = cs.length
    ? cs.reduce((n, c) => n + Number(criteria[c.id] || 0), 0)
    : Number(points);
  const pages = Math.max(1, Math.min(10000, Math.ceil(total / 25)));
  function changeExam(value: string) {
    if (lock.current) return;
    setExam(value);
    setPage(1);
    setDetail(null);
    setDate("");
    setScheduleReason("");
    setConfirmation("");
  }
  async function grade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !q) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const mode =
      submitter instanceof HTMLButtonElement && submitter.value === "propose"
        ? "propose"
        : "grade";
    await run(async () => {
      const values = Object.fromEntries(
        cs.map((c) => [c.id, gradeValue(criteria[c.id] ?? "", c.maxPoints)]),
      );
      const total = cs.length
        ? Object.values(values).reduce((n, value) => n + value, 0)
        : gradeValue(points, q.payload.points);
      const input = {
        attempt_id: detail.attempt.id,
        question_id: q.id,
        expected_revision: detail.attempt.revision,
        points: total,
        criteria: values,
        comment,
        reason: revisionReason(reason),
      };
      if (mode === "grade")
        await send("/api/results", { action: "grade_batch", grades: [input] });
      else await send("/api/assessment", { action: "propose", ...input });
      await refreshAfterWrite(
        mode === "grade"
          ? "Nilai resmi tersimpan. Admin dapat memublikasikan ulang nilai."
          : "Usulan moderasi tercatat dan menunggu keputusan penilai lain.",
      );
    });
  }
  return (
    <div className="assessment-workspace stack">
      <div className="actions">
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Muat ulang penilaian
        </Button>
        <MoreActions label="Halaman terkait">
          <Button asChild variant="outline">
            <Link href="/dashboard/results">Hasil, riwayat & laporan</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/bank">Bank soal & rubrik</Link>
          </Button>
        </MoreActions>
      </div>
      {!decision && !cancelTarget && notice && (
        <FeedbackMessage
          tone={notice.tone}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </FeedbackMessage>
      )}
      <TaskTabs label="Koreksi dan moderasi" items={[
        { id: "queue", label: "Antrean dan koreksi", content: (
          <div className="stack">
          <section className="panel stack">
          <h2>Antrean koreksi</h2>
          <ListFilters
          label="antrean koreksi"
          active={[exam && "Ujian"].filter(Boolean) as string[]}
          onReset={() => changeExam("")}
          total={total}
          loading={loading}
          error={listError}
          >
          <label>
            Ujian
            <select
              value={exam}
              disabled={busy || sectionErrors.exams}
              onChange={(e) => changeExam(e.target.value)}
            >
              <option value="">Semua ujian berizin</option>
              {exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          {sectionErrors.exams && (
            <FeedbackMessage tone="error" role="alert">
              Pilihan ujian gagal dimuat. Gunakan Muat ulang penilaian.
            </FeedbackMessage>
          )}
          </ListFilters>
          {loading ? (
          <FeedbackMessage tone="loading" role="status">
            Memuat antrean koreksi…
          </FeedbackMessage>
          ) : rows.length > 0 ? (
          <div
            className="table-wrap"
            role="region"
            tabIndex={0}
            aria-label="Antrean koreksi anonim"
          >
            <table className="assessment-table">
              <thead>
                <tr>
                  <th>Kode peserta</th>
                  <th>Ujian</th>
                  <th>Belum dikoreksi</th>
                  <th>Nilai</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">{r.code}</th>
                    <td>{r.title}</td>
                    <td>{r.pending} esai</td>
                    <td>{r.score === null ? "Menunggu" : r.score}</td>
                    <td>
                      <Button
                        disabled={busy}
                        variant="outline"
                        onClick={() =>
                          void run(async () => {
                            await open(r.id);
                            requestAnimationFrame(() =>
                              workspace.current?.focus(),
                            );
                          })
                        }
                      >
                        Koreksi anonim
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
          !listError && (
            <StateCard
              kind={exam ? "no-results" : "empty"}
              title={
                exam
                  ? "Tidak ada hasil untuk ujian ini"
                  : "Belum ada hasil untuk dinilai"
              }
              description={
                exam
                  ? "Pilih ujian lain atau reset filter."
                  : "Hasil peserta yang sudah selesai akan muncul sesuai penugasan Anda."
              }
            />
          )
          )}
          {pages > 1 && !listError && (
          <nav className="actions" aria-label="Halaman antrean">
            <Button
              variant="outline"
              disabled={page <= 1 || loading || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              Sebelumnya
            </Button>
            <span>
              Halaman {page} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={page >= pages || loading || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
            </Button>
          </nav>
          )}
          </section>
          {detail && (
          <section
          ref={workspace}
          tabIndex={-1}
          className="panel stack"
          aria-label="Ruang koreksi anonim"
          >
          <div className="actions">
            <h2>{detail.attempt.code}</h2>
            <span>
              {detail.attempt.title} · revisi {detail.attempt.revision}
            </span>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              Tutup koreksi
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => open(detail.attempt.id, qid))}
            >
              Muat ulang detail
            </Button>
          </div>
          <label>
            Soal esai
            <select
              disabled={busy || !qid}
              value={qid}
              onChange={(e) =>
                select(detail.questions.find((q) => q.id === e.target.value))
              }
            >
              {detail.questions
                .filter((q) => q.payload.type === "Esai")
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    Soal {q.position} ·{" "}
                    {q.earned === null
                      ? "Belum dikoreksi"
                      : q.earned + " / " + q.payload.points}
                  </option>
                ))}
            </select>
          </label>
          {q ? (
            <ValidatedForm
              key={qid}
              className="stack"
              aria-busy={busy}
              onSubmit={(e) => void grade(e)}
            >
              <Preview
                question={q.payload}
                attachmentBaseUrl="/api/results/media"
              />
              <div className="grading-grid">
                <section className="stack">
                  <h3>Jawaban peserta</h3>
                  <pre className="answer-text">
                    {q.answer &&
                    typeof q.answer === "object" &&
                    !Array.isArray(q.answer)
                      ? String(
                          (q.answer as Record<string, unknown>).text ||
                            "Jawaban teks belum diisi",
                        )
                      : String(q.answer || "Belum dijawab")}
                  </pre>
                  {Boolean(q.answer) &&
                    typeof q.answer === "object" &&
                    !Array.isArray(q.answer) &&
                    typeof (q.answer as Record<string, unknown>).canvas_id ===
                      "string" && (
                      <Canvas
                        key={String(
                          (q.answer as Record<string, unknown>).canvas_id,
                        )}
                        id={String(
                          (q.answer as Record<string, unknown>).canvas_id,
                        )}
                      />
                    )}
                </section>
                <fieldset className="stack" disabled={busy}>
                  <legend>Penilaian esai</legend>
                  <p>
                    Pedoman:{" "}
                    {q.payload.rubric || "Gunakan pedoman yang disepakati."}
                  </p>
                  {cs.length ? (
                    cs.map((c) => (
                      <label key={c.id}>
                        {c.label} (maks. {c.maxPoints})
                        <input
                          required
                          type="number"
                          min={0}
                          max={c.maxPoints}
                          step="any"
                          value={criteria[c.id] ?? ""}
                          onChange={(e) =>
                            setCriteria((xs) => ({
                              ...xs,
                              [c.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))
                  ) : (
                    <label>
                      Nilai esai (0 sah; kosong = menunggu)
                      <input
                        required
                        type="number"
                        min={0}
                        max={q.payload.points}
                        step="any"
                        value={points}
                        onChange={(e) => setPoints(e.target.value)}
                      />
                    </label>
                  )}
                  <strong>
                    Total: {complete ? sum : "Belum lengkap"} /{" "}
                    {q.payload.points}
                  </strong>
                  <label>
                    Umpan balik peserta
                    <textarea
                      maxLength={5000}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                  <label>
                    Catatan / alasan penilaian
                    <textarea
                      required
                      minLength={5}
                      maxLength={1000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <Button disabled={busy}>Simpan nilai resmi</Button>
                    <Button
                      type="submit"
                      value="propose"
                      variant="outline"
                      disabled={busy}
                    >
                      Ajukan moderasi
                    </Button>
                  </div>
                </fieldset>
              </div>
            </ValidatedForm>
          ) : (
            <p>Hasil ini tidak memuat soal esai.</p>
          )}
          </section>
          )}
          </div>
        ) },
        { id: "moderation", label: "Moderasi dan publikasi", content: (
          <div className="stack">
          <section className="panel stack">
          <h2>Moderasi nilai</h2>
          <p>
          Usulan harus diputuskan penilai lain dalam cakupan. Jika revisi
          dasarnya berubah, tolak usulan lama dan ajukan kembali.
          </p>
          {loading ? (
          <FeedbackMessage tone="loading">Memuat moderasi…</FeedbackMessage>
          ) : sectionErrors.moderation ? (
          <FeedbackMessage tone="error" role="alert">
            Moderasi gagal dimuat. Gunakan Muat ulang penilaian.
          </FeedbackMessage>
          ) : mods.length ? (
          <ul className="moderation-list">
            {mods.map((m) => (
              <li key={m.id}>
                <div>
                  <strong>
                    {m.points} poin ·{" "}
                    {m.state === "pending"
                      ? "Menunggu"
                      : m.state === "approved"
                        ? "Disetujui"
                        : "Ditolak"}
                  </strong>
                  <p>{m.reason}</p>
                  <small>
                    Revisi dasar {m.basis_revision} · saat ini{" "}
                    {m.current_revision}
                  </small>
                  {m.decision_reason && <p>Keputusan: {m.decision_reason}</p>}
                </div>
                {m.can_decide && (
                  <div className="actions">
                    <Button
                      variant="outline"
                      disabled={busy || m.basis_revision !== m.current_revision}
                      onClick={() => {
                        setNotice(null);
                        setDecision({ id: m.id, decision: "approved" });
                        setDecisionNote("");
                      }}
                    >
                      Setujui usulan
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setNotice(null);
                        setDecision({ id: m.id, decision: "rejected" });
                        setDecisionNote("");
                      }}
                    >
                      Tolak usulan
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          ) : (
          <p>Belum ada usulan moderasi.</p>
          )}
          </section>
          {admin && (
          <section className="panel stack">
          <h2>Publikasi nilai terjadwal</h2>
          <HelpDisclosure>
            <p>
              Ujian harus selesai, seluruh koreksi final, dan moderasi
              terselesaikan. Revisi nilai membatalkan kesiapan publikasi.
              Otomasi memeriksa ulang setiap menit.
            </p>
          </HelpDisclosure>
          <ValidatedForm
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                if (!exam) throw Error("Pilih ujian terlebih dahulu.");
                const time = new Date(date);
                if (
                  !Number.isFinite(time.getTime()) ||
                  time.getTime() <= Date.now()
                )
                  throw Error("Pilih waktu publikasi di masa depan.");
                await send("/api/assessment", {
                  action: "schedule",
                  exam_id: exam,
                  scheduled_at: time.toISOString(),
                  reason: revisionReason(scheduleReason),
                  confirmation,
                });
                setDate("");
                setScheduleReason("");
                setConfirmation("");
                await refreshAfterWrite(
                  "Jadwal publikasi disimpan. Nilai disembunyikan sampai jadwal dijalankan.",
                  false,
                );
              });
            }}
          >
            <p>
              Ujian terpilih:{" "}
              <strong>
                {exams.find((e) => e.id === exam)?.title ||
                  "Pilih pada filter antrean"}
              </strong>
            </p>
            <label>
              Waktu publikasi (zona waktu perangkat)
              <input
                type="datetime-local"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Alasan / catatan publikasi
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={scheduleReason}
                onChange={(e) => setScheduleReason(e.target.value)}
              />
            </label>
            <label>
              Ketik JADWALKAN
              <input
                required
                pattern="JADWALKAN"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </label>
            <Button disabled={busy || loading || !exam}>
              Jadwalkan publikasi nilai
            </Button>
          </ValidatedForm>
          {loading ? (
            <FeedbackMessage tone="loading">Memuat jadwal…</FeedbackMessage>
          ) : sectionErrors.publication ? (
            <FeedbackMessage tone="error" role="alert">
              Jadwal gagal dimuat. Gunakan Muat ulang penilaian.
            </FeedbackMessage>
          ) : !publications.length ? (
            <p>Belum ada jadwal publikasi.</p>
          ) : (
            <ul className="moderation-list">
              {publications.map((p) => (
                <li key={p.exam_id}>
                  <div>
                    <strong>
                      {exams.find((e) => e.id === p.exam_id)?.title || "Ujian"}{" "}
                      · {pubLabels[p.state] ?? p.state}
                    </strong>
                    <p>
                      {new Date(p.scheduled_at).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      WIB
                    </p>
                    {p.error && <p>{p.error}</p>}
                  </div>
                  {["scheduled", "blocked"].includes(p.state) && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setNotice(null);
                        setCancelTarget(p.exam_id);
                        setDecisionNote("");
                      }}
                    >
                      Batalkan jadwal
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          </section>
          )}
          </div>
        ) }
      ]} />
      <Dialog
        className="assessment-decision"
        open={!!decision || !!cancelTarget}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setDecision(null);
            setCancelTarget("");
          }
        }}
        title={
          cancelTarget ? "Batalkan jadwal publikasi" : "Keputusan moderasi"
        }
        description={
          cancelTarget
            ? "Tuliskan alasan pembatalan jadwal."
            : decision?.decision === "approved"
              ? "Persetujuan memperbarui nilai resmi peserta."
              : "Penolakan mempertahankan nilai resmi saat ini."
        }
      >
        <ValidatedForm
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const reason = revisionReason(decisionNote);
              let text = "Keputusan moderasi tersimpan.";
              if (cancelTarget) {
                const receipt = await send("/api/assessment", {
                  action: "cancel",
                  exam_id: cancelTarget,
                  reason,
                });
                text =
                  receipt &&
                  typeof receipt === "object" &&
                  "cancelled" in receipt &&
                  receipt.cancelled
                    ? "Jadwal publikasi dibatalkan."
                    : "Jadwal tersebut sudah tidak dapat dibatalkan.";
              } else if (decision)
                await send("/api/assessment", {
                  action: "moderate",
                  ...decision,
                  reason,
                });
              else return;
              setDecision(null);
              setCancelTarget("");
              await refreshAfterWrite(
                text,
                !!decision &&
                  decision.decision === "approved" &&
                  mods.some(
                    (m) =>
                      m.id === decision.id &&
                      m.attempt_id === detail?.attempt.id,
                  ),
              );
            });
          }}
        >
          <label>
            Alasan keputusan
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
            />
          </label>
          <div className="actions">
            <Button loading={busy} disabled={busy}>
              {busy
                ? "Menyimpan…"
                : cancelTarget
                  ? "Batalkan jadwal"
                  : decision?.decision === "approved"
                    ? "Setujui usulan"
                    : "Tolak usulan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDecision(null);
                setCancelTarget("");
              }}
            >
              Kembali
            </Button>
          </div>
          {notice && (
            <FeedbackMessage tone={notice.tone} role="alert">
              {notice.text}
            </FeedbackMessage>
          )}
        </ValidatedForm>
      </Dialog>
    </div>
  );
}
