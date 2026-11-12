"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { clientRequest } from "../../lib/client/request";
import {
  committeeResponse,
  committeeDate,
  committeeReceipt,
  type CommitteeData,
  type CommitteeMutation,
} from "../../lib/committee/contracts";
import { matchesSearch } from "../../lib/lists/search";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { ListFilters, SearchField } from "../ui/list-filters";

const endpoint = "/api/committee";
const pageSize = 12;
const dayFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "full",
  timeZone: "UTC",
});
type Person = { id: string; name: string };
type Replace = Extract<
  CommitteeMutation,
  { action: "replace_committee" | "replace_supervisor" }
>;
type Change = {
  label: string;
  people: Person[];
  input:
    | Omit<Extract<Replace, { action: "replace_committee" }>, "profile_id">
    | Omit<Extract<Replace, { action: "replace_supervisor" }>, "profile_id">;
};

function supervisorCandidates(
  data: CommitteeData,
  item: CommitteeData["schedule"][number],
) {
  return data.supervisors.filter(
    ({ id }) => id !== item.original_id && id !== item.supervisor_id,
  );
}

function PersonForm({
  label,
  action,
  people,
  disabled,
  onSubmit,
}: {
  label: string;
  action: string;
  people: Person[];
  disabled: boolean;
  onSubmit: (id: string) => void;
}) {
  const [person, setPerson] = useState("");
  const selected = people.some(({ id }) => id === person) ? person : "";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && !disabled) onSubmit(selected);
  }
  return (
    <form className="committee-person-form" onSubmit={submit}>
      <label>
        {label}
        <select
          value={selected}
          onChange={(event) => setPerson(event.target.value)}
          required
          disabled={disabled || !people.length}
        >
          <option value="">Pilih petugas</option>
          {people.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={disabled || !selected}>
        {action}
      </Button>
    </form>
  );
}

