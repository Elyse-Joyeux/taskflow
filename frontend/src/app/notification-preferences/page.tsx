"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import { EVENT_TYPE_LABELS, type NotifPreference } from "@/lib/types";

export default function NotificationPreferencesPage() {
  const router = useRouter();
  const [prefs, setPrefs]   = useState<NotifPreference[]>([]);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy]     = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<NotifPreference[]>("/api/notification-preferences")
      .then(setPrefs)
      .catch((e) => setError(e.message));
  }, [router]);

  function toggle(eventType: string, field: "in_app" | "email_enabled") {
    setPrefs((l) => l.map((p) => p.event_type === eventType ? { ...p, [field]: !p[field] } : p));
  }

  async function save() {
    setBusy(true); setError(""); setSuccess("");
    try {
      await api("/api/notification-preferences", { method: "PATCH", body: JSON.stringify({ preferences: prefs }) });
      setSuccess("Notification preferences saved.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header />
      <main className="wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">YOUR ACCOUNT</span>
            <h1>Notification preferences</h1>
            <p>Choose which events trigger in-app and email notifications.</p>
          </div>
        </div>

        {error   && <p className="auth-error" role="alert">{error}</p>}
        {success && <p className="workspace-success" role="status">✓ {success}</p>}

        <section className="settings-card">
          <table className="notif-pref-table" aria-label="Notification preferences">
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">In-app</th>
                <th scope="col">Email</th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((pref) => (
                <tr key={pref.event_type}>
                  <td>{EVENT_TYPE_LABELS[pref.event_type] ?? pref.event_type}</td>
                  <td>
                    <label className="toggle-wrap" aria-label={`In-app notifications for ${EVENT_TYPE_LABELS[pref.event_type] ?? pref.event_type}`}>
                      <input
                        type="checkbox"
                        checked={pref.in_app}
                        onChange={() => toggle(pref.event_type, "in_app")}
                        role="switch"
                        aria-checked={pref.in_app}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td>
                    <label className="toggle-wrap" aria-label={`Email notifications for ${EVENT_TYPE_LABELS[pref.event_type] ?? pref.event_type}`}>
                      <input
                        type="checkbox"
                        checked={pref.email_enabled}
                        onChange={() => toggle(pref.event_type, "email_enabled")}
                        role="switch"
                        aria-checked={pref.email_enabled}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="field-help" style={{ marginTop: 12 }}>
            Email notifications require SMTP to be configured on the server.
          </p>
          <button className="button button-primary settings-save" disabled={busy} onClick={save} style={{ marginTop: 20 }}>
            {busy ? "Saving…" : "Save preferences"}
          </button>
        </section>
      </main>
    </>
  );
}
