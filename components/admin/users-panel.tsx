"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { parseUserImport } from "../../lib/domain/validation";
type Row = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  active: boolean;
};
type ClassRow = { id: string; name: string; active: boolean };
export function UsersPanel() {
  const [rows, setRows] = useState<Row[]>([]),
    [classes, setClasses] = useState<ClassRow[]>([]),
    [canManage, setCanManage] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [role, setRole] = useState(""),
    [active, setActive] = useState(""),
    [sort, setSort] = useState("asc"),
    [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [version, setVersion] = useState(0),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Row | null>(null),
    [busy, setBusy] = useState(false),
    [bulk, setBulk] = useState(""),
    [preview, setPreview] = useState<ReturnType<typeof parseUserImport>>([]),
    [chosenRole, setChosenRole] = useState("student");
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({
          q: query,
          role,
          active,
          sort,
          page: String(page),
        });
        const r = await fetch(`/api/admin/users?${p}`, {
          signal: controller.signal,
        });
        const j = await r.json();
        if (!r.ok) throw Error(j.error?.message);
        setRows(j.data.rows);
        setCount(j.data.count || 0);
        setCanManage(j.data.canManage);
      } catch (e) {
        if (!controller.signal.aborted)
          setMessage(e instanceof Error ? e.message : "Data gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, role, active, sort, page, version]);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/admin/master", { signal: c.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.success)
          setClasses(j.data.classes.filter((x: ClassRow) => x.active));
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  async function mutate(payload: unknown) {
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) throw Error(j.error?.message || "Perubahan gagal.");
    return j.data;
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const f = new FormData(e.currentTarget);
      await mutate(
        editing
          ? {
              operation: "update",
              id: editing.id,
              full_name: f.get("full_name"),
            }
          : {
              operation: "create",
              username: f.get("username"),
              full_name: f.get("full_name"),
              email: f.get("email"),
              role: canManage ? f.get("role") : "student",
              ...(f.get("class_id") ? { class_id: f.get("class_id") } : {}),
            },
      );
      setOpen(false);
      setVersion((v) => v + 1);
      setMessage(
        editing
          ? "Perubahan disimpan."
          : "Akun dibuat; email aktivasi dikirim.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  async function status(row: Row, archive = false) {
    if (
      !window.confirm(
        archive
          ? `Arsipkan akun ${row.username}?`
          : `${row.active ? "Nonaktifkan" : "Aktifkan"} akun ${row.username}?`,
      )
    )
      return;
    setBusy(true);
    try {
      await mutate({
        operation: archive ? "archive" : "update",
        id: row.id,
        ...(!archive ? { active: !row.active } : {}),
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setBusy(false);
    }
  }
  async function importRows() {
    setBusy(true);
    const valid = preview.filter((x) => x.valid && x.data);
    const failures: string[] = [];
    let saved = 0;
    try {
      for (let i = 0; i < valid.length; i++) {
        const row = valid[i];
        setMessage(`Mengimpor ${i + 1}/${valid.length}… Jangan tutup halaman.`);
        try {
          await mutate({ operation: "create", ...row.data });
          saved++;
        } catch (error) {
          failures.push(
            `Baris ${row.row}: ${error instanceof Error ? error.message : "Gagal"}`,
          );
        }
      }
      setMessage(
        `Impor: ${saved} berhasil, ${failures.length} gagal. ${failures.join("; ")}`,
      );
      setVersion((v) => v + 1);
      setPreview([]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <section className="panel">
        <div className="toolbar">
          <label>
            Cari username atau nama
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Peran
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua peran</option>
              {["admin", "teacher", "supervisor", "student"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua status</option>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </label>
          <label>
            Urutan
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="asc">Username A–Z</option>
              <option value="desc">Username Z–A</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <Button
            onClick={() => {
              setEditing(null);
              setChosenRole("student");
              setOpen(true);
            }}
          >
            Tambah pengguna
          </Button>
          <Button variant="outline" onClick={() => setVersion((v) => v + 1)}>
            Muat ulang
          </Button>
        </div>
        <p role="status">{loading ? "Memuat pengguna…" : message}</p>
        <div
          className="table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Daftar pengguna"
        >
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Nama lengkap</th>
                <th>Peran</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.username}</th>
                  <td>{row.full_name}</td>
                  <td>{row.role}</td>
                  <td>{row.active ? "Aktif" : "Nonaktif"}</td>
                  <td>
                    <div className="actions">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        Ubah nama
                      </Button>
                      {canManage ? (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() => status(row)}
                          >
                            {row.active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                          <Button
                            variant="destructive"
                            disabled={busy}
                            onClick={() => status(row, true)}
                          >
                            Arsipkan
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length ? (
          <p>Tidak ada pengguna sesuai filter.</p>
        ) : null}
        <div className="actions">
          <Button
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            Halaman {page} · {count} pengguna
          </span>
          <Button
            variant="outline"
            disabled={page * 20 >= count || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      </section>
      <section className="panel">
        <h2>Impor pengguna</h2>
        <p>
          Tempel data tab-separated dari spreadsheet. Maksimal 200 baris. Setiap
          akun baru menerima undangan aktivasi.
        </p>
        <a
          download="template-pengguna.tsv"
          href={
            "data:text/tab-separated-values;charset=utf-8," +
            encodeURIComponent("username\tfull_name\temail\trole\tclass_id\n")
          }
        >
          Unduh template TSV
        </a>
        <label>
          Data impor
          <textarea
            rows={5}
            value={bulk}
            onChange={(e) => {
              setBulk(e.target.value);
              setPreview([]);
            }}
            placeholder="username → nama → email → role → class_id"
          />
        </label>
        <div className="actions">
          <Button
            variant="outline"
            onClick={() => {
              try {
                setPreview(parseUserImport(bulk));
              } catch (e) {
                setMessage(
                  e instanceof Error ? e.message : "Format tidak valid.",
                );
              }
            }}
          >
            Pratinjau
          </Button>
          <Button
            disabled={busy || !preview.some((x) => x.valid)}
            onClick={importRows}
          >
            Impor baris valid
          </Button>
        </div>
        {preview.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>Username</th>
                  <th>Validasi</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((x) => (
                  <tr key={x.row}>
                    <td>{x.row}</td>
                    <td>{x.data?.username || "—"}</td>
                    <td>{x.valid ? "Valid" : x.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Ubah nama pengguna" : "Tambah pengguna"}
        description={
          editing
            ? "Identitas pengguna akan diperbarui."
            : "Akun diaktifkan melalui undangan email, tanpa menyimpan password terbaca."
        }
      >
        <form onSubmit={save} className="stack">
          <label>
            Nama lengkap
            <input
              name="full_name"
              defaultValue={editing?.full_name}
              maxLength={150}
              required
            />
          </label>
          {!editing ? (
            <>
              <label>
                Username
                <input
                  name="username"
                  required
                  pattern="[a-z0-9][a-z0-9_.-]{2,63}"
                  maxLength={64}
                />
              </label>
              <label>
                Email aktivasi
                <input name="email" type="email" required />
              </label>
              <label>
                Peran
                <select
                  name="role"
                  value={canManage ? chosenRole : "student"}
                  disabled={!canManage}
                  onChange={(e) => setChosenRole(e.target.value)}
                >
                  {(canManage
                    ? ["student", "teacher", "supervisor", "admin"]
                    : ["student"]
                  ).map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {chosenRole === "student" || !canManage ? (
                <label>
                  Kelas
                  <select name="class_id" required>
                    <option value="">Pilih kelas</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          ) : null}
          <Button disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</Button>
          <p role="alert">{message}</p>
        </form>
      </Dialog>
    </div>
  );
}
