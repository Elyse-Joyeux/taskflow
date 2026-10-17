"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { STATUS_LABEL, WORKFLOW } from "@/lib/types";
import type {
  Attachment,
  ChecklistItem,
  Comment,
  Priority,
  Status,
  Subtask,
  Task,
  TaskDependency,
  User,
  Watcher,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Tab = "details" | "checklist" | "subtasks" | "dependencies" | "attachments" | "comments";

type ActivityEvent = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string;
  task_title?: string;
};

type Props = {
  task: Task;
  members: User[];
  onClose: () => void;
  onUpdate: (t: Task) => void;
  onDelete: (id: string) => void;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(value: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function actionLabel(action: string) {
  return action.replace(/\./g, " › ").replace(/_/g, " ");
}

export default function TaskModal({ task, members, onClose, onUpdate, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>("details");
  const [comments, setComments] = useState<Comment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [blockers, setBlockers] = useState<TaskDependency[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [watching, setWatching] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [newCheckItem, setNewCheckItem] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [depSearch, setDepSearch] = useState("");
  const [depResults, setDepResults] = useState<Task[]>([]);
  const [depSearching, setDepSearching] = useState(false);

  const [description, setDescription] = useState(task.description ?? "");
  const [acceptance, setAcceptance] = useState(task.acceptance_criteria ?? "");
  const [tags, setTags] = useState((task.tags ?? []).join(", "));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myUid = typeof window !== "undefined" ? localStorage.getItem("uid") ?? "" : "";

  useEffect(() => {
    setDescription(task.description ?? "");
    setAcceptance(task.acceptance_criteria ?? "");
    setTags((task.tags ?? []).join(", "));

    Promise.all([
      api<Comment[]>(`/api/tasks/${task.id}/comments`).then(setComments).catch(() => {}),
      api<ChecklistItem[]>(`/api/tasks/${task.id}/checklist`).then(setChecklist).catch(() => {}),
      api<Subtask[]>(`/api/tasks/${task.id}/subtasks`).then(setSubtasks).catch(() => {}),
      api<{ blockers: TaskDependency[] }>(`/api/tasks/${task.id}/dependencies`).then((d) => setBlockers(d.blockers)).catch(() => {}),
      api<Attachment[]>(`/api/tasks/${task.id}/attachments`).then(setAttachments).catch(() => {}),
      api<Watcher[]>(`/api/tasks/${task.id}/watchers`).then((w) => {
        setWatchers(w);
        setWatching(w.some((x) => x.user_id === myUid));
      }).catch(() => {}),
    ]);

    const s = getSocket();
    const onComment = (c: Comment) =>
      c.task_id === task.id && setComments((l) => (l.some((x) => x.id === c.id) ? l : [...l, c]));
    s.on("comment:new", onComment);
    return () => { s.off("comment:new", onComment); };
  }, [task.id, myUid]);

  // Load activity when tab is opened
  useEffect(() => {
    if (tab !== "comments") return;
    api<{ activity: ActivityEvent[] }>(`/api/projects/${task.project_id}/activity?limit=20`)
      .then((d) => setActivity(d.activity.filter((e) => e.task_title || String(e.details?.task_id ?? "") === task.id)))
      .catch(() => {});
  }, [tab, task.id, task.project_id]);

  async function patch(fields: Partial<Task>) {
    setSaving(true); setError("");
    try { onUpdate(await api<Task>(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(fields) })); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  // ── Checklist ────────────────────────────────────────────────
  async function addCheckItem(e: FormEvent) {
    e.preventDefault();
    if (!newCheckItem.trim()) return;
    try {
      const item = await api<ChecklistItem>(`/api/tasks/${task.id}/checklist`, { method: "POST", body: JSON.stringify({ title: newCheckItem }) });
      setChecklist((l) => [...l, item]); setNewCheckItem(""); setError("");
    } catch (e) { setError((e as Error).message); }
  }
  async function toggleCheckItem(item: ChecklistItem) {
    try {
      const updated = await api<ChecklistItem>(`/api/checklist/${item.id}`, { method: "PATCH", body: JSON.stringify({ completed: !item.completed }) });
      setChecklist((l) => l.map((x) => (x.id === item.id ? updated : x)));
    } catch (e) { setError((e as Error).message); }
  }
  async function deleteCheckItem(item: ChecklistItem) {
    try { await api(`/api/checklist/${item.id}`, { method: "DELETE" }); setChecklist((l) => l.filter((x) => x.id !== item.id)); }
    catch (e) { setError((e as Error).message); }
  }

  // ── Subtasks ─────────────────────────────────────────────────
  async function addSubtask(e: FormEvent) {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    try {
      const s = await api<Subtask>(`/api/tasks/${task.id}/subtasks`, { method: "POST", body: JSON.stringify({ title: newSubtask }) });
      setSubtasks((l) => [...l, s]); setNewSubtask(""); setError("");
    } catch (e) { setError((e as Error).message); }
  }
  async function toggleSubtask(sub: Subtask) {
    try {
      const updated = await api<Subtask>(`/api/subtasks/${sub.id}`, { method: "PATCH", body: JSON.stringify({ completed: !sub.completed }) });
      setSubtasks((l) => l.map((x) => (x.id === sub.id ? updated : x)));
    } catch (e) { setError((e as Error).message); }
  }
  async function deleteSubtask(sub: Subtask) {
    try { await api(`/api/subtasks/${sub.id}`, { method: "DELETE" }); setSubtasks((l) => l.filter((x) => x.id !== sub.id)); }
    catch (e) { setError((e as Error).message); }
  }

  // ── Dependencies ─────────────────────────────────────────────
  async function searchDeps(q: string) {
    if (!q.trim()) { setDepResults([]); return; }
    setDepSearching(true);
    try {
      const r = await api<Task[]>(`/api/search?q=${encodeURIComponent(q)}&project_id=${task.project_id}`);
      setDepResults(r.filter((t) => t.id !== task.id && !blockers.some((b) => b.id === t.id)));
    } catch { /* ignore */ }
    finally { setDepSearching(false); }
  }
  async function addDep(dep: Task) {
    try {
      await api(`/api/tasks/${task.id}/dependencies`, { method: "POST", body: JSON.stringify({ depends_on_id: dep.id }) });
      setBlockers((l) => [...l, { id: dep.id, title: dep.title, status: dep.status }]);
      setDepResults((l) => l.filter((x) => x.id !== dep.id));
      setDepSearch(""); setError("");
    } catch (e) { setError((e as Error).message); }
  }
  async function removeDep(dep: TaskDependency) {
    try { await api(`/api/tasks/${task.id}/dependencies/${dep.id}`, { method: "DELETE" }); setBlockers((l) => l.filter((x) => x.id !== dep.id)); }
    catch (e) { setError((e as Error).message); }
  }

  // ── Attachments ──────────────────────────────────────────────
  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = getToken();
      const response = await fetch(`${API_URL}/api/tasks/${task.id}/attachments`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: fd,
      });
      const data = await response.json() as { error?: string; id: string; filename: string; mime_type: string; size_bytes: number; created_at: string };
      if (!response.ok) throw new Error(data.error ?? "Upload failed");
      setAttachments((l) => [...l, data]);
    } catch (e) { setError((e as Error).message); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  }
  async function deleteAttachment(att: Attachment) {
    if (!confirm(`Delete "${att.filename}"?`)) return;
    try { await api(`/api/attachments/${att.id}`, { method: "DELETE" }); setAttachments((l) => l.filter((x) => x.id !== att.id)); }
    catch (e) { setError((e as Error).message); }
  }

  // ── Comments ─────────────────────────────────────────────────
  async function sendComment(e: FormEvent) {
    e.preventDefault(); if (!commentText.trim()) return;
    try {
      const c = await api<Comment>(`/api/tasks/${task.id}/comments`, { method: "POST", body: JSON.stringify({ body: commentText }) });
      setComments((l) => (l.some((x) => x.id === c.id) ? l : [...l, c]));
      setCommentText(""); setError("");
    } catch (e) { setError((e as Error).message); }
  }

  // ── Watchers ─────────────────────────────────────────────────
  async function toggleWatch() {
    try {
      if (watching) {
        await api(`/api/tasks/${task.id}/watch`, { method: "DELETE" });
        setWatchers((l) => l.filter((x) => x.user_id !== myUid));
      } else {
        await api(`/api/tasks/${task.id}/watch`, { method: "POST" });
        const myName = typeof window !== "undefined" ? localStorage.getItem("name") ?? "" : "";
        setWatchers((l) => [...l, { user_id: myUid, display_name: myName }]);
      }
      setWatching(!watching);
    } catch (e) { setError((e as Error).message); }
  }

  // ── Delete task ───────────────────────────────────────────────
  async function remove() {
    if (!confirm("Delete this task? This also removes its checklist and comments.")) return;
    try { await api(`/api/tasks/${task.id}`, { method: "DELETE" }); onDelete(task.id); onClose(); }
    catch (e) { setError((e as Error).message); }
  }

  const checkDone = checklist.filter((i) => i.completed).length;
  const subDone   = subtasks.filter((s) => s.completed).length;

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "details", label: "Details" },
    { key: "checklist", label: "Checklist", badge: checklist.length },
    { key: "subtasks", label: "Subtasks", badge: subtasks.length },
    { key: "dependencies", label: "Blockers", badge: blockers.length },
    { key: "attachments", label: "Files", badge: attachments.length },
    { key: "comments", label: "Comments", badge: comments.length },
  ];

  return (
    <div className="ov" onClick={onClose}>
      <section
        className="modal task-modal task-modal-full"
        role="dialog"
        aria-modal="true"
        aria-label="Task details"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="task-modal-top">
          <span className="workspace-overline">TASK DETAILS</span>
          <div className="task-modal-actions">
            <button
              className={`watcher-button${watching ? " is-watching" : ""}`}
              onClick={toggleWatch}
              title={watching ? "Stop watching" : "Watch this task"}
              aria-label={watching ? "Unwatch task" : "Watch task"}
            >
              {watching ? "👁 Watching" : "👁 Watch"}
            </button>
            <span className="save-indicator">{saving ? "Saving…" : "Auto-saved"}</span>
            <button className="icon-button" onClick={onClose} aria-label="Close task details">×</button>
          </div>
        </div>

        {/* ── Title ── */}
        <input
          aria-label="Task title"
          className="task-title-input"
          key={task.id + task.title}
          defaultValue={task.title}
          onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && patch({ title: e.target.value.trim() })}
        />

        {/* ── Watchers row ── */}
        {watchers.length > 0 && (
          <div className="watchers-row">
            <span className="field-help">Watching: </span>
            {watchers.map((w) => (
              <span key={w.user_id} className="tag">{w.display_name}</span>
            ))}
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="task-modal-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`task-tab${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.badge != null && t.badge > 0 && <span className="tab-badge">{t.badge}</span>}
            </button>
          ))}
        </div>

        <div className="task-modal-body" role="tabpanel">

          {/* ════ Details ════ */}
          {tab === "details" && (
            <>
              <label className="field-label">
                Description
                <textarea
                  className="task-description"
                  rows={4}
                  placeholder="Add context, notes, or what done looks like…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => description !== task.description && patch({ description })}
                />
              </label>
              <label className="field-label">
                Acceptance criteria
                <textarea
                  className="task-description"
                  rows={3}
                  placeholder="What does 'done' look like? List measurable conditions…"
                  value={acceptance}
                  onChange={(e) => setAcceptance(e.target.value)}
                  onBlur={() => acceptance !== (task.acceptance_criteria ?? "") && patch({ acceptance_criteria: acceptance } as Partial<Task>)}
                />
              </label>
              <div className="task-meta-grid">
                <label className="field-label">
                  Status
                  <select value={task.status} onChange={(e) => patch({ status: e.target.value as Status })}>
                    {(task.allowed_statuses ?? [task.status, ...(WORKFLOW[task.status] ?? [])]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Priority
                  <select value={task.priority ?? "medium"} onChange={(e) => patch({ priority: e.target.value as Priority })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label className="field-label">
                  Assignee
                  <select value={task.assignee_id ?? ""} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  Start date
                  <input type="date" value={task.start_date ? task.start_date.slice(0, 10) : ""} onChange={(e) => patch({ start_date: e.target.value || null })} />
                </label>
                <label className="field-label">
                  Due date
                  <input type="date" value={task.due_date ? task.due_date.slice(0, 10) : ""} onChange={(e) => patch({ due_date: e.target.value || null })} />
                </label>
                <label className="field-label">
                  Estimated effort (hours)
                  <input
                    type="number" min="0" max="10000" step="0.25" placeholder="e.g. 2.5"
                    value={task.estimated_hours ?? ""}
                    onChange={(e) => patch({ estimated_hours: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </label>
                <label className="field-label task-tags-field">
                  Tags
                  <input
                    placeholder="design, research, launch"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    onBlur={() => {
                      const next = [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10);
                      if (JSON.stringify(next) !== JSON.stringify(task.tags ?? [])) patch({ tags: next });
                    }}
                  />
                  <small className="field-help">Separate up to 10 tags with commas.</small>
                </label>
              </div>
            </>
          )}

          {/* ════ Checklist ════ */}
          {tab === "checklist" && (
            <section className="task-checklist">
              <div className="task-section-heading">
                <h3>Checklist</h3>
                <span>{checkDone}/{checklist.length} complete</span>
              </div>
              {checklist.length > 0 && (
                <div className="checklist-progress">
                  <div className="checklist-progress-bar">
                    <div style={{ width: `${checklist.length ? (checkDone / checklist.length) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
              <div className="checklist-items">
                {checklist.map((item) => (
                  <div className={`checklist-row${item.completed ? " is-complete" : ""}`} key={item.id}>
                    <input type="checkbox" checked={item.completed} onChange={() => toggleCheckItem(item)} id={`cl-${item.id}`} />
                    <label htmlFor={`cl-${item.id}`}>{item.title}</label>
                    <button className="checklist-delete" onClick={() => deleteCheckItem(item)} aria-label={`Delete ${item.title}`}>×</button>
                  </div>
                ))}
              </div>
              <form className="checklist-add" onSubmit={addCheckItem}>
                <input placeholder="Add a step to this task…" value={newCheckItem} onChange={(e) => setNewCheckItem(e.target.value)} />
                <button type="submit">Add step</button>
              </form>
            </section>
          )}

          {/* ════ Subtasks ════ */}
          {tab === "subtasks" && (
            <section className="task-checklist">
              <div className="task-section-heading">
                <h3>Subtasks</h3>
                <span>{subDone}/{subtasks.length} done</span>
              </div>
              {subtasks.length > 0 && (
                <div className="checklist-progress">
                  <div className="checklist-progress-bar">
                    <div style={{ width: `${subtasks.length ? (subDone / subtasks.length) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
              <div className="checklist-items">
                {subtasks.map((sub) => (
                  <div className={`checklist-row${sub.completed ? " is-complete" : ""}`} key={sub.id}>
                    <input type="checkbox" checked={sub.completed} onChange={() => toggleSubtask(sub)} id={`sub-${sub.id}`} />
                    <label htmlFor={`sub-${sub.id}`}>{sub.title}</label>
                    <button className="checklist-delete" onClick={() => deleteSubtask(sub)} aria-label={`Delete subtask ${sub.title}`}>×</button>
                  </div>
                ))}
              </div>
              <form className="checklist-add" onSubmit={addSubtask}>
                <input placeholder="Add a subtask…" value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} />
                <button type="submit">Add subtask</button>
              </form>
            </section>
          )}

          {/* ════ Dependencies ════ */}
          {tab === "dependencies" && (
            <section className="task-deps">
              <div className="task-section-heading">
                <h3>Blocked by</h3>
                <span>{blockers.length} {blockers.length === 1 ? "blocker" : "blockers"}</span>
              </div>
              {blockers.length === 0 && (
                <p className="empty-comments">No blockers. This task is free to proceed.</p>
              )}
              <div className="checklist-items">
                {blockers.map((dep) => (
                  <div className="dep-row" key={dep.id}>
                    <span className={`status-dot status-${dep.status}`} />
                    <span className="dep-title">{dep.title}</span>
                    <span className={`priority-badge priority-${dep.status}`}>{STATUS_LABEL[dep.status] ?? dep.status}</span>
                    <button className="checklist-delete" onClick={() => removeDep(dep)} aria-label={`Remove dependency ${dep.title}`}>×</button>
                  </div>
                ))}
              </div>
              <div className="dep-search-wrap">
                <label className="field-label">
                  Add a blocker from this project
                  <input
                    placeholder="Search tasks by name…"
                    value={depSearch}
                    onChange={(e) => { setDepSearch(e.target.value); void searchDeps(e.target.value); }}
                  />
                </label>
                {depSearching && <p className="field-help">Searching…</p>}
                {depResults.length > 0 && (
                  <div className="dep-results">
                    {depResults.slice(0, 8).map((t) => (
                      <button key={t.id} className="dep-result-item" onClick={() => addDep(t)}>
                        <span className={`status-dot status-${t.status}`} />
                        <span>{t.title}</span>
                        <small>{STATUS_LABEL[t.status]}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ════ Attachments ════ */}
          {tab === "attachments" && (
            <section className="task-attachments">
              <div className="task-section-heading">
                <h3>Files</h3>
                <span>{attachments.length} {attachments.length === 1 ? "file" : "files"}</span>
              </div>
              {attachments.length === 0 && (
                <p className="empty-comments">No files yet. Upload a reference document, screenshot, or spec.</p>
              )}
              <div className="attachment-list">
                {attachments.map((att) => (
                  <div className="attachment-row" key={att.id}>
                    <span className="attachment-icon">{att.mime_type.startsWith("image/") ? "🖼" : att.mime_type === "application/pdf" ? "📄" : "📎"}</span>
                    <div className="attachment-info">
                      <a
                        href={`${API_URL}/uploads/${att.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-name"
                        download={att.filename}
                        onClick={(e) => {
                          e.preventDefault();
                          // Fetch with auth header then open
                          fetch(`${API_URL}/uploads/${att.id}`, { headers: { Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("t") ?? "" : ""}` } })
                            .then((r) => r.blob())
                            .then((blob) => { const url = URL.createObjectURL(blob); Object.assign(document.createElement("a"), { href: url, download: att.filename }).click(); URL.revokeObjectURL(url); })
                            .catch(() => setError("Download failed"));
                        }}
                      >
                        {att.filename}
                      </a>
                      <small>{formatBytes(att.size_bytes)} · {timeAgo(att.created_at)}</small>
                    </div>
                    <button className="checklist-delete" onClick={() => deleteAttachment(att)} aria-label={`Delete ${att.filename}`}>×</button>
                  </div>
                ))}
              </div>
              <div className="attachment-upload">
                <input
                  ref={fileInputRef}
                  type="file"
                  id="att-upload"
                  className="sr-only"
                  onChange={uploadFile}
                  accept="image/*,.pdf,.txt,.csv,.docx,.xlsx,.zip"
                />
                <label htmlFor="att-upload" className={`button button-quiet upload-label${uploading ? " disabled" : ""}`}>
                  {uploading ? "Uploading…" : "＋ Upload file"}
                </label>
                <small className="field-help">Max 10 MB · images, PDFs, text, csv, docx, xlsx, zip</small>
              </div>
            </section>
          )}

          {/* ════ Comments + Activity ════ */}
          {tab === "comments" && (
            <>
              <section className="task-comments">
                <div className="task-section-heading">
                  <h3>Comments</h3>
                  <span>{comments.length} {comments.length === 1 ? "message" : "messages"}</span>
                </div>
                <div className="comment-list">
                  {comments.length === 0 && (
                    <span className="empty-comments">Start the conversation with a helpful note.</span>
                  )}
                  {comments.map((c) => (
                    <article className="cm" key={c.id}>
                      <div className="comment-author">
                        <span className="comment-avatar">{(c.name ?? "?").slice(0, 1).toUpperCase()}</span>
                        <div>
                          <b>{c.name}</b>
                          <time>{timeAgo(c.created_at)}</time>
                        </div>
                      </div>
                      <p>{c.body}</p>
                    </article>
                  ))}
                </div>
                <form className="comment-compose" onSubmit={sendComment}>
                  <input placeholder="Write a comment…" value={commentText} onChange={(e) => setCommentText(e.target.value)} />
                  <button className="p" type="submit">Send</button>
                </form>
              </section>

              {activity.length > 0 && (
                <section className="task-activity">
                  <div className="task-section-heading"><h3>Activity</h3></div>
                  <div className="comment-list">
                    {activity.slice(0, 10).map((ev) => (
                      <div className="activity-event" key={ev.id}>
                        <span className="activity-dot" />
                        <div>
                          <p><b>{ev.actor_name || "Someone"}</b> {actionLabel(ev.action)}</p>
                          <time>{timeAgo(ev.created_at)}</time>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="task-modal-bottom">
          <button className="delete-task-button" onClick={remove}>Delete task</button>
          <button className="button button-primary" onClick={onClose}>Done</button>
        </div>
      </section>
    </div>
  );
}
