import { importProjectCsv, projectIdFromSameOriginReferer } from "@/lib/project-csv";

// Supports a browser tab that still has the previous client bundle loaded.
export async function POST(request: Request) {
  const form = await request.formData();
  const explicitProjectId = form.get("projectId");
  const projectId = typeof explicitProjectId === "string" && explicitProjectId ? explicitProjectId : projectIdFromSameOriginReferer(request);
  if (!projectId) return Response.json({ error: "Project is required. Refresh this page and try again." }, { status: 400 });
  return importProjectCsv(projectId, form);
}
