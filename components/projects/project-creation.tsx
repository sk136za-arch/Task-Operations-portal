"use client";

import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";

export function ProjectCreation({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/project-creation-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: data.get("name"), description: data.get("description") }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "Unable to send request");
      form.reset();
      setOpen(false);
      setMessage("Request sent to a super admin.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send request");
    } finally { setBusy(false); }
  }

  return <div className="project-creation-actions">
    {isSuperAdmin && <a className="project-manage-link" href="/admin/projects"><Settings2 /> <span>Manage projects</span></a>}
    <button type="button" className="project-open" aria-expanded={open} aria-controls="project-create-form" onClick={() => { setOpen((current) => !current); setError(""); }}>{open ? "Close" : "New project"}</button>
    {open && <form id="project-create-form" className="project-create-form" aria-label="Request a new project" onSubmit={submit}><label>Project name<input name="name" required maxLength={100} placeholder="e.g. Mobile platform" /></label><label>Description<textarea name="description" maxLength={500} placeholder="What will this workspace manage?" /></label><div className="project-create-actions"><button type="button" className="reject" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="project-open" disabled={busy}>{busy ? "Sending…" : "Send request"}</button></div>{error && <small className="admin-feedback error" role="alert">{error}</small>}</form>}
    {message && <small className="project-create-feedback" role="status">{message}</small>}
  </div>;
}
