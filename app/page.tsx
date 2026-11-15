import { asc, desc } from "drizzle-orm";
import { getDb } from "@/db";
import {
  auditLogs,
  deployments,
  lookupValues,
  tasks,
  users,
} from "@/db/schema";
import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { currentPrincipal } from "@/lib/authz";
import Dashboard from "@/components/dashboard/dashboard";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requireChatGPTUser("/");
  const principal = await currentPrincipal();
  if (!principal?.role)
    return (
      <main className="gate">
        <section>
          <div className="logo">TO</div>
          <p className="eyebrow">TASK OPS PORTAL</p>
          <h1>Access pending</h1>
          <p>
            บัญชี <strong>{principal?.identity.email}</strong>{" "}
            ยังไม่ได้รับสิทธิ์ กรุณาติดต่อ sk136za@gmail.com
          </p>
          <a href={chatGPTSignOutPath("/")} target="_top">
            Sign out
          </a>
        </section>
      </main>
    );
  const db = getDb();
  const [taskRows, deploymentRows, lookups, userRows, audits] =
    await Promise.all([
      db.select().from(tasks).orderBy(desc(tasks.updatedAt)),
      db.select().from(deployments).orderBy(asc(deployments.dateLabel)),
      db.select().from(lookupValues).orderBy(asc(lookupValues.sortOrder)),
      principal.role === "admin"
        ? db.select().from(users)
        : Promise.resolve([]),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100),
    ]);
  return (
    <Dashboard
      tasks={taskRows}
      deployments={deploymentRows}
      lookups={lookups}
      users={userRows}
      audits={audits}
      principal={{
        email: principal.identity.email,
        name: principal.identity.displayName,
        role: principal.role,
      }}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
