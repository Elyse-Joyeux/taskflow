import './globals.css'
import type { ReactNode } from 'react'


export const metadata = {
  title: "Taskflow",
  description: "Plan projects and work together",
};

export default function RootLayout({ children }: { children: ReactNode}) {
  return (
    <html lang='en'>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <div id="content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
