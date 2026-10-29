import type { SupabaseClient } from "@supabase/supabase-js";
import {
  renderPDF,
  renderXLSX,
  type ReportKind,
  type ReportSettings,
  type MediaResolver,
} from "./render";
import type { ResultDetail } from "../results/types";
export async function processReport(client: SupabaseClient, jobId: string) {
  let lease: string | undefined;
  async function rpc(input: unknown) {
    const r = await client.rpc("report_command", { input });
    if (r.error) throw Error(r.error.message);
    return r.data;
  }
  try {
    const job = await rpc({ action: "claim", job_id: jobId });
    if (job.busy || job.ready) return;
    lease = job.lease;
    const details: ResultDetail[] = [];
    let size = 0;
    for (let offset = 0; offset < job.ids.length; offset += 10) {
      const chunk: ResultDetail[] = await rpc({
        action: "data",
        job_id: jobId,
        lease,
        offset,
      });
      size += JSON.stringify(chunk).length;
      if (size > 30_000_000)
        throw Error(
          "Data laporan melebihi 30 MB. Bagi permintaan per kelas/peserta.",
        );
      details.push(...chunk);
      await rpc({
        action: "progress",
        job_id: jobId,
        lease,
        progress: Math.floor(
          5 + (35 * Math.min(offset + 10, job.ids.length)) / job.ids.length,
        ),
      });
    }
    const cache = new Map<
      string,
      Promise<{ bytes: Uint8Array; mime: string }>
    >();
    let mediaBytes = 0;
    const resolve: MediaResolver = async (id, kind) => {
      const key = kind + ":" + id;
      let pending = cache.get(key);
      if (!pending) {
        pending = (async () => {
          const table = kind === "canvas" ? "answer_media" : "media_assets";
          const meta = await client
            .from(table)
            .select("*")
            .eq("id", id)
            .single();
          if (meta.error || !meta.data)
            throw Error("Lampiran laporan tidak tersedia atau izin berubah.");
          const file = await client.storage
            .from(kind === "canvas" ? "attempt-canvas" : "exam-media")
            .download(meta.data.object_path);
          if (file.error) throw Error("Lampiran laporan gagal dibaca.");
          const bytes = new Uint8Array(await file.data.arrayBuffer());
          mediaBytes += bytes.length;
          if (mediaBytes > 40_000_000)
            throw Error("Lampiran melebihi 40 MB; bagi laporan.");
          return {
            bytes,
            mime: kind === "canvas" ? "image/png" : meta.data.mime_type,
          };
        })();
        cache.set(key, pending);
      }
      return pending;
    };
    await rpc({ action: "progress", job_id: jobId, lease, progress: 45 });
    const bytes =
      job.format === "pdf"
        ? await renderPDF(
            details,
            job.kind as ReportKind,
            job.settings as ReportSettings,
            resolve,
          )
        : await renderXLSX(
            details,
            job.kind as ReportKind,
            job.settings as ReportSettings,
            resolve,
          );
    await rpc({ action: "progress", job_id: jobId, lease, progress: 90 });
    if (bytes.length > 52428800) throw Error("Artefak melebihi 50 MiB.");
    const path = `${job.requested_by}/${jobId}/${lease}/report.${job.format}`;
    const mime =
      job.format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const up = await client.storage
      .from("exam-reports")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (up.error) throw Error("Unggah artefak gagal; gunakan retry.");
    await rpc({ action: "finish", job_id: jobId, lease, path });
  } catch (e) {
    if (lease) {
      const msg = e instanceof Error ? e.message : "Ekspor gagal.";
      await client.rpc("report_command", {
        input: {
          action: "fail",
          job_id: jobId,
          lease,
          message: msg.slice(0, 500),
        },
      });
    }
    console.error(
      JSON.stringify({ event: "report_job_failed", job_id: jobId }),
    );
  }
}
