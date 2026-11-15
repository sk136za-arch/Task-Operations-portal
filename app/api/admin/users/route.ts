import { camelize, getDb, unwrap } from "@/db";
import { requireRole } from "@/lib/authz";
import { userInput } from "@/lib/validation";
const bootstrap = "sk136za@gmail.com";
const audit = async (db: ReturnType<typeof getDb>, principal: any, action: string, email: string, beforeJson?: string, afterJson?: string) => unwrap(await db.from("audit_logs").insert({ actor_id: principal.identity.userId, actor_email: principal.identity.email, action, entity_type: "user", entity_id: email, before_json: beforeJson, after_json: afterJson, created_at: new Date().toISOString() }));
export async function GET() { const auth = await requireRole(["admin"]); if ("error" in auth) return auth.error; return Response.json(camelize(unwrap(await getDb().from("users").select().order("email")))); }
export async function POST(request: Request) {
  const auth = await requireRole(["admin"]); if ("error" in auth) return auth.error;
  const parsed = userInput.safeParse(await request.json()); if (!parsed.success) return Response.json({ error: "Invalid user", issues: parsed.error.flatten() }, { status: 400 });
  const db = getDb(), now = new Date().toISOString(), email = parsed.data.email.toLowerCase();
  const saved = unwrap<any>(await db.from("users").upsert({ id: `pending:${email}`, email, display_name: parsed.data.displayName, role: parsed.data.role, active: parsed.data.active, granted_by: auth.principal.identity.email, granted_at: now, updated_at: now }, { onConflict: "email" }).select().single());
  await audit(db, auth.principal, "grant_access", email, undefined, JSON.stringify(saved)); return Response.json(camelize(saved), { status: 201 });
}
export async function PATCH(request: Request) {
  const auth = await requireRole(["admin"]); if ("error" in auth) return auth.error;
  const parsed = userInput.safeParse(await request.json()); if (!parsed.success) return Response.json({ error: "Invalid user" }, { status: 400 });
  const db = getDb(), email = parsed.data.email.toLowerCase(), before = unwrap<any>(await db.from("users").select().eq("email", email).maybeSingle()); if (!before) return Response.json({ error: "Not found" }, { status: 404 });
  if (email === bootstrap && (!parsed.data.active || parsed.data.role !== "admin")) return Response.json({ error: "Bootstrap admin cannot be disabled or demoted" }, { status: 400 });
  const saved = unwrap<any>(await db.from("users").update({ display_name: parsed.data.displayName, role: parsed.data.role, active: parsed.data.active, granted_by: auth.principal.identity.email, updated_at: new Date().toISOString() }).eq("email", email).select().single()); await audit(db, auth.principal, "update_access", email, JSON.stringify(before), JSON.stringify(saved)); return Response.json(camelize(saved));
}
export async function DELETE(request: Request) {
  const auth = await requireRole(["admin"]); if ("error" in auth) return auth.error; const email = new URL(request.url).searchParams.get("email")?.trim().toLowerCase(); if (!email) return Response.json({ error: "Email is required" }, { status: 400 }); if (email === bootstrap) return Response.json({ error: "Bootstrap admin cannot be deleted" }, { status: 400 });
  const db = getDb(), before = unwrap<any>(await db.from("users").select().eq("email", email).maybeSingle()); if (!before) return Response.json({ error: "Not found" }, { status: 404 }); unwrap(await db.from("users").delete().eq("email", email)); await audit(db, auth.principal, "delete_access", email, JSON.stringify(before)); return new Response(null, { status: 204 });
}
