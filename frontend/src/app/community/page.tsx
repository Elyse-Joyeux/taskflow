"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import { getSocket } from "@/lib/socket";

type Project = { id: string; name: string; role: string };
type Post = {
  id: string;
  project_id: string;
  project_name: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  reply_count: number;
  reaction_count: number;
  reacted: boolean;
};
type Reply = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};
type Activity = {
  id: string;
  project_id: string;
  project_name: string;
  task_id: string | null;
  task_title: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
  actor_name: string;
};
type CommunityData = {
  projects: Project[];
  posts: Post[];
  activity: Activity[];
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
const when = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

export default function CommunityPage() {
  const router = useRouter();
  const [data, setData] = useState<CommunityData>({
    projects: [],
    posts: [],
    activity: [],
  });
  const [projectId, setProjectId] = useState("all");
  const [selectedProject, setSelectedProject] = useState("");
  const [draft, setDraft] = useState("");
  const [replies, setReplies] = useState<Record<string, Reply[]>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [openReplies, setOpenReplies] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");

  const load = useCallback(async () => {
    const result = await api<CommunityData>("/api/community");
    setData(result);
    setSelectedProject((current) => current || result.projects[0]?.id || "");
  }, []);

  useEffect(() => {
    setUid(localStorage.getItem("uid") ?? "");
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load, router]);

  useEffect(() => {
    if (!data.projects.length) return;
    const socket = getSocket();
    const ids = data.projects.map((project) => project.id);
    ids.forEach((id) => socket.emit("watch", id));
    const onPost = (post: Post) =>
      setData((current) => ({
        ...current,
        posts: [post, ...current.posts.filter((item) => item.id !== post.id)],
      }));
    const onReply = (reply: Reply) => {
      if (reply.author_id === uid) return;
      setReplies((current) => ({
        ...current,
        [reply.post_id]: [
          ...(current[reply.post_id] ?? []).filter(
            (item) => item.id !== reply.id,
          ),
          reply,
        ],
      }));
      setData((current) => ({
        ...current,
        posts: current.posts.map((post) =>
          post.id === reply.post_id
            ? { ...post, reply_count: post.reply_count + 1 }
            : post,
        ),
      }));
    };
    const onDeleted = ({ id }: { id: string }) =>
      setData((current) => ({
        ...current,
        posts: current.posts.filter((post) => post.id !== id),
      }));
    const onActivity = (event: Activity) =>
      setData((current) => ({
        ...current,
        activity: [
          event,
          ...current.activity.filter((item) => item.id !== event.id),
        ].slice(0, 100),
      }));
    socket.on("community:post", onPost);
    socket.on("community:reply", onReply);
    socket.on("community:post-deleted", onDeleted);
    socket.on("activity:new", onActivity);
    return () => {
      ids.forEach((id) => socket.emit("unwatch", id));
      socket.off("community:post", onPost);
      socket.off("community:reply", onReply);
      socket.off("community:post-deleted", onDeleted);
      socket.off("activity:new", onActivity);
    };
  }, [data.projects, uid]);

  const posts = useMemo(
    () =>
      data.posts.filter(
        (post) => projectId === "all" || post.project_id === projectId,
      ),
    [data.posts, projectId],
  );
  const activity = useMemo(
    () =>
      data.activity.filter(
        (event) => projectId === "all" || event.project_id === projectId,
      ),
    [data.activity, projectId],
  );

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || !selectedProject) return;
    setBusy(true);
    setError("");
    try {
      const post = await api<Post>("/api/community/posts", {
        method: "POST",
        body: JSON.stringify({
          project_id: selectedProject,
          body: draft.trim(),
        }),
      });
      setData((current) => ({
        ...current,
        posts: [post, ...current.posts.filter((item) => item.id !== post.id)],
      }));
      setDraft("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleReaction(post: Post) {
    const result = await api<{ reacted: boolean; reaction_count: number }>(
      `/api/community/posts/${post.id}/reactions`,
      { method: "POST", body: JSON.stringify({ enabled: !post.reacted }) },
    );
    setData((current) => ({
      ...current,
      posts: current.posts.map((item) =>
        item.id === post.id ? { ...item, ...result } : item,
      ),
    }));
  }

  async function showReplies(post: Post) {
    const next = !openReplies[post.id];
    setOpenReplies((current) => ({ ...current, [post.id]: next }));
    if (next && !replies[post.id]) {
      try {
        const result = await api<Reply[]>(
          `/api/community/posts/${post.id}/replies`,
        );
        setReplies((current) => ({ ...current, [post.id]: result }));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  async function reply(post: Post, event: FormEvent) {
    event.preventDefault();
    const body = (replyDrafts[post.id] ?? "").trim();
    if (!body) return;
    try {
      const result = await api<Reply>(
        `/api/community/posts/${post.id}/replies`,
        { method: "POST", body: JSON.stringify({ body }) },
      );
      setReplies((current) => ({
        ...current,
        [post.id]: [
          ...(current[post.id] ?? []).filter((item) => item.id !== result.id),
          result,
        ],
      }));
      setData((current) => ({
        ...current,
        posts: current.posts.map((item) =>
          item.id === post.id
            ? { ...item, reply_count: item.reply_count + 1 }
            : item,
        ),
      }));
      setReplyDrafts((current) => ({ ...current, [post.id]: "" }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removePost(post: Post) {
    if (!window.confirm("Delete this community post?")) return;
    try {
      await api(`/api/community/posts/${post.id}`, { method: "DELETE" });
      setData((current) => ({
        ...current,
        posts: current.posts.filter((item) => item.id !== post.id),
      }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Header />
      <main className="community-wrap">
        <section className="community-hero">
          <div>
            <span className="workspace-overline">YOUR TEAM, IN THE LOOP</span>
            <h1>Community</h1>
            <p>
              Share a win, ask for help, and follow the work happening across
              your projects.
            </p>
          </div>
          <div className="community-hero-mark">✳</div>
        </section>
        {error && (
          <div className="community-error" role="alert">
            <span>{error}</span>
            <div><button onClick={() => { setError(""); setLoading(true); load().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>Try again</button><button onClick={() => setError("")} aria-label="Dismiss">×</button></div>
          </div>
        )}
        {loading ? (
          <section className="community-loading" aria-live="polite"><span className="community-spinner"/><b>Gathering your community…</b><small>Loading project conversations and team updates.</small></section>
        ) : !data.projects.length ? (
          <section className="community-empty">
            <span>✳</span>
            <h2>Your community starts with a project</h2>
            <p>
              Create a project or accept an invitation to start sharing updates
              with your team.
            </p>
            <button className="p" onClick={() => router.push("/projects")}>
              Explore projects
            </button>
          </section>
        ) : (
          <>
            <div className="community-filter">
              <span>Showing conversation in</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="all">All projects</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="community-layout">
              <section className="community-feed">
                <form className="community-composer" onSubmit={publish}>
                  <div className="community-composer-title">
                    <span className="community-avatar">
                      {initials(
                        typeof window === "undefined"
                          ? "You"
                          : (localStorage.getItem("name") ?? "You"),
                      )}
                    </span>
                    <div>
                      <b>Start a conversation</b>
                      <small>
                        Share progress, a question, or a team update.
                      </small>
                    </div>
                  </div>
                  <textarea
                    aria-label="Write a community update"
                    maxLength={4000}
                    placeholder="What’s happening with your team?"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="community-composer-actions">
                    <select
                      aria-label="Choose project"
                      value={selectedProject}
                      onChange={(e) => setSelectedProject(e.target.value)}
                    >
                      {data.projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    <span>{draft.length}/4000</span>
                    <button className="p" disabled={busy || !draft.trim()}>
                      {busy ? "Posting…" : "Post update"} <span>↗</span>
                    </button>
                  </div>
                </form>
                {posts.length === 0 ? (
                  <div className="community-no-posts">
                    <span>◌</span>
                    <b>It’s quiet here so far.</b>
                    <small>Start a conversation and bring your team in.</small>
                  </div>
                ) : (
                  posts.map((post) => (
                    <article className="community-post" key={post.id}>
                      <div className="community-post-head">
                        <span className="community-avatar">
                          {initials(post.author_name || "Team")}
                        </span>
                        <div className="community-post-author">
                          <b>{post.author_name}</b>
                          <small>
                            posted in <strong>{post.project_name}</strong> ·{" "}
                            {when(post.created_at)}
                          </small>
                        </div>
                        {(post.author_id === uid ||
                          ["owner", "admin"].includes(
                            data.projects.find(
                              (project) => project.id === post.project_id,
                            )?.role ?? "",
                          )) && (
                          <button
                            className="community-delete"
                            onClick={() => removePost(post)}
                            title="Delete post"
                            aria-label="Delete post"
                          >
                            •••
                          </button>
                        )}
                      </div>
                      <p className="community-post-body">{post.body}</p>
                      <div className="community-post-actions">
                        <button
                          className={
                            post.reacted
                              ? "community-react is-active"
                              : "community-react"
                          }
                          onClick={() => toggleReaction(post)}
                        >
                          <span>♡</span> Appreciate{" "}
                          <b>{post.reaction_count || ""}</b>
                        </button>
                        <button onClick={() => showReplies(post)}>
                          ◯ Reply <b>{post.reply_count || ""}</b>
                        </button>
                      </div>
                      {openReplies[post.id] && (
                        <div className="community-replies">
                          {(replies[post.id] ?? []).map((item) => (
                            <div className="community-reply" key={item.id}>
                              <span className="community-avatar small">
                                {initials(item.author_name || "Team")}
                              </span>
                              <div>
                                <b>{item.author_name}</b>
                                <p>{item.body}</p>
                                <small>{when(item.created_at)}</small>
                              </div>
                            </div>
                          ))}
                          <form
                            className="community-reply-form"
                            onSubmit={(event) => reply(post, event)}
                          >
                            <input
                              aria-label="Write a reply"
                              placeholder="Write a thoughtful reply…"
                              value={replyDrafts[post.id] ?? ""}
                              onChange={(e) =>
                                setReplyDrafts((current) => ({
                                  ...current,
                                  [post.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              aria-label="Send reply"
                              disabled={!(replyDrafts[post.id] ?? "").trim()}
                            >
                              ↑
                            </button>
                          </form>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </section>
              <aside className="community-sidebar">
                <section className="community-side-card">
                  <div className="community-side-heading">
                    <div>
                      <span className="side-card-kicker">THE PULSE</span>
                      <h2>Team activity</h2>
                    </div>
                    <span className="pulse-dot" />
                  </div>
                  {activity.length === 0 ? (
                    <p className="community-side-empty">
                      Project updates will appear here as your team gets moving.
                    </p>
                  ) : (
                    <div className="community-activity-list">
                      {activity.slice(0, 16).map((event) => (
                        <div className="community-activity" key={event.id}>
                          <span className="activity-avatar">
                            {initials(event.actor_name || "T")}
                          </span>
                          <div>
                            <p>
                              <b>{event.actor_name || "A teammate"}</b>{" "}
                              {event.action.replaceAll(".", " ")}
                              {event.task_title ? (
                                <>
                                  {" "}
                                  <strong>{event.task_title}</strong>
                                </>
                              ) : null}
                            </p>
                            <small>
                              {event.project_name} · {when(event.created_at)}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section className="community-side-card community-team-card">
                  <span className="side-card-kicker">YOUR SPACES</span>
                  <h2>Projects together</h2>
                  {data.projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setProjectId(project.id)}
                      className="community-project-link"
                    >
                      <span className="project-dot purple" />
                      <b>{project.name}</b>
                      <small>{project.role}</small>
                      <span>→</span>
                    </button>
                  ))}
                </section>
              </aside>
            </div>
          </>
        )}
      </main>
    </>
  );
}
