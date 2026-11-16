import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ArrowRight, FolderKanban, ShieldCheck } from "lucide-react";
import { getDb, unwrap } from "@/db";
import { globalAdminEmails } from "@/lib/projects";
import { ProjectCreation } from "@/components/projects/project-creation";

export const dynamic = "force-dynamic";

export default async function ProjectChooser() {
  const identity = await requireChatGPTUser("/");
  const db = getDb(), email = identity.email.toLowerCase();
  const [projects, members, requests] = await Promise.all([
    unwrap<any[]>(await db.from("projects").select().eq("active", true).order("name")),
    unwrap<any[]>(await db.from("project_members").select("project_id, role, active").eq("email", email)),
    unwrap<any[]>(await db.from("project_access_requests").select("project_id, status").eq("email", email)),
  ]);
  const isSuperAdmin = globalAdminEmails().has(email);
  const membership = new Map(members.map((member) => [member.project_id, member]));
  const request = new Map(requests.map((item) => [item.project_id, item]));
  return <main className="project-chooser"><section className="project-chooser-shell">
    <header className="project-chooser-header"><div className="project-chooser-brand"><span className="project-chooser-mark">TO</span><span>Task Ops Portal</span></div><div className="project-chooser-user"><span className="project-chooser-avatar">{identity.displayName.slice(0, 1).toUpperCase()}</span><span>{identity.displayName}</span></div></header>
    <div className="chooser-toolbar"><div><p className="eyebrow">PROJECT WORKSPACE</p><h1>Choose a project</h1><p>Open a workspace or request access to follow delivery progress.</p></div><ProjectCreation isSuperAdmin={isSuperAdmin}/></div>
    <div className="project-grid">{projects.map((project) => { const member = membership.get(project.id); const status = request.get(project.id)?.status; const allowed = isSuperAdmin || member?.active; const role = isSuperAdmin ? "admin" : member?.role; return <article key={project.id} className="project-card"><div className="project-card-top"><div className="project-card-icon"><FolderKanban /></div>{role ? <span className="project-role"><ShieldCheck /> {role}</span> : status ? <span className={`project-status ${status}`}>{status}</span> : <span className="project-status">No access</span>}</div><h2>{project.name}</h2><p>{project.description || "No description provided for this project."}</p><div className="project-card-footer">{allowed ? <a className="project-open" href={`/projects/${project.id}`}>Open project <ArrowRight /></a> : <form action={`/api/projects/${project.id}/access-requests`} method="post"><button className="project-request" disabled={status === "pending"}>{status === "pending" ? "Request pending" : status === "rejected" ? "Request access again" : "Request viewer access"}</button></form>}</div></article>; })}</div>
  </section></main>;
}
