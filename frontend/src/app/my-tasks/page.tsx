"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import type { Priority, Status, Task } from "@/lib/types";
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
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<AssignedTask[]>("/api/my-tasks")
      .then(setTasks)
      .catch((e) => setError(e.message));
  }, [router]);
  const visible = tasks.filter((t) => filter === "all" || t.status === filter);
  return (
    <>
      <Header />
      <main className="wrap mytasks-wrap">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">YOUR PERSONAL VIEW</span>
            <h1>My tasks</h1>
            <p>Everything assigned to you, all in one place.</p>
          </div>
          <Link className="button button-primary" href="/projects">
            Browse projects <span>↗</span>
          </Link>
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
        <div className="assigned-task-list">
          {visible.map((task) => (
            <article
              className="assigned-task"
              key={task.id}
              onClick={() => router.push(`/projects/${task.project_id}`)}
            >
              <span className={`status-check status-${task.status}`}>
                {task.status === "done"
                  ? "✓"
                  : task.status === "in_progress"
                    ? "↗"
                    : ""}
              </span>
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
              <span className="task-status-label">
                {statusText[task.status]}
              </span>
              <span className="due-badge">
                {task.due_date
                  ? `Due ${new Date(`${task.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}:`
                  : "No due date"}
              </span>
              <span className="assigned-arrow">→</span>
            </article>
          ))}
          {visible.length === 0 && !error && (
            <div className="empty-state">
              <div className="empty-illustration">✓</div>
              <h3>
                {filter === "all"
                  ? "Nothing assigned just yet."
                  : "No tasks in this view."}
              </h3>
              <p>
                When you’re assigned a task in a project, it will show up here.
              </p>
              <Link className="button button-primary" href="/projects">
                Explore your projects
              </Link>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
