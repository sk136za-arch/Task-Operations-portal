import { GET as getTask, PATCH as patchTask } from "@/app/api/tasks/[taskId]/route";
import { withProjectId } from "@/lib/project-route";
type Context = { params: Promise<{ projectId: string; taskId: string }> };
export async function GET(request: Request, context: Context) { const params = await context.params; return getTask(withProjectId(request, params.projectId), { params: Promise.resolve({ taskId: params.taskId }) }); }
export async function PATCH(request: Request, context: Context) { const params = await context.params; return patchTask(withProjectId(request, params.projectId), { params: Promise.resolve({ taskId: params.taskId }) }); }
