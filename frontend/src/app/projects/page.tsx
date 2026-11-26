"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, FolderKanban, ListTodo, Plus } from "lucide-react";
import { toast } from "sonner";
import AppShell from "@/components/AppShell";
import { api, getName, getToken, getWorkspaceId } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

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
      .catch((reason) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUserName(getName() ?? "");
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    loadProjects();
    window.addEventListener("workspace-changed", loadProjects);
    return () => window.removeEventListener("workspace-changed", loadProjects);
  }, [router, loadProjects]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = projectName.trim();
    if (!trimmed) return;
    setError("");
    setCreating(true);
    try {
      const project = await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, workspace_id: getWorkspaceId() }),
      });
      toast.success(`Project “${project.name}” created`);
      router.push(`/projects/${project.id}`);
    } catch (reason) {
      const message = (reason as Error).message;
      setError(message);
      toast.error(message);
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
            <h1>{userName ? `Good to see you, ${userName.split(" ")[0]}.` : "Welcome to your workspace."}</h1>
            <p>A little progress, every day. What are we working on?</p>
          </div>
          <form className="workspace-create" onSubmit={create}>
            <FieldGroup className="min-w-0 flex-1">
              <Field>
                <FieldLabel className="sr-only" htmlFor="new-project-name">Project name</FieldLabel>
                <Input
                  id="new-project-name"
                  placeholder="Name your next project"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  maxLength={80}
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={creating || !projectName.trim()}>
              <Plus aria-hidden="true" data-icon="inline-start" />
              {creating ? "Creating…" : "New project"}
            </Button>
          </form>
        </section>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Something needs attention</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <section className="workspace-stats" aria-label="Workspace overview">
          <Card className="stat-card">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><FolderKanban aria-hidden="true" /></span>
              <div><strong>{list.length}</strong><small>Projects in workspace</small></div>
            </CardContent>
          </Card>
          <Card className="stat-card">
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ListTodo aria-hidden="true" /></span>
              <div><strong>{totalTasks}</strong><small>Tasks across projects</small></div>
            </CardContent>
          </Card>
        </section>

        <div className="section-heading">
          <div><h2>Your projects</h2><p className="text-sm text-muted-foreground">A focused view of the work your team is moving forward.</p></div>
          <Badge variant="secondary">{list.length} {list.length === 1 ? "project" : "projects"}</Badge>
        </div>

        {loading && (
          <div className="grid">
            {[1, 2, 3].map((item) => (
              <Card key={item} className="min-h-40">
                <CardHeader><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /></CardHeader>
                <CardContent><Skeleton className="h-4 w-full" /></CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && list.length === 0 && !error && (
          <Empty className="rounded-2xl border border-dashed bg-card px-6 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon"><FolderKanban aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>You don&apos;t have any projects yet</EmptyTitle>
              <EmptyDescription>Create a project to give your team a clear place to organize the work.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => document.getElementById("new-project-name")?.focus()}>
                <Plus aria-hidden="true" data-icon="inline-start" />Name your first project
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {!loading && list.length > 0 && (
          <div className="grid">
            {list.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="project-card-link">
                <Card className="pc h-full">
                  <CardHeader>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription>Project workspace</CardDescription>
                    <CardAction><ArrowUpRight aria-hidden="true" className="size-4 text-muted-foreground transition-colors group-hover:text-primary" /></CardAction>
                  </CardHeader>
                  <CardContent className="project-card-footer">
                    <Badge variant="secondary">{project.task_count} {project.task_count === 1 ? "task" : "tasks"}</Badge>
                    <span className="project-card-open">Open project</span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
