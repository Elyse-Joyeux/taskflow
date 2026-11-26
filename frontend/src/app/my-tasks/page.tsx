"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, Circle, ListTodo } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import { WORKFLOW, type Priority, type Status, type Task } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type AssignedTask = Task & { project_name: string };
const statusText: Record<Status, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
};
const filters = ["all", "backlog", "todo", "in_progress", "in_review", "blocked", "done"] as const;
type TaskFilter = (typeof filters)[number];

export default function MyTasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<AssignedTask[]>("/api/my-tasks")
      .then(setTasks)
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function completeTask(task: AssignedTask, event: MouseEvent<HTMLButtonElement>) {
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
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: next } : item));
    try {
      const updated = await api<AssignedTask>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, ...updated } : item));
      toast.success(next === "done" ? "Marked complete" : "Reopened task");
    } catch (reason) {
      setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: previous } : item));
      toast.error((reason as Error).message);
    }
  }

  const visible = tasks.filter((task) => filter === "all" || task.status === filter);
  const priorityVariant = (priority: Priority) => priority === "urgent" ? "destructive" : priority === "high" ? "default" : "secondary";

  return (
    <AppShell>
      <div className="wrap mytasks-wrap" id="main">
        <header className="workspace-intro">
          <div>
            <span className="workspace-overline">YOUR PERSONAL VIEW</span>
            <h1>My tasks</h1>
            <p>Everything assigned to you, in one focused place.</p>
          </div>
          <Link className={buttonVariants({ variant: "outline" })} href="/projects">
            Browse projects <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
          </Link>
        </header>

        <ToggleGroup
          value={[filter]}
          onValueChange={(values) => setFilter((values[values.length - 1] as TaskFilter | undefined) ?? "all")}
          variant="outline"
          size="sm"
          spacing={1}
          className="task-filter-bar"
          aria-label="Filter tasks by status"
        >
          {filters.map((value) => {
            const count = value === "all" ? tasks.length : tasks.filter((task) => task.status === value).length;
            return (
              <ToggleGroupItem key={value} value={value} aria-label={value === "all" ? "All tasks" : statusText[value]}>
                {value === "all" ? "All tasks" : statusText[value]}
                <Badge variant={filter === value ? "default" : "secondary"}>{count}</Badge>
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>

        {error && (
          <Alert variant="destructive" className="my-5">
            <AlertTitle>Could not load your tasks</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="assigned-task-list" role="status" aria-label="Loading your tasks">
            {[1, 2, 3].map((item) => <Card key={item}><CardContent className="flex items-center gap-4 p-4"><Skeleton className="size-5 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-4 w-2/3" /></div><Skeleton className="h-6 w-16" /></CardContent></Card>)}
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="assigned-task-list">
            {visible.map((task) => (
              <Card className="assigned-task-card" key={task.id}>
                <CardContent className="assigned-task">
                  <Button
                    type="button"
                    variant={task.status === "done" ? "secondary" : "outline"}
                    size="icon-sm"
                    className={`status-check status-${task.status}`}
                    aria-label={task.status === "done" ? `Reopen ${task.title}` : `Complete ${task.title}`}
                    onClick={(event) => void completeTask(task, event)}
                  >
                    {task.status === "done" ? <Check aria-hidden="true" /> : <Circle aria-hidden="true" />}
                  </Button>
                  <div className="assigned-task-main">
                    <Link href={`/projects/${task.project_id}?task=${task.id}`} className="assigned-task-link">
                      <span className="assigned-project">{task.project_name}</span>
                      <strong>{task.title}</strong>
                    </Link>
                    {task.description && <p>{task.description}</p>}
                  </div>
                  <Badge variant={priorityVariant((task.priority ?? "medium") as Priority)}>{task.priority ?? "medium"}</Badge>
                  <Badge variant="outline" className="task-status-label">{statusText[task.status]}</Badge>
                  <span className="due-badge">
                    {task.due_date
                      ? `Due ${new Date(`${task.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                      : "No due date"}
                  </span>
                  <Link className="assigned-arrow" href={`/projects/${task.project_id}?task=${task.id}`} aria-label={`Open ${task.title}`}>
                    <ArrowUpRight aria-hidden="true" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {visible.length === 0 && !error && !loading && (
          <Empty className="rounded-2xl border border-dashed bg-card px-6 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ListTodo aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>{filter === "all" ? "Nothing assigned just yet" : "No tasks in this view"}</EmptyTitle>
              <EmptyDescription>When you&apos;re assigned a task in a project, it will show up here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link className={buttonVariants()} href="/projects">Explore your projects</Link>
            </EmptyContent>
          </Empty>
        )}
      </div>
    </AppShell>
  );
}
