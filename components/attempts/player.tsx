"use client";
import { MoreActions } from "../ui/more-actions";
import { feedbackFetch } from "../../lib/client/feedback-transport";

import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { StartHere } from "../help/start-here";
import { ContextHelp } from "../help/context-help";
import { DevicePreflight } from "./device-preflight";
import { StudentHelp } from "../workflow/help";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ListOrdered,
  Type,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  completion,
  progressSummary,
  questionTypeLabels,
} from "../../lib/attempts/presentation";
import { QuestionNavigation } from "./question-navigation";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { LogoutButton } from "../auth/logout-button";
import {
  sameAnswer,
  deviceDrafts,
  receiptOf,
  secondsRemaining,
  type AnswerValue,
} from "../../lib/attempts/recovery";
import { AttemptError } from "./queue";
import { essayLength } from "../../lib/attempts/essay";
import { command, useAnswerQueue } from "./queue";
import { useIntegrity } from "./integrity";
const Preview = dynamic(
  () => import("../authoring/preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
const Canvas = dynamic(() => import("./canvas").then((m) => m.EssayCanvas), {
  ssr: false,
});
import {
  examListSchema,
  isAttempt,
  attemptStatusLabels,
  type Exam,
  type Attempt,
} from "../../lib/attempts/contracts";
import { clientRequest } from "../../lib/client/request";
export type { Attempt } from "../../lib/attempts/contracts";
const terminal = isAttempt;
const isClientId = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function StudentPortal({ studentId }: { studentId: string }) {
  const [deviceReady, setDeviceReady] = useState(false),
    [exams, setExams] = useState<Exam[]>([]),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [client, setClient] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [takeover, setTakeover] = useState(""),
    [reloadKey, setReloadKey] = useState(0),
    [listVersion, setListVersion] = useState(0),
    [listState, setListState] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [listError, setListError] = useState("");
  const attemptRef = useRef<Attempt | null>(null);
  const updateAttempt = useCallback((next: Attempt) => {
    const current = attemptRef.current;
    if (
      current?.id === next.id &&
      ((current.finalized_at && !next.finalized_at) ||
        next.epoch < current.epoch)
    )
      return;
    attemptRef.current = next;
    setAttempt(next);
  }, []);
  const sessionNotice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message && !busy && !takeover) {
      sessionNotice.current?.focus({ preventScroll: true });
      sessionNotice.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    }
  }, [message, busy, takeover]);
  const deviceUntil = useRef(0),
    mounted = useRef(false),
    openLock = useRef(false),
    opening = useRef<AbortController | null>(null),
    reading = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const updateDeviceReady = useCallback((ready: boolean, expiresAt: number) => {
    deviceUntil.current = expiresAt;
    setDeviceReady(ready);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      opening.current?.abort();
      reading.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (typeof crypto?.randomUUID !== "function") {
      setMessage("Buka aplikasi melalui HTTPS di browser terbaru.");
      return;
    }
    try {
      let id = sessionStorage.getItem("edutara_attempt_client");
      if (!id || !isClientId(id)) {
        id = crypto.randomUUID();
        sessionStorage.setItem("edutara_attempt_client", id);
      }
      setClient(id);
    } catch {
      setClient(crypto.randomUUID());
    }
  }, []);
  useEffect(() => {
    const c = new AbortController(),
      seq = ++sequence.current;
    reading.current = c;
    setListState("loading");
    setListError("");
    clientRequest("/api/attempts", undefined, examListSchema, c)
      .then((d) => {
        if (!mounted.current || c.signal.aborted || seq !== sequence.current)
          return;
        setExams(d.exams);
        setListState("ready");
      })
      .catch((e) => {
        if (mounted.current && !c.signal.aborted && seq === sequence.current) {
          setListError(
            e instanceof Error ? e.message : "Daftar ujian belum dapat dimuat.",
          );
          setListState("error");
        }
      });
    return () => c.abort();
  }, [listVersion]);
  async function open(input: unknown, id?: string, preserveActive = false) {
    if (openLock.current || !client) return;
    openLock.current = true;
    reading.current?.abort();
    setBusy(true);
    setMessage("");
    const c = new AbortController();
    opening.current = c;
    try {
      const data = await command(input, { signal: c.signal });
      if (!mounted.current) return;
      if (!terminal(data))
        throw Error(
          "Status ujian belum dapat dimuat. Coba lagi tanpa mengulang jawaban.",
        );
      const current = attemptRef.current;
      if (
        current?.id === data.id &&
        ((current.finalized_at && !data.finalized_at) ||
          data.epoch < current.epoch)
      )
        return;
      const keepPlayer =
        preserveActive &&
        data.status === "in_progress" &&
        !data.finalized_at &&
        current?.id === data.id &&
        current.epoch === data.epoch;
      updateAttempt(data);
      if (!keepPlayer) setReloadKey((k) => k + 1);
      setTakeover("");
    } catch (e) {
      if (mounted.current) {
        const m = e instanceof Error ? e.message : "Gagal membuka ujian.";
        setMessage(m);
        if (m.includes("DEVICE_CONFLICT") && id) setTakeover(id);
      }
    } finally {
      openLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const takeoverDialog = (
    <Dialog
      open={!!takeover}
      onOpenChange={(v) => {
        if (!v && !openLock.current) setTakeover("");
      }}
      title="Gunakan perangkat ini?"
      description="Perangkat/tab sebelumnya tidak dapat menulis setelah Anda mengambil alih. Waktu ujian tidak bertambah. Draf offline tetap berada di perangkat asal."
    >
      <p>
        Jawaban dan cadangan draf yang sudah mencapai server dapat dipulihkan.
        Pastikan Anda tidak lagi mengerjakan pada perangkat sebelumnya.
      </p>
      <FeedbackMessage tone="error" role="alert">
        {message}
      </FeedbackMessage>
      <div className="actions">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => setTakeover("")}
        >
          Kembali
        </Button>
        <Button
          loading={busy}
          disabled={busy || !client}
          onClick={() =>
            void open(
              { action: "takeover", attempt_id: takeover, client_id: client },
              takeover,
            )
          }
        >
          {busy ? "Memeriksa sesi…" : "Gunakan perangkat ini"}
        </Button>
      </div>
    </Dialog>
  );
  if (attempt)
    return (
      <>
        {(message || busy) && (
          <div
            className="student-session-feedback"
            ref={sessionNotice}
            tabIndex={-1}
          >
            <FeedbackMessage
              tone={busy ? "loading" : "error"}
              role={busy ? "status" : "alert"}
            >
              {busy ? "Memeriksa status ujian…" : message}
            </FeedbackMessage>
          </div>
        )}
        <ExamPlayer
          key={attempt.id + ":" + attempt.epoch + ":" + reloadKey}
          attempt={attempt}
          clientId={client}
          studentId={studentId}
          onUpdate={updateAttempt}
          onReload={async (options) => {
            await open(
              { action: "resume", attempt_id: attempt.id, client_id: client },
              attempt.id,
              options?.preserveActive,
            );
          }}
          reloading={busy}
          onBack={() => {
            if (!attempt.finalized_at || openLock.current) return;
            setListState("loading");
            attemptRef.current = null;
            setAttempt(null);
            setMessage("");
            setTakeover("");
            setListVersion((v) => v + 1);
          }}
        />
        {takeoverDialog}
      </>
    );
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="workspace student-shell student-portal"
    >
      <header className="student-portal-heading">
        <div>
          <h1>Ujian saya</h1>
        </div>
        <div className="actions">
          <Button
            variant="outline"
            disabled={busy || listState === "loading"}
            onClick={() => setListVersion((v) => v + 1)}
          >
            Perbarui daftar
          </Button>
          <ContextHelp audience="student" page="/student" />
          <MoreActions label="Akun">
            <LogoutButton />
          </MoreActions>
        </div>
      </header>
      <StartHere page="/student" />
      <div ref={sessionNotice} tabIndex={-1}>
        {" "}
        <FeedbackMessage
          tone={busy ? "loading" : "error"}
          role={busy ? "status" : "alert"}
        >
          {busy ? "Membuka ujian…" : message}
        </FeedbackMessage>
      </div>
      {listState === "loading" && (
        <StateCard
          kind="loading"
          title="Memuat ujian"
          description="Menyiapkan jadwal dan status ujian Anda."
        />
      )}
      {listState === "error" && (
        <StateCard
          kind="error"
          title="Daftar ujian belum dapat dimuat"
          description={listError}
          actions={
            <Button
              variant="outline"
              onClick={() => setListVersion((v) => v + 1)}
            >
              Coba muat ulang
            </Button>
          }
        />
      )}
      {listState === "ready" && !exams.length && (
        <StateCard
          kind="empty"
          title="Belum ada ujian"
          description="Ujian untuk kelas Anda akan muncul di sini setelah dijadwalkan."
          actions={
            <Button
              variant="outline"
              onClick={() => setListVersion((v) => v + 1)}
            >
              Periksa lagi
            </Button>
          }
        />
      )}
      {listState === "ready" && exams.length > 0 && (
        <section className="role-actions" aria-label="Ringkasan ujian saya">
          <div className="role-action">
            <strong>Belum dimulai</strong>
            <span className="metric">
              {exams.filter((e) => !e.attempt && e.status !== "closed").length}
            </span>
          </div>
          <div className="role-action">
            <strong>Perlu dilanjutkan</strong>
            <span className="metric">
              {exams.filter((e) => e.attempt && !e.attempt.finalized_at).length}
            </span>
          </div>
          <div className="role-action">
            <strong>Sudah dikumpulkan</strong>
            <span className="metric">
              {exams.filter((e) => e.attempt?.finalized_at).length}
            </span>
          </div>
        </section>
      )}
      {listState === "ready" &&
        exams.some((e) => !e.attempt && e.status !== "closed") && (
          <DevicePreflight onReadyChange={updateDeviceReady} />
        )}
      <div className="student-exam-list">
        {listState === "ready" &&
          exams.map((e) => (
            <section
              id={`exam-${e.id}`}
              tabIndex={-1}
              className="panel stack exam-card"
              key={e.id}
            >
              <div className="actions">
                <span className="question-type">
                  {e.attempt?.finalized_at
                    ? "Selesai"
                    : e.attempt
                      ? attemptStatusLabels[e.attempt.status] || "Sudah dimulai"
                      : e.status === "active"
                        ? "Berlangsung"
                        : e.status === "closed"
                          ? "Ditutup"
                          : "Terjadwal"}
                </span>
                <span className="muted">{e.duration_minutes} menit</span>
              </div>
              <h2>{e.title}</h2>
              <dl className="student-schedule">
                <div>
                  <dt>Mulai</dt>
                  <dd>
                    {new Date(e.starts_at).toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    WIB
                  </dd>
                </div>
                <div>
                  <dt>Berakhir</dt>
                  <dd>
                    {new Date(e.ends_at).toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    WIB
                  </dd>
                </div>
              </dl>
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
                  {e.attempt.finalized_at
                    ? "Lihat status dan hasil"
                    : "Lanjutkan / lihat status"}
                </Button>
              ) : e.status === "closed" ? (
                <p className="muted">
                  Ujian sudah ditutup. Hubungi pengawas bila Anda perlu tindak
                  lanjut.
                </p>
              ) : (
                <ValidatedForm
                  className="student-pin-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    if (openLock.current) return;
                    if (
                      !deviceReady ||
                      performance.now() >= deviceUntil.current ||
                      !navigator.onLine
                    ) {
                      setMessage(
                        "Selesaikan pemeriksaan perangkat sebelum memulai ujian baru.",
                      );
                      return;
                    }
                    const pin = new FormData(ev.currentTarget).get("pin");
                    void open({
                      action: "start",
                      exam_id: e.id,
                      client_id: client,
                      pin,
                    });
                  }}
                >
                  <fieldset
                    className="student-pin-controls"
                    disabled={busy || !client}
                  >
                    <label>
                      PIN ujian
                      <input
                        name="pin"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{4,12}"
                        minLength={4}
                        maxLength={12}
                        required
                        autoComplete="off"
                      />
                    </label>
                    <Button disabled={!deviceReady}>Mulai ujian</Button>
                  </fieldset>
                  {!deviceReady && (
                    <p className="muted">
                      Selesaikan pemeriksaan perangkat di atas terlebih dahulu.
                    </p>
                  )}
                </ValidatedForm>
              )}
            </section>
          ))}
      </div>
      {takeoverDialog}
    </main>
  );
}
export function ExamPlayer({
  attempt: a,
  clientId,
  studentId,
  onUpdate,
  onReload,
  onBack,
  reloading = false,
}: {
  attempt: Attempt;
  clientId: string;
  studentId: string;
  onUpdate: (data: Attempt) => void;
  onReload: (options?: { preserveActive?: boolean }) => void | Promise<void>;
  onBack?: () => void;
  reloading?: boolean;
}) {
  const writer = useMemo(
    () => ({ attempt_id: a.id, client_id: clientId, epoch: a.epoch }),
    [a.id, clientId, a.epoch],
  );
  const active = a.status === "in_progress" && !a.finalized_at;
  const queue = useAnswerQueue(
    writer,
    a.answers,
    (data) => {
      if (terminal(data)) onUpdate(data);
    },
    {
      ownerId: studentId,
      enabled: active,
      finalized: !!a.finalized_at,
      questionIds: a.questions.map((q) => q.id),
    },
  );
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
    [connected, setConnected] = useState(
      () => typeof navigator === "undefined" || navigator.onLine !== false,
    ),
    [connectionError, setConnectionError] = useState(""),
    [reloadingLocal, setReloadingLocal] = useState(false),
    [converting, setConverting] = useState(false),
    [flagged, setFlagged] = useState<string[]>([]),
    [fontSize, setFontSize] = useState(18),
    [headerHeight, setHeaderHeight] = useState(150),
    [viewportHeight, setViewportHeight] = useState(0),
    [preferencesLoaded, setPreferencesLoaded] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [recoveryChoices, setRecoveryChoices] = useState<
      {
        id: string;
        questionId: string;
        value: AnswerValue;
        revision: number;
        label: string;
      }[]
    >([]);
  const mountedPlayer = useRef(false),
    transferLock = useRef(false),
    reloadLock = useRef(false),
    conversionLock = useRef(false),
    conversionController = useRef<AbortController | null>(null),
    conversionSequence = useRef(0);
  useEffect(() => {
    mountedPlayer.current = true;
    return () => {
      mountedPlayer.current = false;
      conversionController.current?.abort();
    };
  }, []);
  useEffect(() => {
    conversionSequence.current++;
    conversionController.current?.abort();
    conversionLock.current = false;
    setConverting(false);
  }, [index]);
  const questionHeading = useRef<HTMLHeadingElement>(null),
    examHeader = useRef<HTMLElement>(null),
    previousIndex = useRef(0),
    mapSelection = useRef(false);
  useEffect(() => {
    const resize = () =>
      setViewportHeight(window.visualViewport?.height || window.innerHeight);
    resize();
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
    };
  }, []);
  const focusQuestion = useCallback(() => {
    questionHeading.current?.focus({ preventScroll: true });
    questionHeading.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }, []);
  useEffect(() => {
    const header = examHeader.current;
    if (!header || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeaderHeight(Math.ceil(header.getBoundingClientRect().height)),
    );
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
    deadline.current = a.deadline_at;
    started.current = {
      server: Date.parse(a.server_now),
      local: performance.now(),
    };
    const timer = setInterval(() => {
      setRemaining(
        Math.max(
          0,
          secondsRemaining(
            deadline.current,
            started.current.server,
            performance.now() - started.current.local,
          ),
        ),
      );
    }, 500);
    return () => clearInterval(timer);
  }, [active, a.deadline_at, a.server_now]);
  useEffect(() => {
    if (!active) return;
    let live = true,
      checking = false;
    const controller = new AbortController();
    const check = async () => {
      if (!live || checking || document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setConnected(false);
        return;
      }
      checking = true;
      try {
        const data = await command(
          {
            action: "resume",
            attempt_id: a.id,
            client_id: clientId,
          },
          { signal: controller.signal },
        );
        if (!live) return;
        if (terminal(data)) {
          setConnected(true);
          setConnectionError("");
          if (
            data.status !== "in_progress" ||
            data.finalized_at ||
            data.epoch !== a.epoch
          )
            onUpdate(data);
          else {
            deadline.current = data.deadline_at;
            started.current = {
              server: Date.parse(data.server_now),
              local: performance.now(),
            };
            setRemaining(
              secondsRemaining(data.deadline_at, started.current.server, 0),
            );
            // An uncertain submit must be retried with the same payload or resolved by a terminal response.
          }
        }
      } catch (e) {
        if (live) {
          setConnected(false);
          setConnectionError(
            e instanceof Error
              ? e.message
              : "Status server belum dapat diperiksa.",
          );
        }
      } finally {
        checking = false;
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void check();
    };
    const offline = () => setConnected(false);
    const heartbeat = setInterval(() => void check(), 15000);
    window.addEventListener("online", check);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      controller.abort();
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
    if (submittingRef.current || transferLock.current || reloadLock.current)
      return;
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
      if (!mountedPlayer.current) return;
      if (
        terminal(data) &&
        (data.finalized_at || data.status === "disqualified")
      ) {
        submitUncertainRef.current = false;
        setSubmitUncertain(false);
        onUpdate(data);
      } else
        throw Error(
          "Status akhir belum diterima. Coba lagi dengan permintaan yang sama.",
        );
    } catch (e) {
      if (!mountedPlayer.current) return;
      if (sent && (!(e instanceof AttemptError) || e.status >= 500)) {
        submitUncertainRef.current = true;
        setSubmitUncertain(true);
        setMessage(
          "Pengumpulan belum dapat dipastikan. Jawaban dikunci sementara; periksa status atau coba pengumpulan lagi dengan permintaan yang sama.",
        );
      } else {
        submitUncertainRef.current = false;
        setSubmitUncertain(false);
        submitId.current = crypto.randomUUID();
        setMessage(
          e instanceof Error ? e.message : "Finalisasi belum berhasil.",
        );
      }
    } finally {
      submittingRef.current = false;
      if (mountedPlayer.current) {
        setSubmitting(false);
        setConfirm(false);
      }
    }
  }
  useEffect(() => {
    if (
      active &&
      remaining === 0 &&
      !autoSent.current &&
      !submittingRef.current &&
      !transferLock.current &&
      !reloadLock.current
    ) {
      autoSent.current = true;
      void submit("timeout");
    }
  });
  useEffect(() => {
    if (!a.finalized_at) return;
    const prefix = `edutara:canvas:v1:${studentId}:${a.id}:`;
    try {
      for (const key of Object.keys(localStorage))
        if (key.startsWith(prefix)) localStorage.removeItem(key);
    } catch {
      /* Terminal server status remains available even if device storage is blocked. */
    }
  }, [a.finalized_at, a.id, studentId]);
  useEffect(() => {
    if (!active) return;
    const choices: {
      id: string;
      questionId: string;
      value: AnswerValue;
      revision: number;
      label: string;
    }[] = [];
    for (const { key, draft } of deviceDrafts(studentId, a.id)) {
      if (key.endsWith(`:${clientId}`) && draft.epoch === a.epoch) continue;
      for (const [id, row] of Object.entries(draft.rows)) {
        if (!a.questions.some((q) => q.id === id)) continue;
        const canonical = a.answers.find((answer) => answer.question_id === id);
        if (canonical && sameAnswer(canonical.value, row.value)) continue;
        choices.push({
          id: `${key}:${id}`,
          questionId: id,
          value: row.value,
          revision: row.revision,
          label: "Draf perangkat dari tab/sesi sebelumnya",
        });
      }
    }
    for (const d of a.recovery?.drafts || [])
      choices.push({
        id: `cloud:${d.client_id}:${d.epoch}:${d.question_id}`,
        questionId: d.question_id,
        value: d.value,
        revision: d.revision,
        label: "Cadangan draf server",
      });
    setRecoveryChoices(choices);
  }, [
    active,
    studentId,
    a.id,
    a.epoch,
    a.questions,
    a.answers,
    a.recovery,
    clientId,
  ]);
  useEffect(() => {
    if (!active) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`edutara:player-ui:v1:${studentId}:${a.id}`) ||
          "null",
      );
      if (saved) {
        if ([16, 18, 20, 22].includes(saved.fontSize))
          setFontSize(saved.fontSize);
        if (Array.isArray(saved.flagged))
          setFlagged(
            saved.flagged.filter((id: string) =>
              a.questions.some((q) => q.id === id),
            ),
          );
        const position = a.questions.findIndex(
          (q) => q.id === saved.questionId,
        );
        if (position >= 0) setIndex(position);
      }
    } catch {
      /* Display preferences never block an exam. */
    }
    setPreferencesLoaded(true);
  }, [active, studentId, a.id, a.questions]);
  useEffect(() => {
    if (!preferencesLoaded || !active) return;
    try {
      localStorage.setItem(
        `edutara:player-ui:v1:${studentId}:${a.id}`,
        JSON.stringify({
          fontSize,
          flagged,
          questionId: a.questions[index]?.id,
        }),
      );
    } catch {
      /* Preferences are optional. */
    }
  }, [
    preferencesLoaded,
    active,
    studentId,
    a.id,
    a.questions,
    index,
    fontSize,
    flagged,
  ]);
  useEffect(() => {
    if (previousIndex.current !== index) focusQuestion();
    previousIndex.current = index;
  }, [index, focusQuestion]);
  async function reloadStatus() {
    if (
      reloadLock.current ||
      submittingRef.current ||
      transferLock.current ||
      reloading
    )
      return;
    reloadLock.current = true;
    setReloadingLocal(true);
    try {
      if (mediaDirty) {
        setMessage(
          "Canvas belum tersimpan. Simpan canvas sebelum memuat status.",
        );
        return;
      }
      if (!submitUncertainRef.current && !(await queue.flushAll())) {
        setMessage(
          "Draf belum tersimpan. Selesaikan konflik atau coba simpan lagi sebelum memuat status.",
        );
        return;
      }
      await onReload({ preserveActive: submitUncertainRef.current });
    } catch (e) {
      if (mountedPlayer.current)
        setMessage(
          e instanceof Error ? e.message : "Status ujian belum dapat dimuat.",
        );
    } finally {
      reloadLock.current = false;
      if (mountedPlayer.current) {
        setReloadingLocal(false);
        setReloadConfirm(false);
      }
    }
  }
  async function prepareTransfer() {
    if (
      transferLock.current ||
      reloadLock.current ||
      submittingRef.current ||
      reloading ||
      mediaDirty ||
      submitUncertainRef.current
    )
      return;
    transferLock.current = true;
    setTransferring(true);
    setTransferMessage("Memastikan jawaban diterima server…");
    try {
      const saved = await queue.flushAll();
      if (mountedPlayer.current)
        setTransferMessage(
          saved
            ? "Jawaban saat persiapan sudah diakui server. Masuk di perangkat tujuan dan ambil alih sesi. Perubahan setelah dialog ini ditutup tetap perlu disimpan."
            : "Belum siap berpindah. Selesaikan konflik atau pulihkan koneksi dan coba simpan lagi.",
        );
    } catch {
      if (mountedPlayer.current)
        setTransferMessage(
          "Kesiapan belum dapat diperiksa. Pertahankan halaman ini dan coba simpan lagi.",
        );
    } finally {
      transferLock.current = false;
      if (mountedPlayer.current) setTransferring(false);
    }
  }
  const summary = progressSummary(a.questions, queue.values, flagged);
  const navigationItems = a.questions.map((q) => ({
    id: q.id,
    state: completion(q.payload, queue.values[q.id]),
    flagged: flagged.includes(q.id),
  }));
  const receipt = receiptOf(a);
  if (!active)
    return (
      <main id="main-content" tabIndex={-1} className="workspace student-shell">
        <section className="panel stack">
          <h1>{a.title}</h1>
          <p>
            Status: <b>{attemptStatusLabels[a.status] || a.status}</b>
          </p>
          {a.status === "disqualified" && !a.finalized_at ? (
            <>
              <p>
                Attempt dikunci setelah peninjauan. Hubungi pengawas. Deadline
                tetap berjalan.
              </p>
              <p>{a.review_reason}</p>
              <Button
                disabled={reloading || reloadingLocal}
                onClick={() => void reloadStatus()}
              >
                Periksa keputusan pengawas
              </Button>
              <StudentHelp attemptId={a.id} />
            </>
          ) : (
            <>
              <p>
                {a.status === "reset"
                  ? "Sesi direset oleh pengawas. Kembali ke daftar untuk memeriksa langkah berikutnya."
                  : "Ujian telah berakhir. Status berikut berasal dari server."}
              </p>
              {receipt && (
                <section
                  className="notice"
                  aria-label="Bukti pengumpulan ujian"
                >
                  <h2>Bukti pengumpulan</h2>
                  <p>
                    Nomor penerimaan: <strong>{receipt.number}</strong>
                  </p>
                  <p>
                    Waktu finalisasi server:{" "}
                    {new Date(receipt.receivedAt).toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                    })}{" "}
                    WIB
                  </p>
                  <p>
                    {receipt.status === "time_expired"
                      ? "Difinalisasi karena waktu habis/ujian ditutup."
                      : "Pengumpulan diterima server."}
                  </p>
                  <p>
                    Bukti ini mengacu pada jawaban yang diterima server, bukan
                    draf yang belum tersinkron.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const blob = new Blob(
                        [
                          `EDUTARA CBT — Bukti pengumpulan\nUjian: ${a.title}\nNomor: ${receipt.number}\nFinalisasi server: ${receipt.receivedAt}\nStatus: ${receipt.status}\n`,
                        ],
                        { type: "text/plain;charset=utf-8" },
                      );
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `bukti-ujian-${a.id}.txt`;
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    Unduh bukti pengumpulan
                  </Button>
                </section>
              )}
              <Button
                variant="outline"
                disabled={reloading || reloadingLocal}
                onClick={() => void reloadStatus()}
              >
                Periksa status terbaru
              </Button>
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
          <ContextHelp
            audience="student"
            page={a.finalized_at ? "student-result" : "student-exam"}
            duringExam={!a.finalized_at}
          />
          {onBack && a.finalized_at && (
            <Button
              variant="outline"
              disabled={reloading || reloadingLocal}
              onClick={onBack}
            >
              Kembali ke daftar ujian
            </Button>
          )}
          <LogoutButton />
        </section>
      </main>
    );
  const item = a.questions[index];
  if (!item)
    return (
      <main id="main-content" tabIndex={-1} className="workspace stack">
        <p>Snapshot soal tidak tersedia. Hubungi pengawas.</p>
        <ContextHelp audience="student" page="student-exam" duringExam />
      </main>
    );
  const q = item.payload;
  const answer =
    queue.values[item.id] || (["PG", "PG_KOMPLEKS"].includes(q.type) ? [] : {});
  const record = Array.isArray(answer) ? {} : answer;
  const picks = Array.isArray(answer) ? answer : [];
  const disabled =
    remaining === 0 ||
    submitting ||
    transferring ||
    reloading ||
    reloadingLocal ||
    submitUncertain ||
    queue.status.includes("DEVICE_CONFLICT") ||
    message.includes("DEVICE_CONFLICT") ||
    connectionError.includes("DEVICE_CONFLICT");
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
    <main
      id="main-content"
      tabIndex={-1}
      className="student-shell workspace"
      style={
        {
          "--exam-header-height": `${viewportHeight && headerHeight > viewportHeight * 0.45 ? 16 : headerHeight + 16}px`,
        } as import("react").CSSProperties
      }
    >
      <header
        ref={examHeader}
        className="exam-top panel"
        style={{
          position:
            viewportHeight && headerHeight > viewportHeight * 0.45
              ? "static"
              : undefined,
        }}
      >
        <div>
          <p className="eyebrow">RUANG UJIAN</p>
          <h1>{a.title}</h1>
          <small>
            Soal {index + 1} dari {a.questions.length}
          </small>
        </div>
        <div className={`exam-clock${remaining <= 300 ? " is-urgent" : ""}`}>
          <span>Sisa waktu</span>
          <p role="timer" aria-live="off" aria-label="Sisa waktu">
            {Math.floor(remaining / 3600)
              .toString()
              .padStart(2, "0")}
            :
            {Math.floor((remaining % 3600) / 60)
              .toString()
              .padStart(2, "0")}
            :{(remaining % 60).toString().padStart(2, "0")}
          </p>
        </div>
        <div className="actions">
          <Button
            className="player-mobile-map"
            variant="outline"
            onClick={() => setMapOpen(true)}
          >
            <ListOrdered size={17} aria-hidden="true" />
            Daftar soal
          </Button>
          <details className="exam-tools">
            <summary className="button button-outline" aria-label="Alat ujian">
              Alat
              <ChevronDown size={15} aria-hidden="true" />
            </summary>
            <div className="exam-tools-menu">
              <label>
                <span>
                  <Type size={16} aria-hidden="true" /> Ukuran tulisan soal
                </span>
                <select
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                >
                  {[16, 18, 20, 22].map((size) => (
                    <option value={size} key={size}>
                      {size === 18
                        ? "Normal"
                        : size < 18
                          ? "Ringkas"
                          : size === 20
                            ? "Besar"
                            : "Sangat besar"}
                    </option>
                  ))}
                </select>
              </label>
              <ContextHelp audience="student" page="student-exam" duringExam />
              <StudentHelp attemptId={a.id} />
              <Button variant="outline" onClick={() => void fullscreen()}>
                Fullscreen / landscape
              </Button>
              <Button variant="outline" onClick={() => setReloadConfirm(true)}>
                Muat status server
              </Button>
              <Button
                variant="outline"
                disabled={submitting || transferring || submitUncertain}
                onClick={() => {
                  setTransferMessage("");
                  setTransferOpen(true);
                }}
              >
                Pindah perangkat
              </Button>
              <p className="muted">
                Perubahan fokus dicatat untuk peninjauan. Waktu tetap berjalan.
              </p>
            </div>
          </details>
          <Button
            disabled={submitting || transferring || reloading || reloadingLocal}
            onClick={() => setConfirm(true)}
          >
            Akhiri ujian
          </Button>
        </div>
      </header>
      <div className="exam-status">
        <span className={`status-pill${!connected ? " is-pending" : ""}`}>
          {connected ? (
            <Wifi size={14} aria-hidden="true" />
          ) : (
            <WifiOff size={14} aria-hidden="true" />
          )}
          {connected ? "Terhubung" : "Status server belum terverifikasi"}
        </span>
        <FeedbackMessage tone="info" role="status">
          {mediaDirty ? (
            "Canvas belum tersimpan"
          ) : Object.keys(queue.conflicts).length ? (
            "Ada konflik jawaban"
          ) : queue.pendingCount ? (
            `${queue.pendingCount} jawaban menunggu simpan`
          ) : (
            <>
              <CheckCircle2
                size={14}
                aria-hidden="true"
                style={{ display: "inline", verticalAlign: "middle" }}
              />{" "}
              Semua perubahan tersimpan
            </>
          )}
        </FeedbackMessage>
        {queue.lastSavedAt && (
          <small>
            Respons terakhir{" "}
            {new Date(queue.lastSavedAt).toLocaleTimeString("id-ID")}
          </small>
        )}
      </div>
      {remaining > 0 && remaining <= 300 && (
        <FeedbackMessage tone="info" className="notice" role="status">
          Waktu tersisa 5 menit atau kurang. Periksa jawaban dan status
          penyimpanan.
        </FeedbackMessage>
      )}
      {queue.recoveryMessage && (
        <FeedbackMessage tone="info" role="status" className="notice">
          {queue.recoveryMessage}
        </FeedbackMessage>
      )}
      {submitUncertain && (
        <section className="notice">
          <p>Menunggu kepastian pengumpulan. Jangan berpindah perangkat.</p>
          <Button
            disabled={submitting}
            onClick={() => void submit(submitMode.current)}
          >
            Periksa / ulangi pengumpulan
          </Button>
        </section>
      )}
      {(queue.pendingCount > 0 || Object.keys(queue.conflicts).length > 0) && (
        <p className="muted">{queue.status}</p>
      )}
      {queue.pendingCount > 0 && (
        <Button variant="outline" disabled={disabled} onClick={queue.retry}>
          Coba simpan lagi
        </Button>
      )}
      <FeedbackMessage tone="error" role="alert">
        {message || connectionError || warning}
      </FeedbackMessage>
      {Object.entries(queue.conflicts).map(([id, c]) => (
        <section className="notice" key={id}>
          <p>
            Konflik soal {a.questions.findIndex((q) => q.id === id) + 1}, revisi
            server {c.revision}. Draf lokal: {JSON.stringify(queue.values[id])}.
            Versi server: {JSON.stringify(c.value)}.
          </p>
          <div className="actions">
            <Button
              disabled={disabled}
              onClick={() => queue.resolve(id, false)}
            >
              Gunakan versi server
            </Button>
            <Button
              disabled={disabled}
              variant="outline"
              onClick={() => queue.resolve(id, true)}
            >
              Kirim perubahan saya di atas revisi ini
            </Button>
          </div>
        </section>
      ))}
      {(recoveryChoices.length > 0 ||
        (a.recovery?.canvases?.length || 0) > 0) && (
        <details className="panel">
          <summary>Pemulihan draf dari tab/perangkat sebelumnya</summary>
          <p>
            Pilih draf yang ingin dipulihkan. Draf berbeda tidak menimpa jawaban
            otomatis; deadline tetap berlaku.
          </p>
          {recoveryChoices.map((d) => (
            <section key={d.id}>
              <p>
                {d.label} · Soal{" "}
                {a.questions.findIndex((q) => q.id === d.questionId) + 1}
              </p>
              <p>{JSON.stringify(d.value).slice(0, 180)}</p>
              <Button
                disabled={disabled || mediaDirty}
                variant="outline"
                onClick={() => {
                  queue.importDraft(d.questionId, d.value, d.revision);
                  setRecoveryChoices((rows) =>
                    rows.filter((row) => row.id !== d.id),
                  );
                }}
              >
                Pulihkan draf ini
              </Button>
            </section>
          ))}
          {(a.recovery?.canvases || []).map((c) => (
            <section key={c.id}>
              <p>
                Canvas sudah diunggah · Soal{" "}
                {a.questions.findIndex((q) => q.id === c.question_id) + 1} ·{" "}
                {new Date(c.created_at).toLocaleString("id-ID")}
              </p>
              <Button
                disabled={disabled || mediaDirty}
                variant="outline"
                onClick={() => {
                  const current = queue.getValue(c.question_id);
                  const value =
                    current && !Array.isArray(current) ? current : { text: "" };
                  queue.change(c.question_id, { ...value, canvas_id: c.id });
                  setIndex(
                    a.questions.findIndex((q) => q.id === c.question_id),
                  );
                }}
              >
                Gunakan canvas yang diunggah
              </Button>
            </section>
          ))}
        </details>
      )}
      <div className="player-grid">
        <div className="player-main">
          <section
            className="panel stack question-reading"
            style={
              {
                "--question-font-size": `${fontSize}px`,
              } as import("react").CSSProperties
            }
          >
            <div className="question-heading">
              <h2 ref={questionHeading} tabIndex={-1}>
                Soal {index + 1}{" "}
                <span className="muted">/ {a.questions.length}</span>
              </h2>
              <span className="question-type">
                {questionTypeLabels[q.type] || q.type}
              </span>
            </div>
            <p className="muted" style={{ fontSize: ".8rem", margin: 0 }}>
              {q.points} poin · {q.required ? "Wajib dijawab" : "Opsional"}
            </p>
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
                        queue.change(item.id, {
                          ...record,
                          [o.id]: e.target.value,
                        })
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
                  Jawaban esai
                  <textarea
                    aria-describedby={`essay-length-${item.id}`}
                    dir={q.direction}
                    rows={8}
                    maxLength={100000}
                    disabled={disabled}
                    value={record.text || ""}
                    onChange={(e) =>
                      queue.change(item.id, { ...record, text: e.target.value })
                    }
                  />
                </label>
                <p id={`essay-length-${item.id}`}>
                  {essayLength(record.text || "")} karakter · minimum{" "}
                  {q.minChars}
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
                  disabled={disabled || converting || !record.canvas_id}
                  variant="outline"
                  onClick={async () => {
                    if (conversionLock.current) return;
                    conversionLock.current = true;
                    setConverting(true);
                    const seq = ++conversionSequence.current,
                      c = new AbortController();
                    conversionController.current = c;
                    const timer = setTimeout(() => c.abort(), 12000);
                    try {
                      const r = await feedbackFetch("/api/attempts/latex", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ canvas_id: record.canvas_id }),
                        signal: c.signal,
                      });
                      const j = await r.json();
                      if (
                        !mountedPlayer.current ||
                        seq !== conversionSequence.current
                      )
                        return;
                      setMessage(
                        j.error?.message ||
                          j.data?.latex ||
                          "Konversi belum tersedia.",
                      );
                    } catch {
                      if (
                        !mountedPlayer.current ||
                        seq !== conversionSequence.current
                      )
                        return;
                      setMessage(
                        "Layanan konversi belum dapat diakses. Canvas tetap tersimpan.",
                      );
                    } finally {
                      clearTimeout(timer);
                      if (
                        mountedPlayer.current &&
                        seq === conversionSequence.current
                      ) {
                        conversionLock.current = false;
                        setConverting(false);
                      }
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
                aria-label={
                  flagged.includes(item.id) ? "Hapus tanda ragu" : "Tandai ragu"
                }
                onClick={() =>
                  setFlagged((f) =>
                    f.includes(item.id)
                      ? f.filter((id) => id !== item.id)
                      : [...f, item.id],
                  )
                }
              >
                <Bookmark
                  size={16}
                  aria-hidden="true"
                  fill={flagged.includes(item.id) ? "currentColor" : "none"}
                />
                <span className="flag-label">
                  {flagged.includes(item.id)
                    ? "Hapus tanda ragu"
                    : "Tandai ragu"}
                </span>
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
        <aside className="exam-side panel" aria-label="Peta soal">
          <QuestionNavigation
            items={navigationItems}
            index={index}
            onSelect={changePage}
          />
        </aside>
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
      <Dialog
        open={transferOpen}
        onOpenChange={(open) => {
          if (!transferring) setTransferOpen(open);
        }}
        title="Siapkan perpindahan perangkat"
        description="Simpan jawaban, lalu masuk di perangkat tujuan dan pilih Lanjutkan serta ambil alih sesi. Deadline tetap berjalan. Draf yang masih offline tidak tersedia di perangkat lain."
      >
        <Button
          loading={transferring}
          disabled={
            transferring ||
            submitting ||
            remaining === 0 ||
            mediaDirty ||
            submitUncertain
          }
          onClick={() => void prepareTransfer()}
        >
          {transferring ? "Menyimpan…" : "Simpan dan periksa kesiapan"}
        </Button>
        {mediaDirty && (
          <p>Simpan canvas sebelum menyiapkan perpindahan perangkat.</p>
        )}
        <FeedbackMessage tone="info" role="status">
          {transferMessage}
        </FeedbackMessage>
      </Dialog>
      <Dialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        title="Daftar soal ujian"
        description="Pilih nomor soal. Status jawaban dan tanda ragu ditampilkan pada setiap nomor."
        onCloseAutoFocus={(event) => {
          if (mapSelection.current) {
            event.preventDefault();
            mapSelection.current = false;
            focusQuestion();
          }
        }}
      >
        <QuestionNavigation
          items={navigationItems}
          index={index}
          onSelect={(next) => {
            if (changePage(next)) {
              mapSelection.current = true;
              setMapOpen(false);
            }
          }}
        />
        {mediaDirty && (
          <FeedbackMessage tone="info" role="status">
            Simpan canvas sebelum berpindah soal.
          </FeedbackMessage>
        )}
      </Dialog>
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!submittingRef.current) setConfirm(v);
        }}
        onCloseAutoFocus={(event) => {
          if (mapSelection.current) {
            event.preventDefault();
            mapSelection.current = false;
            focusQuestion();
          }
        }}
        title="Akhiri ujian?"
        description="Jawaban wajib akan diperiksa oleh server. Jawaban yang belum diakui server harus disimpan terlebih dahulu."
      >
        <div className="submission-counts" aria-label="Ringkasan jawaban">
          <div>
            <strong>{summary.complete}</strong>
            <span>Terjawab</span>
          </div>
          <div>
            <strong>{summary.empty + summary.partial}</strong>
            <span>Belum lengkap</span>
          </div>
          <div>
            <strong>{summary.flagged}</strong>
            <span>Ditandai ragu</span>
          </div>
        </div>
        {summary.requiredMissing > 0 && (
          <p className="notice">
            {summary.requiredMissing} soal wajib belum lengkap. Pemeriksaan
            akhir tetap dilakukan server.
          </p>
        )}
        {summary.empty + summary.partial > 0 && (
          <Button
            variant="outline"
            onClick={() => {
              const next = a.questions.findIndex(
                (q) => completion(q.payload, queue.values[q.id]) !== "complete",
              );
              if (next >= 0 && changePage(next)) {
                mapSelection.current = true;
                setConfirm(false);
              }
            }}
          >
            Periksa jawaban yang belum lengkap
          </Button>
        )}
        <Button
          loading={submitting}
          disabled={
            submitting ||
            transferring ||
            reloading ||
            reloadingLocal ||
            mediaDirty
          }
          onClick={() => void submit(remaining === 0 ? "timeout" : "manual")}
        >
          {submitting ? "Memproses…" : "Ya, akhiri ujian"}
        </Button>
        <FeedbackMessage tone="info" role="status">
          {message}
        </FeedbackMessage>
      </Dialog>
      <Dialog
        open={reloadConfirm}
        onOpenChange={(v) => {
          if (!reloadLock.current) setReloadConfirm(v);
        }}
        title="Muat ulang dari server?"
        description="Jawaban akan disimpan sebelum memuat ulang status. Jika ada konflik atau canvas belum tersimpan, selesaikan terlebih dahulu. Jika perangkat lain mengambil alih, hubungi pengawas."
      >
        <Button
          disabled={
            submitting ||
            transferring ||
            reloading ||
            reloadingLocal ||
            mediaDirty
          }
          onClick={() => void reloadStatus()}
        >
          Simpan dan muat status server
        </Button>
      </Dialog>
    </main>
  );
}
