import "./globals.css";
import type { ReactNode } from "react";
import { DM_Sans, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppToaster from "@/components/AppToaster";

const bodyFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const headingFont = Manrope({
  subsets: ["latin"],
  variable: "--font-head",
  display: "swap",
});

export const metadata = {
  title: "Taskflow — Focused team project management",
  description: "Plan projects, prioritize tasks, and keep your team moving together in Taskflow.",
};

const themeScript = `
(function() {
  try {
    var savedTheme = localStorage.getItem('taskflow-theme');
    var theme = savedTheme;
    if (!theme || theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <ThemeProvider>
          {children}
          <AppToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
