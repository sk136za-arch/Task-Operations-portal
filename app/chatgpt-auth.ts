// Kept as a compatibility module while callers migrate to the app-password login.
export { getAppUser as getChatGPTUser, requireAppUser as requireChatGPTUser } from "@/lib/app-auth";
export type { AppUser as ChatGPTUser } from "@/lib/app-auth";

export function chatGPTSignOutPath(returnTo = "/") {
  return `/api/auth/signout?return_to=${encodeURIComponent(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/")}`;
}
