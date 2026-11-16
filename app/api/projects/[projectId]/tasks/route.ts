import { GET as listTasks, POST as createTask } from "@/app/api/tasks/route";
import { withProjectId } from "@/lib/project-route";
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) { return listTasks(withProjectId(request, (await params).projectId)); }
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) { return createTask(withProjectId(request, (await params).projectId)); }
