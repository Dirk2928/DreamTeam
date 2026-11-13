"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "./auth-provider";
import { Button, Input } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get("email"));
      const password = String(form.get("password"));
      if (mode === "login") await login(email, password);
      else await register({ full_name: String(form.get("full_name")), email, password });
      toast.success(mode === "login" ? "Welcome back" : "Account created");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    {mode === "register" && <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Full name</span><Input name="full_name" placeholder="Juan Dela Cruz" minLength={2} maxLength={160} required /></label>}
    <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Email address</span><Input name="email" type="email" placeholder="you@example.com" required /></label>
    <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Password</span><span className="relative block"><Input name="password" type={show ? "text" : "password"} placeholder="At least 8 characters" minLength={8} maxLength={128} required /><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="absolute right-3 top-3 text-slate-400">{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span></label>
    {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <Button className="w-full" disabled={busy}>{busy ? <LoaderCircle size={18} className="animate-spin"/> : <>{mode === "login" ? "Sign in" : "Create account"}<ArrowRight size={18}/></>}</Button>
    <p className="text-center text-sm text-slate-500">{mode === "login" ? "New to PKonek?" : "Already have an account?"} <Link href={mode === "login" ? "/register" : "/login"} className="font-bold text-teal-700">{mode === "login" ? "Create an account" : "Sign in"}</Link></p>
  </form>;
}
