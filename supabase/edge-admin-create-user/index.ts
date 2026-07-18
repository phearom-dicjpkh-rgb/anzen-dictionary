// ============================================================================
//  Edge Function: admin-create-user
//  Lets an ADMIN create a teacher/student account from inside the app.
//  Security: verifies the CALLER is an admin (via their login token) before
//  using the service_role key to create the new user.
//
//  Deploy (Supabase Dashboard → Edge Functions → Deploy a new function):
//    name = admin-create-user
//    paste this file's contents.
//  The SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY secrets are
//  provided automatically by Supabase to every Edge Function.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Identify the caller from their Authorization: Bearer <token>.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not signed in" }, 401);

    // 2) Confirm the caller is an admin.
    const { data: callerProfile } = await callerClient
      .from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Admin only" }, 403);
    }

    // 3) Validate input.
    const { email, password, full_name, role, teacher_id } = await req.json();
    if (!email || !password) return json({ error: "Missing email/password" }, 400);
    if (!["teacher", "student"].includes(role)) {
      return json({ error: "role must be teacher or student" }, 400);
    }

    // 4) Create the user with the service_role key (bypasses signup toggle).
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email verification needed
      user_metadata: {
        full_name: full_name ?? "",
        role,
        teacher_id: role === "student" ? (teacher_id ?? null) : null,
      },
    });
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, user_id: created.user?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
