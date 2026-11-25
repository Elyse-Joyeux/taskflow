"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { api, getWorkspaceId, setWorkspaceId } from "@/lib/api";
import { useTheme } from "@/components/ThemeProvider";
import type { Task, Workspace } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

interface SearchTask extends Task {
  project_name?: string;
}

interface PaletteItem {
  id: string;
  label: string;
  sublabel?: string;
  category: string;
  icon: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [searchResults, setSearchResults] = useState<SearchTask[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      api<Workspace[]>("/api/workspaces")
        .then(setWorkspaces)
        .catch(() => {});
      setQuery("");
      setSelectedIndex(0);
      setSearchResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [open]);

  // Debounced search for tasks when query changes
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timeout = setTimeout(() => {
      api<SearchTask[]>(`/api/search?q=${encodeURIComponent(term)}`)
        .then((items) => {
          setSearchResults(items.slice(0, 8));
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 200);

    return () => clearTimeout(timeout);
  }, [query, open]);

  // Build navigation & action items
  const navItems = [
    { id: "nav-projects", label: "Projects", category: "Navigation", icon: "▦", run: () => router.push("/projects") },
    { id: "nav-mytasks", label: "My tasks", category: "Navigation", icon: "✓", run: () => router.push("/my-tasks") },
    { id: "nav-calendar", label: "Calendar", category: "Navigation", icon: "◷", run: () => router.push("/calendar") },
    { id: "nav-dashboard", label: "Dashboard", category: "Navigation", icon: "◫", run: () => router.push("/dashboard") },
    { id: "nav-analytics", label: "Analytics", category: "Navigation", icon: "▲", run: () => router.push("/analytics") },
    { id: "nav-search", label: "Search tasks", category: "Navigation", icon: "⌕", run: () => router.push("/search") },
    { id: "nav-community", label: "Community", category: "Navigation", icon: "✦", run: () => router.push("/community") },
    { id: "nav-automations", label: "Automations", category: "Navigation", icon: "⚡", run: () => router.push("/automations") },
    { id: "nav-settings", label: "Account settings", category: "Navigation", icon: "⚙", run: () => router.push("/settings") },
    { id: "nav-profile", label: "My profile", category: "Navigation", icon: "◉", run: () => router.push("/profile") },
  ];

  const actionItems = [
    {
      id: "act-new-task",
      label: "New task (focus composer)",
      category: "Actions",
      icon: "＋",
      run: () => {
        const composer = document.querySelector<HTMLInputElement>(".col input, .workspace-create input");
        if (composer) {
          composer.focus();
        } else {
          router.push("/projects");
        }
      },
    },
    {
      id: "act-focus-search",
      label: "Focus board search",
      category: "Actions",
      icon: "⌕",
      run: () => {
        const searchInput = document.querySelector<HTMLInputElement>(".board-search input, .search-form input");
        if (searchInput) {
          searchInput.focus();
        } else {
          router.push("/search");
        }
      },
    },
    {
      id: "act-theme-light",
      label: `Switch theme to Light ${theme === "light" ? "✓" : ""}`,
      category: "Preferences",
      icon: "☼",
      run: () => setTheme("light"),
    },
    {
      id: "act-theme-dark",
      label: `Switch theme to Dark ${theme === "dark" ? "✓" : ""}`,
      category: "Preferences",
      icon: "☽",
      run: () => setTheme("dark"),
    },
    {
      id: "act-theme-system",
      label: `Switch theme to System ${theme === "system" ? "✓" : ""}`,
      category: "Preferences",
      icon: "◐",
      run: () => setTheme("system"),
    },
  ];

  const workspaceItems = workspaces.map((w) => ({
    id: `ws-${w.id}`,
    label: `Switch workspace: ${w.name}`,
    category: "Workspaces",
    icon: "▦",
    run: () => {
      setWorkspaceId(w.id);
    },
  }));

  const taskItems = searchResults.map((t) => ({
    id: `task-${t.id}`,
    label: t.title,
    sublabel: `${t.project_name || "Project"} · ${t.status}`,
    category: "Tasks",
    icon: "✓",
    run: () => {
      if (t.project_id) {
        router.push(`/projects/${t.project_id}?task=${t.id}`);
      }
    },
  }));

  // Filter items by query
  const lower = query.trim().toLowerCase();
  const allFilteredItems: PaletteItem[] = [
    ...taskItems,
    ...navItems.filter((i) => !lower || i.label.toLowerCase().includes(lower)),
    ...actionItems.filter((i) => !lower || i.label.toLowerCase().includes(lower)),
    ...workspaceItems.filter((i) => !lower || i.label.toLowerCase().includes(lower)),
  ];

  const handleSelect = useCallback(
    (item: (typeof allFilteredItems)[0]) => {
      onClose();
      item.run();
    },
    [onClose]
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (allFilteredItems.length ? (prev + 1) % allFilteredItems.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        allFilteredItems.length ? (prev - 1 + allFilteredItems.length) % allFilteredItems.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allFilteredItems[selectedIndex]) {
        handleSelect(allFilteredItems[selectedIndex]);
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="palette-backdrop" onClick={onClose}>
          <motion.div
            className="palette-dialog"
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="palette-search-row">
              <span className="palette-search-icon">⌕</span>
              <input
                ref={inputRef}
                className="palette-input"
                placeholder="Type a command or search tasks…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-autocomplete="list"
              />
              <kbd className="palette-kbd">ESC</kbd>
            </div>

            <div className="palette-list" role="listbox">
              {searching && (
                <div className="palette-loading">
                  <span>Searching tasks…</span>
                </div>
              )}

              {allFilteredItems.length === 0 && !searching && (
                <div className="palette-empty">
                  <span>No matching commands or tasks found</span>
                </div>
              )}

              {allFilteredItems.map((item, index) => {
                const isSelected = index === selectedIndex;
                const prev = allFilteredItems[index - 1];
                const showCategory = !prev || prev.category !== item.category;

                return (
                  <React.Fragment key={item.id}>
                    {showCategory && (
                      <div className="palette-category-label">{item.category}</div>
                    )}
                    <div
                      className={`palette-item ${isSelected ? "palette-item-selected" : ""}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className="palette-item-icon">{item.icon}</span>
                      <div className="palette-item-copy">
                        <span className="palette-item-label">{item.label}</span>
                        {Boolean(item.sublabel) && (
                          <small className="palette-item-sublabel">{item.sublabel}</small>
                        )}
                      </div>
                      <span className="palette-item-arrow">↵</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="palette-footer">
              <span>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate</span>
              <span><kbd>↵</kbd> to select</span>
              <span><kbd>ESC</kbd> to close</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
