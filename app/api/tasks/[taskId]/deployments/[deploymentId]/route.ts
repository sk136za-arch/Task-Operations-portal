import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLogs, deployments } from "@/db/schema";
import { requireRole } from "@/lib/authz";
export async function DELETE(_:Request,{params}:{params:Promise<{deploymentId:string}>}) { const auth=await requireRole(["admin","editor"]); if("error" in auth)return auth.error; const {deploymentId}=await params,db=getDb(),id=Number(deploymentId); const [before]=await db.select().from(deployments).where(eq(deployments.id,id)).limit(1); if(!before)return Response.json({error:"Not found"},{status:404}); await db.delete(deployments).where(eq(deployments.id,id)); await db.insert(auditLogs).values({actorId:auth.principal.identity.userId,actorEmail:auth.principal.identity.email,action:"delete",entityType:"deployment",entityId:deploymentId,beforeJson:JSON.stringify(before),createdAt:new Date().toISOString()}); return new Response(null,{status:204}); }
