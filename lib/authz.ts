import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, unwrap } from "@/db";
export const ADMIN_EMAIL = "sk136za@gmail.com";
export type Role = "admin" | "editor" | "viewer";
export async function currentPrincipal() {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const db = getDb();
  const email = identity.email.toLowerCase();
  const record = unwrap(
    await db.from("users").select("role").eq("email", email).eq("active", true).maybeSingle(),
  );
  return record
    ? { identity, role: record.role as Role }
    : { identity, role: null };
}
export async function requireRole(allowed: Role[]) {
  const principal = await currentPrincipal();
  if (!principal)
    return {
      error: Response.json(
        { error: "Authentication required" },
        { status: 401 },
      ),
    } as const;
  if (!principal.role || !allowed.includes(principal.role))
    return {
      error: Response.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      ),
    } as const;
  return { principal } as const;
}
