"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Plus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import AppShell from "@/components/AppShell";
import TaskModal from "@/components/TaskModal";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { STATUS_LABEL, WORKFLOW, type Priority, type Status, type Task, type User } from "@/lib/types";

const COLS: { key: Status; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "in_review", label: "In review" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
];

type ProjectResponse = {
  project: { id: string; name: string; description?: string; my_role?: string };
  members: User[];
  tasks: Task[];
};

// ── Droppable Column Component ─────────────────────────────────
function DroppableColumn({
  col,
  count,
  children,
}: {
  col: { key: Status; label: string };
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: col.key,
    data: { type: "column", status: col.key },
  });

  return (
    <div ref={setNodeRef} className={`col ${isOver ? "col-drag-over" : ""}`}>
      <h3>
        {col.label} ({count})
      </h3>
      {children}
    </div>
  );
}

// ── Sortable Task Card Component ──────────────────────────────
function SortableTaskCard({
  task,
  onOpen,
  onDelete,
  onMarkComplete,
  isMenuOpen,
  onToggleMenu,
}: {
  task: Task;
  onOpen: () => void;
  onDelete: () => void;
  onMarkComplete: () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      className={`card ${isDragging ? "is-dragging" : ""}`}
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <div className="task-card-actions" onClick={(e) => e.stopPropagation()}>
        <button
          className="task-options-trigger"
          aria-label={`Options for ${task.title}`}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={onToggleMenu}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="4" cy="10" r="1.55" />
            <circle cx="10" cy="10" r="1.55" />
            <circle cx="16" cy="10" r="1.55" />
          </svg>
        </button>
        {isMenuOpen && (
          <div className="task-actions-menu" role="menu">
            <button
              role="menuitem"
              onClick={() => {
                onOpen();
              }}
            >
              <span>✎</span> Edit task
            </button>
            <button
              role="menuitem"
              onClick={() => {
                onMarkComplete();
              }}
            >
              <span>✓</span> Mark complete
            </button>
            <div className="task-menu-divider" />
            <button className="task-menu-danger" role="menuitem" onClick={onDelete}>
              <span>⌫</span> Delete task
            </button>
          </div>
        )}
      </div>

      <div className="task-card-title">{task.title}</div>
      {task.description && <p className="task-card-description">{task.description}</p>}
      <div className="task-card-badges">
        <span className={`priority-badge priority-${task.priority ?? "medium"}`}>
          {task.priority ?? "medium"}
        </span>
        {task.due_date && (
          <span className="due-badge">
            ◷{" "}
            {new Date(`${task.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
      {!!task.tags?.length && (
        <div className="task-card-tags">
          {task.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
      {task.estimated_hours != null && (
        <span className="task-estimate">◷ {task.estimated_hours}h estimate</span>
      )}
      {task.assignee_name && (
        <div>
          <span className="tag">{task.assignee_name}</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Main Board Page Component ──────────────────────────────────
export default function Board() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const viewMode = searchParams.get("view") === "list" ? "list" : "board";

  const [project, setProject] = useState<{ name: string } | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [taskMenuId, setTaskMenuId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"manual" | "due" | "priority" | "title">("manual");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const upsert = (t: Task) =>
    setTasks((l) => (l.some((x) => x.id === t.id) ? l.map((x) => (x.id === t.id ? t : x)) : [...l, t]));

  const remove = (tid: string) => setTasks((l) => l.filter((x) => x.id !== tid));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || tag === "select" || (document.activeElement as HTMLElement)?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('.col input[aria-label="Add a task to To do"], .col input')?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!taskMenuId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaskMenuId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [taskMenuId]);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setLoading(true);
    api<ProjectResponse>(`/api/projects/${id}`)
      .then((d) => {
        setProject(d.project);
        setMembers(d.members);
        setTasks(d.tasks);
        const taskParam = new URLSearchParams(window.location.search).get("task");
        if (taskParam && d.tasks.some((task) => task.id === taskParam)) {
          setOpenId(taskParam);
        }
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));

    const s = getSocket();
    const watch = () => s.emit("watch", id);
    const del = ({ id: tid }: { id: string }) => remove(tid);
    const mem = (u: User) => setMembers((l) => (l.some((x) => x.id === u.id) ? l : [...l, u]));

    watch();
    s.on("connect", watch);
    s.on("task:created", upsert);
    s.on("task:updated", upsert);
    s.on("task:deleted", del);
    s.on("member:added", mem);

    return () => {
      s.emit("unwatch", id);
      s.off("connect", watch);
      s.off("task:created", upsert);
      s.off("task:updated", upsert);
      s.off("task:deleted", del);
      s.off("member:added", mem);
    };
  }, [id, router]);

  function switchView(mode: "board" | "list") {
    startTransition(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      if (mode === "list") {
        nextParams.set("view", "list");
      } else {
        nextParams.delete("view");
      }
      const queryStr = nextParams.toString();
      router.replace(`/projects/${id}${queryStr ? `?${queryStr}` : ""}`, { scroll: false });
    });
  }

  async function add(status: Status) {
    const title = (drafts[status] ?? "").trim();
    if (!title) return;
    setDrafts((d) => ({ ...d, [status]: "" }));
    try {
      const newTask = await api<Task>(`/api/projects/${id}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title, status }),
      });
      upsert(newTask);
      toast.success("Task created");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function deleteTask(task: Task) {
    setTaskMenuId(null);
    const deletedSnapshot = { ...task };
    remove(task.id);

    toast("Task deleted", {
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            const initialStatus =
              deletedSnapshot.status === "backlog" || deletedSnapshot.status === "todo"
                ? deletedSnapshot.status
                : "todo";

            const recreated = await api<Task>(`/api/projects/${id}/tasks`, {
              method: "POST",
              body: JSON.stringify({
                title: deletedSnapshot.title,
                description: deletedSnapshot.description ?? "",
                status: initialStatus,
                priority: deletedSnapshot.priority ?? "medium",
                due_date: deletedSnapshot.due_date ? deletedSnapshot.due_date.slice(0, 10) : null,
                tags: deletedSnapshot.tags ?? [],
              }),
            });

            let finalTask = recreated;
            if (deletedSnapshot.status !== initialStatus) {
              finalTask = await api<Task>(`/api/tasks/${recreated.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: deletedSnapshot.status }),
              });
            }
            upsert(finalTask);
            toast.success("Task restored");
          } catch (e) {
            toast.error("Could not restore task: " + (e as Error).message);
          }
        },
      },
    });

    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    } catch (e) {
      upsert(deletedSnapshot);
      toast.error((e as Error).message);
    }
  }

  async function patchStatus(task: Task, status: Status) {
    const previousStatus = task.status;
    upsert({ ...task, status });
    try {
      const updated = await api<Task>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      upsert(updated);
      toast.success(`Status updated to ${STATUS_LABEL[status]}`);
    } catch (e) {
      upsert({ ...task, status: previousStatus });
      toast.error((e as Error).message);
    }
  }

  // ── Drag & Drop Handlers ──────────────────────────────────────
  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
    if (!over) return;

    const activeId = String(active.id);
    const task = tasks.find((t) => t.id === activeId);
    if (!task) return;

    let targetStatus: Status | null = null;
    const overId = String(over.id);

    if (COLS.some((c) => c.key === overId)) {
      targetStatus = overId as Status;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetStatus = overTask.status;
      }
    }

    if (!targetStatus || targetStatus === task.status) return;

    const oldStatus = task.status;
    const newStatus = targetStatus;

    // Optimistic update
    upsert({ ...task, status: newStatus });

    const statusLabel = COLS.find((c) => c.key === newStatus)?.label || newStatus;
    toast.success(`Moved to ${statusLabel}`, {
      action: {
        label: "Undo",
        onClick: async () => {
          try {
            upsert({ ...task, status: oldStatus });
            await api<Task>(`/api/tasks/${task.id}`, {
              method: "PATCH",
              body: JSON.stringify({ status: oldStatus }),
            });
            toast.info(`Moved back to ${STATUS_LABEL[oldStatus]}`);
          } catch (e) {
            upsert({ ...task, status: newStatus });
            toast.error("Could not undo move: " + (e as Error).message);
          }
        },
      },
    });

    try {
      const updated = await api<Task>(`/api/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      upsert(updated);
    } catch (e) {
      upsert({ ...task, status: oldStatus });
      toast.error("Failed to move task: " + (e as Error).message);
    }
  };

  // ── Invites ──────────────────────────────────────────────────
  async function invite() {
    if (!email.trim()) {
      toast.error("Enter their email address so we can send the invitation.");
      return;
    }
    setInviteBusy(true);
    try {
      const res = await api<{ invite_url: string }>(`/api/projects/${id}/invites`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInviteUrl(`${window.location.origin}${res.invite_url}`);
      setInviteCopied(false);
      toast.success("Invitation sent");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      toast.success("Invite link copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable. Copy manually.");
    }
  }

  function closeInvite() {
    setInviteOpen(false);
    setInviteUrl("");
    setEmail("");
    setInviteCopied(false);
  }

  const openTask = tasks.find((t) => t.id === openId);
  const activeTask = tasks.find((t) => t.id === activeTaskId);

  const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const filteredTasks = tasks
    .filter((task) => {
      const term = query.trim().toLowerCase();
      const matchesSearch =
        !term ||
        `${task.title} ${task.description} ${(task.tags ?? []).join(" ")}`.toLowerCase().includes(term);
      return (
        matchesSearch &&
        (priorityFilter === "all" || task.priority === priorityFilter) &&
        (assigneeFilter === "all" ||
          (assigneeFilter === "unassigned" ? !task.assignee_id : task.assignee_id === assigneeFilter))
      );
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "priority") {
        return (priorityRank[a.priority ?? "medium"] ?? 9) - (priorityRank[b.priority ?? "medium"] ?? 9);
      }
      if (sortKey === "due") {
        const ad = a.due_date ?? "9999-12-31";
        const bd = b.due_date ?? "9999-12-31";
        return ad.localeCompare(bd);
      }
      return 0;
    });

  return (
    <AppShell>
      <div className="wrap board-wrap" id="main">
        {/* Top Header Row */}
        <div className="board-page-head">
          <div>
            <span className="workspace-overline">PROJECT</span>
            <h1 className="board-page-title">
              {project ? project.name : "Loading project…"}
            </h1>
          </div>
          <span className="sp" />

          {/* Members Stack */}
          <div className="board-member-summary">
            <span className="avatar-stack">
              {members.slice(0, 4).map((member, i) => (
                <i
                  key={member.id}
                  title={`${member.display_name} · ${member.role ?? "member"}`}
                  className={`member-color-${i}`}
                >
                  {member.display_name.slice(0, 1).toUpperCase()}
                </i>
              ))}
            </span>
            <span>
              {members.length} {members.length === 1 ? "member" : "members"}
            </span>
          </div>

          {/* Subpage Links */}
          <div className="board-header-links">
            <Link className="board-header-link" href={`/projects/${id}/milestones`}>
              Milestones
            </Link>
            <Link className="board-header-link" href={`/projects/${id}/activity`}>
              Activity
            </Link>
            <Link className="board-header-link" href={`/projects/${id}/recurring`}>
              Recurring
            </Link>
          </div>

          {/* View Toggle (Board | List) */}
          <ToggleGroup
            value={[viewMode]}
            onValueChange={(values) => values.length > 0 && switchView(values[values.length - 1] as "board" | "list")}
            variant="outline"
            size="sm"
            aria-label="Project view"
            className="view-toggle"
          >
            <ToggleGroupItem value="board">Board</ToggleGroupItem>
            <ToggleGroupItem value="list">List</ToggleGroupItem>
          </ToggleGroup>

          <Button variant="outline" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" data-icon="inline-start" /> Invite people
          </Button>
        </div>

        {/* Toolbar: Search, Filters, Count */}
        <div className="board-toolbar">
          <label className="board-search">
            <span className="sr-only">Search tasks</span>
            <Input
              aria-label="Search tasks, descriptions, and tags"
              placeholder="Search tasks, descriptions, tags…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="board-filter">
            <span>Priority</span>
            <Select value={priorityFilter} onValueChange={(value) => value && setPriorityFilter(value)}>
              <SelectTrigger aria-label="Filter by priority"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </label>
          <label className="board-filter">
            <span>Assignee</span>
            <Select value={assigneeFilter} onValueChange={(value) => value && setAssigneeFilter(value)}>
              <SelectTrigger aria-label="Filter by assignee"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="all">Anyone</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {members.map((member) => <SelectItem key={member.id} value={member.id}>{member.display_name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </label>
          <label className="board-filter">
            <span>Sort</span>
            <Select value={sortKey} onValueChange={(value) => value && setSortKey(value as typeof sortKey)}>
              <SelectTrigger aria-label="Sort tasks"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                <SelectItem value="manual">Board order</SelectItem>
                <SelectItem value="due">Due date</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectGroup></SelectContent>
            </Select>
          </label>
          <span className="board-result-count">
            {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>

        {!loading && tasks.length > 0 && filteredTasks.length === 0 && (
          <section className="empty-state">
            <div className="empty-illustration">✓</div>
            <h3>No tasks match these filters.</h3>
            <p>Clear search or filters to see the rest of the board.</p>
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                setPriorityFilter("all");
                setAssigneeFilter("all");
              }}
            >
              Clear filters
            </Button>
          </section>
        )}

        {/* Loading Skeletons */}
        {loading && (
          <div className="cols board-columns">
            {COLS.map((c) => (
              <div key={c.key} className="board-skeleton-col">
                <div className="skeleton-shimmer" style={{ height: 16, width: 80, marginBottom: 8 }} />
                <div className="skeleton-shimmer skeleton-card" />
                <div className="skeleton-shimmer skeleton-card" />
              </div>
            ))}
          </div>
        )}

        {/* Content View: Board or List */}
        {!loading && viewMode === "board" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="cols board-columns"
              onClickCapture={(event) => {
                if (!(event.target as HTMLElement).closest(".task-card-actions")) {
                  setTaskMenuId(null);
                }
              }}
            >
              {COLS.map((c) => {
                const colTasks = tasks
                  .filter((t) => t.status === c.key)
                  .filter((t) => filteredTasks.some((match) => match.id === t.id));

                return (
                  <DroppableColumn key={c.key} col={c} count={colTasks.length}>
                    <SortableContext items={colTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {colTasks.map((t) => (
                        <SortableTaskCard
                          key={t.id}
                          task={t}
                          onOpen={() => setOpenId(t.id)}
                          onDelete={() => deleteTask(t)}
                          onMarkComplete={() => patchStatus(t, "done")}
                          isMenuOpen={taskMenuId === t.id}
                          onToggleMenu={() => setTaskMenuId(taskMenuId === t.id ? null : t.id)}
                        />
                      ))}
                    </SortableContext>

                    {(["backlog", "todo"] as Status[]).includes(c.key) && (
                      <div className="row" style={{ marginTop: 4 }}>
                        <input
                          aria-label={`Add a task to ${c.label}`}
                          placeholder="+ Add task"
                          value={drafts[c.key] ?? ""}
                          onChange={(e) => setDrafts((d) => ({ ...d, [c.key]: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && add(c.key)}
                        />
                      </div>
                    )}
                  </DroppableColumn>
                );
              })}
            </div>

            {/* Drag Overlay Ghost Card */}
            <DragOverlay>
              {activeTask ? (
                <div className="drag-overlay-card">
                  <div className="task-card-title">{activeTask.title}</div>
                  {activeTask.description && (
                    <p className="task-card-description">{activeTask.description}</p>
                  )}
                  <div className="task-card-badges">
                    <span className={`priority-badge priority-${activeTask.priority ?? "medium"}`}>
                      {activeTask.priority ?? "medium"}
                    </span>
                    {activeTask.due_date && (
                      <span className="due-badge">
                        ◷{" "}
                        {new Date(`${activeTask.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {/* List View */}
        {!loading && viewMode === "list" && (
          <div className="task-list-view">
            <table className="task-table">
              <thead>
                <tr>
                  <th>TASK</th>
                  <th style={{ width: 140 }}>STATUS</th>
                  <th style={{ width: 110 }}>PRIORITY</th>
                  <th style={{ width: 150 }}>ASSIGNEE</th>
                  <th style={{ width: 120 }}>DUE DATE</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)" }}>
                      No tasks found matching your filter criteria.
                    </td>
                  </tr>
                )}
                {filteredTasks.map((t) => {
                  const allowed = t.allowed_statuses || WORKFLOW[t.status] || [];
                  const options = Array.from(new Set([t.status, ...allowed]));

                  return (
                    <tr
                      key={t.id}
                      className="task-row"
                      onClick={() => setOpenId(t.id)}
                    >
                      <td>
                        <b style={{ color: "var(--ink)", display: "block" }}>{t.title}</b>
                        {t.description && (
                          <small style={{ color: "var(--muted)", display: "block", marginTop: 2 }}>
                            {t.description.length > 80 ? `${t.description.slice(0, 80)}…` : t.description}
                          </small>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select
                          className="task-table-status-select"
                          value={t.status}
                          onChange={(e) => patchStatus(t, e.target.value as Status)}
                        >
                          {options.map((st) => (
                            <option key={st} value={st}>
                              {STATUS_LABEL[st as Status] || st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`priority-badge priority-${t.priority ?? "medium"}`}>
                          {t.priority ?? "medium"}
                        </span>
                      </td>
                      <td>
                        {t.assignee_name ? (
                          <span className="tag" style={{ margin: 0 }}>
                            {t.assignee_name}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        {t.due_date ? (
                          <span className="due-badge">
                            {new Date(`${t.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Task Modal with Framer Motion */}
      <AnimatePresence>
        {openTask && (
          <TaskModal
            task={openTask}
            members={members}
            onClose={() => setOpenId(null)}
            onUpdate={upsert}
            onDelete={remove}
          />
        )}
      </AnimatePresence>

      {/* Invite Modal with Framer Motion */}
      <AnimatePresence>
        {inviteOpen && (
          <motion.div
            className="ov"
            onClick={closeInvite}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              className="modal invite-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Invite people to project"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.16 }}
            >
              <div className="invite-modal-head">
                <div>
                  <span className="workspace-overline">GROW YOUR TEAM</span>
                  <h2>Invite people</h2>
                  <p>
                    Bring your teammates into <b>{project?.name || "this project"}</b>.
                  </p>
                </div>
                <button className="icon-button" onClick={closeInvite} aria-label="Close invite dialog">
                  ×
                </button>
              </div>
              <label className="field-label">
                Email address
                <input
                  required
                  type="email"
                  placeholder="teammate@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <p className="invite-help">
                We’ll email a secure invite link. The link expires in 7 days.
              </p>
              {inviteUrl && (
                <div className="invite-link-result">
                  <span className="invite-success">✓ Invitation sent</span>
                  <p>
                    A secure invite link was emailed to <b>{email || "your teammate"}</b>.
                  </p>
                  <div className="invite-copy-row">
                    <input readOnly value={inviteUrl} aria-label="Invite link" />
                    <button type="button" onClick={copyInvite}>
                      {inviteCopied ? "Copied!" : "Copy link"}
                    </button>
                  </div>
                </div>
              )}
              <div className="invite-modal-actions">
                <button className="button button-quiet" onClick={closeInvite}>
                  Cancel
                </button>
                <button className="button button-primary" onClick={invite} disabled={inviteBusy}>
                  {inviteBusy
                    ? "Sending…"
                    : inviteUrl
                      ? "Send another invite"
                      : "Send invitation by email"}
                  <span>↗</span>
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
