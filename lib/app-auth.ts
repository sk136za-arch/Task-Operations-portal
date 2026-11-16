import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const COOKIE_NAME = "task_ops_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type Session = AppUser & { expiresAt: number };

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET ?? (process.env.NODE_ENV !== "production" ? process.env.SUPABASE_SECRET_KEY : undefined);
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 characters long");
  }
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function equal(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function createSession(user: AppUser) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ ...user, expiresAt: Date.now() + SESSION_MAX_AGE * 1000 })));
  return `${payload}.${await sign(payload)}`;
}

export function createPasswordSalt() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64UrlToBytes(salt), iterations: 310_000 }, material, 256);
  return bytesToBase64Url(new Uint8Array(bits));
}

export async function readSession(token: string | undefined): Promise<AppUser | null> {
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length || !equal(signature, await sign(payload))) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as Session;
    if (!session.userId || !session.email || !session.displayName || session.expiresAt <= Date.now()) return null;
    return { userId: session.userId, email: session.email, displayName: session.displayName, fullName: session.fullName ?? null };
  } catch {
    return null;
  }
}

export async function getAppUser() {
  return readSession((await cookies()).get(COOKIE_NAME)?.value);
}

export async function setSessionCookie(user: AppUser) {
  (await cookies()).set(COOKIE_NAME, await createSession(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function requireAppUser(returnTo: string): Promise<AppUser> {
  const user = await getAppUser();
  if (user) return user;
  redirect(`/login?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`);
}

export function safeRelativeReturnPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    return url.origin === "https://app.local" && !url.pathname.startsWith("/api/auth/") ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
