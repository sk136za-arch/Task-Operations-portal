"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLoading } from "@/components/loading/loading-provider";

export function RequestProjectAccess({ projectId, status, rejectedCount }: { projectId: string; status?: string; rejectedCount: number }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { runWithLoading } = useLoading();
  const pending = status === "pending"; const blocked = status === "blocked";
  async function requestAccess() {
    if (pending || blocked || busy) return;
    setBusy(true); setMessage("");
    try {
      await runWithLoading("Sending access request…", async () => {
        const response = await fetch(`/api/projects/${projectId}/access-requests`, { method: "POST" });
        const body = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) { setMessage(body.error || "Unable to request access. Please try again."); return; }
        setMessage("Request sent. A project admin will review it.");
        router.refresh();
      });
    } catch { setMessage("Unable to request access. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  return <div className="project-access-action"><button type="button" className="project-request" onClick={requestAccess} disabled={pending || blocked || busy}>{blocked ? "Request limit reached" : pending ? "Request pending" : busy ? "Sending request…" : status === "rejected" ? "Request access again" : "Request viewer access"}</button>{rejectedCount > 0 && <small>{blocked ? "Rejected 3/3 times. You cannot request access to this project again." : `Rejected ${rejectedCount}/3 times. Another rejection counts toward the three-request limit.`}</small>}{message && <small role="status">{message}</small>}</div>;
}
