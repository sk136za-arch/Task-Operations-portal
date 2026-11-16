import { LoginForm } from "@/components/auth/login-form";
import { safeRelativeReturnPath } from "@/lib/app-auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
  const { return_to: returnTo } = await searchParams;
  return <LoginForm returnTo={safeRelativeReturnPath(returnTo ?? "/")} />;
}
