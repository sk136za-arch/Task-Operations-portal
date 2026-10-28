import { getDb } from "@/db";
import { tasks } from "@/db/schema";
import { requireRole } from "@/lib/authz";
const csv=(v:unknown)=>`"${String(v??"").replaceAll('"','""')}"`;
export async function GET(){const auth=await requireRole(["admin","editor","viewer"]);if("error" in auth)return auth.error;const rows=await getDb().select().from(tasks),headers=["Task ID","Environment","Team","Service","Task / Epic","UAT Deploy","PROD Detail","Work Status","Remark","Revision","Updated At","Updated By"];const body="\uFEFF"+[headers.map(csv),...rows.map(t=>[t.taskId,t.environment,t.team,t.service,t.title,t.uatDetail,t.productionDetail,t.status,t.remark,t.revision,t.updatedAt,t.updatedBy].map(csv))].map(r=>r.join(",")).join("\r\n");return new Response(body,{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":"attachment; filename=task-ops-export.csv","cache-control":"private, no-store"}});}
