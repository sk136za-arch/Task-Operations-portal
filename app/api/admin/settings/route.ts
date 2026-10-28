import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLogs, lookupValues } from "@/db/schema";
import { requireRole } from "@/lib/authz";

const input = z.object({
  kind: z.enum(["environment", "team", "service", "status"]),
  value: z.string().trim().min(1).max(120),
});

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  return Response.json(await getDb().select().from(lookupValues));
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid lookup value" }, { status: 400 });
  const db = getDb();
  const existing = await db.select().from(lookupValues).where(and(eq(lookupValues.kind, parsed.data.kind), eq(lookupValues.value, parsed.data.value))).limit(1);
  if (existing.length) return Response.json({ error: "This value already exists" }, { status: 409 });
  const [order] = await db.select({ value: max(lookupValues.sortOrder) }).from(lookupValues).where(eq(lookupValues.kind, parsed.data.kind));
  const now = new Date().toISOString();
  const [created] = await db.insert(lookupValues).values({ ...parsed.data, active: true, sortOrder: (order?.value ?? 0) + 1 }).returning();
  await db.insert(auditLogs).values({ actorId: auth.principal.identity.userId, actorEmail: auth.principal.identity.email, action: "create", entityType: "lookup", entityId: `${created.kind}:${created.value}`, afterJson: JSON.stringify(created), createdAt: now });
  return Response.json(created, { status: 201 });
}
