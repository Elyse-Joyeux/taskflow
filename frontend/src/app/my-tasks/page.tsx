"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import AnimatedList from "@/components/bits/AnimatedList";
import ClickSpark from "@/components/bits/ClickSpark";
import { toast } from "sonner";
import { api, getToken } from "@/lib/api";
import { WORKFLOW, type Priority, type Status, type Task } from "@/lib/types";

type AssignedTask = Task & { project_name: string };

const statusText: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
};

export default function MyTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<AssignedTask[]>("/api/my-tasks")
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function completeTask(task: AssignedTask, event: MouseEvent) {
    event.stopPropagation();
    const allowed = task.allowed_statuses ?? WORKFLOW[task.status] ?? [];
    const next: Status = task.status === "done" ? "in_review" : "done";
    if (task.status !== "done" && !allowed.includes("done")) {
      toast.error("This task can’t move to Done from its current status.");
      return;
    }
    if (task.status === "done" && !allowed.includes("in_review")) {
      toast.error("Done tasks can only move back to In review.");
      return;
    }
    const previous = task.status;
    setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, status: next } : item)));
    try {
      const updated = await api<AssignedTask>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, ...updated } : item)));
      toast.success(next === "done" ? "Marked complete" : "Reopened task");
    } catch (reason) {
      setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, status: previous } : item)));
      toast.error((reason as Error).message);
    }
  }

  const visible = tasks.filter((t) => filter === "all" || t.status === filter);

  return (
    <AppShell>
      <div className="wrap mytasks-wrap">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">YOUR PERSONAL VIEW</span>
            <h1>My tasks</h1>
            <p>Everything assigned to you, all in one place.</p>
          </div>
          <ClickSpark sparkColor="#7c6df0">
            <Link className="button button-primary" href="/projects">
              Browse projects <span>↗</span>
            </Link>
          </ClickSpark>
        </div>

        <div className="task-filter-bar">
          {(
            [
              "all",
              "backlog",
              "todo",
              "in_progress",
              "in_review",
              "blocked",
              "done",
            ] as const
          ).map((value) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? "All tasks" : statusText[value]}
              <span>
                {value === "all"
                  ? tasks.length
                  : tasks.filter((t) => t.status === value).length}
              </span>
            </button>
          ))}
        </div>

        {error && <p className="auth-error">{error}</p>}
        {loading && <p className="mut" role="status">Loading your tasks…</p>}

        <AnimatedList className="assigned-task-list">
          {visible.map((task) => (
            <article
              className="assigned-task"
              key={task.id}
              onClick={() => router.push(`/projects/${task.project_id}?task=${task.id}`)}
            >
              <button
                type="button"
                className={`status-check status-${task.status}`}
                aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`}
                onClick={(event) => void completeTask(task, event)}
              >
                {task.status === "done" ? "✓" : task.status === "in_progress" ? "↗" : ""}
              </button>
              <div className="assigned-task-main">
                <span className="assigned-project">{task.project_name}</span>
                <b>{task.title}</b>
                {task.description && <p>{task.description}</p>}
              </div>
              <span
                className={`priority-badge priority-${(task.priority ?? "medium") as Priority}`}
              >
                {task.priority ?? "medium"}
              </span>
              <span className="task-status-label">{statusText[task.status]}</span>
              <span className="due-badge">
                {task.due_date
                  ? `Due ${new Date(`${task.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : "No due date"}
              </span>
              <span className="assigned-arrow">→</span>
            </article>
          ))}
        </AnimatedList>

        {visible.length === 0 && !error && !loading && (
          <div className="empty-state">
            <div className="empty-illustration">✓</div>
            <h3>
              {filter === "all"
                ? "Nothing assigned just yet."
                : "No tasks in this view."}
            </h3>
            <p>When you’re assigned a task in a project, it will show up here.</p>
            <Link className="button button-primary" href="/projects">
              Explore your projects
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
