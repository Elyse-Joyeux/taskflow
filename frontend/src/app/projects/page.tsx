"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { api, getName, getToken, getWorkspaceId } from "@/lib/api";

type Project = { id: string; name: string; task_count: number };

export default function Projects() {
  const router = useRouter();
  const [list, setList] = useState<Project[]>([]);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [userName, setUserName] = useState("");

  const loadProjects = useCallback(() => {
    setLoading(true);
    api<Project[]>("/api/projects")
      .then((items) => {
        setList(items);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUserName(getName() ?? "");
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadProjects();

    const onWorkspaceChanged = () => {
      loadProjects();
    };
    window.addEventListener("workspace-changed", onWorkspaceChanged);
    return () => window.removeEventListener("workspace-changed", onWorkspaceChanged);
  }, [router, loadProjects]);

  async function create() {
    const trimmed = projectName.trim();
    if (!trimmed) return;
    setError("");
    setCreating(true);
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, workspace_id: getWorkspaceId() }),
      });
      toast.success(`Project "${project.name}" created!`);
      router.push("/projects/" + project.id);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  const totalTasks = list.reduce((total, project) => total + Number(project.task_count || 0), 0);

  return (
    <AppShell>
      <div className="wrap" id="main">
        <section className="workspace-intro">
          <div>
            <span className="workspace-overline">YOUR WORKSPACE</span>
            <h1>
              {userName
                ? `Good to see you, ${userName.split(" ")[0]}.`
                : "Welcome to your workspace."}
            </h1>
            <p>A little progress, every day. What are we working on?</p>
          </div>
          <div className="workspace-create">
            <input
              aria-label="Project name"
              placeholder="Name your next project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button className="button button-primary" onClick={create} disabled={creating}>
              {creating ? "Creating…" : "New project"}
            </button>
          </div>
        </section>

        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}

        <section className="workspace-stats" aria-label="Workspace overview">
          <div className="stat-card">
            <div>
              <strong>{list.length}</strong>
              <small>Projects in workspace</small>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <strong>{totalTasks}</strong>
              <small>Tasks across projects</small>
            </div>
          </div>
        </section>

        <div className="section-heading">
          <h2>Your projects</h2>
          <span>
            {list.length} {list.length === 1 ? "project" : "projects"}
          </span>
        </div>

        {/* Skeletons while loading */}
        {loading && (
          <div className="grid">
            {[1, 2, 3].map((n) => (
              <div key={n} className="skeleton-shimmer skeleton-project-card" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && list.length === 0 && (
          <section className="empty-state">
            <h3>You don&apos;t have any projects yet.</h3>
            <p>Create a project to give your team a place to organize the work.</p>
            <button
              className="button button-secondary"
              onClick={() => document.querySelector<HTMLInputElement>(".workspace-create input")?.focus()}
            >
              Name your first project
            </button>
          </section>
        )}

        {!loading && list.length > 0 && (
          <div className="grid">
            {list.map((project) => (
              <Link key={project.id} className="pc" href={`/projects/${project.id}`}>
                <h3>{project.name}</h3>
                <div className="project-card-footer">
                  <span>
                    {project.task_count} {project.task_count === 1 ? "task" : "tasks"}
                  </span>
                  <span className="project-card-open">Open project</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
