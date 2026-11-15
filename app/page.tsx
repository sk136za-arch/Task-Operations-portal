import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import Dashboard from "@/components/dashboard/dashboard";
import { camelize, getDb, unwrap } from "@/db";
import { currentPrincipal } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");
  const principal = await currentPrincipal();
  if (!principal?.role) return <main className="gate"><section><div className="logo">TO</div><p className="eyebrow">TASK OPS PORTAL</p><h1>Access pending</h1><p>บัญชี <strong>{principal?.identity.email}</strong> ยังไม่ได้รับสิทธิ์ กรุณาติดต่อ sk136za@gmail.com</p><a href={chatGPTSignOutPath("/")} target="_top">Sign out</a></section></main>;
  const db = getDb();
  const [taskRows, deploymentRows, lookups, userRows, audits] = await Promise.all([
    unwrap(await db.from("tasks").select().order("updated_at", { ascending: false })),
    unwrap(await db.from("deployments").select().order("date_label")),
    unwrap(await db.from("lookup_values").select().order("sort_order")),
    principal.role === "admin" ? unwrap(await db.from("users").select()) : [],
    unwrap(await db.from("audit_logs").select().order("created_at", { ascending: false }).limit(100)),
  ]);
  return <Dashboard tasks={camelize(taskRows) as any} deployments={camelize(deploymentRows) as any} lookups={camelize(lookups) as any} users={camelize(userRows) as any} audits={camelize(audits) as any} principal={{ email: principal.identity.email, name: principal.identity.displayName, role: principal.role }} signOutPath={chatGPTSignOutPath("/")} />;
}
