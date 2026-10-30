"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { api, useLive, type Options } from "./shared";
type Room = { id: string; name: string; capacity: number; count: number };
type Session = { id: string; name: string; starts_at: string; ends_at: string };
type Assignment = {
  id: string;
  room_id: string;
  session_id: string;
  original_supervisor_id: string;
  effective_supervisor: string | null;
  active: boolean;
  substitutions: {
    id: string;
    revoked_at: string | null;
    effective_from: string;
    effective_until: string | null;
  }[];
};
type Rooms = {
  rooms: Room[];
  sessions: Session[];
  eligible: { id: string; name: string }[];
  roster: { room_id: string; student_id: string; name: string }[];
  assignments: Assignment[];
};
type Row = {
  student_id: string;
  student: string;
  username: string;
  attempt_id: string | null;
  version: number;
  status: string;
  logged_in: boolean;
  answers: number;
  events: number;
  countable_events: number;
  deadline_at: string | null;
  room: string | null;
  room_id: string | null;
  can_act: boolean;
  score: number | null;
  pending: number;
};
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
}: {
  mode?: "rooms" | "monitor";
}) {
  const [options, setOptions] = useState<Options | null>(null),
    [exam, setExam] = useState(""),
    [rooms, setRooms] = useState<Rooms>(empty),
    [rows, setRows] = useState<Row[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
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
    [history, setHistory] = useState<unknown>(null);
  const seq = useRef(0);
  const retry = useRef<{signature:string;id:string}|null>(null);
  const load = useCallback(async () => {
    if (!exam) return;
    const s = ++seq.current;
    try {
      if (mode === "rooms") {
        const d = await api<Rooms>("/api/operations?action=rooms&exam=" + exam);
        if (s === seq.current) setRooms(d);
      } else {
        const d = await api<Row[]>(
          "/api/operations?action=monitor&exam=" + exam,
        );
        if (s === seq.current) setRows(d);
      }
    } catch (e) {
      if (s === seq.current) {
        setRows([]);
        setRooms(empty);
        setSelected([]);
        setMessage(e instanceof Error ? e.message : "Monitor gagal dimuat.");
      }
    }
  }, [exam, mode]);
  useEffect(() => {
    let active = true;
    void api<Options>("/api/operations")
      .then((d) => {
        if (active) {
          setOptions(d);
          setExam(d.exams[0]?.id || "");
        }
      })
      .catch((e) => setMessage(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useLive(load);
  function open(action: string, id = "") {
    setDialog(action);
    setTarget(id);
    setReason("");
    setConfirmation("");
    setPeople([]);
    setName("");
    setCapacity("0");
    setText("");
    setScope("exam");
  }
  async function save(input: object) {
    setBusy(true);
    setMessage("");
    try {
      const signature=JSON.stringify(input);
      if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};
      await api("/api/operations", {
        ...input,
        request_id: retry.current.id,
      });
      retry.current=null;
      setDialog("");
      setSelected([]);
      await load();
      setMessage("Perubahan tersimpan.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    let input: object;
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
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
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
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
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
        attempts: rows
          .filter((r) => selected.includes(r.student_id) && r.attempt_id)
          .map((r) => ({ id: r.attempt_id, version: r.version })),
      };
    else if (dialog === "broadcast")
      input = {
        action: dialog,
        scope,
        exam_id: exam,
        student_ids: scope === "selected" ? selected : undefined,
        message: text,
      };
    else input = { action: dialog, id: target };
    void save(input);
  }
  const actionRows=rows.filter(r=>selected.includes(r.student_id)&&r.attempt_id);
  const canAct=actionRows.length>0&&actionRows.length<=100&&actionRows.every(r=>r.can_act);
  const visible = rows.filter(
    (r) =>
      (!filter || r.status === filter) &&
      (r.student + " " + r.username + " " + (r.room || ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const shown = visible.slice((page - 1) * 25, page * 25);
  const staffName = (id: string | null) =>
    options?.staff.find((s) => s.id === id)?.name ||
    id ||
    "Di luar periode sesi";
  return (
    <section className="panel stack">
      <div className="toolbar">
        <label>
          Ujian
          <select
            value={exam}
            onChange={(e) => {
              setExam(e.target.value);
              setSelected([]);
              setPage(1);
              setRows([]);
            }}
          >
            <option value="">Pilih ujian</option>
            {options?.exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" onClick={() => void load()}>
          Muat ulang
        </Button>
      </div>
      <p role="status">{message}</p>
      {!options && <p>Memuat akses…</p>}
      {options && !options.exams.length && (
        <p>Belum ada ujian dalam cakupan Anda.</p>
      )}
      {mode === "rooms" && options?.admin && exam && (
        <>
          <div className="actions">
            <Button onClick={() => open("room_save")}>Tambah ruang</Button>
            <Button onClick={() => open("session_save")}>Tambah sesi</Button>
            <Button
              disabled={!rooms.rooms.length || !rooms.sessions.length}
              onClick={() => {
                open("assign");
                setRoom(rooms.rooms[0]?.id || "");
                setSession(rooms.sessions[0]?.id || "");
                setStaff(options.staff[0]?.id || "");
              }}
            >
              Tugaskan pengawas
            </Button>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel operasional ujian; geser untuk melihat kolom lain">
            <table>
              <thead>
                <tr>
                  <th>Ruang</th>
                  <th>Kapasitas</th>
                  <th>Peserta</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rooms.rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.capacity || "Tanpa batas"}</td>
                    <td>{r.count}</td>
                    <td>
                      <div className="actions">
                        <Button
                          variant="outline"
                          onClick={() => {
                            open("room_save", r.id);
                            setName(r.name);
                            setCapacity(String(r.capacity));
                          }}
                        >
                          Ubah
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => open("roster_add", r.id)}
                        >
                          Tambah peserta
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => open("roster_remove", r.id)}
                        >
                          Keluarkan peserta
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => open("room_delete", r.id)}
                        >
                          Hapus
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Sesi</h2>
          <ul>
            {rooms.sessions.map((s) => (
              <li key={s.id}>
                {s.name} · {new Date(s.starts_at).toLocaleString("id-ID")} —{" "}
                {new Date(s.ends_at).toLocaleString("id-ID")}{" "}
                <Button
                  variant="outline"
                  onClick={() => {
                    open("session_save", s.id);
                    setName(s.name);
                    const local = (v: string) => {
                      const d = new Date(v);
                      return new Date(
                        d.getTime() - d.getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16);
                    };
                    setStart(local(s.starts_at));
                    setEnd(local(s.ends_at));
                  }}
                >
                  Ubah
                </Button>{" "}
                <Button
                  variant="outline"
                  onClick={() => open("session_delete", s.id)}
                >
                  Hapus
                </Button>
              </li>
            ))}
          </ul>
          <h2>Penugasan</h2>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel operasional ujian; geser untuk melihat kolom lain">
            <table>
              <thead>
                <tr>
                  <th>Ruang / sesi</th>
                  <th>Pengawas asal</th>
                  <th>Efektif saat ini</th>
                  <th>Tindakan</th>
                </tr>
              </thead>
              <tbody>
                {rooms.assignments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {rooms.rooms.find((r) => r.id === a.room_id)?.name} /{" "}
                      {rooms.sessions.find((s) => s.id === a.session_id)
                        ?.name || "Sesi utama lama"}
                    </td>
                    <td>
                      {staffName(a.original_supervisor_id)} ·{" "}
                      {a.active ? "Aktif" : "Dicabut"}
                    </td>
                    <td>
                      {staffName(a.effective_supervisor)}
                      {a.substitutions
                        .filter((s) => !s.revoked_at)
                        .map((s) => (
                          <p key={s.id}>
                            Pengganti:{" "}
                            {new Date(s.effective_from).toLocaleString("id-ID")}{" "}
                            —{" "}
                            {s.effective_until
                              ? new Date(s.effective_until).toLocaleString(
                                  "id-ID",
                                )
                              : "Tanpa akhir"}
                          </p>
                        ))}
                    </td>
                    <td>
                      <div className="actions">
                        <Button
                          variant="outline"
                          disabled={!a.active}
                          onClick={() => {
                            open("substitute", a.id);
                            setStaff(
                              options.staff.find(
                                (s) => s.id !== a.original_supervisor_id,
                              )?.id || "",
                            );
                          }}
                        >
                          Tunjuk pengganti
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => open("revoke", a.id)}
                        >
                          Cabut pengganti
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!a.active}
                          onClick={() => open("unassign", a.id)}
                        >
                          Nonaktifkan tugas
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {mode === "monitor" && exam && (
        <>
          <div className="toolbar">
            <label>
              Cari siswa/ruang
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              Status
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua</option>
                {Object.entries(status).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {visible.length} peserta ·{" "}
            {rows.filter((r) => r.status === "in_progress").length} aktif ·{" "}
            {selected.length} dipilih. Diperbarui otomatis; kejadian browser
            memerlukan peninjauan petugas.
          </p>
          <div className="actions">
            <Button
              variant="outline"
              disabled={busy || !canAct}
              onClick={() => open("unlock")}
            >
              Buka kunci
            </Button>
            <Button
              variant="outline"
              disabled={busy || !canAct}
              onClick={() => open("reset")}
            >
              Reset percobaan
            </Button>
            <Button
              variant="outline"
              disabled={busy || !canAct}
              onClick={() => open("disqualify")}
            >
              Diskualifikasi
            </Button>
            <Button onClick={() => open("broadcast")}>Kirim pesan</Button>
            <Button
              variant="outline"
              onClick={() => {
                const data = JSON.stringify(visible, null, 2);
                const url = URL.createObjectURL(
                  new Blob([data], { type: "application/json" }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "monitor.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Ekspor monitor
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDialog("sent");
                void api("/api/operations?action=sent")
                  .then(setHistory)
                  .catch((e) => setMessage(e.message));
              }}
            >
              Riwayat pesan
            </Button>
          </div>
          <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel operasional ujian; geser untuk melihat kolom lain">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Pilih semua pada halaman"
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
                                  ...shown.map((r) => r.student_id),
                                ]),
                              ]
                            : selected.filter(
                                (id) => !shown.some((r) => r.student_id === id),
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
                        {r.username} · {r.room || "Belum ditempatkan"}
                      </small>
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
                    <td>{r.answers}</td>
                    <td>
                      {r.countable_events} ditinjau / {r.events} tercatat
                    </td>
                    <td>
                      {r.deadline_at
                        ? new Date(r.deadline_at).toLocaleTimeString("id-ID")
                        : "—"}
                    </td>
                    <td>
                      <Button
                        variant="outline"
                        disabled={!r.attempt_id || !r.can_act}
                        onClick={() => {
                          setHistory(null);
                          setDialog("history");
                          void api(
                            "/api/operations?action=history&id=" + r.attempt_id,
                          )
                            .then(setHistory)
                            .catch((e) => setMessage(e.message));
                        }}
                      >
                        Riwayat
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visible.length && (
            <p>Belum ada peserta dalam cakupan/filter ini.</p>
          )}
          <div className="actions">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </Button>
            <span>
              Halaman {page} / {Math.max(1, Math.ceil(visible.length / 25))}
            </span>
            <Button
              variant="outline"
              disabled={page * 25 >= visible.length}
              onClick={() => setPage(page + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!busy && !v) setDialog("");
        }}
        title={
          dialog === "reset"
            ? "Reset percobaan"
            : dialog === "broadcast"
              ? "Kirim notifikasi"
              : dialog === "history"
                ? "Riwayat kejadian dan tindakan"
                : dialog === "sent"
                  ? "Riwayat pengiriman"
                  : "Pengaturan operasional"
        }
        description="Perubahan diperiksa server dan dicatat dalam audit."
      >
        {["history", "sent"].includes(dialog) ? (
          <pre className="answer-text">
            {history ? JSON.stringify(history, null, 2) : "Memuat…"}
          </pre>
        ) : (
          <form className="stack" onSubmit={submit}>
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
                  Mulai
                  <input
                    type="datetime-local"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label>
                  Selesai
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
                  {options?.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {dialog.startsWith("roster_") && (
              <fieldset>
                <legend>Pilih peserta</legend>
                <div className="ops-choice-list">
                  {(dialog === "roster_add"
                    ? rooms.eligible.filter(
                        (p) => !rooms.roster.some((r) => r.student_id === p.id),
                      )
                    : rooms.roster
                        .filter((r) => r.room_id === target)
                        .map((r) => ({ id: r.student_id, name: r.name }))
                  ).map((p) => (
                    <label key={p.id}>
                      <input
                        type="checkbox"
                        checked={people.includes(p.id)}
                        onChange={(e) =>
                          setPeople(
                            e.target.checked
                              ? [...people, p.id]
                              : people.filter((id) => id !== p.id),
                          )
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {["reset", "unlock", "disqualify"].includes(dialog) && (
              <>
                <p>
                  {
                    rows.filter(
                      (r) =>
                        selected.includes(r.student_id) &&
                        r.attempt_id &&
                        r.can_act,
                    ).length
                  }{" "}
                  attempt berizin dipilih. Peserta tanpa attempt tidak diproses.
                  Waktu tidak ditambah; reset mempertahankan semua bukti/jawaban
                  lama.
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
                  Sasaran
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    <option value="exam">Peserta ujian ini</option>
                    <option value="selected">
                      Peserta dipilih ({selected.length})
                    </option>
                    <option value="all">
                      Semua peserta dalam cakupan saya
                    </option>
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
            <p role="status">{message}</p>
            <Button disabled={busy}>
              {busy ? "Menyimpan…" : "Konfirmasi"}
            </Button>
          </form>
        )}
      </Dialog>
    </section>
  );
}
