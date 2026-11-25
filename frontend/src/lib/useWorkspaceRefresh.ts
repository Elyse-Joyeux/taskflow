"use client";

import { useEffect } from "react";

/** Re-run workspace-scoped loaders when the sidebar workspace changes. */
export function useWorkspaceRefresh(onChange: () => void) {
  useEffect(() => {
    const handler = () => onChange();
    window.addEventListener("workspace-changed", handler);
    return () => window.removeEventListener("workspace-changed", handler);
  }, [onChange]);
}
