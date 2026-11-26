"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Account = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  token?: string;
};
export default function SettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Account>("/api/me")
      .then((user) => {
        setAccount(user);
        setName(user.display_name);
        setEmail(user.email);
      })
      .catch((e) => setError(e.message));
  }, [router]);
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api<Account>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: name,
          email,
          current_password: profilePassword,
        }),
      });
      setAccount(updated);
      localStorage.setItem("name", updated.display_name);
      if (updated.token) localStorage.setItem("t", updated.token);
      setProfilePassword("");
      setSuccess("Your profile details have been saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const updated = await api<Account>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: name,
          email,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      if (updated.token) localStorage.setItem("t", updated.token);
      setCurrentPassword("");
      setNewPassword("");
      setSuccess("Your password has been changed.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell>
      <div className="settings-wrap">
        <div className="settings-title">
          <span className="workspace-overline">YOUR ACCOUNT</span>
          <h1>Settings</h1>
          <p>Manage your profile and keep your account up to date.</p>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav">
              <a className="active" href="#profile">
                Personal details
              </a>
              <a href="#security">Password &amp; security</a>
              <a href="/notification-preferences">Notification preferences ↗</a>
              <a href="/profile">Profile preview ↗</a>
          </nav>
          <div className="settings-content">
            <Card className="settings-card" id="profile">
              <CardHeader className="settings-card-heading">
                <span className="settings-icon">◉</span>
                <div>
                  <h2>Personal details</h2>
                  <p>Update the name and email your teammates see.</p>
                </div>
              </CardHeader>
              <CardContent>
              <form className="settings-form" onSubmit={saveProfile}>
                <div className="profile-photo-row">
                  <span className="profile-avatar">
                    {name.slice(0, 1).toUpperCase() || "U"}
                  </span>
                  <div>
                    <b>{name || "Your profile"}</b>
                    <small>
                      Taskflow member
                      {account?.created_at
                        ? ` since ${new Date(account.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
                        : ""}
                    </small>
                  </div>
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
                    <Input id="profile-name" required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="profile-email">Email address</FieldLabel>
                    <Input id="profile-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
                  </Field>
                  {email !== account?.email && (
                    <Field>
                      <FieldLabel htmlFor="profile-current-password">Current password</FieldLabel>
                      <Input id="profile-current-password" type="password" autoComplete="current-password" required value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} />
                      <small className="field-help">Confirm your password to change your email.</small>
                    </Field>
                  )}
                </FieldGroup>
                <Button type="submit" className="settings-save" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
              </form>
              </CardContent>
            </Card>
            <Card className="settings-card" id="security">
              <CardHeader className="settings-card-heading">
                <span className="settings-icon security-icon">⌑</span>
                <div>
                  <h2>Password & security</h2>
                  <p>Choose a strong password you don’t use elsewhere.</p>
                </div>
              </CardHeader>
              <CardContent>
              <form className="settings-form" onSubmit={savePassword}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                    <Input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-password">New password</FieldLabel>
                    <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    <small className="field-help">Use at least 8 characters.</small>
                  </Field>
                </FieldGroup>
                <Button type="submit" className="settings-save" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
              </form>
              </CardContent>
            </Card>
            {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert role="status"><AlertDescription>{success}</AlertDescription></Alert>}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
