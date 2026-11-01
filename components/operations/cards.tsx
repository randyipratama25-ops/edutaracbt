"use client";
import {ListFilters, SearchField} from "../ui/list-filters";
import {matchesSearch} from "../../lib/lists/search";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, useLive, type Options } from "./shared";
import { Button } from "../ui/button";
type Student = {
  student_id: string;
  student: string;
  username: string;
  room: string | null;
};
type Job = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  format: string;
};
export function CardsPanel() {
  const [options, setOptions] = useState<Options | null>(null),
    [exam, setExam] = useState(""),
    [rows, setRows] = useState<Student[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [format, setFormat] = useState("pdf"),
    [template, setTemplate] = useState("compact"),
    [jobs, setJobs] = useState<Job[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),[listLoading,setListLoading]=useState(true),[listError,setListError]=useState("");
  const sequence=useRef(0);
  useEffect(() => {
    void api<Options>("/api/operations")
      .then((d) => {
        setOptions(d);
        setExam(d.exams[0]?.id || "");
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const invalidateRequests=useCallback(()=>{sequence.current++;},[]);
  const load = useCallback(async () => {
    const seq=++sequence.current;
    try {
      const [jobs,students]=await Promise.all([api<Job[]>("/api/cards"),exam?api<Student[]>("/api/operations?action=monitor&exam="+exam):Promise.resolve([])]);
      if(seq!==sequence.current)return;
      setJobs(jobs);setRows(students);setListError("");
    } catch(e){if(seq===sequence.current){setRows([]);setJobs([]);setListError(e instanceof Error?e.message:"Data gagal dimuat.");}}
    finally{if(seq===sequence.current)setListLoading(false);}
  }, [exam]);
  useEffect(()=>{setListLoading(true);void load();return()=>{invalidateRequests();};},[load,invalidateRequests]);
  useLive(load);
  const retry=useRef<{signature:string;id:string}|null>(null);
  async function run(input: object) {
    setBusy(true);
    try {
      const data=input as Record<string,unknown>;
      const signature=JSON.stringify({...data,request_id:undefined});
      if(retry.current?.signature!==signature)retry.current={signature,id:crypto.randomUUID()};
      await api("/api/cards", data.action==='create'?{...data,request_id:retry.current.id}:input);
      retry.current=null;
      setMessage("Job kartu dibuat. Progres diperbarui otomatis.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Kartu gagal dibuat.");
    } finally {
      setBusy(false);
    }
  }
  const shown = (listLoading||listError?[]:rows).filter((r) =>
    matchesSearch(r.student + " " + r.username,search),
  );
  return (
    <section className="panel stack">
      <p>
        Kartu memuat identitas, username, ruang dan jadwal. Kata sandi akun dan
        PIN tidak dicetak.
      </p>
      <ListFilters label="kartu peserta" active={[search&&"Pencarian"].filter(Boolean) as string[]} onReset={()=>setSearch("")} total={shown.length} loading={listLoading} error={listError}>
        <label>
          Ujian
          <select
            value={exam}
            onChange={(e) => {
              setExam(e.target.value);
              setRows([]);
              setSelected([]);
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
            <option value="zip">ZIP PDF per siswa · maks. 50</option>
          </select>
        </label>
        <SearchField label="Cari siswa" value={search} maxLength={150} onChange={value=>{setSearch(value);}} />
      </ListFilters>
      <div className="actions">
        <Button
          variant="outline"
          onClick={() => setSelected(shown.map((r) => r.student_id))}
        >
          Pilih hasil pencarian
        </Button>
        <Button variant="outline" onClick={() => setSelected([])}>
          Kosongkan pilihan
        </Button>
        <Button
          disabled={
            busy ||
            !exam ||
            !selected.length ||
            (format === "zip" && selected.length > 50) ||
            selected.length > 500
          }
          onClick={() =>
            void run({
              action: "create",
              request_id: crypto.randomUUID(),
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
      <fieldset className="ops-choice-list">
        <legend>Peserta</legend>
        {shown.map((r) => (
          <label key={r.student_id}>
            <input
              type="checkbox"
              checked={selected.includes(r.student_id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, r.student_id]
                    : selected.filter((id) => id !== r.student_id),
                )
              }
            />
            {r.student} · {r.username} · {r.room || "Belum ditempatkan"}
          </label>
        ))}
      </fieldset>
      <p role="status">{message}</p>
      <h2>Job kartu</h2>
      {jobs.map((j) => (
        <div className="panel" key={j.id}>
          <p>
            {j.format.toUpperCase()} · {j.status} · {j.progress}%
          </p>
          <progress max={100} value={j.progress} aria-label="Progres kartu" />
          {j.error && <p role="alert">{j.error}</p>}
          {j.status === "ready" ? (
            <a href={"/api/cards/download?id=" + j.id}>Unduh kartu</a>
          ) : (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run({ action: "retry", job_id: j.id })}
            >
              Coba / lanjutkan proses
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
