"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "./dialogs";
import { useLoading } from "@/components/loading/loading-provider";

export function ProjectSettings({ projectId, name, description }: { projectId: string; name: string; description: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { runWithLoading } = useLoading();
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await runWithLoading("Saving project settings…", async () => {
        const response = await fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), description: form.get("description") }) });
        if (!response.ok) throw new Error((await response.json()).error || "Unable to save project settings");
        window.location.reload();
      });
    } catch (error) { alert(error instanceof Error ? error.message : "Unable to save project settings"); }
    finally { setBusy(false); }
  }
  return <>{<button className="secondary" onClick={() => setOpen(true)}><Settings2 /> Project settings</button>}{open && <Modal title="Project settings" close={() => setOpen(false)}><form className="form" onSubmit={save}><label>Project name<input name="name" defaultValue={name} maxLength={100} required /></label><label>Description<textarea name="description" defaultValue={description} maxLength={500} rows={4} /></label><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form></Modal>}</>;
}
