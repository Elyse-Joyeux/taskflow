"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";

type ActivityEvent = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string;
  task_id: string | null;
  task_title: string | null;
  project_id: string;
};

function actionLabel(action: string) {
  const map: Record<string, string> = {
    "task.created":          "created a task",
    "task.updated":          "updated a task",
    "task.status_changed":   "moved a task",
    "task.deleted":          "deleted a task",
    "task.commented":        "commented on",
    "task.attachment_added": "added an attachment to",
    "member.added":          "added a member",
    "member.removed":        "removed a member",
    "member.joined":         "joined the project",
    "member.role_changed":   "changed a member's role",
    "project.updated":       "updated the project",
    "project.archived":      "archived the project",
    "project.restored":      "restored the project",
    "milestone.created":     "created a milestone",
    "community.posted":      "posted in community",
  };
  return map[action] ?? action.replace(/\./g, " › ").replace(/_/g, " ");
}

const ACTION_ICON: Record<string, string> = {
  "task.created": "✚",
  "task.updated": "✎",
  "task.status_changed": "↗",
  "task.deleted": "⌫",
  "task.commented": "◯",
  "member.added": "＋",
  "milestone.created": "◈",
  "community.posted": "✳",
};

export default function ProjectActivityPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [projectName, setProjectName] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const LIMIT = 40;

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<{ project: { name: string } }>(`/api/projects/${id}`)
      .then((d) => setProjectName(d.project.name))
      .catch(() => {});
  }, [id, router]);

  useEffect(() => {
    setLoading(true); setError("");
    api<{ activity: ActivityEvent[]; total: number; page: number }>(`/api/projects/${id}/activity?page=${page}&limit=${LIMIT}`)
      .then((d) => { setEvents(d.activity); setTotal(d.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, page]);

  const pages = Math.ceil(total / LIMIT);

  return (
    <>
      <Header />
      <main className="wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">
              <Link href={`/projects/${id}`} className="breadcrumb-link">{projectName}</Link> › ACTIVITY
            </span>
            <h1>Activity feed</h1>
            <p>Every change, comment, and member action in this project.</p>
          </div>
          <Link className="button button-quiet" href={`/projects/${id}`}>← Back to board</Link>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {loading && <p className="mut" style={{ textAlign: "center", padding: "20px" }}>Loading…</p>}

        <section className="settings-card">
          <div className="community-activity-list">
            {events.length === 0 && !loading && (
              <div className="empty-state" style={{ padding: "32px 0" }}>
                <span style={{ fontSize: 32 }}>✳</span>
                <h3>No activity yet</h3>
                <p>Project actions will appear here as your team gets moving.</p>
              </div>
            )}
            {events.map((ev) => (
              <article className="community-activity activity-feed-item" key={ev.id}>
                <span className="activity-icon-circle">{ACTION_ICON[ev.action] ?? "✦"}</span>
                <div className="activity-feed-content">
                  <p>
                    <b>{ev.actor_name || "Someone"}</b> {actionLabel(ev.action)}
                    {ev.task_title && (
                      <>
                        {" "}<Link href={`/projects/${id}?task=${ev.task_id}`} className="activity-task-link">{ev.task_title}</Link>
                      </>
                    )}
                  </p>
                  {ev.details && Object.keys(ev.details).length > 0 && ev.details.title && (
                    <small className="mut">"{String(ev.details.title)}"</small>
                  )}
                  <time className="activity-time">{new Date(ev.created_at).toLocaleString()}</time>
                </div>
              </article>
            ))}
          </div>

          {pages > 1 && (
            <div className="pagination-row">
              <button className="button button-quiet" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button>
              <span>Page {page} of {pages}</span>
              <button className="button button-quiet" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
