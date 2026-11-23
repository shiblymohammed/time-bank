import type { Metadata } from 'next';
import { ADMIN_THEME_KEY } from '@/lib/admin-theme';
import './globals.css';
import './admin-overview.css';

export const metadata: Metadata = {
  title: {
    default: 'Indian Time Bank — Central Admin & Civic Dashboards',
    template: '%s | Indian Time Bank',
  },
  description:
    'Indian Time Bank central administration, multi-organization governance, and civic time banking dashboards.',
  robots: {
    index: false,
    follow: false,
  },
};

// Apply the stored theme before the session loader is painted.
const prepareLoaderTheme = `try {
  const theme = localStorage.getItem(${JSON.stringify(ADMIN_THEME_KEY)});
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.adminStartupTheme = theme;
} catch {}`;

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prepareLoaderTheme }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <div className="bg-mesh" />
        {children}
      </body>
    </html>
  );
}