export function CommitteePanel({ admin }: { admin: boolean }) {
  const [date, setDate] = useState("");
  const [dateDraft, setDateDraft] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{
    date: string;
    revision: number;
    data?: CommitteeData;
    deadline?: number;
    error?: string;
  }>();
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const [change, setChange] = useState<Change>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [room, setRoom] = useState("");
  const [page, setPage] = useState(1);
  const mutation = useRef<AbortController | null>(null);
  const current = loaded?.date === date ? loaded : undefined;
  const data = current?.data;
  const loading = current?.revision !== revision;
  const disabled = busy || loading;

  useEffect(() => {
    const controller = new AbortController();
    let currentRequest = true;
    const query = date ? "?date=" + encodeURIComponent(date) : "";
    void clientRequest(
      endpoint + query,
      undefined,
      committeeResponse,
      controller,
      {
        timeoutMs: 15000,
      },
    )
      .then((data) => {
        if (!currentRequest) return;
        setLoaded({
          date,
          revision,
          data,
          deadline: admin
            ? undefined
            : Date.now() +
              Date.parse(data.expires_at) -
              Date.parse(data.server_now),
        });
        if (!admin)
          setChange((previous) => {
            if (
              !previous ||
              data.status !== "confirmed" ||
              previous.input.action !== "replace_supervisor"
            )
              return undefined;
            const target = previous.input;
            const row = data.schedule.find(
              (item) =>
                item.id === target.id &&
                item.substitution_id === target.substitution_id &&
                item.can_replace,
            );
            if (!row) return undefined;
            const people = supervisorCandidates(data, row);
            return people.length
              ? { ...previous, label: row.supervisor_name, people }
              : undefined;
          });
      })
      .catch((error: unknown) => {
        if (currentRequest) {
          if (!admin) setChange(undefined);
          setLoaded({
            date,
            revision,
            error:
              error instanceof Error
                ? error.message
                : "Jadwal belum dapat dimuat.",
          });
        }
      });
    return () => {
      currentRequest = false;
      controller.abort();
    };
  }, [admin, date, revision]);
  useEffect(
    () => () => {
      const active = mutation.current;
      mutation.current = null;
      active?.abort();
    },
    [],
  );

  const refresh = useEffectEvent(() => {
    if (!document.hidden && !mutation.current && !loading)
      setRevision((value) => value + 1);
  });
  useEffect(() => {
    if (admin) return;
    const timer = window.setInterval(() => refresh(), 20000);
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", visible);
    };
  }, [admin]);
  const deadline = current?.deadline;
  useEffect(() => {
    if (deadline === undefined) return;
    const expire = () => {
      setLoaded(undefined);
      setChange(undefined);
      setRevision((value) => value + 1);
    };
    const visible = () => {
      if (!document.hidden && Date.now() >= deadline) expire();
    };
    const timer = window.setTimeout(expire, Math.max(0, deadline - Date.now()));
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [deadline]);

  function resetFilters() {
    setSearch("");
    setFilter("");
    setRoom("");
    setPage(1);
  }
  function chooseDate(value: string) {
    setDateDraft(value);
    if (!committeeDate.safeParse(value).success || value === date) return;
    setNotice(undefined);
    resetFilters();
    setDate(value);
  }
  async function save(input: CommitteeMutation) {
    if (
      disabled ||
      mutation.current ||
      !data ||
      (!admin &&
        (data.status !== "confirmed" ||
          deadline === undefined ||
          Date.now() >= deadline))
    )
      return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(true);
    setNotice(undefined);
    try {
      await clientRequest(endpoint, input, committeeReceipt, controller, {
        mutation: true,
        timeoutMs: 15000,
      });
      if (mutation.current === controller)
        setNotice({ text: "Perubahan tersimpan." });
    } catch (error) {
      if (mutation.current === controller)
        setNotice({
          error: true,
          text:
            error instanceof Error
              ? error.message
              : "Perubahan belum dapat dipastikan.",
        });
    } finally {
      if (mutation.current === controller) {
        mutation.current = null;
        setChange(undefined);
        setRevision((value) => value + 1);
        setBusy(false);
      }
    }
  }

  const clock =
    data &&
    new Intl.DateTimeFormat("id-ID", {
      timeZone: data.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  const dutyIds = new Set(
    data?.duties
      .filter((duty) => !duty.replaced_at)
      .map((duty) => duty.profile_id),
  );
  const available = data?.candidates.filter(({ id }) => !dutyIds.has(id)) ?? [];
  const duties = data?.duties ?? [];
  const schedule = data?.schedule ?? [];
  const matchesStatus = (status: string) => !filter || filter === status;
  const matchingDuties = duties.filter(
    (d) =>
      matchesStatus(
        d.replaced_at ? "replaced" : d.confirmed_at ? "present" : "pending",
      ) && matchesSearch([d.name, d.replaces].join(" "), search),
  );
  const rooms = [...new Set(schedule.map((item) => item.room))].sort((a, b) =>
    a.localeCompare(b, "id"),
  );
  const selectedRoom = rooms.includes(room) ? room : "";
  const present = schedule.filter((item) => item.confirmed_at).length;
  const matchingSchedule = schedule.filter(
    (s) =>
      (!selectedRoom || s.room === selectedRoom) &&
      matchesStatus(s.confirmed_at ? "present" : "pending") &&
      matchesSearch(
        [s.exam, s.room, s.session, s.supervisor_name, s.original_name].join(
          " ",
        ),
        search,
      ),
  );
  const total = admin ? matchingDuties.length : matchingSchedule.length;
  const rowCount = admin ? duties.length : schedule.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * pageSize;
  const showList = data && (admin || data.status === "confirmed");
  const dateIncomplete =
    admin &&
    dateDraft !== undefined &&
    !committeeDate.safeParse(dateDraft).success;

  return (
    <section
      className="committee-page stack"
      aria-label={admin ? "Penugasan panitia" : "Tugas hari ini"}
    >
      <div className="panel committee-toolbar" aria-busy={loading}>
        {admin && (
          <label>
            Tanggal tugas
            <input
              type="date"
              value={dateDraft ?? data?.date ?? ""}
              disabled={busy}
              onChange={(event) => chooseDate(event.target.value)}
            />
          </label>
        )}
        <div className="actions">
          {admin && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDateDraft(undefined);
                setDate("");
                resetFilters();
                setNotice(undefined);
                setRevision((value) => value + 1);
              }}
            >
              Hari ini
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setNotice(undefined);
              setRevision((value) => value + 1);
            }}
          >
            Muat ulang
          </Button>
        </div>
      </div>
      {dateIncomplete && (
        <p className="muted">
          Pilih tanggal lengkap. Daftar masih menampilkan tanggal sebelumnya.
        </p>
      )}
      {notice && (
        <p className="notice" role={notice.error ? "alert" : "status"}>
          {notice.text}
        </p>
      )}
      {loading && (
        <p role="status">
          {data ? "Memperbarui daftar…" : "Memuat tugas panitia…"}
        </p>
      )}
      {!loading && current?.error && (
        <p className="notice" role="alert">
          {current.error}
        </p>
      )}
      {data && admin && (
        <p className="muted">
          {dayFormat.format(new Date(data.date))} · {data.timezone}
        </p>
      )}
      {data && admin && data.date >= data.today && (
        <div className="panel stack">
          <h2>Tambah penugasan</h2>
          {available.length ? (
            <PersonForm
              key={data.date}
              label="Guru atau Panitia Ujian"
              action="Tambahkan tugas"
              people={available}
              disabled={disabled || dateIncomplete}
              onSubmit={(profile_id) =>
                void save({ action: "assign", profile_id, date: data.date })
              }
            />
          ) : (
            <p>
              Belum ada petugas yang tersedia untuk ditugaskan pada tanggal ini.
            </p>
          )}
        </div>
      )}
      {data && !admin && (
        <div className="panel stack committee-day">
          <div className="committee-day-heading">
            <div>
              <h2>Tugas hari ini</h2>
              <p className="muted">
                {dayFormat.format(new Date(data.date))} · {data.timezone}
              </p>
            </div>
            {data.status === "confirmed" && (
              <span className="committee-status">
                Kehadiran panitia terkonfirmasi
              </span>
            )}
          </div>
          {data.status === "confirmed" && (
            <dl className="committee-summary">
              <div>
                <dt>Penugasan pengawas</dt>
                <dd>{schedule.length}</dd>
              </div>
              <div>
                <dt>Hadir</dt>
                <dd>{present}</dd>
              </div>
              <div>
                <dt>Menunggu konfirmasi</dt>
                <dd>{schedule.length - present}</dd>
              </div>
            </dl>
          )}
        </div>
      )}
      {data && !admin && data.status !== "confirmed" && (
        <div className="panel stack">
          <h2>
            {data.status === "pending"
              ? "Menunggu konfirmasi Admin"
              : "Belum ada tugas hari ini"}
          </h2>
          <p>
            {data.status === "pending"
              ? "Jadwal pengawas akan terbuka setelah Admin mengonfirmasi kehadiran Anda."
              : "Hubungi Admin jika Anda dijadwalkan sebagai Panitia Ujian hari ini."}
          </p>
        </div>
      )}
      {showList && (
        <>
          <h2>{admin ? "Daftar Panitia Ujian" : "Jadwal pengawas hari ini"}</h2>
          {rowCount > 0 && (
            <ListFilters
              label={admin ? "panitia" : "jadwal pengawas"}
              total={total}
              active={[
                ...(search ? ["Pencarian"] : []),
                ...(filter ? ["Kehadiran"] : []),
                ...(selectedRoom ? ["Ruang"] : []),
              ]}
              onReset={resetFilters}
            >
              <SearchField
                label={
                  admin
                    ? "Cari nama panitia"
                    : "Cari ujian, ruang, atau pengawas"
                }
                value={search}
                onChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
              />
              <label>
                Status kehadiran
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Semua status</option>
                  <option value="pending">Menunggu konfirmasi</option>
                  <option value="present">Hadir</option>
                  {admin && <option value="replaced">Digantikan</option>}
                </select>
              </label>
              {!admin && rooms.length > 1 && (
                <label>
                  Ruang
                  <select
                    value={selectedRoom}
                    onChange={(event) => {
                      setRoom(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">Semua ruang</option>
                    {rooms.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </ListFilters>
          )}
          {!rowCount && (
            <p className="panel">
              {admin
                ? "Belum ada panitia pada tanggal ini."
                : "Belum ada jadwal pengawas hari ini."}
            </p>
          )}
          <div className="committee-grid">
            {admin
              ? matchingDuties.slice(start, start + pageSize).map((duty) => (
                  <article className="panel stack committee-card" key={duty.id}>
                    <h3>{duty.name}</h3>
                    <span className="committee-status">
                      {duty.replaced_at
                        ? "Digantikan"
                        : duty.confirmed_at
                          ? "Hadir"
                          : "Menunggu konfirmasi"}
                    </span>
                    {duty.replaces && <p>Menggantikan {duty.replaces}</p>}
                    {duty.confirmed_at && (
                      <p className="muted">
                        Dikonfirmasi{" "}
                        {clock?.format(new Date(duty.confirmed_at))}
                      </p>
                    )}
                    {!duty.replaced_at && (
                      <div className="actions">
                        {!duty.confirmed_at && data.date === data.today && (
                          <Button
                            type="button"
                            disabled={disabled || dateIncomplete}
                            onClick={() =>
                              void save({
                                action: "confirm_committee",
                                id: duty.id,
                              })
                            }
                          >
                            Konfirmasi hadir
                          </Button>
                        )}
                        {data.date >= data.today && available.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={disabled || dateIncomplete}
                            onClick={() =>
                              setChange({
                                label: duty.name,
                                people: available,
                                input: {
                                  action: "replace_committee",
                                  id: duty.id,
                                },
                              })
                            }
                          >
                            Tunjuk pengganti
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                ))
              : matchingSchedule.slice(start, start + pageSize).map((item) => {
                  const target = {
                    id: item.id,
                    substitution_id: item.substitution_id,
                  };
                  const people = supervisorCandidates(data, item);
                  return (
                    <article
                      className="panel stack committee-card"
                      key={item.id}
                    >
                      <h3>{item.exam}</h3>
                      <p className="muted">
                        {item.room}
                        {item.session ? ` · ${item.session}` : ""}
                      </p>
                      <p>
                        {clock?.formatRange
                          ? clock.formatRange(
                              new Date(item.starts_at),
                              new Date(item.ends_at),
                            )
                          : `${clock?.format(new Date(item.starts_at))} – ${clock?.format(new Date(item.ends_at))}`}
                      </p>
                      <p>
                        <strong>{item.supervisor_name}</strong>
                        {item.substitution_id &&
                          ` (menggantikan ${item.original_name})`}
                      </p>
                      <span className="committee-status">
                        {item.confirmed_at ? "Hadir" : "Menunggu konfirmasi"}
                      </span>
                      {item.confirmed_at && (
                        <p className="muted">
                          Dikonfirmasi{" "}
                          {clock?.format(new Date(item.confirmed_at))}
                        </p>
                      )}
                      {item.substitution_id && item.original_confirmed_at && (
                        <p className="muted">
                          Pengawas awal hadir ·{" "}
                          {clock?.format(new Date(item.original_confirmed_at))}
                        </p>
                      )}
                      <div className="actions">
                        {!item.confirmed_at && (
                          <Button
                            type="button"
                            disabled={disabled}
                            aria-label={`Konfirmasi hadir: ${item.supervisor_name} · ${item.room}`}
                            onClick={() =>
                              void save({
                                action: "confirm_supervisor",
                                ...target,
                              })
                            }
                          >
                            Konfirmasi hadir
                          </Button>
                        )}
                        {item.can_replace && people.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={disabled}
                            onClick={() =>
                              setChange({
                                label: item.supervisor_name,
                                people,
                                input: {
                                  action: "replace_supervisor",
                                  ...target,
                                },
                              })
                            }
                          >
                            Tunjuk pengganti
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
          </div>
          {pages > 1 && (
            <nav
              className="actions committee-pagination"
              aria-label="Halaman daftar"
            >
              <Button
                type="button"
                variant="outline"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Sebelumnya
              </Button>
              <span>
                Halaman {currentPage} dari {pages}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Berikutnya
              </Button>
            </nav>
          )}
        </>
      )}
      <Dialog
        open={!!change}
        dismissible={!busy}
        onOpenChange={(open) => {
          if (!open) setChange(undefined);
        }}
        className="committee-dialog"
        title="Tunjuk petugas pengganti"
        description="Periksa nama petugas sebelum menyimpan perubahan."
      >
        {change && (
          <div className="stack">
            <p>
              Menggantikan <strong>{change.label}</strong>
            </p>
            <PersonForm
              label={admin ? "Panitia pengganti" : "Pengawas pengganti"}
              action={busy ? "Menyimpan…" : "Simpan pengganti"}
              people={change.people}
              disabled={disabled}
              onSubmit={(profile_id) =>
                void save({ ...change.input, profile_id })
              }
            />
          </div>
        )}
      </Dialog>
    </section>
  );
}
