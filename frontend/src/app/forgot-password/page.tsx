"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestReset(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ message: string }>("/api/password/forgot", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(result.message); setSent(true);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function resetWithCode(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    if (password !== confirm) { setError("The passwords don’t match."); setBusy(false); return; }
    try {
      await api("/api/password/reset", { method: "POST", body: JSON.stringify({ email, otp, password }) });
      router.replace("/login?passwordReset=1");
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell"><section className="auth-story"><Link className="brand auth-brand" href="/"><span className="brand-mark"><span/><span/><span/><span/></span><span>taskflow</span></Link><div className="story-content"><span className="story-kicker"><i/> YOUR ACCOUNT, YOURS AGAIN</span><h1>A fresh start<br/>is just a link<br/><span>away.</span></h1><p>We’ll send a secure link and a one-time code to your inbox so you can get back to good work.</p></div><span className="auth-story-foot">A calmer corner of the internet for getting things done.</span></section><section className="auth-panel"><div className="auth-mobile-brand"><Link className="brand" href="/"><span className="brand-mark"><span/><span/><span/><span/></span><span>taskflow</span></Link></div><div className="auth-form-wrap"><div className="auth-eyebrow"><span>✦</span> PASSWORD RECOVERY</div><h2>{sent ? "Check your inbox." : "Forgot your password?"}</h2><p className="auth-subtitle">{sent ? "Enter the 6-digit code from the email and choose a new password, or use the reset link in that email." : "Enter the email on your account and we’ll send a reset link and a one-time code."}</p>{!sent ? <form className="auth-form" onSubmit={requestReset}><label>Email address<div className="input-shell"><span className="input-icon">✉</span><input type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={e=>setEmail(e.target.value)}/></div></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy?"Sending reset details…":"Send reset details"}<span>↗</span></button></form> : <form className="auth-form" onSubmit={resetWithCode}><p className="settings-success" role="status">✓ {message}</p><label>6-digit email code<div className="input-shell"><span className="input-icon">#</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g, "").slice(0,6))}/></div></label><label>New password<div className="input-shell"><span className="input-icon">⌑</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="At least 8 characters" value={password} onChange={e=>setPassword(e.target.value)}/></div></label><label>Confirm new password<div className="input-shell"><span className="input-icon">⌑</span><input type="password" autoComplete="new-password" minLength={8} required placeholder="Enter it one more time" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div></label>{error&&<p className="auth-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy?"Updating password…":"Verify code & reset password"}<span>↗</span></button><button type="button" className="resend-code-button" disabled={busy} onClick={()=>{setSent(false);setOtp("");setPassword("");setConfirm("");setError("");}}>Send a new code</button></form>}<div className="auth-switch"><Link href="/login">← Back to sign in</Link></div></div><footer className="auth-footer"><Link href="/">← Back to Taskflow</Link><span>© 2026 Taskflow</span></footer></section></main>;
}
