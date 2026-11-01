"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../operations/shared";
import { Button } from "../ui/button";
import type { WorkflowData } from "../../lib/workflow/schema";
export function Workbench({role="admin"}:{role?:"admin"|"teacher"}) {
  const [data, setData] = useState<WorkflowData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void api<WorkflowData>("/api/workflow")
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="panel stack">
      <h2>{role === "admin" ? "Agenda dan kesiapan ujian" : "Agenda penyusunan soal"}</h2>
      {error ? (
        <p role="status">
          {error} <Link href="/dashboard/preparation">Periksa kembali</Link>
        </p>
      ) : !data ? (
        <p role="status">Memuat agenda…</p>
      ) : (
        <>
          <p className="muted">{role === "admin" ? "Ringkasan ujian organisasi." : "Ujian yang seluruh kelas dan mapelnya berada dalam cakupan penyusunan Anda. Antrean koreksi dapat memiliki cakupan berbeda."}</p>
          <div className="cards">
            <div>
              <b>
                {data.exams.filter((e) => e.lifecycle === "Berlangsung").length}
              </b>
              <p>Ujian berlangsung</p>
            </div>
            <div>
              <b>
                {
                  data.exams.filter((e) => e.status === "draft" && !e.ready)
                    .length
                }
              </b>
              <p>Draf perlu dilengkapi</p>
            </div>
            <div>
              <b>
                {data.exams.filter((e) => e.lifecycle === "Selesai").length}
              </b>
              <p>Ujian selesai</p>
            </div>
          </div>
          <ul className="agenda-list">
            {data.exams
              .filter((e) => e.status !== "archived")
              .sort((a, b) => {const rank=(e: typeof a)=>e.lifecycle === "Berlangsung" ? 0 : e.status === "draft" ? 1 : e.lifecycle === "Terjadwal" ? 2 : 3;return rank(a)-rank(b) || (rank(a)===3 ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at));})
              .slice(0, 6)
              .map((e) => (
                <li key={e.id}>
                  <div>
                    <strong>{e.title}</strong>
                    <span className="muted">
                      {new Date(e.starts_at).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      WIB · {e.lifecycle}
                    </span>
                  </div>
                  <Link href={`/dashboard/preparation?exam=${e.id}`}>
                    Lihat kesiapan
                  </Link>
                </li>
              ))}
          </ul>
          {!data.exams.length && <p>Belum ada ujian dalam cakupan Anda.</p>}
        </>
      )}
      <div className="actions">
        <Button asChild>
          <Link href="/dashboard/preparation">Persiapan ujian</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={role === "admin" ? "/dashboard/monitor" : "/dashboard/grading"}>{role === "admin" ? "Pantau pelaksanaan" : "Buka koreksi"}</Link>
        </Button>
      </div>
    </section>
  );
}
