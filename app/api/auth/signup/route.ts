import { createPasswordSalt, hashPassword, setSessionCookie } from "@/lib/app-auth";
import { getDb, unwrap } from "@/db";
import { z } from "zod";

const input = z.object({ email: z.string().trim().email().max(254), displayName: z.string().trim().min(1).max(100), password: z.string().min(10).max(128) });

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Enter a valid email, name, and a password of at least 10 characters." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const db = getDb();
  const existing = unwrap(await db.from("app_accounts").select("id").eq("email", email).maybeSingle());
  if (existing) return Response.json({ error: "An account with this email already exists. Sign in instead." }, { status: 409 });
  const salt = createPasswordSalt();
  const id = `account:${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  unwrap(await db.from("app_accounts").insert({ id, email, display_name: parsed.data.displayName, password_salt: salt, password_hash: await hashPassword(parsed.data.password, salt), created_at: now, updated_at: now }));
  await setSessionCookie({ userId: id, email, displayName: parsed.data.displayName, fullName: parsed.data.displayName });
  return Response.json({ ok: true }, { status: 201 });
}
