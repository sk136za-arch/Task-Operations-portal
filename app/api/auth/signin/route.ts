import { hashPassword, setSessionCookie } from "@/lib/app-auth";
import { getDb, unwrap } from "@/db";
import { z } from "zod";

const input = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) });

function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Enter your email and password." }, { status: 400 });
  const account = unwrap(await getDb().from("app_accounts").select().eq("email", parsed.data.email.toLowerCase()).maybeSingle());
  if (!account || !equal(await hashPassword(parsed.data.password, account.password_salt), account.password_hash)) return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
  await setSessionCookie({ userId: account.id, email: account.email, displayName: account.display_name, fullName: account.display_name });
  return Response.json({ ok: true });
}
