import { getDb } from "@/db";
import { deployments, tasks } from "@/db/schema";
import { requireRole } from "@/lib/authz";
export async function GET() {
  const auth = await requireRole(["admin", "editor", "viewer"]);
  if ("error" in auth) return auth.error;
  const db = getDb(),
    allTasks = await db.select().from(tasks),
    allDeployments = await db.select().from(deployments);
  const group = (key: "status" | "team" | "service" | "environment") =>
    Object.entries(
      allTasks.reduce<Record<string, number>>(
        (a, t) => ((a[t[key]] = (a[t[key]] || 0) + 1), a),
        {},
      ),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  return Response.json({
    total: allTasks.length,
    completed: allTasks.filter((t) => /done/i.test(t.status)).length,
    testing: allTasks.filter((t) => /test/i.test(t.status)).length,
    waiting: allTasks.filter((t) => /wait/i.test(t.status)).length,
    risk: allTasks.filter((t) => /fail|block/i.test(t.status)).length,
    byStatus: group("status"),
    byTeam: group("team"),
    byService: group("service"),
    byEnvironment: group("environment"),
    deployments: allDeployments,
  });
}
