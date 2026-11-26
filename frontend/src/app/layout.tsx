import "./globals.css";
import type { ReactNode } from "react";
import { DM_Sans, Manrope, Geist } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppToaster from "@/components/AppToaster";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

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
  title: "Taskflow — Project work, in a clearer flow",
  description: "Bring tasks, projects, and team updates together in a calm workspace built for meaningful progress.",
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
    document.documentElement.classList.toggle('dark', theme === 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={cn(bodyFont.variable, headingFont.variable, "font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip-link" href="#content">
          Skip to content
        </a>
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <AppToaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
