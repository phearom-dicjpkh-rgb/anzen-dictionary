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

    // 1) Identify caller from their bearer token, and confirm they are admin.
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not signed in" }, 401);
    const { data: callerProfile } = await callerClient.from("profiles").select("role").eq("id", caller.id).single();
    if (!callerProfile || callerProfile.role !== "admin") return json({ error: "Admin only" }, 403);

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json();
    const action = body.action ?? "create";

    // ---- DELETE ----
    if (action === "delete") {
      const id = body.user_id;
      if (!id) return json({ error: "Missing user_id" }, 400);
      if (id === caller.id) return json({ error: "មិនអាចលុបគណនីខ្លួនឯងបានទេ" }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ---- UPDATE ----
    if (action === "update") {
      const id = body.user_id;
      if (!id) return json({ error: "Missing user_id" }, 400);
      if (body.role && !["teacher", "student"].includes(body.role))
        return json({ error: "role must be teacher or student" }, 400);
      if (body.password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password: body.password });
        if (error) return json({ error: error.message }, 400);
      }
      const patch: Record<string, unknown> = {};
      if (body.full_name != null) patch.full_name = body.full_name;
      if (body.role != null) patch.role = body.role;
      if (body.teacher_id !== undefined) patch.teacher_id = body.role === "student" ? (body.teacher_id ?? null) : null;
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
    if (!["teacher", "student"].includes(role)) return json({ error: "role must be teacher or student" }, 400);
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: full_name ?? "", role, teacher_id: role === "student" ? (teacher_id ?? null) : null },
    });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, user_id: created.user?.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
