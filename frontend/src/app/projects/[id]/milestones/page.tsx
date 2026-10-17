"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import type { Milestone } from "@/lib/types";

export default function MilestonesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projectName, setProjectName] = useState("");
  const [myRole, setMyRole] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<{ project: { name: string; my_role: string }; members: unknown[]; tasks: unknown[] }>(`/api/projects/${id}`)
      .then((d) => { setProjectName(d.project.name); setMyRole(d.project.my_role ?? ""); })
      .catch((e) => setError(e.message));
    api<Milestone[]>(`/api/projects/${id}/milestones`)
      .then(setMilestones)
      .catch((e) => setError(e.message));
  }, [id, router]);

  const canManage = ["owner", "admin"].includes(myRole);

  function openCreate() { setEditId(null); setTitle(""); setDescription(""); setDueDate(""); setShowForm(true); setError(""); }
  function openEdit(m: Milestone) { setEditId(m.id); setTitle(m.title); setDescription(m.description); setDueDate(m.due_date?.slice(0,10) ?? ""); setShowForm(true); setError(""); }
  function cancel() { setShowForm(false); setEditId(null); setError(""); }

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      if (editId) {
        const updated = await api<Milestone>(`/api/milestones/${editId}`, { method: "PATCH", body: JSON.stringify({ title, description, due_date: dueDate || null }) });
        setMilestones((l) => l.map((m) => m.id === editId ? updated : m));
        setSuccess("Milestone updated.");
      } else {
        const created = await api<Milestone>(`/api/projects/${id}/milestones`, { method: "POST", body: JSON.stringify({ title, description, due_date: dueDate || null }) });
        setMilestones((l) => [...l, created]);
        setSuccess("Milestone created.");
      }
      cancel();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleComplete(m: Milestone) {
    try {
      const updated = await api<Milestone>(`/api/milestones/${m.id}`, { method: "PATCH", body: JSON.stringify({ completed: !m.completed_at }) });
      setMilestones((l) => l.map((x) => x.id === m.id ? updated : x));
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteMilestone(m: Milestone) {
    if (!confirm(`Delete milestone "${m.title}"?`)) return;
    try {
      await api(`/api/milestones/${m.id}`, { method: "DELETE" });
      setMilestones((l) => l.filter((x) => x.id !== m.id));
      setSuccess("Milestone deleted.");
    } catch (e) { setError((e as Error).message); }
  }

  const overdue = (m: Milestone) => m.due_date && !m.completed_at && new Date(`${m.due_date}T00:00:00`) < new Date();

  return (
    <>
      <Header />
      <main className="wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">
              <Link href={`/projects/${id}`} className="breadcrumb-link">{projectName}</Link> › MILESTONES
            </span>
            <h1>Milestones</h1>
            <p>Track major checkpoints and delivery goals for this project.</p>
          </div>
          {canManage && (
            <button className="button button-primary" onClick={openCreate}>＋ New milestone</button>
          )}
        </div>

        {error   && <p className="auth-error" role="alert">{error}</p>}
        {success && <p className="workspace-success" role="status">✓ {success}</p>}

        {/* ── Create / Edit form ── */}
        {showForm && canManage && (
          <section className="settings-card" style={{ marginBottom: 24 }}>
            <h2>{editId ? "Edit milestone" : "New milestone"}</h2>
            <form className="settings-form" onSubmit={save}>
              <label className="field-label">
                Title <span aria-hidden>*</span>
                <input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Beta launch" />
              </label>
              <label className="field-label">
                Description
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does reaching this milestone mean?" />
              </label>
              <label className="field-label">
                Due date
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <div className="form-actions">
                <button type="button" className="button button-quiet" onClick={cancel}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={busy || !title.trim()}>{busy ? "Saving…" : editId ? "Save changes" : "Create milestone"}</button>
              </div>
            </form>
          </section>
        )}

        {milestones.length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-illustration">◈</div>
            <h3>No milestones yet</h3>
            <p>Milestones mark the key moments in your project's journey.</p>
            {canManage && <button className="button button-primary" onClick={openCreate}>Add first milestone</button>}
          </div>
        )}

        <div className="milestone-list">
          {milestones.map((m) => {
            const pct = m.task_count > 0 ? Math.round((m.done_count / m.task_count) * 100) : 0;
            return (
              <article key={m.id} className={`milestone-card${m.completed_at ? " milestone-done" : ""}${overdue(m) ? " milestone-overdue" : ""}`}>
                <div className="milestone-card-head">
                  <div className="milestone-title-row">
                    <button
                      className={`milestone-check${m.completed_at ? " checked" : ""}`}
                      onClick={() => toggleComplete(m)}
                      aria-label={m.completed_at ? "Mark incomplete" : "Mark complete"}
                      title={m.completed_at ? "Mark incomplete" : "Mark complete"}
                    >
                      {m.completed_at ? "✓" : "○"}
                    </button>
                    <div>
                      <h3>{m.title}</h3>
                      {m.description && <p className="milestone-desc">{m.description}</p>}
                    </div>
                  </div>
                  {canManage && (
                    <div className="milestone-actions">
                      <button className="button button-quiet" onClick={() => openEdit(m)}>Edit</button>
                      <button className="button button-quiet danger" onClick={() => deleteMilestone(m)}>Delete</button>
                    </div>
                  )}
                </div>
                <div className="milestone-meta">
                  {m.due_date && (
                    <span className={`due-badge${overdue(m) ? " overdue" : ""}`}>
                      {overdue(m) ? "⚠ Overdue · " : "Due "}
                      {new Date(`${m.due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  )}
                  {m.completed_at && <span className="tag">Completed {new Date(m.completed_at).toLocaleDateString()}</span>}
                  <span className="tag">{m.task_count} tasks · {m.done_count} done</span>
                </div>
                {m.task_count > 0 && (
                  <div className="milestone-progress">
                    <div className="project-progress-bar">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                    <span>{pct}%</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
