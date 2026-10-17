"use client";
import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import TaskModal from "@/components/TaskModal";
import { api, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import type { Status, Task, User } from "@/lib/types";

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

export default function Board() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<{ name: string } | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
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
  const [err, setErr] = useState("");

  const upsert = (t: Task) =>
    setTasks((l) =>
      l.some((x) => x.id === t.id)
        ? l.map((x) => (x.id === t.id ? t : x))
        : [...l, t],
    );
  const remove = (tid: string) =>
    setTasks((l) => l.filter((x) => x.id !== tid));

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
    api<ProjectResponse>(`/api/projects/${id}`)
      .then((d) => {
        setProject(d.project);
        setMembers(d.members);
        setTasks(d.tasks);
        const taskParam = new URLSearchParams(window.location.search).get("task");
        if (taskParam && d.tasks.some((task) => task.id === taskParam)) setOpenId(taskParam);
      })
      .catch((e) => setErr(e.message));
    const s = getSocket();
    const watch = () => s.emit("watch", id);
    const del = ({ id: tid }: { id: string }) => remove(tid);
    const mem = (u: User) =>
      setMembers((l) => (l.some((x) => x.id === u.id) ? l : [...l, u]));
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

  async function add(status: Status) {
    const title = (drafts[status] ?? "").trim();
    if (!title) return;
    setDrafts((d) => ({ ...d, [status]: "" }));
    try {
      upsert(
        await api<Task>(`/api/projects/${id}/tasks`, {
          method: "POST",
          body: JSON.stringify({ title, status }),
        }),
      );
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function deleteTask(task: Task) {
    if (
      !confirm(
        `Delete “${task.title}”? This also deletes its checklist and comments.`,
      )
    )
      return;
    setTaskMenuId(null);
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      remove(task.id);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function drop(status: Status, e: DragEvent<HTMLDivElement>) {
    const tid = e.dataTransfer.getData("text/plain"),
      t = tasks.find((x) => x.id === tid);
    if (!t || t.status === status) return;
    upsert({ ...t, status }); // optimistic
    try {
      upsert(
        await api<Task>(`/api/tasks/${tid}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      );
    } catch (error) {
      upsert(t);
      setErr((error as Error).message);
    }
  }
  async function patchStatus(task: Task, status: Status) {
    try {
      upsert(
        await api<Task>(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      );
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  async function invite() {
    if (!email.trim()) {
      setErr("Enter their email address so we can send the invitation.");
      return;
    }
    setInviteBusy(true);
    try {
      const invite = await api<{ invite_url: string }>(
        `/api/projects/${id}/invites`,
        {
          method: "POST",
          body: JSON.stringify({ email }),
        },
      );
      setInviteUrl(`${window.location.origin}${invite.invite_url}`);
      setInviteCopied(false);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setInviteBusy(false);
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
    } catch {
      setErr("Clipboard is unavailable. Select and copy the link.");
    }
  }
  async function inviteByEmail() {
    await invite();
  }
  function closeInvite() {
    setInviteOpen(false);
    setInviteUrl("");
    setEmail("");
    setInviteCopied(false);
    setTimeout(() => setErr(""), 0);
  }
  function inviteStatus() {
    if (!inviteUrl) return null;
    return (
      <div className="invite-link-result">
        <span className="invite-success">✓ Invitation sent</span>
        <p>
          A secure invite link was emailed to <b>{email || "your teammate"}</b>.
          The link expires in 7 days. You can also copy it to share directly.
        </p>
        <div className="invite-copy-row">
          <input readOnly value={inviteUrl} aria-label="Invite link" />
          <button type="button" onClick={copyInvite}>
            {inviteCopied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </div>
    );
  }

  const open = tasks.find((t) => t.id === openId);
  const filteredTasks = tasks.filter((task) => {
    const term = query.trim().toLowerCase();
    const matchesSearch =
      !term ||
      `${task.title} ${task.description} ${(task.tags ?? []).join(" ")}`
        .toLowerCase()
        .includes(term);
    return (
      matchesSearch &&
      (priorityFilter === "all" || task.priority === priorityFilter) &&
      (assigneeFilter === "all" ||
        (assigneeFilter === "unassigned"
          ? !task.assignee_id
          : task.assignee_id === assigneeFilter))
    );
  });
  if (!project)
    return (
      <>
        <Header />
        <div className="wrap" id="main">
          {err ? <p className="err">{err}</p> : "Loading…"}
        </div>
      </>
    );

  return (
    <>
      <Header />
      <div className="wrap" id="main" style={{ maxWidth: 1300 }}>
        <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          <div>
            <span className="workspace-overline">PROJECT BOARD</span>
            <h1
              style={{
                margin: "5px 0 0",
                font: "800 25px Manrope",
                letterSpacing: "-1px",
              }}
            >
              {project.name}
            </h1>
          </div>
          <span className="sp" />
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
          <div className="board-header-links">
            <a className="board-header-link" href={`/projects/${id}/milestones`}>◈ Milestones</a>
            <a className="board-header-link" href={`/projects/${id}/activity`}>✦ Activity</a>
            <a className="board-header-link" href={`/projects/${id}/recurring`}>↻ Recurring</a>
          </div>
          <button
            className="invite-trigger"
            onClick={() => {
              setErr("");
              setInviteOpen(true);
            }}
          >
            <span>＋</span> Invite people
          </button>
        </div>
        <div className="err">{err}</div>
        <div className="board-toolbar">
          <label className="board-search">
            <span>⌕</span>
            <input
              placeholder="Search tasks, descriptions, tags…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="board-filter">
            Priority
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="board-filter">
            Assignee
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
            >
              <option value="all">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </select>
          </label>
          <span className="board-result-count">
            {filteredTasks.length}{" "}
            {filteredTasks.length === 1 ? "task" : "tasks"}
          </span>
        </div>
        <div
          className="cols board-columns"
          onClickCapture={(event) => {
            if (!(event.target as HTMLElement).closest(".task-card-actions"))
              setTaskMenuId(null);
          }}
        >
          {COLS.map((c) => (
            <div
              key={c.key}
              className="col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => drop(c.key, e)}
            >
              <h3>
                {c.label} (
                {filteredTasks.filter((t) => t.status === c.key).length})
              </h3>
              {tasks
                .filter((t) => t.status === c.key)
                .filter((t) => filteredTasks.some((match) => match.id === t.id))
                .map((t) => (
                  <div
                    key={t.id}
                    className="card"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", t.id)
                    }
                    onClick={() => setOpenId(t.id)}
                  >
                    <div
                      className="task-card-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="task-options-trigger"
                        aria-label={`Options for ${t.title}`}
                        aria-haspopup="menu"
                        aria-expanded={taskMenuId === t.id}
                        onClick={() =>
                          setTaskMenuId(taskMenuId === t.id ? null : t.id)
                        }
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <circle cx="4" cy="10" r="1.55" />
                          <circle cx="10" cy="10" r="1.55" />
                          <circle cx="16" cy="10" r="1.55" />
                        </svg>
                      </button>
                      {taskMenuId === t.id && (
                        <div className="task-actions-menu" role="menu">
                          <button
                            role="menuitem"
                            onClick={() => {
                              setOpenId(t.id);
                              setTaskMenuId(null);
                            }}
                          >
                            <span>✎</span> Edit task
                          </button>
                          <button
                            role="menuitem"
                            onClick={() => {
                              setTaskMenuId(null);
                              patchStatus(t, "done");
                            }}
                          >
                            <span>✓</span> Mark complete
                          </button>
                          <div className="task-menu-divider" />
                          <button
                            className="task-menu-danger"
                            role="menuitem"
                            onClick={() => deleteTask(t)}
                          >
                            <span>⌫</span> Delete task
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="task-card-title">{t.title}</div>
                    {t.description && (
                      <p className="task-card-description">{t.description}</p>
                    )}
                    <div className="task-card-badges">
                      <span
                        className={`priority-badge priority-${t.priority ?? "medium"}`}
                      >
                        {t.priority ?? "medium"}
                      </span>
                      {t.due_date && (
                        <span className="due-badge">
                          ◷{" "}
                          {new Date(
                            `${t.due_date.slice(0, 10)}T00:00:00`,
                          ).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    {!!t.tags?.length && (
                      <div className="task-card-tags">
                        {t.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {t.estimated_hours != null && (
                      <span className="task-estimate">
                        ◷ {t.estimated_hours}h estimate
                      </span>
                    )}
                    {t.assignee_name && (
                      <div>
                        <span className="tag">{t.assignee_name}</span>
                      </div>
                    )}
                  </div>
                ))}
              {(["backlog", "todo"] as Status[]).includes(c.key) && (
                <div className="row">
                  <input
                    aria-label={`Add a task to ${c.label}`}
                    placeholder="+ Add task"
                    value={drafts[c.key] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [c.key]: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && add(c.key)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {open && (
        <TaskModal
          task={open}
          members={members}
          onClose={() => setOpenId(null)}
          onUpdate={upsert}
          onDelete={remove}
        />
      )}
      {inviteOpen && (
        <div className="ov" onClick={closeInvite}>
          <section
            className="modal invite-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Invite people to project"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="invite-modal-head">
              <div>
                <span className="workspace-overline">GROW YOUR TEAM</span>
                <h2>Invite people</h2>
                <p>
                  Bring your teammates into <b>{project.name}</b>.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={closeInvite}
                aria-label="Close invite dialog"
              >
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
              We’ll email a secure invite link, even if they haven’t joined
              Taskflow yet. The link expires in 7 days.
            </p>
            {inviteStatus()}
            {err && (
              <p className="auth-error" role="alert">
                {err}
              </p>
            )}
            <div className="invite-modal-actions">
              <button className="button button-quiet" onClick={closeInvite}>
                Cancel
              </button>
              <button
                className="button button-primary"
                onClick={inviteByEmail}
                disabled={inviteBusy}
              >
                {inviteBusy
                  ? "Sending invitation…"
                  : inviteUrl
                    ? "Send another invite"
                    : "Send invitation by email"}
                <span>↗</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
