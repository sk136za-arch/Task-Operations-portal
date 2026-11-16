"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FolderKanban, Pencil, Search, X } from "lucide-react";
import Link from "next/link";
import { useLoading } from "@/components/loading/loading-provider";

type Project = { id: string; name: string; description: string; active: boolean; updated_at: string };
type ProjectRequest = { id: number; name: string; description: string; requester_name: string; requester_email: string; status: string };

function formatDate(value: string) { return value ? value.slice(0, 10) : "—"; }
async function responseBody(response: Response): Promise<{ error?: string; id?: string }> { return response.json().catch(() => ({})) as Promise<{ error?: string; id?: string }>; }

export function AdminProjects({ projects: initialProjects, requests: initialRequests }: { projects: Project[]; requests: ProjectRequest[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [requests, setRequests] = useState(initialRequests);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [busyRequest, setBusyRequest] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const dialogRef = useRef<HTMLFormElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { runWithLoading } = useLoading();
  const visible = useMemo(() => projects.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const pendingRequests = requests.filter((request) => request.status === "pending");
  const editingId = editing?.id;

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setEditError("");
    requestAnimationFrame(() => editTriggerRef.current?.focus());
  }

  useEffect(() => {
    if (editingId) dialogRef.current?.querySelector<HTMLInputElement>("input[name='projectName']")?.focus();
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    const dialog = dialogRef.current;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!saving) {
          setEditing(null);
          setEditError("");
          requestAnimationFrame(() => editTriggerRef.current?.focus());
        }
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editingId, saving]);

  async function review(id: number, action: "approve" | "reject") {
    if (busyRequest !== null) return;
    setBusyRequest(id);
    setError("");
    try {
      await runWithLoading(action === "approve" ? "Approving project request…" : "Rejecting project request…", async () => {
        const response = await fetch(`/api/admin/project-creation-requests/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
        const body = await responseBody(response);
        if (!response.ok) throw new Error(body.error || "Unable to review request");
        setRequests((current) => current.filter((request) => request.id !== id));
        if (action === "approve") window.location.reload();
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to review request");
    } finally { setBusyRequest(null); }
  }

  async function save() {
    if (!editing || saving) return;
    setSaving(true);
    setEditError("");
    try {
      await runWithLoading("Saving project…", async () => {
        const response = await fetch("/api/admin/projects", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(editing) });
        const body = await responseBody(response);
        if (!response.ok) throw new Error(body.error || "Unable to save project");
        setProjects((current) => current.map((project) => project.id === body.id ? body as Project : project));
        setEditing(null);
        requestAnimationFrame(() => editTriggerRef.current?.focus());
      });
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Unable to save project");
    } finally { setSaving(false); }
  }

  return <main className="admin-projects">
    <aside className="admin-sidebar"><div className="admin-brand"><FolderKanban /> <span>Task Ops Portal<small>Super admin</small></span></div><Link href="/">Projects</Link><Link className="active" aria-current="page" href="/admin/projects">Manage projects</Link></aside>
    <section className="admin-content">
      <header className="admin-heading"><Link href="/">← Projects</Link><h1>Manage projects</h1><p>Review requests and maintain your workspace directory.</p></header>
      <section className="pending-panel" aria-labelledby="pending-title"><div className="panel-title"><div><h2 id="pending-title">Pending approval <b>{pendingRequests.length}</b></h2><p>Project requests awaiting your decision.</p></div></div>
        {error && <p className="admin-feedback error" role="alert">{error}</p>}
        <div className="pending-grid">{pendingRequests.map((request) => <article key={request.id} className="pending-card"><small>New project request</small><h3>{request.name}</h3><p>{request.description || "No description provided."}</p><div className="requester">{request.requester_name}<span>{request.requester_email}</span></div><footer><button type="button" className="approve" disabled={busyRequest !== null} onClick={() => review(request.id, "approve")}><Check /> {busyRequest === request.id ? "Reviewing…" : "Approve"}</button><button type="button" className="reject" disabled={busyRequest !== null} onClick={() => review(request.id, "reject")}><X /> Reject</button></footer></article>)}{!pendingRequests.length && <p className="empty-state">No pending project requests.</p>}</div>
      </section>
      <section className="directory-panel" aria-labelledby="projects-title"><div className="directory-head"><div><h2 id="projects-title">All projects</h2><p>Manage setup, ownership, and status.</p></div><label className="project-search"><Search /><span className="sr-only">Search projects</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects…" /></label></div>
        <div className="project-table"><div className="project-table-head"><span>Project</span><span>Description</span><span>Status</span><span>Updated</span><span /></div>{visible.map((project) => <div className="project-row" key={project.id}><strong>{project.name}</strong><span>{project.description || "—"}</span><span className={project.active ? "status-active" : "status-inactive"}>{project.active ? "● Active" : "● Inactive"}</span><span>{formatDate(project.updated_at)}</span><button type="button" aria-label={`Edit ${project.name}`} onClick={(event) => { editTriggerRef.current = event.currentTarget; setEditError(""); setEditing({ ...project }); }}><Pencil /></button></div>)}{!visible.length && <p className="empty-state">No projects match your search.</p>}</div>
      </section>
      {editing && <div className="project-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}><form ref={dialogRef} className="project-drawer" role="dialog" aria-modal="true" aria-labelledby="project-editor-title" onSubmit={(event) => { event.preventDefault(); save(); }}><button type="button" className="drawer-close" aria-label="Close project editor" disabled={saving} onClick={closeEditor}>×</button><p className="eyebrow">PROJECT SETTINGS</p><h2 id="project-editor-title">Edit project</h2><label>Name<input name="projectName" value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} required maxLength={100} /></label><label>Description<textarea value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} maxLength={500} /></label><label className="toggle"><input type="checkbox" checked={editing.active} onChange={(event) => setEditing({ ...editing, active: event.target.checked })} /> Active project</label>{editError && <p className="admin-feedback error" role="alert">{editError}</p>}<button className="approve" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></form></div>}
    </section>
  </main>;
}
