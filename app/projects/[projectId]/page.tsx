import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import Dashboard from "@/components/dashboard/dashboard";
import { ProjectSettings } from "@/components/dashboard/project-settings";
import { camelize, getDb, unwrap } from "@/db";
import { projectPrincipal } from "@/lib/projects";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ProjectDashboard({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const identity = await requireChatGPTUser(`/projects/${projectId}`);
  const principal = await projectPrincipal(projectId, identity);
  if (!principal) redirect("/");
  const db = getDb();
  const [tasks, deployments, lookups] = await Promise.all([
    unwrap(await db.from("tasks").select().eq("project_id", projectId).order("updated_at", { ascending: false })),
    unwrap(await db.from("deployments").select().eq("project_id", projectId).order("date_label")),
    unwrap(await db.from("lookup_values").select().eq("project_id", projectId).order("sort_order")),
  ]);
  const project = principal.project;
  return <Dashboard projectId={projectId} tasks={camelize(tasks) as any} deployments={camelize(deployments) as any} lookups={camelize(lookups) as any} users={[]} audits={[]} accessRequests={[]} notificationsStartedAt={project.notifications_started_at} principal={{ email: principal.identity.email, name: principal.identity.displayName, role: principal.role }} signOutPath={chatGPTSignOutPath("/")} projectSettings={principal.role === "admin" ? <ProjectSettings projectId={projectId} name={project.name} description={project.description} /> : undefined} />;
}
