import { PATCH as patchDeployment, DELETE as deleteDeployment } from "@/app/api/tasks/[taskId]/deployments/[deploymentId]/route";
import { withProjectId } from "@/lib/project-route";
type Context = { params: Promise<{ projectId: string; taskId: string; deploymentId: string }> };
export async function PATCH(request: Request, context: Context) { const params = await context.params; return patchDeployment(withProjectId(request, params.projectId), { params: Promise.resolve({ taskId: params.taskId, deploymentId: params.deploymentId }) }); }
export async function DELETE(request: Request, context: Context) { const params = await context.params; return deleteDeployment(withProjectId(request, params.projectId), { params: Promise.resolve({ taskId: params.taskId, deploymentId: params.deploymentId }) }); }
