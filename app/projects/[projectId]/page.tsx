import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import Dashboard from "@/components/dashboard/dashboard";
import { ProjectSettings } from "@/components/dashboard/project-settings";
import { camelize, getDb, unwrap } from "@/db";
import { globalAdminEmails, projectPrincipal } from "@/lib/projects";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ProjectDashboard({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireChatGPTUser(`/projects/${projectId}`);
  const principal = await projectPrincipal(projectId);
  if (!principal) redirect("/");
  const db = getDb();
  const [project, tasks, deployments, lookups, members, audits, accessRequests] = await Promise.all([
    unwrap<any>(await db.from("projects").select().eq("id", projectId).maybeSingle()),
    unwrap(await db.from("tasks").select().eq("project_id", projectId).order("updated_at", { ascending: false })),
    unwrap(await db.from("deployments").select().eq("project_id", projectId).order("date_label")),
    unwrap(await db.from("lookup_values").select().eq("project_id", projectId).order("sort_order")),
    principal.role === "admin" ? unwrap<any[]>(await db.from("project_members").select().eq("project_id", projectId)) : [],
    unwrap<any[]>(await db.from("audit_logs").select().eq("project_id", projectId).order("created_at", { ascending: false }).limit(100)),
    principal.role === "admin" ? unwrap(await db.from("project_access_requests").select().eq("project_id", projectId).eq("status", "pending").order("created_at", { ascending: false })) : [],
  ]);
  if (!project) redirect("/");
  const auditIds = audits.map((audit) => audit.id);
  const notificationReads = auditIds.length
    ? unwrap<any[]>(await db.from("project_notification_reads").select("audit_id").eq("project_id", projectId).eq("user_id", principal.identity.userId).in("audit_id", auditIds))
    : [];
  const superAdmins = globalAdminEmails();
  const users = camelize(members).map((member: any) => ({ ...member, isSuperAdmin: superAdmins.has(member.email.toLowerCase()) }));
  return <Dashboard projectId={projectId} tasks={camelize(tasks) as any} deployments={camelize(deployments) as any} lookups={camelize(lookups) as any} users={users as any} audits={camelize(audits) as any} accessRequests={camelize(accessRequests) as any} notificationReadIds={notificationReads.map((row) => row.audit_id)} notificationsStartedAt={project.notifications_started_at} principal={{ email: principal.identity.email, name: principal.identity.displayName, role: principal.role }} signOutPath={chatGPTSignOutPath("/")} projectSettings={principal.role === "admin" ? <ProjectSettings projectId={projectId} name={project.name} description={project.description} /> : undefined} />;
}
