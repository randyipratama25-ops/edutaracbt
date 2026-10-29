import { z } from "zod";
import { staff } from "../../../../lib/results/server";
import {
  body,
  failure,
  HttpError,
  json,
  requireOrigin,
} from "../../../../lib/http";
import {
  readBounded,
  storeMedia,
  mediaTypes,
} from "../../../../lib/operations/media";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const a = await staff();
    if (a.role !== "admin")
      throw new HttpError(403, "Hanya Admin mengimpor folder Drive.");
    const x = z
      .object({
        action: z.enum(["list", "import"]),
        ids: z
          .array(z.string().regex(/^[a-zA-Z0-9_-]{10,200}$/))
          .min(1)
          .max(25)
          .optional(),
        folder: z.string().optional(),
        page_token: z.string().max(2000).optional(),
      })
      .parse(await body(request));
    const folder = process.env.GOOGLE_DRIVE_FOLDER_ID,
      token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
    if (!folder || !token || !/^[a-zA-Z0-9_-]{10,200}$/.test(folder))
      throw new HttpError(
        503,
        "Adaptor Drive belum dikonfigurasi. Unggah file lokal tetap tersedia.",
      );
    if (x.folder && x.folder !== folder)
      throw new HttpError(403, "Folder tidak diizinkan.");
    const call = async (path: string) => {
      const r = await fetch("https://www.googleapis.com/drive/v3/" + path, {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok)
        throw new HttpError(
          422,
          "Akses Drive gagal; periksa izin baca folder dan masa berlaku token server.",
        );
      return r;
    };
    if (x.action === "list") {
      const q = new URLSearchParams({
        q: `'${folder}' in parents and trashed = false`,
        fields: "files(id,name,mimeType,size),nextPageToken",
        pageSize: "100",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
      });
      if (x.page_token) q.set("pageToken", x.page_token);
      const r = await call("files?" + q);
      const d = await r.json();
      return json({
        folder,
        files: d.files.filter(
          (f: { mimeType: string; size: string }) =>
            mediaTypes.includes(f.mimeType) &&
            Number(f.size) > 0 &&
            Number(f.size) <= 5242880,
        ),
        more: !!d.nextPageToken,
        next_page_token: d.nextPageToken || "",
      });
    }
    if (!x.ids) throw new HttpError(422, "Pilih file terlebih dahulu.");
    const errors: string[] = [];
    let saved = 0;
    for (const id of [...new Set(x.ids)]) {
      try {
        const meta = await (
          await call(
            "files/" +
              id +
              "?fields=id,name,mimeType,size,parents,trashed&supportsAllDrives=true",
          )
        ).json();
        if (
          meta.trashed ||
          !meta.parents?.includes(folder) ||
          !mediaTypes.includes(meta.mimeType) ||
          Number(meta.size) > 5242880
        )
          throw Error("File di luar folder/tipe/ukuran yang diizinkan.");
        const r = await call(
          "files/" + id + "?alt=media&supportsAllDrives=true",
        );
        const bytes = await readBounded(r.body, 5242880);
        if (bytes.length !== Number(meta.size))
          throw Error("Ukuran hasil unduh tidak sesuai metadata.");
        await storeMedia(a.client, a, bytes, meta.mimeType, id);
        saved++;
      } catch (e) {
        errors.push(id + ": " + (e instanceof Error ? e.message : "Gagal"));
      }
    }
    return json({
      message: `${saved}/${x.ids.length} file berhasil diimpor. ${errors.join("; ")}`,
    });
  } catch (e) {
    return failure(e);
  }
}
