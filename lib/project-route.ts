import { requireProjectRole } from "@/lib/projects";
import type { Role } from "@/lib/authz";

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** Resolves and authorizes an explicit project scope for legacy-compatible API handlers. */
export async function requireScopedProject(request: Request, roles: Role[]) {
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
  if (!uuid.test(projectId)) {
    return { error: Response.json({ error: "Project is required" }, { status: 400 }) } as const;
  }
  const authorization = await requireProjectRole(projectId, roles);
  if ("error" in authorization) return authorization;
  return { projectId, principal: authorization.principal } as const;
}

/** Adds an authoritative path project id before delegating to a shared handler. */
export function withProjectId(request: Request, projectId: string) {
  const url = new URL(request.url);
  url.searchParams.set("projectId", projectId);
  return new Request(url, request);
}
