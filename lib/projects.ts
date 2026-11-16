import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, unwrap } from "@/db";
import { ADMIN_EMAIL, type Role } from "@/lib/authz";

export type ProjectPrincipal = { identity: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>; role: Role; isGlobalAdmin: boolean };

export function globalAdminEmails() {
  return new Set([ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS ?? "").split(",")].map((v) => v.trim().toLowerCase()).filter(Boolean));
}

export async function requireGlobalAdmin() {
  const identity = await getChatGPTUser();
  if (!identity) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!globalAdminEmails().has(identity.email.toLowerCase())) return { error: Response.json({ error: "Super admin access is required" }, { status: 403 }) } as const;
  return { identity } as const;
}

export async function projectPrincipal(projectId: string): Promise<ProjectPrincipal | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const email = identity.email.toLowerCase();
  const project = unwrap<any>(await getDb().from("projects").select("active").eq("id", projectId).maybeSingle());
  if (!project?.active) return null;
  const isGlobalAdmin = globalAdminEmails().has(email);
  if (isGlobalAdmin) return { identity, role: "admin", isGlobalAdmin };
  const member = unwrap<any>(await getDb().from("project_members").select("role, active").eq("project_id", projectId).eq("email", email).maybeSingle());
  return member?.active ? { identity, role: member.role as Role, isGlobalAdmin } : null;
}

export async function requireProjectRole(projectId: string, allowed: Role[]) {
  const principal = await projectPrincipal(projectId);
  if (!principal) return { error: Response.json({ error: "Project access is required" }, { status: 403 }) } as const;
  if (!allowed.includes(principal.role)) return { error: Response.json({ error: "Insufficient project permissions" }, { status: 403 }) } as const;
  return { principal } as const;
}
