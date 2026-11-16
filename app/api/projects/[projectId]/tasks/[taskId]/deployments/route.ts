import { POST as createDeployment } from "@/app/api/tasks/[taskId]/deployments/route";
import { withProjectId } from "@/lib/project-route";
type Context = { params: Promise<{ projectId: string; taskId: string }> };
export async function POST(request: Request, context: Context) { const params = await context.params; return createDeployment(withProjectId(request, params.projectId), { params: Promise.resolve({ taskId: params.taskId }) }); }
