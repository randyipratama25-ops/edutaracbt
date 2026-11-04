"use client";
import { FeedbackMessage } from "../feedback/state";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useLive, type Options } from "./shared";
import { clientRequest, ClientRequestError } from "../../lib/client/request";
import { operationOptionsSchema } from "../../lib/operations/contracts";
import {
  cardStudentsSchema,
  cardJobsSchema,
  cardReceiptSchema,
  cardLimit,
  selectCards,
} from "../../lib/operations/card-contracts";
import { matchesSearch } from "../../lib/lists/search";
import { SearchField } from "../ui/list-filters";
import { Button } from "../ui/button";
type Student = z.infer<typeof cardStudentsSchema>[number];
type Job = z.infer<typeof cardJobsSchema>[number];
const statusLabel = {
  queued: "Menunggu",
  running: "Diproses",
  ready: "Siap diunduh",
  failed: "Gagal",
};
export function CardsPanel({ enabled = true }: { enabled?: boolean }) {
  const enabledRef = useRef(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  const [options, setOptions] = useState<Options | null>(null),
    [optionError, setOptionError] = useState(""),
    [optionLoading, setOptionLoading] = useState(true),
    [optionRetry, setOptionRetry] = useState(0);
  const [exam, setExam] = useState(""),
    [rows, setRows] = useState<Student[]>([]),
    [jobs, setJobs] = useState<Job[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [format, setFormat] = useState("pdf"),
    [template, setTemplate] = useState("compact"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(false),
    [jobsLoading, setJobsLoading] = useState(true),
    [listError, setListError] = useState(""),
    [jobsError, setJobsError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const live = useRef(false),
    generation = useRef(0),
    flight = useRef<AbortController | null>(null),
    writing = useRef(false),
    mutation = useRef<AbortController | null>(null),
    retry = useRef<{ signature: string; id: string } | null>(null);
  const invalidate = useCallback(() => {
    generation.current++;
    flight.current?.abort();
    flight.current = null;
  }, []);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      invalidate();
      mutation.current?.abort();
    };
  }, [invalidate]);
  useEffect(() => {
    if (!enabled) return;
    const c = new AbortController();
    let active = true;
    setOptionLoading(true);
    setOptionError("");
    void clientRequest("/api/operations", undefined, operationOptionsSchema, c)
      .then((d) => {
        if (active) {
          setOptions(d);
          setExam((current) =>
            d.exams.some((e) => e.id === current)
              ? current
              : d.exams[0]?.id || "",
          );
        }
      })
      .catch((e) => {
        if (active) setOptionError(e.message);
      })
      .finally(() => {
        if (active) setOptionLoading(false);
      });
    return () => {
      active = false;
      c.abort();
    };
  }, [optionRetry, enabled]);
  const load = useCallback(async () => {
    if (
      !enabledRef.current ||
      !live.current ||
      writing.current ||
      flight.current
    )
      return;
    const c = new AbortController(),
      g = generation.current;
    flight.current = c;
    setJobsLoading(true);
    if (exam) setLoading(true);
    const results = await Promise.allSettled([
      clientRequest("/api/cards", undefined, cardJobsSchema, c),
      exam
        ? clientRequest(
            "/api/operations?action=monitor&exam=" + exam,
            undefined,
            cardStudentsSchema,
            c,
          )
        : Promise.resolve([]),
    ]);
    if (!live.current || g !== generation.current || flight.current !== c)
      return;
    if (results[0].status === "fulfilled") {
      setJobs(results[0].value);
      setJobsError("");
      setUncertain(false);
    } else
      setJobsError(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : "Daftar proses gagal dimuat.",
      );
    if (results[1].status === "fulfilled") {
      const students = results[1].value;
      setRows(students);
      const available = new Set(students.map((s) => s.student_id));
      setSelected((prev) => prev.filter((id) => available.has(id)));
      setListError("");
    } else {
      setRows([]);
      setListError(
        results[1].reason instanceof Error
          ? results[1].reason.message
          : "Peserta gagal dimuat.",
      );
    }
    flight.current = null;
    setLoading(false);
    setJobsLoading(false);
  }, [exam]);
  useEffect(() => {
    invalidate();
    if (!enabled) {
      setLoading(false);
      setJobsLoading(false);
      return invalidate;
    }
    setListError("");
    setLoading(Boolean(exam));
    void load();
    return invalidate;
  }, [exam, load, invalidate, enabled]);
  useLive(load, false, enabled);
  const shown = rows.filter((r) =>
      matchesSearch(r.student + " " + r.username, search),
    ),
    pages = Math.max(1, Math.ceil(shown.length / 50)),
    currentPage = Math.min(page, pages),
    limit = cardLimit(format),
    over = selected.length > limit;
  useEffect(() => {
    setPage((p) => Math.min(p, pages));
  }, [pages]);
  async function run(
    input:
      | {
          action: "create";
          exam_id: string;
          student_ids: string[];
          format: string;
          template: string;
        }
      | { action: "retry"; job_id: string },
  ) {
    if (writing.current || uncertain) return;
    writing.current = true;
    setBusy(true);
    setMessage("");
    invalidate();
    setLoading(false);
    setJobsLoading(false);
    const c = new AbortController();
    mutation.current = c;
    try {
      let payload: object = input;
      if (input.action === "create") {
        const normalized = {
            ...input,
            student_ids: [...input.student_ids].sort(),
          },
          signature = JSON.stringify(normalized);
        if (retry.current?.signature !== signature)
          retry.current = { signature, id: crypto.randomUUID() };
        payload = { ...normalized, request_id: retry.current.id };
      }
      const receipt = await clientRequest(
        "/api/cards",
        payload,
        cardReceiptSchema,
        c,
        { mutation: true },
      );
      if (!live.current) return;
      if (input.action === "create") retry.current = null;
      setMessage(
        receipt.state === "ready"
          ? "Kartu sudah siap diunduh."
          : receipt.state === "running"
            ? "Proses kartu masih berjalan. Pantau progres di bawah."
            : "Proses kartu dijadwalkan. Progres diperbarui otomatis.",
      );
    } catch (e) {
      if (live.current) {
        setMessage(e instanceof Error ? e.message : "Kartu gagal diproses.");
        if (e instanceof ClientRequestError && e.uncertain) setUncertain(true);
      }
    } finally {
      writing.current = false;
      if (live.current) {
        setBusy(false);
        void load();
      }
    }
  }
  function changeSearch(value: string) {
    setSearch(value);
    setSelected([]);
    setPage(1);
  }
  return (
    <section
      className="panel stack cards-page"
      aria-label="Kartu peserta ujian"
    >
      <p>
        Kartu berisi identitas, username, ruang dan jadwal. Kata sandi dan PIN
        tidak dicetak.
      </p>
      {optionError && (
        <div role="alert">
          <p>{optionError}</p>
          <Button
            variant="outline"
            onClick={() => setOptionRetry((v) => v + 1)}
          >
            Muat ulang pilihan ujian
          </Button>
        </div>
      )}
      <fieldset disabled={busy} className="stack cards-controls">
        <legend>Siapkan kartu</legend>
        <div className="cards-filter-grid">
          <label>
            Ujian
            <select
              value={exam}
              disabled={optionLoading}
              onChange={(e) => {
                invalidate();
                setExam(e.target.value);
                setRows([]);
                setSelected([]);
                setPage(1);
              }}
            >
              <option value="">
                {optionLoading ? "Memuat ujian…" : "Pilih ujian"}
              </option>
              {options?.exams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Template
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="compact">Ringkas · dua kolom</option>
              <option value="large">Besar · satu kolom</option>
            </select>
          </label>
          <label>
            Format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="pdf">PDF gabungan · maks. 500</option>
              <option value="zip">ZIP per siswa · maks. 50</option>
            </select>
          </label>
          <SearchField
            label="Cari nama atau username"
            value={search}
            maxLength={150}
            onChange={changeSearch}
          />
        </div>
        <div className="actions">
          <Button
            variant="outline"
            disabled={loading || !!listError || !shown.length}
            onClick={() =>
              setSelected(
                selectCards(
                  [],
                  shown.map((r) => r.student_id),
                  limit,
                ),
              )
            }
          >
            Pilih hasil · maks. {limit}
          </Button>
          <Button
            variant="outline"
            disabled={!selected.length}
            onClick={() => setSelected([])}
          >
            Kosongkan pilihan
          </Button>
          <Button
            disabled={
              !exam ||
              !selected.length ||
              over ||
              loading ||
              !!listError ||
              uncertain
            }
            onClick={() =>
              void run({
                action: "create",
                exam_id: exam,
                student_ids: selected,
                format,
                template,
              })
            }
          >
            Buat {selected.length} kartu
          </Button>
        </div>
        <FeedbackMessage tone="info" role="status">
          {selected.length} dipilih dari {shown.length} hasil
          {shown.length > limit
            ? `; pilih hasil mengambil ${limit} peserta pertama`
            : ""}
          . Pencarian atau pergantian ujian mengosongkan pilihan.
        </FeedbackMessage>
        {over && (
          <FeedbackMessage tone="error" role="alert">
            Pilihan melebihi batas {limit}. Kurangi pilihan atau gunakan PDF
            gabungan.
          </FeedbackMessage>
        )}
        {listError && (
          <FeedbackMessage tone="error" role="alert">
            {listError}
          </FeedbackMessage>
        )}
        {loading && rows.length === 0 ? (
          <FeedbackMessage tone="loading" role="status">
            Memuat peserta…
          </FeedbackMessage>
        ) : !exam ? (
          <p>Pilih ujian untuk melihat peserta.</p>
        ) : !shown.length && !listError ? (
          <p>
            {search
              ? "Tidak ada peserta yang cocok."
              : "Belum ada peserta pada ujian ini."}
          </p>
        ) : null}
        <fieldset className="ops-choice-list cards-participants">
          <legend>
            Peserta · halaman {currentPage} dari {pages}
          </legend>
          {shown.slice((currentPage - 1) * 50, currentPage * 50).map((r) => (
            <label key={r.student_id}>
              <input
                type="checkbox"
                checked={selected.includes(r.student_id)}
                disabled={
                  !selected.includes(r.student_id) && selected.length >= limit
                }
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSelected((prev) =>
                    checked
                      ? selectCards(prev, [r.student_id], limit)
                      : prev.filter((id) => id !== r.student_id),
                  );
                }}
              />
              <span>
                {r.student}
                <small>
                  {r.username} · {r.room || "Belum ditempatkan"}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        {pages > 1 && (
          <nav className="actions" aria-label="Halaman peserta">
            <Button
              variant="outline"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Sebelumnya
            </Button>
            <span>
              {currentPage} / {pages}
            </span>
            <Button
              variant="outline"
              disabled={currentPage >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Berikutnya
            </Button>
          </nav>
        )}
      </fieldset>
      <FeedbackMessage tone="info" role="status" aria-live="polite">
        {busy ? "Menjadwalkan proses kartu…" : message}
      </FeedbackMessage>
      <div className="actions">
        <h2>Proses kartu</h2>
        <Button
          variant="outline"
          disabled={busy || jobsLoading}
          onClick={() => void load()}
        >
          {jobsLoading ? "Memperbarui…" : "Perbarui status"}
        </Button>
      </div>
      {uncertain && (
        <FeedbackMessage tone="error" role="alert">
          Hasil belum pasti. Periksa status sebelum mencoba kembali dengan isian
          yang sama.
        </FeedbackMessage>
      )}
      {jobsError && (
        <FeedbackMessage tone="error" role="alert">
          {jobsError} Daftar terakhir yang berhasil dimuat dipertahankan.
        </FeedbackMessage>
      )}
      {!jobsLoading && !jobsError && !jobs.length && (
        <p>Belum ada proses kartu. Pilih peserta lalu buat kartu.</p>
      )}
      <div className="cards-jobs">
        {jobs.map((j) => (
          <article className="panel stack cards-job" key={j.id}>
            <h3>
              {j.format.toUpperCase()} · {statusLabel[j.status]}
            </h3>
            <progress
              max={100}
              value={j.progress}
              aria-label={`Progres ${j.format.toUpperCase()} ${j.progress}%`}
            />
            <span>{j.progress}%</span>
            {j.error && (
              <FeedbackMessage tone="error" role="alert">
                {j.error}
              </FeedbackMessage>
            )}
            {j.status === "ready" ? (
              <a href={"/api/cards/download?id=" + j.id}>Unduh kartu</a>
            ) : (
              <Button
                variant="outline"
                disabled={busy || uncertain}
                onClick={() => void run({ action: "retry", job_id: j.id })}
              >
                {j.status === "failed"
                  ? "Coba kembali"
                  : "Periksa / lanjutkan proses"}
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
