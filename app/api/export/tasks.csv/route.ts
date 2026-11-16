import { exportProjectCsv } from "@/lib/project-csv";
import { requireScopedProject } from "@/lib/project-route";
export async function GET(request: Request) { const auth = await requireScopedProject(request, ["admin", "editor", "viewer"]); if ("error" in auth) return auth.error; return exportProjectCsv(auth.projectId); }
