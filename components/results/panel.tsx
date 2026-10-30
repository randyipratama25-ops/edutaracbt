"use client";
import { useEffect, useCallback, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import type { ResultDetail, ResultRow } from "../../lib/results/types";
import type { analyze } from "../../lib/results/analytics";
import { reportKinds, reportLabels } from "../../lib/reports/schema";
import type { ReportSettings } from "../../lib/reports/render";
const Preview = dynamic(
  () => import("../authoring/preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
async function request(url: string, input?: unknown) {
  const r = await fetch(
    url,
    input
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }
      : undefined,
  );
  const j = await r.json();
  if (!r.ok) throw Error(j.error?.message || "Permintaan gagal.");
  return j.data;
}
type Job = {
  id: string;
  kind: string;
  format: string;
  status: string;
  progress: number;
  failures: number;
  error: string | null;
};
export function ResultsPanel({
  analyticsFirst = false,
}: {
  analyticsFirst?: boolean;
}) {
  const [rows, setRows] = useState<ResultRow[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [state, setState] = useState("all"),
    [sort, setSort] = useState("name"),
    [classId, setClassId] = useState(""),
    [subjectId, setSubjectId] = useState(""),
    [examId, setExamId] = useState("");
  const [masters, setMasters] = useState<{
    classes: { id: string; name: string }[];
    subjects: { id: string; name: string }[];
  }>({ classes: [], subjects: [] });
  const [selected, setSelected] = useState<Record<string, ResultRow>>({}),
    [detail, setDetail] = useState<ResultDetail | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [canPublish, setCanPublish] = useState(false),
    [points, setPoints] = useState<Record<string, string>>({}),
    [comments, setComments] = useState<Record<string, string>>({});
  const [batch, setBatch] = useState<ResultDetail[]>([]),
    [batchOpen, setBatchOpen] = useState(false),
    [batchQuestion, setBatchQuestion] = useState(""),
    [batchPoints, setBatchPoints] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyze> | null>(
      null,
    ),
    [jobs, setJobs] = useState<Job[]>([]),
    [kind, setKind] = useState<(typeof reportKinds)[number]>("recap"),
    [format, setFormat] = useState("pdf"),
    [settings, setSettings] = useState<
      (ReportSettings & { can_manage: boolean }) | null
    >(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [recalcOpen, setRecalcOpen] = useState(false),
    [reason, setReason] = useState(""),
    [aiEdit, setAiEdit] = useState<Record<string, string>>({});
  const sequence = useRef(0);
  const ids = Object.keys(selected);
  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: String(page),
        search,
        state,
        sort,
      });
      if (classId) q.set("class", classId);
      if (subjectId) q.set("subject", subjectId);
      if (examId) q.set("exam", examId);
      const d = await request("/api/results?" + q);
      if (seq === sequence.current) {
        setRows(d.rows);
        setTotal(d.total);
        setCanPublish(d.can_publish);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Hasil belum dapat dimuat.");
    } finally {
      if (seq === sequence.current) setLoading(false);
    }
  }, [page, search, state, sort, classId, subjectId, examId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void request("/api/admin/master")
      .then((d) => setMasters({ classes: d.classes, subjects: d.subjects }))
      .catch(() => {});
    void request("/api/reports?settings=1")
      .then(setSettings)
      .catch(() => {});
    void request("/api/reports")
      .then(setJobs)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!jobs.some((j) => j.status === "queued" || j.status === "running"))
      return;
    const timer = setInterval(
      () =>
        void request("/api/reports")
          .then(setJobs)
          .catch(() => {}),
      4000,
    );
    return () => clearInterval(timer);
  }, [jobs]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function openDetail(id: string) {
    const d: ResultDetail = await request("/api/results?attempt=" + id);
    setDetail(d);
    setPoints({});
    setComments({});
    setAiEdit({});
  }
  async function saveGrades(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    await run(async () => {
      const grades = detail.questions
        .filter(
          (q) =>
            q.payload.type === "Esai" && !q.payload.rubricCriteria?.length &&
            (points[q.id] !== undefined || comments[q.id] !== undefined),
        )
        .filter(
          (q) =>
            (points[q.id] ?? (q.earned === null ? "" : String(q.earned))) !==
            "",
        )
        .map((q) => ({
          attempt_id: detail.attempt.id,
          question_id: q.id,
          expected_revision: detail.attempt.revision,
          points: Number(points[q.id] ?? q.earned),
          comment: comments[q.id] ?? q.comment ?? "",
        }));
      if (!grades.length)
        throw Error(
          "Isi minimal satu nilai. Kolom kosong tetap pending, bukan nol.",
        );
      await request("/api/results", {
        action: "grade_batch",
        request_id: crypto.randomUUID(),
        grades,
      });
      await openDetail(detail.attempt.id);
      setSelected({});
      await load();
      setMessage("Koreksi disetujui dan nilai resmi dihitung ulang.");
    });
  }
  async function suggest(items: { attempt_id: string; question_id: string }[]) {
    try {
      await request("/api/grading/ai", {
        request_id: crypto.randomUUID(),
        items,
      });
    } finally {
      if (detail) await openDetail(detail.attempt.id);
    }
  }
  const examOptions = Array.from(
    new Map(
      [...Object.values(selected), ...rows].map((r) => [r.exam_id, r.title]),
    ).entries(),
  );
  return (
    <div className="stack">
      <div className="actions"><Button asChild variant="outline"><Link href="/dashboard/grading">Koreksi anonim, rubrik & moderasi</Link></Button></div>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section className="panel stack">
        <div className="toolbar">
          <label>
            Cari siswa/username
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Kelas
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua kelas berizin</option>
              {masters.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mapel
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua mapel berizin</option>
              {masters.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ujian
            <select
              value={examId}
              onChange={(e) => {
                setExamId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua ujian</option>
              {examOptions.map(([id, title]) => (
                <option key={id} value={id}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status nilai
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Semua</option>
              <option value="pending">Menunggu koreksi</option>
              <option value="final">Final</option>
              <option value="disqualified">Diskualifikasi</option>
            </select>
          </label>
          <label>
            Urutan
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Nama A–Z</option>
              <option value="score_asc">Nilai terendah</option>
              <option value="score_desc">Nilai tertinggi</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <Button variant="outline" onClick={() => void load()}>
            Muat ulang
          </Button>
          <Button
            variant="outline"
            disabled={!rows.length}
            onClick={() =>
              setSelected((s) => ({
                ...s,
                ...Object.fromEntries(rows.map((r) => [r.id, r])),
              }))
            }
          >
            Pilih halaman ini
          </Button>
          <Button variant="outline" onClick={() => setSelected({})}>
            Bersihkan pilihan ({ids.length})
          </Button>
        </div>
        {loading && <p>Memuat hasil…</p>}
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel hasil ujian; geser untuk melihat kolom lain">
          <table>
            <thead>
              <tr>
                <th>Pilih</th>
                <th>Peserta</th>
                <th>Ujian / kelas</th>
                <th>Status</th>
                <th>Nilai</th>
                <th>Kelulusan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Pilih hasil " + r.student}
                      checked={!!selected[r.id]}
                      onChange={() =>
                        setSelected((s) => {
                          const n = { ...s };
                          if (n[r.id]) delete n[r.id];
                          else n[r.id] = r;
                          return n;
                        })
                      }
                    />
                  </td>
                  <td>
                    {r.student}
                    <br />
                    <small>{r.username}</small>
                  </td>
                  <td>
                    {r.title}
                    <br />
                    <small>
                      {r.class_name || "Kelas historis belum tercatat"}
                    </small>
                  </td>
                  <td>
                    {r.status}
                    {r.pending > 0 && <p>{r.pending} esai pending</p>}
                  </td>
                  <td>{r.score === null ? "Menunggu" : r.score}</td>
                  <td>
                    {r.passed === null
                      ? "—"
                      : r.passed
                        ? "Lulus"
                        : "Belum lulus"}
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => void run(() => openDetail(r.id))}
                    >
                      Detail / koreksi
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && (
          <p>Belum ada hasil sesuai filter dan cakupan akses.</p>
        )}
        <div className="actions">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Sebelumnya
          </Button>
          <span>
            Halaman {page} · {total} hasil
          </span>
          <Button
            disabled={page * 25 >= total}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </section>
      <section className="panel stack">
        <h2>
          {analyticsFirst
            ? "Analisis dan tindakan terpilih"
            : "Koreksi dan laporan terpilih"}
        </h2>
        <p>
          Pilih maksimal 500 hasil. Ekspor mempertahankan revisi ledger saat job
          dibuat.
        </p>
        <div className="actions">
          <Button
            disabled={busy || !ids.length}
            onClick={() =>
              void run(async () => {
                const data: ResultDetail[] = await Promise.all(
                  ids.map((id) => request("/api/results?attempt=" + id)),
                );
                setBatch(data);
                setBatchQuestion("");
                setBatchPoints({});
                setBatchOpen(true);
              })
            }
          >
            Koreksi per soal lintas peserta
          </Button>
          <Button
            variant="outline"
            disabled={busy || !ids.length}
            onClick={() => setRecalcOpen(true)}
          >
            Rekalkulasi berizin
          </Button>
          <Button
            disabled={busy || !ids.length}
            onClick={() =>
              void run(async () =>
                setAnalysis(
                  await request("/api/reports", { action: "analysis", ids }),
                ),
              )
            }
          >
            Analisis terpilih
          </Button>
          {canPublish && (
            <>
              <Button
                variant="outline"
                disabled={busy || !ids.length}
                onClick={() =>
                  void run(async () => {
                    for (const exam_id of new Set(
                      Object.values(selected).map((r) => r.exam_id),
                    ))
                      await request("/api/results", {
                        action: "publish",
                        request_id: crypto.randomUUID(),
                        exam_id,
                        published: true,
                      });
                    await load();
                    setMessage(
                      "Nilai diterbitkan oleh Admin; esai pending dan kunci tetap tidak dikirim ke siswa.",
                    );
                  })
                }
              >
                Terbitkan nilai ujian terpilih
              </Button>
              <Button
                variant="outline"
                disabled={busy || !ids.length}
                onClick={() =>
                  void run(async () => {
                    for (const exam_id of new Set(
                      Object.values(selected).map((r) => r.exam_id),
                    ))
                      await request("/api/results", {
                        action: "publish",
                        request_id: crypto.randomUUID(),
                        exam_id,
                        published: false,
                      });
                    await load();
                    setMessage("Publikasi nilai ditutup.");
                  })
                }
              >
                Tutup publikasi
              </Button>
            </>
          )}
        </div>
        <div className="toolbar">
          <label>
            Jenis laporan
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              {reportKinds.map((k) => (
                <option key={k} value={k}>{reportLabels[k]}</option>
              ))}
            </select>
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="pdf">PDF</option>
              <option value="xlsx">Excel (.xlsx)</option>
            </select>
          </label>
          <Button
            disabled={busy || !ids.length}
            onClick={() =>
              void run(async () => {
                await request("/api/reports", {
                  action: "create",
                  request_id: crypto.randomUUID(),
                  ids,
                  kind,
                  format,
                });
                setJobs(await request("/api/reports"));
                setMessage(
                  "Job ekspor dibuat. Unduh setelah progres 100%. PDF dapat dicetak dari pembaca PDF.",
                );
              })
            }
          >
            Buat laporan / cetak massal
          </Button>
          {settings?.can_manage && (
            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              Atur kop / logo / pejabat
            </Button>
          )}
        </div>
      </section>
      {analysis && (
        <section className="panel stack">
          <h2>Analisis lima tipe</h2>
          <p>
            {analysis.eligible} peserta layak; {analysis.excluded} tidak
            dimasukkan (pending, diskualifikasi, atau attempt lama). P memakai
            proporsi poin; untuk PG sama dengan proporsi benar. D memakai
            kelompok atas/bawah max(1, floor(27% × N)).
          </p>
          {analysis.items.map((q) => (
            <details key={q.id}>
              <summary>
                {q.type} · versi {q.version} · N={q.n} · P={q.p} ({q.difficulty}
                ) · D={q.d} ({q.discrimination})
                {q.small_sample ? " · sampel kecil" : ""}
              </summary>
              <p>{q.stem.replace(/<[^>]*>/g, "")}</p>
              <p>Kelompok: {q.group_size} peserta per sisi.</p>
              <h3>Peserta salah / parsial</h3>
              <ul>
                {q.wrong.map((w) => (
                  <li key={w.attempt_id}>
                    {w.student}: {w.earned} / {w.max}
                  </li>
                ))}
              </ul>
              {q.options.map((o) => (
                <div key={o.id}>
                  <b>{o.text}</b>
                  <p>
                    Sebaran: {JSON.stringify(o.choices)}; benar per
                    pernyataan/pasangan: {o.correct}
                  </p>
                  <ul>
                    {o.wrong.map((w) => (
                      <li key={w.attempt_id}>{w.student}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {q.essay.length > 0 && (
                <ul>
                  {q.essay.map((e, i) => (
                    <li key={i}>
                      {e.student}: {e.earned} / {e.max}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </section>
      )}
      <section className="panel stack">
        <h2>Job ekspor</h2>
        <Button
          variant="outline"
          onClick={() =>
            void run(async () => setJobs(await request("/api/reports")))
          }
        >
          Muat status ekspor
        </Button>
        {!jobs.length && <p>Belum ada job ekspor.</p>}
        {jobs.map((j) => (
          <div key={j.id}>
            <b>
              {j.kind} / {j.format}
            </b>
            <p>
              {j.status} · {j.progress}%{j.error ? " — " + j.error : ""}
            </p>
            {j.status === "ready" ? (
              <a href={"/api/reports/download?job=" + j.id}>
                Unduh {j.format.toUpperCase()} (akses diperiksa kembali)
              </a>
            ) : (
              <Button
                variant="outline"
                disabled={busy || j.failures >= 5}
                onClick={() =>
                  void run(async () => {
                    await request("/api/reports/run", { job_id: j.id });
                    setJobs(await request("/api/reports"));
                  })
                }
              >
                {j.status === "failed"
                  ? "Coba ulang"
                  : "Jalankan / periksa antrean"}
              </Button>
            )}
          </div>
        ))}
      </section>
      <Dialog
        open={!!detail}
        onOpenChange={() => setDetail(null)}
        title="Detail hasil dan koreksi"
        description="Nilai resmi hanya berasal dari penilaian server. Kolom kosong mempertahankan status pending."
      >
        {detail && (
          <form className="stack" onSubmit={saveGrades}>
            <h3>
              {detail.attempt.student} — {detail.attempt.title}
            </h3>
            <p>
              Revisi {detail.attempt.revision} · nilai{" "}
              {detail.attempt.score === null
                ? "Menunggu"
                : detail.attempt.score}{" "}
              · {detail.attempt.pending} esai pending
            </p>
            {detail.questions.map((q) => (
              <section key={q.id} className="question-preview">
                <h3>
                  Soal {q.position} · v{q.version}
                </h3>
                <Preview
                  question={q.payload}
                  attachmentBaseUrl="/api/results/media"
                />
                <h3>Jawaban peserta</h3>
                <pre className="answer-text">
                  {typeof q.answer === "object"
                    ? JSON.stringify(q.answer, null, 2)
                    : String(q.answer ?? "Belum dijawab")}
                </pre>
                {Boolean(q.answer) &&
                  typeof q.answer === "object" &&
                  !Array.isArray(q.answer) &&
                  typeof (q.answer as Record<string, unknown>).canvas_id ===
                    "string" && (
                    <AnswerImage
                      id={String(
                        (q.answer as Record<string, unknown>).canvas_id,
                      )}
                    />
                  )}
                <p>
                  Nilai: {q.earned === null ? "Pending" : q.earned} /{" "}
                  {q.payload.points}
                </p>
                {q.payload.type === "Esai" &&
                  detail.attempt.status !== "disqualified" && (
                    <>
                      {!!q.payload.rubricCriteria?.length&&<p>Soal ini memakai rubrik per kriteria. <Link href="/dashboard/grading">Buka ruang koreksi rubrik</Link>.</p>}
                      <label>
                        Nilai esai (0 sah; kosong = pending)
                        <input
                          type="number"
                          min={0}
                          max={q.payload.points}
                          disabled={!!q.payload.rubricCriteria?.length}
                          step="any"
                          value={
                            points[q.id] ??
                            (q.earned === null ? "" : String(q.earned))
                          }
                          onChange={(e) =>
                            setPoints((p) => ({ ...p, [q.id]: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Catatan guru
                        <textarea
                          value={comments[q.id] ?? q.comment ?? ""}
                          maxLength={5000}
                          onChange={(e) =>
                            setComments((c) => ({
                              ...c,
                              [q.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(() =>
                            suggest([
                              {
                                attempt_id: detail.attempt.id,
                                question_id: q.id,
                              },
                            ]),
                          )
                        }
                      >
                        Minta saran AI (adaptor)
                      </Button>
                    </>
                  )}
              </section>
            ))}
            <Button disabled={busy || detail.attempt.status === "disqualified"}>
              Simpan persetujuan koreksi
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  suggest(
                    detail.questions
                      .filter((q) => q.payload.type === "Esai" && !q.payload.rubricCriteria?.length)
                      .slice(0, 50)
                      .map((q) => ({
                        attempt_id: detail.attempt.id,
                        question_id: q.id,
                      })),
                  ),
                )
              }
            >
              Saran AI batch (maksimal 50)
            </Button>
            <h3>Riwayat saran AI</h3>
            {detail.suggestions.map((s) => (
              <div key={s.id}>
                <p>
                  {s.provider} / {s.model} / {s.prompt_version} · {s.status} ·{" "}
                  {s.points === null ? "Tidak ada nilai" : s.points}
                </p>
                <p>{s.reason}</p>
                {s.status === "pending" && (
                  <>
                    <label>
                      Ubah nilai saran
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={aiEdit[s.id] ?? String(s.points ?? "")}
                        onChange={(e) =>
                          setAiEdit((v) => ({ ...v, [s.id]: e.target.value }))
                        }
                      />
                    </label>
                    <div className="actions">
                      {(["accept_ai", "edit_ai", "reject_ai"] as const).map(
                        (action) => (
                          <Button
                            key={action}
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await request("/api/results", {
                                  action,
                                  request_id: crypto.randomUUID(),
                                  suggestion_id: s.id,
                                  expected_revision: detail.attempt.revision,
                                  ...(action === "edit_ai"
                                    ? {
                                        points: Number(
                                          aiEdit[s.id] ?? s.points,
                                        ),
                                      }
                                    : {}),
                                  comment:
                                    "Keputusan guru melalui koreksi esai",
                                });
                                await openDetail(detail.attempt.id);
                                await load();
                              })
                            }
                          >
                            {action === "accept_ai"
                              ? "Terima nilai asli"
                              : action === "edit_ai"
                                ? "Setujui perubahan"
                                : "Tolak saran"}
                          </Button>
                        ),
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            <details>
              <summary>Ledger dan riwayat persetujuan</summary>
              <pre className="answer-text">
                {JSON.stringify(
                  { ledger: detail.ledger, history: detail.history },
                  null,
                  2,
                )}
              </pre>
            </details>
            <p role="status">{message}</p>
          </form>
        )}
      </Dialog>
      <Dialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        title="Koreksi per soal"
        description="Setiap nilai mengacu pada versi soal dan revisi hasil peserta. Seluruh batch disimpan dalam satu transaksi."
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const grades = batch
                .filter(
                  (d) =>
                    d.questions.some((q) => q.id === batchQuestion) &&
                    batchPoints[d.attempt.id] !== undefined &&
                    batchPoints[d.attempt.id] !== "",
                )
                .map((d) => ({
                  attempt_id: d.attempt.id,
                  question_id: batchQuestion,
                  expected_revision: d.attempt.revision,
                  points: Number(batchPoints[d.attempt.id]),
                  comment: "Koreksi batch per soal",
                }));
              if (!grades.length) throw Error("Isi minimal satu nilai.");
              await request("/api/results", {
                action: "grade_batch",
                request_id: crypto.randomUUID(),
                grades,
              });
              setBatchOpen(false);
              setSelected({});
              await load();
              setMessage("Batch koreksi disetujui.");
            });
          }}
        >
          <label>
            Soal esai
            <select
              required
              value={batchQuestion}
              onChange={(e) => {
                setBatchQuestion(e.target.value);
                setBatchPoints({});
              }}
            >
              <option value="">Pilih soal</option>
              {Array.from(
                new Map(
                  batch.flatMap((d) =>
                    d.questions
                      .filter((q) => q.payload.type === "Esai" && !q.payload.rubricCriteria?.length)
                      .map((q) => [q.id, q] as const),
                  ),
                ).values(),
              ).map((q) => (
                <option key={q.id} value={q.id}>
                  {q.payload.stem.replace(/<[^>]*>/g, "").slice(0, 80)} · v
                  {q.version}
                </option>
              ))}
            </select>
          </label>
          {batch
            .filter((d) => d.questions.some((q) => q.id === batchQuestion))
            .map((d) => {
              const q = d.questions.find((q) => q.id === batchQuestion)!;
              return (
                <section className="question-preview" key={d.attempt.id}>
                  <b>{d.attempt.student}</b>
                  <pre className="answer-text">
                    {JSON.stringify(q.answer, null, 2)}
                  </pre>
                  <label>
                    Nilai / {q.payload.points}
                    <input
                      type="number"
                      min={0}
                      max={q.payload.points}
                      step="any"
                      value={batchPoints[d.attempt.id] ?? ""}
                      onChange={(e) =>
                        setBatchPoints((p) => ({
                          ...p,
                          [d.attempt.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                </section>
              );
            })}
          <Button disabled={busy}>Simpan batch</Button>
          <p role="status">{message}</p>
        </form>
      </Dialog>
      <Dialog
        open={recalcOpen}
        onOpenChange={setRecalcOpen}
        title="Rekalkulasi hasil"
        description="Menggunakan snapshot dan engine yang sama; kunci sumber terbaru tidak mengganti snapshot attempt."
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await request("/api/results", {
                action: "recalculate",
                request_id: crypto.randomUUID(),
                ids,
                expected: Object.fromEntries(
                  Object.values(selected).map((r) => [r.id, r.revision]),
                ),
                reason,
              });
              setRecalcOpen(false);
              setSelected({});
              await load();
              setMessage("Rekalkulasi selesai dan diaudit.");
            });
          }}
        >
          <label>
            Alasan
            <textarea
              required
              minLength={5}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button disabled={busy}>Rekalkulasi terpilih</Button>
          <p role="status">{message}</p>
        </form>
      </Dialog>
      <Dialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Kop laporan"
        description="Logo menggunakan ID media privat milik organisasi. Nama pejabat dicetak sebagai identitas, bukan tanda tangan digital."
      >
        {settings && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await request("/api/reports", {
                  action: "settings",
                  school: settings.school,
                  address: settings.address,
                  official: settings.official,
                  official_title: settings.official_title,
                  logo_media_id: settings.logo_media_id || null,
                });
                setSettingsOpen(false);
                setMessage(
                  "Kop disimpan. Job lama tetap menggunakan kop saat dibuat.",
                );
              });
            }}
          >
            {(
              [
                "school",
                "address",
                "official",
                "official_title",
                "logo_media_id",
              ] as const
            ).map((k) => (
              <label key={k}>
                {
                  {
                    school: "Nama madrasah",
                    address: "Alamat",
                    official: "Nama pejabat",
                    official_title: "Jabatan",
                    logo_media_id: "ID media logo",
                  }[k]
                }
                <input
                  value={settings[k] || ""}
                  required={k === "school"}
                  onChange={(e) =>
                    setSettings((s) => (s ? { ...s, [k]: e.target.value } : s))
                  }
                />
              </label>
            ))}
            <Button disabled={busy}>Simpan kop</Button>
            <p role="status">{message}</p>
          </form>
        )}
      </Dialog>
    </div>
  );
}
function AnswerImage({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    void request("/api/results/media?id=" + id + "&kind=canvas")
      .then((d) => {
        if (live) setUrl(d.url);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return url ? (
    <Image
      src={url}
      alt="Canvas jawaban peserta"
      width={1200}
      height={800}
      unoptimized
      style={{ width: "100%", height: "auto" }}
    />
  ) : (
    <p>Memuat canvas / periksa izin lampiran.</p>
  );
}
