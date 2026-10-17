"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, getName, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import { closeSocket, getSocket } from "@/lib/socket";
import type { Notif, Workspace } from "@/lib/types";

function notificationKind(message: string) {
  const text = message.toLowerCase();
  if (text.includes("comment")) return "comment";
  if (text.includes("assign")) return "assignment";
  if (text.includes("added you")) return "invite";
  return "update";
}

function NotificationIcon({ kind }: { kind: string }) {
  if (kind === "comment") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.7 8.7 0 0 1-3.7-.8L4 20l1.2-3.6A7.1 7.1 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.1 8 7.5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>;
  if (kind === "assignment") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="4"/><path d="M19 8v6M16 11h6"/></svg>;
  if (kind === "invite") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20"/><circle cx="9.5" cy="7" r="4"/><path d="m16 8 2 2 4-4"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h11M8 12h11M8 19h11"/><path d="m3 5 1 1 2-2M3 12l1 1 2-2M3 19l1 1 2-2"/></svg>;
}

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Header() {
  const router = useRouter();
  const [list, setList] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [name, setName] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setCurrentWorkspace] = useState("");
  useEffect(() => {
    setName(getName() ?? "");
    api<Workspace[]>("/api/workspaces")
      .then((items) => {
        setWorkspaces(items);
        const saved = getWorkspaceId();
        const next = items.find((item) => item.id === saved)?.id ?? items[0]?.id ?? "";
        if (next) {
          setWorkspaceId(next);
          setCurrentWorkspace(next);
        }
      })
      .catch(() => {});
    api<Notif[]>("/api/notifications")
      .then(setList)
      .catch(() => {});
    const socket = getSocket();
    const on = (notification: Notif) =>
      setList((items) => [notification, ...items]);
    socket.on("notification", on);
    return () => { socket.off("notification", on); };
  }, []);

  const unread = list.filter((item) => !item.read).length;
  async function markAllRead() {
    if (!unread) return;
    try {
      await api("/api/notifications/read", { method: "POST" });
      setList((items) => items.map((item) => ({ ...item, read: true })));
    } catch { /* keep unread state visible so the action can be retried */ }
  }
  async function openNotification(notification: Notif) {
    setOpen(false);
    if (!notification.read) {
      setList((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      try {
        await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      } catch {
        setList((items) => items.map((item) => item.id === notification.id ? { ...item, read: false } : item));
      }
    }
    if (notification.project_id) router.push(`/projects/${notification.project_id}`);
  }
  function toggleNotifications() {
    setOpen((value) => !value);
    setAccountOpen(false);
  }
  function logout() {
    clearSession();
    closeSocket();
    router.push("/");
  }

  return (
    <header className="hdr">
      <Link className="header-brand" href="/projects">
        Taskflow
      </Link>
      <nav className="app-nav" aria-label="Primary">
        <Link href="/projects">Projects</Link>
        <Link href="/my-tasks">My tasks</Link>
        <Link href="/calendar">Calendar</Link>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/analytics">Analytics</Link>
        <Link href="/search">Search</Link>
        <Link href="/community">Community</Link>
      </nav>
      {workspaces.length > 0 && (
        <label className="workspace-switcher">
          <span className="sr-only">Current workspace</span>
          <select
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setCurrentWorkspace(event.target.value);
              window.location.reload();
            }}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <span className="sp" />
      <div className="header-popover-wrap">
        <button
          className="notification-trigger"
          onClick={toggleNotifications}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M10 21h4" />
          </svg>
          {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
        </button>
        {open && (
          <div className="dd notification-menu" role="dialog" aria-label="Notification center">
            <div className="notification-menu-header"><div><span className="notification-menu-eyebrow">YOUR INBOX</span><b>Notifications</b></div><div className="notification-menu-header-actions">{unread > 0 && <span className="unread-count">{unread} new</span>}<button onClick={markAllRead} disabled={!unread} className="mark-read-button">Mark all read</button></div></div>
            <div className="notification-list">
            {list.length === 0 && (
              <div className="notification-empty"><span className="notification-empty-icon">✓</span><b>You’re all caught up</b><span>New project activity will show up here.</span></div>
            )}
            {list.map((n) => (
              <button
                className={`notification-item${n.read ? "" : " un"}`}
                key={n.id}
                aria-label={`${n.read ? "Read" : "Unread"}: ${n.message}`}
                onClick={() => openNotification(n)}
              >
                <span className={`notification-icon notification-icon-${notificationKind(n.message)}`}><NotificationIcon kind={notificationKind(n.message)}/></span>
                <span className="notification-copy"><span className="notification-message">{n.message}</span><small>{timeAgo(n.created_at)}</small></span>
                {!n.read&&<span className="notification-unread-dot" aria-label="Unread"/>}
              </button>
            ))}
            </div>
          </div>
        )}
      </div>
      <div className="header-popover-wrap">
        <button
          className="account-trigger"
          onClick={() => {
            setAccountOpen(!accountOpen);
            setOpen(false);
          }}
        >
          <span className="user-avatar">
            {name.slice(0, 1).toUpperCase() || "U"}
          </span>
          <span className="account-trigger-name">{name || "Account"}</span>
          <span className="chevron">⌄</span>
        </button>
        {accountOpen && (
          <div className="dd account-menu">
            <div className="account-menu-user">
              <span className="user-avatar user-avatar-large">
                {name.slice(0, 1).toUpperCase() || "U"}
              </span>
              <span>
                <b>{name || "Your account"}</b>
                <small>{workspaces.find((item) => item.id === workspaceId)?.name || "Workspace"}</small>
              </span>
            </div>
            <Link href="/profile" onClick={() => setAccountOpen(false)}>
              ◉ <span>My profile</span>
            </Link>
            <Link href="/settings" onClick={() => setAccountOpen(false)}>
              ⚙ <span>Account settings</span>
            </Link>
            <Link href="/notification-preferences" onClick={() => setAccountOpen(false)}>
              🔔 <span>Notification preferences</span>
            </Link>
            <Link href="/automations" onClick={() => setAccountOpen(false)}>
              ⚡ <span>Automations</span>
            </Link>
            <Link href="/workspaces" onClick={() => setAccountOpen(false)}>
              ▦ <span>Manage workspaces</span>
            </Link>
            <button onClick={logout}>
              ↪ <span>Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
