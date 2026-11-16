"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RequestProjectAccess({ projectId, status }: { projectId: string; status?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = status === "pending"; const blocked = status === "blocked";
  async function requestAccess() {
    if (pending || blocked || busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/access-requests`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(body.error || "Unable to request access. Please try again."); return; }
      setMessage("Request sent. A project admin will review it.");
      router.refresh();
    } catch { setMessage("Unable to request access. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className="project-access-action"><button className="project-request" onClick={requestAccess} disabled={pending || blocked || busy}>{blocked ? "Request limit reached" : pending ? "Request pending" : busy ? "Sending request…" : status === "rejected" ? "Request access again" : "Request viewer access"}</button>{blocked && <small>Access cannot be requested again after three rejections.</small>}{message && <small role="status">{message}</small>}</div>;
}
