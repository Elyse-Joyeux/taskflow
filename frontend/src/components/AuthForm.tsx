"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, setWorkspaceId } from "@/lib/api";

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
  const isSignup = mode === "signup";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const showDemo = !isSignup && process.env.NEXT_PUBLIC_ENABLE_DEMO === "true";
  useEffect(() => {
    if (!isSignup && new URLSearchParams(window.location.search).get("passwordReset") === "1")
      setNotice("Your password has been updated. Sign in with your new password.");
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
      // Set a session cookie so the middleware can guard SSR routes.
      // We store a non-secret flag only (JWT stays in localStorage).
      document.cookie = `tf_session=1; path=/; max-age=28800; SameSite=Lax`;
      if (result.workspace?.id) setWorkspaceId(result.workspace.id);
      const invite = new URLSearchParams(window.location.search).get("invite") ?? sessionStorage.getItem("taskflow_invite");
      if (invite) {
        try {
          const accepted = await api<{ project_id: string }>(
            `/api/invites/${invite}/accept`,
            { method: "POST" },
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

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link className="brand auth-brand" href="/">
          <BrandMark />
          <span>taskflow</span>
        </Link>
        <div className="story-content">
          <span className="story-kicker">
            <i /> A LITTLE MORE CLARITY, EVERY DAY
          </span>
          <h1>
            Good things
            <br />
            happen when
            <br />
            <span>work flows.</span>
          </h1>
          <p>
            Bring your team, projects, and next big idea into one thoughtful
            space.
          </p>
          <div className="story-board">
            <div className="story-board-head">
              <span>YOUR WEEK, IN FLOW</span>
              <span>
                THIS WEEK <b>⌄</b>
              </span>
            </div>
            <div className="story-item">
              <span className="story-check checked">✓</span>
              <span>Share the first concepts</span>
              <small>DONE</small>
            </div>
            <div className="story-item">
              <span className="story-check underway">↗</span>
              <span>Make room for feedback</span>
              <small>IN PROGRESS</small>
            </div>
            <div className="story-item">
              <span className="story-check">○</span>
              <span>Get the team on the same page</span>
              <small>UP NEXT</small>
            </div>
            <div className="story-board-foot">
              <div className="avatar-stack">
                <i>J</i>
                <i>M</i>
                <i>A</i>
              </div>
              <span>Good work, in good company.</span>
              <b>✳</b>
            </div>
          </div>
        </div>
        <span className="auth-story-foot">
          A calmer corner of the internet for getting things done.
        </span>
        <span className="auth-deco deco-auth-one">✳</span>
        <span className="auth-deco deco-auth-two">✳</span>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <Link className="brand" href="/">
            <BrandMark />
            <span>taskflow</span>
          </Link>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-eyebrow">
            <span>{isSignup ? "✳" : "✦"}</span>{" "}
            {isSignup ? "A FRESH START" : "WELCOME BACK"}
          </div>
          <h2>
            {isSignup
              ? "Make space for your next big thing."
              : "Your team’s good work is waiting."}
          </h2>
          <p className="auth-subtitle">
            {isSignup
              ? "Create your free workspace in just a moment."
              : "Sign in to pick up right where you left off."}
          </p>
          <form className="auth-form" onSubmit={submit}>
            {notice && <p className="settings-success" role="status">✓ {notice}</p>}
            {showDemo && (
              <div className="demo-login-card">
                <div><strong>Just looking around?</strong><span>Explore Taskflow with a sample team and live project data.</span></div>
                <button
                  className="button button-quiet demo-login-button"
                  type="button"
                  onClick={() => {
                    setForm({ name: "", email: "demo@taskflow.local", password: "TaskflowDemo2026!" });
                    setError("");
                    setNotice("Demo account selected. Sign in below to explore the sample workspace.");
                  }}
                >
                  Use demo account <span>↗</span>
                </button>
              </div>
            )}
            {isSignup && (
              <label>
                Your name
                <div className="input-shell">
                  <span className="input-icon">♙</span>
                  <input
                    autoComplete="name"
                    required
                    maxLength={40}
                    placeholder="What should we call you?"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </label>
            )}
            <label>
              Email address
              <div className="input-shell">
                <span className="input-icon">✉</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </label>
            <label>
              Password
              <div className="input-shell">
                <span className="input-icon">⌑</span>
                <input
                  type="password"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  minLength={isSignup ? 8 : undefined}
                  required
                  placeholder={
                    isSignup ? "At least 8 characters" : "Enter your password"
                  }
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
                {isSignup && <span className="input-hint">8+ chars</span>}
              </div>
            </label>
            {!isSignup && (
              <div className="auth-options">
                <label className="remember-option">
                  <input type="checkbox" /> <span>Keep me signed in</span>
                </label>
                <Link href="/forgot-password">Forgot password?</Link>
              </div>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={busy}
            >
              {busy
                ? isSignup
                  ? "Creating your space…"
                  : "Signing you in…"
                : isSignup
                  ? "Create my account"
                  : "Sign in to Taskflow"}
              <span>↗</span>
            </button>
          </form>
          <div className="auth-switch">
            {isSignup ? "Already have a workspace?" : "New to Taskflow?"}{" "}
          <Link href={isSignup ? "/login" : "/signup"} onClick={() => { const invite = new URLSearchParams(window.location.search).get("invite"); if (invite) sessionStorage.setItem("taskflow_invite", invite); }}>
              {isSignup ? "Sign in" : "Create an account"}
            </Link>
          </div>
          <div className="auth-privacy">
            <span>♧</span> Your work stays yours. We keep things simple and
            secure.
          </div>
        </div>
        <footer className="auth-footer">
          <Link href="/">← Back to Taskflow</Link>
          <span>© 2026 Taskflow</span>
        </footer>
      </section>
    </main>
  );
}
