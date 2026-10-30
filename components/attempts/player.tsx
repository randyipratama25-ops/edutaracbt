"use client";
import { StudentHelp } from "../workflow/help";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bookmark, CheckCircle2, ChevronDown, ListOrdered, Type, Wifi, WifiOff, ClipboardList } from "lucide-react";
import { completion, progressSummary, questionTypeLabels } from "../../lib/attempts/presentation";
import { QuestionNavigation } from "./question-navigation";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { LogoutButton } from "../auth/logout-button";
import { sameAnswer, deviceDrafts, receiptOf, secondsRemaining, type AnswerValue } from "../../lib/attempts/recovery";
import { AttemptError } from "./queue";
import { essayLength } from "../../lib/attempts/essay";
import type { Question } from "../../lib/authoring/schema";
import { command, useAnswerQueue, type Saved } from "./queue";
import { useIntegrity } from "./integrity";
const Preview = dynamic(
  () => import("../authoring/preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
const Canvas = dynamic(() => import("./canvas").then((m) => m.EssayCanvas), {
  ssr: false,
});
type Exam = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: string;
  attempt: { id: string; status: string; finalized_at: string | null } | null;
};
type Item = {
  id: string;
  version: number;
  position: number;
  payload: Omit<Question, "key" | "rubric" | "explanation" | "keywords"> & {
    choices?: string[];
  };
};
export type Attempt = {
  id: string;
  exam_id: string;
  title: string;
  status: string;
  deadline_at: string;
  server_now: string;
  epoch: number;
  finalized_at: string | null;
  questions: Item[];
  answers: Saved[];
  grading_pending: number;
  score: number | null;
  result_visible: boolean;
  review_reason: string | null;
  recovery?: { drafts: { question_id: string; value: AnswerValue; revision: number; updated_at: string; client_id: string; epoch: number }[];
    canvases: { id: string; question_id: string; created_at: string }[] } | null;
};
function terminal(data: unknown): data is Attempt {
  return !!data && typeof data === "object" && "id" in data && "status" in data;
}
export function StudentPortal({ studentId }: { studentId: string }) {
  const [exams, setExams] = useState<Exam[]>([]),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [client, setClient] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [takeover, setTakeover] = useState(""),
    [reloadKey, setReloadKey] = useState(0),
    [listVersion, setListVersion] = useState(0),
    [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    try {
      let id = sessionStorage.getItem("edutara_attempt_client");
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem("edutara_attempt_client", id);
      }
      setClient(id);
    } catch {
      setClient(crypto.randomUUID());
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setListState("loading");
    fetch("/api/attempts", { signal: controller.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error?.message);
        if (!Array.isArray(j.data?.exams)) throw Error("Daftar ujian belum dapat dimuat. Coba lagi.");
        setExams(j.data.exams);
        setMessage("");
        setListState("ready");
      })
      .catch((e) => { if (!controller.signal.aborted) { setMessage(e.message); setListState("error"); } });
    return () => controller.abort();
  }, [listVersion]);
  async function open(input: unknown, id?: string) {
    setBusy(true);
    setMessage("");
    try {
      const data = await command(input);
      if (terminal(data)) {
        setAttempt(data);
        setReloadKey((k) => k + 1);
        setTakeover("");
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "Gagal membuka ujian.";
      setMessage(m);
      if (m.includes("DEVICE_CONFLICT") && id) setTakeover(id);
    } finally {
      setBusy(false);
    }
  }
  if (attempt)
    return (
      <>
        <ExamPlayer
          key={attempt.id + ":" + attempt.epoch + ":" + reloadKey}
          attempt={attempt}
          clientId={client}
          studentId={studentId}
          onUpdate={setAttempt}
          onReload={() =>
            void open(
              { action: "resume", attempt_id: attempt.id, client_id: client },
              attempt.id,
            )
          }
        />
        {takeover && (
          <Button
            onClick={() =>
              void open({
                action: "takeover",
                attempt_id: takeover,
                client_id: client,
              })
            }
          >
            Ambil alih attempt
          </Button>
        )}
      </>
    );
  return (
    <main id="main-content" tabIndex={-1} className="workspace student-shell">
      <header className="student-portal-heading"><div><p className="eyebrow">PORTAL SISWA</p><h1>Ujian saya</h1><p className="muted">Pilih ujian dan gunakan PIN dari pengawas.</p></div><LogoutButton /></header>
      <p role="status">{message}</p>
      {listState === "loading" && <section aria-busy="true" aria-label="Memuat daftar ujian" className="stack"><div className="skeleton skeleton-card" /><p role="status">Memuat ujian…</p></section>}
      {listState === "error" && <section className="empty-state"><h2>Daftar ujian belum dapat dimuat</h2><p>Periksa koneksi, lalu coba kembali.</p><Button variant="outline" onClick={() => setListVersion(v => v+1)}>Coba muat ulang</Button></section>}
      {listState === "ready" && exams.length === 0 && <section className="empty-state"><ClipboardList size={40} aria-hidden="true" /><h2>Belum ada ujian</h2><p>Ujian untuk kelas Anda akan muncul di sini setelah dijadwalkan.</p><Button variant="outline" onClick={() => setListVersion(v => v+1)}>Periksa lagi</Button></section>}
      <div className="student-exam-list">
      {listState === "ready" && exams.map((e) => (
        <section className="panel stack exam-card" key={e.id}>
          <div className="actions"><span className="question-type">{e.attempt?.finalized_at ? "Selesai" : e.attempt ? "Sudah dimulai" : e.status === "active" ? "Berlangsung" : e.status === "closed" ? "Ditutup" : "Terjadwal"}</span><span className="muted">{e.duration_minutes} menit</span></div>
          <h2>{e.title}</h2>
          <p className="muted">
            {new Date(e.starts_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} –{" "}
            {new Date(e.ends_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} · {e.duration_minutes}{" "}
            menit · WIB
          </p>
          {e.attempt ? (
            <Button
              disabled={busy || !client}
              onClick={() =>
                void open(
                  {
                    action: "resume",
                    attempt_id: e.attempt!.id,
                    client_id: client,
                  },
                  e.attempt!.id,
                )
              }
            >
              Lanjutkan / lihat status
            </Button>
          ) : (
            <form
              className="toolbar"
              onSubmit={(ev) => {
                ev.preventDefault();
                const pin = new FormData(ev.currentTarget).get("pin");
                void open({
                  action: "start",
                  exam_id: e.id,
                  client_id: client,
                  pin,
                });
              }}
            >
              <label>
                PIN ujian
                <input
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]{4,12}"
                  required
                  autoComplete="off"
                />
              </label>
              <Button disabled={busy || !client}>Mulai ujian</Button>
            </form>
          )}
        </section>
      ))}
      </div>
      {takeover && (
        <section className="panel">
          <p>
            Attempt sedang ditulis perangkat/tab lain. Mengambil alih akan
            menonaktifkan penulisan pada perangkat tersebut, tanpa menambah
            waktu. Jawaban dan cadangan draf yang sudah mencapai server dapat dipulihkan. Draf offline tetap berada di perangkat asal.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void open({
                action: "takeover",
                attempt_id: takeover,
                client_id: client,
              })
            }
          >
            Gunakan perangkat ini
          </Button>
        </section>
      )}
    </main>
  );
}
export function ExamPlayer({
  attempt: a,
  clientId,
  studentId,
  onUpdate,
  onReload,
}: {
  attempt: Attempt;
  clientId: string;
  studentId: string;
  onUpdate: (data: Attempt) => void;
  onReload: () => void;
}) {
  const writer = useMemo(
    () => ({ attempt_id: a.id, client_id: clientId, epoch: a.epoch }),
    [a.id, clientId, a.epoch],
  );
  const active = a.status === "in_progress" && !a.finalized_at;
  const queue = useAnswerQueue(writer, a.answers, (data) => {
    if (terminal(data)) onUpdate(data);
  }, { ownerId: studentId, enabled: active, finalized: !!a.finalized_at, questionIds: a.questions.map(q => q.id) });
  const warning = useIntegrity(writer, active);
  const [index, setIndex] = useState(0),
    [remaining, setRemaining] = useState(() =>
      Math.max(
        0,
        Math.ceil(
          (Date.parse(a.deadline_at) - Date.parse(a.server_now)) / 1000,
        ),
      ),
    ),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false),
    [reloadConfirm, setReloadConfirm] = useState(false),
    [transferOpen, setTransferOpen] = useState(false),
    [transferring, setTransferring] = useState(false),
    [transferMessage, setTransferMessage] = useState(""),
    [mediaDirty, setMediaDirty] = useState(false),
    [submitting, setSubmitting] = useState(false),
    [submitUncertain, setSubmitUncertain] = useState(false),
    [connected, setConnected] = useState(true),
    [flagged, setFlagged] = useState<string[]>([]),
    [fontSize, setFontSize] = useState(18),
    [headerHeight, setHeaderHeight] = useState(150),
    [preferencesLoaded, setPreferencesLoaded] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [recoveryChoices, setRecoveryChoices] = useState<{ id: string; questionId: string; value: AnswerValue; revision: number; label: string }[]>([]);
  const questionHeading = useRef<HTMLHeadingElement>(null), examHeader = useRef<HTMLElement>(null), previousIndex = useRef(0), mapSelection = useRef(false);
  const focusQuestion = useCallback(() => {
    questionHeading.current?.focus({ preventScroll: true });
    questionHeading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  useEffect(() => {
    const header = examHeader.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeaderHeight(Math.ceil(header.getBoundingClientRect().height)));
    observer.observe(header);
    return () => observer.disconnect();
  }, [active]);
  const started = useRef({
      server: Date.parse(a.server_now),
      local: 0,
    }),
    deadline = useRef(a.deadline_at),
    submittingRef = useRef(false),
    submitUncertainRef = useRef(false),
    submitMode = useRef<"manual" | "timeout">("manual"),
    autoSent = useRef(false),
    submitId = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!active) return;
    started.current = {
      server: Date.parse(a.server_now),
      local: performance.now(),
    };
    const timer = setInterval(() => {
      setRemaining(
        Math.max(
          0,
          secondsRemaining(deadline.current, started.current.server, performance.now() - started.current.local),
        ),
      );
    }, 500);
    return () => clearInterval(timer);
  }, [active, a.deadline_at, a.server_now]);
  useEffect(() => {
    if (!active) return;
    let live = true, checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const data = await command({ action: "resume", attempt_id: a.id, client_id: clientId });
        if (!live) return;
        if (terminal(data)) {
          setConnected(true);
          if (data.status !== "in_progress" || data.finalized_at || data.epoch !== a.epoch) onUpdate(data);
          else {
            deadline.current = data.deadline_at;
            started.current = { server: Date.parse(data.server_now), local: performance.now() };
            setRemaining(secondsRemaining(data.deadline_at, started.current.server, 0));
            // An uncertain submit must be retried with the same payload or resolved by a terminal response.
          }
        }
      } catch (e) {
        if (live) {
          setConnected(false);
          setMessage(e instanceof Error ? e.message : "Status server belum dapat diperiksa.");
        }
      } finally { checking = false; }
    };
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    const offline = () => setConnected(false);
    const heartbeat = setInterval(() => void check(), 15000);
    window.addEventListener("online", check);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      clearInterval(heartbeat);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [active, a.id, a.epoch, clientId, onUpdate]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (mediaDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [mediaDirty]);
  async function submit(mode: "manual" | "timeout") {
    if (submittingRef.current) return;
    if (mode === "manual" && mediaDirty) {
      setMessage(
        "Canvas belum tersimpan. Tunggu unggahan atau coba unggah lagi.",
      );
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setMessage("");
    let sent = false;
    try {
      if (mode === "manual" && !(await queue.flushAll()))
        throw Error(
          "Masih ada jawaban belum diakui server atau konflik. Selesaikan penyimpanan sebelum mengakhiri ujian.",
        );
      if (mode === "timeout") await queue.flushAll();
      if (!submitUncertainRef.current) submitMode.current = mode;
      sent = true;
      const data = await command({
        action: "submit",
        ...writer,
        request_id: submitId.current,
        mode: submitMode.current,
      });
      if (terminal(data) && (data.finalized_at || data.status === "disqualified")) {
        submitUncertainRef.current = false;
        setSubmitUncertain(false);
        onUpdate(data);
      }
      else
        throw Error(
          "Status akhir belum diterima. Coba lagi dengan permintaan yang sama.",
        );
    } catch (e) {
      if (sent && (!(e instanceof AttemptError) || e.status >= 500)) {
        submitUncertainRef.current = true;
        setSubmitUncertain(true);
        setMessage("Pengumpulan belum dapat dipastikan. Jawaban dikunci sementara; periksa status atau coba pengumpulan lagi dengan permintaan yang sama.");
      } else {
        submitUncertainRef.current = false;
        setSubmitUncertain(false);
        submitId.current = crypto.randomUUID();
        setMessage(e instanceof Error ? e.message : "Finalisasi belum berhasil.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setConfirm(false);
    }
  }
  useEffect(() => {
    if (active && remaining === 0 && !autoSent.current) {
      autoSent.current = true;
      void submit("timeout");
    }
  });
  useEffect(() => {
    if (!a.finalized_at) return;
    const prefix = `edutara:canvas:v1:${studentId}:${a.id}:`;
    try {
      for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
    } catch { /* Terminal server status remains available even if device storage is blocked. */ }
  }, [a.finalized_at, a.id, studentId]);
  useEffect(() => {
    if (!active) return;
    const choices: { id: string; questionId: string; value: AnswerValue; revision: number; label: string }[] = [];
    for (const { key, draft } of deviceDrafts(studentId, a.id)) {
      if (key.endsWith(`:${clientId}`) && draft.epoch === a.epoch) continue;
      for (const [id, row] of Object.entries(draft.rows)) {
        if (!a.questions.some(q => q.id === id)) continue;
        const canonical = a.answers.find(answer => answer.question_id === id);
        if (canonical && sameAnswer(canonical.value, row.value)) continue;
        choices.push({ id: `${key}:${id}`, questionId: id, value: row.value, revision: row.revision, label: "Draf perangkat dari tab/sesi sebelumnya" });
      }
    }
    for (const d of a.recovery?.drafts || []) choices.push({ id: `cloud:${d.client_id}:${d.epoch}:${d.question_id}`, questionId: d.question_id, value: d.value, revision: d.revision, label: "Cadangan draf server" });
    setRecoveryChoices(choices);
  }, [active, studentId, a.id, a.epoch, a.questions, a.answers, a.recovery, clientId]);
  useEffect(() => {
    if (!active) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`edutara:player-ui:v1:${studentId}:${a.id}`) || "null");
      if (saved) {
        if ([16,18,20,22].includes(saved.fontSize)) setFontSize(saved.fontSize);
        if (Array.isArray(saved.flagged)) setFlagged(saved.flagged.filter((id: string) => a.questions.some(q => q.id === id)));
        const position = a.questions.findIndex(q => q.id === saved.questionId);
        if (position >= 0) setIndex(position);
      }
    } catch { /* Display preferences never block an exam. */ }
    setPreferencesLoaded(true);
  }, [active, studentId, a.id, a.questions]);
  useEffect(() => {
    if (!preferencesLoaded || !active) return;
    try { localStorage.setItem(`edutara:player-ui:v1:${studentId}:${a.id}`, JSON.stringify({ fontSize, flagged, questionId: a.questions[index]?.id })); } catch { /* Preferences are optional. */ }
  }, [preferencesLoaded, active, studentId, a.id, a.questions, index, fontSize, flagged]);
  useEffect(() => {
    if (previousIndex.current !== index) focusQuestion();
    previousIndex.current = index;
  }, [index, focusQuestion]);
  const summary = progressSummary(a.questions, queue.values, flagged);
  const navigationItems = a.questions.map(q => ({ id: q.id, state: completion(q.payload, queue.values[q.id]), flagged: flagged.includes(q.id) }));
  const receipt = receiptOf(a);
  if (!active)
    return (
      <main id="main-content" tabIndex={-1} className="workspace student-shell">
        <section className="panel stack">
          <h1>{a.title}</h1>
          <p>
            Status: <b>{a.status}</b>
          </p>
          {a.status === "disqualified" && !a.finalized_at ? (
            <>
              <p>
                Attempt dikunci setelah peninjauan. Hubungi pengawas. Deadline
                tetap berjalan.
              </p>
              <p>{a.review_reason}</p>
              <Button onClick={onReload}>Periksa keputusan pengawas</Button>
              <StudentHelp attemptId={a.id} />
            </>
          ) : (
            <>
              <p>Ujian telah berakhir. Status berikut berasal dari server.</p>
              {receipt && <section className="notice" aria-label="Bukti pengumpulan ujian">
                <h2>Bukti pengumpulan</h2>
                <p>Nomor penerimaan: <strong>{receipt.number}</strong></p>
                <p>Waktu finalisasi server: {new Date(receipt.receivedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</p>
                <p>{receipt.status === "time_expired" ? "Difinalisasi karena waktu habis/ujian ditutup." : "Pengumpulan diterima server."}</p>
                <p>Bukti ini mengacu pada jawaban yang diterima server, bukan draf yang belum tersinkron.</p>
                <Button variant="outline" onClick={() => {
                  const blob = new Blob([`EDUTARA CBT — Bukti pengumpulan\nUjian: ${a.title}\nNomor: ${receipt.number}\nFinalisasi server: ${receipt.receivedAt}\nStatus: ${receipt.status}\n`], { type: "text/plain;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a"); link.href = url; link.download = `bukti-ujian-${a.id}.txt`; link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}>Unduh bukti pengumpulan</Button>
              </section>}
              <Button variant="outline" onClick={onReload}>Periksa status terbaru</Button>
              {a.grading_pending > 0 ? (
                <p>
                  Penilaian esai masih menunggu koreksi. Nilai resmi belum
                  tersedia.
                </p>
              ) : a.result_visible ? (
                <p>
                  Nilai resmi: <b>{a.score}</b>
                </p>
              ) : (
                <p>Hasil belum dipublikasikan.</p>
              )}
            </>
          )}
          <LogoutButton />
        </section>
      </main>
    );
  const item = a.questions[index];
  if (!item) return <p>Snapshot soal tidak tersedia. Hubungi pengawas.</p>;
  const q = item.payload;
  const answer =
    queue.values[item.id] || (["PG", "PG_KOMPLEKS"].includes(q.type) ? [] : {});
  const record = Array.isArray(answer) ? {} : answer;
  const picks = Array.isArray(answer) ? answer : [];
  const disabled =
    remaining === 0 ||
    submitting ||
    transferring ||
    submitUncertain ||
    queue.status.includes("DEVICE_CONFLICT") ||
    message.includes("DEVICE_CONFLICT");
  const preview = { ...q, key: [], rubric: "", explanation: "", keywords: [] };
  function changePage(next: number) {
    if (mediaDirty) {
      setMessage("Simpan canvas terlebih dahulu sebelum berpindah soal.");
      return false;
    }
    setIndex(next);
    setMessage("");
    return true;
  }
  async function fullscreen() {
    try {
      if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else throw Error("Fullscreen tidak didukung.");
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      if (orientation.lock) await orientation.lock("landscape").catch(() => {});
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Fullscreen tidak tersedia. Anda tetap dapat mengerjakan ujian.",
      );
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="student-shell workspace" style={{ "--exam-header-height": `${headerHeight+16}px` } as import("react").CSSProperties}>
      <header ref={examHeader} className="exam-top panel">
        <div><p className="eyebrow">RUANG UJIAN</p><h1>{a.title}</h1><small>Soal {index+1} dari {a.questions.length}</small></div>
        <div className={`exam-clock${remaining <= 300 ? " is-urgent" : ""}`}><span>Sisa waktu</span>
          <p role="timer" aria-label="Sisa waktu">{Math.floor(remaining/3600).toString().padStart(2,"0")}:{Math.floor((remaining%3600)/60).toString().padStart(2,"0")}:{(remaining%60).toString().padStart(2,"0")}</p>
        </div>
        <div className="actions">
          <Button className="player-mobile-map" variant="outline" onClick={() => setMapOpen(true)}><ListOrdered size={17} aria-hidden="true" />Daftar soal</Button>
          <details className="exam-tools"><summary className="button button-outline" aria-label="Alat ujian">Alat<ChevronDown size={15} aria-hidden="true" /></summary>
            <div className="exam-tools-menu">
              <label><span><Type size={16} aria-hidden="true" /> Ukuran tulisan soal</span><select value={fontSize} onChange={event => setFontSize(Number(event.target.value))}>{[16,18,20,22].map(size => <option value={size} key={size}>{size === 18 ? "Normal" : size < 18 ? "Ringkas" : size === 20 ? "Besar" : "Sangat besar"}</option>)}</select></label>
              <StudentHelp attemptId={a.id} />
              <Button variant="outline" onClick={() => void fullscreen()}>Fullscreen / landscape</Button>
              <Button variant="outline" onClick={() => setReloadConfirm(true)}>Muat status server</Button>
              <Button variant="outline" disabled={submitting || transferring || submitUncertain} onClick={() => { setTransferMessage(""); setTransferOpen(true); }}>Pindah perangkat</Button>
              <p className="muted">Perubahan fokus dicatat untuk peninjauan. Waktu tetap berjalan.</p>
            </div>
          </details>
          <Button disabled={submitting || transferring} onClick={() => setConfirm(true)}>Akhiri ujian</Button>
        </div>
      </header>
      <div className="exam-status">
        <span className={`status-pill${!connected ? " is-pending" : ""}`}>{connected ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}{connected ? "Terhubung" : "Koneksi terputus"}</span>
        <p role="status">{mediaDirty ? "Canvas belum tersimpan" : Object.keys(queue.conflicts).length ? "Ada konflik jawaban" : queue.pendingCount ? `${queue.pendingCount} jawaban menunggu simpan` : <><CheckCircle2 size={14} aria-hidden="true" style={{ display: "inline", verticalAlign: "middle" }} /> Semua perubahan tersimpan</>}</p>
        {queue.lastSavedAt && <small>Respons terakhir {new Date(queue.lastSavedAt).toLocaleTimeString("id-ID")}</small>}
      </div>
      {remaining > 0 && remaining <= 300 && <p className="notice" role="status">Waktu tersisa 5 menit atau kurang. Periksa jawaban dan status penyimpanan.</p>}
      {queue.recoveryMessage && <p role="status" className="notice">{queue.recoveryMessage}</p>}
      {submitUncertain && <section className="notice"><p>Menunggu kepastian pengumpulan. Jangan berpindah perangkat.</p><Button disabled={submitting} onClick={() => void submit(submitMode.current)}>Periksa / ulangi pengumpulan</Button></section>}
      {(queue.pendingCount > 0 || Object.keys(queue.conflicts).length > 0) && <p className="muted">{queue.status}</p>}
      {queue.pendingCount > 0 && (
        <Button variant="outline" onClick={queue.retry}>
          Coba simpan lagi
        </Button>
      )}
      <p role="alert">{message || warning}</p>
      {Object.entries(queue.conflicts).map(([id, c]) => (
        <section className="notice" key={id}>
          <p>
            Konflik soal {a.questions.findIndex((q) => q.id === id) + 1}, revisi
            server {c.revision}. Draf lokal: {JSON.stringify(queue.values[id])}.
            Versi server: {JSON.stringify(c.value)}.
          </p>
          <div className="actions">
            <Button onClick={() => queue.resolve(id, false)}>
              Gunakan versi server
            </Button>
            <Button variant="outline" onClick={() => queue.resolve(id, true)}>
              Kirim perubahan saya di atas revisi ini
            </Button>
          </div>
        </section>
      ))}
      {(recoveryChoices.length > 0 || (a.recovery?.canvases?.length || 0) > 0) && <details className="panel">
        <summary>Pemulihan draf dari tab/perangkat sebelumnya</summary>
        <p>Pilih draf yang ingin dipulihkan. Draf berbeda tidak menimpa jawaban otomatis; deadline tetap berlaku.</p>
        {recoveryChoices.map(d => <section key={d.id}>
          <p>{d.label} · Soal {a.questions.findIndex(q => q.id === d.questionId) + 1}</p>
          <p>{JSON.stringify(d.value).slice(0,180)}</p>
          <Button disabled={disabled || mediaDirty} variant="outline" onClick={() => {
            queue.importDraft(d.questionId, d.value, d.revision);
            setRecoveryChoices(rows => rows.filter(row => row.id !== d.id));
          }}>Pulihkan draf ini</Button>
        </section>)}
        {(a.recovery?.canvases || []).map(c => <section key={c.id}>
          <p>Canvas sudah diunggah · Soal {a.questions.findIndex(q => q.id === c.question_id) + 1} · {new Date(c.created_at).toLocaleString("id-ID")}</p>
          <Button disabled={disabled || mediaDirty} variant="outline" onClick={() => {
            const current = queue.getValue(c.question_id);
            const value = current && !Array.isArray(current) ? current : { text: "" };
            queue.change(c.question_id, { ...value, canvas_id: c.id });
            setIndex(a.questions.findIndex(q => q.id === c.question_id));
          }}>Gunakan canvas yang diunggah</Button>
        </section>)}
      </details>}
      <div className="player-grid">
      <div className="player-main">
      <section className="panel stack question-reading" style={{ "--question-font-size": `${fontSize}px` } as import("react").CSSProperties}>
        <div className="question-heading"><h2 ref={questionHeading} tabIndex={-1}>Soal {index+1} <span className="muted">/ {a.questions.length}</span></h2><span className="question-type">{questionTypeLabels[q.type] || q.type}</span></div>
        <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>{q.points} poin · {q.required ? "Wajib dijawab" : "Opsional"}</p>
        <Preview
          question={preview}
          showKey={false}
          showOptions={false}
          showMeta={false}
          attachmentBaseUrl="/api/attempts/media"
        />
        {q.type === "PG" || q.type === "PG_KOMPLEKS" ? (
          <fieldset disabled={disabled}>
            <legend>
              {q.type === "PG"
                ? "Pilih satu jawaban"
                : "Pilih semua jawaban yang benar"}
            </legend>
            {q.options.map((o) => (
              <label className="check answer-choice" key={o.id}>
                <input
                  type={q.type === "PG" ? "radio" : "checkbox"}
                  name={item.id}
                  checked={picks.includes(o.id)}
                  onChange={() =>
                    queue.change(
                      item.id,
                      q.type === "PG"
                        ? [o.id]
                        : picks.includes(o.id)
                          ? picks.filter((id) => id !== o.id)
                          : [...picks, o.id],
                    )
                  }
                />
                {o.text}
              </label>
            ))}
          </fieldset>
        ) : q.type === "BS" || q.type === "JODOH" ? (
          <fieldset disabled={disabled}>
            <legend>Jawaban per pernyataan</legend>
            {q.options.map((o) => (
              <label className="statement-answer" key={o.id}>
                {o.text}
                <select
                  value={record[o.id] || ""}
                  onChange={(e) =>
                    queue.change(item.id, { ...record, [o.id]: e.target.value })
                  }
                >
                  <option value="">Belum dijawab</option>
                  {q.type === "BS" ? (
                    <>
                      <option value="true">Benar</option>
                      <option value="false">Salah</option>
                    </>
                  ) : (
                    (q.choices || []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ))}
          </fieldset>
        ) : (
          <>
            <label>
              Jawaban esai (HTML terbatas / LaTeX)
              <textarea
                dir={q.direction}
                rows={8}
                disabled={disabled}
                value={record.text || ""}
                onChange={(e) =>
                  queue.change(item.id, { ...record, text: e.target.value })
                }
              />
            </label>
            <p>
              {essayLength(record.text || "")} karakter · minimum {q.minChars}
            </p>
            <div className="actions">
              {[
                "<b>teks</b>",
                "<i>teks</i>",
                "$\\frac{a}{b}$",
                "أ ب ت ث",
                "≤ ≥ ≠ √",
              ].map((s) => (
                <Button
                  disabled={disabled}
                  variant="outline"
                  key={s}
                  onClick={() =>
                    queue.change(item.id, {
                      ...record,
                      text: (record.text || "") + " " + s,
                    })
                  }
                >
                  {s}
                </Button>
              ))}
            </div>
            <details>
              <summary>Pratinjau tulisan</summary>
              <Preview
                question={{
                  ...preview,
                  stem: record.text || "Belum ada tulisan.",
                  options: [],
                  attachments: [],
                }}
                showKey={false}
              />
            </details>
            {q.canvas.enabled && (
              <Canvas
                key={`${item.id}:${record.canvas_id || "new"}`}
                writer={writer}
                questionId={item.id}
                recoveryScope={studentId}
                canvasWidth={q.canvas.width}
                canvasHeight={q.canvas.height}
                savedId={record.canvas_id}
                disabled={disabled}
                onDirty={setMediaDirty}
                onSaved={(id) =>
                  queue.change(item.id, {
                    ...(queue.getValue(item.id) &&
                    !Array.isArray(queue.getValue(item.id))
                      ? (queue.getValue(item.id) as Record<string, string>)
                      : {}),
                    text:
                      (queue.getValue(item.id) as Record<string, string>)
                        ?.text || "",
                    canvas_id: id,
                  })
                }
              />
            )}
            <Button
              disabled={disabled || !record.canvas_id}
              variant="outline"
              onClick={async () => {
                try {
                  const r = await fetch("/api/attempts/latex", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ canvas_id: record.canvas_id }),
                  });
                  const j = await r.json();
                  setMessage(
                    j.error?.message ||
                      j.data?.latex ||
                      "Konversi belum tersedia.",
                  );
                } catch {
                  setMessage(
                    "Layanan konversi belum dapat diakses. Canvas tetap tersimpan.",
                  );
                }
              }}
            >
              Konversi canvas ke LaTeX
            </Button>
          </>
        )}
        <div className="player-actions">
          <Button
            variant="outline"
            disabled={!index}
            onClick={() => changePage(index - 1)}
          >
            Sebelumnya
          </Button>
          <Button
            variant="outline"
            aria-pressed={flagged.includes(item.id)}
            aria-label={flagged.includes(item.id) ? "Hapus tanda ragu" : "Tandai ragu"}
            onClick={() =>
              setFlagged((f) =>
                f.includes(item.id)
                  ? f.filter((id) => id !== item.id)
                  : [...f, item.id],
              )
            }
          >
            <Bookmark size={16} aria-hidden="true" fill={flagged.includes(item.id) ? "currentColor" : "none"} /><span className="flag-label">{flagged.includes(item.id) ? "Hapus tanda ragu" : "Tandai ragu"}</span>
          </Button>
          <Button
            disabled={index === a.questions.length - 1}
            onClick={() => changePage(index + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </section>
      </div>
      <aside className="exam-side panel" aria-label="Peta soal"><QuestionNavigation items={navigationItems} index={index} onSelect={changePage} /></aside>
      </div>
      {remaining === 0 && (
        <section className="notice">
          <p>
            Waktu telah habis. Jika jaringan bermasalah, server tetap
            menggunakan deadline asli.
          </p>
          <Button disabled={submitting} onClick={() => void submit("timeout")}>
            Periksa / finalisasi status akhir
          </Button>
        </section>
      )}
      <Dialog open={transferOpen} onOpenChange={open => { if (!transferring) setTransferOpen(open); }} title="Siapkan perpindahan perangkat"
        description="Simpan jawaban, lalu masuk di perangkat tujuan dan pilih Lanjutkan serta ambil alih sesi. Deadline tetap berjalan. Draf yang masih offline tidak tersedia di perangkat lain.">
        <Button disabled={transferring || submitting || remaining === 0 || mediaDirty || submitUncertain} onClick={async () => {
          setTransferring(true); setTransferMessage("Memastikan jawaban diterima server…");
          try {
            const saved = await queue.flushAll();
            setTransferMessage(saved ? "Jawaban saat persiapan sudah diakui server. Masuk di perangkat tujuan dan ambil alih sesi. Perubahan setelah dialog ini ditutup tetap perlu disimpan." : "Belum siap berpindah. Selesaikan konflik atau pulihkan koneksi dan coba simpan lagi.");
          } finally { setTransferring(false); }
        }}>{transferring ? "Menyimpan…" : "Simpan dan periksa kesiapan"}</Button>
        {mediaDirty && <p>Simpan canvas sebelum menyiapkan perpindahan perangkat.</p>}
        <p role="status">{transferMessage}</p>
      </Dialog>
      <Dialog open={mapOpen} onOpenChange={setMapOpen} title="Daftar soal ujian" description="Pilih nomor soal. Status jawaban dan tanda ragu ditampilkan pada setiap nomor." onCloseAutoFocus={event => {
        if (mapSelection.current) { event.preventDefault(); mapSelection.current = false; focusQuestion(); }
      }}>
        <QuestionNavigation items={navigationItems} index={index} onSelect={next => { if (changePage(next)) { mapSelection.current = true; setMapOpen(false); } }} />
        {mediaDirty && <p role="status">Simpan canvas sebelum berpindah soal.</p>}
      </Dialog>
      <Dialog
        open={confirm}
        onOpenChange={setConfirm}
        onCloseAutoFocus={event => { if (mapSelection.current) { event.preventDefault(); mapSelection.current = false; focusQuestion(); } }}
        title="Akhiri ujian?"
        description="Jawaban wajib akan diperiksa oleh server. Jawaban yang belum diakui server harus disimpan terlebih dahulu."
      >
        <div className="submission-counts" aria-label="Ringkasan jawaban"><div><strong>{summary.complete}</strong><span>Terjawab</span></div><div><strong>{summary.empty+summary.partial}</strong><span>Belum lengkap</span></div><div><strong>{summary.flagged}</strong><span>Ditandai ragu</span></div></div>
        {summary.requiredMissing > 0 && <p className="notice">{summary.requiredMissing} soal wajib belum lengkap. Pemeriksaan akhir tetap dilakukan server.</p>}
        {(summary.empty+summary.partial > 0) && <Button variant="outline" onClick={() => {
          const next = a.questions.findIndex(q => completion(q.payload, queue.values[q.id]) !== "complete");
          if (next >= 0 && changePage(next)) { mapSelection.current = true; setConfirm(false); }
        }}>Periksa jawaban yang belum lengkap</Button>}
        <Button
          disabled={submitting || mediaDirty}
          onClick={() => void submit(remaining === 0 ? "timeout" : "manual")}
        >
          {submitting ? "Memproses…" : "Ya, akhiri ujian"}
        </Button>
        <p role="status">{message}</p>
      </Dialog>
      <Dialog
        open={reloadConfirm}
        onOpenChange={setReloadConfirm}
        title="Muat ulang dari server?"
        description="Jawaban akan disimpan sebelum memuat ulang status. Jika ada konflik atau canvas belum tersimpan, selesaikan terlebih dahulu. Jika perangkat lain mengambil alih, hubungi pengawas."
      >
        <Button disabled={submitting || mediaDirty} onClick={async () => {
          if (!submitUncertain && !(await queue.flushAll())) {
            setMessage("Draf belum tersimpan. Selesaikan konflik atau coba simpan lagi sebelum memuat status.");
            setReloadConfirm(false);
            return;
          }
          onReload();
        }}>Simpan dan muat status server</Button>
      </Dialog>
    </main>
  );
}
