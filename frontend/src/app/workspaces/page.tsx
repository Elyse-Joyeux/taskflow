"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import type { Workspace } from "@/lib/types";

type Member = { id: string; display_name: string; email: string; role: "owner" | "admin" | "member" };

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [newName, setNewName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useMemo(() => workspaces.find(item => item.id === activeId) ?? null, [workspaces, activeId]);

  const loadMembers = useCallback(async (workspaceId: string) => {
    const list = await api<Member[]>(`/api/workspaces/${workspaceId}/members`);
    setMembers(list);
  }, []);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    api<Workspace[]>("/api/workspaces").then(items => {
      setWorkspaces(items);
      const current = items.find(item => item.id === getWorkspaceId()) ?? items[0];
      if (current) { setActiveId(current.id); setWorkspaceId(current.id); setName(current.name); void loadMembers(current.id); }
    }).catch(reason => setError((reason as Error).message));
  }, [router, loadMembers]);

  async function selectWorkspace(id: string) {
    const workspace = workspaces.find(item => item.id === id);
    setActiveId(id); setWorkspaceId(id); setMembers([]); setError(""); setSuccess("");
    if (workspace) setName(workspace.name);
    try { await loadMembers(id); } catch (reason) { setError((reason as Error).message); }
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      const created = await api<Workspace>("/api/workspaces", { method: "POST", body: JSON.stringify({ name: newName }) });
      const next = [...workspaces, created]; setWorkspaces(next); setNewName("");
      setActiveId(created.id); setWorkspaceId(created.id); setName(created.name); setMembers([]);
      setSuccess("Workspace created.");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault(); if (!active) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const updated = await api<Workspace>(`/api/workspaces/${active.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setWorkspaces(items => items.map(item => item.id === active.id ? { ...item, name: updated.name } : item));
      setSuccess("Workspace name updated.");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault(); if (!active) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/api/workspaces/${active.id}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
      await loadMembers(active.id); setEmail(""); setSuccess("Workspace member added and notified.");
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }

  async function removeMember(member: Member) {
    if (!active) return;
    if (!window.confirm(`Remove ${member.display_name} from ${active.name}?`)) return;
    setError(""); setSuccess("");
    try {
      await api(`/api/workspaces/${active.id}/members/${member.id}`, { method: "DELETE" });
      setMembers(items => items.filter(item => item.id !== member.id));
      if (member.id === localStorage.getItem("uid")) {
        const remaining = workspaces.filter(item => item.id !== active.id);
        setWorkspaces(remaining);
        if (remaining[0]) await selectWorkspace(remaining[0].id);
        else { setActiveId(""); setWorkspaceId(""); setMembers([]); }
      }
      setSuccess(`${member.display_name} was removed from this workspace.`);
    } catch (reason) { setError((reason as Error).message); }
  }

  return <><Header/><main className="wrap workspace-admin" id="main">
    <section className="workspace-intro"><div><span className="workspace-overline">TEAM ACCESS</span><h1>Workspaces</h1><p>Create shared spaces and manage who can work in them.</p></div></section>
    {error && <p className="auth-error" role="alert">{error}</p>}{success && <p className="workspace-success" role="status">{success}</p>}
    <div className="workspace-admin-grid"><section className="settings-card"><span className="workspace-overline">YOUR SPACES</span><h2>Choose a workspace</h2><div className="workspace-choice-list">{workspaces.map(workspace => <button key={workspace.id} className={workspace.id===activeId?"workspace-choice selected":"workspace-choice"} onClick={() => void selectWorkspace(workspace.id)}><span className="workspace-choice-icon">▦</span><span><b>{workspace.name}</b><small>{workspace.member_count ?? 0} members · {workspace.project_count ?? 0} projects</small></span><span>{workspace.role}</span></button>)}</div><form className="workspace-create-form" onSubmit={createWorkspace}><label className="field-label">New workspace<input required maxLength={80} value={newName} onChange={event => setNewName(event.target.value)} placeholder="e.g. Product team"/></label><button className="button button-primary" disabled={busy || !newName.trim()}>{busy ? "Working…" : "＋ Create workspace"}</button></form></section>
    {active ? <section className="settings-card"><span className="workspace-overline">WORKSPACE SETTINGS</span><h2>{active.name}</h2><form className="workspace-rename-form" onSubmit={saveName}><label className="field-label">Workspace name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={!['owner','admin'].includes(active.role ?? '')}/></label><button className="button button-primary" disabled={busy || !name.trim() || name===active.name || !['owner','admin'].includes(active.role ?? '')}>Save name</button></form><div className="workspace-member-heading"><div><h3>Members</h3><p>Workspace membership scopes access to its projects.</p></div><span>{members.length}</span></div><div className="workspace-member-list">{members.map(member => <div className="workspace-member" key={member.id}><span className="workspace-member-avatar">{member.display_name.slice(0,1).toUpperCase()}</span><span className="workspace-member-info"><b>{member.display_name}</b><small>{member.email}</small></span><span className="workspace-role-pill">{member.role}</span>{['owner','admin'].includes(active.role ?? '') && member.role!=='owner' && <button className="workspace-remove-member" onClick={() => void removeMember(member)} aria-label={`Remove ${member.display_name}`}>Remove</button>}</div>)}</div>{['owner','admin'].includes(active.role ?? '') && <form className="workspace-add-member" onSubmit={addMember}><label className="field-label">Add an existing Taskflow user<input required type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="teammate@example.com"/></label><label className="field-label">Role<select value={role} onChange={event => setRole(event.target.value as "admin" | "member")}><option value="member">Member</option><option value="admin">Admin</option></select></label><button className="button button-primary" disabled={busy || !email.trim()}>{busy ? "Adding…" : "Add member"}</button><small>They’ll receive an in-app notification. Project access remains controlled by project membership.</small></form>}</section> : <section className="settings-card"><h2>Create a workspace to get started</h2><p>Each workspace has its own members and projects.</p></section>}
    </div>
  </main></>;
}
