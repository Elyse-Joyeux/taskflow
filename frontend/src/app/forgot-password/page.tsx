"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, CircleCheck, Hash, KeyRound, LockKeyhole, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>;
}

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

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ message: string }>("/api/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      setSent(true);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resetWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    if (password !== confirm) {
      setError("The passwords don’t match.");
      setBusy(false);
      return;
    }
    try {
      await api("/api/password/reset", {
        method: "POST",
        body: JSON.stringify({ email, otp, password }),
      });
      router.replace("/login?passwordReset=1");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="content" className="auth-shell">
      <section className="auth-story" aria-label="Taskflow account recovery">
        <Link className="brand auth-brand" href="/"><BrandMark /><span>taskflow</span></Link>
        <div className="story-content">
          <span className="story-kicker"><i /> YOUR ACCOUNT, YOURS AGAIN</span>
          <h1>A fresh start<br />is just a link<br /><span>away.</span></h1>
          <p>We’ll send a secure link and one-time code so you can get back to good work.</p>
        </div>
        <span className="auth-story-foot">A calmer corner of the internet for getting things done.</span>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand"><Link className="brand" href="/"><BrandMark /><span>taskflow</span></Link></div>
        <div className="auth-form-wrap">
          <div className="auth-eyebrow"><KeyRound aria-hidden="true" /> PASSWORD RECOVERY</div>
          <h2>{sent ? "Check your inbox." : "Forgot your password?"}</h2>
          <p className="auth-subtitle">
            {sent
              ? "Enter the 6-digit code from your email and choose a new password, or use the reset link in that email."
              : "Enter the email on your account and we’ll send a reset link and a one-time code."}
          </p>

          {!sent ? (
            <form className="auth-form" onSubmit={requestReset}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="recovery-email">Email address</FieldLabel>
                  <div className="relative">
                    <Mail aria-hidden="true" className="auth-input-icon" />
                    <Input id="recovery-email" className="auth-shadcn-input" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </div>
                </Field>
              </FieldGroup>
              <Button size="lg" className="auth-submit w-full" disabled={busy}>
                {busy ? "Sending reset details…" : "Send reset details"}
                <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={resetWithCode}>
              {message && <Alert role="status"><CircleCheck aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="recovery-code">6-digit email code</FieldLabel>
                  <div className="relative">
                    <Hash aria-hidden="true" className="auth-input-icon" />
                    <Input id="recovery-code" className="auth-shadcn-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="recovery-password">New password</FieldLabel>
                  <div className="relative">
                    <LockKeyhole aria-hidden="true" className="auth-input-icon" />
                    <Input id="recovery-password" className="auth-shadcn-input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="recovery-confirm">Confirm new password</FieldLabel>
                  <div className="relative">
                    <LockKeyhole aria-hidden="true" className="auth-input-icon" />
                    <Input id="recovery-confirm" className="auth-shadcn-input" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Enter it one more time" />
                  </div>
                </Field>
              </FieldGroup>
              <Button size="lg" className="auth-submit w-full" disabled={busy}>
                {busy ? "Updating password…" : "Reset password"}
                <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
              </Button>
            </form>
          )}

          {error && <Alert variant="destructive" className="mt-4" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          <div className="auth-switch">
            <Link href="/login"><ArrowLeft aria-hidden="true" data-icon="inline-start" /> Back to sign in</Link>
          </div>
          <Link className={`${buttonVariants({ variant: "link" })} mt-2 w-full`} href="/">Return to Taskflow</Link>
        </div>
        <footer className="auth-footer"><span className="site-copyright">© 2026 Taskflow Inc. All rights reserved.</span></footer>
      </section>
    </main>
  );
}
