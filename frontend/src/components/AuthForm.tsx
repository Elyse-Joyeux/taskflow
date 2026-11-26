"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { api, setWorkspaceId } from "@/lib/api";
import AeroShards from "@/components/AeroShards";
import { useTheme } from "@/components/ThemeProvider";

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isSignup = mode === "signup";

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isSignup && new URLSearchParams(window.location.search).get("passwordReset") === "1") {
      setNotice("Your password has been updated. Sign in with your new password.");
    }
  }, [isSignup]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const result = await api<{
        token: string;
        user: { id: string; name: string };
        workspace?: { id: string; name: string };
      }>(`/api/${isSignup ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify(form),
      });

      localStorage.setItem("t", result.token);
      localStorage.setItem("name", result.user.name);
      localStorage.setItem("uid", result.user.id);
      document.cookie = `tf_session=1; path=/; max-age=28800; SameSite=Lax`;

      if (result.workspace?.id) setWorkspaceId(result.workspace.id);

      const invite =
        new URLSearchParams(window.location.search).get("invite") ??
        sessionStorage.getItem("taskflow_invite");

      if (invite) {
        try {
          const accepted = await api<{ project_id: string }>(
            `/api/invites/${invite}/accept`,
            { method: "POST" }
          );
          sessionStorage.removeItem("taskflow_invite");
          router.push(`/projects/${accepted.project_id}`);
          return;
        } catch (inviteError) {
          setError((inviteError as Error).message);
          return;
        }
      }

      router.push("/projects");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Password strength helper
  const getPasswordStrength = () => {
    if (!form.password) return 0;
    let score = 0;
    if (form.password.length >= 8) score++;
    if (/[A-Z]/.test(form.password)) score++;
    if (/[0-9]/.test(form.password)) score++;
    if (/[^A-Za-z0-9]/.test(form.password)) score++;
    return score;
  };

  const strength = getPasswordStrength();

  return (
    <main id="content" className="auth-shell">
      {/* Top Floating Controls */}
      <div className="auth-floating-bar">
        <Link className="auth-back-home" href="/">
          <ArrowLeft aria-hidden="true" size={15} />
          <span>Back to Taskflow</span>
        </Link>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title="Toggle light/dark theme"
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? "Light" : "Dark"}
        </Button>
      </div>

      {/* Left Story Section */}
      <section className="auth-story">
        <div className="auth-shard-layer" aria-hidden="true">
          <AeroShards enabled={false} style={{ width: "100%", height: "100%" }} />
        </div>
        <Link className="brand auth-brand" href="/">
          <BrandMark />
          <span>taskflow</span>
        </Link>

        <div className="story-content">
          <div className="story-kicker">
            <i /> CALM & POWERFUL PROJECT WORKSPACE
          </div>
          <h1>
            {isSignup ? (
              <>
                Make space for
                <br />
                <span>meaningful progress.</span>
              </>
            ) : (
              <>
                Good things happen
                <br />
                when <span>work flows.</span>
              </>
            )}
          </h1>
          <p>
            {isSignup
              ? "Plan roadmaps, organize tasks, and collaborate with your team without the noise."
              : "Pick up right where your team left off. Every task, update, and discussion in sync."}
          </p>

          <div className="story-board" role="group" aria-label="Example launch project board">
            <div className="story-board-head">
              <span className="mac-lights" aria-hidden="true"><i /><i /><i /></span>
              <span>SAMPLE PROJECT</span>
              <span>LAUNCH ROADMAP</span>
            </div>
            <div className="story-item">
              <span>Define the launch brief</span>
              <small className="done">DONE</small>
            </div>
            <div className="story-item">
              <span>Review the sprint plan</span>
              <small className="in-progress">IN PROGRESS</small>
            </div>
            <div className="story-item">
              <span>Share the launch checklist</span>
              <small>UP NEXT</small>
            </div>
            <div className="story-board-foot">
              <span>Tasks, milestones, and team updates</span>
            </div>
          </div>
        </div>

        <div className="auth-story-foot">
          <span>Project boards · Team updates · Keyboard shortcuts</span>
        </div>
      </section>

      {/* Right Form Section */}
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <Link className="brand" href="/">
            <BrandMark />
            <span>taskflow</span>
          </Link>
        </div>

        <div className="auth-window">
          <div className="auth-window-bar">
            <span className="mac-lights" aria-hidden="true"><i /><i /><i /></span>
            <span>{isSignup ? "Create account" : "Sign in"}</span>
          </div>
        <div className="auth-form-wrap">
          <div className="auth-eyebrow">
            {isSignup ? "GET STARTED IN SECONDS" : "WELCOME BACK"}
          </div>
          <h2>
            {isSignup
              ? "Create your workspace."
              : "Sign in to Taskflow"}
          </h2>
          <p className="auth-subtitle">
            {isSignup
              ? "No credit card needed. Free for individual contributors and small teams."
              : "Enter your credentials to continue your project flow."}
          </p>

          <form className="auth-form" onSubmit={submit}>
            {notice && (
              <Alert role="status">
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            )}

            <FieldGroup>
              {isSignup && (
                <Field>
                  <FieldLabel htmlFor="signup-name">Your name</FieldLabel>
                  <div className="relative">
                    <UserRound aria-hidden="true" className="auth-input-icon" />
                    <Input
                      id="signup-name"
                      className="auth-shadcn-input"
                      autoComplete="name"
                      required
                      maxLength={40}
                      placeholder="e.g. Maya Lin"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </div>
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="auth-email">Work email</FieldLabel>
                <div className="relative">
                  <Mail aria-hidden="true" className="auth-input-icon" />
                  <Input
                    id="auth-email"
                    className="auth-shadcn-input"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="name@company.com"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
              </Field>

              <Field>
                <FieldLabel htmlFor="auth-password">Password</FieldLabel>
                <div className="relative">
                  <LockKeyhole aria-hidden="true" className="auth-input-icon" />
                  <Input
                    id="auth-password"
                    className="auth-shadcn-input auth-password-input"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    minLength={isSignup ? 8 : undefined}
                    required
                    placeholder={isSignup ? "8+ characters" : "••••••••"}
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((shown) => !shown)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
                </div>
              </Field>
            </FieldGroup>

            {isSignup && form.password.length > 0 && (
              <div className="auth-strength-meter">
                <Progress value={strength * 25} aria-label={`Password strength: ${strength} of 4`} />
                <small className="auth-strength-text">
                  {strength <= 1 ? "Too short or simple" : strength === 2 ? "Fair password" : strength === 3 ? "Good password" : "Strong password"}
                </small>
              </div>
            )}

            {!isSignup && (
              <div className="auth-options">
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            )}

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button className="auth-submit w-full" type="submit" size="lg" disabled={busy}>
              {busy ? (isSignup ? "Creating your space…" : "Signing you in…") : (isSignup ? "Create free account" : "Sign in to Taskflow")}
            </Button>
          </form>

          <div className="auth-switch">
            {isSignup ? "Already have an account?" : "Don't have an account yet?"}{" "}
            <Link
              href={isSignup ? "/login" : "/signup"}
              onClick={() => {
                const invite = new URLSearchParams(window.location.search).get("invite");
                if (invite) sessionStorage.setItem("taskflow_invite", invite);
              }}
            >
              {isSignup ? "Sign in" : "Sign up for free"}
            </Link>
          </div>

              <div className="auth-privacy">
                Passwords are hashed · Sessions expire after 8 hours
              </div>
        </div>
        </div>

        <footer className="auth-footer">
          <span className="site-copyright">© 2026 Taskflow Inc. All rights reserved.</span>
          <div className="auth-footer-links">
            <Link href="/">Home</Link>
            <Link href="/forgot-password">Reset password</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
