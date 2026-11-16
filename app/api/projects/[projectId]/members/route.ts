import { GET as getMembers, POST as postMember, PATCH as patchMember, DELETE as deleteMember } from "@/app/api/admin/users/route";
import { withProjectId } from "@/lib/project-route";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) { return getMembers(withProjectId(request, (await context.params).projectId)); }
export async function POST(request: Request, context: Context) { return postMember(withProjectId(request, (await context.params).projectId)); }
export async function PATCH(request: Request, context: Context) { return patchMember(withProjectId(request, (await context.params).projectId)); }
export async function DELETE(request: Request, context: Context) { return deleteMember(withProjectId(request, (await context.params).projectId)); }
