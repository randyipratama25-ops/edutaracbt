import "server-only";
import { cookies } from "next/headers";
import { db } from "../supabase/server";
import { canUseContext } from "../domain/validation";
export async function actor() {
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await client
    .from("profiles")
    .select("id,organization_id,username,full_name,role,active")
    .eq("id", user.id)
    .eq("active", true)
    .single();
  if (!profile) return null;
  const context = (await cookies()).get("edutara_context")?.value || "staff";
  let assigned = false;
  if (context === "supervisor") {
    const { data } = await client.rpc("has_supervisor_context");
    assigned = data === true;
  }
  if (!canUseContext(profile.role, context, assigned)) return null;
  return { ...profile, context, client };
}
