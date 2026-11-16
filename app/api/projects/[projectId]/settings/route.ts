import { GET as getSettings, POST as postSettings, PATCH as patchSettings } from "@/app/api/admin/settings/route";
import { withProjectId } from "@/lib/project-route";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) { return getSettings(withProjectId(request, (await context.params).projectId)); }
export async function POST(request: Request, context: Context) { return postSettings(withProjectId(request, (await context.params).projectId)); }
export async function PATCH(request: Request, context: Context) { return patchSettings(withProjectId(request, (await context.params).projectId)); }
