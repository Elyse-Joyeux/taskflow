"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api, clearSession, getName, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import { closeSocket, getSocket } from "@/lib/socket";
import type { Notif, Workspace } from "@/lib/types";
import { useTheme } from "@/components/ThemeProvider";
import CommandPalette from "@/components/CommandPalette";
import FadeContent from "@/components/bits/FadeContent";
import AnimatedList from "@/components/bits/AnimatedList";

function notificationKind(message: string) {
  const text = message.toLowerCase();
  if (text.includes("comment")) return "comment";
  if (text.includes("assign")) return "assignment";
  if (text.includes("added you")) return "invite";
  return "update";
}

function NotificationIcon({ kind }: { kind: string }) {
  if (kind === "comment") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }
  if (kind === "assignment") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <polyline points="16 11 18 13 22 9" />
      </svg>
    );
  }
  if (kind === "invite") {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <line x1="19" y1="8" x2="19" y2="14" />
        <line x1="22" y1="11" x2="16" y2="11" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── SVG nav icons ──────────────────────────────────────────────
const NavIcons: Record<string, React.ReactNode> = {
  projects: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="6" height="18" rx="1" />
      <rect x="10" y="3" width="12" height="10" rx="1" />
      <rect x="10" y="15" width="12" height="6" rx="1" />
    </svg>
  ),
  "my-tasks": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  calendar: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  analytics: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  community: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [list, setList] = useState<Notif[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [name, setName] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setCurrentWorkspace] = useState("");

  const notifRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

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
    const onNotif = (notification: Notif) => setList((items) => [notification, ...items]);
    socket.on("notification", onNotif);

    const onWorkspaceChanged = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) setCurrentWorkspace(customEvent.detail);
    };
    window.addEventListener("workspace-changed", onWorkspaceChanged);

    return () => {
      socket.off("notification", onNotif);
      window.removeEventListener("workspace-changed", onWorkspaceChanged);
    };
  }, []);

  // Global keybindings for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (e.key === "/" && !paletteOpen) {
        const activeTag = (document.activeElement?.tagName || "").toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select" && !isEditable) {
          e.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paletteOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile nav on route change
  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  const unread = list.filter((item) => !item.read).length;

  async function markAllRead() {
    if (!unread) return;
    try {
      await api("/api/notifications/read", { method: "POST" });
      setList((items) => items.map((item) => ({ ...item, read: true })));
    } catch { /* keep state */ }
  }

  async function openNotification(notification: Notif) {
    setNotifOpen(false);
    if (!notification.read) {
      setList((items) => items.map((item) => (item.id === notification.id ? { ...item, read: true } : item)));
      try {
        await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      } catch {
        setList((items) => items.map((item) => (item.id === notification.id ? { ...item, read: false } : item)));
      }
    }
    if (notification.project_id) {
      const taskQuery = notification.task_id ? `?task=${encodeURIComponent(notification.task_id)}` : "";
      router.push(`/projects/${notification.project_id}${taskQuery}`);
    }
  }

  function logout() {
    clearSession();
    closeSocket();
    router.push("/");
  }

  const navLinks = [
    { href: "/projects",   label: "Projects",   iconKey: "projects" },
    { href: "/my-tasks",   label: "My tasks",   iconKey: "my-tasks" },
    { href: "/calendar",   label: "Calendar",   iconKey: "calendar" },
    { href: "/dashboard",  label: "Dashboard",  iconKey: "dashboard" },
    { href: "/analytics",  label: "Analytics",  iconKey: "analytics" },
    { href: "/search",     label: "Search",     iconKey: "search" },
    { href: "/community",  label: "Community",  iconKey: "community" },
  ];

  const currentWorkspaceName = workspaces.find((w) => w.id === workspaceId)?.name || "Workspace";
  const [modKey, setModKey] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform) || navigator.userAgent.includes("Mac")) {
      setModKey("⌘");
    }
  }, []);

  return (
    <div className="shell-root">
      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileNavOpen && (
          <motion.div
            className="shell-mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileNavOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Left Sidebar ──────────────────────────────────────── */}
      <aside className={`shell-sidebar${mobileNavOpen ? " shell-sidebar-open" : ""}`}>
        {/* Top: brand + close */}
        <div className="shell-sidebar-top">
          <Link href="/projects" className="brand" aria-label="Taskflow home">
            <span className="brand-mark" aria-hidden="true">
              <span /><span /><span /><span />
            </span>
            <span>taskflow</span>
          </Link>
          <button
            className="shell-sidebar-close-mobile"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Workspace selector */}
        {workspaces.length > 0 && (
          <div className="shell-workspace-box">
            <span className="shell-sidebar-heading">Workspace</span>
            <label className="shell-workspace-select-wrap">
              <select
                value={workspaceId}
                onChange={(e) => {
                  const id = e.target.value;
                  setWorkspaceId(id);
                  setCurrentWorkspace(id);
                }}
                aria-label="Switch workspace"
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
              <span className="shell-select-caret" aria-hidden="true">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </label>
          </div>
        )}

        {/* Nav */}
        <nav className="shell-nav" aria-label="Main navigation">
          <span className="shell-sidebar-heading">Menu</span>
          {navLinks.map((item) => {
            const isActive =
              item.href === "/projects"
                ? pathname === "/projects" || pathname.startsWith("/projects/")
                : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shell-nav-link${isActive ? " shell-nav-link-active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="shell-nav-icon">{NavIcons[item.iconKey]}</span>
                <span className="shell-nav-text">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer: theme + user */}
        <div className="shell-sidebar-footer">
          <div className="shell-theme-picker">
            <span className="shell-sidebar-heading">Theme</span>
            <div className="shell-theme-toggle">
              <button
                type="button"
                className={`shell-theme-btn${theme === "light" ? " active" : ""}`}
                onClick={() => setTheme("light")}
                aria-label="Light mode"
                title="Light mode"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              </button>
              <button
                type="button"
                className={`shell-theme-btn${theme === "dark" ? " active" : ""}`}
                onClick={() => setTheme("dark")}
                aria-label="Dark mode"
                title="Dark mode"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </button>
              <button
                type="button"
                className={`shell-theme-btn${theme === "system" ? " active" : ""}`}
                onClick={() => setTheme("system")}
                aria-label="System preference"
                title="Follow system"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </button>
            </div>
          </div>

          <div className="shell-user-card">
            <Link href="/profile" className="shell-user-link" title="My profile">
              <span className="user-avatar" aria-hidden="true">{(name || "U").slice(0, 1).toUpperCase()}</span>
              <div className="shell-user-meta">
                <b>{name || "User"}</b>
                <small>{currentWorkspaceName}</small>
              </div>
            </Link>
            <Link href="/settings" className="shell-settings-quick" title="Settings" aria-label="Settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>
      </aside>

      {/* ── Main Container ──────────────────────────────────────── */}
      <div className="shell-main">
        {/* Top bar */}
        <header className="shell-topbar">
          <button
            className="shell-mobile-toggle"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Search / command palette trigger */}
          <button
            className="shell-search-trigger"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search or jump to (Ctrl+K)"
          >
            <span className="shell-search-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <span className="shell-search-text">Search or jump to…</span>
            <span className="shell-kbd-hint">{modKey}K</span>
          </button>

          <div className="shell-topbar-actions">
            {/* Notifications */}
            <div className="header-popover-wrap" ref={notifRef}>
              <button
                className="notification-trigger"
                onClick={() => { setNotifOpen(!notifOpen); setAccountOpen(false); }}
                aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
                aria-expanded={notifOpen}
                aria-haspopup="dialog"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M10 21h4" />
                </svg>
                {unread > 0 && <span className="badge">{unread > 99 ? "99+" : unread}</span>}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    className="dd notification-menu"
                    role="dialog"
                    aria-label="Notification center"
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="notification-menu-header">
                      <div>
                        <span className="notification-menu-eyebrow">INBOX</span>
                        <b>Notifications</b>
                      </div>
                      <div className="notification-menu-header-actions">
                        {unread > 0 && <span className="unread-count">{unread} new</span>}
                        <button onClick={markAllRead} disabled={!unread} className="mark-read-button">
                          Mark read
                        </button>
                      </div>
                    </div>
                    <AnimatedList className="notification-list">
                      {list.length === 0 && (
                        <div className="notification-empty">
                          <span className="notification-empty-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          <b>All caught up</b>
                          <span>New project activity will show up here.</span>
                        </div>
                      )}
                      {list.map((n) => (
                        <button
                          className={`notification-item${n.read ? "" : " un"}`}
                          key={n.id}
                          aria-label={`${n.read ? "Read" : "Unread"}: ${n.message}`}
                          onClick={() => openNotification(n)}
                        >
                          <span className={`notification-icon notification-icon-${notificationKind(n.message)}`}>
                            <NotificationIcon kind={notificationKind(n.message)} />
                          </span>
                          <span className="notification-copy">
                            <span className="notification-message">{n.message}</span>
                            <small>{timeAgo(n.created_at)}</small>
                          </span>
                          {!n.read && <span className="notification-unread-dot" aria-label="Unread" />}
                        </button>
                      ))}
                    </AnimatedList>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Account */}
            <div className="header-popover-wrap" ref={accountRef}>
              <button
                className="account-trigger"
                onClick={() => { setAccountOpen(!accountOpen); setNotifOpen(false); }}
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                <span className="user-avatar" aria-hidden="true">{(name || "U").slice(0, 1).toUpperCase()}</span>
                <span className="account-trigger-name">{name || "Account"}</span>
                <span className="chevron" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </button>

              <AnimatePresence>
                {accountOpen && (
                  <motion.div
                    className="dd account-menu"
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="account-menu-user">
                      <span className="user-avatar user-avatar-large" aria-hidden="true">{(name || "U").slice(0, 1).toUpperCase()}</span>
                      <div>
                        <b>{name || "Your account"}</b>
                        <small>{currentWorkspaceName}</small>
                      </div>
                    </div>
                    <Link href="/profile" onClick={() => setAccountOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                      <span>My profile</span>
                    </Link>
                    <Link href="/settings" onClick={() => setAccountOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                      <span>Account settings</span>
                    </Link>
                    <Link href="/notification-preferences" onClick={() => setAccountOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
                      <span>Notification preferences</span>
                    </Link>
                    <Link href="/automations" onClick={() => setAccountOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      <span>Automations</span>
                    </Link>
                    <Link href="/workspaces" onClick={() => setAccountOpen(false)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                      <span>Manage workspaces</span>
                    </Link>
                    <button onClick={logout}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      <span>Sign out</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Page body */}
        <main className="shell-body" id="content">
          <FadeContent duration={0.22} delay={0.03}>
            {children}
          </FadeContent>
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
