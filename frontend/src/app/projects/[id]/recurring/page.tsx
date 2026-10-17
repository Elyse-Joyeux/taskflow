"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import type { Priority, RecurringTask, User } from "@/lib/types";

export default function RecurringTasksPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [templates, setTemplates] = useState<RecurringTask[]>([]);
  const [members, setMembers]     = useState<User[]>([]);
  const [projectName, setProjectName] = useState("");
  const [myRole, setMyRole]       = useState("");
  const [showForm, setShowForm]   = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState("");
  const [busy, setBusy]           = useState(false);

  const emptyForm = () => ({
    title: "", description: "", priority: "medium" as Priority,
    assignee_id: "", estimated_hours: "", tags: "",
    frequency: "weekly" as "daily" | "weekly" | "monthly",
    interval_count: 1,
  });
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<{ project: { name: string; my_role: string }; members: User[]; tasks: unknown[] }>(`/api/projects/${id}`)
      .then((d) => { setProjectName(d.project.name); setMyRole(d.project.my_role ?? ""); setMembers(d.members); })
      .catch((e) => setError(e.message));
    api<RecurringTask[]>(`/api/projects/${id}/recurring`)
      .then(setTemplates)
      .catch((e) => setError(e.message));
  }, [id, router]);

  const canManage = ["owner", "admin"].includes(myRole);

  async function create(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      const t = await api<RecurringTask>(`/api/projects/${id}/recurring`, {
        method: "POST",
        body: JSON.stringify({
          title: form.title, description: form.description,
          priority: form.priority, assignee_id: form.assignee_id || null,
          estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
          tags, frequency: form.frequency, interval_count: Number(form.interval_count) || 1,
        }),
      });
      setTemplates((l) => [t, ...l]);
      setShowForm(false); setForm(emptyForm()); setSuccess("Recurring task created.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleActive(t: RecurringTask) {
    try {
      const updated = await api<RecurringTask>(`/api/recurring/${t.id}`, { method: "PATCH", body: JSON.stringify({ active: !t.active }) });
      setTemplates((l) => l.map((x) => x.id === t.id ? updated : x));
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteTemplate(t: RecurringTask) {
    if (!confirm(`Delete recurring task "${t.title}"?`)) return;
    try {
      await api(`/api/recurring/${t.id}`, { method: "DELETE" });
      setTemplates((l) => l.filter((x) => x.id !== t.id));
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Header />
      <main className="wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">
              <Link href={`/projects/${id}`} className="breadcrumb-link">{projectName}</Link> › RECURRING
            </span>
            <h1>Recurring tasks</h1>
            <p>Templates that automatically create tasks on a repeating schedule.</p>
          </div>
          {canManage && <button className="button button-primary" onClick={() => { setShowForm(true); setError(""); }}>＋ New template</button>}
        </div>

        {error   && <p className="auth-error" role="alert">{error}</p>}
        {success && <p className="workspace-success" role="status">✓ {success}</p>}

        {showForm && canManage && (
          <section className="settings-card" style={{ marginBottom: 24 }}>
            <h2>New recurring task</h2>
            <form className="settings-form" onSubmit={create}>
              <label className="field-label">Title <span aria-hidden>*</span>
                <input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Weekly status update" />
              </label>
              <label className="field-label">Description
                <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <div className="task-meta-grid">
                <label className="field-label">Priority
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                    <option value="low">Low</option><option value="medium">Medium</option>
                    <option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="field-label">Assignee
                  <select value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                  </select>
                </label>
                <label className="field-label">Frequency
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as "daily" | "weekly" | "monthly" })}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label className="field-label">Every N periods
                  <input type="number" min={1} max={99} value={form.interval_count} onChange={(e) => setForm({ ...form, interval_count: Number(e.target.value) })} />
                </label>
                <label className="field-label">Estimated hours
                  <input type="number" min={0} max={10000} step={0.25} value={form.estimated_hours} onChange={(e) => setForm({ ...form, estimated_hours: e.target.value })} placeholder="e.g. 1" />
                </label>
                <label className="field-label">Tags
                  <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="design, backend" />
                </label>
              </div>
              <div className="form-actions">
                <button type="button" className="button button-quiet" onClick={() => { setShowForm(false); setForm(emptyForm()); }}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={busy || !form.title.trim()}>{busy ? "Creating…" : "Create template"}</button>
              </div>
            </form>
          </section>
        )}

        {templates.length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-illustration">↻</div>
            <h3>No recurring tasks</h3>
            <p>Create templates to auto-generate tasks on a schedule.</p>
          </div>
        )}

        <div className="recurring-list">
          {templates.map((t) => (
            <article key={t.id} className={`automation-card${t.active ? "" : " disabled"}`}>
              <div className="automation-card-head">
                <div>
                  <div className="automation-title-row">
                    <span className="automation-status-dot" style={{ background: t.active ? "var(--accent)" : "#aaa" }} />
                    <b>{t.title}</b>
                    {!t.active && <span className="tag">Paused</span>}
                  </div>
                  <div className="automation-meta">
                    <span>Every {t.interval_count} {t.frequency === "daily" ? "day(s)" : t.frequency === "weekly" ? "week(s)" : "month(s)"}</span>
                    <span>Next run: <strong>{new Date(`${t.next_run_at}T00:00:00`).toLocaleDateString()}</strong></span>
                    <span className={`priority-badge priority-${t.priority}`}>{t.priority}</span>
                  </div>
                </div>
                {canManage && (
                  <div className="automation-card-actions">
                    <button className="button button-quiet" onClick={() => toggleActive(t)}>{t.active ? "Pause" : "Resume"}</button>
                    <button className="button button-quiet danger" onClick={() => deleteTemplate(t)}>Delete</button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
