"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {
  types,
  questionSchema,
  type Question,
  type Kind,
} from "../../lib/authoring/schema";
import {
  previewImport,
  templates,
  type Preview,
} from "../../lib/authoring/imports";
import dynamic from "next/dynamic";
const QuestionPreview = dynamic(
  () => import("./preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
type Config = {
  type: Kind;
  enabled: boolean;
  max_questions: number;
  option_count: number;
  default_points: number;
};
type Exam = {
  id: string;
  subject_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: string;
  passing_grade: number;
  bypass_period: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
};
type Row = {
  id: string;
  type: Kind;
  current_version: number;
  payload: Question;
};
type Data = {
  exams: Exam[];
  examClasses: { exam_id: string; class_id: string }[];
  configs: (Config & { exam_id: string })[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string }[];
  period: { enabled: boolean; starts_at: string; ends_at: string } | null;
  questions: Row[];
  history: { question_id: string; version: number; payload: Question }[];
  canManage: boolean;
  serverNow: string;
};
const defaultConfigs = (): Config[] =>
  types.map((type) => ({
    type,
    enabled: true,
    max_questions: 0,
    option_count: 4,
    default_points: 1,
  }));
const local = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const iso = (s: string) => new Date(s).toISOString();
async function post(input: unknown) {
  const r = await fetch("/api/authoring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error?.message || "Penyimpanan gagal.");
  return j.data;
}
export function AuthoringPanel() {
  const [data, setData] = useState<Data | null>(null),
    [examId, setExamId] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [examOpen, setExamOpen] = useState(false),
    [editing, setEditing] = useState<Exam | null>(null),
    [configs, setConfigs] = useState<Config[]>(defaultConfigs),
    [classIds, setClassIds] = useState<string[]>([]),
    [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [questionOpen, setQuestionOpen] = useState(false),
    [editingQ, setEditingQ] = useState<Row | null>(null),
    [draft, setDraft] = useState<Question>(questionSchema.parse(templates.PG)),
    [optionText, setOptionText] = useState(""),
    [keyText, setKeyText] = useState(""),
    [questionError, setQuestionError] = useState("");
  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]),
    [history, setHistory] = useState<Question | null>(null),
    [importText, setImportText] = useState(""),
    [preview, setPreview] = useState<Preview[]>([]),
    [requestId, setRequestId] = useState(""),
    [copyTarget, setCopyTarget] = useState("");
  const [examSearch, setExamSearch] = useState(""),
    [questionSearch, setQuestionSearch] = useState(""),
    [page, setPage] = useState(1);
  const loadSequence = useRef(0);
  async function load(id = examId) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const r = await fetch("/api/authoring" + (id ? "?exam=" + id : ""));
      const j = await r.json();
      if (!r.ok) throw Error(j.error?.message);
      if (sequence === loadSequence.current) setData(j.data);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Data gagal dimuat.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  useEffect(() => {
    let live = true;
    fetch("/api/authoring")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error?.message);
        if (live) setData(j.data);
      })
      .catch((e) => {
        if (live) setMessage(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
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
  const exam = data?.exams.find((e) => e.id === examId);
  function editExam(e: Exam | null) {
    setEditing(e);
    setClassIds(
      e
        ? data!.examClasses
            .filter((c) => c.exam_id === e.id)
            .map((c) => c.class_id)
        : [],
    );
    setConfigs(
      e ? data!.configs.filter((c) => c.exam_id === e.id) : defaultConfigs(),
    );
    setExamOpen(true);
  }
  function editQuestion(q: Row | null, type: Kind = "PG") {
    const conf = data!.configs.find(
      (c) => c.exam_id === examId && c.type === (q?.type || type),
    );
    const d =
      q?.payload ||
      questionSchema.parse({
        ...(templates[type] as object),
        points: conf?.default_points || 1,
        ...(type === "PG" || type === "PG_KOMPLEKS"
          ? {
              options: Array.from(
                { length: conf?.option_count || 4 },
                (_, i) => ({
                  id: String.fromCharCode(65 + i),
                  text: "Pilihan " + (i + 1),
                }),
              ),
            }
          : {}),
      });
    setEditingQ(q);
    setDraft(d);
    setOptionText(d.options.map((o) => `${o.id}|${o.text}`).join("\n"));
    setKeyText(d.key.join("\n"));
    setQuestionError("");
    setQuestionOpen(true);
    setRequestId(crypto.randomUUID());
  }
  function currentQuestion() {
    return questionSchema.parse({
      ...draft,
      options: optionText.trim()
        ? optionText
            .split("\n")
            .filter(Boolean)
            .map((line, i) => {
              const at = line.indexOf("|");
              return at >= 0
                ? {
                    id: line.slice(0, at).trim(),
                    text: line.slice(at + 1).trim(),
                  }
                : { id: "o" + (i + 1), text: line.trim() };
            })
        : [],
      key: keyText.trim()
        ? keyText
            .trim()
            .split("\n")
            .map((s) => s.trim())
        : [],
    });
  }
  async function saveExam(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      const pin = String(f.get("pin") || "");
      const result = await post({
        action: "exam",
        exam: {
          ...(editing ? { id: editing.id } : {}),
          title: f.get("title"),
          subject_id: f.get("subject_id"),
          class_ids: classIds,
          starts_at: iso(String(f.get("starts_at"))),
          ends_at: iso(String(f.get("ends_at"))),
          duration_minutes: Number(f.get("duration")),
          passing_grade: Number(f.get("passing")),
          status: f.get("status"),
          bypass_period: f.get("bypass") === "on",
          shuffle_questions: f.get("shuffle_q") === "on",
          shuffle_options: f.get("shuffle_o") === "on",
          ...(pin ? { pin } : {}),
          configs,
        },
      });
      setExamOpen(false);
      setExamId(result.id);
      await load(result.id);
      setMessage("Jadwal disimpan.");
    });
  }
  async function saveQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setQuestionError("");
    await run(async () => {
      const q = currentQuestion();
      const result = await post({
        action: "questions",
        exam_id: examId,
        request_id: requestId,
        ...(editingQ
          ? {
              question_id: editingQ.id,
              expected_version: editingQ.current_version,
            }
          : {}),
        items: [q],
      });
      if (!result.saved)
        throw Error(result.details?.[0]?.error || "Soal gagal disimpan.");
      setQuestionOpen(false);
      await load();
      setMessage("Versi soal disimpan.");
    });
  }
  async function downloadExcel() {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Soal");
    sheet.addRow(["question_json"]);
    for (const t of types) {
      const c = data?.configs.find((c) => c.exam_id === examId && c.type === t);
      const v = {
        ...(templates[t] as object),
        ...(["PG", "PG_KOMPLEKS"].includes(t)
          ? {
              options: Array.from({ length: c?.option_count || 4 }, (_, i) => ({
                id: String.fromCharCode(65 + i),
                text: "Pilihan " + (i + 1),
              })),
            }
          : {}),
      };
      sheet.addRow([JSON.stringify(v)]);
    }
    sheet.getColumn(1).width = 100;
    const buffer = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "template-soal-edutara.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function readFile(file: File) {
    if (file.size > 5_000_000) throw Error("Maksimal 5 MB.");
    let text = await file.text();
    if (/\.xlsx$/i.test(file.name)) {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const rows: unknown[] = [];
      wb.worksheets[0]?.eachRow((r, i) => {
        if (i > 1) {
          const s = r.getCell(1).text;
          if (s.trim()) rows.push(JSON.parse(s));
        }
      });
      text = JSON.stringify(rows);
    } else {
      try {
        const obj = JSON.parse(text);
        if (!Array.isArray(obj) && obj.items) {
          const { fromGoogleExport } = await import(
            "../../lib/authoring/google-export"
          );
          text = JSON.stringify(fromGoogleExport(obj));
        }
      } catch (e) {
        if (/\.json$/i.test(file.name)) throw e;
      }
    }
    setImportText(text);
    setPreview(previewImport(text));
    setRequestId(crypto.randomUUID());
  }
  const toggle = (xs: string[], id: string) =>
    xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id];
  const shown = (data?.questions || []).filter((q) =>
    q.payload?.stem.toLowerCase().includes(questionSearch.toLowerCase()),
  );
  if (!data)
    return (
      <>
        <p role="status">
          {loading ? "Memuat…" : message || "Data belum tersedia."}
        </p>
        <Button onClick={() => void load()}>Coba lagi</Button>
      </>
    );
  return (
    <div className="stack">
      <p role="status" aria-live="polite">
        {message}
      </p>
      {loading && <p role="status">Memuat data…</p>}
      <section className="panel stack">
        <div className="actions">
          {data.canManage && (
            <Button onClick={() => editExam(null)}>Tambah ujian</Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Muat ulang
          </Button>
        </div>
        <label>
          Cari ujian
          <input
            value={examSearch}
            onChange={(e) => setExamSearch(e.target.value)}
          />
        </label>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pilih</th>
                <th>Ujian</th>
                <th>Jadwal</th>
                <th>Status efektif</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.exams
                .filter((e) =>
                  e.title.toLowerCase().includes(examSearch.toLowerCase()),
                )
                .map((e) => {
                  const now = Date.parse(data.serverNow);
                  const status = ["draft", "closed", "archived"].includes(
                    e.status,
                  )
                    ? e.status
                    : now >= Date.parse(e.ends_at)
                      ? "closed"
                      : e.status === "active" || now >= Date.parse(e.starts_at)
                        ? "active"
                        : "scheduled";
                  return (
                    <tr key={e.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"Pilih " + e.title}
                          checked={selectedExams.includes(e.id)}
                          onChange={() =>
                            setSelectedExams(toggle(selectedExams, e.id))
                          }
                        />
                      </td>
                      <td>{e.title}</td>
                      <td>
                        {new Date(e.starts_at).toLocaleString("id-ID")} –{" "}
                        {new Date(e.ends_at).toLocaleString("id-ID")}
                      </td>
                      <td>{status}</td>
                      <td>
                        <div className="actions">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setExamId(e.id);
                              setSelectedQuestions([]);
                              setPage(1);
                              void load(e.id);
                            }}
                          >
                            Bank soal
                          </Button>
                          {data.canManage && (
                            <Button
                              variant="outline"
                              onClick={() => editExam(e)}
                            >
                              Ubah
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!data.exams.length && <p>Belum ada ujian.</p>}
        {data.canManage && selectedExams.length > 0 && (
          <Button
            disabled={busy}
            variant="destructive"
            onClick={() =>
              void run(async () => {
                await post({ action: "archive_exams", ids: selectedExams });
                setSelectedExams([]);
                await load();
                setMessage("Ujian diarsipkan.");
              })
            }
          >
            Arsipkan {selectedExams.length} ujian terpilih
          </Button>
        )}
      </section>
      {data.canManage && (
        <details className="panel">
          <summary>Periode input soal Guru</summary>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await post({
                  action: "period",
                  enabled: f.get("enabled") === "on",
                  starts_at: f.get("start")
                    ? iso(String(f.get("start")))
                    : null,
                  ends_at: f.get("end") ? iso(String(f.get("end"))) : null,
                });
                await load();
                setMessage("Periode diperbarui.");
              });
            }}
          >
            <label className="check">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={data.period?.enabled}
              />
              Batasi periode input Guru
            </label>
            <label>
              Mulai
              <input
                type="datetime-local"
                name="start"
                defaultValue={
                  data.period?.starts_at ? local(data.period.starts_at) : ""
                }
              />
            </label>
            <label>
              Akhir
              <input
                type="datetime-local"
                name="end"
                defaultValue={
                  data.period?.ends_at ? local(data.period.ends_at) : ""
                }
              />
            </label>
            <Button disabled={busy}>Simpan periode</Button>
          </form>
        </details>
      )}
      {exam && (
        <section className="panel stack">
          <h2>Bank soal — {exam.title}</h2>
          <p>
            Waktu server: {new Date(data.serverNow).toLocaleString("id-ID")}.
            Soal dikunci saat ujian mulai.
          </p>
          <div className="cards">
            {data.configs
              .filter((c) => c.exam_id === examId)
              .map((c) => (
                <div key={c.type}>
                  <b>{c.type}</b>
                  <p>
                    {data.questions.filter((q) => q.type === c.type).length} /{" "}
                    {c.max_questions || "Tanpa batas"} ·{" "}
                    {c.enabled ? "Aktif" : "Nonaktif"}
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy || !c.enabled}
                    onClick={() => editQuestion(null, c.type)}
                  >
                    Tambah {c.type}
                  </Button>
                </div>
              ))}
          </div>
          {data.canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(async () => {
                  const r = await post({
                    action: "duplicate_exam",
                    exam_id: examId,
                    pin: f.get("pin"),
                  });
                  setExamId(r.id);
                  await load(r.id);
                  setMessage(
                    "Jadwal diduplikasi sebagai draft. Gunakan salin soal untuk mengisi bank soal.",
                  );
                });
              }}
              className="toolbar"
            >
              <label>
                PIN baru untuk duplikasi jadwal
                <input
                  name="pin"
                  type="password"
                  pattern="[0-9]{4,12}"
                  required
                  autoComplete="new-password"
                />
              </label>
              <Button disabled={busy}>Duplikasi jadwal</Button>
            </form>
          )}
          <label>
            Cari isi soal
            <input
              value={questionSearch}
              onChange={(e) => {
                setQuestionSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pilih</th>
                  <th>Tipe / versi</th>
                  <th>Isi soal</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice((page - 1) * 20, page * 20).map((q) => (
                  <tr key={q.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={"Pilih soal " + q.id}
                        checked={selectedQuestions.includes(q.id)}
                        onChange={() =>
                          setSelectedQuestions(toggle(selectedQuestions, q.id))
                        }
                      />
                    </td>
                    <td>
                      {q.type} · v{q.current_version}
                    </td>
                    <td>
                      {q.payload?.stem.replace(/<[^>]*>/g, "").slice(0, 140)}
                    </td>
                    <td>
                      <Button variant="outline" onClick={() => editQuestion(q)}>
                        Ubah / pratinjau
                      </Button>
                      <details>
                        <summary>Riwayat versi</summary>
                        {data.history
                          .filter((v) => v.question_id === q.id)
                          .map((v) => (
                            <Button
                              key={v.version}
                              variant="outline"
                              onClick={() => setHistory(v.payload)}
                            >
                              Versi {v.version}
                            </Button>
                          ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shown.length && <p>Belum ada soal sesuai pencarian.</p>}
          <div className="actions">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </Button>
            <span>
              Halaman {page} · {shown.length} soal
            </span>
            <Button
              disabled={page * 20 >= shown.length}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </Button>
          </div>
          {selectedQuestions.length > 0 && (
            <>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await post({
                      action: "archive_questions",
                      exam_id: examId,
                      ids: selectedQuestions,
                    });
                    setSelectedQuestions([]);
                    await load();
                    setMessage("Soal diarsipkan.");
                  })
                }
              >
                Arsipkan soal terpilih
              </Button>
              <label>
                Salin soal terpilih ke ujian
                <select
                  value={copyTarget}
                  onChange={(e) => setCopyTarget(e.target.value)}
                >
                  <option value="">Pilih tujuan</option>
                  {data.exams
                    .filter((e) => e.id !== examId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={busy || !copyTarget}
                onClick={() =>
                  void run(async () => {
                    const r = await post({
                      action: "copy",
                      source_exam_id: examId,
                      exam_id: copyTarget,
                      ids: selectedQuestions,
                      request_id: crypto.randomUUID(),
                    });
                    setMessage(
                      `Tersimpan: ${r.saved}; dilewati: ${r.skipped}. ` +
                        (r.details || [])
                          .filter((x: { saved: boolean }) => !x.saved)
                          .map(
                            (x: { block: number; error: string }) =>
                              `Blok ${x.block}: ${x.error}`,
                          )
                          .join("; "),
                    );
                  })
                }
              >
                Salin dengan ID soal dan relasi lampiran baru
              </Button>
            </>
          )}
          <details>
            <summary>Impor soal dan template</summary>
            <div className="stack">
              <p>
                Maksimal 500 soal / 5 MB. Excel: kolom A berisi JSON soal, baris
                pertama judul. Google Forms: unggah ekspor JSON Forms API atau
                berkas Excel yang dinormalisasi.
              </p>
              <div className="actions">
                {types.map((t) => (
                  <Button
                    key={t}
                    variant="outline"
                    onClick={() => {
                      const c = data.configs.find(
                        (c) => c.exam_id === examId && c.type === t,
                      );
                      const v = {
                        ...(templates[t] as object),
                        ...(t === "PG" || t === "PG_KOMPLEKS"
                          ? {
                              options: Array.from(
                                { length: c?.option_count || 4 },
                                (_, i) => ({
                                  id: String.fromCharCode(65 + i),
                                  text: "Pilihan " + (i + 1),
                                }),
                              ),
                            }
                          : {}),
                      };
                      setImportText(JSON.stringify([v], null, 2));
                      setPreview([]);
                    }}
                  >
                    Template {t}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void run(downloadExcel)}
              >
                Unduh template Excel
              </Button>
              <label>
                Berkas Excel / JSON / teks
                <input
                  type="file"
                  accept=".xlsx,.json,.txt"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void run(() => readFile(f));
                    e.target.value = "";
                  }}
                />
              </label>
              <label>
                Data impor
                <textarea
                  rows={10}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setPreview([]);
                  }}
                />
              </label>
              <Button
                disabled={busy || !importText.trim()}
                onClick={() => {
                  try {
                    setPreview(previewImport(importText));
                    setRequestId(crypto.randomUUID());
                    setMessage(
                      "Pratinjau selesai. Server akan memeriksa kuota dan periode kembali.",
                    );
                  } catch (e) {
                    setMessage(
                      e instanceof Error ? e.message : "Format tidak valid.",
                    );
                  }
                }}
              >
                Pratinjau impor
              </Button>
              <ol>
                {preview.map((p) => (
                  <li key={p.block}>
                    Blok {p.block}: {p.error || `${p.question!.type} — valid`}
                  </li>
                ))}
              </ol>
              <Button
                disabled={busy || !preview.some((p) => p.question)}
                onClick={() =>
                  void run(async () => {
                    const r = await post({
                      action: "questions",
                      exam_id: examId,
                      request_id: requestId,
                      items: preview
                        .filter((p) => p.question)
                        .map((p) => p.question),
                    });
                    await load();
                    setMessage(
                      `Tersimpan: ${r.saved}; dilewati: ${r.skipped}. ` +
                        (r.details || [])
                          .filter((x: { saved: boolean }) => !x.saved)
                          .map(
                            (x: { block: number; error: string }) =>
                              `Blok ${x.block}: ${x.error}`,
                          )
                          .join("; "),
                    );
                  })
                }
              >
                Impor blok valid
              </Button>
            </div>
          </details>
        </section>
      )}
      <Dialog
        open={examOpen}
        onOpenChange={setExamOpen}
        title={editing ? "Ubah ujian" : "Tambah ujian"}
        description="Waktu menggunakan zona waktu perangkat. PIN disimpan sebagai hash."
      >
        <form onSubmit={saveExam} className="stack">
          <label>
            Judul
            <input
              name="title"
              required
              maxLength={150}
              defaultValue={editing?.title}
            />
          </label>
          <label>
            Mata pelajaran
            <select
              name="subject_id"
              required
              defaultValue={editing?.subject_id}
            >
              <option value="">Pilih mapel</option>
              {data.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Kelas peserta (pilih satu atau lebih)</legend>
            {data.classes.map((c) => (
              <label className="check" key={c.id}>
                <input
                  type="checkbox"
                  checked={classIds.includes(c.id)}
                  onChange={() => setClassIds(toggle(classIds, c.id))}
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <label>
            Mulai
            <input
              type="datetime-local"
              name="starts_at"
              required
              defaultValue={editing ? local(editing.starts_at) : ""}
            />
          </label>
          <label>
            Akhir
            <input
              type="datetime-local"
              name="ends_at"
              required
              defaultValue={editing ? local(editing.ends_at) : ""}
            />
          </label>
          <label>
            Durasi menit
            <input
              type="number"
              min={1}
              max={1440}
              required
              name="duration"
              defaultValue={editing?.duration_minutes || 60}
            />
          </label>
          <label>
            PIN {editing ? "(kosongkan untuk mempertahankan)" : ""}
            <input
              name="pin"
              type="password"
              pattern="[0-9]{4,12}"
              required={!editing}
              autoComplete="new-password"
            />
          </label>
          <label>
            Passing grade
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              name="passing"
              defaultValue={editing?.passing_grade || 0}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={editing?.status || "draft"}>
              {["draft", "scheduled", "active", "closed", "archived"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <label className="check">
            <input
              name="bypass"
              type="checkbox"
              defaultChecked={editing?.bypass_period}
            />
            Lewati periode input Guru
          </label>
          <label className="check">
            <input
              name="shuffle_q"
              type="checkbox"
              defaultChecked={editing?.shuffle_questions}
            />
            Acak soal dalam tipe
          </label>
          <label className="check">
            <input
              name="shuffle_o"
              type="checkbox"
              defaultChecked={editing?.shuffle_options}
            />
            Acak opsi
          </label>
          <p>Kuota 0 = tanpa batas. Opsi PG mendukung A–F.</p>
          {configs.map((c, i) => (
            <fieldset key={c.type}>
              <legend>{c.type}</legend>
              <label className="check">
                <input
                  type="checkbox"
                  checked={c.enabled}
                  onChange={(e) =>
                    setConfigs(
                      configs.map((x, j) =>
                        j === i ? { ...x, enabled: e.target.checked } : x,
                      ),
                    )
                  }
                />
                Aktif
              </label>
              {(
                ["max_questions", "option_count", "default_points"] as const
              ).map((k) => (
                <label key={k}>
                  {
                    {
                      max_questions: "Kuota",
                      option_count: "Jumlah opsi PG",
                      default_points: "Poin default",
                    }[k]
                  }
                  <input
                    type="number"
                    min={
                      k === "max_questions"
                        ? 0
                        : k === "option_count"
                          ? 2
                          : 0.01
                    }
                    max={k === "option_count" ? 6 : 10000}
                    step={k === "default_points" ? "any" : 1}
                    value={c[k]}
                    onChange={(e) =>
                      setConfigs(
                        configs.map((x, j) =>
                          i === j ? { ...x, [k]: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <Button disabled={busy}>Simpan jadwal</Button>
          <p role="status">{message}</p>
        </form>
      </Dialog>
      <Dialog
        open={questionOpen}
        onOpenChange={setQuestionOpen}
        title={editingQ ? "Ubah soal" : "Tambah soal"}
        description="Gunakan ID opsi stabil. Kunci dan rubrik hanya terlihat oleh staf berizin."
      >
        <form onSubmit={saveQuestion} className="stack">
          <label>
            Tipe
            <select
              value={draft.type}
              onChange={(e) => editQuestion(null, e.target.value as Kind)}
            >
              {types.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Arah teks
            <select
              value={draft.direction}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  direction: e.target.value as "ltr" | "rtl",
                })
              }
            >
              <option value="ltr">Kiri ke kanan</option>
              <option value="rtl">Arab / kanan ke kiri</option>
            </select>
          </label>
          <label>
            Isi soal (HTML terbatas dan LaTeX $...$)
            <textarea
              rows={6}
              dir={draft.direction}
              required
              value={draft.stem}
              onChange={(e) => setDraft({ ...draft, stem: e.target.value })}
            />
          </label>
          <div className="actions">
            {[
              "<b>tebal</b>",
              "<i>miring</i>",
              "<sup>2</sup>",
              "$\\frac{a}{b}$",
              "أ ب ت ث",
              "≤ ≥ ≠ × ÷ √ π",
            ].map((s) => (
              <Button
                type="button"
                variant="outline"
                key={s}
                onClick={() =>
                  setDraft({ ...draft, stem: draft.stem + " " + s })
                }
              >
                {s}
              </Button>
            ))}
          </div>
          <label>
            Poin
            <input
              type="number"
              step="any"
              min={0.01}
              max={10000}
              required
              value={draft.points}
              onChange={(e) =>
                setDraft({ ...draft, points: Number(e.target.value) })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) =>
                setDraft({ ...draft, required: e.target.checked })
              }
            />
            Wajib dijawab
          </label>
          {draft.type !== "Esai" && (
            <>
              <label>
                Opsi / pernyataan — ID|teks, satu per baris
                <textarea
                  value={optionText}
                  onChange={(e) => setOptionText(e.target.value)}
                  rows={5}
                />
              </label>
              <label>
                Kunci satu per baris: ID opsi PG, true/false BS, jawaban
                pasangan JODOH
                <textarea
                  value={keyText}
                  onChange={(e) => setKeyText(e.target.value)}
                  rows={4}
                />
              </label>
            </>
          )}
          <label>
            Pembahasan
            <textarea
              value={draft.explanation}
              onChange={(e) =>
                setDraft({ ...draft, explanation: e.target.value })
              }
            />
          </label>
          {draft.type === "Esai" && (
            <>
              <label>
                Rubrik
                <textarea
                  value={draft.rubric}
                  onChange={(e) =>
                    setDraft({ ...draft, rubric: e.target.value })
                  }
                />
              </label>
              <label>
                Minimal karakter
                <input
                  type="number"
                  min={0}
                  max={50000}
                  value={draft.minChars}
                  onChange={(e) =>
                    setDraft({ ...draft, minChars: Number(e.target.value) })
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.canvas.enabled}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      canvas: { ...draft.canvas, enabled: e.target.checked },
                    })
                  }
                />
                Siapkan canvas jawaban
              </label>
            </>
          )}
          <label>
            ID lampiran (pisahkan koma)
            <input
              value={draft.attachments.join(",")}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  attachments: e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            Unggah gambar / audio (maksimal 5 MB)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,audio/mpeg,audio/ogg,audio/wav"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  void run(async () => {
                    if (f.size > 5242880) throw Error("Maksimal 5 MB.");
                    const form = new FormData();
                    form.set("file", f);
                    const r = await fetch("/api/authoring/media", {
                      method: "POST",
                      body: form,
                    });
                    const j = await r.json();
                    if (!r.ok) throw Error(j.error.message);
                    setDraft((d) => ({
                      ...d,
                      attachments: [...d.attachments, j.data.id],
                    }));
                  });
                e.target.value = "";
              }}
            />
          </label>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                try {
                  setDraft(currentQuestion());
                  setQuestionError("");
                } catch (e) {
                  setQuestionError(
                    e instanceof Error ? e.message : "Soal tidak valid.",
                  );
                }
              }}
            >
              Perbarui pratinjau
            </Button>
            <Button disabled={busy}>Simpan versi soal</Button>
          </div>
          <p role="alert">{questionError || message}</p>
          <QuestionPreview question={draft} />
        </form>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={() => setHistory(null)}
        title="Versi soal tersimpan"
        description="Versi lama tidak dapat ditimpa."
      >
        {history && <QuestionPreview question={history} />}
      </Dialog>
    </div>
  );
}
