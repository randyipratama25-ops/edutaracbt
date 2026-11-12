"use client";
import { DeviceTransfers } from "./device-transfers";
import { MoreActions } from "../ui/more-actions";
import { FeedbackMessage } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { ListFilters, SearchField } from "../ui/list-filters";
import { matchesSearch } from "../../lib/lists/search";
import { MonitorHistory } from "./monitor-history";
import { RoomLists, RosterChoices } from "./room-lists";
import {
  roomTitles,
  roomLocalDate,
  roomInstant,
  sortRooms,
} from "../../lib/operations/rooms";
import { IncidentPanel } from "../workflow/incidents";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useLive, type Options } from "./shared";
import { z } from "zod";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { operation } from "../../lib/operations/schema";
import {
  operationOptionsSchema,
  monitorRowsSchema,
  roomsSchema,
  sentNotificationsSchema,
  monitorHistorySchema,
  operationReceipt,
  reviewTargets,
  canReview,
  monitorPage,
  type MonitorRow as Row,
} from "../../lib/operations/contracts";
type Rooms = z.infer<typeof roomsSchema>;
const status: Record<string, string> = {
  not_started: "Belum mulai",
  in_progress: "Aktif",
  submitted: "Selesai",
  graded: "Dinilai",
  time_expired: "Waktu habis",
  disqualified: "Diskualifikasi",
};
const empty: Rooms = {
  rooms: [],
  sessions: [],
  eligible: [],
  roster: [],
  assignments: [],
};
export function OperationsPanel({
  mode = "monitor",
  supervisor = false,
}: {
  mode?: "rooms" | "monitor";
  supervisor?: boolean;
}) {
  const [options, setOptions] = useState<Options | null>(null),
    [exam, setExam] = useState(""),
    [rooms, setRooms] = useState<Rooms>(empty),
    [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [monitorRoom, setMonitorRoom] = useState(""),
    [monitorSession, setMonitorSession] = useState(""),
    [listLoading, setListLoading] = useState(true),
    [listError, setListError] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [page, setPage] = useState(1),
    [dialog, setDialog] = useState(""),
    [target, setTarget] = useState(""),
    [name, setName] = useState(""),
    [capacity, setCapacity] = useState("0"),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [room, setRoom] = useState(""),
    [session, setSession] = useState(""),
    [staff, setStaff] = useState(""),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [people, setPeople] = useState<string[]>([]),
    [scope, setScope] = useState("exam"),
    [text, setText] = useState(""),
    [notificationTitle, setNotificationTitle] = useState(""),
    [priority, setPriority] = useState("info"),
    [linkExam, setLinkExam] = useState(true),
    [history, setHistory] = useState<unknown>(null);
  const seq = useRef(0),
    mounted = useRef(true),
    controllers = useRef(new Set<AbortController>()),
    lock = useRef(false),
    dialogRef = useRef(""),
    flight = useRef<{ seq: number; promise: Promise<void> } | null>(null);
  const incidentOpen = useRef(false);
  const [incidentDialog, setIncidentDialog] = useState(false);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const [optionError, setOptionError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [historyLoading, setHistoryLoading] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [lastUpdated, setLastUpdated] = useState(0),
    [refreshing, setRefreshing] = useState(false),
    [actionTargets, setActionTargets] = useState<Row[]>([]);
  const examChoice = useRef<string | null>(null);
  const optionFlight = useRef<AbortController | null>(null);
  const loadedExam = useRef(""),
    optionSeq = useRef(0);
  const historySeq = useRef(0),
    historyController = useRef<AbortController | null>(null),
    readController = useRef<AbortController | null>(null);
  const request = useCallback(async function request<T>(
    url: string,
    input: object | undefined,
    schema: z.ZodType<T>,
    controller = new AbortController(),
  ) {
    if (!mounted.current) throw Error("Permintaan dibatalkan.");
    controllers.current.add(controller);
    try {
      const value = await clientRequest(url, input, schema, controller, {
        mutation: !!input,
      });
      if (!mounted.current) throw Error("Permintaan dibatalkan.");
      return value;
    } finally {
      controllers.current.delete(controller);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current,
      sequence = seq,
      optionsSequence = optionSeq,
      historySequence = historySeq;
    return () => {
      mounted.current = false;
      sequence.current++;
      optionsSequence.current++;
      historySequence.current++;
      active.forEach((c) => c.abort());
    };
  }, []);
  const invalidateRequests = useCallback(() => {
    seq.current++;
    readController.current?.abort();
    flight.current = null;
  }, []);
  const load = useCallback(async () => {
    if (!mounted.current) return;
    if (!exam) {
      setListLoading(false);
      return;
    }
    if (dialogRef.current || incidentOpen.current || lock.current) return;
    if (flight.current?.seq === seq.current) return flight.current.promise;
    const generation = ++seq.current,
      c = new AbortController();
    readController.current = c;
    setRefreshing(true);
    setListLoading(loadedExam.current !== exam);
    const promise = (async () => {
      try {
        if (mode === "rooms") {
          const d = await request(
            "/api/operations?action=rooms&exam=" + exam,
            undefined,
            roomsSchema,
            c,
          );
          if (generation === seq.current) setRooms(sortRooms(d));
        } else {
          const d = await request(
            "/api/operations?action=monitor&exam=" + exam,
            undefined,
            monitorRowsSchema,
            c,
          );
          if (generation === seq.current) {
            setRows(d);
            setSelected((prev) =>
              prev.filter((id) => d.some((r) => r.student_id === id)),
            );
          }
        }
        if (generation === seq.current) {
          loadedExam.current = exam;
          setListError("");
          setLastUpdated(Date.now());
          setUncertain(false);
        }
      } catch (e) {
        if (mounted.current && generation === seq.current) {
          loadedExam.current = "";
          setRows([]);
          setRooms(empty);
          setSelected([]);
          setListError(
            e instanceof Error ? e.message : "Monitor gagal dimuat.",
          );
        }
      } finally {
        if (mounted.current && generation === seq.current) {
          setListLoading(false);
          setRefreshing(false);
          flight.current = null;
        }
      }
    })();
    flight.current = { seq: generation, promise };
    return promise;
  }, [exam, mode, request]);
  const selectExam = useCallback((value: string) => {
    if (examChoice.current === value) return;
    examChoice.current = value;
    invalidateRequests();
    historySeq.current++;
    historyController.current?.abort();
    dialogRef.current = "";
    setDialog("");
    setHistory(null);
    setExam(value);
    setRooms(empty);
    setMonitorRoom("");
    setMonitorSession("");
    loadedExam.current = "";
    setLastUpdated(0);
    setRefreshing(false);
    setListError("");
    setMessage("");
    setSearch("");
    setFilter("");
    setUncertain(false);
    setListLoading(!!value);
    setSelected([]);
    setPage(1);
    setRows([]);
  }, [invalidateRequests]);
  const loadOptions = useCallback(async (background = false) => {
    if (optionFlight.current || (background && (lock.current || dialogRef.current || incidentOpen.current))) return;
    const generation = ++optionSeq.current;
    const controller = new AbortController();
    optionFlight.current = controller;
    if (!background) setOptionError("");
    try {
      const d = await request("/api/operations", undefined, operationOptionsSchema, controller);
      if (generation !== optionSeq.current) return;
      // The user may open a mutation while a background read is in flight.
      if (background && (lock.current || dialogRef.current || incidentOpen.current)) return;
      setOptions(d);
      setOptionError("");
      const choice = examChoice.current;
      if (choice === null || (choice && !d.exams.some((item) => item.id === choice))) {
        selectExam(d.exams[0]?.id || "");
        if (!d.exams.length) examChoice.current = null;
      }
      if (!d.exams.length) setListLoading(false);
    } catch (error) {
      if (!mounted.current || generation !== optionSeq.current) return;
      const denied = error instanceof ClientRequestError && (error.status === 401 || error.status === 403);
      if (supervisor && denied && !lock.current && !dialogRef.current && !incidentOpen.current) {
        selectExam("");
        examChoice.current = null;
        setOptions(null);
      }
      if (!background || denied) {
        setOptionError(error instanceof Error ? error.message : "Akses belum dapat dimuat.");
        setListLoading(false);
      }
    } finally {
      if (optionFlight.current === controller) optionFlight.current = null;
    }
  }, [request, selectExam, supervisor]);
  useEffect(() => {
    void loadOptions();
    return () => {
      const controller = optionFlight.current;
      optionFlight.current = null;
      controller?.abort();
    };
  }, [loadOptions]);
  useEffect(() => {
    if (!supervisor) return;
    const refreshAccess = () => {
      if (!document.hidden) void loadOptions(true);
    };
    const timer = window.setInterval(refreshAccess, 20000);
    document.addEventListener("visibilitychange", refreshAccess);
    window.addEventListener("online", refreshAccess);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshAccess);
      window.removeEventListener("online", refreshAccess);
    };
  }, [loadOptions, supervisor]);
  useEffect(() => {
    void load();
    return invalidateRequests;
  }, [load, invalidateRequests]);
  useLive(load);
  function closeDialog() {
    if (lock.current) return;
    historySeq.current++;
    historyController.current?.abort();
    dialogRef.current = "";
    setDialog("");
    setHistory(null);
    setHistoryError("");
    setMessage("");
    void load();
  }
  async function readHistory(action: string, id = "") {
    if (lock.current) return;
    historyController.current?.abort();
    const generation = ++historySeq.current,
      c = new AbortController();
    historyController.current = c;
    invalidateRequests();
    setRefreshing(false);
    setListLoading(false);
    dialogRef.current = action;
    setDialog(action);
    setTarget(id);
    setHistory(null);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      const value = await request<unknown>(
        "/api/operations?action=" + action + (id ? "&id=" + id : ""),
        undefined,
        action === "sent" ? sentNotificationsSchema : monitorHistorySchema,
        c,
      );
      if (generation === historySeq.current) setHistory(value);
    } catch (e) {
      if (mounted.current && generation === historySeq.current)
        setHistoryError(
          e instanceof Error ? e.message : "Riwayat belum dapat dimuat.",
        );
    } finally {
      if (mounted.current && generation === historySeq.current)
        setHistoryLoading(false);
    }
  }
  const currentExam = options?.exams.find((item) => item.id === exam);
  const canOperate = !supervisor || currentExam?.attendance_confirmed === true;
  function open(action: string, id = "") {
    if (lock.current || (!canOperate && !["history", "sent"].includes(action))) return;
    invalidateRequests();
    setRefreshing(false);
    setListLoading(false);
    dialogRef.current = action;
    setDialog(action);
    setMessage("");
    setHistoryError("");
    setStart("");
    setEnd("");
    setActionTargets(reviewTargets(rows, selected).map((r) => ({ ...r })));
    setTarget(id);
    setReason("");
    setConfirmation("");
    setPeople([]);
    setName("");
    setCapacity("0");
    setText("");
    setNotificationTitle("");
    setPriority("info");
    setLinkExam(true);
    setScope("exam");
    if (mode === "rooms") {
      setRoom(rooms.rooms[0]?.id || "");
      setSession(rooms.sessions[0]?.id || "");
      setStaff(options?.staff[0]?.id || "");
      if (action === "room_save" && id) {
        const r = rooms.rooms.find((r) => r.id === id);
        if (r) {
          setName(r.name);
          setCapacity(String(r.capacity));
        }
      }
      if (action === "session_save" && id) {
        const r = rooms.sessions.find((r) => r.id === id);
        if (r) {
          setName(r.name);
          setStart(roomLocalDate(r.starts_at));
          setEnd(roomLocalDate(r.ends_at));
        }
      }
      if (action === "substitute") {
        const a = rooms.assignments.find((a) => a.id === id);
        setStaff(
          options?.staff.find((s) => s.id !== a?.original_supervisor_id)?.id ||
            "",
        );
        setStart(roomLocalDate(new Date().toISOString()));
      }
    }
  }
  async function save(raw: object) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const signature = JSON.stringify(raw);
      if (retry.current?.signature !== signature)
        retry.current = { signature, id: crypto.randomUUID() };
      const input = operation.parse({ ...raw, request_id: retry.current.id });
      const receipt = await request(
        "/api/operations",
        input,
        ["reset", "unlock", "disqualify"].includes(input.action)
          ? operationReceipt(input.action).refine(
              (value) =>
                Array.isArray(value) &&
                "attempts" in input &&
                value.length === input.attempts.length,
            )
          : operationReceipt(input.action),
      );
      retry.current = null;
      setUncertain(false);
      dialogRef.current = "";
      setDialog("");
      setSelected([]);
      lock.current = false;
      await load();
      if (mounted.current)
        setMessage(
          input.action === "broadcast" &&
            receipt &&
            typeof receipt === "object" &&
            "recipients" in receipt
            ? `Notifikasi terkirim kepada ${receipt.recipients} penerima.`
            : mode === "rooms"
              ? loadedExam.current === exam
                ? "Perubahan tersimpan. Daftar ruang dan sesi diperbarui."
                : "Perubahan tersimpan, tetapi daftar belum dapat dimuat. Muat ulang untuk memeriksa hasil."
              : "Perubahan tersimpan. Periksa pembaruan monitor.",
        );
    } catch (e) {
      if (mounted.current) {
        setMessage(
          e instanceof ClientRequestError
            ? e.message
            : e instanceof z.ZodError
              ? mode === "rooms"
                ? e.issues.map((i) => i.message).join("; ")
                : "Periksa isian, alasan, sasaran dan konfirmasi."
              : "Gagal menyimpan.",
        );
        if (
          e instanceof ClientRequestError &&
          (e.uncertain || e.status === 409)
        ) {
          setUncertain(true);
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current || uncertain || !canOperate) return;
    let input: object;
    try {
      if (dialog === "room_save")
        input = {
          action: dialog,
          exam_id: exam,
          id: target || undefined,
          name,
          capacity: Number(capacity),
        };
      else if (dialog === "session_save")
        input = {
          action: dialog,
          exam_id: exam,
          id: target || undefined,
          name,
          starts_at: roomInstant(start),
          ends_at: roomInstant(end),
        };
      else if (dialog === "assign")
        input = {
          action: dialog,
          exam_id: exam,
          room_id: room,
          session_id: session,
          supervisor_id: staff,
        };
      else if (dialog === "substitute")
        input = {
          action: dialog,
          id: target,
          supervisor_id: staff,
          starts_at: roomInstant(start),
          ends_at: roomInstant(end),
        };
      else if (dialog.startsWith("roster_"))
        input = {
          action: dialog,
          id: target,
          exam_id: exam,
          student_ids: people,
        };
      else if (["reset", "unlock", "disqualify"].includes(dialog))
        input = {
          action: dialog,
          reason,
          confirmation,
          attempts: actionTargets.map((r) => ({
            id: r.attempt_id,
            version: r.version,
          })),
        };
      else if (dialog === "broadcast")
        input = {
          action: dialog,
          scope,
          exam_id: exam,
          student_ids: scope === "selected" ? selected : undefined,
          message: text,
          title: notificationTitle,
          priority,
          link_exam: linkExam && scope !== "all",
        };
      else input = { action: dialog, id: target };
      if (
        ["reset", "unlock", "disqualify"].includes(dialog) &&
        !canReview(actionTargets, dialog)
      )
        throw Error("Pilihan tindakan tidak valid. Muat ulang monitor.");
      void save(input);
    } catch {
      setMessage("Periksa isian, waktu, pilihan peserta dan jenis tindakan.");
    }
  }
  const rosterIds = new Set(rooms.roster.map((r) => r.student_id));
  const actionRows = reviewTargets(rows, selected);
  const monitorRooms = [...new Set(rows.flatMap((r) => r.room ? [r.room] : []))].sort();
  const monitorSessions = [...new Set(rows.flatMap((r) => r.session ? [r.session] : []))].sort();
  const timeOf = (value?: string | null) => value
    ? new Date(value).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB"
    : "Belum tersedia";
  const visible = (listLoading || listError ? [] : rows).filter(
    (r) =>
      (!filter || (filter === "integrity" ? (r.open_integrity ?? 0) > 0 : r.status === filter)) &&
      (!monitorRoom || r.room === monitorRoom) &&
      (!monitorSession || r.session === monitorSession) &&
      matchesSearch(
        r.student + " " + r.username + " " + (r.room || "") + " " + (r.watermark_code || ""),
        search,
      ),
  );
  const currentPage = monitorPage(page, visible.length);
  useEffect(() => {
    if (!listLoading && !listError && page !== currentPage)
      setPage(currentPage);
  }, [listLoading, listError, page, currentPage]);
  const shown = visible.slice((currentPage - 1) * 25, currentPage * 25);
  return (
    <section
      className={
        "panel stack " + (mode === "rooms" ? "rooms-page" : "monitor-page")
      }
      aria-label={
        mode === "monitor"
          ? "Monitor peserta ujian"
          : "Pengaturan ruang dan sesi"
      }
      aria-busy={busy}
    >
      <fieldset
        className="monitor-controls stack"
        disabled={busy || incidentDialog}
      >
        <div className="toolbar">
          <label>
            Ujian
            <select
              value={exam}
              onChange={(e) => selectExam(e.target.value)}
            >
              <option value="">Pilih ujian</option>
              {options?.exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}{supervisor && e.pin_configured !== undefined ? (e.pin_configured ? " · PIN aktif" : " · PIN belum diatur") : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={refreshing || (!exam && !supervisor) || !!dialog}
            onClick={() => { if (supervisor) void loadOptions(true); void load(); }}
          >
            Muat ulang
          </Button>
        </div>
        {supervisor && currentExam && (
          <div className="supervision-exam-status" role="status">
            <span className="supervision-badge" data-confirmed={canOperate}>
              {canOperate ? "Kehadiran dikonfirmasi" : "Menunggu konfirmasi kehadiran"}
            </span>
            {currentExam.pin_configured !== undefined && (
              <span className="supervision-badge">PIN {currentExam.pin_configured ? "aktif" : "belum diatur"}</span>
            )}
            {!canOperate && <p>Admin atau panitia ujian perlu mengonfirmasi kehadiran Anda sebelum tindakan dapat digunakan.</p>}
          </div>
        )}
        <FeedbackMessage tone="info" role="status">
          {message}
        </FeedbackMessage>
        {!options && !optionError && (
          <FeedbackMessage tone="loading" role="status">
            Memuat akses…
          </FeedbackMessage>
        )}
        {optionError && (
          <div role="alert">
            <p>{optionError}</p>
            <Button onClick={() => void loadOptions()}>Coba muat akses</Button>
          </div>
        )}
        {exam && (
          <p className="muted monitor-freshness">
            {refreshing
              ? mode === "rooms"
                ? "Memperbarui ruang dan sesi…"
                : "Memperbarui monitor…"
              : lastUpdated
                ? "Pembaruan terakhir: " + timeOf(new Date(lastUpdated).toISOString())
                : "Menunggu pembaruan"}{" "}
            · Pembaruan otomatis dijeda saat dialog dibuka.
          </p>
        )}
        {mode === "rooms" && listError && (
          <FeedbackMessage tone="error" role="alert">
            {listError}
          </FeedbackMessage>
        )}
        {options && !options.exams.length && (
          <p>Belum ada ujian dalam cakupan Anda.</p>
        )}
        {mode === "rooms" && listLoading && exam && (
          <FeedbackMessage tone="loading" role="status">
            Memuat ruang, sesi dan penugasan…
          </FeedbackMessage>
        )}
        {mode === "rooms" &&
          options?.admin &&
          exam &&
          !listLoading &&
          !listError && (
            <RoomLists
              key={exam}
              value={rooms}
              staff={options.staff}
              disabled={busy || uncertain || refreshing}
              onOpen={open}
            />
          )}
        {mode === "monitor" && exam && (
          <>
            <DeviceTransfers key={`transfers:${exam}`} exam={exam} canOperate={canOperate} supervisor={supervisor} />
            <IncidentPanel
              key={exam}
              exam={exam}
              rows={listLoading || listError ? [] : rows}
              admin={!!options?.admin}
              canOperate={canOperate}
              supervisor={supervisor}
              onChanged={load}
              paused={busy || !!dialog || listLoading || !!listError}
              onDialogChange={(open) => {
                incidentOpen.current = open;
                setIncidentDialog(open);
                if (open) {
                  invalidateRequests();
                  setRefreshing(false);
                }
              }}
            />
            <ListFilters
              label="peserta ujian"
              active={
                [search && "Pencarian", filter && "Status", monitorRoom && "Ruang", monitorSession && "Sesi"].filter(
                  Boolean,
                ) as string[]
              }
              onReset={() => {
                setSearch("");
                setFilter("");
                setMonitorRoom("");
                setMonitorSession("");
                setSelected([]);
                setPage(1);
              }}
              total={visible.length}
              loading={listLoading}
              error={listError}
            >
              <SearchField
                label="Cari siswa, ruang, atau kode sesi"
                value={search}
                maxLength={150}
                onChange={(value) => {
                  setSearch(value);
                  setSelected([]);
                  setPage(1);
                }}
              />
              <label>
                Status
                <select
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setSelected([]);
                    setPage(1);
                  }}
                >
                  <option value="">Semua</option>
                  <option value="integrity">Perlu tinjauan integritas</option>
                  {Object.entries(status).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>Ruang
                <select value={monitorRoom} onChange={(event) => { setMonitorRoom(event.target.value); setSelected([]); setPage(1); }}>
                  <option value="">Semua ruang</option>
                  {monitorRooms.map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
              <label>Sesi
                <select value={monitorSession} onChange={(event) => { setMonitorSession(event.target.value); setSelected([]); setPage(1); }}>
                  <option value="">Semua sesi</option>
                  {monitorSessions.map((name) => <option key={name}>{name}</option>)}
                </select>
              </label>
            </ListFilters>
            <p>
              {visible.length} peserta ·{" "}
              {listLoading || listError
                ? "—"
                : rows.filter((r) => r.status === "in_progress").length}{" "}
              aktif · {selected.length} / 500 dipilih. Pilihan dibersihkan saat
              filter berubah.
            </p>
            {selected.length > 0 && canOperate && !canReview(actionRows, "reset") && (
              <p className="muted">
                Tindakan memerlukan 1–100 sesi ujian yang dapat Anda kelola.
                Buka kunci hanya untuk diskualifikasi; diskualifikasi hanya
                untuk sesi aktif.
              </p>
            )}
            <div className="actions">
              <Button
                disabled={!canOperate || listLoading || !!listError || uncertain}
                onClick={() => open("broadcast")}
              >
                Kirim notifikasi
              </Button>
              <MoreActions>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    listLoading ||
                    !!listError ||
                    uncertain ||
                    !canOperate || !canReview(actionRows, "unlock")
                  }
                  onClick={() => open("unlock")}
                >
                  Buka kunci
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    listLoading ||
                    !!listError ||
                    uncertain ||
                    !canOperate || !canReview(actionRows, "reset")
                  }
                  onClick={() => open("reset")}
                >
                  Reset percobaan
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    listLoading ||
                    !!listError ||
                    uncertain ||
                    !canOperate || !canReview(actionRows, "disqualify")
                  }
                  onClick={() => open("disqualify")}
                >
                  Diskualifikasi
                </Button>
                <Button
                  variant="outline"
                  disabled={listLoading || !!listError || !visible.length}
                  onClick={() => {
                    if (listLoading || listError) return;
                    const data = JSON.stringify(visible, null, 2);
                    const url = URL.createObjectURL(
                      new Blob([data], { type: "application/json" }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "monitor.json";
                    document.body.append(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  Ekspor monitor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void readHistory("sent")}
                >
                  Riwayat pesan
                </Button>
              </MoreActions>
            </div>
            {supervisor && visible.length > 0 && <p className="muted supervision-table-hint">Geser tabel ke samping untuk melihat semua kolom.</p>}
            <div
              className="table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Tabel operasional ujian; geser untuk melihat kolom lain"
            >
              <table>
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Pilih semua pada halaman"
                        disabled={listLoading || !!listError || uncertain}
                        checked={
                          shown.length > 0 &&
                          shown.every((r) => selected.includes(r.student_id))
                        }
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [
                                  ...new Set([
                                    ...selected,
                                    ...shown
                                      .map((r) => r.student_id)
                                      .slice(0, 500 - selected.length),
                                  ]),
                                ]
                              : selected.filter(
                                  (id) =>
                                    !shown.some((r) => r.student_id === id),
                                ),
                          )
                        }
                      />
                    </th>
                    <th>Siswa / ruang</th>
                    <th>Status</th>
                    <th>Jawaban</th>
                    <th>Insiden</th>
                    <th>Deadline</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.student_id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={"Pilih " + r.student}
                          disabled={
                            listLoading ||
                            !!listError ||
                            uncertain ||
                            (!selected.includes(r.student_id) &&
                              selected.length >= 500)
                          }
                          checked={selected.includes(r.student_id)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, r.student_id]
                                : selected.filter((id) => id !== r.student_id),
                            )
                          }
                        />
                      </td>
                      <td>
                        {r.student}
                        <br />
                        <small>
                          {r.username} · {r.room || "Belum ditempatkan"}{r.session && ` · ${r.session}`}
                        </small>
                        {r.watermark_code && <small className="block">Kode sesi {r.watermark_code}</small>}
                      </td>
                      <td>
                        {status[r.status] || r.status}
                        <br />
                        <small>
                          {r.logged_in
                            ? "Sesi login tersedia"
                            : "Belum login / sesi berakhir"}
                        </small>
                      </td>
                      <td>{r.answers}<br /><small>Simpan terakhir · {timeOf(r.last_saved_at)}</small></td>
                      <td>
                        {r.open_integrity ?? 0} perlu ditinjau / {r.events} kejadian
                        <br /><small>{r.last_seen_at && lastUpdated - Date.parse(r.last_seen_at) > 45000 && r.status === "in_progress"
                          ? "Perlu cek koneksi" : "Kontak server"} · {timeOf(r.last_seen_at)}</small>
                      </td>
                      <td>
                        {r.deadline_at
                          ? new Date(r.deadline_at).toLocaleString("id-ID", {
                              timeZone: "Asia/Jakarta",
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }) + " WIB"
                          : "—"}
                      </td>
                      <td>
                        <Button
                          variant="outline"
                          disabled={!r.attempt_id || !(r.can_view_history ?? r.can_act)}
                          onClick={() =>
                            void readHistory("history", r.attempt_id!)
                          }
                        >
                          Riwayat
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!listLoading && !listError && !visible.length && (
              <p>
                {search || filter || monitorRoom || monitorSession
                  ? "Tidak ada peserta yang cocok. Ubah pencarian atau reset filter."
                  : "Belum ada peserta dalam penugasan ujian ini. Hubungi Admin jika daftar belum sesuai."}
              </p>
            )}
            <div className="actions">
              <Button
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Sebelumnya
              </Button>
              <span>
                Halaman {currentPage} /{" "}
                {Math.max(1, Math.ceil(visible.length / 25))}
              </span>
              <Button
                variant="outline"
                disabled={currentPage * 25 >= visible.length}
                onClick={() => setPage(currentPage + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </>
        )}
      </fieldset>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v) closeDialog();
        }}
        title={
          roomTitles[dialog] ||
          (dialog === "reset"
            ? "Reset percobaan"
            : dialog === "unlock"
              ? "Buka kunci peserta"
              : dialog === "disqualify"
                ? "Diskualifikasi peserta"
                : dialog === "broadcast"
                  ? "Kirim notifikasi"
                  : dialog === "history"
                    ? "Riwayat kejadian dan tindakan"
                    : dialog === "sent"
                      ? "Riwayat pengiriman"
                      : "Pengaturan operasional")
        }
        className={mode === "rooms" ? "rooms-dialog" : supervisor ? "monitor-dialog supervision-dialog" : "monitor-dialog"}
        description={{
          reset: "Peserta dapat memulai percobaan baru dengan batas waktu ujian yang berlaku.",
          unlock: "Buka kunci peserta yang didiskualifikasi agar sesi dapat dilanjutkan jika waktu masih tersedia.",
          disqualify: "Akhiri percobaan aktif peserta terpilih. Alasan dicatat dalam riwayat.",
          broadcast: "Pilih penerima dan tulis pesan yang akan muncul di notifikasi siswa.",
          history: "Tinjau kronologi kejadian dan tindakan yang tercatat untuk peserta.",
          sent: "Tinjau pesan terkirim dan status baca penerima.",
        }[dialog] || "Periksa sasaran dan rincian tindakan sebelum menyimpan."}
      >
        {dialog === "sent" || dialog === "history" ? (
          <div className="stack" aria-busy={historyLoading}>
            {historyLoading ? (
              <FeedbackMessage tone="loading" role="status">
                Memuat riwayat…
              </FeedbackMessage>
            ) : historyError ? (
              <div role="alert">
                <p>{historyError}</p>
                <Button onClick={() => void readHistory(dialog, target)}>
                  Coba muat riwayat
                </Button>
              </div>
            ) : dialog === "sent" ? (
              <SentNotifications value={history} />
            ) : (
              <MonitorHistory
                value={history}
                attempt={target}
                active={rows.some((r) => r.attempt_id === target && r.status === "in_progress")}
                canOperate={canOperate && rows.some((r) => r.attempt_id === target && r.can_act)}
              />
            )}
          </div>
        ) : (
          <ValidatedForm className="stack" onSubmit={submit} aria-busy={busy}>
            <fieldset
              className="monitor-controls stack"
              disabled={busy || uncertain || !canOperate}
            >
              {mode === "rooms" && target && (
                <p className="rooms-target">
                  Sasaran:{" "}
                  {rooms.rooms.find((r) => r.id === target)?.name ||
                    rooms.sessions.find((r) => r.id === target)?.name ||
                    (() => {
                      const a = rooms.assignments.find((a) => a.id === target);
                      return a
                        ? [
                            rooms.rooms.find((r) => r.id === a.room_id)?.name ||
                              "Ruang",
                            rooms.sessions.find((s) => s.id === a.session_id)
                              ?.name || "Sesi utama lama",
                          ].join(" / ")
                        : target;
                    })()}
                </p>
              )}
              {["room_save", "session_save"].includes(dialog) && (
                <label>
                  Nama
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
              )}
              {dialog === "room_save" && (
                <label>
                  Kapasitas (0 tanpa batas)
                  <input
                    required
                    type="number"
                    min={0}
                    max={10000}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                  />
                </label>
              )}
              {["session_save", "substitute"].includes(dialog) && (
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
                    Selesai (WIB)
                    <input
                      type="datetime-local"
                      required
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </>
              )}
              {dialog === "assign" && (
                <>
                  <label>
                    Ruang
                    <select
                      required
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                    >
                      {rooms.rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sesi
                    <select
                      required
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                    >
                      {rooms.sessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {["assign", "substitute"].includes(dialog) && (
                <label>
                  Pengawas
                  <select
                    required
                    value={staff}
                    onChange={(e) => setStaff(e.target.value)}
                  >
                    <option value="">Pilih pengawas</option>
                    {options?.staff
                      .filter(
                        (s) =>
                          dialog !== "substitute" ||
                          s.id !==
                            rooms.assignments.find((a) => a.id === target)
                              ?.original_supervisor_id,
                      )
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.role})
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {dialog.startsWith("roster_") && (
                <RosterChoices
                  key={dialog + target}
                  choices={
                    dialog === "roster_add"
                      ? rooms.eligible.filter((p) => !rosterIds.has(p.id))
                      : rooms.roster
                          .filter((r) => r.room_id === target)
                          .map((r) => ({ id: r.student_id, name: r.name }))
                  }
                  selected={people}
                  onChange={setPeople}
                />
              )}
              {["reset", "unlock", "disqualify"].includes(dialog) && (
                <>
                  <p>
                    {actionTargets.length} sesi ujian dipilih. Peserta yang
                    belum mulai tidak diproses. Waktu tidak ditambah; reset
                    mempertahankan semua bukti/jawaban lama.
                  </p>
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
                  <label>
                    Ketik KONFIRMASI
                    <input
                      required
                      pattern="KONFIRMASI"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                </>
              )}
              {dialog === "broadcast" && (
                <>
                  <label>
                    Judul notifikasi
                    <input
                      required
                      maxLength={120}
                      value={notificationTitle}
                      onChange={(e) => setNotificationTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Prioritas
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="info">Informasi</option>
                      <option value="important">Penting</option>
                    </select>
                  </label>
                  {scope !== "all" && (
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={linkExam}
                        onChange={(e) => setLinkExam(e.target.checked)}
                      />
                      Sertakan tombol Lihat ujian terkait
                    </label>
                  )}
                  <p className="muted">
                    Tindakan hanya mengarahkan siswa ke kartu ujian di halaman
                    yang sama. Dibaca bukan bukti tindakan selesai. Jangan
                    sertakan PIN atau jawaban.
                  </p>
                  <label>
                    Sasaran
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="exam">Peserta ujian ini</option>
                      <option value="selected" disabled={!selected.length}>
                        Peserta dipilih ({selected.length})
                      </option>
                      {!supervisor && <option value="all">Semua peserta dalam cakupan saya</option>}
                    </select>
                  </label>
                  <label>
                    Pesan
                    <textarea
                      required
                      maxLength={2000}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                </>
              )}
              {["room_delete", "session_delete", "unassign", "revoke"].includes(
                dialog,
              ) && (
                <p>
                  Konfirmasi{" "}
                  {dialog === "revoke"
                    ? "pencabutan pengganti"
                    : dialog === "unassign"
                      ? "penonaktifan tugas"
                      : "penghapusan data kosong"}
                  . Riwayat yang masih dirujuk tidak dihapus.
                </p>
              )}
              <FeedbackMessage tone="info" role="status">
                {message}
              </FeedbackMessage>
              <div className={supervisor ? "actions supervision-dialog-actions" : undefined}>
              {supervisor && <Button type="button" variant="outline" onClick={closeDialog} disabled={busy}>Batal</Button>}
              <Button
                loading={busy}
                disabled={
                  busy ||
                  uncertain ||
                  (dialog.startsWith("roster_") && !people.length) ||
                  (dialog === "broadcast" &&
                    scope === "selected" &&
                    !selected.length)
                }
              >
                {busy ? "Menyimpan…" : supervisor ? ({
                  reset: "Reset percobaan",
                  unlock: "Buka kunci",
                  disqualify: "Diskualifikasi peserta",
                  broadcast: "Kirim notifikasi",
                }[dialog] || "Konfirmasi") : "Konfirmasi"}
              </Button>
              </div>
            </fieldset>
            {uncertain && (
              <div role="alert">
                <p>
                  Hasil tindakan perlu diperiksa sebelum mengirim lagi. Tutup
                  dialog dan muat ulang daftar; untuk notifikasi, periksa
                  riwayat pengiriman.
                </p>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Tutup dan periksa ulang
                </Button>
              </div>
            )}
          </ValidatedForm>
        )}
      </Dialog>
    </section>
  );
}

function SentNotifications({ value }: { value: unknown }) {
  if (!Array.isArray(value))
    return (
      <FeedbackMessage tone="loading" role="status">
        Memuat riwayat pengiriman…
      </FeedbackMessage>
    );
  const rows = sentNotificationsSchema.parse(value);
  return (
    <div className="stack">
      {!rows.length && <p>Belum ada pengiriman.</p>}
      {rows.map((m) => (
        <article className="notification-card" key={m.id}>
          <h2>{m.title || "Pesan petugas"}</h2>
          <p>
            {m.priority === "important" ? "Penting" : "Informasi"} ·{" "}
            {new Date(m.created_at).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB
          </p>
          <p className="answer-text">{m.message}</p>
          <p>
            {m.receipts?.filter((r) => !!r.read_at).length || 0} /{" "}
            {m.receipts?.length || 0} penerima berizin sudah membaca.
          </p>
          <details>
            <summary>Status penerima</summary>
            <ul>
              {m.receipts?.map((r, i) => (
                <li key={i}>
                  {r.student} · {r.read_at ? "Sudah dibaca" : "Belum dibaca"}
                </li>
              ))}
            </ul>
          </details>
        </article>
      ))}
      <p className="muted">
        Status dibaca tidak membuktikan tindakan sudah diselesaikan.
      </p>
    </div>
  );
}
