"use client";
import { MoreActions } from "../ui/more-actions";
import {FeedbackMessage} from "../feedback/state";
import {ValidatedForm} from "../feedback/validated-form";
import {ListFilters, SearchField} from "../ui/list-filters";
import { useEffect, useCallback, useRef, useState, type FormEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import {z} from "zod";
import {clientRequest,ClientRequestError} from "../../lib/client/request";
import {resultListSchema,resultDetailSchema,resultMastersSchema,resultSettingsSchema,resultProvidersSchema,reportJobsSchema,resultAnalysisSchema,resultReceipt,loadResultBatch,gradeValue,revisionReason,resultAnswer,canSuggest} from "../../lib/results/contracts";
import {reportSettingsSchema} from "../../lib/reports/schema";
import type { ResultDetail, ResultRow } from "../../lib/results/types";
import {AnalysisView} from "./analysis-view";
import type { analyze } from "../../lib/results/analytics";
import { reportKinds, reportLabels } from "../../lib/reports/schema";
import type { ReportSettings } from "../../lib/reports/render";
const resultStatus: Record<string,string> = {not_started:"Belum mulai",in_progress:"Berlangsung",submitted:"Dikumpulkan",graded:"Dinilai",time_expired:"Waktu habis",disqualified:"Diskualifikasi",reset:"Diatur ulang"};
const exportStatus: Record<string,string> = {queued:"Menunggu",running:"Diproses",ready:"Siap diunduh",failed:"Gagal",cancelled:"Dibatalkan"};
const Preview = dynamic(
  () => import("../authoring/preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
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
    [listError,setListError] = useState(""),
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
    [kind, setKind] = useState<(typeof reportKinds)[number]>(()=>analyticsFirst?"analytics":"recap"),
    [format, setFormat] = useState("pdf"),
    [settings, setSettings] = useState<
      (ReportSettings & { can_manage: boolean }) | null
    >(null),
    [settingsOpen, setSettingsOpen] = useState(false),
    [recalcOpen, setRecalcOpen] = useState(false),
    [reason, setReason] = useState(""),
    [aiEdit, setAiEdit] = useState<Record<string, string>>({});
  const [chosenAI,setChosenAI]=useState("");
  const [availableAI,setAvailableAI]=useState<{provider:string;model:string}[]>([]);
  const [aiVersion,setAiVersion]=useState(0),[gradeReason,setGradeReason]=useState('');
  const sequence = useRef(0), mounted=useRef(true), operation=useRef(false), readController=useRef<AbortController|null>(null), controllers=useRef(new Set<AbortController>()), jobsSequence=useRef(0), jobsFlight=useRef<Promise<boolean>|null>(null), supportSequence=useRef(0);
  const [uncertain,setUncertain]=useState(false),[supportError,setSupportError]=useState(''),[jobsError,setJobsError]=useState(''),[aiError,setAiError]=useState(''),[aiLoading,setAiLoading]=useState(false),[detailStale,setDetailStale]=useState(false);
  const [settingsDraft,setSettingsDraft]=useState<typeof settings>(null);
  async function request<T=unknown>(url:string,input?:object,schema:z.ZodType<T>=resultReceipt(url,input) as z.ZodType<T>){
    if(!mounted.current)throw Error("Permintaan dibatalkan.");
    if(input&&url==="/api/results")setAnalysis(null);
    const c=new AbortController();controllers.current.add(c);
    try{const result=await clientRequest(url,input,schema,c,{mutation:!!input&&!(url==='/api/reports'&&'action' in input&&input.action==='analysis')});if(!mounted.current)throw Error('Permintaan dibatalkan.');return result;}
    catch(e){if(mounted.current&&e instanceof ClientRequestError&&e.uncertain)setUncertain(true);throw e;}
    finally{controllers.current.delete(c);}
  }
  useEffect(()=>{mounted.current=true;const active=controllers.current;return()=>{mounted.current=false;readController.current?.abort();active.forEach(c=>c.abort());};},[]);

  const ids = Object.keys(selected);
  const selectionKey=ids.map(id=>id+':'+selected[id].revision).sort().join('|');
  const [analysisBasis,setAnalysisBasis]=useState(''),[analysisNames,setAnalysisNames]=useState<Record<string,string>>({}),[analysisError,setAnalysisError]=useState('');
  useEffect(()=>{setAnalysis(null);setAnalysisError('');},[selectionKey]);
  const invalidateRequests=useCallback(()=>{sequence.current++;readController.current?.abort();},[]);
  const load = useCallback(async () => {
    if(!mounted.current)return false;
    const seq = ++sequence.current;
    readController.current?.abort();const c=new AbortController();readController.current=c;
    setLoading(true);setListError("");
    try {
      const q = new URLSearchParams({
        page: String(page),
        search:search.trim(),
        state,
        sort,
      });
      if (classId) q.set("class", classId);
      if (subjectId) q.set("subject", subjectId);
      if (examId) q.set("exam", examId);
      const d = await clientRequest("/api/results?" + q,undefined,resultListSchema,c);
      if(!mounted.current||seq!==sequence.current)return false;
      const last=Math.max(1,Math.ceil(d.total/25));if(page>last){setRows([]);setTotal(d.total);setPage(last);return false;}
      if (seq === sequence.current) {
        setRows(d.rows);
        setTotal(d.total);
        setCanPublish(d.can_publish);
        return true;
      }
    } catch (e) {
      if(mounted.current&&seq===sequence.current){setListError(e instanceof Error ? e.message : "Hasil belum dapat dimuat.");}
    } finally {
      if (mounted.current&&seq === sequence.current) setLoading(false);
    }
    return false;
  }, [page, search, state, sort, classId, subjectId, examId]);
  useEffect(() => {
    setLoading(true);const timer=setTimeout(()=>void load(),250);
    return()=>{clearTimeout(timer);invalidateRequests();};
  }, [load,invalidateRequests]);
  useEffect(()=>{setSelected({});setAnalysis(null);},[search,state,classId,subjectId,examId]);
  async function loadSupport(){
    if(!mounted.current)return false;
    const seq=++supportSequence.current;setSupportError('');
    const result=await Promise.allSettled([
      request('/api/admin/master',undefined,resultMastersSchema).then(d=>{if(seq===supportSequence.current)setMasters(d);}),
      request('/api/reports?settings=1',undefined,resultSettingsSchema).then(d=>{if(seq===supportSequence.current)setSettings(d);}),
    ]);
    const ok=result.every(r=>r.status==='fulfilled');if(mounted.current&&seq===supportSequence.current)setSupportError(ok?'':'Sebagian filter atau kop belum dapat dimuat. Coba muat data pendukung.');return ok;
  }
  async function loadJobs(){
    if(!mounted.current)return false;
    if(jobsFlight.current)return jobsFlight.current;
    const seq=++jobsSequence.current;
    const work=(async()=>{try{const result=await request('/api/reports',undefined,reportJobsSchema);if(mounted.current&&seq===jobsSequence.current){setJobs(result);setJobsError('');}return true;}catch(e){if(mounted.current&&seq===jobsSequence.current)setJobsError(e instanceof Error?e.message:'Status ekspor belum tersedia.');return false;}})();
    jobsFlight.current=work;
    try{return await work;}finally{if(jobsFlight.current===work)jobsFlight.current=null;}
  }
  useEffect(()=>{jobsFlight.current=null;void loadSupport();void loadJobs();
    // Initial independent dependencies have their own failure/retry state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    if(!jobs.some(j=>j.status==='queued'||j.status==='running'))return;
    const timer=setInterval(()=>void loadJobs(),4000);return()=>clearInterval(timer);
    // Single-flight polling keeps the last known status on failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[jobs]);
  async function run(fn:()=>Promise<void>){
    if(operation.current||uncertain)return;
    operation.current=true;setBusy(true);setMessage('');
    try{await fn();}catch(e){if(mounted.current){setMessage(e instanceof z.ZodError?e.issues.map(i=>i.message).join('; '):e instanceof Error?e.message:'Permintaan gagal.');if(e instanceof ClientRequestError&&e.status===409)setDetailStale(true);}}
    finally{operation.current=false;if(mounted.current)setBusy(false);}
  }
  async function openDetail(id:string){
    try{
      const d=await request('/api/results?attempt='+id,undefined,resultDetailSchema);
      setDetail(d);setDetailStale(false);setPoints({});setComments({});setAiEdit({});setGradeReason('');
    }catch(e){if(mounted.current)setDetailStale(true);throw e;}
  }
  const detailId=detail?.attempt.id;
  useEffect(()=>{
    if(!detailId)return;
    let live=true;const c=new AbortController();setAvailableAI([]);setChosenAI('');setAiLoading(true);setAiError('');
    void clientRequest('/api/grading/ai',undefined,resultProvidersSchema,c).then(ai=>{if(live){setAvailableAI(ai);setChosenAI(ai[0]?.provider||'');}}).catch(()=>{if(live)setAiError('Penyedia AI belum dapat dimuat. Koreksi manual tetap tersedia.');}).finally(()=>{if(live)setAiLoading(false);});
    return()=>{live=false;c.abort();};
  },[detailId,aiVersion]);
  async function recover(){
    if(operation.current)return;operation.current=true;setBusy(true);
    try{const ok=await load();if(detail)await openDetail(detail.attempt.id);const jobsOk=await loadJobs();const supportOk=await loadSupport();if(ok&&jobsOk&&supportOk){setUncertain(false);setDetailStale(false);setBatchOpen(false);setRecalcOpen(false);setSettingsOpen(false);setSelected({});setAnalysis(null);setMessage('Data diperbarui. Periksa hasil sebelum mencoba kembali.');}}
    catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Pemulihan belum selesai.');}
    finally{operation.current=false;if(mounted.current)setBusy(false);}
  }
  const selectionBlocked=busy||loading||!!listError||uncertain||detailStale;
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
          points: gradeValue(points[q.id] ?? String(q.earned),q.payload.points),
          comment: comments[q.id] ?? q.comment ?? "",
          ...(q.earned!==null?{reason:revisionReason(gradeReason||comments[q.id]||q.comment||"")} : {}),
        }));
      if(detailStale)throw Error("Muat ulang detail sebelum menyimpan.");
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
    if(!chosenAI||!items.length)throw Error('Pilih penyedia aktif dan esai yang dapat diproses.');
    await request('/api/grading/ai',{request_id:crypto.randomUUID(),provider:chosenAI,items:items.slice(0,5)});
    if(detail)await openDetail(detail.attempt.id);
    setMessage('Permintaan AI selesai. Periksa riwayat; saran tetap memerlukan persetujuan guru.');
  }
  async function publishResults(published:boolean){
    const exams=[...new Set(Object.values(selected).map(r=>r.exam_id))];
    if(!window.confirm(`${published?'Terbitkan':'Tutup publikasi'} nilai SELURUH peserta pada ${exams.length} ujian terpilih, termasuk peserta yang tidak dicentang?`))return;
    let done=0;
    try{for(const exam_id of exams){if(!mounted.current)return;await request('/api/results',{action:'publish',request_id:crypto.randomUUID(),exam_id,published});done++;}}
    catch(e){if(!mounted.current)return;setSelected({});await load();throw Error(`${done} dari ${exams.length} ujian terkonfirmasi diperbarui. Sisa operasi dihentikan. ${e instanceof Error?e.message:'Periksa hasil sebelum mencoba lagi.'}`);}
    setSelected({});await load();setMessage(`${done} ujian ${published?'diterbitkan':'ditutup publikasinya'}. Publikasi berlaku untuk seluruh peserta; kunci dan esai pending tetap dilindungi server.`);
  }
  async function analyzeSelected(){
    await run(async()=>{
      const basis=selectionKey;
      const names=Object.fromEntries(Object.values(selected).map(r=>[r.exam_id,r.title]));
      setAnalysis(null);setAnalysisError('');
      try{const result=await request('/api/reports',{action:'analysis',ids:[...ids]},resultAnalysisSchema);setAnalysis(result);setAnalysisBasis(basis);setAnalysisNames(names);}
      catch(e){if(mounted.current)setAnalysisError(e instanceof Error?e.message:'Analisis belum dapat dimuat.');}
    });
  }
  const analysisAction=<Button className="analysis-action" disabled={selectionBlocked||!ids.length} onClick={()=>void analyzeSelected()}>Analisis terpilih</Button>;
  const examOptions = Array.from(
    new Map(
      [...Object.values(selected), ...rows].map((r) => [r.exam_id, r.title]),
    ).entries(),
  );
  if(examId&&!examOptions.some(([id])=>id===examId))examOptions.push([examId,"Ujian terpilih"]);
  return (
    <div className={`stack results-page${analyticsFirst?" analytics-page":""}`} aria-busy={busy||loading}>
      <div className="actions"><Button asChild variant="outline"><Link href="/dashboard/grading">Koreksi anonim, rubrik & moderasi</Link></Button></div>
      <FeedbackMessage tone="info" role="status" aria-live="polite">
        {message}
      </FeedbackMessage>
      {(uncertain||detailStale)&&<div role="alert" className="notice"><p>{uncertain?"Hasil perubahan belum dapat dipastikan. Periksa ulang data sebelum melanjutkan.":"Detail atau revisi belum dapat dimuat. Periksa ulang data sebelum melanjutkan."}</p><Button disabled={busy||loading} onClick={()=>void recover()}>Periksa ulang data</Button></div>}
      {supportError&&<div className="notice" role="status"><p>{supportError}</p><Button disabled={busy} onClick={()=>void loadSupport()}>Muat data pendukung</Button></div>}
      <fieldset className="results-controls stack" disabled={busy||uncertain||detailStale}>
      <section className="panel stack">
        <ListFilters label="hasil ujian" active={[search&&"Pencarian",classId&&"Kelas",subjectId&&"Mapel",examId&&"Ujian",state!=="all"&&"Status",sort!=="name"&&"Urutan"].filter(Boolean) as string[]} onReset={()=>{setSearch("");setClassId("");setSubjectId("");setExamId("");setState("all");setSort("name");setPage(1);}} total={total} loading={loading} error={listError}>
          <SearchField label="Cari siswa/username" value={search} maxLength={150} onChange={value=>{setSearch(value);setPage(1);}} />
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
            <select value={sort} onChange={(e) => {setSort(e.target.value);setPage(1);}}>
              <option value="name">Nama A–Z</option>
              <option value="score_asc">Nilai terendah</option>
              <option value="score_desc">Nilai tertinggi</option>
            </select>
          </label>
        </ListFilters>
        <div className="actions">
          <Button
            variant="outline"
            disabled={selectionBlocked||!rows.length||ids.length>=500}
            onClick={() =>
              setSelected((s) => ({
                ...s,
                ...Object.fromEntries(rows.filter(r=>!s[r.id]).slice(0,500-Object.keys(s).length).map((r) => [r.id, r])),
              }))
            }
          >
            Pilih halaman ini
          </Button>
          <MoreActions label="Opsi daftar">
            <Button variant="outline" onClick={() => void load()}>
              Muat ulang
            </Button>
            <Button variant="outline" onClick={() => setSelected({})}>
              Bersihkan pilihan ({ids.length})
            </Button>
          </MoreActions>
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
              {(loading||listError?[]:rows).map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={"Pilih hasil " + r.student}
                      disabled={selectionBlocked||(!selected[r.id]&&ids.length>=500)}
                      checked={!!selected[r.id]}
                      onChange={() =>
                        setSelected((s) => {
                          const n = { ...s };
                          if (n[r.id]) delete n[r.id];
                          else if(Object.keys(n).length<500)n[r.id] = r;
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
                    {resultStatus[r.status] ?? r.status}
                    {r.pending > 0 && <p>{r.pending} esai belum dikoreksi</p>}
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
        {!loading && !listError && !rows.length && (
          <p>Belum ada hasil sesuai filter dan cakupan akses.</p>
        )}
        <div className="actions">
          <Button disabled={page === 1||loading||!!listError} onClick={() => setPage(page - 1)}>
            Sebelumnya
          </Button>
          <span>
            Halaman {page} · {total} hasil
          </span>
          <Button
            disabled={page * 25 >= total||loading||!!listError}
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
          Terpilih {ids.length} / 500 hasil. Pilihan dipertahankan antar halaman dan dibersihkan saat filter berubah.
          Ekspor menggunakan revisi nilai saat laporan dibuat.
        </p>
        <div className="actions">
          {analyticsFirst&&analysisAction}
          <Button
            disabled={selectionBlocked || !ids.length}
            onClick={() =>
              void run(async () => {
                const data=await loadResultBatch(ids,id=>request("/api/results?attempt="+id,undefined,resultDetailSchema),()=>mounted.current);
                setBatch(data);
                setBatchQuestion("");
                setBatchPoints({});
                setBatchOpen(true);
              })
            }
          >
            Koreksi per soal lintas peserta
          </Button>
          {!analyticsFirst&&analysisAction}
          <MoreActions label="Opsi nilai">
            <Button
              variant="outline"
              disabled={selectionBlocked || !ids.length}
              onClick={() => {setReason("");setMessage("");setRecalcOpen(true);}}
            >
              Rekalkulasi berizin
            </Button>
            {canPublish && (
              <>
                <Button
                  variant="outline"
                  disabled={selectionBlocked || !ids.length}
                  onClick={() =>
                    void run(()=>publishResults(true))
                  }
                >
                  Terbitkan nilai ujian terpilih
                </Button>
                <Button
                  variant="outline"
                  disabled={selectionBlocked || !ids.length}
                  onClick={() =>
                    void run(()=>publishResults(false))
                  }
                >
                  Tutup publikasi
                </Button>
              </>
            )}
          </MoreActions>
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
            disabled={selectionBlocked || !ids.length}
            onClick={() =>
              void run(async () => {
                await request("/api/reports", {
                  action: "create",
                  request_id: crypto.randomUUID(),
                  ids,
                  kind,
                  format,
                });
                await loadJobs();
                setMessage(
                  "Proses ekspor dibuat. Unduh setelah progres 100%. PDF dapat dicetak dari pembaca PDF.",
                );
              })
            }
          >
            Buat laporan / cetak massal
          </Button>
          {settings?.can_manage && (
            <Button variant="outline" onClick={() => {setSettingsDraft(settings?{...settings}:null);setSettingsOpen(true);setMessage("");}}>
              Atur kop / logo / pejabat
            </Button>
          )}
        </div>
      </section>
      {analysisError&&<div className="notice" role="alert"><p>{analysisError}</p><Button disabled={selectionBlocked||!ids.length} onClick={()=>void analyzeSelected()}>Coba analisis kembali</Button></div>}
      {analysis&&analysisBasis===selectionKey&&<AnalysisView analysis={analysis} exams={analysisNames}/>}
      <section className="panel stack">
        <h2>Proses ekspor</h2>
        <Button
          variant="outline"
          onClick={() =>
            void loadJobs()
          }
        >
          Muat status ekspor
        </Button>
        {jobsError&&<FeedbackMessage tone="error" role="alert">{jobsError} Status terakhir tetap ditampilkan.</FeedbackMessage>}
        {!jobsError&&!jobs.length && <p>Belum ada proses ekspor.</p>}
        {jobs.map((j) => (
          <div key={j.id}>
            <b>
              {j.kind} / {j.format}
            </b>
            <p>
              {exportStatus[j.status] ?? j.status} · {j.progress}%{j.error ? " — " + j.error : ""}
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
                    await loadJobs();
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
      </fieldset>
      <Dialog
        className="results-dialog"
        open={!!detail}
        onOpenChange={open=>{if(!open&&!operation.current)setDetail(null);}}
        title="Detail hasil dan koreksi"
        description="Periksa jawaban dan masukkan nilai. Biarkan kolom kosong jika belum dikoreksi."
      >
        {detail && (
          <ValidatedForm className="stack" onSubmit={saveGrades}>
            {(uncertain||detailStale)&&<div className="notice" role="alert"><p>Muat ulang detail dan periksa revisi sebelum melanjutkan.</p><Button type="button" disabled={busy||loading} onClick={()=>void recover()}>Periksa ulang data</Button></div>}
            <fieldset className="results-controls stack" disabled={busy||uncertain||detailStale}>
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
            {aiLoading&&<FeedbackMessage tone="loading" role="status">Memuat penyedia AI… Koreksi manual tetap tersedia.</FeedbackMessage>}{aiError&&<div role="status"><p>{aiError}</p><Button type="button" variant="outline" disabled={aiLoading} onClick={()=>setAiVersion(v=>v+1)}>Muat penyedia AI</Button></div>}
            <label>Penyedia AI<select disabled={aiLoading||!availableAI.length} value={chosenAI} onChange={e=>setChosenAI(e.target.value)}><option value="">Pilih penyedia aktif</option>{availableAI.map(p=><option key={p.provider} value={p.provider}>{p.provider} · {p.model}</option>)}</select></label>
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
                  {resultAnswer(q.answer)}
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
                          disabled={!!q.payload.rubricCriteria?.length}
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
                        disabled={busy||aiLoading||!chosenAI||!canSuggest(q,detail.attempt.status)}
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
                        Minta saran AI
                      </Button>
                    </>
                  )}
              </section>
            ))}
            <label>Alasan revisi nilai (5–1000 karakter bila mengubah nilai yang sudah disetujui)<textarea value={gradeReason} maxLength={1000} onChange={e=>setGradeReason(e.target.value)}/></label>
            <Button disabled={busy || detail.attempt.status === "disqualified"}>
              Simpan persetujuan koreksi
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy||aiLoading||!chosenAI||detail.attempt.status==="disqualified"||!detail.questions.some(q=>canSuggest(q,detail.attempt.status))}
              onClick={() =>
                void run(() =>
                  suggest(
                    detail.questions
                      .filter((q) => canSuggest(q,detail.attempt.status))
                      .slice(0, 5)
                      .map((q) => ({
                        attempt_id: detail.attempt.id,
                        question_id: q.id,
                      })),
                  ),
                )
              }
            >
              Saran AI batch (maksimal 5)
            </Button>
            <h3>Riwayat saran AI</h3>
            {detail.suggestions.map((s) => (
              <div key={s.id}>
                <p>
                  {s.provider} / {s.model} / {s.prompt_version} · {s.status} ·{" "}
                  {s.points === null ? "Tidak ada nilai" : s.points}
                </p>
                <p>{s.reason}</p>
                {s.status === "pending" && s.points!==null && s.basis_revision===detail.attempt.revision && detail.attempt.status!=="disqualified" && detail.questions.some(q=>q.id===s.question_id&&q.payload.type==="Esai"&&!q.payload.rubricCriteria?.length) && (
                  <>
                    <label>
                      Ubah nilai saran
                      <input
                        type="number"
                        min={0}
                        max={detail.questions.find(q=>q.id===s.question_id)?.payload.points}
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
                                        points: gradeValue(aiEdit[s.id] ?? String(s.points??""),detail.questions.find(q=>q.id===s.question_id)?.payload.points??0),
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
            <FeedbackMessage tone="info" role="status">{message}</FeedbackMessage></fieldset>
          </ValidatedForm>
        )}
      </Dialog>
      <Dialog
        className="results-dialog"
        open={batchOpen}
        onOpenChange={open=>{if(!operation.current)setBatchOpen(open);}}
        title="Koreksi per soal"
        description="Periksa nilai setiap peserta. Semua perubahan disimpan bersamaan."
      >
        <ValidatedForm
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const grades = batch
                .filter(
                  (d) =>
                    d.attempt.status!=="disqualified" && d.questions.some((q) => q.id+":"+q.version === batchQuestion && !q.payload.rubricCriteria?.length) &&
                    batchPoints[d.attempt.id] !== undefined &&
                    batchPoints[d.attempt.id] !== "",
                )
                .map((d) => ({
                  attempt_id: d.attempt.id,
                  question_id: batchQuestion.split(":")[0],
                  expected_revision: d.attempt.revision,
                  points: gradeValue(batchPoints[d.attempt.id],d.questions.find(q=>q.id+":"+q.version===batchQuestion)!.payload.points),
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
          <fieldset className="results-controls stack" disabled={busy||uncertain||detailStale}>
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
                  batch.filter(d=>d.attempt.status!=="disqualified").flatMap((d) =>
                    d.questions
                      .filter((q) => q.payload.type === "Esai" && !q.payload.rubricCriteria?.length)
                      .map((q) => [q.id+":"+q.version, q] as const),
                  ),
                ).values(),
              ).map((q) => (
                <option key={q.id+":"+q.version} value={q.id+":"+q.version}>
                  {q.payload.stem.replace(/<[^>]*>/g, "").slice(0, 80)} · v
                  {q.version}
                </option>
              ))}
            </select>
          </label>
          {batch
            .filter((d) => d.attempt.status!=="disqualified"&&d.questions.some((q) => q.id+":"+q.version === batchQuestion&&!q.payload.rubricCriteria?.length))
            .map((d) => {
              const q = d.questions.find((q) => q.id+":"+q.version === batchQuestion)!;
              return (
                <section className="question-preview" key={d.attempt.id}>
                  <b>{d.attempt.student}</b>
                  <pre className="answer-text">
                    {resultAnswer(q.answer)}
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
          <FeedbackMessage tone="info" role="status">{message}</FeedbackMessage></fieldset>
          {(uncertain||detailStale)&&<Button type="button" disabled={busy} onClick={()=>void recover()}>Periksa ulang data</Button>}
        </ValidatedForm>
      </Dialog>
      <Dialog
        className="results-dialog"
        open={recalcOpen}
        onOpenChange={open=>{if(!operation.current)setRecalcOpen(open);}}
        title="Rekalkulasi hasil"
        description="Hitung ulang hasil dengan soal dan kunci saat peserta mengerjakan ujian. Perubahan kunci terbaru tidak diterapkan."
      >
        <ValidatedForm
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
          <fieldset className="results-controls stack" disabled={busy||uncertain||detailStale}>
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
          <FeedbackMessage tone="info" role="status">{message}</FeedbackMessage></fieldset>
          {(uncertain||detailStale)&&<Button type="button" disabled={busy} onClick={()=>void recover()}>Periksa ulang data</Button>}
        </ValidatedForm>
      </Dialog>
      <Dialog
        className="results-dialog"
        open={settingsOpen}
        onOpenChange={open=>{if(!operation.current)setSettingsOpen(open);}}
        title="Kop laporan"
        description="Gunakan logo madrasah dari Media soal. Nama pejabat dicetak sebagai identitas, bukan tanda tangan digital."
      >
        {settingsDraft && (
          <ValidatedForm
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const valid=reportSettingsSchema.parse({
                  action:"settings",school:settingsDraft.school,address:settingsDraft.address,official:settingsDraft.official,official_title:settingsDraft.official_title,logo_media_id:settingsDraft.logo_media_id||null,
                });
                await request("/api/reports", valid);
                setSettings(resultSettingsSchema.parse({...valid,can_manage:settingsDraft.can_manage}));
                setSettingsOpen(false);
                setMessage(
                  "Kop disimpan. Job lama tetap menggunakan kop saat dibuat.",
                );
              });
            }}
          >
            <fieldset className="results-controls stack" disabled={busy||uncertain||detailStale}>
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
                  value={settingsDraft[k] || ""}
                  required={k === "school"}
                  onChange={(e) =>
                    setSettingsDraft((s) => (s ? { ...s, [k]: e.target.value } : s))
                  }
                />
              </label>
            ))}
            <Button disabled={busy}>Simpan kop</Button>
            <FeedbackMessage tone="info" role="status">{message}</FeedbackMessage></fieldset>
            {(uncertain||detailStale)&&<Button type="button" disabled={busy} onClick={()=>void recover()}>Periksa ulang data</Button>}
          </ValidatedForm>
        )}
      </Dialog>
    </div>
  );
}
function AnswerImage({id}:{id:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let live=true;const c=new AbortController();setUrl('');setError('');
  void clientRequest('/api/results/media?id='+encodeURIComponent(id)+'&kind=canvas',undefined,z.object({url:z.url()}),c).then(d=>{if(live)setUrl(d.url);}).catch(()=>{if(live)setError('Canvas belum dapat dimuat. Periksa koneksi dan izin lampiran.');});
  return()=>{live=false;c.abort();};
 },[id,version]);
 if(error)return <div className="notice"><FeedbackMessage tone="info" role="status">{error}</FeedbackMessage><Button type="button" variant="outline" onClick={()=>setVersion(v=>v+1)}>Coba muat canvas</Button></div>;
 return url?<Image src={url} alt="Canvas jawaban peserta" width={1200} height={800} unoptimized style={{width:'100%',height:'auto'}} onError={()=>setError('Canvas belum dapat ditampilkan.')}/>:<FeedbackMessage tone="loading" role="status">Memuat canvas…</FeedbackMessage>;
}
