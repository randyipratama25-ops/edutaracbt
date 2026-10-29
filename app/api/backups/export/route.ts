import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { z } from "zod";
import JSZip from "jszip";
import { staff } from "../../../../lib/results/server";
import { failure, HttpError } from "../../../../lib/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const a = await staff();
    if (a.role !== "admin") throw new HttpError(403, "Hanya Admin.");
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    const r = await a.client.rpc("system_command", {
      input: { action: "parts", id },
    });
    if (r.error) throw new HttpError(403, r.error.message);
    const parts = r.data as { path: string; bytes: number; sha256: string }[];
    if (parts.reduce((n, p) => n + Number(p.bytes), 0) > 52428800)
      throw new HttpError(
        413,
        "Backup lebih dari 50 MiB; unduh manifest dan setiap bagian.",
      );
    const prefix = a.organization_id + "/" + id + "/";
    const zip = new JSZip();
    for (const p of [
      ...parts,
      { path: prefix + "manifest.json", bytes: 0, sha256: "" },
    ]) {
      if (!p.path.startsWith(prefix))
        throw new HttpError(422, "Referensi backup tidak valid.");
      const f = await a.client.storage.from("system-backups").download(p.path);
      if (f.error) throw new HttpError(422, "Bagian backup tidak tersedia.");
      const bytes = new Uint8Array(await f.data.arrayBuffer());
      if (
        p.sha256 &&
        createHash("sha256").update(bytes).digest("hex") !== p.sha256
      )
        throw new HttpError(422, "Checksum backup berbeda.");
      zip.file(p.path.slice(prefix.length), bytes);
    }
    const stream = Readable.toWeb(
      new Readable({ read() {} }).wrap(
        zip.generateNodeStream({
          type: "nodebuffer",
          streamFiles: true,
          compression: "STORE",
        }),
      ),
    );
    return new Response(stream as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="backup-${id}.zip"`,
        "Cache-Control": "private,no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
