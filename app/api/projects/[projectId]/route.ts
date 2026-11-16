import { z } from "zod";
import { getDb, unwrap } from "@/db";
import { requireProjectRole } from "@/lib/projects";
const input = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500) });
export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; const auth = await requireProjectRole(projectId, ["admin"]); if ("error" in auth) return auth.error; const parsed = input.safeParse(await request.json()); if (!parsed.success) return Response.json({ error: "Invalid project settings" }, { status: 400 }); const saved = unwrap(await getDb().from("projects").update({ name: parsed.data.name, description: parsed.data.description, updated_at: new Date().toISOString() }).eq("id", projectId).select().maybeSingle()); if (!saved) return Response.json({ error: "Project not found" }, { status: 404 }); return Response.json(saved); }
