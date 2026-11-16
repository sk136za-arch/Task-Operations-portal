"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { useLoading } from "@/components/loading/loading-provider";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const { runWithLoading } = useLoading();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      await runWithLoading(mode === "signin" ? "Signing in…" : "Creating account…", async () => {
        const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mode === "signup" ? { email, displayName, password } : { email, password }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) { setMessage(body.error ?? "Unable to sign in. Please try again."); return; }
        window.location.assign(returnTo);
      });
    } catch { setMessage("Unable to sign in. Please try again."); }
    finally { setSaving(false); }
  }

  return <main className="login-page"><section className="login-card"><div className="login-brand"><span>TO</span> Task Ops Portal</div><div className="login-icon"><UserRound /></div><p className="eyebrow">SECURE WORKSPACE ACCESS</p><h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1><p className="login-copy">{mode === "signin" ? "Sign in with the password you created for this portal." : "Use your work email and create a password for this portal. It is not your email password."}</p><form onSubmit={submit}><label>Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" /></label>{mode === "signup" && <label>Name<input required autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" /></label>}<label>Password<input required type="password" minLength={mode === "signup" ? 10 : 1} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "signup" ? "At least 10 characters" : "Your portal password"} /></label>{message && <p className="login-error" role="alert">{message}</p>}<button className="login-submit" disabled={saving}>{saving ? "Please wait…" : <>{mode === "signin" ? "Sign in" : "Create account"} <ArrowRight /></>}</button></form><button className="login-switch" type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button><p className="login-note"><LockKeyhole /> Access to each project still requires approval from that project’s admin.</p></section></main>;
}
