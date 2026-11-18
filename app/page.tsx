import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ArrowRight, FolderKanban, ShieldCheck } from "lucide-react";
import { getDb, unwrap } from "@/db";
import { globalAdminEmails } from "@/lib/projects";
import { ProjectCreation } from "@/components/projects/project-creation";
import { RequestProjectAccess } from "@/components/projects/request-project-access";

export const dynamic = "force-dynamic";

type ProjectRow = { id: string; name: string; description: string };
type MembershipRow = { project_id: string; role: string; active: boolean };
type AccessRequestRow = { project_id: string; status: string; created_at: string };

export default async function ProjectChooser() {
  const identity = await requireChatGPTUser("/");
  const db = getDb(), email = identity.email.toLowerCase();
  const [projects, members, requests] = await Promise.all([
    unwrap<ProjectRow[]>(await db.from("projects").select().eq("active", true).order("name")),
    unwrap<MembershipRow[]>(await db.from("project_members").select("project_id, role, active").eq("email", email)),
    unwrap<AccessRequestRow[]>(await db.from("project_access_requests").select("project_id, status, created_at").eq("email", email).order("created_at", { ascending: false })),
  ]);
  const isSuperAdmin = globalAdminEmails().has(email);
  const membership = new Map(members.map((member) => [member.project_id, member]));
  const request = new Map<string, AccessRequestRow>(); requests.forEach((item) => { if (!request.has(item.project_id)) request.set(item.project_id, item); });
  const rejectedCount = new Map<string, number>(); requests.filter((item) => item.status === "rejected").forEach((item) => rejectedCount.set(item.project_id, (rejectedCount.get(item.project_id) ?? 0) + 1));
  return <main className="project-chooser"><section className="project-chooser-shell">
    <header className="project-chooser-header"><div className="project-chooser-brand"><span className="project-chooser-mark">TO</span><span>Task Ops Portal</span></div><div className="project-chooser-user"><span className="project-chooser-avatar">{identity.displayName.slice(0, 1).toUpperCase()}</span><span>{identity.displayName}</span></div></header>
    <div className="chooser-toolbar"><div><p className="eyebrow">PROJECT WORKSPACE</p><h1>Choose a project</h1><p>Open a workspace or request access to follow delivery progress.</p></div><ProjectCreation isSuperAdmin={isSuperAdmin}/></div>
    {projects.length ? <div className="project-grid">{projects.map((project) => { const member = membership.get(project.id); const latest = request.get(project.id); const rejections = rejectedCount.get(project.id) ?? 0; const status = rejections >= 3 ? "blocked" : latest?.status; const allowed = isSuperAdmin || member?.active; const role = isSuperAdmin ? "admin" : member?.role; return <article key={project.id} className="project-card"><div className="project-card-top"><div className="project-card-icon"><FolderKanban /></div>{role ? <span className="project-role"><ShieldCheck /> {role}</span> : status ? <span className={`project-status ${status}`}>{status === "blocked" ? "Request limit reached" : status}</span> : <span className="project-status">No access</span>}</div><h2>{project.name}</h2><p>{project.description || "No description provided for this project."}</p><div className="project-card-footer">{allowed ? <a className="project-open" href={`/projects/${project.id}`}>Open project <ArrowRight /></a> : <RequestProjectAccess projectId={project.id} status={status} rejectedCount={rejections} />}</div></article>; })}</div> : <div className="project-empty"><FolderKanban /><h2>No active projects yet</h2><p>Request a new project and a super admin can review it.</p></div>}
  </section></main>;
}
