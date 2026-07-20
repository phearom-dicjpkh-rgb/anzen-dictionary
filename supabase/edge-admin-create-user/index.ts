// ============================================================================
//  Edge Function: admin-create-user  (deployed as "swift-task")
//  Admin-only account management. Verifies the CALLER is an admin, then uses
//  the service_role key to create / update / delete users.
//
//  Body: { action?: "create" | "update" | "delete", ... }
//    create (default): { email, password, full_name, role, teacher_id }
//    update:           { user_id, full_name?, role?, teacher_id?, password? }
//    delete:           { user_id }
//
//  Redeploy after changing: Supabase Dashboard → Edge Functions → your function
//  → paste this file → Deploy.
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin0 = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body0 = await req.clone().json().catch(() => ({}));

    // ---- REGISTER (no sign-in required) ----
    // Someone opening a branch's invite link. The token is what authorises it;
    // the account is created unapproved, so it can do nothing until the branch
    // approves it. Public sign-up in Supabase Auth can stay switched off.
    if (body0.action === "register") {
      const { token, email, password, full_name } = body0;
      if (!token) return json({ error: "តំណមិនត្រឹមត្រូវ" }, 400);
      if (!email || !password) return json({ error: "សូមបញ្ចូលអ៊ីមែល និង ពាក្យសម្ងាត់" }, 400);
      if (String(password).length < 6) return json({ error: "ពាក្យសម្ងាត់ត្រូវមានយ៉ាងតិច ៦ តួ" }, 400);

      // Two links per branch: the one that was opened decides the role, so a
      // student cannot become a teacher by editing the address.
      const { data: school } = await admin0
        .from("profiles").select("id,token_student,token_teacher")
        .eq("role", "school").eq("approved", true)
        .or(`token_student.eq.${token},token_teacher.eq.${token}`)
        .maybeSingle();
      if (!school) return json({ error: "តំណនេះលែងប្រើបានហើយ" }, 400);
      const role = school.token_teacher === token ? "teacher" : "student";

      const { error } = await admin0.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: {
          full_name: full_name ?? "", role,
          teacher_id: null, school_id: school.id, approved: false,
        },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // 1) Identify caller from their bearer token, and confirm they are admin.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not signed in" }, 401);
    const { data: callerProfile } = await callerClient.from("profiles").select("role").eq("id", caller.id).single();
    const callerRole = callerProfile?.role;
    if (callerRole !== "admin" && callerRole !== "school") {
      return json({ error: "Admin only" }, 403);
    }
    const isAdmin = callerRole === "admin";

    // A school may only touch its own branch: roles it may hand out, and the
    // members it may edit or remove.
    const rolesAllowed = isAdmin ? ["school", "teacher", "student"] : ["teacher", "student"];
    const assertOwns = async (userId: string) => {
      if (isAdmin) return null;
      const { data: target } = await callerClient
        .from("profiles").select("id,role,school_id").eq("id", userId).single();
      if (!target) return "រកមិនឃើញគណនីនេះទេ";
      if (target.school_id !== caller.id) return "គណនីនេះមិនមែនរបស់សាលាអ្នកទេ";
      if (!["teacher", "student"].includes(target.role)) return "គ្មានសិទ្ធិលើគណនីនេះទេ";
      return null;
    };

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    const action = body.action ?? "create";

    // ---- DELETE ----
    if (action === "delete") {
      const id = body.user_id;
      if (!id) return json({ error: "Missing user_id" }, 400);
      if (id === caller.id) return json({ error: "មិនអាចលុបគណនីខ្លួនឯងបានទេ" }, 400);
      const denied = await assertOwns(id);
      if (denied) return json({ error: denied }, 403);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ---- UPDATE ----
    if (action === "update") {
      const id = body.user_id;
      if (!id) return json({ error: "Missing user_id" }, 400);
      if (body.role && !rolesAllowed.includes(body.role))
        return json({ error: `role must be one of ${rolesAllowed.join(", ")}` }, 400);
      const denied = await assertOwns(id);
      if (denied) return json({ error: denied }, 403);

      if (body.password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password: body.password });
        if (error) return json({ error: error.message }, 400);
      }
      const patch: Record<string, unknown> = {};
      if (body.full_name != null) patch.full_name = body.full_name;
      if (body.role != null) patch.role = body.role;
      if (body.teacher_id !== undefined) patch.teacher_id = body.role === "student" ? (body.teacher_id ?? null) : null;
      // a school can never move someone out of its own branch
      if (body.role === "school") patch.school_id = null;
      else if (!isAdmin) patch.school_id = caller.id;
      else if (body.school_id !== undefined) patch.school_id = body.school_id ?? null;
      if (Object.keys(patch).length) {
        const { error } = await admin.from("profiles").update(patch).eq("id", id);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    // ---- SYNC: ask GitHub to run the "Sync words from Google Docs" workflow ----
    // The GitHub token stays here as an Edge Function secret; it is never sent
    // to the browser. Set these in Supabase → Edge Functions → Secrets:
    //   GH_SYNC_TOKEN  fine-grained PAT, Actions: read+write, this repo only
    //   GH_REPO        e.g. phearom-dicjpkh-rgb/anzen-dictionary
    if (action === "sync") {
      const token = Deno.env.get("GH_SYNC_TOKEN");
      const repo = Deno.env.get("GH_REPO");
      const workflow = Deno.env.get("GH_WORKFLOW") ?? "sync-words.yml";
      if (!token || !repo) {
        return json({ error: "មិនទាន់កំណត់ GH_SYNC_TOKEN / GH_REPO ក្នុង Supabase secrets" }, 400);
      }
      const gh = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "anzen-dictionary-sync",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: "main" }),
        },
      );
      if (gh.status === 204) return json({ ok: true });
      const detail = await gh.text();
      return json({ error: `GitHub ${gh.status}: ${detail.slice(0, 200)}` }, 400);
    }

    // ---- CREATE (default) ----
    const { email, password, full_name, role, teacher_id } = body;
    if (!email || !password) return json({ error: "Missing email/password" }, 400);
    if (!rolesAllowed.includes(role)) {
      return json({ error: `role must be one of ${rolesAllowed.join(", ")}` }, 400);
    }
    // A school always creates inside its own branch; an admin says which one.
    const school_id = role === "school" ? null : (isAdmin ? (body.school_id ?? null) : caller.id);
    if (role !== "school" && !school_id) {
      return json({ error: "សូមជ្រើសរើសសាលា/សាខា" }, 400);
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: {
        full_name: full_name ?? "", role,
        teacher_id: role === "student" ? (teacher_id ?? null) : null,
        school_id,
      },
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, user_id: created.user?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
