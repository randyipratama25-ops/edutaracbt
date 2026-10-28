// Run only by the project owner after reviewing docs/development.md.
// Sends one activation invitation to the explicitly provided administrator email.
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const [email, username, fullName] = process.argv.slice(2);
if (!url || !key || !email || !username || !fullName)
  throw Error(
    "Set URL and server-only SUPABASE_SECRET_KEY, then pass email username full_name. Never put the secret in NEXT_PUBLIC variables.",
  );
if (!/^[a-z0-9][a-z0-9_.-]{2,63}$/.test(username))
  throw Error("Invalid username.");
const admin = createClient(url, key, { auth: { persistSession: false } });
const { count, error: countError } = await admin
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "admin")
  .eq("active", true);
if (countError) throw Error("Cannot inspect administrator state.");
if (count)
  throw Error(
    "An active administrator already exists. Use the application to manage accounts.",
  );
for (let page = 1; ; page++) {
  const { data: existing, error: listError } = await admin.auth.admin.listUsers(
    { page, perPage: 1000 },
  );
  if (listError) throw Error("Cannot inspect identity state.");
  if (
    existing.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())
  )
    throw Error(
      "Email already exists; review the existing identity instead of recreating it.",
    );
  if (existing.users.length < 1000) break;
}
const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: "https://edutara-cbt-randyipratama25-2274.vercel.app/auth/reset",
});
if (error || !data.user)
  throw Error(
    "Invitation failed. Verify Auth URL configuration and email delivery.",
  );
const { error: profileError } = await admin.from("profiles").insert({
  id: data.user.id,
  organization_id: "6e143c55-7be5-4e6e-9f1a-8f8db429956a",
  username,
  full_name: fullName,
  role: "admin",
});
if (profileError) {
  throw Error(
    "Profile creation failed; review the pending identity in Supabase before retrying.",
  );
}
console.log(
  "Administrator invitation created. Complete activation using the delivered email. No password or token is printed.",
);
