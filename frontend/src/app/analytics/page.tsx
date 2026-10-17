"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken, getWorkspaceId, setWorkspaceId } from "@/lib/api";

type Trend   = { day: string; count: number };
type Workload = { id: string; display_name: string; open_tasks: number };
type Progress = { id: string; name: string; total_tasks: number; done_tasks: number; overdue_tasks: number };
type Adherence = { completed_with_due: number; overdue: number; total_done: number };
type Analytics = {
  completion_trend: Trend[];
  workload: Workload[];
  project_progress: Progress[];
  adherence: Adherence;
  days: number;
};

const DAYS_OPTIONS = [7, 14, 30, 60, 90];

function Bar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <div className="chart-bar" aria-hidden="true" style={{ flex: 1 }}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays]   = useState(30);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    async function load() {
      setLoading(true); setError("");
      try {
        let wid = getWorkspaceId();
        if (!wid) {
          const ws = await api<{ id: string }[]>("/api/workspaces");
          wid = ws[0]?.id ?? null;
          if (wid) setWorkspaceId(wid);
        }
        if (!wid) throw new Error("Join or create a workspace first.");
        setData(await api<Analytics>(`/api/workspaces/${wid}/analytics?days=${days}`));
      } catch (e) { setError((e as Error).message); }
      finally { setLoading(false); }
    }
    void load();
  }, [router, days]);

  const maxTrend   = Math.max(1, ...(data?.completion_trend.map((d) => d.count) ?? [0]));
  const maxWork    = Math.max(1, ...(data?.workload.map((w) => w.open_tasks) ?? [0]));
  const adherPct   = data ? Math.round((data.adherence.completed_with_due / Math.max(1, data.adherence.total_done)) * 100) : 0;

  return (
    <>
      <Header />
      <main className="wrap dashboard-wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">REPORTING</span>
            <h1>Analytics</h1>
            <p>Trends, workload, and delivery metrics — all from real data.</p>
          </div>
          <div className="analytics-controls">
            <label className="board-filter">
              Period
              <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {DAYS_OPTIONS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
              </select>
            </label>
            <a
              className="button button-quiet"
              href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/workspaces/${getWorkspaceId() ?? ""}/export/tasks.csv`}
              download
              onClick={(e) => {
                // attach bearer token via fetch
                e.preventDefault();
                const token = typeof window !== "undefined" ? localStorage.getItem("t") : null;
                const wid   = getWorkspaceId();
                fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/workspaces/${wid}/export/tasks.csv`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                }).then((r) => r.blob()).then((blob) => {
                  const url = URL.createObjectURL(blob);
                  Object.assign(document.createElement("a"), { href: url, download: "taskflow-tasks.csv" }).click();
                  URL.revokeObjectURL(url);
                }).catch(() => setError("Export failed"));
              }}
            >
              ↓ Export CSV
            </a>
          </div>
        </div>

        {error   && <div className="dashboard-error" role="alert"><b>{error}</b></div>}
        {loading && <section className="dashboard-loading" role="status"><span className="dashboard-spinner"/><b>Crunching the numbers…</b></section>}

        {data && (
          <>
            {/* ── Adherence summary ── */}
            <section className="workspace-stats dashboard-stats">
              <div className="stat-card">
                <span className="stat-icon">✓</span>
                <div><strong>{data.adherence.total_done}</strong><small>Tasks completed</small></div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">📅</span>
                <div><strong>{adherPct}%</strong><small>On-time delivery</small></div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">!</span>
                <div><strong>{data.adherence.overdue}</strong><small>Currently overdue</small></div>
              </div>
              <div className="stat-card">
                <span className="stat-icon">◷</span>
                <div><strong>{data.project_progress.reduce((s,p) => s + p.total_tasks, 0)}</strong><small>Total tasks tracked</small></div>
              </div>
            </section>

            <div className="dashboard-grid">
              {/* ── Completion trend ── */}
              <section className="settings-card">
                <h2>Daily completions — last {days} days</h2>
                {data.completion_trend.length === 0 ? (
                  <p className="mut">No completions recorded in this period.</p>
                ) : (
                  <div className="trend-chart">
                    {data.completion_trend.map((d) => (
                      <div key={d.day} className="trend-bar-wrap" title={`${d.day}: ${d.count} completed`}>
                        <div className="trend-bar" style={{ height: `${Math.max(4, (d.count / maxTrend) * 120)}px` }} />
                        <span className="trend-label">{d.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Team workload ── */}
              <section className="settings-card">
                <h2>Team workload</h2>
                {data.workload.length === 0 ? (
                  <p className="mut">No assigned open tasks.</p>
                ) : (
                  <div className="chart-list" role="list">
                    {data.workload.map((w) => (
                      <div className="chart-row" key={w.id} role="listitem">
                        <span style={{ minWidth: 120 }}>{w.display_name}</span>
                        <Bar value={w.open_tasks} max={maxWork} color="var(--accent)" />
                        <b>{w.open_tasks}</b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* ── Project progress ── */}
            <section className="settings-card">
              <h2>Project progress</h2>
              {data.project_progress.length === 0 ? (
                <p className="mut">No projects found.</p>
              ) : (
                <div className="project-progress-list">
                  {data.project_progress.map((p) => {
                    const pct = p.total_tasks > 0 ? Math.round((p.done_tasks / p.total_tasks) * 100) : 0;
                    return (
                      <div key={p.id} className="project-progress-row">
                        <div className="project-progress-meta">
                          <b>{p.name}</b>
                          <div className="project-progress-counts">
                            <span>{p.done_tasks}/{p.total_tasks} done</span>
                            {p.overdue_tasks > 0 && <span className="overdue-chip">{p.overdue_tasks} overdue</span>}
                          </div>
                        </div>
                        <div className="project-progress-bar-wrap">
                          <div className="project-progress-bar">
                            <div style={{ width: `${pct}%` }} />
                          </div>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
