import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  canUseContext,
  loginSchema,
  userSchema,
  username,
} from "./validation.ts";
const fail = (error: string, status = 400) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  try {
    if (request.method !== "POST") return fail("Method not allowed", 405);
    if (Number(request.headers.get("content-length") || 0) > 100000)
      return fail("Data terlalu besar.", 413);
    const text = await request.text();
    if (text.length > 100000) return fail("Data terlalu besar.", 413);
    const raw = JSON.parse(text);
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const site = "https://edutara-cbt-randyipratama25-2274.vercel.app";
    const budget = async (key: string) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(key),
      );
      const hash = Array.from(new Uint8Array(digest))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      const { data, error } = await admin.rpc("consume_login_budget", {
        budget_key: hash,
      });
      return !error && data === true;
    };
    if (raw.action === "login" || raw.action === "recover") {
      const name = username.parse(raw.username);
      if (!(await budget(`${raw.action}:${name}`)))
        return fail("Terlalu banyak percobaan. Coba lagi dalam 15 menit.", 429);
      const { data: profile } = await admin
        .from("profiles")
        .select("id,role,active,archived_at")
        .eq("username", name)
        .single();
      let email = "";
      if (profile?.active && !profile.archived_at) {
        const { data } = await admin.auth.admin.getUserById(profile.id);
        email = data.user?.email || "";
      }
      if (raw.action === "recover") {
        if (email) {
          const auth = createClient(url, anon, {
            auth: { persistSession: false },
          });
          const { error } = await auth.auth.resetPasswordForEmail(email, {
            redirectTo: `${site}/auth/reset`,
          });
          if (error)
            console.error(
              JSON.stringify({ requestId, event: "recovery_delivery_failed" }),
            );
        }
        return Response.json(
          { accepted: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const input = loginSchema.parse(raw);
      if (!email)
        return fail(
          "Username atau password salah, atau akun tidak aktif.",
          401,
        );
      const auth = createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await auth.auth.signInWithPassword({
        email,
        password: input.password,
      });
      if (error && error.status >= 500)
        return fail("Layanan autentikasi belum dapat diakses.", 503);
      if (error || !data.session)
        return fail(
          "Username atau password salah, atau akun tidak aktif.",
          401,
        );
      const userClient = createClient(url, anon, {
        global: {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        },
        auth: { persistSession: false },
      });
      const { data: live } = await userClient
        .from("profiles")
        .select("role,active")
        .eq("id", profile!.id)
        .single();
      let assigned = false;
      if (input.context === "supervisor") {
        const r = await userClient.rpc("has_supervisor_context");
        assigned = r.data === true;
      }
      if (!live?.active || !canUseContext(live.role, input.context, assigned)) {
        await auth.auth.signOut({ scope: "local" });
        return fail("Konteks login atau penugasan tidak diizinkan.", 403);
      }
      if (input.context === "student") {
        await auth.auth.signOut({ scope: "local" });
        return fail(
          "Layanan ujian belum dibuka. PIN dan attempt tersedia pada tahap mesin ujian.",
          409,
        );
      }
      await admin.from("audit_logs").insert({
        organization_id: "6e143c55-7be5-4e6e-9f1a-8f8db429956a",
        actor_id: profile!.id,
        action: "LOGIN",
        target_type: "session",
        request_id: requestId,
      });
      return Response.json(
        {
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (raw.action !== "manage_user")
      return fail("Operasi tidak tersedia.", 404);
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer "))
      return fail("Silakan masuk.", 401);
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return fail("Sesi tidak valid.", 401);
    const { data: actor } = await userClient
      .from("profiles")
      .select("id,organization_id,role,active")
      .eq("id", user.id)
      .single();
    if (!actor?.active || !["admin", "teacher"].includes(actor.role))
      return fail("Akses ditolak.", 403);
    const sameClass = async (classId: string) => {
      const { data } = await userClient
        .from("teacher_assignments")
        .select("id")
        .eq("teacher_id", actor.id)
        .eq("class_id", classId)
        .eq("active", true)
        .limit(1);
      return !!data?.length;
    };
    const targetVisible = async (id: string) => {
      const { data } = await userClient
        .from("profiles")
        .select("id,role")
        .eq("id", id)
        .single();
      return data;
    };
    const createOne = async (value: unknown) => {
      const input = userSchema.parse(value);
      if (
        actor.role !== "admin" &&
        (input.role !== "student" ||
          !input.class_id ||
          !(await sameClass(input.class_id)))
      )
        throw new Error("FORBIDDEN");
      if (input.class_id) {
        const { data } = await admin
          .from("classes")
          .select("id")
          .eq("id", input.class_id)
          .eq("organization_id", actor.organization_id)
          .eq("active", true)
          .single();
        if (!data) throw new Error("INVALID_CLASS");
      }
      const { data: existing } = await admin
        .from("profiles")
        .select("id")
        .eq("username", input.username)
        .maybeSingle();
      if (existing) throw new Error("USERNAME_EXISTS");
      for (let page = 1; ; page++) {
        const { data: existingAuth, error: listError } =
          await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) throw new Error("PROFILE_FAILED");
        if (
          existingAuth.users.some(
            (u) => u.email?.toLowerCase() === input.email.toLowerCase(),
          )
        )
          throw new Error("USER_ALREADY_EXISTS");
        if (existingAuth.users.length < 1000) break;
      }
      const { data, error } = await admin.auth.admin.inviteUserByEmail(
        input.email,
        { redirectTo: `${site}/auth/reset` },
      );
      if (error || !data.user) throw new Error("INVITATION_FAILED");
      const id = data.user.id;
      // Never attach an existing account to another organization.
      const { data: attached } = await admin
        .from("profiles")
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (attached) throw new Error("USER_ALREADY_EXISTS");
      const { error: profileError } = await admin.from("profiles").insert({
        id,
        organization_id: actor.organization_id,
        username: input.username,
        full_name: input.full_name,
        role: input.role,
      });
      if (profileError) {
        throw new Error("PROFILE_FAILED");
      }
      if (input.role === "student" && input.class_id) {
        const { error: e } = await admin.from("student_enrollments").insert({
          organization_id: actor.organization_id,
          student_id: id,
          class_id: input.class_id,
        });
        if (e) {
          await admin.from("profiles").delete().eq("id", id);
          throw new Error("ENROLLMENT_FAILED");
        }
      }
      await admin.from("audit_logs").insert({
        organization_id: actor.organization_id,
        actor_id: actor.id,
        action: "INVITE_USER",
        target_type: "profiles",
        target_id: id,
        request_id: requestId,
      });
      return { id, username: input.username };
    };
    if (raw.operation === "create")
      return Response.json(await createOne(raw), {
        headers: { "Cache-Control": "no-store" },
      });
    const input = z
      .object({
        id: z.uuid(),
        operation: z.enum(["update", "archive"]),
        full_name: z.string().trim().min(1).max(150).optional(),
        active: z.boolean().optional(),
      })
      .parse(raw);
    const target = await targetVisible(input.id);
    if (
      !target ||
      (actor.role === "teacher" &&
        (target.role !== "student" ||
          input.operation === "archive" ||
          input.active !== undefined))
    )
      return fail("Aksi di luar kewenangan.", 403);
    const changes =
      input.operation === "archive"
        ? { active: false, archived_at: new Date().toISOString() }
        : {
            ...(input.full_name ? { full_name: input.full_name } : {}),
            ...(input.active === undefined
              ? {}
              : {
                  active: input.active,
                  ...(input.active ? { archived_at: null } : {}),
                }),
          };
    const { error } = await admin
      .from("profiles")
      .update(changes)
      .eq("id", input.id)
      .eq("organization_id", actor.organization_id);
    if (error)
      return fail(
        "Perubahan ditolak. Admin aktif terakhir tidak boleh dinonaktifkan.",
        422,
      );
    await admin.from("audit_logs").insert({
      organization_id: actor.organization_id,
      actor_id: actor.id,
      action: input.operation.toUpperCase(),
      target_type: "profiles",
      target_id: input.id,
      request_id: requestId,
    });
    return Response.json(
      { saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return fail(
        "Data tidak valid: " + error.issues.map((i) => i.message).join("; "),
        422,
      );
    const code = error instanceof Error ? error.message : "";
    if (
      [
        "FORBIDDEN",
        "INVALID_CLASS",
        "USERNAME_EXISTS",
        "INVITATION_FAILED",
        "USER_ALREADY_EXISTS",
        "PROFILE_FAILED",
        "ENROLLMENT_FAILED",
      ].includes(code)
    )
      return fail(
        (
          {
            FORBIDDEN: "Tindakan di luar cakupan akses.",
            INVALID_CLASS: "Kelas tidak valid atau tidak aktif.",
            USERNAME_EXISTS: "Username sudah digunakan.",
            INVITATION_FAILED:
              "Undangan akun gagal dikirim. Periksa email atau hubungi Admin.",
            USER_ALREADY_EXISTS: "Akun email sudah terdaftar.",
            PROFILE_FAILED: "Profil gagal disimpan.",
            ENROLLMENT_FAILED: "Penempatan kelas gagal disimpan.",
          } as Record<string, string>
        )[code],
        code === "FORBIDDEN" ? 403 : 422,
      );
    console.error(JSON.stringify({ requestId, event: "gateway_failed" }));
    return fail("Layanan akun gagal memproses permintaan.", 500);
  }
});
