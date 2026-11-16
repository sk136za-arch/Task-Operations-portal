import { GET as previewImport, POST as seedImport } from "@/app/api/admin/import/route";
import { withProjectId } from "@/lib/project-route";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) { return previewImport(withProjectId(request, (await context.params).projectId)); }
export async function POST(request: Request, context: Context) { return seedImport(withProjectId(request, (await context.params).projectId)); }
