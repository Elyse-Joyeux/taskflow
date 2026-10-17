"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import {
  STATUS_LABEL,
  type Priority,
  type Status,
  type Task,
} from "@/lib/types";

type Result = Task & { project_name: string };

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (!getToken()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    try {
      setResults(await api<Result[]>(`/api/search?${params.toString()}`));
    } catch (reason) {
      setError((reason as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (getToken()) void search();
    // Load current workspace tasks once on entry; subsequent searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Header />
      <main className="wrap search-wrap" id="main">
        <section className="search-intro">
          <span className="workspace-overline">FIND THE WORK</span>
          <h1>Search tasks</h1>
          <p>
            Search task titles, descriptions, and tags across the current
            workspace.
          </p>
        </section>
        <form className="search-panel" onSubmit={search}>
          <label className="search-query">
            <span aria-hidden="true">⌕</span>
            <span className="sr-only">Search terms</span>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try a task name, keyword, or tag…"
              maxLength={120}
            />
          </label>
          <label className="search-select">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">Any status</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((key) => (
                <option key={key} value={key}>
                  {STATUS_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="search-select">
            Priority
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="">Any priority</option>
              {(["urgent", "high", "medium", "low"] as Priority[]).map(
                (item) => (
                  <option key={item} value={item}>
                    {item[0].toUpperCase() + item.slice(1)}
                  </option>
                ),
              )}
            </select>
          </label>
          <button
            className="button button-primary search-submit"
            disabled={loading}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        {error && (
          <div className="search-error" role="alert">
            {error}
            <button onClick={() => void search()} type="button">
              Try again
            </button>
          </div>
        )}
        <section className="search-results" aria-live="polite">
          <div className="search-results-heading">
            <h2>
              {loading
                ? "Searching…"
                : searched
                  ? `${results.length} ${results.length === 1 ? "result" : "results"}`
                  : "Results"}
            </h2>
            <span>Workspace data · up to 75 matches</span>
          </div>
          {!loading && searched && results.length === 0 && !error && (
            <div className="search-empty">
              <span>⌕</span>
              <b>No tasks found</b>
              <p>Try another keyword or widen your filters.</p>
            </div>
          )}
          {results.map((task) => (
            <Link
              className="search-result"
              key={task.id}
              href={`/projects/${task.project_id}?task=${task.id}`}
            >
              <span className={`search-status status-${task.status}`}>
                {STATUS_LABEL[task.status]}
              </span>
              <div className="search-result-copy">
                <b>{task.title}</b>
                <p>
                  {task.description ||
                    task.tags?.join(" · ") ||
                    "No description"}
                </p>
                <small>
                  {task.project_name}
                  {task.assignee_name ? ` · ${task.assignee_name}` : ""}
                </small>
              </div>
              <span className={`priority-badge priority-${task.priority}`}>
                {task.priority}
              </span>
              <span className="search-result-arrow">↗</span>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}
