import { createClient } from "@supabase/supabase-js";
import {
  sha256,
  readSmallBody,
} from "./shared.ts";
Deno.serve(async (request: Request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (Number(request.headers.get("content-length") || 0) > 2048)
    return new Response("Too large", { status: 413 });
  let id = "", lease = "";
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
      job = await rpc("backup_claim", { nonce: input.nonce });
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }
    if (job.busy || job.disabled) return Response.json({ accepted: true });
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
    } else throw Error("Backup-only worker refuses non-backup jobs");
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
