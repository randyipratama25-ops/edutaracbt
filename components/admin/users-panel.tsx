"use client";
import {FeedbackMessage, StateCard} from "../feedback/state";
import {ValidatedForm} from "../feedback/validated-form";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ListFilters, SearchField } from "../ui/list-filters";
import { HelpDisclosure } from "../ui/help-disclosure";
import { TaskTabs } from "../ui/task-tabs";
import { MoreActions } from "../ui/more-actions";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { parseUserImport, userSchema } from "../../lib/domain/validation";
import { userRequest, UserRequestError } from "../../lib/users/request";
import {
  userListSchema,
  classesSchema,
  createdSchema,
  savedSchema,
  sentSchema,
  invitationSchema,
  previewSchema,
  roleLabels,
  tsvLink,
  type UserRow,
} from "../../lib/users/schema";
type Feedback = { kind: "success" | "error" | "info"; text: string } | null;
function FeedbackText({ value }: { value: Feedback }) {
  return value ? (
    <FeedbackMessage tone={value.kind}
      role={value.kind === "error" ? "alert" : "status"}
      className="users-feedback"
    >
      {value.text}
    </FeedbackMessage>
  ) : null;
}
type ImportRow = ReturnType<typeof parseUserImport>[number];
type Report = { row: number; username: string; status: string };
export function UsersPanel() {
  const [rows, setRows] = useState<UserRow[]>([]),
    [classes, setClasses] = useState<z.infer<typeof classesSchema>["classes"]>(
      [],
    ),
    [canManage, setCanManage] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true),
    [listError, setListError] = useState(""),
    [query, setQuery] = useState(""),
    [role, setRole] = useState(""),
    [active, setActive] = useState(""),
    [sort, setSort] = useState("asc"),
    [page, setPage] = useState(1),
    [count, setCount] = useState(0),
    [version, setVersion] = useState(0);
  const [classesLoading, setClassesLoading] = useState(true),
    [classesError, setClassesError] = useState(""),
    [classesVersion, setClassesVersion] = useState(0);
  const [message, setMessage] = useState<Feedback>(null),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<UserRow | null>(null),
    [chosenRole, setChosenRole] = useState("student"),
    [formMessage, setFormMessage] = useState<Feedback>(null),
    [formUncertain, setFormUncertain] = useState(false),
    [fieldError, setFieldError] = useState("");
  const [confirmation, setConfirmation] = useState<{
      row: UserRow;
      archive: boolean;
    } | null>(null),
    [confirmMessage, setConfirmMessage] = useState<Feedback>(null),
    [confirmUncertain, setConfirmUncertain] = useState(false);
  const [bulk, setBulk] = useState(""),
    [preview, setPreview] = useState<ImportRow[]>([]),
    [report, setReport] = useState<Report[]>([]),
    [importMessage, setImportMessage] = useState<Feedback>(null);
  const [invitation, setInvitation] = useState<UserRow | null>(null),
    [invitationInfo, setInvitationInfo] = useState<z.infer<
      typeof invitationSchema
    > | null>(null),
    [invitationLoading, setInvitationLoading] = useState(false),
    [invitationMessage, setInvitationMessage] = useState<Feedback>(null),
    [invitationVersion, setInvitationVersion] = useState(0);
  const lock = useRef(false),
    life = useRef(0),
    mounted = useRef(false),
    requests = useRef(new Set<AbortController>());
  const focusListAfterClose = useRef(false);
  function restoreListFocus(event: Event) {
    if (focusListAfterClose.current) {
      event.preventDefault();
      focusListAfterClose.current = false;
      document.getElementById("users-list-title")?.focus();
    }
  }
  const invitationCooldown = useRef(new Map<string, number>());
  const importSequence = useRef(0),
    invitationSequence = useRef(0);
  const listReady = !loading && !listError && canManage !== null;
  useEffect(() => {
    mounted.current = true;
    const pending = requests.current,
      lifetime = life,
      imports = importSequence,
      invitations = invitationSequence;
    return () => {
      mounted.current = false;
      lifetime.current++;
      imports.current++;
      invitations.current++;
      pending.forEach((c) => c.abort());
      pending.clear();
    };
  }, []);
  function begin() {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    return true;
  }
  function end() {
    lock.current = false;
    if (mounted.current) setBusy(false);
  }
  async function read<T>(
    url: string,
    input: object | undefined,
    schema: z.ZodType<T>,
    mutation = false,
  ) {
    const c = new AbortController();
    requests.current.add(c);
    try {
      return await userRequest(url, input, schema, c, mutation);
    } finally {
      requests.current.delete(c);
    }
  }
  function refreshList() {
    setVersion((v) => v + 1);
  }
  useEffect(() => {
    let live = true,
      clamped = false;
    const c = new AbortController();
    setLoading(true);
    setListError("");
    const timer = setTimeout(() => {
      const p = new URLSearchParams({
        q: query.trim(),
        role,
        active,
        sort,
        page: String(page),
      });
      void userRequest(`/api/admin/users?${p}`, undefined, userListSchema, c)
        .then((d) => {
          if (!live) return;
          const last = Math.max(1, Math.ceil(d.count / 20));
          setCount(d.count);
          setCanManage(d.canManage);
          if (!d.canManage && role && role !== "student") {
            clamped = true;
            setRole("");
            setPage(1);
            return;
          }
          if (page > last) {
            clamped = true;
            setPage(last);
            return;
          }
          setRows(d.rows);
        })
        .catch((e) => {
          if (live) {
            setRows([]);
            setListError(
              e instanceof Error ? e.message : "Daftar belum dapat dimuat.",
            );
          }
        })
        .finally(() => {
          if (live && !clamped) setLoading(false);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
      c.abort();
    };
  }, [query, role, active, sort, page, version]);
  useEffect(() => {
    let live = true;
    const c = new AbortController();
    setClassesLoading(true);
    setClassesError("");
    void userRequest("/api/admin/master", undefined, classesSchema, c)
      .then((d) => {
        if (live) setClasses(d.classes.filter((x) => x.active));
      })
      .catch(() => {
        if (live) {
          setClasses([]);
          setClassesError(
            "Daftar kelas belum dapat dimuat. Coba muat ulang kelas.",
          );
        }
      })
      .finally(() => {
        if (live) setClassesLoading(false);
      });
    return () => {
      live = false;
      c.abort();
    };
  }, [classesVersion]);
  useEffect(() => {
    if (!invitation) return;
    const seq = ++invitationSequence.current;
    let live = true;
    const c = new AbortController();
    setInvitationInfo(null);
    setInvitationLoading(true);
    setInvitationMessage(null);
    void userRequest(
      "/api/admin/users",
      { operation: "invitation_info", id: invitation.id },
      invitationSchema,
      c,
    )
      .then((d) => {
        if (live && seq === invitationSequence.current)
          setInvitationInfo(
            (invitationCooldown.current.get(invitation.id) || 0) > Date.now()
              ? {
                  ...d,
                  eligible: false,
                  reason:
                    "Undangan baru diproses. Tunggu setidaknya 60 detik sebelum mencoba lagi.",
                }
              : d,
          );
      })
      .catch((e) => {
        if (live && seq === invitationSequence.current)
          setInvitationMessage({
            kind: "error",
            text:
              e instanceof Error
                ? e.message
                : "Status undangan belum dapat dimuat.",
          });
      })
      .finally(() => {
        if (live && seq === invitationSequence.current)
          setInvitationLoading(false);
      });
    return () => {
      live = false;
      c.abort();
    };
  }, [invitation, invitationVersion]);
  function editUser(row: UserRow | null) {
    if (busy || !listReady) return;
    setEditing(row);
    setChosenRole("student");
    setFormMessage(null);
    setFormUncertain(false);
    setFieldError("");
    setOpen(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!listReady || formUncertain || lock.current) return;
    const form = event.currentTarget,
      f = new FormData(form);
    const result = editing
      ? z
          .object({
            full_name: z
              .string()
              .trim()
              .min(1, "Nama lengkap wajib diisi.")
              .max(150),
          })
          .safeParse({ full_name: f.get("full_name") })
      : userSchema.safeParse({
          username: f.get("username"),
          full_name: f.get("full_name"),
          email: f.get("email"),
          role: canManage ? chosenRole : "student",
          ...(f.get("class_id") ? { class_id: f.get("class_id") } : {}),
        });
    if (!result.success) {
      const issue = result.error.issues[0],
        name = String(issue.path[0] || "");
      setFieldError(name);
      setFormMessage({
        kind: "error",
        text:
          (
            {
              full_name: "Nama lengkap wajib diisi, maksimal 150 karakter.",
              email: "Masukkan alamat email yang valid.",
              class_id: "Pilih kelas aktif yang tersedia.",
            } as Record<string, string>
          )[name] || issue.message,
      });
      (form.elements.namedItem(name) as HTMLElement | null)?.focus();
      return;
    }
    if (
      !editing &&
      (chosenRole === "student" || !canManage) &&
      (classesLoading ||
        classesError ||
        !classes.some((c) => c.id === f.get("class_id")))
    ) {
      setFormMessage({
        kind: "error",
        text: "Pilih kelas aktif yang tersedia.",
      });
      setFieldError("class_id");
      return;
    }
    if (!begin()) return;
    const seq = life.current;
    setFormMessage(null);
    setFieldError("");
    try {
      if (editing)
        await read(
          "/api/admin/users",
          { operation: "update", id: editing.id, ...result.data },
          savedSchema,
          true,
        );
      else
        await read(
          "/api/admin/users",
          { operation: "create", ...result.data },
          createdSchema,
          true,
        );
      if (seq !== life.current) return;
      focusListAfterClose.current = true;
      setOpen(false);
      setMessage({
        kind: "success",
        text: editing
          ? "Nama pengguna berhasil diperbarui."
          : "Akun dibuat; undangan aktivasi diterima layanan email.",
      });
      refreshList();
    } catch (e) {
      if (seq === life.current) {
        setFormMessage({
          kind: "error",
          text:
            e instanceof Error
              ? e.message
              : "Perubahan belum dapat dipastikan.",
        });
        setFormUncertain(e instanceof UserRequestError && e.uncertain);
      }
    } finally {
      end();
    }
  }
  async function changeStatus() {
    if (!confirmation || !listReady || confirmUncertain || !begin()) return;
    const seq = life.current,
      { row, archive } = confirmation;
    setConfirmMessage(null);
    try {
      await read(
        "/api/admin/users",
        {
          operation: archive ? "archive" : "update",
          id: row.id,
          ...(!archive ? { active: !row.active } : {}),
        },
        savedSchema,
        true,
      );
      if (seq !== life.current) return;
      focusListAfterClose.current = true;
      setConfirmation(null);
      setMessage({
        kind: "success",
        text: archive
          ? "Akun berhasil diarsipkan."
          : `Akun berhasil ${row.active ? "dinonaktifkan" : "diaktifkan"}.`,
      });
      refreshList();
    } catch (e) {
      if (seq === life.current) {
        setConfirmMessage({
          kind: "error",
          text:
            e instanceof Error ? e.message : "Status belum dapat diperbarui.",
        });
        setConfirmUncertain(e instanceof UserRequestError && e.uncertain);
      }
    } finally {
      end();
    }
  }
  async function sendInvitation() {
    if (
      !canManage ||
      !invitation ||
      !invitationInfo?.eligible ||
      !listReady ||
      !begin()
    )
      return;
    const seq = life.current,
      target = invitation.id,
      info = invitationInfo;
    setInvitationMessage(null);
    try {
      const d = await read(
        "/api/admin/users",
        { operation: "resend_invitation", id: target },
        sentSchema,
        true,
      );
      if (seq !== life.current) return;
      invitationCooldown.current.set(target, Date.now() + 60000);
      setInvitationInfo({
        ...info,
        eligible: false,
        reason: "Tunggu setidaknya 60 detik sebelum memeriksa kembali.",
      });
      setInvitationMessage({ kind: "success", text: d.message });
      setMessage({ kind: "success", text: d.message });
    } catch (e) {
      if (seq === life.current) {
        const text =
          e instanceof Error
            ? e.message
            : "Hasil pengiriman belum dapat dipastikan.";
        setInvitationMessage({ kind: "error", text });
        setInvitationInfo({
          ...info,
          eligible: false,
          reason:
            "Periksa hasil pengiriman sebelum memeriksa status akun lagi.",
        });
      }
    } finally {
      end();
    }
  }
  async function previewUsers() {
    if (!listReady || !begin()) return;
    const seq = ++importSequence.current,
      lifetime = life.current;
    setPreview([]);
    setReport([]);
    setImportMessage(null);
    try {
      const parsed = parseUserImport(bulk);
      if (!parsed.length) {
        setImportMessage({
          kind: "info",
          text: "Tempel data pengguna terlebih dahulu.",
        });
        return;
      }
      const valid = parsed.filter((r) => r.valid && r.data);
      const checks = valid.length
        ? await read(
            "/api/workflow",
            { action: "import_preview", items: valid.map((r) => r.data) },
            previewSchema,
          )
        : [];
      if (seq !== importSequence.current || lifetime !== life.current) return;
      const checked = parsed.map((r) => {
        if (!r.valid) return r;
        const matches = checks.filter((c) => c.username === r.data?.username);
        const error =
          matches.length !== 1
            ? "Pemeriksaan server belum lengkap. Ulangi pratinjau."
            : matches[0].error;
        return error ? { ...r, valid: false, error } : r;
      });
      setPreview(checked);
      setImportMessage({
        kind: "info",
        text: `Pratinjau selesai: ${checked.filter((r) => r.valid).length} baris valid. Data belum disimpan.`,
      });
    } catch (e) {
      if (seq === importSequence.current && lifetime === life.current)
        setImportMessage({
          kind: "error",
          text: e instanceof Error ? e.message : "Pratinjau gagal.",
        });
    } finally {
      end();
    }
  }
  async function importRows() {
    if (!listReady || !preview.some((r) => r.valid && r.data) || !begin())
      return;
    const lifetime = life.current,
      valid = preview.filter((r) => r.valid && r.data),
      result: Report[] = preview
        .filter((r) => !r.valid)
        .map((r) => ({
          row: r.row,
          username: r.data?.username || "—",
          status: "Dilewati: " + r.error,
        }));
    let saved = 0,
      failed = 0,
      unknown = false;
    try {
      for (let i = 0; i < valid.length; i++) {
        if (lifetime !== life.current) break;
        const row = valid[i];
        setImportMessage({
          kind: "info",
          text: `Mengimpor ${i + 1}/${valid.length}… Jangan tutup halaman.`,
        });
        try {
          await read(
            "/api/admin/users",
            { operation: "create", ...row.data },
            createdSchema,
            true,
          );
          saved++;
          result.push({
            row: row.row,
            username: row.data!.username,
            status: "Berhasil",
          });
        } catch (e) {
          if (lifetime !== life.current) break;
          failed++;
          result.push({
            row: row.row,
            username: row.data!.username,
            status: e instanceof Error ? e.message : "Gagal",
          });
          if (
            e instanceof UserRequestError &&
            (e.uncertain ||
              e.status === 401 ||
              e.status === 403 ||
              e.status === 429)
          ) {
            unknown = e.uncertain;
            for (const next of valid.slice(i + 1))
              result.push({
                row: next.row,
                username: next.data!.username,
                status:
                  "Belum diproses: impor dihentikan. Periksa hasil sebelum membuat pratinjau baru.",
              });
            break;
          }
        }
      }
      if (lifetime !== life.current) return;
      setReport(result.sort((a, b) => a.row - b.row));
      setPreview([]);
      setImportMessage({
        kind: failed ? "error" : "success",
        text: `Impor: ${saved} berhasil, ${failed} gagal${unknown ? " atau belum pasti" : ""}. Periksa laporan per baris; baris yang belum diproses tidak dikirim.`,
      });
      refreshList();
    } finally {
      end();
    }
  }
  const validCount = preview.filter((r) => r.valid).length;
  return (
    <div className="stack users-page">
      <TaskTabs label="Pengguna" items={[
        { id: "users", label: "Daftar pengguna", content: (
      <section className="panel stack" aria-labelledby="users-list-title">
        <div className="users-heading">
          <h2 id="users-list-title" tabIndex={-1}>
            Daftar pengguna
          </h2>
          <div className="actions">
            <Button
              type="button"
              disabled={!listReady || busy}
              onClick={() => editUser(null)}
            >
              Tambah pengguna
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading || busy}
              onClick={refreshList}
            >
              Muat ulang
            </Button>
          </div>
        </div>
        <ListFilters
          label="pengguna"
          active={
            [
              query && "Pencarian",
              role && "Peran",
              active && "Status",
              sort !== "asc" && "Urutan",
            ].filter(Boolean) as string[]
          }
          onReset={() => {
            setQuery("");
            setRole("");
            setActive("");
            setSort("asc");
            setPage(1);
          }}
          total={count}
          loading={loading}
          error={listError}
        >
          <SearchField
            label="Cari username atau nama"
            value={query}
            maxLength={80}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
          />
          <label>
            Peran
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {canManage === false ? "Siswa dalam penugasan" : "Semua peran"}
              </option>
              {(canManage === false
                ? ["student"]
                : ["admin", "teacher", "supervisor", "committee", "student"]
              ).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
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
        </ListFilters>
        <FeedbackText value={message} />
        {loading ? (
          <FeedbackMessage tone="loading" role="status">Memuat pengguna…</FeedbackMessage>
        ) : listError ? (
          <p className="muted">Gunakan Muat ulang untuk mencoba lagi.</p>
        ) : !rows.length ? (
          <StateCard kind="no-results" className="empty-state">
            <p>Tidak ada pengguna sesuai filter.</p>
            <p className="muted">
              Ubah pencarian atau reset filter untuk melihat data lainnya.
            </p>
          </StateCard>
        ) : null}
        <div
          className="table-wrap users-table"
          tabIndex={0}
          role="region"
          aria-label="Daftar pengguna; geser untuk melihat kolom lain"
          aria-busy={loading}
        >
          <table>
            <caption className="sr-only">
              Pengguna dalam cakupan akun Anda
            </caption>
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Nama lengkap</th>
                <th scope="col">Peran</th>
                <th scope="col">Status</th>
                <th scope="col">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(!loading && !listError ? rows : []).map((row) => (
                <tr key={row.id}>
                  <th scope="row">{row.username}</th>
                  <td>{row.full_name}</td>
                  <td>{roleLabels[row.role]}</td>
                  <td>
                    <span className="status-pill">
                      {row.archived_at
                        ? "Diarsipkan"
                        : row.active
                          ? "Aktif"
                          : "Nonaktif"}
                    </span>
                  </td>
                  <td>
                    <div className="actions users-row-actions">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        aria-label={`Ubah nama ${row.username}`}
                        onClick={() => editUser(row)}
                      >
                        Ubah nama
                      </Button>
                      {canManage && (
                        <MoreActions label="Opsi akun">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy || !row.active || !!row.archived_at}
                            aria-label={`Kirim ulang undangan ${row.username}`}
                            onClick={() => {
                              if (!lock.current) setInvitation(row);
                            }}
                          >
                            Kirim ulang undangan
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            aria-label={`${row.active ? "Nonaktifkan" : "Aktifkan"} ${row.username}`}
                            onClick={() => {
                              setConfirmMessage(null);
                              setConfirmUncertain(false);
                              setConfirmation({ row, archive: false });
                            }}
                          >
                            {row.active ? "Nonaktifkan" : "Aktifkan"}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={busy || !!row.archived_at}
                            aria-label={`Arsipkan ${row.username}`}
                            onClick={() => {
                              setConfirmMessage(null);
                              setConfirmUncertain(false);
                              setConfirmation({ row, archive: true });
                            }}
                          >
                            Arsipkan
                          </Button>
                        </MoreActions>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav
          className="actions users-pagination"
          aria-label="Halaman daftar pengguna"
        >
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1 || loading || !!listError || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            {listError
              ? "Halaman belum tersedia"
              : `Halaman ${page} dari ${Math.max(1, Math.ceil(count / 20))} · ${count} pengguna`}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={page * 20 >= count || loading || !!listError || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </nav>
      </section>
        ) },
        { id: "import", label: "Impor pengguna", content: (
      <section
        className="panel stack users-import"
        aria-labelledby="users-import-title"
      >
        <h2 id="users-import-title">Impor pengguna</h2>
        <p className="muted">
          Tempel data TSV dari spreadsheet, maksimal 200 baris. Periksa
          pratinjau sebelum mengirim undangan.
        </p>
        <HelpDisclosure>
          <p>
            Kolom: username, full_name, email, role, class_id. Role memakai kode
            student, teacher, supervisor, committee, atau admin. Guru hanya dapat mengimpor
            siswa pada kelas penugasannya. Username dan email duplikat ditandai.
          </p>
        </HelpDisclosure>
        <div className="actions">
          <a
            className="users-download"
            download="referensi-kelas.tsv"
            href={tsvLink([
              ["class_id", "nama_kelas"],
              ...classes.map((c) => [c.id, c.name]),
            ])}
            aria-disabled={classesLoading || !!classesError}
            onClick={(e) => {
              if (classesLoading || classesError) e.preventDefault();
            }}
          >
            Unduh referensi ID kelas
          </a>
          <a
            className="users-download"
            download="template-pengguna.tsv"
            href={tsvLink([
              ["username", "full_name", "email", "role", "class_id"],
            ])}
          >
            Unduh template TSV
          </a>
        </div>
        {classesLoading ? (
          <FeedbackMessage tone="loading" role="status">Memuat kelas…</FeedbackMessage>
        ) : classesError ? (
          <FeedbackMessage tone="error" role="alert">{classesError}</FeedbackMessage>
        ) : !classes.length ? (
          <p className="muted">Belum ada kelas aktif dalam cakupan Anda.</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={classesLoading || busy}
          onClick={() => setClassesVersion((v) => v + 1)}
        >
          Muat ulang kelas
        </Button>
        <label>
          Data impor
          <textarea
            rows={5}
            maxLength={90000}
            value={bulk}
            disabled={busy}
            onChange={(e) => {
              importSequence.current++;
              setBulk(e.target.value);
              setPreview([]);
              setImportMessage(null);
            }}
            placeholder="username → nama → email → role → class_id"
          />
        </label>
        <div className="actions">
          <Button
            type="button"
            variant="outline"
            disabled={busy || !listReady}
            onClick={() => void previewUsers()}
          >
            Pratinjau
          </Button>
          <Button
            type="button"
            disabled={busy || !listReady || !validCount}
            onClick={() => void importRows()}
          >
            Impor baris valid{validCount ? ` (${validCount})` : ""}
          </Button>
        </div>
        <FeedbackText value={importMessage} />
        {!!report.length && (
          <div className="notice users-report">
            <p>Hasil impor terakhir</p>
            <a
              className="users-download"
              download="hasil-impor-pengguna.tsv"
              href={tsvLink([
                ["baris", "username", "hasil"],
                ...report.map((r) => [r.row, r.username, r.status]),
              ])}
            >
              Unduh hasil impor
            </a>
            <ul>
              {report.map((r) => (
                <li key={r.row}>
                  Baris {r.row} ({r.username}): {r.status}
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!preview.length && (
          <div
            className="table-wrap"
            tabIndex={0}
            role="region"
            aria-label="Pratinjau impor pengguna; geser untuk melihat kolom lain"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Baris</th>
                  <th scope="col">Username</th>
                  <th scope="col">Validasi</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    <td>{r.data?.username || "—"}</td>
                    <td>{r.valid ? "Valid" : r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
        ) },
      ]} />
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!lock.current) setOpen(v);
        }}
        onCloseAutoFocus={restoreListFocus}
        title={editing ? "Ubah nama pengguna" : "Tambah pengguna"}
        description={
          editing
            ? "Perbarui nama tanpa mengubah identitas akun lainnya."
            : "Akun diaktifkan melalui tautan undangan email."
        }
        className="users-dialog"
      >
        <ValidatedForm
          key={editing?.id || "new"}
          className="stack"
          onSubmit={save}
          method="post"
          action="/api/admin/users"
        >
          <fieldset
            disabled={busy || formUncertain}
            className="users-fields stack"
          >
            <label>
              Nama lengkap
              <input
                name="full_name"
                defaultValue={editing?.full_name}
                maxLength={150}
                required
                aria-invalid={fieldError === "full_name" || undefined}
                aria-describedby="user-form-feedback"
                onChange={() => setFieldError("")}
              />
            </label>
            {!editing && (
              <>
                <label>
                  Username
                  <input
                    name="username"
                    required
                    minLength={3}
                    maxLength={64}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-invalid={fieldError === "username" || undefined}
                    aria-describedby="user-form-feedback user-name-hint"
                    onChange={() => setFieldError("")}
                  />
                </label>
                <p id="user-name-hint" className="muted">
                  3–64 karakter: huruf, angka, titik, garis bawah, atau tanda
                  hubung. Huruf disimpan sebagai huruf kecil.
                </p>
                <label>
                  Email aktivasi
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={320}
                    aria-invalid={fieldError === "email" || undefined}
                    aria-describedby="user-form-feedback"
                    onChange={() => setFieldError("")}
                  />
                </label>
                <label>
                  Peran
                  <select
                    name="role"
                    value={canManage ? chosenRole : "student"}
                    disabled={!canManage || busy || formUncertain}
                    onChange={(e) => setChosenRole(e.target.value)}
                  >
                    {(canManage
                      ? ["student", "teacher", "supervisor", "committee", "admin"]
                      : ["student"]
                    ).map((r) => (
                      <option key={r} value={r}>
                        {roleLabels[r]}
                      </option>
                    ))}
                  </select>
                </label>
                {(chosenRole === "student" || !canManage) && (
                  <>
                    <label>
                      Kelas
                      <select
                        name="class_id"
                        required
                        disabled={
                          classesLoading || !!classesError || !classes.length
                        }
                        aria-invalid={fieldError === "class_id" || undefined}
                        aria-describedby="user-form-feedback"
                      >
                        <option value="">Pilih kelas aktif</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(classesError || !classes.length) && !classesLoading && (
                      <FeedbackMessage tone="info" role="status">
                        {classesError ||
                          "Belum ada kelas aktif. Periksa Data akademik atau penugasan bersama Admin."}
                      </FeedbackMessage>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={classesLoading}
                      onClick={() => setClassesVersion((v) => v + 1)}
                    >
                      Muat ulang kelas
                    </Button>
                  </>
                )}
              </>
            )}
          </fieldset>
          <div id="user-form-feedback">
            <FeedbackText value={formMessage} />
          </div>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Tutup
            </Button>
            <Button
              loading={busy}
              disabled={
                busy ||
                formUncertain ||
                !listReady ||
                (!editing &&
                  (chosenRole === "student" || !canManage) &&
                  (classesLoading || !!classesError || !classes.length))
              }
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </ValidatedForm>
      </Dialog>
      <Dialog
        onCloseAutoFocus={restoreListFocus}
        open={!!confirmation}
        onOpenChange={(v) => {
          if (!v && !lock.current) setConfirmation(null);
        }}
        title={
          confirmation?.archive
            ? "Arsipkan pengguna"
            : confirmation?.row.active
              ? "Nonaktifkan pengguna"
              : "Aktifkan pengguna"
        }
        description="Periksa akun yang dipilih sebelum mengonfirmasi perubahan."
        className="users-dialog"
      >
        <div className="stack">
          <p>
            <strong>{confirmation?.row.full_name}</strong> ·{" "}
            {confirmation?.row.username}
          </p>
          <p>
            {confirmation?.archive
              ? "Akun akan dinonaktifkan dan diarsipkan; riwayat tetap dipertahankan."
              : confirmation?.row.active
                ? "Pengguna tidak dapat masuk setelah akun dinonaktifkan."
                : "Akun diaktifkan kembali; status arsip juga dibersihkan bila ada."}
          </p>
          <FeedbackText value={confirmMessage} />
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Batal
            </Button>
            <Button
              loading={busy}
              type="button"
              variant={
                confirmation?.archive || confirmation?.row.active
                  ? "destructive"
                  : "default"
              }
              disabled={busy || confirmUncertain || !listReady}
              onClick={() => void changeStatus()}
            >
              {busy ? "Memproses…" : "Konfirmasi"}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={!!invitation}
        onOpenChange={(v) => {
          if (!v && !lock.current) setInvitation(null);
        }}
        title="Kirim ulang undangan"
        description="Periksa email terdaftar dan kelayakan akun sebelum mengirim."
        className="users-dialog"
      >
        <div className="stack">
          <p>
            <strong>{invitation?.full_name}</strong> · {invitation?.username}
          </p>
          {invitationLoading ? (
            <FeedbackMessage tone="loading" role="status">Memeriksa status akun…</FeedbackMessage>
          ) : invitationInfo ? (
            <>
              <p>
                Email tujuan:{" "}
                <strong>{invitationInfo.email || "Tidak tersedia"}</strong>
              </p>
              <p>
                {invitationInfo.eligible
                  ? "Gunakan tautan dari email terbaru; periksa inbox dan spam."
                  : invitationInfo.reason}
              </p>
            </>
          ) : null}
          <FeedbackText value={invitationMessage} />
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setInvitation(null)}
            >
              Tutup
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || invitationLoading}
              onClick={() => setInvitationVersion((v) => v + 1)}
            >
              Periksa status lagi
            </Button>
            <Button
              loading={busy}
              type="button"
              disabled={
                busy ||
                invitationLoading ||
                !invitationInfo?.eligible ||
                !listReady
              }
              onClick={() => void sendInvitation()}
            >
              {busy ? "Mengirim…" : "Kirim undangan"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
