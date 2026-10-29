import { readFile } from "node:fs/promises";
import path from "node:path";
import katex from "katex";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { safeHtml } from "../authoring/schema";
import { analyze } from "../results/analytics";
import type { ResultDetail } from "../results/types";
import type { reportKinds } from "./schema";
export type ReportKind = (typeof reportKinds)[number];
export type ReportSettings = {
  school: string;
  address: string;
  official: string;
  official_title: string;
  logo_media_id: string | null;
};
export type MediaResolver = (
  id: string,
  kind: "source" | "canvas",
) => Promise<{ bytes: Uint8Array; mime: string }>;
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const labels: Record<ReportKind, string> = {
  recap: "Rekap nilai",
  class: "Rekap per kelas",
  student: "Laporan rinci peserta",
  paper: "Lembar soal",
  answers: "Lembar jawaban peserta",
  blank: "Lembar jawaban kosong",
  analytics: "Analisis butir",
};
export function rich(value: string) {
  return safeHtml(value).replace(/\$\$([^$]+)\$\$|\$([^$]+)\$/g, (_, b, i) =>
    katex.renderToString(b || i, {
      displayMode: !!b,
      throwOnError: false,
      trust: false,
    }),
  );
}
export async function reportStyles() {
  const base = path.join(process.cwd(), "node_modules/katex/dist");
  let math = await readFile(path.join(base, "katex.min.css"), "utf8");
  const urls = [
    ...new Set(Array.from(math.matchAll(/url\(([^)]+)\)/g), (m) => m[1])),
  ];
  for (const url of urls) {
    const bytes = await readFile(path.join(base, url));
    const ext = path.extname(url);
    const mime =
      ext === ".woff2"
        ? "font/woff2"
        : ext === ".woff"
          ? "font/woff"
          : "font/ttf";
    math = math
      .split(`url(${url})`)
      .join(`url(data:${mime};base64,${bytes.toString("base64")})`);
  }
  const font = (
    await readFile(path.join(process.cwd(), "public/fonts/DejaVuSans.ttf"))
  ).toString("base64");
  return `@font-face{font-family:Report;src:url(data:font/ttf;base64,${font})} ${math} @page{size:A4;margin:16mm 13mm 18mm}*{box-sizing:border-box}body{font-family:Report,sans-serif;font-size:10pt;line-height:1.55;color:#102b30}h1{font-size:17pt}h2{font-size:13pt;break-after:avoid}h3{font-size:11pt;break-after:avoid}p,li,td,div{overflow-wrap:anywhere}p{orphans:2;widows:2}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #cddbd5;padding:5pt;vertical-align:top}thead{display:table-header-group}tr{break-inside:avoid}th{background:#edf5f1}.letterhead{border-bottom:2px solid #176b58;text-align:center;margin-bottom:14pt;min-height:55pt}.letterhead img{float:left;max-width:65pt;max-height:55pt;object-fit:contain}.letterhead h1{margin:0}.letterhead p{margin:2pt 0}.sheet{break-before:page}.sheet:first-of-type{break-before:auto}.question{break-inside:auto;margin:14pt 0}.question img,.answer-image{max-width:100%;max-height:180mm;object-fit:contain}.meta{color:#496169}.blank{height:75pt;border-bottom:1px dotted #888}.signature{margin-top:25pt;margin-left:auto;width:220pt;text-align:center;break-inside:avoid}.katex{direction:ltr;unicode-bidi:isolate}.katex-display{max-width:100%;white-space:normal}.warning{border:1px solid #a65;padding:8pt} pre{white-space:pre-wrap;font:inherit}`;
}
async function mediaTag(
  id: string,
  kind: "source" | "canvas",
  resolve?: MediaResolver,
) {
  if (!resolve) return `<p class="meta">Lampiran ${esc(id)}</p>`;
  const m = await resolve(id, kind);
  if (!["image/png", "image/jpeg", "image/webp"].includes(m.mime))
    return `<p class="meta">Lampiran audio/dokumen pada aplikasi: ${esc(id)}</p>`;
  return `<img class="answer-image" alt="Lampiran jawaban/soal" src="data:${m.mime};base64,${Buffer.from(m.bytes).toString("base64")}"/>`;
}
const answerText = (value: unknown) =>
  Array.isArray(value)
    ? value.join(", ")
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>)
          .filter(([k]) => k !== "canvas_id")
          .map(([k, v]) => (k === "text" ? String(v) : `${k}: ${v}`))
          .join("\n")
      : "";
