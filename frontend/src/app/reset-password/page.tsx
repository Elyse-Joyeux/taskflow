"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      setToken(new URLSearchParams(window.location.search).get("token") ?? ""),
    [],
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      await api<{ message: string }>("/api/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.replace("/login?passwordReset=1");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link className="brand auth-brand" href="/">
          <span className="brand-mark">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>taskflow</span>
        </Link>
        <div className="story-content">
          <span className="story-kicker">
            <i /> A SECURE RESET
          </span>
          <h1>
            Back to
            <br />
            your best
            <br />
            <span>work.</span>
          </h1>
          <p>Choose a new password and you’ll be right back with your team.</p>
        </div>
        <span className="auth-story-foot">
          A calmer corner of the internet for getting things done.
        </span>
      </section>
      <section className="auth-panel">
        <div className="auth-mobile-brand">
          <Link className="brand" href="/">
            <span className="brand-mark">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span>taskflow</span>
          </Link>
        </div>
        <div className="auth-form-wrap">
          <div className="auth-eyebrow">
            <span>✦</span> SET A NEW PASSWORD
          </div>
          <h2>Make it a good one.</h2>
          <p className="auth-subtitle">
            Choose a new password with at least 8 characters.
          </p>
          {!token ? (
            <p className="auth-error" role="alert">
              This reset link is missing or invalid. Request a fresh link to
              continue.
            </p>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <label>
                New password
                <div className="input-shell">
                  <span className="input-icon">⌑</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                </div>
              </label>
              <label>
                Confirm new password
                <div className="input-shell">
                  <span className="input-icon">⌑</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Enter it one more time"
                  />
                </div>
              </label>
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button button-primary auth-submit"
                disabled={busy}
              >
                {busy ? "Updating password…" : "Reset password"}
                <span>↗</span>
              </button>
            </form>
          )}
          <div className="auth-switch">
            <Link href="/forgot-password">Request another reset link</Link>
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
