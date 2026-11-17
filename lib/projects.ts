import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb, unwrap } from "@/db";
import { ADMIN_EMAIL, type Role } from "@/lib/authz";

type ActiveProject = { id: string; name: string; description: string; active: boolean; notifications_started_at?: string | null };
export type ProjectPrincipal = { identity: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>; role: Role; isGlobalAdmin: boolean; project: ActiveProject };

export function globalAdminEmails() {
  return new Set([ADMIN_EMAIL, ...(process.env.ADMIN_EMAILS ?? "").split(",")].map((v) => v.trim().toLowerCase()).filter(Boolean));
}

export async function requireGlobalAdmin() {
  const identity = await getChatGPTUser();
  if (!identity) return { error: Response.json({ error: "Authentication required" }, { status: 401 }) } as const;
  if (!globalAdminEmails().has(identity.email.toLowerCase())) return { error: Response.json({ error: "Super admin access is required" }, { status: 403 }) } as const;
  return { identity } as const;
}

export async function projectPrincipal(projectId: string, knownIdentity?: NonNullable<Awaited<ReturnType<typeof getChatGPTUser>>>): Promise<ProjectPrincipal | null> {
  const identity = knownIdentity ?? await getChatGPTUser();
  if (!identity) return null;
  const email = identity.email.toLowerCase();
  const project = unwrap<ActiveProject | null>(await getDb().from("projects").select("id, name, description, active, notifications_started_at").eq("id", projectId).maybeSingle());
  if (!project?.active) return null;
  const isGlobalAdmin = globalAdminEmails().has(email);
  if (isGlobalAdmin) return { identity, role: "admin", isGlobalAdmin, project };
  const member = unwrap<any>(await getDb().from("project_members").select("role, active").eq("project_id", projectId).eq("email", email).maybeSingle());
  return member?.active ? { identity, role: member.role as Role, isGlobalAdmin, project } : null;
}

export async function requireProjectRole(projectId: string, allowed: Role[]) {
  const principal = await projectPrincipal(projectId);
  if (!principal) return { error: Response.json({ error: "Project access is required" }, { status: 403 }) } as const;
  if (!allowed.includes(principal.role)) return { error: Response.json({ error: "Insufficient project permissions" }, { status: 403 }) } as const;
  return { principal } as const;
}
