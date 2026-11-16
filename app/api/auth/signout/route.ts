import { clearSessionCookie, safeRelativeReturnPath } from "@/lib/app-auth";

export async function GET(request: Request) {
  await clearSessionCookie();
  const returnTo = safeRelativeReturnPath(new URL(request.url).searchParams.get("return_to") ?? "/");
  return Response.redirect(new URL(returnTo, request.url), 303);
}
