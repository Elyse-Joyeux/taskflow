"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, ArrowUpRight, FolderKanban } from "lucide-react";
import AppShell from "@/components/AppShell";
import { api, getToken, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import { STATUS_LABEL, type Status } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import CountUp from "@/components/bits/CountUp";

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
const statuses: Status[] = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
const priorities = ["urgent", "high", "medium", "low"];

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadDashboard = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    void loadDashboard();
    const onWorkspaceChanged = () => void loadDashboard();
    window.addEventListener("workspace-changed", onWorkspaceChanged);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChanged);
  }, [router, loadDashboard, refreshKey]);

  const totalStatus = data?.by_status.reduce((sum, row) => sum + row.count, 0) || 1;
  const totalPriority = data?.by_priority.reduce((sum, row) => sum + row.count, 0) || 1;

  return (
    <AppShell>
      <div className="wrap dashboard-wrap" id="main">
        <header className="workspace-intro">
          <div>
            <span className="workspace-overline">WORKSPACE OVERVIEW</span>
            <h1>Your work, at a glance</h1>
            <p>A live pulse on project progress and the work ahead.</p>
          </div>
          <Link className={buttonVariants({ variant: "outline" })} href="/projects">
            Open projects <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </header>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Dashboard data could not be loaded</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => setRefreshKey((key) => key + 1)}>Try again</Button>
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading workspace analytics">
            {[1, 2, 3, 4].map((item) => (
              <Card key={item}><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-9 w-16" /></CardContent></Card>
            ))}
          </section>
        )}

        {data && (
          <>
            <section className="workspace-stats dashboard-stats" aria-label="Workspace metrics">
              {[
                { label: "Total tasks", value: data.stats.task_count },
                { label: "In progress", value: data.stats.open_count },
                { label: "Completed", value: data.stats.done_count },
                { label: "Overdue", value: data.stats.overdue_count },
              ].map(({ label, value }) => (
                <Card className="stat-card dashboard-stat-card" key={label}>
                  <CardContent className="dashboard-stat-content">
                    <small>{label}</small>
                    <strong><CountUp to={value} /></strong>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="dashboard-focus-card">
              <CardContent>
                <div>
                  <strong>A little focus goes a long way.</strong>
                  <p>Keep your priorities clear and make steady progress with your team.</p>
                </div>
                <Link className={buttonVariants({ variant: "outline", size: "sm" })} href="/my-tasks">
                  View my tasks <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
                </Link>
              </CardContent>
            </Card>

            <div className="dashboard-grid">
              <Card>
                <CardHeader>
                  <CardTitle>Workflow mix</CardTitle>
                  <CardDescription>Tasks across every project status.</CardDescription>
                </CardHeader>
                <CardContent className="chart-list">
                  {statuses.map((status) => {
                    const count = data.by_status.find((row) => row.status === status)?.count ?? 0;
                    return (
                      <div className="dashboard-metric-row" key={status}>
                        <span>{STATUS_LABEL[status]}</span>
                        <Progress value={(count / totalStatus) * 100} aria-label={`${STATUS_LABEL[status]}: ${count} tasks`} />
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Priority mix</CardTitle>
                  <CardDescription>See what needs attention first.</CardDescription>
                </CardHeader>
                <CardContent className="chart-list">
                  {priorities.map((priority) => {
                    const count = data.by_priority.find((row) => row.priority === priority)?.count ?? 0;
                    return (
                      <div className="dashboard-metric-row" key={priority}>
                        <Badge variant={priority === "urgent" ? "destructive" : "secondary"}>{priority}</Badge>
                        <Progress value={(count / totalPriority) * 100} aria-label={`${priority}: ${count} tasks`} />
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                  <p className="field-help mt-3 border-t border-border pt-3">Remaining estimated effort: {Number(data.stats.remaining_hours || 0).toFixed(1)} hours</p>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-5">
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>The latest changes from your team.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.recent.length === 0 ? (
                  <Empty className="py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><Activity aria-hidden="true" /></EmptyMedia>
                      <EmptyTitle>No activity yet</EmptyTitle>
                      <EmptyDescription>When your team updates tasks and projects, you&apos;ll see it here.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="community-activity-list">
                    {data.recent.map((event) => (
                      <article className="community-activity" key={event.id}>
                        <div>
                          <p><b>{event.actor_name || "Someone"}</b> {actionLabel(event.action)}{event.task_title ? ` · ${event.task_title}` : ""} in <Link className="font-medium text-foreground hover:text-primary" href={`/projects/${event.project_id}`}>{event.project_name}</Link></p>
                          <small>{new Date(event.created_at).toLocaleString()}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!loading && !error && !data && (
          <Empty className="rounded-2xl border border-dashed bg-card px-6 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FolderKanban aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>No workspace data yet</EmptyTitle>
              <EmptyDescription>Create a workspace or join a team to see project analytics here.</EmptyDescription>
            </EmptyHeader>
            <Link className={buttonVariants()} href="/workspaces">Manage workspaces</Link>
          </Empty>
        )}
      </div>
    </AppShell>
  );
}
