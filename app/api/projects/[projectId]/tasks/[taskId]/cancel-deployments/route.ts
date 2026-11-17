import { POST as cancelDeployments } from "@/app/api/tasks/[taskId]/cancel-deployments/route";
import { withProjectId } from "@/lib/project-route";

type Context = { params: Promise<{ projectId: string; taskId: string }> };

export async function POST(request: Request, context: Context) {
  const params = await context.params;
  return cancelDeployments(withProjectId(request, params.projectId), {
    params: Promise.resolve({ taskId: params.taskId }),
  });
}
