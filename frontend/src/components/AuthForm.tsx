"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, setWorkspaceId } from "@/lib/api";
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

// Clean inline SVG Icons (no AI generated icons)
function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
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
    <main className="auth-shell">
      {/* Top Floating Controls */}
      <div className="auth-floating-bar">
        <Link className="auth-back-home" href="/">
          ← Back to Taskflow
        </Link>
        <button
          className="auth-theme-toggle-btn"
          type="button"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          title="Toggle light/dark theme"
          aria-label="Toggle theme"
        >
          {resolvedTheme === "dark" ? "Light" : "Dark"}
        </button>
      </div>

      {/* Left Story Section */}
      <section className="auth-story">
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
              <p className="settings-success" role="status">
                {notice}
              </p>
            )}

            {isSignup && (
              <label>
                Your name
                <div className="input-shell">
                  <span className="input-icon">
                    <UserIcon />
                  </span>
                  <input
                    autoComplete="name"
                    required
                    maxLength={40}
                    placeholder="e.g. Maya Lin"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </label>
            )}

            <label>
              Work email
              <div className="input-shell">
                <span className="input-icon">
                  <MailIcon />
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </label>

            <label>
              Password
              <div className="input-shell">
                <span className="input-icon">
                  <LockIcon />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={isSignup ? 8 : undefined}
                  required
                  placeholder={isSignup ? "8+ characters" : "••••••••"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>

            {/* Password strength meter on signup */}
            {isSignup && form.password.length > 0 && (
              <div className="auth-strength-meter">
                <div className="auth-strength-bars">
                  <span className={`bar ${strength >= 1 ? "active" : ""}`} />
                  <span className={`bar ${strength >= 2 ? "active" : ""}`} />
                  <span className={`bar ${strength >= 3 ? "active" : ""}`} />
                  <span className={`bar ${strength >= 4 ? "active" : ""}`} />
                </div>
                <small className="auth-strength-text">
                  {strength <= 1
                    ? "Too short or simple"
                    : strength === 2
                      ? "Fair password"
                      : strength === 3
                        ? "Good password"
                        : "Strong password"}
                </small>
              </div>
            )}

            {!isSignup && (
              <div className="auth-options">
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            )}

            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}

            <button className="button button-primary auth-submit" type="submit" disabled={busy}>
              {busy
                ? isSignup
                  ? "Creating your space…"
                  : "Signing you in…"
                : isSignup
                  ? "Create free account"
                  : "Sign in to Taskflow"}
            </button>
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
          <span>© 2026 Taskflow Inc. All rights reserved.</span>
          <div className="auth-footer-links">
            <Link href="/">Home</Link>
            <Link href="/forgot-password">Reset password</Link>
          </div>
        </footer>
      </section>
    </main>
  );
}
