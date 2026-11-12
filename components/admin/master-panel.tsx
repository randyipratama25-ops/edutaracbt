"use client";
import { TaskTabs } from "../ui/task-tabs";
import {FeedbackMessage} from "../feedback/state";
import {ValidatedForm} from "../feedback/validated-form";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ListFilters, SearchField } from "../ui/list-filters";
import { matchesSearch } from "../../lib/lists/search";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { masterSchema } from "../../lib/domain/validation";
import {
  masterDataSchema,
  masterSaved,
  relationCommand,
  relationSaved,
  previewMasterBulk,
  type Master,
  type MasterData,
  type MasterKind,
  type BulkRow,
  assignmentRow,
  enrollmentRow,
} from "../../lib/master/schema";
import type { z } from "zod";
type Notice = { kind: "error" | "success" | "info"; text: string } | null;
type Relation = z.infer<typeof assignmentRow> | z.infer<typeof enrollmentRow>;
const kindLabel = (kind: MasterKind) =>
  kind === "classes" ? "kelas" : "mata pelajaran";
function Feedback({ value }: { value: Notice }) {
  return value ? (
    <FeedbackMessage tone={value.kind}
      role={value.kind === "error" ? "alert" : "status"}
      className="master-feedback"
    >
      {value.text}
    </FeedbackMessage>
  ) : null;
}
function Pager({
  page,
  total,
  onPage,
  disabled = false,
  label,
}: {
  page: number;
  total: number;
  onPage: (n: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const last = Math.max(1, Math.ceil(total / 20));
  return (
    <nav className="actions master-pagination" aria-label={`Halaman ${label}`}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Sebelumnya
      </Button>
      <span>
        Halaman {page} dari {last} · {total} data
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || page >= last}
        onClick={() => onPage(page + 1)}
      >
        Berikutnya
      </Button>
    </nav>
  );
}
function RelationList({
  data,
  student,
  busy,
  ready,
  onToggle,
}: {
  data: MasterData;
  student?: boolean;
  busy: boolean;
  ready: boolean;
  onToggle: (row: Relation) => void;
}) {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const people = useMemo(
    () => new Map(data.people.map((p) => [p.id, p.full_name])),
    [data.people],
  );
  const classes = useMemo(
    () => new Map(data.classes.map((p) => [p.id, p.name])),
    [data.classes],
  );
  const subjects = useMemo(
    () => new Map(data.subjects.map((p) => [p.id, p.name])),
    [data.subjects],
  );
  const rows: Relation[] = student ? data.enrollments : data.assignments;
  const label = student ? "keanggotaan siswa" : "penugasan guru";
  const person = (row: Relation) =>
    people.get("teacher_id" in row ? row.teacher_id : row.student_id) ||
    "Pengguna tidak tersedia";
  const filtered = rows.filter((r) =>
    matchesSearch(
      [
        person(r),
        classes.get(r.class_id) || "",
        ...("subject_id" in r ? [subjects.get(r.subject_id) || ""] : []),
      ].join(" "),
      search,
    ),
  );
  const last = Math.max(1, Math.ceil(filtered.length / 20)),
    current = Math.min(page, last);
  useEffect(() => {
    setPage((p) => Math.min(p, last));
  }, [last]);
  return (
    <section
      className="panel stack master-relations"
      aria-label={`Daftar ${label}`}
    >
      <h2>Daftar {label}</h2>
      <ListFilters
        label={label}
        active={search ? ["Pencarian"] : []}
        total={filtered.length}
        onReset={() => {
          setSearch("");
          setPage(1);
        }}
      >
        <SearchField
          label={`Cari ${label}`}
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
      </ListFilters>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label={`Tabel ${label}; geser untuk melihat kolom lain`}
      >
        <table>
          <caption className="sr-only">{label} dalam cakupan akun Anda</caption>
          <thead>
            <tr>
              <th scope="col">{student ? "Siswa" : "Guru"}</th>
              <th scope="col">Kelas</th>
              {!student && <th scope="col">Mata pelajaran</th>}
              <th scope="col">Status</th>
              {data.canManage && <th scope="col">Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.slice((current - 1) * 20, current * 20).map((row) => (
              <tr key={row.id}>
                <th scope="row">{person(row)}</th>
                <td>{classes.get(row.class_id) || "Kelas tidak tersedia"}</td>
                {!student && (
                  <td>
                    {"subject_id" in row
                      ? subjects.get(row.subject_id) || "Mapel tidak tersedia"
                      : "—"}
                  </td>
                )}
                <td>{row.active ? "Aktif" : "Nonaktif"}</td>
                {data.canManage && (
                  <td>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !ready}
                      aria-label={`${row.active ? "Nonaktifkan" : "Aktifkan"} ${label} ${person(row)}`}
                      onClick={() => onToggle(row)}
                    >
                      {row.active ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <p className="empty-state">
          {search
            ? "Tidak ada data sesuai pencarian."
            : `Belum ada ${label} dalam cakupan Anda.`}
        </p>
      )}
      <Pager
        label={label}
        page={current}
        total={filtered.length}
        onPage={setPage}
        disabled={busy}
      />
    </section>
  );
}
export function MasterPanel() {
  const [data, setData] = useState<MasterData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const [kind, setKind] = useState<MasterKind>("classes"),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [message, setMessage] = useState<Notice>(null);
  const [form, setForm] = useState<{
      kind: MasterKind;
      row: Master | null;
    } | null>(null),
    [formMessage, setFormMessage] = useState<Notice>(null),
    [formBlocked, setFormBlocked] = useState(false);
  const [assignmentType, setAssignmentType] = useState<
      "assignment" | "enrollment"
    >("assignment"),
    [assignmentMessage, setAssignmentMessage] = useState<Notice>(null),
    [assignmentBlocked, setAssignmentBlocked] = useState(false);
  const [toggle, setToggle] = useState<Relation | null>(null),
    [toggleMessage, setToggleMessage] = useState<Notice>(null),
    [toggleBlocked, setToggleBlocked] = useState(false);
  const [bulk, setBulk] = useState(""),
    [plan, setPlan] = useState<{ kind: MasterKind; rows: BulkRow[] } | null>(
      null,
    ),
    [report, setReport] = useState<
      { line: number; name: string; status: string }[]
    >([]),
    [bulkMessage, setBulkMessage] = useState<Notice>(null),
    [bulkReview, setBulkReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    mounted = useRef(false),
    generation = useRef(0),
    controllers = useRef(new Set<AbortController>()),
    focusList = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const scope = generation,
      pending = controllers.current;
    return () => {
      mounted.current = false;
      scope.current++;
      pending.forEach((c) => c.abort());
      pending.clear();
    };
  }, []);
  useEffect(() => {
    let live = true;
    const c = new AbortController();
    setLoading(true);
    setError("");
    void clientRequest("/api/admin/master", undefined, masterDataSchema, c)
      .then((d) => {
        if (live) {
          setData(d);
          setAssignmentBlocked(false);
          setBulkReview(false);
        }
      })
      .catch((e) => {
        if (live)
          setError(e instanceof Error ? e.message : "Data belum dapat dimuat.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      c.abort();
    };
  }, [version]);
  const rows = useMemo(
    () =>
      (data?.[kind] || [])
        .filter((x) => matchesSearch(x.name, q))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, "id-ID") || a.id.localeCompare(b.id),
        ),
    [data, kind, q],
  );
  const last = Math.max(1, Math.ceil(rows.length / 20)),
    current = Math.min(page, last);
  useEffect(() => {
    setPage((p) => Math.min(p, last));
  }, [last]);
  const ready = !!data && !loading && !error,
    canWrite = ready && data.canManage;
  function begin() {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    return true;
  }
  function finish() {
    lock.current = false;
    if (mounted.current) setBusy(false);
  }
  async function save<T>(payload: object, schema: z.ZodType<T>) {
    const c = new AbortController();
    controllers.current.add(c);
    try {
      return await clientRequest("/api/admin/master", payload, schema, c, {
        mutation: true,
      });
    } finally {
      controllers.current.delete(c);
    }
  }
  function reload() {
    setVersion((v) => v + 1);
  }
  function onCloseFocus(e: Event) {
    if (focusList.current) {
      e.preventDefault();
      focusList.current = false;
      document.getElementById("master-list-title")?.focus();
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !canWrite || formBlocked || lock.current) return;
    const element = event.currentTarget,
      f = new FormData(element);
    const parsed = masterSchema.safeParse({
      kind: form.kind,
      name: f.get("name"),
      ...(form.row
        ? { id: form.row.id, active: f.get("active") === "on" }
        : {}),
    });
    if (!parsed.success) {
      setFormMessage({
        kind: "error",
        text: "Nama wajib diisi, maksimal 100 karakter.",
      });
      (element.elements.namedItem("name") as HTMLElement)?.focus();
      return;
    }
    if (!begin()) return;
    const seq = generation.current;
    setFormMessage(null);
    try {
      await save(parsed.data, masterSaved);
      if (seq !== generation.current) return;
      focusList.current = true;
      setForm(null);
      setMessage({
        kind: "success",
        text: `Data ${kindLabel(parsed.data.kind)} berhasil disimpan.`,
      });
      reload();
    } catch (e) {
      if (seq === generation.current) {
        setFormMessage({
          kind: "error",
          text:
            e instanceof Error
              ? e.message
              : "Perubahan belum dapat dipastikan.",
        });
        setFormBlocked(e instanceof ClientRequestError && e.uncertain);
      }
    } finally {
      finish();
    }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canWrite || assignmentBlocked || lock.current) return;
    const element = event.currentTarget,
      f = new FormData(element);
    const parsed = relationCommand.safeParse({
      kind: assignmentType,
      user_id: f.get("user_id"),
      class_id: f.get("class_id"),
      ...(assignmentType === "assignment"
        ? { subject_id: f.get("subject_id") }
        : {}),
    });
    if (!parsed.success) {
      setAssignmentMessage({
        kind: "error",
        text: "Pilih pengguna, kelas dan mata pelajaran yang sesuai.",
      });
      return;
    }
    if (!begin()) return;
    const seq = generation.current;
    setAssignmentMessage(null);
    try {
      await save(parsed.data, relationSaved);
      if (seq !== generation.current) return;
      element.reset();
      setAssignmentMessage({
        kind: "success",
        text:
          parsed.data.kind === "assignment"
            ? "Penugasan guru berhasil disimpan."
            : "Keanggotaan siswa berhasil disimpan.",
      });
      reload();
    } catch (e) {
      if (seq === generation.current) {
        setAssignmentMessage({
          kind: "error",
          text:
            e instanceof Error ? e.message : "Penugasan belum dapat disimpan.",
        });
        setAssignmentBlocked(e instanceof ClientRequestError && e.uncertain);
      }
    } finally {
      finish();
    }
  }
  async function toggleRelation() {
    if (!toggle || !canWrite || toggleBlocked || !begin()) return;
    const row = toggle,
      seq = generation.current;
    setToggleMessage(null);
    try {
      await save(
        {
          kind: "teacher_id" in row ? "assignment" : "enrollment",
          id: row.id,
          user_id: "teacher_id" in row ? row.teacher_id : row.student_id,
          class_id: row.class_id,
          ...("subject_id" in row ? { subject_id: row.subject_id } : {}),
          active: !row.active,
        },
        relationSaved,
      );
      if (seq !== generation.current) return;
      focusList.current = true;
      setToggle(null);
      setMessage({
        kind: "success",
        text: "Status penugasan berhasil diperbarui.",
      });
      reload();
    } catch (e) {
      if (seq === generation.current) {
        setToggleMessage({
          kind: "error",
          text:
            e instanceof Error ? e.message : "Status belum dapat diperbarui.",
        });
        setToggleBlocked(e instanceof ClientRequestError && e.uncertain);
      }
    } finally {
      finish();
    }
  }
  function previewBulk() {
    if (!canWrite || busy || bulkReview) return;
    try {
      const parsed = previewMasterBulk(bulk, data![kind]);
      setReport([]);
      setBulkMessage(null);
      if (!parsed.length) {
        setBulkMessage({
          kind: "info",
          text: "Isi nama data terlebih dahulu.",
        });
        return;
      }
      setPlan({ kind, rows: parsed });
    } catch (e) {
      setBulkMessage({
        kind: "error",
        text: e instanceof Error ? e.message : "Periksa nama data.",
      });
    }
  }
  async function importBulk() {
    if (!plan || !canWrite || !plan.rows.some((r) => !r.error) || !begin())
      return;
    const snapshot = plan,
      seq = generation.current;
    setPlan(null);
    const result = snapshot.rows
        .filter((r) => r.error)
        .map((r) => ({
          line: r.line,
          name: r.name,
          status: "Dilewati: " + r.error,
        })),
      valid = snapshot.rows.filter((r) => !r.error);
    let saved = 0,
      failed = 0,
      uncertain = false;
    try {
      for (let i = 0; i < valid.length; i++) {
        if (seq !== generation.current) break;
        const row = valid[i];
        setBulkMessage({
          kind: "info",
          text: `Menyimpan ${kindLabel(snapshot.kind)} ${i + 1}/${valid.length}… Jangan tutup halaman.`,
        });
        try {
          await save({ kind: snapshot.kind, name: row.name }, masterSaved);
          saved++;
          result.push({ line: row.line, name: row.name, status: "Berhasil" });
        } catch (e) {
          if (seq !== generation.current) break;
          failed++;
          result.push({
            line: row.line,
            name: row.name,
            status: e instanceof Error ? e.message : "Gagal",
          });
          if (
            e instanceof ClientRequestError &&
            (e.uncertain || [401, 403, 429].includes(e.status || 0))
          ) {
            uncertain = e.uncertain;
            for (const next of valid.slice(i + 1))
              result.push({
                line: next.line,
                name: next.name,
                status: "Belum diproses; periksa hasil sebelum mencoba lagi.",
              });
            break;
          }
        }
      }
      if (seq !== generation.current) return;
      setReport(result.sort((a, b) => a.line - b.line));
      setBulkMessage({
        kind: failed ? "error" : "success",
        text: `${saved} berhasil; ${failed} gagal${uncertain ? " atau belum pasti" : ""}. Periksa hasil per baris.`,
      });
      setBulkReview(uncertain);
      if (!failed) setBulk("");
      reload();
    } finally {
      finish();
    }
  }
  const people =
      data?.people.filter(
        (p) =>
          p.active !== false &&
          p.role === (assignmentType === "assignment" ? "teacher" : "student"),
      ) || [],
    classes = data?.classes.filter((c) => c.active) || [],
    subjects = data?.subjects.filter((s) => s.active) || [];
  return (
    <div className="stack master-page">
      <TaskTabs label="Data akademik" items={[
        { id: "data", label: "Kelas dan mata pelajaran", content: (
          <div className="stack">
          <section className="panel stack" aria-labelledby="master-list-title">
          <div className="master-heading">
          <h2 id="master-list-title" tabIndex={-1}>
            {kind === "classes" ? "Kelas" : "Mata pelajaran"}
          </h2>
          <div className="actions">
            {data?.canManage && (
              <Button
                type="button"
                disabled={!canWrite || busy}
                onClick={() => {
                  setForm({ kind, row: null });
                  setFormMessage(null);
                  setFormBlocked(false);
                }}
              >
                Tambah data
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={loading || busy}
              onClick={reload}
            >
              Muat ulang
            </Button>
          </div>
          </div>
          <ListFilters
          label="data akademik"
          active={q ? ["Pencarian"] : []}
          onReset={() => {
            setQ("");
            setPage(1);
          }}
          total={data ? rows.length : undefined}
          loading={loading}
          error={error}
          >
          <label>
            Jenis data
            <select
              value={kind}
              disabled={busy || !!form || !!plan}
              onChange={(e) => {
                setKind(e.target.value as MasterKind);
                setPage(1);
                setBulk("");
                setReport([]);
                setBulkMessage(null);
              }}
            >
              <option value="classes">Kelas</option>
              <option value="subjects">Mata pelajaran</option>
            </select>
          </label>
          <SearchField
            label="Pencarian"
            value={q}
            maxLength={150}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          </ListFilters>
          <Feedback value={message} />
          {loading && <FeedbackMessage tone="loading" role="status">Memuat data master…</FeedbackMessage>}
          {data && (loading || error) && (
          <p className="muted">
            Menampilkan data terakhir yang berhasil dimuat. Perubahan
            dinonaktifkan sampai pembaruan berhasil.
          </p>
          )}
          {data && (
          <>
            <div
              className="table-wrap master-main-table"
              tabIndex={0}
              role="region"
              aria-label="Tabel data akademik; geser untuk melihat kolom lain"
            >
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nama</th>
                    <th scope="col">Status</th>
                    {data.canManage && <th scope="col">Aksi</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice((current - 1) * 20, current * 20).map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.name}</th>
                      <td>{row.active ? "Aktif" : "Diarsipkan"}</td>
                      {data.canManage && (
                        <td>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!canWrite || busy}
                            aria-label={`Ubah atau arsipkan ${row.name}`}
                            onClick={() => {
                              setForm({ kind, row });
                              setFormMessage(null);
                              setFormBlocked(false);
                            }}
                          >
                            Ubah / arsipkan
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="empty-state">Belum ada data sesuai pencarian.</p>
            )}
            <Pager
              label="data master"
              page={current}
              total={rows.length}
              onPage={setPage}
              disabled={busy}
            />
          </>
          )}
          </section>
          </div>
        ) },
        { id: "assign", label: "Penugasan dan keanggotaan", content: (
          <div className="stack">
          {data?.canManage && (
          <section
          className="panel stack master-bulk"
          aria-labelledby="master-bulk-title"
          >
          <h2 id="master-bulk-title" tabIndex={-1}>
            Tambah {kindLabel(kind)} massal
          </h2>
          <label>
            Nama data
            <textarea
              rows={4}
              maxLength={11000}
              disabled={busy || !ready}
              value={bulk}
              onChange={(e) => {
                setBulk(e.target.value);
                setBulkReview(false);
                setBulkMessage(null);
              }}
            />
          </label>
          <Button
            type="button"
            disabled={busy || !canWrite || !bulk.trim() || bulkReview}
            onClick={previewBulk}
          >
            Simpan data massal
          </Button>
          <Feedback value={bulkMessage} />
          {!!report.length && (
            <div
              className="master-report"
              tabIndex={0}
              role="region"
              aria-label="Hasil penyimpanan massal"
            >
              <ul>
                {report.map((r) => (
                  <li key={r.line}>
                    Baris {r.line} — {r.name}: {r.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
          </section>
          )}
          {data?.canManage && (
          <section
          className="panel stack master-assignment"
          aria-labelledby="master-assignment-title"
          >
          <h2 id="master-assignment-title">Penugasan akademik</h2>
          <ValidatedForm onSubmit={assign} method="post" action="/api/admin/master">
            <fieldset
              className="form-grid master-fields"
              disabled={busy || !canWrite || assignmentBlocked}
            >
              <label>
                Jenis
                <select
                  value={assignmentType}
                  onChange={(e) => {
                    setAssignmentType(
                      e.target.value as "assignment" | "enrollment",
                    );
                    setAssignmentMessage(null);
                  }}
                >
                  <option value="assignment">Guru → mapel dan kelas</option>
                  <option value="enrollment">Siswa → kelas</option>
                </select>
              </label>
              <label>
                Pengguna
                <select name="user_id" required key={assignmentType + version}>
                  <option value="">Pilih pengguna aktif</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kelas
                <select name="class_id" required key={"class" + version}>
                  <option value="">Pilih kelas aktif</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {assignmentType === "assignment" && (
                <label>
                  Mata pelajaran
                  <select name="subject_id" required key={"subject" + version}>
                    <option value="">Pilih mapel aktif</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Button
                disabled={
                  !people.length ||
                  !classes.length ||
                  (assignmentType === "assignment" && !subjects.length)
                }
              >
                Simpan penugasan
              </Button>
            </fieldset>
          </ValidatedForm>
          {(!people.length ||
            !classes.length ||
            (assignmentType === "assignment" && !subjects.length)) && (
            <FeedbackMessage tone="info" role="status">
              Lengkapi pengguna, kelas atau mata pelajaran aktif terlebih
              dahulu.
            </FeedbackMessage>
          )}
          <Feedback value={assignmentMessage} />
          </section>
          )}
          {data && (
          <>
          <RelationList
            data={data}
            busy={busy}
            ready={ready}
            onToggle={(row) => {
              setToggle(row);
              setToggleMessage(null);
              setToggleBlocked(false);
            }}
          />
          <RelationList
            data={data}
            student
            busy={busy}
            ready={ready}
            onToggle={(row) => {
              setToggle(row);
              setToggleMessage(null);
              setToggleBlocked(false);
            }}
          />
          </>
          )}
          </div>
        ) }
      ]} />
      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v && !lock.current) setForm(null);
        }}
        onCloseAutoFocus={onCloseFocus}
        title={form?.row ? "Ubah data master" : "Tambah data master"}
        description={`Gunakan nama ${kindLabel(form?.kind || kind)} yang unik, maksimal 100 karakter.`}
        className="master-dialog"
      >
        <ValidatedForm
          onSubmit={submit}
          method="post"
          action="/api/admin/master"
          className="stack"
          key={(form?.kind || kind) + (form?.row?.id || "new")}
        >
          <fieldset
            className="stack master-fields"
            disabled={busy || formBlocked}
          >
            <label>
              Nama
              <input
                name="name"
                defaultValue={form?.row?.name}
                maxLength={100}
                required
              />
            </label>
            {form?.row && (
              <label className="check">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={form.row.active}
                />
                Aktif
              </label>
            )}
          </fieldset>
          <div id="master-form-feedback">
            <Feedback value={formMessage} />
          </div>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setForm(null)}
            >
              Tutup
            </Button>
            <Button loading={busy} disabled={busy || formBlocked || !canWrite}>
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </ValidatedForm>
      </Dialog>
      <Dialog
        open={!!plan}
        onOpenChange={(v) => {
          if (!v && !lock.current) setPlan(null);
        }}
        onCloseAutoFocus={(event) => {
          if (lock.current) {
            event.preventDefault();
            document.getElementById("master-bulk-title")?.focus();
          }
        }}
        title="Periksa data massal"
        description={`Tujuan: ${kindLabel(plan?.kind || kind)}. Nama yang tidak valid atau duplikat dilewati.`}
        className="master-dialog"
      >
        <div className="stack">
          <p>
            {plan?.rows.filter((r) => !r.error).length || 0} nama valid dari{" "}
            {plan?.rows.length || 0} baris.
          </p>
          <ul className="master-plan">
            {plan?.rows.map((r) => (
              <li key={r.line}>
                {r.line}. {r.name} — {r.error || "Valid"}
              </li>
            ))}
          </ul>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPlan(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              disabled={busy || !canWrite || !plan?.rows.some((r) => !r.error)}
              onClick={() => void importBulk()}
            >
              Konfirmasi simpan massal
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={!!toggle}
        onOpenChange={(v) => {
          if (!v && !lock.current) setToggle(null);
        }}
        onCloseAutoFocus={onCloseFocus}
        title={toggle?.active ? "Nonaktifkan penugasan" : "Aktifkan penugasan"}
        description="Perubahan berlaku pada tautan yang dipilih; riwayat ujian tetap dipertahankan."
        className="master-dialog"
      >
        <div className="stack">
          <p>
            {toggle &&
              data?.people.find(
                (p) =>
                  p.id ===
                  ("teacher_id" in toggle
                    ? toggle.teacher_id
                    : toggle.student_id),
              )?.full_name}{" "}
            ·{" "}
            {toggle &&
              data?.classes.find((c) => c.id === toggle.class_id)?.name}
            {toggle && "subject_id" in toggle
              ? " · " +
                (data?.subjects.find((s) => s.id === toggle.subject_id)?.name ||
                  "Mapel tidak tersedia")
              : ""}
          </p>
          <p>
            {toggle?.active ? "Nonaktifkan" : "Aktifkan"} penugasan yang
            dipilih?
          </p>
          <Feedback value={toggleMessage} />
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setToggle(null)}
            >
              Batal
            </Button>
            <Button
              loading={busy}
              type="button"
              disabled={busy || toggleBlocked || !canWrite}
              onClick={() => void toggleRelation()}
            >
              {busy ? "Memproses…" : "Konfirmasi"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
