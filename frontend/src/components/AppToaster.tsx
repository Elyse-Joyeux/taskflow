"use client";

import { Toaster } from "sonner";
import { useTheme } from "@/components/ThemeProvider";

export default function AppToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      theme={resolvedTheme}
      toastOptions={{
        className: "tf-toast",
      }}
    />
  );
}
