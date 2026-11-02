import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { z } from "zod";
import { rpcData, HttpError } from "../http";
import { cardClaimSchema } from "./card-contracts";
import {
  renderPDF,
  reportStyles,
  type ReportSettings,
} from "../reports/render";
export type CardSnapshot = {
  settings: ReportSettings;
  exam: { id: string; title: string; starts_at: string; ends_at: string };
  students: {
    id: string;
    name: string;
    username: string;
    room: string | null;
  }[];
};
const esc = (x: unknown) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export async function cardHTML(
  s: CardSnapshot,
  template: string,
  loginURL: string,
  logo = "",
  styles?: string,
) {
  const columns = template === "large" ? 1 : 2;
  const date = (v: string) =>
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  return `<!doctype html><html lang="id"><meta charset="utf-8"><style>${styles ?? (await reportStyles())} .cards{display:block}.card-row{display:table;table-layout:fixed;width:100%;break-inside:avoid}.card-slot{display:table-cell;vertical-align:top;padding:6pt;width:${100 / columns}%}.card{border:1.5pt solid #176b58;border-radius:8pt;padding:12pt;break-inside:avoid;overflow-wrap:anywhere}.card h2{margin:0;border-bottom:1pt solid #aaa;padding-bottom:6pt}.card p{margin:5pt 0}.card small{font-size:8pt}.card strong{font-size:12pt}</style><body><div class="cards">${s.students.map((p, i) => `${i % columns === 0 ? '<div class="card-row">' : ""}<div class="card-slot"><article class="card">${logo ? `<img src="${esc(logo)}" alt="Logo madrasah" style="float:right;width:45pt;height:45pt;object-fit:contain"/>` : ""}<h2>${esc(s.settings.school)}</h2><p>${esc(s.settings.address)}</p><p>KARTU PESERTA UJIAN</p><p dir="auto"><strong>${esc(p.name)}</strong></p><p>Username: <b>${esc(p.username)}</b></p><p>${esc(s.exam.title)}</p><p>Ruang: ${esc(p.room || "Belum ditetapkan")}</p><p>${date(s.exam.starts_at)} – ${date(s.exam.ends_at)} WIB</p><p>${esc(loginURL)}</p><small>Gunakan kata sandi akun Anda. PIN ujian disampaikan petugas saat ujian. Jaga kerahasiaan kata sandi dan hubungi petugas jika perlu bantuan.</small><p>${esc(s.settings.official_title)} · ${esc(s.settings.official)}</p></article></div>${i % columns === columns - 1 || i === s.students.length - 1 ? "</div>" : ""}`).join("")}</div></body></html>`;
}
export async function processCards(
  client: SupabaseClient,
  id: string,
  loginURL: string,
  claimed?: unknown,
) {
  let lease: string | undefined;
  const rpc = async (input: object) => {
    const r = await client.rpc("card_command", { input });
    return rpcData(r, true);
  };
  try {
    const raw = claimed ?? (await rpc({ action: "claim", job_id: id }));
    if (
      raw &&
      typeof raw === "object" &&
      (("busy" in raw && raw.busy) || ("ready" in raw && raw.ready))
    )
      return;
    const receipt = z.object({ lease: z.uuid() }).safeParse(raw);
    if (receipt.success) lease = receipt.data.lease;
    const valid = cardClaimSchema.safeParse(raw);
    if (!valid.success)
      throw new HttpError(
        422,
        "Data kartu tidak lengkap. Periksa peserta dan pengaturan laporan.",
      );
    const j = valid.data,
      snap = j.snapshot;
    const styles = await reportStyles(),
      deadline = Date.now() + 180000;
    let bytes: Uint8Array;
    let logo = "";
    if (snap.settings.logo_media_id) {
      const meta = await client
        .from("media_assets")
        .select("object_path,mime_type")
        .eq("id", snap.settings.logo_media_id)
        .single();
      if (meta.error || !meta.data)
        throw Error("Logo kartu tidak dapat diakses.");
      const file = await client.storage
        .from("exam-media")
        .download(meta.data.object_path);
      if (file.error || !file.data || file.data.size > 5242880)
        throw new HttpError(
          422,
          "Logo kartu gagal diunduh atau melebihi 5 MiB.",
        );
      if (
        ["image/png", "image/jpeg", "image/webp"].includes(meta.data.mime_type)
      )
        logo =
          "data:" +
          meta.data.mime_type +
          ";base64," +
          Buffer.from(await file.data.arrayBuffer()).toString("base64");
    }

    if (j.format === "zip") {
      const zip = new JSZip();
      let total = 0;
      for (let i = 0; i < snap.students.length; i++) {
        if (Date.now() > deadline)
          throw new HttpError(
            422,
            "Proses terlalu lama; bagi peserta menjadi batch lebih kecil.",
          );
        const html = await cardHTML(
          { ...snap, students: [snap.students[i]] },
          j.template,
          loginURL,
          logo,
          styles,
        );
        const pdf = await renderPDF(
          [],
          "student",
          snap.settings,
          undefined,
          html,
        );
        total += pdf.byteLength;
        if (total > 52428800)
          throw new HttpError(422, "Kartu melebihi 50 MiB; bagi peserta.");
        zip.file(
          `kartu-${String(i + 1).padStart(3, "0")}-${snap.students[i].id}.pdf`,
          pdf,
        );
        await rpc({
          action: "progress",
          job_id: id,
          lease,
          progress: Math.floor(5 + (80 * (i + 1)) / snap.students.length),
        });
      }
      bytes = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
      });
    } else {
      const html = await cardHTML(snap, j.template, loginURL, logo, styles);
      bytes = await renderPDF([], "student", snap.settings, undefined, html);
    }
    if (bytes.byteLength > 52428800)
      throw new HttpError(422, "Kartu melebihi 50 MiB; bagi peserta.");
    await rpc({ action: "progress", job_id: id, lease, progress: 90 });
    const path = `${j.requested_by}/${id}/${lease}/cards.${j.format}`;
    const upload = await client.storage.from("exam-cards").upload(path, bytes, {
      contentType: j.format === "pdf" ? "application/pdf" : "application/zip",
      upsert: false,
    });
    if (upload.error) throw new HttpError(503, "Penyimpanan kartu gagal.");
    await rpc({ action: "finish", job_id: id, lease, path });
  } catch (e) {
    if (lease)
      await rpc({
        action: "fail",
        job_id: id,
        lease,
        message:
          e instanceof HttpError
            ? e.message
            : "Kartu gagal dibuat. Periksa pengaturan dan coba kembali.",
      }).catch(() => {});
    console.error(JSON.stringify({ event: "card_job_failed", job_id: id }));
  }
}
