"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import SpotlightCard from "@/components/bits/SpotlightCard";
import ClickSpark from "@/components/bits/ClickSpark";
import CountUp from "@/components/bits/CountUp";
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
            <ClickSpark sparkColor="#7c6df0">
              <button className="button button-primary" onClick={create} disabled={creating}>
                {creating ? "Creating…" : "New project"}
              </button>
            </ClickSpark>
          </div>
        </section>

        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}

        <section className="workspace-stats">
          <div className="stat-card">
            <span className="stat-icon">▦</span>
            <div>
              <strong>
                <CountUp to={list.length} />
              </strong>
              <small>Active projects</small>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">✓</span>
            <div>
              <strong>
                <CountUp to={totalTasks} />
              </strong>
              <small>Tasks in motion</small>
            </div>
          </div>
          <div className="stat-card">
            <span className="stat-icon">✳</span>
            <div>
              <strong>Good</strong>
              <small>Time to make progress</small>
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
            <div className="empty-illustration">✳</div>
            <h3>A good idea starts somewhere.</h3>
            <p>Create your first project and give your team a place to get things moving.</p>
            <button
              className="p"
              style={{ padding: "10px 14px" }}
              onClick={() => document.querySelector<HTMLInputElement>(".workspace-create input")?.focus()}
            >
              ＋ Create a project
            </button>
          </section>
        )}

        {/* Project grid with SpotlightCard */}
        {!loading && list.length > 0 && (
          <div className="grid">
            {list.map((project, i) => (
              <SpotlightCard
                key={project.id}
                className="pc"
                spotlightColor="rgba(124, 109, 240, 0.22)"
                onClick={() => router.push("/projects/" + project.id)}
              >
                <div className="project-card-top">
                  <span className="project-card-icon">{["▦", "✳", "◈"][i % 3]}</span>
                  <span className="project-more">•••</span>
                </div>
                <b>{project.name}</b>
                <p className="mut">A shared space for your team’s next steps.</p>
                <div className="project-card-footer">
                  <span>
                    {project.task_count} {project.task_count === 1 ? "task" : "tasks"}
                  </span>
                  <span className="project-card-open">Open</span>
                </div>
              </SpotlightCard>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
