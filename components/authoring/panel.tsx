"use client";
import { QuestionEditor } from "./question-editor";
import { QuestionMedia } from "./question-media";
import { uploadQuestionMedia } from "../../lib/authoring/upload";

import {FeedbackMessage} from "../feedback/state";
import {ValidatedForm} from "../feedback/validated-form";
import {ListFilters, SearchField} from "../ui/list-filters";
import {matchesSearch} from "../../lib/lists/search";
import { HelpDisclosure } from "../ui/help-disclosure";

import { z } from "zod";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { authoringDataSchema, commandResultFor, questionLock } from "../../lib/authoring/contracts";
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
type Data = z.infer<typeof authoringDataSchema>;
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
    [importRequestId, setImportRequestId] = useState(""),
    [copyTarget, setCopyTarget] = useState("");
  const [examSearch, setExamSearch] = useState(""),
    [questionSearch, setQuestionSearch] = useState(""),
    [page, setPage] = useState(1);
  const loadSequence = useRef(0), loadController = useRef<AbortController | null>(null),
    controllers = useRef(new Set<AbortController>()), mounted = useRef(true), operation = useRef(false);
  const [readError,setReadError]=useState(""),[uncertain,setUncertain]=useState(false),[clock,setClock]=useState(0);
  const [serverOffset,setServerOffset]=useState(0),[loadedExam,setLoadedExam]=useState("");
  const savedQuestionRequest=useRef({signature:"",id:""});
  async function post(input: object) {
    const c=new AbortController();controllers.current.add(c);
    try { const result=await clientRequest('/api/authoring',input,commandResultFor('action' in input?input.action:undefined),c,{mutation:true}); if(!mounted.current)throw Error('Permintaan dibatalkan.'); return result as {id:string;saved:number|boolean;skipped:number;details?:{saved:boolean;block:number;error?:string}[]}; }
    finally{controllers.current.delete(c);}
  }
  async function load(id = examId) {
    const sequence=++loadSequence.current;
    loadController.current?.abort();
    const c=new AbortController();loadController.current=c;
    setLoading(true);setReadError("");
    try{
      const result=await clientRequest('/api/authoring'+(id?'?exam='+encodeURIComponent(id):''),undefined,authoringDataSchema,c);
      if(!mounted.current||sequence!==loadSequence.current)return;
      setServerOffset(Date.parse(result.serverNow)-Date.now());setClock(Date.now());
      setLoadedExam(id);setData(result);setUncertain(false);
      setSelectedExams(xs=>xs.filter(x=>result.exams.some(e=>e.id===x)));
      setSelectedQuestions(xs=>xs.filter(x=>result.questions.some(q=>q.id===x)));
    }catch(e){if(mounted.current&&sequence===loadSequence.current)setReadError(e instanceof Error?e.message:'Data gagal dimuat.');}
    finally{if(mounted.current&&sequence===loadSequence.current)setLoading(false);}
  }
  useEffect(()=>{
    mounted.current=true;
    const activeControllers=controllers.current;
    const requested=new URLSearchParams(location.search).get('exam')||'';
    setExamId(requested);void load(requested);
    const timer=setInterval(()=>setClock(Date.now()),1000);
    return()=>{mounted.current=false;loadController.current?.abort();activeControllers.forEach(c=>c.abort());clearInterval(timer);};
    // Initial URL is read once; choosing an exam explicitly loads its bank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function run(fn:()=>Promise<void>){
    if(operation.current||loading||readError||uncertain)return;
    operation.current=true;setBusy(true);setMessage('');
    try{await fn();}catch(e){if(mounted.current){setMessage(e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):e instanceof Error?e.message:'Permintaan gagal.');if(e instanceof ClientRequestError&&e.uncertain)setUncertain(true);}}
    finally{operation.current=false;if(mounted.current)setBusy(false);}
  }
  const now=clock+serverOffset;
  const blocked=busy||loading||!!readError||uncertain;
  const exam = data?.exams.find((e) => e.id === examId);
  const locked=exam?questionLock(exam,data?.period||null,data?.canManage||false,now):"";
  function editExam(e: Exam | null) {
    if(blocked)return;
    setMessage("");setEditing(e);
    setClassIds(
      e
        ? data!.examClasses
            .filter((c) => c.exam_id === e.id)
            .map((c) => c.class_id)
        : [],
    );
    setConfigs(
      e ? defaultConfigs().map(c=>data!.configs.find(x=>x.exam_id===e.id&&x.type===c.type)||c) : defaultConfigs(),
    );
    setExamOpen(true);
  }
  function editQuestion(q: Row | null, type: Kind = "PG") {
    if(blocked||locked)return;
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
    setMessage("");setEditingQ(q);
    setDraft(d);
    setOptionText(d.options.map((o) => `${o.id}|${o.text}`).join("\n"));
    setKeyText(d.key.join("\n"));
    setQuestionError("");
    setQuestionOpen(true);
    savedQuestionRequest.current={signature:"",id:""};
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
      const signature=JSON.stringify({examId,editingQ,q});
      if(savedQuestionRequest.current.signature!==signature)savedQuestionRequest.current={signature,id:crypto.randomUUID()};
      const result = await post({
        action: "questions",
        exam_id: examId,
        request_id: savedQuestionRequest.current.id,
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
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function readFile(file: File) {
    setPreview([]);setImportRequestId("");
    if (file.size > 5_000_000) throw Error("Maksimal 5 MB.");
    let text = /\.xlsx$/i.test(file.name)?"":await file.text();
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
        if (obj && typeof obj === "object" && !Array.isArray(obj) && obj.items) {
          const { fromGoogleExport } = await import(
            "../../lib/authoring/google-export"
          );
          text = JSON.stringify(fromGoogleExport(obj));
        }
      } catch (e) {
        if (/\.json$/i.test(file.name)) throw e;
      }
    }
    if(!mounted.current)return;
    setImportText(text);
    setPreview(previewImport(text));
    setImportRequestId(crypto.randomUUID());
  }
  const toggle = (xs: string[], id: string) =>
    xs.includes(id) ? xs.filter((x) => x !== id) : xs.length<500 ? [...xs, id] : xs;
  const shown = (loadedExam===examId?data?.questions || []:[]).filter((q) =>
    matchesSearch(q.payload?.stem||"",questionSearch),
  );
  const currentPage=Math.min(page,Math.max(1,Math.ceil(shown.length/20)));
  if (!data)
    return (
      <>
        <FeedbackMessage tone="info" role="status">
          {loading ? "Memuat…" : readError || message || "Data belum tersedia."}
        </FeedbackMessage>
        <Button disabled={loading} onClick={() => void load()}>Coba lagi</Button>
      </>
    );
  return (
    <div className="stack authoring-page" aria-busy={busy || loading}>
      <FeedbackMessage tone="info" role="status" aria-live="polite">
        {message}
      </FeedbackMessage>
      {loading && <FeedbackMessage tone="loading" role="status">Memuat data…</FeedbackMessage>}
      {(readError||uncertain)&&<div className="notice" role="alert"><p>{readError||'Periksa hasil perubahan sebelum melanjutkan.'}</p><Button disabled={busy||loading} onClick={()=>void load()}>Muat ulang data</Button></div>}
      <fieldset className="authoring-controls stack" disabled={blocked}>
      <section className="panel stack">
        <div className="actions">
          <Button asChild variant="outline"><a href="/dashboard/preparation">Persiapan & checklist</a></Button>
          {data.canManage && (
            <Button onClick={() => editExam(null)}>Tambah ujian</Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => void load()}>
            Muat ulang
          </Button>
        </div>
        <ListFilters label="ujian" active={[examSearch&&"Pencarian"].filter(Boolean) as string[]} onReset={()=>{setExamSearch("");}} total={data.exams.filter(e=>matchesSearch(e.title,examSearch)).length} loading={loading}><SearchField label="Cari ujian" value={examSearch} maxLength={150} onChange={value=>{setExamSearch(value);}} /></ListFilters>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel ujian dan soal; geser untuk melihat kolom lain">
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
                  matchesSearch(e.title,examSearch),
                )
                .map((e) => {
                  const time = now;
                  const status = ["draft", "closed", "archived"].includes(
                    e.status,
                  )
                    ? e.status
                    : time >= Date.parse(e.ends_at)
                      ? "closed"
                      : e.status === "active" || time >= Date.parse(e.starts_at)
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
                      <td><strong>{e.title}</strong></td>
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
                              if(blocked)return;
                              setImportText('');setPreview([]);setImportRequestId('');setCopyTarget('');setQuestionSearch('');setMessage('');
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
        {!data.exams.length ? <p>Belum ada ujian. Admin dapat menambahkan jadwal baru.</p> : !data.exams.some(e=>matchesSearch(e.title,examSearch)) && <p>Tidak ada ujian sesuai pencarian. Ubah atau hapus kata pencarian.</p>}
        {data.canManage && selectedExams.length > 0 && (
          <Button
            disabled={busy}
            variant="destructive"
            onClick={() =>
              void run(async () => {
                if(!window.confirm(`Arsipkan ${selectedExams.length} ujian terpilih? Ujian dan soal tetap tersimpan.`))return;
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
          <ValidatedForm
            key={JSON.stringify(data.period)}
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
          </ValidatedForm>
        </details>
      )}
      {exam && loadedExam===examId && (
        <section className="panel stack">
          <h2 tabIndex={-1} id="authoring-bank-title">Bank soal — {exam.title}</h2>
          {locked&&<FeedbackMessage tone="info" className="notice" role="status">{locked} Pratinjau dan riwayat tetap tersedia.</FeedbackMessage>}
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
                    disabled={blocked || !!locked || !c.enabled || (c.max_questions>0 && data.questions.filter(q=>q.type===c.type).length>=c.max_questions)}
                    onClick={() => editQuestion(null, c.type)}
                  >
                    Tambah {c.type}
                  </Button>
                </div>
              ))}
          </div>
          {data.canManage && (
            <ValidatedForm
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
            </ValidatedForm>
          )}
          <ListFilters label="soal ujian" active={[questionSearch&&"Pencarian"].filter(Boolean) as string[]} onReset={()=>{setQuestionSearch("");setPage(1);}} total={shown.length} loading={loading}><SearchField label="Cari isi soal" value={questionSearch} maxLength={150} onChange={value=>{setQuestionSearch(value);setPage(1);}} /></ListFilters>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel ujian dan soal; geser untuk melihat kolom lain">
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
                {shown.slice((currentPage - 1) * 20, currentPage * 20).map((q) => (
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
                      <Button variant="outline" onClick={() => locked?setHistory(q.payload):editQuestion(q)}>
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
            <Button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
              Sebelumnya
            </Button>
            <span>
              Halaman {currentPage} · {shown.length} soal
            </span>
            <Button
              disabled={currentPage * 20 >= shown.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya
            </Button>
          </div>
          {!locked && selectedQuestions.length > 0 && (
            <>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if(!window.confirm(`Arsipkan ${selectedQuestions.length} soal terpilih? Versi soal tetap tersimpan.`))return;
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
                            (x: { block: number; error?: string }) =>
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
            <fieldset className="authoring-controls" disabled={!!locked}>
            <div className="stack">
              <HelpDisclosure><p>
                Maksimal 500 soal / 5 MB. Excel: kolom A berisi JSON soal, baris
                pertama judul. Google Forms: unggah ekspor JSON Forms API atau
                berkas Excel yang dinormalisasi.
              </p></HelpDisclosure>
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
                    setImportRequestId(crypto.randomUUID());
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
                      request_id: importRequestId,
                      items: preview
                        .filter((p) => p.question)
                        .map((p) => p.question),
                    });
                    setPreview([]);setImportRequestId('');
                    await load();
                    setMessage(
                      `Tersimpan: ${r.saved}; dilewati: ${r.skipped}. ` +
                        (r.details || [])
                          .filter((x: { saved: boolean }) => !x.saved)
                          .map(
                            (x: { block: number; error?: string }) =>
                              `Blok ${x.block}: ${x.error}`,
                          )
                          .join("; "),
                    );
                  })
                }
              >
                Impor blok valid
              </Button>
            </div></fieldset>
          </details>
        </section>
      )}
      </fieldset>
      <Dialog
        className="authoring-dialog"
        open={examOpen}
        onOpenChange={open=>{if(!operation.current)setExamOpen(open);}}
        title={editing ? "Ubah ujian" : "Tambah ujian"}
        description="Atur jadwal dan aturan ujian. Waktu mengikuti zona waktu perangkat."
      >
        <ValidatedForm onSubmit={saveExam} className="stack"><fieldset className="authoring-controls stack" disabled={blocked}>
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
              {data.subjects.filter(s=>s.active!==false||s.id===editing?.subject_id).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Kelas peserta (pilih satu atau lebih)</legend>
            {data.classes.filter(c=>c.active!==false||classIds.includes(c.id)).map((c) => (
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
          <FeedbackMessage tone="info" role="status">{message || readError}</FeedbackMessage></fieldset>
          {(uncertain||readError)&&<Button type="button" disabled={busy||loading} onClick={()=>void load()}>Muat ulang data</Button>}
        </ValidatedForm>
      </Dialog>
      <Dialog
        className="authoring-dialog"
        open={questionOpen}
        onOpenChange={open=>{if(!operation.current)setQuestionOpen(open);}}
        title={editingQ ? "Ubah soal" : "Tambah soal"}
        description="Susun pertanyaan, pilihan jawaban, dan penilaian. Kunci serta rubrik hanya terlihat oleh staf berizin."
      >
        <ValidatedForm onSubmit={saveQuestion} className="stack"><fieldset className="authoring-controls stack" disabled={blocked || !!locked}>
          <label>
            Tipe
            <select
              value={draft.type}
              disabled={blocked}
              onChange={(e) => {
                const original=editingQ;
                editQuestion(null,e.target.value as Kind);
                setEditingQ(original);
                setDraft(next=>({...next,stem:draft.stem,explanation:draft.explanation,attachments:draft.attachments,points:draft.points,required:draft.required,direction:draft.direction}));
              }}
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
          <QuestionEditor value={draft.stem} direction={draft.direction} disabled={busy}
            onChange={(stem) => setDraft((current) => ({ ...current, stem }))} />
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
          <QuestionMedia disabled={busy} onUpload={(file) => void run(async () => {
            if (draft.attachments.length >= 10) throw Error("Maksimal 10 lampiran.");
            const controller = new AbortController();
            controllers.current.add(controller);
            try {
              const { id } = await uploadQuestionMedia(file, controller.signal);
              if (mounted.current) {
                setDraft((current) => ({ ...current, attachments: [...current.attachments, id] }));
                setMessage("Lampiran ditambahkan ke draf soal.");
              }
            } finally {
              controllers.current.delete(controller);
            }
          })} />
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
          <FeedbackMessage tone="error" role="alert">{questionError || message || readError || locked}</FeedbackMessage>
          <QuestionPreview question={draft} /></fieldset>
          {(uncertain||readError)&&<Button type="button" disabled={busy||loading} onClick={()=>void load()}>Muat ulang data</Button>}
        </ValidatedForm>
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
