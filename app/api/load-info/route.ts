import { json } from "../../../lib/http";
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = url ? new URL(url).hostname.split(".")[0] : "";
  if (
    process.env.CBT_ALLOW_LOAD_TESTS !== "isolated" ||
    !ref ||
    ref === "cwklpfplqoofvehlyfvd"
  )
    return json("Pengujian beban hanya tersedia pada staging terisolasi.", 403);
  return json({ isolated: true, project_ref: ref });
}
