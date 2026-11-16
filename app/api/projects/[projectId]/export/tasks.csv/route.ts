import { exportProjectCsv } from "@/lib/project-csv";
export async function GET(_: Request, { params }: { params: Promise<{ projectId: string }> }) { return exportProjectCsv((await params).projectId); }