export async function reportHTML(
  details: ResultDetail[],
  kind: ReportKind,
  settings: ReportSettings,
  resolve?: MediaResolver,
) {
  let logo = "";
  if (settings.logo_media_id)
    logo = await mediaTag(settings.logo_media_id, "source", resolve);
  const header = `<header class="letterhead">${logo}<h1>${esc(settings.school)}</h1><p>${esc(settings.address)}</p></header>`;
  let body = "";
  if (kind === "recap" || kind === "class") {
    const groups = new Map<string, ResultDetail[]>();
    for (const d of details) {
      const key =
        kind === "class"
          ? d.attempt.class_name || "Kelas belum tercatat"
          : "Semua peserta";
      groups.set(key, [...(groups.get(key) || []), d]);
    }
    for (const [name, rows] of groups)
      body += `<section class="sheet">${header}<h2>${esc(labels[kind])} — ${esc(name)}</h2><table><thead><tr><th>No</th><th>Peserta</th><th>Ujian</th><th>Status</th><th>Nilai</th><th>Kelulusan</th></tr></thead><tbody>${rows.map((d, i) => `<tr><td>${i + 1}</td><td dir="auto">${esc(d.attempt.student)}</td><td>${esc(d.attempt.title)}</td><td>${esc(d.attempt.status)}${d.attempt.pending ? ` / ${d.attempt.pending} esai pending` : ""}</td><td>${d.attempt.score === null ? "Menunggu" : esc(d.attempt.score)}</td><td>${d.attempt.passed === null ? "—" : d.attempt.passed ? "Lulus" : "Belum lulus"}</td></tr>`).join("")}</tbody></table></section>`;
  } else if (kind === "analytics") {
    const a = analyze(details);
    body = `${header}<h2>Analisis butir</h2><p>${a.eligible} peserta layak; ${a.excluded} tidak masuk kohort. Kelompok atas/bawah 27%, nilai resmi final, versi soal dipisahkan.</p>`;
    for (const q of a.items)
      body += `<section class="question"><h3>${esc(q.type)} · versi ${q.version} · N=${q.n}</h3>${rich(q.stem)}<p>P=${q.p} (${q.difficulty}); D=${q.d} (${q.discrimination}); kelompok=${q.group_size}${q.small_sample ? " · sampel kecil" : ""}</p><p>Peserta salah / parsial:</p><ul>${q.wrong.map((w) => `<li dir="auto">${esc(w.student)}: ${esc(w.earned)} / ${w.max}</li>`).join("")}</ul>${q.options.map((o) => `<p>${esc(o.text)} — ${esc(JSON.stringify(o.choices))}</p>`).join("")}</section>`;
  } else
    for (const d of details) {
      body += `<section class="sheet">${header}<h2>${esc(labels[kind])}</h2><p dir="auto">${esc(d.attempt.student)} — ${esc(d.attempt.title)}</p><p class="meta">Kelas ${esc(d.attempt.class_name || "—")} · revisi ledger ${d.attempt.revision} · status ${esc(d.attempt.status)}${kind === "student" ? ` · nilai ${d.attempt.score === null ? "Menunggu" : d.attempt.score}` : ""}</p>`;
      for (const q of d.questions) {
        body += `<article class="question" dir="${q.payload.direction === "rtl" ? "rtl" : "ltr"}"><h3>${q.position}. ${esc(q.payload.type)} · ${q.payload.points} poin</h3>${rich(q.payload.stem)}`;
        for (const id of q.payload.attachments)
          body += await mediaTag(id, "source", resolve);
        if (kind === "paper" || kind === "blank")
          body += q.payload.options
            .map((o) => `<p>${esc(o.id)}. ${esc(o.text)}</p>`)
            .join("");
        if (kind === "blank") body += '<div class="blank"></div>';
        if (kind === "answers" || kind === "student") {
          body += `<h3>Jawaban peserta</h3><div>${rich(answerText(q.answer))}</div>`;
          const canvas =
            q.answer && typeof q.answer === "object" && !Array.isArray(q.answer)
              ? (q.answer as Record<string, unknown>).canvas_id
              : null;
          if (typeof canvas === "string")
            body += await mediaTag(canvas, "canvas", resolve);
          body += `<p>Nilai: ${q.earned === null ? "Belum dikoreksi" : q.earned} / ${q.payload.points}</p>`;
          if (q.comment) body += `<p>Catatan: ${esc(q.comment)}</p>`;
          if (kind === "student")
            body += `<p>Rubrik: ${esc(q.payload.rubric)}</p>`;
        }
        body += "</article>";
      }
      body += "</section>";
    }
  const signature = settings.official
    ? `<section class="signature"><p>${esc(settings.official_title)}</p><br/><br/><p>${esc(settings.official)}</p></section>`
    : "";
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${await reportStyles()}</style></head><body>${body}${signature}</body></html>`;
}
export async function renderPDF(
  details: ResultDetail[],
  kind: ReportKind,
  settings: ReportSettings,
  resolve?: MediaResolver,
  htmlOverride?: string,
) {
  const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
    import("@sparticuz/chromium"),
    import("puppeteer-core"),
  ]);
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  const merged = await PDFDocument.create();
  let bytesCount = 0;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) =>
      r.url().startsWith("data:") ? r.continue() : r.abort(),
    );
    const chunks = htmlOverride
      ? [[]]
      : kind === "recap" || kind === "class" || kind === "analytics"
        ? [details]
        : Array.from({ length: Math.ceil(details.length / 10) }, (_, i) =>
            details.slice(i * 10, i * 10 + 10),
          );
    for (const chunk of chunks) {
      await page.setContent(
        htmlOverride || (await reportHTML(chunk, kind, settings, resolve)),
        {
          waitUntil: "load",
          timeout: 30000,
        },
      );
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        timeout: 60000,
        displayHeaderFooter: false,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:8px;text-align:center;width:100%">EDUTARA CBT · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margin: { top: "16mm", bottom: "18mm", left: "13mm", right: "13mm" },
      });
      bytesCount += pdf.byteLength;
      if (bytesCount > 52428800)
        throw Error(
          "PDF melebihi 50 MiB. Bagi laporan per kelas/peserta; tidak ada halaman yang dipotong.",
        );
      const doc = await PDFDocument.load(pdf);
      if (merged.getPageCount() + doc.getPageCount() > 1500)
        throw Error(
          "Laporan melebihi 1.500 halaman; bagi permintaan menjadi beberapa job.",
        );
      for (const p of await merged.copyPages(doc, doc.getPageIndices()))
        merged.addPage(p);
    }
    const font = await merged.embedFont(StandardFonts.Helvetica);
    merged.getPages().forEach((p, i) => {
      const footer = `EDUTARA CBT - ${i + 1}/${merged.getPageCount()}`;
      p.drawText(footer, {
        x: (p.getWidth() - font.widthOfTextAtSize(footer, 8)) / 2,
        y: 18,
        size: 8,
        font,
        color: rgb(0.3, 0.4, 0.4),
      });
    });
    merged.setTitle(labels[kind]);
    merged.setAuthor(settings.school);
    return new Uint8Array(await merged.save());
  } finally {
    await browser.close();
  }
}
export function splitCell(value: string) {
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += 600)
    parts.push(value.slice(i, i + 600));
  return parts.length ? parts : [""];
}
const text = (v: unknown) => {
  const s = String(v ?? "");
  return /^[=+\-@]/.test(s) ? "'" + s : s;
};
export async function renderXLSX(
  details: ResultDetail[],
  kind: ReportKind,
  settings: ReportSettings,
  resolve?: MediaResolver,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EDUTARA CBT";
  const sheet = wb.addWorksheet("Laporan", {
    views: [{ rightToLeft: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.columns = [
    { width: 8 },
    { width: 28 },
    { width: 24 },
    { width: 62 },
    { width: 62 },
    { width: 14 },
    { width: 22 },
  ];
  sheet.addRow([text(settings.school)]);
  sheet.addRow([text(settings.address)]);
  sheet.addRow([labels[kind]]);
  if (settings.logo_media_id && resolve) {
    const logo = await resolve(settings.logo_media_id, "source");
    if (["image/png", "image/jpeg"].includes(logo.mime)) {
      const id = wb.addImage({
        base64: Buffer.from(logo.bytes).toString("base64"),
        extension: logo.mime === "image/png" ? "png" : "jpeg",
      });
      sheet.addImage(id, {
        tl: { col: 0, row: 0 },
        ext: { width: 60, height: 60 },
      });
      sheet.getRow(1).height = 48;
      sheet.getCell("B1").value = text(settings.school);
      sheet.getCell("A1").value = "";
      sheet.mergeCells("B1:G1");
    } else sheet.mergeCells("A1:G1");
  } else sheet.mergeCells("A1:G1");
  sheet.mergeCells("A2:G2");
  sheet.mergeCells("A3:G3");
  if (kind === "recap" || kind === "class") {
    sheet.addRow([
      "No",
      "Peserta",
      "Kelas",
      "Ujian",
      "Status",
      "Nilai",
      "Kelulusan",
    ]);
    details.forEach((d, i) =>
      sheet.addRow([
        i + 1,
        text(d.attempt.student),
        text(d.attempt.class_name),
        text(d.attempt.title),
        d.attempt.pending ? "Menunggu koreksi" : d.attempt.status,
        d.attempt.score === null ? "Pending" : d.attempt.score,
        d.attempt.passed === null
          ? "—"
          : d.attempt.passed
            ? "Lulus"
            : "Belum lulus",
      ]),
    );
  } else if (kind === "analytics") {
    const a = analyze(details);
    sheet.addRow([
      "No",
      "Tipe",
      "N",
      "P / kesukaran",
      "D / pembeda",
      "Kelompok",
      "Versi",
    ]);
    a.items.forEach((q, i) => {
      sheet.addRow([
        i + 1,
        q.type,
        q.n,
        `${q.p} / ${q.difficulty}`,
        `${q.d} / ${q.discrimination}`,
        q.group_size,
        q.version,
      ]);
      for (const w of q.wrong)
        sheet.addRow([
          "",
          "Salah / parsial",
          text(w.student),
          w.earned,
          "Maksimum",
          w.max,
        ]);
      for (const o of q.options)
        for (const part of splitCell(o.text))
          sheet.addRow([
            "",
            o.id,
            "Opsi/pernyataan",
            text(part),
            text(JSON.stringify(o.choices)),
          ]);
    });
  } else {
    sheet.addRow([
      "No",
      "Peserta",
      "Tipe / versi",
      "Soal (HTML/LaTeX dipertahankan)",
      "Jawaban / lanjutan",
      "Nilai",
      "Catatan / rubrik",
    ]);
    for (const d of details)
      for (const q of d.questions) {
        const stem = splitCell(q.payload.stem),
          answer = splitCell(
            kind === "paper" || kind === "blank"
              ? q.payload.options.map((o) => `${o.id}. ${o.text}`).join("\n")
              : answerText(q.answer),
          ),
          comment = splitCell(q.comment || q.payload.rubric || "");
        for (
          let i = 0;
          i < Math.max(stem.length, answer.length, comment.length);
          i++
        )
          sheet.addRow([
            i === 0 ? q.position : "↳",
            text(d.attempt.student),
            `${q.payload.type} / v${q.version}`,
            text(stem[i] || ""),
            text(answer[i] || ""),
            i === 0 ? (q.earned === null ? "Pending" : q.earned) : "",
            text(comment[i] || ""),
          ]);
        const canvas =
          q.answer && typeof q.answer === "object" && !Array.isArray(q.answer)
            ? (q.answer as Record<string, unknown>).canvas_id
            : null;
        if (canvas) sheet.addRow(["", "Canvas ID", String(canvas)]);
        for (const id of q.payload.attachments)
          sheet.addRow(["", "Lampiran ID", id]);
      }
  }
  if (settings.official)
    sheet.addRow(["", text(settings.official_title), text(settings.official)]);
  sheet.eachRow((row, i) => {
    row.font = { name: "DejaVu Sans", size: 11, bold: i <= 4 };
    row.alignment = { vertical: "top", wrapText: true };
    const vals = Array.isArray(row.values)
      ? row.values
      : Object.values(row.values);
    const max = Math.max(...vals.map((v) => String(v ?? "").length));
    row.height =
      i <= 3 ? 30 : Math.min(360, Math.max(24, Math.ceil(max / 35) * 16 + 8));
  });
  sheet.pageSetup.printTitlesRow = "1:4";
  const buffer = await wb.xlsx.writeBuffer();
  if (buffer.byteLength > 52428800)
    throw Error("Excel melebihi 50 MiB; bagi laporan.");
  return new Uint8Array(buffer);
}
