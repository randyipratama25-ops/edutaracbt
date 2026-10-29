import { createClient } from "@supabase/supabase-js";
import {
  sha256,
  reminderText,
  ambiguousDelivery,
  readSmallBody,
} from "./shared.ts";
Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return new Response("Too large", { status: 413 });
  let id = "",
    lease = "",
    sending = false;
  let client: ReturnType<typeof createClient> | undefined;
  try {
    const text = await readSmallBody(request);
    if (text.length > 2048) throw Error("Request too large");
    const input = JSON.parse(text);
    if (
      !/^[0-9a-f-]{36}$/i.test(input.id) ||
      !/^[0-9a-f-]{36}$/i.test(input.nonce)
    )
      return new Response("Unauthorized", { status: 401 });
    id = input.id;
    client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const rpc = async (action: string, extra: Record<string, unknown> = {}) => {
      const r = await client!.rpc("worker_command", {
        input: { action, id, lease, ...extra },
      });
      if (r.error) throw Error(r.error.message);
      return r.data;
    };
    let job;
    try {
      job = await rpc("claim", { nonce: input.nonce });
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }
    if (job.busy) return Response.json({ accepted: true });
    lease = job.lease;
    const root = `${job.organization_id}/${id}`;
    const encoder = new TextEncoder();
    const upload = async (
      path: string,
      bytes: Uint8Array,
      type = "application/json",
    ) => {
      if (bytes.byteLength > 52428800)
        throw Error("Bagian backup melebihi 50 MiB.");
      const hash = await sha256(bytes);
      const r = await client!.storage
        .from("system-backups")
        .upload(path, bytes, { contentType: type, upsert: false });
      if (r.error) {
        const old = await client!.storage.from("system-backups").download(path);
        if (
          old.error ||
          (await sha256(new Uint8Array(await old.data.arrayBuffer()))) !== hash
        )
          throw Error("Penyimpanan/checksum backup gagal.");
      }
      return hash;
    };
    const part = async (
      number: number,
      path: string,
      bytes: Uint8Array,
      kind: string,
      metadata: Record<string, unknown> = {},
    ) => {
      const hash = await upload(
        path,
        bytes,
        kind === "object" ? "application/octet-stream" : "application/json",
      );
      await rpc("part", {
        number,
        path,
        sha256: hash,
        bytes: bytes.byteLength,
        kind,
        metadata,
      });
      return hash;
    };
    if (job.kind === "backup") {
      const state = job.payload || {},
        phase = state.phase || "capture";
      if (phase === "capture") {
        const meta = await rpc("capture");
        const objects = await rpc("objects");
        const bytes = encoder.encode(
          JSON.stringify({
            format: "edutara-application-backup-v1",
            captured_at: job.created_at,
            job_id: id,
            organization_id: job.organization_id,
            ...meta,
            objects: objects.length,
            excluded: [
              "Auth credentials/sessions",
              "Vault secret values",
              "Transient request caches/rate budgets",
            ],
            account_restore:
              "Reactivate accounts; existing passwords and sessions are not exported.",
          }),
        );
        await part(0, root + "/metadata.json", bytes, "metadata");
        await rpc("checkpoint", {
          payload: { phase: "data", cursor: 0, part: 1, object_index: 0 },
          progress: 5,
        });
      } else if (phase === "data") {
        const rows = await rpc("data", { cursor: state.cursor || 0 });
        if (rows.length) {
          const path =
            root + "/data/" + String(state.part).padStart(6, "0") + ".json";
          await part(
            state.part,
            path,
            encoder.encode(JSON.stringify(rows)),
            "data",
            { count: rows.length, last_ordinal: rows[rows.length - 1].ordinal },
          );
          await rpc("checkpoint", {
            payload: {
              cursor: rows[rows.length - 1].ordinal,
              part: state.part + 1,
            },
            progress: Math.min(65, 10 + job.step),
          });
        } else
          await rpc("checkpoint", {
            payload: { phase: "objects" },
            progress: 70,
          });
      } else if (phase === "objects") {
        const objects = await rpc("objects"),
          index = state.object_index || 0;
        if (index < objects.length) {
          const o = objects[index];
          if (
            ![
              "exam-media",
              "attempt-canvas",
              "exam-reports",
              "exam-cards",
            ].includes(o.bucket) ||
            typeof o.path !== "string"
          )
            throw Error("Referensi objek backup tidak valid.");
          const downloaded = await client.storage
            .from(o.bucket)
            .download(o.path);
          if (downloaded.error)
            throw Error(
              "Objek sumber tidak tersedia; backup tidak ditandai lengkap.",
            );
          const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
          const hash = await sha256(bytes);
          if (o.expected_bytes && bytes.byteLength !== Number(o.expected_bytes))
            throw Error("Ukuran sumber tidak sesuai.");
          if (o.expected_hash && o.expected_hash !== hash)
            throw Error("Checksum sumber tidak sesuai.");
          await part(
            state.part,
            root + "/objects/" + String(index).padStart(6, "0") + ".bin",
            bytes,
            "object",
            { bucket: o.bucket, source_path: o.path },
          );
          await rpc("checkpoint", {
            payload: { object_index: index + 1, part: state.part + 1 },
            progress:
              70 + Math.floor((20 * (index + 1)) / Math.max(1, objects.length)),
          });
        } else
          await rpc("checkpoint", {
            payload: { phase: "manifest" },
            progress: 95,
          });
      } else if (phase === "manifest") {
        const parts = await rpc("parts");
        const metaBlob = await client.storage
          .from("system-backups")
          .download(root + "/metadata.json");
        if (metaBlob.error) throw Error("Metadata backup tidak tersedia.");
        const meta = JSON.parse(await metaBlob.data.text());
        if (
          parts.filter((p: { kind: string }) => p.kind === "object").length !==
            meta.objects ||
          parts
            .filter((p: { kind: string }) => p.kind === "data")
            .reduce(
              (n: number, p: { metadata: { count: number } }) =>
                n + p.metadata.count,
              0,
            ) !== meta.rows
        )
          throw Error("Rekonsiliasi bagian backup gagal.");
        const manifest = { ...meta, parts };
        const bytes = encoder.encode(JSON.stringify(manifest));
        const hash = await upload(root + "/manifest.json", bytes);
        await rpc("complete", { path: root + "/manifest.json", sha256: hash });
      } else throw Error("Fase backup tidak valid");
    } else if (job.kind === "smtp_probe" || job.kind === "reminder") {
      const s = job.settings;
      if (!s.smtp_sender || !s.smtp_password) {
        await rpc("fail", {
          blocked: true,
          message: "Gmail SMTP belum dikonfigurasi.",
        });
        return Response.json({ accepted: true });
      }
      if (job.kind === "reminder") {
        const check = await rpc("reminder_check");
        if (!check.eligible) {
          await rpc("complete", { outcome: "skipped_not_eligible" });
          return Response.json({ accepted: true });
        }
        job.payload = { ...job.payload, ...check };
      }
      const { default: nodemailer } = await import("nodemailer");
      const mailer = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user: s.smtp_sender, pass: s.smtp_password.replace(/\s/g, "") },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        logger: false,
        debug: false,
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: { rejectUnauthorized: true },
      });
      let accepted = false;
      try {
        if (job.kind === "smtp_probe") {
          await mailer.verify();
          await rpc("complete", { outcome: "smtp_verified_no_message_sent" });
        } else {
          const p = job.payload;
          const body = reminderText(p.template, {
            name: p.name,
            period: new Date(p.period_end).toLocaleString("id-ID", {
              timeZone: s.timezone || "Asia/Jakarta",
            }),
            deficit: JSON.stringify(p.deficit),
            url: "https://edutara-cbt-ashen.vercel.app/dashboard/exams",
          });
          await rpc("sending");
          sending = true;
          await mailer.sendMail({
            from: { name: s.name, address: s.smtp_sender },
            to: { name: p.name, address: p.email },
            subject: "Pengingat kelengkapan soal ujian",
            text: body,
            messageId: `<edutara-${id}@${s.smtp_sender.split("@")[1]}>`,
          });
          accepted = true;
          await rpc("complete", { outcome: "smtp_accepted" });
        }
      } catch (e) {
        await rpc("fail", {
          uncertain:
            job.kind === "reminder" && (accepted || ambiguousDelivery(e)),
          blocked: (e as { code?: string }).code === "EAUTH",
          message: ambiguousDelivery(e)
            ? "Hasil SMTP tidak pasti; rekonsiliasi sebelum mengirim ulang."
            : "Koneksi/pengiriman SMTP gagal; detail rahasia tidak dicatat.",
        });
      } finally {
        mailer.close();
      }
    } else if (job.kind === "retention") {
      const old = await rpc("retention");
      for (const backup of old) {
        const paths: string[] = [];
        const list = async (prefix: string) => {
          for (let offset = 0; ; offset += 100) {
            const r = await client!.storage
              .from("system-backups")
              .list(prefix, { limit: 100, offset });
            if (r.error) throw Error("Pemeriksaan retensi gagal.");
            for (const obj of r.data) {
              if (obj.id) paths.push(prefix + "/" + obj.name);
              else await list(prefix + "/" + obj.name);
            }
            if (r.data.length < 100) break;
          }
        };
        await list(job.organization_id + "/" + backup.id);
        for (let i = 0; i < paths.length; i += 100) {
          const r = await client.storage
            .from("system-backups")
            .remove(paths.slice(i, i + 100));
          if (r.error) throw Error("Penghapusan retensi belum tuntas.");
        }
        await rpc("retire", { backup_id: backup.id });
      }
      await rpc("complete", { outcome: "retention_complete" });
    } else throw Error("Job kind tidak valid");
    return Response.json({ accepted: true });
  } catch (error) {
    const detail =
      error instanceof Error &&
      /^(Backup melebihi|Objek sumber|Ukuran sumber|Checksum sumber|Rekonsiliasi|Bagian backup|Penyimpanan\/checksum)/.test(
        error.message,
      )
        ? error.message
        : undefined;
    if (client && lease)
      await client.rpc("worker_command", {
        input: {
          action: "fail",
          id,
          lease,
          message:
            detail || "Worker gagal; backup/email belum dinyatakan selesai.",
          uncertain: sending,
        },
      });
    console.error(
      JSON.stringify({
        event: "system_worker_failed",
        job_id: id || undefined,
      }),
    );
    return Response.json({ accepted: false }, { status: 500 });
  }
});
