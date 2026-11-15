import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { auditLogs, lookupValues } from "@/db/schema";
import { requireRole } from "@/lib/authz";

const input = z.object({
  kind: z.enum(["environment", "team", "service", "status"]),
  value: z.string().trim().min(1).max(120),
});
const dueInput = z
  .object({
    redDays: z.number().int().min(0).max(365),
    yellowDays: z.number().int().min(1).max(365),
    grayDays: z.number().int().min(1).max(365),
  })
  .refine(
    (value) =>
      value.redDays < value.yellowDays && value.yellowDays < value.grayDays,
    { message: "Due thresholds must increase from red to yellow to gray" },
  );

export async function GET() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  return Response.json(await getDb().select().from(lookupValues));
}

export async function POST(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const parsed = input.safeParse(await request.json());
  if (!parsed.success)
    return Response.json({ error: "Invalid lookup value" }, { status: 400 });
  const db = getDb();
  const existing = await db
    .select()
    .from(lookupValues)
    .where(
      and(
        eq(lookupValues.kind, parsed.data.kind),
        eq(lookupValues.value, parsed.data.value),
      ),
    )
    .limit(1);
  if (existing.length)
    return Response.json(
      { error: "This value already exists" },
      { status: 409 },
    );
  const [order] = await db
    .select({ value: max(lookupValues.sortOrder) })
    .from(lookupValues)
    .where(eq(lookupValues.kind, parsed.data.kind));
  const now = new Date().toISOString();
  const [created] = await db
    .insert(lookupValues)
    .values({
      ...parsed.data,
      active: true,
      sortOrder: (order?.value ?? 0) + 1,
    })
    .returning();
  await db
    .insert(auditLogs)
    .values({
      actorId: auth.principal.identity.userId,
      actorEmail: auth.principal.identity.email,
      action: "create",
      entityType: "lookup",
      entityId: `${created.kind}:${created.value}`,
      afterJson: JSON.stringify(created),
      createdAt: now,
    });
  return Response.json(created, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) return auth.error;
  const parsed = dueInput.safeParse(await request.json());
  if (!parsed.success)
    return Response.json(
      {
        error: "Due thresholds must increase from red to yellow to gray",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  const db = getDb();
  const before = await db
    .select()
    .from(lookupValues)
    .where(eq(lookupValues.kind, "due_threshold"));
  const now = new Date().toISOString();
  const values = [
    ["red", parsed.data.redDays],
    ["yellow", parsed.data.yellowDays],
    ["gray", parsed.data.grayDays],
  ] as const;
  await db.batch([
    db.delete(lookupValues).where(eq(lookupValues.kind, "due_threshold")),
    ...values.map(([name, days], index) =>
      db
        .insert(lookupValues)
        .values({
          kind: "due_threshold",
          value: `${name}:${days}`,
          active: true,
          sortOrder: index + 1,
        }),
    ),
    db
      .insert(auditLogs)
      .values({
        actorId: auth.principal.identity.userId,
        actorEmail: auth.principal.identity.email,
        action: "update_due_thresholds",
        entityType: "settings",
        entityId: "due_thresholds",
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(parsed.data),
        createdAt: now,
      }),
  ]);
  return Response.json(parsed.data);
}
