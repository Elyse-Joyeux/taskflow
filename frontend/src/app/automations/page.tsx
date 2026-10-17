"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import {
  ACTION_TYPE_LABELS,
  TRIGGER_TYPE_LABELS,
  type AutomationRule,
} from "@/lib/types";

type Project = { id: string; name: string };

const TRIGGER_TYPES = Object.keys(TRIGGER_TYPE_LABELS);
const ACTION_TYPES  = Object.keys(ACTION_TYPE_LABELS);

const defaultForm = () => ({
  name: "",
  trigger_type: "status_changed",
  trigger_config: {} as Record<string, string>,
  condition_config: {} as Record<string, string>,
  action_type: "notify",
  action_config: {} as Record<string, string>,
  project_id: "",
});

export default function AutomationsPage() {
  const router = useRouter();
  const [rules, setRules]     = useState<AutomationRule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [wid, setWid]          = useState("");
  const [form, setForm]         = useState(defaultForm());
  const [showForm, setShowForm] = useState(false);
  const [logs, setLogs]         = useState<{ ruleId: string; rows: { id: string; status: string; message: string; executed_at: string }[] } | null>(null);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    async function load() {
      try {
        let workspaceId = getWorkspaceId();
        if (!workspaceId) {
          const ws = await api<{ id: string }[]>("/api/workspaces");
          workspaceId = ws[0]?.id ?? "";
          if (workspaceId) setWorkspaceId(workspaceId);
        }
        if (!workspaceId) { setError("No workspace found."); return; }
        setWid(workspaceId);
        const [r, p] = await Promise.all([
          api<AutomationRule[]>(`/api/workspaces/${workspaceId}/automations`),
          api<Project[]>("/api/projects"),
        ]);
        setRules(r);
        setProjects(p);
      } catch (e) { setError((e as Error).message); }
    }
    void load();
  }, [router]);

  async function createRule(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const rule = await api<AutomationRule>(`/api/workspaces/${wid}/automations`, {
        method: "POST",
        body: JSON.stringify({ ...form, project_id: form.project_id || null }),
      });
      setRules((l) => [rule, ...l]);
      setShowForm(false);
      setForm(defaultForm());
      setSuccess("Automation created.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function toggleRule(rule: AutomationRule) {
    try {
      const updated = await api<AutomationRule>(`/api/automations/${rule.id}`, {
        method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }),
      });
      setRules((l) => l.map((r) => r.id === rule.id ? updated : r));
    } catch (e) { setError((e as Error).message); }
  }

  async function deleteRule(rule: AutomationRule) {
    if (!confirm(`Delete automation "${rule.name}"?`)) return;
    try {
      await api(`/api/automations/${rule.id}`, { method: "DELETE" });
      setRules((l) => l.filter((r) => r.id !== rule.id));
      setSuccess("Automation deleted.");
    } catch (e) { setError((e as Error).message); }
  }

  async function viewLogs(rule: AutomationRule) {
    if (logs?.ruleId === rule.id) { setLogs(null); return; }
    try {
      const rows = await api<{ id: string; status: string; message: string; executed_at: string }[]>(`/api/automations/${rule.id}/logs`);
      setLogs({ ruleId: rule.id, rows });
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <Header />
      <main className="wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">WORKSPACE AUTOMATIONS</span>
            <h1>Automations</h1>
            <p>Set triggers and actions to automate repetitive work across your projects.</p>
          </div>
          <button className="button button-primary" onClick={() => { setShowForm(true); setError(""); }}>
            ＋ New automation
          </button>
        </div>

        {error   && <p className="auth-error" role="alert">{error}</p>}
        {success && <p className="workspace-success" role="status">✓ {success}</p>}

        {/* ── Create form ── */}
        {showForm && (
          <section className="settings-card" style={{ marginBottom: 24 }}>
            <h2>New automation rule</h2>
            <form className="settings-form" onSubmit={createRule}>
              <label className="field-label">
                Name <span aria-hidden>*</span>
                <input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Assign reviewer when In Review" />
              </label>
              <div className="task-meta-grid">
                <label className="field-label">
                  Trigger
                  <select value={form.trigger_type} onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}>
                    {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{TRIGGER_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  Action
                  <select value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}>
                    {ACTION_TYPES.map((t) => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
                  </select>
                </label>
                <label className="field-label">
                  Scope (optional project)
                  <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">All projects in workspace</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
              </div>
              {/* Condition helpers */}
              {form.trigger_type === "status_changed" && (
                <label className="field-label">
                  When new status equals (optional)
                  <select value={form.condition_config.status ?? ""} onChange={(e) => setForm({ ...form, condition_config: { ...form.condition_config, status: e.target.value } })}>
                    <option value="">Any status</option>
                    {["backlog","todo","in_progress","in_review","blocked","done"].map((s) => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                  </select>
                </label>
              )}
              {/* Action helpers */}
              {form.action_type === "notify" && (
                <label className="field-label">
                  Notification message
                  <input value={form.action_config.message ?? ""} onChange={(e) => setForm({ ...form, action_config: { ...form.action_config, message: e.target.value } })} placeholder="e.g. Task needs your review" />
                </label>
              )}
              {form.action_type === "change_status" && (
                <label className="field-label">
                  Target status
                  <select value={form.action_config.status ?? ""} onChange={(e) => setForm({ ...form, action_config: { ...form.action_config, status: e.target.value } })}>
                    <option value="">Select…</option>
                    {["backlog","todo","in_progress","in_review","blocked","done"].map((s) => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                  </select>
                </label>
              )}
              {form.action_type === "create_task" && (
                <label className="field-label">
                  Follow-up task title
                  <input value={form.action_config.title ?? ""} onChange={(e) => setForm({ ...form, action_config: { ...form.action_config, title: e.target.value } })} placeholder="e.g. Review completed task" />
                </label>
              )}
              <div className="form-actions">
                <button type="button" className="button button-quiet" onClick={() => { setShowForm(false); setForm(defaultForm()); }}>Cancel</button>
                <button type="submit" className="button button-primary" disabled={busy || !form.name.trim()}>{busy ? "Creating…" : "Create automation"}</button>
              </div>
            </form>
          </section>
        )}

        {/* ── Rules list ── */}
        {rules.length === 0 && !showForm && (
          <div className="empty-state">
            <div className="empty-illustration">⚙</div>
            <h3>No automations yet</h3>
            <p>Create rules to automatically assign, notify, or update tasks when events happen.</p>
          </div>
        )}
        <div className="automation-list">
          {rules.map((rule) => (
            <article key={rule.id} className={`automation-card${rule.enabled ? "" : " disabled"}`}>
              <div className="automation-card-head">
                <div>
                  <div className="automation-title-row">
                    <span className="automation-status-dot" style={{ background: rule.enabled ? "var(--accent)" : "#aaa" }} />
                    <b>{rule.name}</b>
                    {!rule.enabled && <span className="tag">Paused</span>}
                  </div>
                  <div className="automation-meta">
                    <span>When: <strong>{TRIGGER_TYPE_LABELS[rule.trigger_type] ?? rule.trigger_type}</strong></span>
                    <span>Then: <strong>{ACTION_TYPE_LABELS[rule.action_type] ?? rule.action_type}</strong></span>
                    {rule.project_id && <span>Scope: <strong>{projects.find((p) => p.id === rule.project_id)?.name ?? "project"}</strong></span>}
                  </div>
                </div>
                <div className="automation-card-actions">
                  <button className="button button-quiet" onClick={() => toggleRule(rule)}>{rule.enabled ? "Pause" : "Enable"}</button>
                  <button className="button button-quiet" onClick={() => viewLogs(rule)}>Logs</button>
                  <button className="button button-quiet danger" onClick={() => deleteRule(rule)}>Delete</button>
                </div>
              </div>
              {logs?.ruleId === rule.id && (
                <div className="automation-logs">
                  <h4>Execution log (last 50)</h4>
                  {logs.rows.length === 0 ? <p className="mut">No executions yet.</p> : (
                    <table className="log-table">
                      <thead><tr><th>Time</th><th>Status</th><th>Message</th></tr></thead>
                      <tbody>
                        {logs.rows.map((l) => (
                          <tr key={l.id} className={`log-row-${l.status}`}>
                            <td><time>{new Date(l.executed_at).toLocaleString()}</time></td>
                            <td><span className={`tag log-status-${l.status}`}>{l.status}</span></td>
                            <td>{l.message || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
