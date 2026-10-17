"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import { api, getToken } from "@/lib/api";
import { STATUS_LABEL, type Priority, type Status } from "@/lib/types";

type CalTask = {
  id: string;
  title: string;
  status: Status;
  priority: Priority;
  due_date: string | null;
  start_date: string | null;
  project_id: string;
  project_name: string;
  assignee_name: string | null;
};

const PRIORITY_COLOR: Record<Priority, string> = {
  urgent: "#ef4444",
  high:   "#f97316",
  medium: "#6366f1",
  low:    "#22c55e",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function CalendarPage() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [tasks, setTasks]  = useState<CalTask[]>([]);
  const [error, setError]  = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // selected day isoDate

  function calStart(y: number, m: number) {
    const first = new Date(y, m, 1);
    return new Date(y, m, 1 - first.getDay());
  }

  useEffect(() => {
    if (!getToken()) { router.replace("/login"); return; }
    const from = isoDate(calStart(year, month));
    const to   = isoDate(new Date(year, month + 1, 6));
    setLoading(true);
    api<CalTask[]>(`/api/calendar?from=${from}&to=${to}`)
      .then(setTasks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month, router]);

  function prev() { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); }
  function next() { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); }

  // Build 6-week grid
  const start = calStart(year, month);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));

  function tasksOn(day: Date) {
    const iso = isoDate(day);
    return tasks.filter((t) => t.due_date?.slice(0,10) === iso || t.start_date?.slice(0,10) === iso);
  }

  const selectedTasks = selected ? tasks.filter((t) => t.due_date?.slice(0,10) === selected || t.start_date?.slice(0,10) === selected) : [];

  return (
    <>
      <Header />
      <main className="wrap calendar-wrap" id="main">
        <div className="workspace-intro">
          <div>
            <span className="workspace-overline">SCHEDULE</span>
            <h1>Calendar</h1>
            <p>All tasks with start or due dates across your projects.</p>
          </div>
          <Link className="button button-primary" href="/projects">Open projects <span>↗</span></Link>
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}

        <div className="calendar-shell">
          <div className="calendar-header">
            <button className="cal-nav" onClick={prev} aria-label="Previous month">‹</button>
            <h2>{MONTHS[month]} {year}</h2>
            <button className="cal-nav" onClick={next} aria-label="Next month">›</button>
            <button className="button button-quiet" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(null); }}>Today</button>
          </div>

          {loading && <p className="mut" style={{ textAlign: "center", padding: "20px" }}>Loading…</p>}

          <div className="cal-grid" aria-label={`Calendar for ${MONTHS[month]} ${year}`}>
            {DAYS.map((d) => <div key={d} className="cal-day-header">{d}</div>)}
            {cells.map((day) => {
              const iso = isoDate(day);
              const dayTasks = tasksOn(day);
              const isToday = iso === isoDate(today);
              const isCurrentMonth = day.getMonth() === month;
              const isSelected = iso === selected;
              return (
                <div
                  key={iso}
                  className={`cal-cell${isToday ? " cal-today" : ""}${!isCurrentMonth ? " cal-other-month" : ""}${isSelected ? " cal-selected" : ""}`}
                  onClick={() => setSelected(isSelected ? null : iso)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${MONTHS[day.getMonth()]} ${day.getDate()}, ${dayTasks.length} tasks`}
                  onKeyDown={(e) => e.key === "Enter" && setSelected(isSelected ? null : iso)}
                >
                  <span className="cal-date">{day.getDate()}</span>
                  <div className="cal-task-pills">
                    {dayTasks.slice(0, 3).map((t) => (
                      <Link
                        key={t.id}
                        href={`/projects/${t.project_id}?task=${t.id}`}
                        className="cal-task-pill"
                        style={{ borderLeftColor: PRIORITY_COLOR[t.priority] }}
                        onClick={(e) => e.stopPropagation()}
                        title={`${t.title} · ${STATUS_LABEL[t.status]}`}
                      >
                        {t.title}
                      </Link>
                    ))}
                    {dayTasks.length > 3 && <span className="cal-more">+{dayTasks.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Day detail panel ── */}
        {selected && selectedTasks.length > 0 && (
          <section className="cal-detail settings-card">
            <div className="task-section-heading">
              <h3>
                {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </h3>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close day detail">×</button>
            </div>
            {selectedTasks.map((t) => (
              <Link key={t.id} className="cal-detail-task" href={`/projects/${t.project_id}?task=${t.id}`}>
                <span className="cal-detail-dot" style={{ background: PRIORITY_COLOR[t.priority] }} />
                <div>
                  <b>{t.title}</b>
                  <small>{t.project_name}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</small>
                </div>
                <span className={`priority-badge priority-${t.priority}`}>{t.priority}</span>
                <span className={`search-status status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </Link>
            ))}
          </section>
        )}
        {selected && selectedTasks.length === 0 && (
          <p className="mut" style={{ textAlign: "center", padding: "12px" }}>No tasks on this day.</p>
        )}
      </main>
    </>
  );
}
