"use client";

import { useEffect, useState, type FormEvent } from "react";
import { feedbackJSON } from "../../lib/client/feedback-transport";
import {
  committeeData,
  type CommitteeData,
  type CommitteeMutation,
} from "../../lib/committee/contracts";

type Person = { id: string; name: string };
type ResponseData = {
  success?: boolean;
  data?: unknown;
  error?: { message?: string };
};

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
    if (selected) onSubmit(selected);
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label>
        {label}
        <select
          className="select w-full"
          value={selected}
          onChange={(event) => setPerson(event.target.value)}
          required
          disabled={disabled || people.length === 0}
        >
          <option value="">Pilih petugas</option>
          {people.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          className="btn btn-outline btn-sm"
          disabled={disabled || !selected}
        >
          {action}
        </button>
      </div>
    </form>
  );
}

export function CommitteePanel({ admin }: { admin: boolean }) {
  const [date, setDate] = useState("");
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    data?: CommitteeData;
    error?: string;
  }>();
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const [busy, setBusy] = useState(false);
  const key = date + ":" + revision;
  const current = loaded?.key === key ? loaded : undefined;
  const data = current?.data;

  useEffect(() => {
    const controller = new AbortController();
    const query = date ? "?date=" + encodeURIComponent(date) : "";
    feedbackJSON<ResponseData>("/api/committee" + query, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(({ response, data: result }) => {
        if (!response.ok || !result.success)
          throw Error(result.error?.message || "Jadwal belum dapat dimuat.");
        const parsed = committeeData.safeParse(result.data);
        if (!parsed.success) throw Error("Jadwal belum dapat dimuat.");
        if (!controller.signal.aborted) setLoaded({ key, data: parsed.data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            error:
              error instanceof Error
                ? error.message
                : "Jadwal belum dapat dimuat.",
          });
      });
    return () => controller.abort();
  }, [date, key]);

  const expiresAt = data?.expires_at;
  useEffect(() => {
    if (admin || !expiresAt) return;
    const timeout = window.setTimeout(
      () => setRevision((value) => value + 1),
      Math.max(1000, Date.parse(expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [admin, expiresAt]);

  async function save(input: CommitteeMutation) {
    setBusy(true);
    setNotice(undefined);
    try {
      const { response, data: result } = await feedbackJSON<ResponseData>(
        "/api/committee",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok || !result.success) {
        setNotice({
          text: result.error?.message || "Perubahan belum dapat dipastikan.",
          error: true,
        });
      } else {
        setNotice({ text: "Perubahan tersimpan." });
      }
    } catch {
      setNotice({
        text: "Perubahan belum dapat dipastikan. Periksa daftar sebelum mencoba lagi.",
        error: true,
      });
    } finally {
      setRevision((value) => value + 1);
      setBusy(false);
    }
  }

  const clock =
    data &&
    new Intl.DateTimeFormat("id-ID", {
      timeZone: data.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  const localDate =
    data &&
    new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(data.date));
  const available =
    data?.candidates.filter(
      ({ id }) =>
        !data.duties.some(
          (duty) => duty.profile_id === id && !duty.replaced_at,
        ),
    ) ?? [];
  return (
    <section
      className="stack"
      aria-label={admin ? "Penugasan panitia" : "Tugas hari ini"}
    >
      <div className="actions">
        {admin && (
          <label>
            Tanggal tugas
            <input
              className="input"
              type="date"
              value={date || data?.date || ""}
              disabled={busy}
              onChange={(event) => {
                setNotice(undefined);
                setDate(event.target.value);
              }}
            />
          </label>
        )}
        <button
          className="btn btn-outline btn-sm"
          type="button"
          disabled={busy || !current}
          onClick={() => {
            setNotice(undefined);
            setRevision((value) => value + 1);
          }}
        >
          Muat ulang
        </button>
      </div>
      {notice && <p role={notice.error ? "alert" : "status"}>{notice.text}</p>}
      {!current && <p role="status">Memuat tugas panitia…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {data && (
        <p>
          {localDate} <span className="muted">({data.timezone})</span>
        </p>
      )}
      {data && admin && (
        <>
          {data.date >= data.today &&
            (available.length ? (
              <PersonForm
                key={data.date}
                label="Guru atau Panitia Ujian"
                action="Tambahkan tugas"
                people={available}
                disabled={busy}
                onSubmit={(profile_id) =>
                  void save({ action: "assign", profile_id, date: data.date })
                }
              />
            ) : (
              <p>
                Semua petugas yang memenuhi syarat sudah ditugaskan atau belum
                ada akun yang tersedia.
              </p>
            ))}
          <h2>Daftar Panitia Ujian</h2>
          {!data.duties.length && <p>Belum ada panitia pada tanggal ini.</p>}
          {data.duties.map((duty) => (
            <article
              className="card border border-base-300 bg-base-100 p-4 stack"
              key={duty.id}
            >
              <h3>{duty.name}</h3>
              {duty.replaces && <p>Menggantikan {duty.replaces}</p>}
              <p>
                {duty.replaced_at
                  ? "Digantikan"
                  : duty.confirmed_at
                    ? "Hadir"
                    : "Menunggu konfirmasi"}
              </p>
              {duty.confirmed_at && (
                <p>Dikonfirmasi {clock?.format(new Date(duty.confirmed_at))}</p>
              )}
              {!duty.replaced_at &&
                !duty.confirmed_at &&
                data.date === data.today && (
                  <div>
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void save({ action: "confirm_committee", id: duty.id })
                      }
                    >
                      Konfirmasi hadir
                    </button>
                  </div>
                )}
              {!duty.replaced_at &&
                data.date >= data.today &&
                available.length > 0 && (
                  <PersonForm
                    label="Panitia pengganti"
                    action="Tunjuk pengganti"
                    people={available}
                    disabled={busy}
                    onSubmit={(profile_id) =>
                      void save({
                        action: "replace_committee",
                        id: duty.id,
                        profile_id,
                      })
                    }
                  />
                )}
            </article>
          ))}
        </>
      )}
      {data &&
        !admin &&
        (data.status === "unassigned" ? (
          <p>Anda belum memiliki tugas Panitia Ujian hari ini.</p>
        ) : data.status === "pending" ? (
          <p>
            Admin perlu mengonfirmasi kehadiran Anda. Setelah itu, muat ulang
            untuk membuka jadwal pengawas.
          </p>
        ) : (
          <>
            <h2>Jadwal pengawas hari ini</h2>
            {!data.schedule.length && (
              <p>Belum ada jadwal pengawas hari ini.</p>
            )}
            {data.schedule.map((item) => {
              const target = {
                id: item.id,
                substitution_id: item.substitution_id,
              };
              return (
                <article
                  className="card border border-base-300 bg-base-100 p-4 stack"
                  key={item.id}
                >
                  <h3>
                    {item.exam} · {item.room}
                  </h3>
                  {item.session && <p>{item.session}</p>}
                  <p>
                    {clock?.formatRange(
                      new Date(item.starts_at),
                      new Date(item.ends_at),
                    )}
                  </p>
                  <p>
                    {item.supervisor_name}
                    {item.substitution_id &&
                      ` (menggantikan ${item.original_name})`}
                  </p>
                  {item.substitution_id && item.original_confirmed_at && (
                    <p>
                      Kehadiran pengawas awal tercatat{" "}
                      {clock?.format(new Date(item.original_confirmed_at))}.
                    </p>
                  )}
                  {item.confirmed_at ? (
                    <p>Hadir · {clock?.format(new Date(item.confirmed_at))}</p>
                  ) : (
                    <div>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void save({ action: "confirm_supervisor", ...target })
                        }
                      >
                        Konfirmasi hadir
                      </button>
                    </div>
                  )}
                  {item.can_replace && (
                    <PersonForm
                      key={item.substitution_id || item.id}
                      label="Pengawas pengganti"
                      action="Tunjuk pengganti"
                      people={data.supervisors.filter(
                        ({ id }) =>
                          id !== item.original_id && id !== item.supervisor_id,
                      )}
                      disabled={busy}
                      onSubmit={(profile_id) =>
                        void save({
                          action: "replace_supervisor",
                          ...target,
                          profile_id,
                        })
                      }
                    />
                  )}
                </article>
              );
            })}
          </>
        ))}
    </section>
  );
}
