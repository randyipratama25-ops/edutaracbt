"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
type Master = { id: string; name: string; active: boolean };
type Person = { id: string; full_name: string; role: string };
type Assignment = {
  id: string;
  teacher_id?: string;
  student_id?: string;
  class_id: string;
  subject_id?: string;
  active: boolean;
};
type MasterData = {
  classes: Master[];
  subjects: Master[];
  assignments: Assignment[];
  enrollments: Assignment[];
  people?: Person[];
  canManage: boolean;
};
export function MasterPanel() {
  const [data, setData] = useState<MasterData | null>(null),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [kind, setKind] = useState<"classes" | "subjects">("classes"),
    [q, setQ] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Master | null>(null),
    [busy, setBusy] = useState(false),
    [assignmentType, setAssignmentType] = useState("assignment"),
    [message, setMessage] = useState(""),
    [bulk, setBulk] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/admin/master", { signal: c.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw Error(j.error?.message);
        setData(j.data);
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [version]);
  async function save(payload: unknown) {
    const r = await fetch("/api/admin/master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) throw Error(j.error?.message);
    setVersion((v) => v + 1);
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await save({
        kind,
        name: f.get("name"),
        ...(editing
          ? { id: editing.id, active: f.get("active") === "on" }
          : {}),
      });
      setOpen(false);
      setMessage("Data disimpan.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      await save({
        kind: assignmentType,
        user_id: f.get("user_id"),
        class_id: f.get("class_id"),
        ...(assignmentType === "assignment"
          ? { subject_id: f.get("subject_id") }
          : {}),
      });
      setMessage("Penugasan disimpan.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan penugasan.");
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
        <Button onClick={() => setVersion((v) => v + 1)}>Coba lagi</Button>
      </section>
    );
  if (!data) return <p role="status">Memuat data master…</p>;
  const rows = data[kind]
    .filter((x) => x.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <label>
            Jenis data
            <select
              value={kind}
              onChange={(e) => (
                setKind(e.target.value as "classes" | "subjects"),
                setPage(1)
              )}
            >
              <option value="classes">Kelas</option>
              <option value="subjects">Mata pelajaran</option>
            </select>
          </label>
          <label>
            Pencarian
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {data.canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Tambah data
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Muat ulang
          </Button>
        </div>
        <p role="status">{message}</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel data akademik; geser untuk melihat kolom lain">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 20, page * 20).map((x) => (
                <tr key={x.id}>
                  <th scope="row">{x.name}</th>
                  <td>{x.active ? "Aktif" : "Diarsipkan"}</td>
                  <td>
                    {data.canManage ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(x);
                          setOpen(true);
                        }}
                      >
                        Ubah / arsipkan
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length ? <p>Belum ada data sesuai pencarian.</p> : null}
        <div className="actions">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            Halaman {page} · {rows.length} data
          </span>
          <Button
            variant="outline"
            disabled={page * 20 >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
        {data.canManage ? (
          <div className="stack">
            <label>
              Tambah massal — satu nama per baris
              <textarea
                rows={4}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !bulk.trim()}
              onClick={async () => {
                const names = bulk
                  .split(/\r?\n/)
                  .map((x) => x.trim())
                  .filter(Boolean);
                if (names.length > 100) {
                  setMessage("Maksimal 100 nama.");
                  return;
                }
                if (
                  !window.confirm(
                    `Tambahkan ${names.length} nama pada ${kind === "classes" ? "kelas" : "mata pelajaran"}?`,
                  )
                )
                  return;
                setBusy(true);
                let ok = 0;
                const errors: string[] = [];
                for (const name of names) {
                  try {
                    await save({ kind, name });
                    ok++;
                  } catch {
                    errors.push(name);
                  }
                }
                setMessage(
                  `${ok} berhasil; ${errors.length} gagal: ${errors.join(", ")}`,
                );
                setBusy(false);
              }}
            >
              Simpan data massal
            </Button>
          </div>
        ) : null}
      </section>
      {data.canManage ? (
        <section className="panel">
          <h2>Penugasan akademik</h2>
          <form onSubmit={assign} className="toolbar">
            <label>
              Jenis
              <select
                value={assignmentType}
                onChange={(e) => setAssignmentType(e.target.value)}
              >
                <option value="assignment">Guru → mapel dan kelas</option>
                <option value="enrollment">Siswa → kelas</option>
              </select>
            </label>
            <label>
              Pengguna
              <select name="user_id" required key={assignmentType}>
                <option value="">Pilih pengguna</option>
                {data.people
                  ?.filter(
                    (p) =>
                      p.role ===
                      (assignmentType === "assignment" ? "teacher" : "student"),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Kelas
              <select name="class_id" required>
                <option value="">Pilih kelas</option>
                {data.classes
                  .filter((x) => x.active)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
            {assignmentType === "assignment" ? (
              <label>
                Mata pelajaran
                <select name="subject_id" required>
                  <option value="">Pilih mapel</option>
                  {data.subjects
                    .filter((x) => x.active)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <Button disabled={busy}>Simpan penugasan</Button>
          </form>
        </section>
      ) : null}
      <section className="panel">
        <h2>Daftar penugasan guru</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabel data akademik; geser untuk melihat kolom lain">
          <table>
            <thead>
              <tr>
                <th>Guru</th>
                <th>Kelas</th>
                <th>Mata pelajaran</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((x) => (
                <tr key={x.id}>
                  <td>
                    {data.people?.find((p) => p.id === x.teacher_id)
                      ?.full_name || x.teacher_id}
                  </td>
                  <td>
                    {data.classes.find((c) => c.id === x.class_id)?.name || "—"}
                  </td>
                  <td>
                    {data.subjects.find((c) => c.id === x.subject_id)?.name ||
                      "—"}
                  </td>
                  <td>{x.active ? "Aktif" : "Nonaktif"}</td>
                  <td>
                    {data.canManage ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await save({
                              kind: "assignment",
                              id: x.id,
                              user_id: x.teacher_id,
                              class_id: x.class_id,
                              subject_id: x.subject_id,
                              active: !x.active,
                            });
                          } catch (e) {
                            setMessage(
                              e instanceof Error ? e.message : "Gagal.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {x.active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.assignments.length ? <p>Belum ada penugasan.</p> : null}
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Ubah data master" : "Tambah data master"}
        description="Gunakan nama yang unik dan mudah dikenali."
      >
        <form onSubmit={submit} className="stack">
          <label>
            Nama
            <input
              name="name"
              defaultValue={editing?.name}
              maxLength={100}
              required
            />
          </label>
          {editing ? (
            <label className="check">
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing.active}
              />
              Aktif
            </label>
          ) : null}
          <Button disabled={busy}>Simpan</Button>
          <p role="alert">{message}</p>
        </form>
      </Dialog>
    </div>
  );
}
