"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import { STATUS_LABEL, type Status } from "@/lib/types";

type Dashboard = {
  stats: {
    project_count: number;
    task_count: number;
    done_count: number;
    open_count: number;
    overdue_count: number;
    completed_this_week: number;
    remaining_hours: number;
  };
  by_status: { status: Status; count: number }[];
  by_priority: { priority: string; count: number }[];
  recent: {
    id: string;
    action: string;
    created_at: string;
    project_id: string;
    project_name: string;
    task_title: string | null;
    actor_name: string;
  }[];
};

const actionLabel = (action: string) => action.replaceAll(".", " ").replaceAll("_", " ");

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    async function load() {
      setLoading(true);
      setError("");
      try {
        let workspaceId = getWorkspaceId();
        if (!workspaceId) {
          const workspaces = await api<{ id: string }[]>("/api/workspaces");
          workspaceId = workspaces[0]?.id ?? null;
          if (workspaceId) setWorkspaceId(workspaceId);
        }
        if (!workspaceId) throw new Error("Create or join a workspace to view its dashboard.");
        setData(await api<Dashboard>(`/api/workspaces/${workspaceId}/dashboard`));
      } catch (reason) {
        setError((reason as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router, refreshKey]);

  const totalStatus = data?.by_status.reduce((sum, row) => sum + row.count, 0) || 1;
  const totalPriority = data?.by_priority.reduce((sum, row) => sum + row.count, 0) || 1;

  return (
    <>
      <Header />
      <main className="wrap dashboard-wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">ANALYTICS</span>
            <h1>Workspace dashboard</h1>
            <p>Live counts from your database, not a static mock.</p>
          </div>
          <Link className="button button-primary" href="/projects">
            Open projects <span>↗</span>
          </Link>
        </div>
        {error && <div className="dashboard-error" role="alert"><div><b>Dashboard data could not be loaded</b><p>{error}</p></div><button className="button button-primary" onClick={() => setRefreshKey(key => key + 1)}>Try again</button></div>}
        {loading && <section className="dashboard-loading" role="status" aria-live="polite"><span className="dashboard-spinner"/><b>Loading workspace analytics</b><span>Gathering project and task activity…</span><div className="dashboard-skeletons"><i/><i/><i/><i/></div></section>}
        {data && (
          <>
            <section className="workspace-stats dashboard-stats">
              <div className="stat-card"><span className="stat-icon">▦</span><div><strong>{data.stats.project_count}</strong><small>Projects</small></div></div>
              <div className="stat-card"><span className="stat-icon">◷</span><div><strong>{data.stats.open_count}</strong><small>Open tasks</small></div></div>
              <div className="stat-card"><span className="stat-icon">✓</span><div><strong>{data.stats.completed_this_week}</strong><small>Done this week</small></div></div>
              <div className="stat-card"><span className="stat-icon">!</span><div><strong>{data.stats.overdue_count}</strong><small>Overdue</small></div></div>
            </section>
            <div className="dashboard-grid">
              <section className="settings-card">
                <h2>Workflow mix</h2>
                <div className="chart-list" role="list" aria-label="Task counts by workflow status">
                  {(["backlog", "todo", "in_progress", "in_review", "blocked", "done"] as Status[]).map((status) => {
                    const count = data.by_status.find((row) => row.status === status)?.count ?? 0;
                    return (
                      <div className={`chart-row chart-status-${status}`} key={status} role="listitem">
                        <span>{STATUS_LABEL[status]}</span>
                        <div className="chart-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (count / totalStatus) * 100)}%` }} /></div>
                        <b>{count}</b>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="settings-card">
                <h2>Priority mix</h2>
                <div className="chart-list" role="list" aria-label="Task counts by priority">
                  {["urgent", "high", "medium", "low"].map((priority) => {
                    const count = data.by_priority.find((row) => row.priority === priority)?.count ?? 0;
                    return (
                      <div className={`chart-row chart-priority-${priority}`} key={priority} role="listitem">
                        <span className="priority-badge" style={{ textTransform: "capitalize" }}>{priority}</span>
                        <div className="chart-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, (count / totalPriority) * 100)}%` }} /></div>
                        <b>{count}</b>
                      </div>
                    );
                  })}
                </div>
                <p className="field-help">Remaining estimated effort: {Number(data.stats.remaining_hours || 0).toFixed(1)} hours</p>
              </section>
            </div>
            <section className="settings-card">
              <h2>Recent activity</h2>
              <div className="community-activity-list">
                {data.recent.length === 0 && <p className="mut">No activity in this workspace yet.</p>}
                {data.recent.map((event) => (
                  <article className="community-activity" key={event.id}>
                    <div>
                      <p>
                        <b>{event.actor_name || "Someone"}</b> {actionLabel(event.action)}
                        {event.task_title ? ` · ${event.task_title}` : ""} in <strong>{event.project_name}</strong>
                      </p>
                      <small>{new Date(event.created_at).toLocaleString()}</small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
        {!loading && !error && !data && <section className="dashboard-empty"><span>▦</span><h2>No workspace data yet</h2><p>Create a workspace or join a team to see project analytics here.</p><Link className="button button-primary" href="/workspaces">Manage workspaces <span>↗</span></Link></section>}
      </main>
    </>
  );
}
