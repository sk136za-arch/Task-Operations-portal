import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, unwrap } from "@/db";

export const ADMIN_EMAIL = "sk136za@gmail.com";
export type Role = "admin" | "editor" | "viewer";

function adminEmails() {
  return new Set(
    [ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS ?? "").split(",")]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** Every signed-in user is provisioned as a read-only viewer on first visit. */
export async function currentPrincipal() {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const db = getDb();
  const email = identity.email.toLowerCase();
  const isAdmin = adminEmails().has(email);
  let record = unwrap<any>(await db.from("users").select("id, role, active").eq("email", email).maybeSingle());

  if (!record) {
    record = unwrap<any>(
      await db.from("users").insert({
        id: identity.userId,
        email,
        display_name: identity.displayName,
        role: isAdmin ? "admin" : "viewer",
        active: true,
        granted_by: isAdmin ? "environment" : "automatic viewer access",
        granted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select("role, active").single(),
    );
  } else if (isAdmin && (record.role !== "admin" || !record.active)) {
    record = unwrap<any>(
      await db.from("users").update({ role: "admin", active: true, granted_by: "environment", updated_at: new Date().toISOString() }).eq("email", email).select("role, active").single(),
    );
  }

  return record.active ? { identity, role: record.role as Role } : { identity, role: null };
}

export async function requireRole(allowed: Role[]) {
  const principal = await currentPrincipal();
  if (!principal) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!principal.role || !allowed.includes(principal.role))
    return { error: Response.json({ error: "Insufficient permissions" }, { status: 403 }) } as const;
  return { principal } as const;
}
