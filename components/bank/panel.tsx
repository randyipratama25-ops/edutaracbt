"use client";
import { MoreActions } from "../ui/more-actions";
import { QuestionEditor } from "../authoring/question-editor";
import { QuestionMedia } from "../authoring/question-media";
import { uploadQuestionMedia } from "../../lib/authoring/upload";
import { FeedbackMessage, StateCard } from "../feedback/state";
import { ValidatedForm } from "../feedback/validated-form";
import { ListFilters, SearchField } from "../ui/list-filters";
import { HelpDisclosure } from "../ui/help-disclosure";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { z } from "zod";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { bankCommand } from "../../lib/bank/schema";
import {
  bankListFor,
  bankDetailSchema,
  bankMastersSchema,
  bankSourceSchema,
  bankQualitySchema,
  bankReceipt,
  bankDecisions,
  candidatesSchema,
  type BankInput,
} from "../../lib/bank/contracts";
import {
  questionSchema,
  types,
  type Question,
  type Kind,
} from "../../lib/authoring/schema";
import { previewImport, templates } from "../../lib/authoring/imports";
import type { BankMeta, BankRow } from "../../lib/bank/schema";
const Preview = dynamic(
  () => import("../authoring/preview").then((m) => m.QuestionPreview),
  { ssr: false },
);
const status: Record<string, string> = {
  draft: "Draf",
  revision: "Perlu revisi",
  approved: "Disetujui",
  archived: "Diarsipkan",
};
const difficultyLabels = { easy: "Mudah", medium: "Sedang", hard: "Sukar" };
type Masters = {
  classes: { id: string; name: string; active?: boolean }[];
  subjects: { id: string; name: string; active?: boolean }[];
  exams: { id: string; title: string; status: string; subject_id: string }[];
  examClasses: { exam_id: string; class_id: string }[];
};
type Detail = z.infer<typeof bankDetailSchema>;
type Rule = {
  type: Kind;
  count: number;
  points: number;
  topic: string;
  difficulty: string;
  cognitive: string;
};
type Quality = z.infer<typeof bankQualitySchema>;
const emptyMeta = (): BankMeta => ({
  subject_id: "",
  class_ids: [],
  topic: "",
  indicator: "",
  difficulty: "medium",
  cognitive: "C2",
});
function Taxonomy({
  value,
  setValue,
  masters,
}: {
  value: BankMeta;
  setValue: (v: BankMeta) => void;
  masters: Masters;
}) {
  return (
    <fieldset className="stack">
      <legend>Kategori soal</legend>
      <div className="form-grid">
        <label>
          Mata pelajaran
          <select
            required
            value={value.subject_id}
            onChange={(e) => setValue({ ...value, subject_id: e.target.value })}
          >
            <option value="">Pilih mapel</option>
            {masters.subjects.map((s) => (
              <option key={s.id} value={s.id} disabled={s.active === false}>
                {s.name}
                {s.active === false ? " (nonaktif)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Materi
          <input
            required
            maxLength={200}
            value={value.topic}
            onChange={(e) => setValue({ ...value, topic: e.target.value })}
          />
        </label>
        <label>
          Kesulitan
          <select
            value={value.difficulty}
            onChange={(e) =>
              setValue({
                ...value,
                difficulty: e.target.value as BankMeta["difficulty"],
              })
            }
          >
            {Object.entries(difficultyLabels).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level kognitif
          <select
            value={value.cognitive}
            onChange={(e) =>
              setValue({
                ...value,
                cognitive: e.target.value as BankMeta["cognitive"],
              })
            }
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>C{n}</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Indikator
        <textarea
          required
          maxLength={500}
          value={value.indicator}
          onChange={(e) => setValue({ ...value, indicator: e.target.value })}
        />
      </label>
      <strong>Kelas sasaran</strong>
      <div className="actions">
        {masters.classes
          .filter((c) => c.active !== false || value.class_ids.includes(c.id))
          .map((c) => (
            <label className="check" key={c.id}>
              <input
                type="checkbox"
                checked={value.class_ids.includes(c.id)}
                onChange={(e) =>
                  setValue({
                    ...value,
                    class_ids: e.target.checked
                      ? [...value.class_ids, c.id]
                      : value.class_ids.filter((id) => id !== c.id),
                  })
                }
              />
              {c.name}
              {c.active === false ? " (nonaktif)" : ""}
            </label>
          ))}
      </div>
    </fieldset>
  );
}
export function BankPanel() {
  const [masters, setMasters] = useState<Masters>({
      classes: [],
      subjects: [],
      exams: [],
      examClasses: [],
    }),
    [rows, setRows] = useState<BankRow[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [subject, setSubject] = useState(""),
    [filter, setFilter] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [cognitive, setCognitive] = useState("");
  const [listError, setListError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [dialog, setDialog] = useState(""),
    [editing, setEditing] = useState<BankRow | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [viewVersion, setViewVersion] = useState(1),
    [quality, setQuality] = useState<Quality | null>(null),
    [meta, setMeta] = useState<BankMeta>(emptyMeta),
    [draft, setDraft] = useState<Question>(() =>
      questionSchema.parse(templates.PG),
    ),
    [optionText, setOptionText] = useState(""),
    [keyText, setKeyText] = useState(""),
    [attachmentText, setAttachmentText] = useState(""),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState("approved");
  const [importText, setImportText] = useState(""),
    [preview, setPreview] = useState<ReturnType<typeof previewImport>>([]),
    [report, setReport] = useState<
      { row: number; saved: boolean; error?: string }[]
    >([]),
    [source, setSource] = useState(""),
    [targets, setTargets] = useState<string[]>([]),
    [rules, setRules] = useState<Rule[]>([
      {
        type: "PG",
        count: 10,
        points: 1,
        topic: "",
        difficulty: "",
        cognitive: "",
      },
    ]),
    [available, setAvailable] = useState<z.infer<typeof candidatesSchema>>([]);
  const [mastersLoading, setMastersLoading] = useState(true),
    [mastersError, setMastersError] = useState(""),
    [detailLoading, setDetailLoading] = useState(false),
    [detailError, setDetailError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [tone, setTone] = useState<"info" | "error" | "success">("info");
  const sequence = useRef(0),
    mounted = useRef(true),
    lock = useRef(false),
    retry = useRef<{ signature: string; input: BankInput } | null>(null),
    pendingAction = useRef<(() => Promise<void>) | null>(null),
    savedDialog = useRef(""),
    controllers = useRef(new Set<AbortController>()),
    readController = useRef<AbortController | null>(null),
    detailController = useRef<AbortController | null>(null),
    detailSequence = useRef(0),
    masterSequence = useRef(0),
    masterFlight = useRef<Promise<void> | null>(null),
    readFlight = useRef<{ key: string; promise: Promise<boolean> } | null>(
      null,
    );
  const request = useCallback(async function request<T>(
    url: string,
    input: object | undefined,
    schema: z.ZodType<T>,
    c = new AbortController(),
    mutation = !!input,
  ) {
    if (!mounted.current) throw Error("Permintaan dibatalkan.");
    controllers.current.add(c);
    try {
      const d = await clientRequest(url, input, schema, c, { mutation });
      if (!mounted.current) throw Error("Permintaan dibatalkan.");
      return d;
    } finally {
      controllers.current.delete(c);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const active = controllers.current,
      seq = sequence,
      detailSeq = detailSequence,
      masterSeq = masterSequence;
    return () => {
      mounted.current = false;
      seq.current++;
      detailSeq.current++;
      masterSeq.current++;
      readFlight.current = null;
      masterFlight.current = null;
      active.forEach((c) => c.abort());
    };
  }, []);
  const invalidateRequests = useCallback(() => {
    sequence.current++;
    readController.current?.abort();
    readFlight.current = null;
  }, []);
  const load = useCallback(async () => {
    if (!mounted.current) throw Error("Permintaan dibatalkan.");
    const key = new URLSearchParams({
      page: String(page),
      search: search.trim(),
      subject,
      state: filter,
      difficulty,
      cognitive,
    }).toString();
    if (readFlight.current?.key === key) return readFlight.current.promise;
    readController.current?.abort();
    const seq = ++sequence.current,
      c = new AbortController();
    readController.current = c;
    setLoading(true);
    const promise = (async () => {
      try {
        const d = await request(
          "/api/bank?" + key,
          undefined,
          bankListFor(page),
          c,
        );
        if (seq !== sequence.current) return false;
        const last = Math.min(10000, Math.max(1, Math.ceil(d.total / 25)));
        if (page > last) {
          setPage(last);
          return false;
        }
        setRows(d.rows);
        setTotal(d.total);
        setListError("");
        return true;
      } catch (e) {
        if (!mounted.current) throw e;
        if (seq === sequence.current) {
          setRows([]);
          setListError(
            e instanceof Error ? e.message : "Bank belum dapat dimuat.",
          );
        }
        return false;
      } finally {
        if (mounted.current && seq === sequence.current) {
          setLoading(false);
          readFlight.current = null;
        }
      }
    })();
    readFlight.current = { key, promise };
    return promise;
  }, [page, search, subject, filter, difficulty, cognitive, request]);
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void load().catch(() => {}), 250);
    return () => {
      clearTimeout(timer);
      invalidateRequests();
    };
  }, [load, invalidateRequests]);
  const loadMasters = useCallback(async () => {
    if (masterFlight.current) return masterFlight.current;
    const generation = ++masterSequence.current;
    setMastersLoading(true);
    const promise = (async () => {
      try {
        const d = await request("/api/authoring", undefined, bankMastersSchema);
        if (generation !== masterSequence.current) return;
        setMasters(d);
        setMastersError("");
      } catch (e) {
        if (mounted.current && generation === masterSequence.current)
          setMastersError(
            e instanceof Error
              ? e.message
              : "Pilihan kategori belum dapat dimuat.",
          );
      } finally {
        if (mounted.current && generation === masterSequence.current) {
          setMastersLoading(false);
          masterFlight.current = null;
        }
      }
    })();
    masterFlight.current = promise;
    return promise;
  }, [request]);
  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);
  async function run(fn: () => Promise<void>, isRetry = false) {
    if (lock.current || (uncertain && !isRetry)) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    setTone("info");
    pendingAction.current = fn;
    try {
      await fn();
      if (mounted.current) {
        setTone("success");
        setUncertain(false);
        pendingAction.current = null;
      }
    } catch (e) {
      if (mounted.current) {
        setTone("error");
        setMessage(
          e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join("; ")
            : e instanceof Error
              ? e.message
              : "Permintaan gagal.",
        );
        if (e instanceof ClientRequestError && e.uncertain) {
          setUncertain(true);
          savedDialog.current = dialog;
        }
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function mutate(raw: object) {
    const readOnly = "action" in raw && raw.action === "preview";
    let input: BankInput;
    if (uncertain && retry.current) input = retry.current.input;
    else {
      const signature = JSON.stringify(raw);
      input = bankCommand.parse({
        ...raw,
        request_id:
          !readOnly && retry.current?.signature === signature
            ? retry.current.input.request_id
            : crypto.randomUUID(),
      });
      if (!readOnly) retry.current = { signature, input };
    }
    if (!readOnly) invalidateRequests();
    const result = await request(
      "/api/bank",
      input,
      bankReceipt(input),
      undefined,
      !readOnly,
    );
    if (!readOnly) {
      retry.current = null;
      setUncertain(false);
    }
    return result;
  }
  function edit(row: BankRow | null) {
    if (lock.current || uncertain || mastersLoading || !!mastersError) return;
    const q = row?.payload || questionSchema.parse(templates.PG);
    setMessage("");
    setEditing(row);
    setMeta(row?.metadata || emptyMeta());
    setDraft(q);
    setOptionText(q.options.map((o) => o.id + "|" + o.text).join("\n"));
    setKeyText(q.key.join("\n"));
    setAttachmentText(q.attachments.join(", "));
    setReason("");
    setDialog("edit");
  }
  async function inspect(row: BankRow) {
    if (lock.current || uncertain) return;
    detailController.current?.abort();
    const seq = ++detailSequence.current,
      c = new AbortController();
    detailController.current = c;
    setDialog("detail");
    setEditing({ ...row });
    setDetail(null);
    setQuality(null);
    setReason("");
    setMessage("");
    setDetailError("");
    setDetailLoading(true);
    try {
      const d = await request(
        "/api/bank?action=detail&id=" + row.id,
        undefined,
        bankDetailSchema.refine((d) => d.item.id === row.id),
        c,
      );
      if (seq === detailSequence.current) {
        setDetail(d);
        setViewVersion(d.item.version);
        setDecision(bankDecisions(d.item, row)[0] || "");
      }
    } catch (e) {
      if (mounted.current && seq === detailSequence.current)
        setDetailError(
          e instanceof Error ? e.message : "Rincian soal belum dapat dimuat.",
        );
    } finally {
      if (mounted.current && seq === detailSequence.current)
        setDetailLoading(false);
    }
  }
  function closeDialog() {
    if (lock.current) return;
    detailSequence.current++;
    detailController.current?.abort();
    setDialog("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const q = questionSchema.parse({
        ...draft,
        options: optionText.trim()
          ? optionText
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const at = line.indexOf("|");
                if (at < 1) throw Error("Opsi harus memakai format ID|teks.");
                return {
                  id: line.slice(0, at).trim(),
                  text: line.slice(at + 1).trim(),
                };
              })
          : [],
        key: keyText.trim()
          ? keyText
              .trim()
              .split("\n")
              .map((x) => x.trim())
          : [],
        attachments: attachmentText.split(/[,\s]+/).filter(Boolean),
      });
      await mutate({
        action: "save",
        ...(editing
          ? { id: editing.id, expected_version: editing.version }
          : {}),
        meta,
        payload: q,
        reason,
      });
      setDialog("");
      await load();
      setMessage(
        "Versi soal disimpan sebagai draf. Lakukan review sebelum menyusun paket.",
      );
    });
  }
  function changeRule(i: number, patch: Partial<Rule>) {
    setRules((xs) => xs.map((r, j) => (i === j ? { ...r, ...patch } : r)));
    setAvailable([]);
  }
  const cleanRules = () =>
    rules.map((r) => ({
      ...r,
      topic: r.topic || undefined,
      difficulty: r.difficulty || undefined,
      cognitive: r.cognitive || undefined,
    }));
  return (
    <div className="stack bank-page">
      {uncertain && !dialog && (
        <StateCard
          kind="error"
          title="Hasil tindakan belum pasti"
          description="Periksa hasil sebelum mengirim permintaan baru. Isian Anda tetap tersedia selama halaman ini terbuka."
          actions={
            <Button onClick={() => setDialog(savedDialog.current)}>
              Kembali ke tindakan tertunda
            </Button>
          }
        />
      )}
      <fieldset className="bank-controls stack" disabled={busy || uncertain}>
        <div className="actions">
          <Button
            disabled={busy || mastersLoading || !!mastersError}
            onClick={() => edit(null)}
          >
            Tambah soal bank
          </Button>
          <MoreActions>
            <Button
              variant="outline"
              disabled={busy || mastersLoading || !!mastersError}
              onClick={() => {
                setMeta(emptyMeta());
                setReason("");
                setPreview([]);
                setReport([]);
                setImportText("");
                setDialog("import");
              }}
            >
              Impor / ambil dari ujian
            </Button>
            <Button
              variant="outline"
              disabled={busy || mastersLoading || !!mastersError}
              onClick={() => {
                setAvailable([]);
                setDialog("pack");
              }}
            >
              Susun paket dari kisi-kisi
            </Button>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              Muat ulang
            </Button>
          </MoreActions>
        </div>
        <FeedbackMessage
          tone={tone}
          role={tone === "error" ? "alert" : "status"}
        >
          {message}
        </FeedbackMessage>
        {mastersLoading && (
          <FeedbackMessage tone="loading">
            Memuat kategori dan ujian…
          </FeedbackMessage>
        )}
        {mastersError && (
          <StateCard
            kind="error"
            title="Kategori belum dapat dimuat"
            description={mastersError}
            actions={
              <Button onClick={() => void loadMasters()}>
                Coba muat kategori
              </Button>
            }
          />
        )}
        <section className="panel stack">
          <ListFilters
            label="bank soal"
            active={
              [
                search && "Pencarian",
                subject && "Mapel",
                filter && "Status",
                difficulty && "Kesulitan",
                cognitive && "Kognitif",
              ].filter(Boolean) as string[]
            }
            onReset={() => {
              setSearch("");
              setSubject("");
              setFilter("");
              setDifficulty("");
              setCognitive("");
              setPage(1);
            }}
            total={total}
            loading={loading}
            error={listError}
          >
            <SearchField
              maxLength={150}
              label="Cari materi, indikator, isi"
              value={search}
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <label>
              Mapel
              <select
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua</option>
                {masters.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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
                {Object.entries(status).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kesulitan
              <select
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua</option>
                {Object.entries(difficultyLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kognitif
              <select
                value={cognitive}
                onChange={(e) => {
                  setCognitive(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Semua</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>C{n}</option>
                ))}
              </select>
            </label>
          </ListFilters>
          {loading ? (
            <FeedbackMessage tone="loading" role="status">
              Memuat bank soal…
            </FeedbackMessage>
          ) : (
            <>
              <div
                className="table-wrap"
                tabIndex={0}
                role="region"
                aria-label="Tabel bank soal"
              >
                <table className="bank-table">
                  <thead>
                    <tr>
                      <th>Soal / materi</th>
                      <th>Kategori</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <th scope="row">
                          {r.payload.stem.replace(/<[^>]*>/g, "").slice(0, 140)}
                          <small className="block muted">
                            {r.metadata.topic} · v{r.version}
                          </small>
                        </th>
                        <td>
                          {r.payload.type} · {r.metadata.cognitive} ·{" "}
                          {difficultyLabels[r.metadata.difficulty]}
                        </td>
                        <td>{status[r.state]}</td>
                        <td>
                          <div className="actions">
                            <Button
                              variant="outline"
                              disabled={busy}
                              onClick={() => void inspect(r)}
                            >
                              Detail & review
                            </Button>
                            {r.can_edit && (
                              <Button
                                variant="outline"
                                disabled={
                                  busy || mastersLoading || !!mastersError
                                }
                                onClick={() => edit(r)}
                              >
                                Ubah
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!rows.length && !listError && (
                <StateCard
                  kind={
                    search || subject || filter || difficulty || cognitive
                      ? "no-results"
                      : "empty"
                  }
                  className="empty-state"
                >
                  <h2>Belum ada soal pada filter ini</h2>
                  <p>
                    Tambahkan soal atau impor dari ujian yang dapat Anda susun.
                  </p>
                </StateCard>
              )}
            </>
          )}
          <div className="actions">
            <Button
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Sebelumnya
            </Button>
            <span>
              Halaman {page} /{" "}
              {listError ? "—" : Math.max(1, Math.ceil(total / 25))} ·{" "}
              {listError ? "—" : total} soal
            </span>
            <Button
              variant="outline"
              disabled={page * 25 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Berikutnya
            </Button>
          </div>
        </section>
      </fieldset>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!v) closeDialog();
        }}
        className="bank-dialog"
        title={
          {
            edit: "Editor bank soal",
            detail: "Versi, review dan kualitas",
            import: "Impor ke bank soal",
            pack: "Paket berdasarkan kisi-kisi",
          }[dialog] || "Bank soal"
        }
        description="Perubahan bank soal tidak mengubah soal pada ujian yang sudah digunakan."
      >
        <fieldset className="bank-controls stack" disabled={busy || uncertain}>
          {dialog === "edit" && (
            <ValidatedForm className="stack" aria-busy={busy} onSubmit={save}>
              <Taxonomy value={meta} setValue={setMeta} masters={masters} />
              <label>
                Tipe soal
                <select
                  disabled={!!editing}
                  value={draft.type}
                  onChange={(e) => {
                    const q = questionSchema.parse(templates[e.target.value]);
                    setDraft(q);
                    setOptionText(
                      q.options.map((o) => o.id + "|" + o.text).join("\n"),
                    );
                    setKeyText(q.key.join("\n"));
                  }}
                >
                  {types.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <QuestionEditor value={draft.stem} direction={draft.direction} disabled={busy}
                onChange={(stem) => setDraft((current) => ({ ...current, stem }))} />
              <div className="form-grid">
                <label>
                  Poin
                  <input
                    required
                    type="number"
                    min={0.01}
                    max={10000}
                    step="any"
                    value={draft.points}
                    onChange={(e) =>
                      setDraft({ ...draft, points: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Arah teks
                  <select
                    value={draft.direction}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        direction: e.target.value as "ltr" | "rtl",
                      })
                    }
                  >
                    <option value="ltr">Kiri ke kanan</option>
                    <option value="rtl">Kanan ke kiri</option>
                  </select>
                </label>
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.required}
                  onChange={(e) =>
                    setDraft({ ...draft, required: e.target.checked })
                  }
                />
                Wajib dijawab
              </label>
              {draft.type !== "Esai" ? (
                <>
                  <label>
                    Opsi / pernyataan (ID|teks per baris)
                    <textarea
                      required
                      rows={5}
                      value={optionText}
                      onChange={(e) => setOptionText(e.target.value)}
                    />
                  </label>
                  <label>
                    Kunci per baris (BS: true/false; JODOH: pasangan berurutan)
                    <textarea
                      required
                      value={keyText}
                      onChange={(e) => setKeyText(e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Pedoman rubrik
                    <textarea
                      value={draft.rubric}
                      onChange={(e) =>
                        setDraft({ ...draft, rubric: e.target.value })
                      }
                    />
                  </label>
                  <fieldset className="stack">
                    <legend>Kriteria rubrik (total = poin esai)</legend>
                    {(draft.rubricCriteria || []).map((c, i) => (
                      <div className="criterion-editor" key={c.id}>
                        <label>
                          Kriteria {i + 1}
                          <input
                            required
                            maxLength={250}
                            value={c.label}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                rubricCriteria: draft.rubricCriteria!.map(
                                  (x, j) =>
                                    j === i
                                      ? { ...x, label: e.target.value }
                                      : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          Bobot
                          <input
                            required
                            type="number"
                            min={0.01}
                            max={10000}
                            step="any"
                            value={c.maxPoints}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                rubricCriteria: draft.rubricCriteria!.map(
                                  (x, j) =>
                                    j === i
                                      ? {
                                          ...x,
                                          maxPoints: Number(e.target.value),
                                        }
                                      : x,
                                ),
                              })
                            }
                          />
                        </label>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              rubricCriteria: draft.rubricCriteria!.filter(
                                (_, j) => j !== i,
                              ),
                            })
                          }
                        >
                          Hapus kriteria {i + 1}
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={(draft.rubricCriteria?.length || 0) >= 12}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          rubricCriteria: [
                            ...(draft.rubricCriteria || []),
                            {
                              id: "r" + crypto.randomUUID().slice(0, 8),
                              label: "",
                              maxPoints: 1,
                            },
                          ],
                        })
                      }
                    >
                      Tambah kriteria
                    </Button>
                  </fieldset>
                  <label>
                    Minimum karakter
                    <input
                      type="number"
                      min={0}
                      max={50000}
                      value={draft.minChars}
                      onChange={(e) =>
                        setDraft({ ...draft, minChars: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.canvas.enabled}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          canvas: {
                            ...draft.canvas,
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Aktifkan canvas jawaban
                  </label>
                </>
              )}
              <label>
                Pembahasan
                <textarea
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft({ ...draft, explanation: e.target.value })
                  }
                />
              </label>
              <label>
                ID lampiran, pisahkan koma
                <input
                  value={attachmentText}
                  disabled={busy}
                  onChange={(e) => setAttachmentText(e.target.value)}
                />
              </label>
              <QuestionMedia disabled={busy} onUpload={(file) => void run(async () => {
                if (attachmentText.split(/[,\s]+/).filter(Boolean).length >= 10)
                  throw Error("Maksimal 10 lampiran.");
                const controller = new AbortController();
                controllers.current.add(controller);
                try {
                  const { id } = await uploadQuestionMedia(file, controller.signal);
                  if (mounted.current) {
                    setAttachmentText((current) => [current.trim(), id].filter(Boolean).join(", "));
                    setMessage("Lampiran ditambahkan ke draf soal.");
                  }
                } finally {
                  controllers.current.delete(controller);
                }
              })} />
              <details>
                <summary>Pratinjau isi soal dan media</summary>
                <Preview question={{ ...draft, attachments: attachmentText.split(/[,\s]+/).filter((id) => z.uuid().safeParse(id).success) }}
                  showKey={false} showOptions={false} showMeta={false} />
              </details>
              <Link
                href="/dashboard/media"
                target="_blank"
                rel="noopener noreferrer"
              >
                Kelola media (tab baru)
              </Link>
              <label>
                Catatan versi
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button disabled={busy}>Simpan draf soal</Button>
            </ValidatedForm>
          )}
          {dialog === "detail" && detailLoading && (
            <FeedbackMessage tone="loading">
              Memuat versi dan review…
            </FeedbackMessage>
          )}
          {dialog === "detail" && detailError && (
            <StateCard
              kind="error"
              title="Rincian belum dapat dimuat"
              description={detailError}
              actions={
                <Button onClick={() => editing && void inspect(editing)}>
                  Coba muat rincian
                </Button>
              }
            />
          )}
          {dialog === "detail" && detail && (
            <div className="stack">
              <label>
                Versi
                <select
                  value={viewVersion}
                  onChange={(e) => setViewVersion(Number(e.target.value))}
                >
                  {detail.versions.map((v) => (
                    <option key={v.version} value={v.version}>
                      v{v.version} — {v.reason}
                    </option>
                  ))}
                </select>
              </label>
              <Preview
                question={
                  detail.versions.find((v) => v.version === viewVersion)
                    ?.payload || detail.item.payload
                }
              />
              {detail.similar > 0 && (
                <p className="notice">
                  Ada {detail.similar} soal dengan teks pertanyaan sama. Tinjau
                  kemungkinan duplikasi opsi/kunci.
                </p>
              )}
              <h3>Riwayat review</h3>
              <ul>
                {detail.reviews.map((r) => (
                  <li key={r.id}>
                    v{r.version} · {status[r.decision]} — {r.reason}
                  </li>
                ))}
              </ul>
              {viewVersion !== detail.item.version && (
                <p className="notice">
                  Anda sedang melihat versi lama. Pilih versi terbaru sebelum
                  memberi keputusan.
                </p>
              )}
              <ValidatedForm
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    viewVersion !== detail.item.version ||
                    !editing ||
                    !bankDecisions(detail.item, editing).includes(decision)
                  )
                    return;
                  void run(async () => {
                    await mutate({
                      action: "review",
                      id: detail.item.id,
                      expected_version: detail.item.version,
                      decision,
                      reason,
                    });
                    setDialog("");
                    await load();
                    setMessage("Keputusan review disimpan.");
                  });
                }}
              >
                <label>
                  Keputusan
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    {(editing ? bankDecisions(detail.item, editing) : []).map(
                      (s) => (
                        <option key={s} value={s}>
                          {status[s]}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Catatan review
                  <textarea
                    required
                    minLength={5}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button
                  disabled={
                    busy || viewVersion !== detail.item.version || !decision
                  }
                >
                  Simpan keputusan review
                </Button>
              </ValidatedForm>
              <h3>Riwayat pemakaian</h3>
              {detail.usage.length ? (
                <ul>
                  {detail.usage.map((u, i) => (
                    <li key={i}>
                      {u.title} · bank v{u.bank_version} · {u.points} poin ·{" "}
                      {u.attempts} hasil peserta yang dapat Anda akses
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Belum digunakan melalui penyusunan paket bank.</p>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setQuality(null);
                    setQuality(
                      await request(
                        "/api/bank?action=quality&id=" + detail.item.id,
                        undefined,
                        bankQualitySchema,
                      ),
                    );
                  })
                }
              >
                Hitung statistik kualitas
              </Button>
              {quality && (
                <>
                  <p>
                    {quality.eligible} hasil final berizin, maksimal 300
                    pengerjaan terbaru. P = rerata proporsi skor; D = selisih
                    kelompok atas/bawah 27%. Sampel di bawah 30 bersifat
                    eksploratif.
                  </p>
                  {quality.items.map((q) => (
                    <section className="notice" key={q.id}>
                      <strong>
                        N={q.n} · P={q.p} · D={q.d} ({q.discrimination})
                      </strong>
                      {q.small_sample && (
                        <p>
                          Sampel kecil — hindari keputusan kualitas tunggal.
                        </p>
                      )}
                      {q.options.map((o) => (
                        <p key={o.id}>
                          {o.id}:{" "}
                          {["PG", "PG_KOMPLEKS"].includes(q.type)
                            ? `${(100 * o.selection_rate).toFixed(1)}% memilih · ${o.is_key ? "Kunci" : o.nonfunctional ? "Pengecoh jarang dipilih (<5%)" : "Pengecoh"}`
                            : JSON.stringify(o.choices)}
                        </p>
                      ))}
                    </section>
                  ))}
                  {!quality.items.length && (
                    <p>Belum ada hasil final resmi yang layak dianalisis.</p>
                  )}
                </>
              )}
            </div>
          )}
          {dialog === "import" && (
            <ValidatedForm
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const valid = preview.filter((p) => p.question);
                  const result = (await mutate({
                    action: "import",
                    meta,
                    reason,
                    items: valid.map((p) => p.question),
                  })) as typeof report;
                  setReport(
                    result.map((r) => ({ ...r, row: valid[r.row - 1].block })),
                  );
                  setPreview([]);
                  await load();
                  setMessage("Impor selesai. Periksa hasil per baris.");
                });
              }}
            >
              <Taxonomy value={meta} setValue={setMeta} masters={masters} />
              <details>
                <summary>Ambil soal dari ujian</summary>
                <label>
                  Ujian sumber
                  <select
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                  >
                    <option value="">Pilih ujian</option>
                    {masters.exams.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !source}
                  onClick={() =>
                    void run(async () => {
                      const d = await request(
                          "/api/authoring?exam=" + source,
                          undefined,
                          bankSourceSchema,
                        ),
                        ex = masters.exams.find((e) => e.id === source);
                      if (!ex)
                        throw Error(
                          "Ujian sumber tidak tersedia. Muat ulang pilihan ujian.",
                        );
                      setMeta((m) => ({
                        ...m,
                        subject_id: ex.subject_id,
                        class_ids: masters.examClasses
                          .filter((c) => c.exam_id === source)
                          .map((c) => c.class_id),
                      }));
                      setImportText(
                        JSON.stringify(
                          d.questions.map((q) => q.payload),
                          null,
                          2,
                        ),
                      );
                      setPreview([]);
                    })
                  }
                >
                  Ambil untuk pratinjau
                </Button>
              </details>
              <a
                download="template-bank.json"
                href={
                  "data:application/json;charset=utf-8," +
                  encodeURIComponent(
                    JSON.stringify(Object.values(templates), null, 2),
                  )
                }
              >
                Unduh template lima tipe
              </a>
              <label>
                Data JSON / teks impor
                <textarea
                  rows={7}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setPreview([]);
                  }}
                />
              </label>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const p = previewImport(importText);
                    if (p.length > 100)
                      throw Error("Maksimal 100 soal per impor bank.");
                    setPreview(p);
                  })
                }
              >
                Pratinjau impor bank
              </Button>
              <ol>
                {preview.map((p) => (
                  <li key={p.block}>
                    Baris {p.block}: {p.error || `${p.question!.type} valid`}
                  </li>
                ))}
              </ol>
              <label>
                Catatan impor
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <Button disabled={busy || !preview.some((p) => p.question)}>
                Impor soal valid
              </Button>
              {report.length > 0 && (
                <>
                  <a
                    download="hasil-impor-bank.tsv"
                    href={
                      "data:text/tab-separated-values;charset=utf-8," +
                      encodeURIComponent(
                        "baris\thasil\n" +
                          report
                            .map(
                              (r) =>
                                r.row +
                                "\t" +
                                (r.saved
                                  ? "Berhasil"
                                  : r.error || "Gagal"
                                ).replace(/[\r\n\t]/g, " "),
                            )
                            .join("\n"),
                      )
                    }
                  >
                    Unduh hasil impor bank
                  </a>
                  <ul>
                    {report.map((r) => (
                      <li key={r.row}>
                        Baris {r.row}: {r.saved ? "Berhasil" : r.error}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </ValidatedForm>
          )}
          {dialog === "pack" && (
            <div className="stack">
              <fieldset>
                <legend>Ujian draf sasaran (maksimal 3)</legend>
                {masters.exams
                  .filter((e) => e.status === "draft")
                  .map((e) => (
                    <label className="check" key={e.id}>
                      <input
                        type="checkbox"
                        checked={targets.includes(e.id)}
                        disabled={
                          !targets.includes(e.id) && targets.length >= 3
                        }
                        onChange={(event) => {
                          setTargets((xs) =>
                            event.target.checked
                              ? [...xs, e.id]
                              : xs.filter((id) => id !== e.id),
                          );
                          setAvailable([]);
                        }}
                      />
                      {e.title}
                    </label>
                  ))}
              </fieldset>
              {rules.map((r, i) => (
                <fieldset className="stack" key={i}>
                  <legend>Kelompok {i + 1}</legend>
                  <div className="form-grid">
                    <label>
                      Tipe
                      <select
                        value={r.type}
                        onChange={(e) =>
                          changeRule(i, { type: e.target.value as Kind })
                        }
                      >
                        {types.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Jumlah
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={r.count}
                        onChange={(e) =>
                          changeRule(i, { count: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Poin per soal
                      <input
                        type="number"
                        min={0.01}
                        max={10000}
                        step="any"
                        value={r.points}
                        onChange={(e) =>
                          changeRule(i, { points: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Materi (opsional)
                      <input
                        value={r.topic}
                        onChange={(e) =>
                          changeRule(i, { topic: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Kesulitan
                      <select
                        value={r.difficulty}
                        onChange={(e) =>
                          changeRule(i, { difficulty: e.target.value })
                        }
                      >
                        <option value="">Semua</option>
                        {Object.entries(difficultyLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Kognitif
                      <select
                        value={r.cognitive}
                        onChange={(e) =>
                          changeRule(i, { cognitive: e.target.value })
                        }
                      >
                        <option value="">Semua</option>
                        {[1, 2, 3, 4, 5, 6].map((n) => (
                          <option key={n}>C{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Button
                    variant="outline"
                    disabled={rules.length === 1}
                    onClick={() => {
                      setRules((xs) => xs.filter((_, j) => j !== i));
                      setAvailable([]);
                    }}
                  >
                    Hapus kelompok {i + 1}
                  </Button>
                </fieldset>
              ))}
              <Button
                variant="outline"
                disabled={rules.length >= 20}
                onClick={() => {
                  setRules((xs) => [
                    ...xs,
                    {
                      type: "Esai",
                      count: 1,
                      points: 5,
                      topic: "",
                      difficulty: "",
                      cognitive: "",
                    },
                  ]);
                  setAvailable([]);
                }}
              >
                Tambah kelompok kisi-kisi
              </Button>
              <p>
                {rules.reduce((n, r) => n + r.count, 0)} soal ·{" "}
                {rules.reduce((n, r) => n + r.count * r.points, 0)} poin per
                paket. Esai mempertahankan bobot rubrik asli.
              </p>
              <div className="actions">
                <Button
                  variant="outline"
                  disabled={busy || !targets.length || targets.length > 3}
                  onClick={() =>
                    void run(async () =>
                      setAvailable(
                        (await mutate({
                          action: "preview",
                          exam_ids: targets,
                          rules: cleanRules(),
                        })) as typeof available,
                      ),
                    )
                  }
                >
                  Periksa kandidat kisi-kisi
                </Button>
                <Button
                  disabled={
                    busy ||
                    !available.length ||
                    available.some((x) => x.available < x.rule.count)
                  }
                  onClick={() =>
                    void run(async () => {
                      await mutate({
                        action: "assemble",
                        exam_ids: targets,
                        rules: cleanRules(),
                      });
                      setDialog("");
                      setAvailable([]);
                      setMessage(
                        "Paket disimpan pada ujian draf. Periksa kesiapan sebelum publikasi jadwal.",
                      );
                    })
                  }
                >
                  Susun paket ujian
                </Button>
              </div>
              <ul>
                {available.map((x, i) => (
                  <li key={i}>
                    {masters.exams.find((e) => e.id === x.exam_id)?.title} ·{" "}
                    {x.rule.type}: {x.available} tersedia / {x.rule.count}{" "}
                    diperlukan
                  </li>
                ))}
              </ul>
              <HelpDisclosure>
                <p>
                  Paket memiliki komposisi setara menurut kisi-kisi, bukan
                  jaminan kesetaraan psikometrik. Kandidat antar kelompok dapat
                  bertumpang tindih; server membatalkan seluruh paket jika
                  komposisi tidak terpenuhi. Soal tidak berulang dalam satu
                  paket.
                </p>
              </HelpDisclosure>
            </div>
          )}
        </fieldset>
        <FeedbackMessage
          tone={tone}
          role={tone === "error" ? "alert" : "status"}
        >
          {message}
        </FeedbackMessage>
        {uncertain && (
          <div className="notice" role="alert">
            <p>
              Hasil belum pasti. Isian dikunci agar pemeriksaan ulang memakai
              permintaan yang sama.
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                pendingAction.current && void run(pendingAction.current, true)
              }
            >
              Periksa / ulangi tindakan
            </Button>
            <Button variant="outline" disabled={busy} onClick={closeDialog}>
              Tutup sementara
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
