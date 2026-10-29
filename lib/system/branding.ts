import "server-only";
import { createClient } from "@supabase/supabase-js";
export async function branding() {
  const fallback = {
    name: "EDUTARA CBT",
    subtitle: "Ujian madrasah",
    logo: "",
    background: "",
  };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return fallback;
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const r = await client.rpc("app_branding");
    if (r.error || !r.data) return fallback;
    const get = async (id: string | null) => {
      if (!id) return "";
      const m = await client
        .from("media_assets")
        .select("object_path")
        .eq("id", id)
        .single();
      if (!m.data) return "";
      const s = await client.storage
        .from("exam-media")
        .createSignedUrl(m.data.object_path, 60);
      return s.data?.signedUrl || "";
    };
    const [logo, background] = await Promise.all([
      get(r.data.logo_id),
      get(r.data.background_id),
    ]);
    return {
      name: r.data.name || fallback.name,
      subtitle: r.data.subtitle || fallback.subtitle,
      logo,
      background,
    };
  } catch {
    return fallback;
  }
}
