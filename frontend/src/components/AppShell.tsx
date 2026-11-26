"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Moon,
  Search,
  Settings2,
  Sun,
  UsersRound,
  Workflow,
} from "lucide-react";
import { api, clearSession, getName, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import { closeSocket, getSocket } from "@/lib/socket";
import type { Notif, Workspace } from "@/lib/types";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import CommandPalette from "@/components/CommandPalette";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function BrandMark() {
  return (
    <span className="taskflow-mark" aria-hidden="true">
      <Check />
    </span>
  );
}

const mainLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/my-tasks", label: "My tasks", icon: CheckCheck },
  { href: "/community", label: "Team updates", icon: MessageSquareText },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: Activity },
  { href: "/search", label: "Search", icon: Search },
];

const teamLinks = [
  { href: "/automations", label: "Automations", icon: Workflow },
];

function AppShellContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [list, setList] = useState<Notif[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [name, setName] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setCurrentWorkspace] = useState("");
  const [modKey, setModKey] = useState("Ctrl");
  const unread = list.filter((item) => !item.read).length;
  const currentWorkspaceName = workspaces.find((workspace) => workspace.id === workspaceId)?.name ?? "Workspace";
  const initials = (name || "U").trim().slice(0, 1).toUpperCase();

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
    const onWorkspaceChanged = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail) setCurrentWorkspace(customEvent.detail);
    };
    window.addEventListener("workspace-changed", onWorkspaceChanged);

    return () => {
      socket.off("notification", onNotif);
      window.removeEventListener("workspace-changed", onWorkspaceChanged);
    };
  }, []);

  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (event.key === "/" && !paletteOpen) {
        const activeTag = (document.activeElement?.tagName || "").toLowerCase();
        const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
        if (activeTag !== "input" && activeTag !== "textarea" && activeTag !== "select" && !isEditable) {
          event.preventDefault();
          setPaletteOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [paletteOpen]);

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform) || navigator.userAgent.includes("Mac")) setModKey("⌘");
  }, []);

  async function markAllRead() {
    if (!unread) return;
    try {
      await api("/api/notifications/read", { method: "POST" });
      setList((items) => items.map((item) => ({ ...item, read: true })));
    } catch {
      // Keep the current notification state when the request fails.
    }
  }

  async function openNotification(notification: Notif) {
    setNotifOpen(false);
    if (!notification.read) {
      setList((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
      try {
        await api(`/api/notifications/${notification.id}/read`, { method: "PATCH" });
      } catch {
        setList((items) => items.map((item) => item.id === notification.id ? { ...item, read: false } : item));
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

  function changeWorkspace(id: string | null) {
    if (!id) return;
    setWorkspaceId(id);
    setCurrentWorkspace(id);
    window.dispatchEvent(new CustomEvent("workspace-changed", { detail: id }));
  }

  function renderLinks(links: typeof mainLinks) {
    return links.map(({ href, label, icon: Icon }) => {
      const active = href === "/projects"
        ? pathname === "/projects" || pathname.startsWith("/projects/")
        : pathname === href;
      return (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            render={<Link href={href} aria-current={active ? "page" : undefined} />}
            isActive={active}
            tooltip={label}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });
  }

  return (
    <>
      <Sidebar collapsible="icon" className="taskflow-sidebar">
        <SidebarHeader className="taskflow-sidebar-header">
          <Link href="/projects" className="brand taskflow-brand" aria-label="Taskflow home">
            <BrandMark />
            <span>taskflow</span>
          </Link>
          <div className="taskflow-workspace-switcher">
            <span className="taskflow-sidebar-eyebrow">Workspace</span>
            {workspaces.length > 0 ? (
              <Select value={workspaceId} onValueChange={changeWorkspace}>
                <SelectTrigger className="taskflow-workspace-trigger" aria-label="Switch workspace">
                  <SelectValue placeholder="Choose a workspace" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {workspaces.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>{workspace.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Button render={<Link href="/workspaces" />} variant="outline" className="w-full justify-start">
                Create a workspace
              </Button>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderLinks(mainLinks)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Team</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{renderLinks(teamLinks)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="taskflow-sidebar-footer">
          <SidebarSeparator />
          <div className="taskflow-theme-row">
            <span className="taskflow-sidebar-eyebrow">Appearance</span>
            <Select value={theme} onValueChange={(value) => value && setTheme(value as Theme)}>
              <SelectTrigger className="taskflow-theme-trigger" aria-label="Choose appearance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="light"><Sun aria-hidden="true" />Light</SelectItem>
                  <SelectItem value="dark"><Moon aria-hidden="true" />Dark</SelectItem>
                  <SelectItem value="system"><Settings2 aria-hidden="true" />System</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="taskflow-user-trigger" />}>
              <Avatar className="taskflow-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
              <span className="taskflow-user-copy">
                <strong>{name || "Your account"}</strong>
                <small>{currentWorkspaceName}</small>
              </span>
              <ChevronDown aria-hidden="true" className="taskflow-user-chevron" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{name || "Your account"}</DropdownMenuLabel>
                <DropdownMenuItem render={<Link href="/profile" />}><UsersRound />My profile</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/settings" />}><Settings2 />Account settings</DropdownMenuItem>
                <DropdownMenuItem render={<Link href="/notification-preferences" />}><Bell />Notification preferences</DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={logout}><LogOut />Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="taskflow-main">
        <header className="taskflow-topbar">
          <SidebarTrigger aria-label="Toggle navigation" />
          <div className="taskflow-topbar-divider" aria-hidden="true" />
          <Button variant="outline" className="taskflow-search-trigger" onClick={() => setPaletteOpen(true)} aria-label={`Search or jump to (${modKey}K)`}>
            <Search aria-hidden="true" data-icon="inline-start" />
            <span>Search or jump to…</span>
            <kbd>{modKey} K</kbd>
          </Button>
          <div className="taskflow-topbar-actions">
            <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
              <Button variant="ghost" size="icon" className="taskflow-icon-button" onClick={() => setNotifOpen(true)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell aria-hidden="true" />
                {unread > 0 && <span className="taskflow-notification-dot" aria-hidden="true" />}
              </Button>
              <SheetContent className="taskflow-notification-sheet">
                <SheetHeader className="taskflow-notification-header">
                  <div>
                    <p className="taskflow-sidebar-eyebrow">Your inbox</p>
                    <SheetTitle>Notifications</SheetTitle>
                    <SheetDescription>Project activity and team updates.</SheetDescription>
                  </div>
                  <Button variant="ghost" size="sm" disabled={!unread} onClick={markAllRead}>Mark all read</Button>
                </SheetHeader>
                <ScrollArea className="taskflow-notification-scroll">
                  {list.length === 0 ? (
                    <Empty className="taskflow-notification-empty">
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><CheckCheck aria-hidden="true" /></EmptyMedia>
                        <EmptyTitle>All caught up</EmptyTitle>
                        <EmptyDescription>New project activity will show up here.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  ) : (
                    <div className="taskflow-notification-list">
                      {list.map((item) => (
                        <button key={item.id} type="button" className={`taskflow-notification${item.read ? "" : " is-unread"}`} onClick={() => void openNotification(item)}>
                          <span className="taskflow-notification-icon"><MessageSquareText aria-hidden="true" /></span>
                          <span className="taskflow-notification-copy">
                            <span>{item.message}</span>
                            <small>{timeAgo(item.created_at)}</small>
                          </span>
                          {!item.read && <Badge variant="secondary">New</Badge>}
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" className="taskflow-mobile-account" render={<Link href="/profile" aria-label="Open profile" />}>
              <Avatar className="taskflow-avatar"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            </Button>
          </div>
        </header>
        <div className="taskflow-page-content" id="content">
          {children}
        </div>
      </SidebarInset>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="taskflow-sidebar-provider">
      <AppShellContent>{children}</AppShellContent>
    </SidebarProvider>
  );
}
