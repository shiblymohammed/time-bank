import { BrandMark } from './icons';

export function AdminLoading({ children }: { children: string }) {
  return (
    <p className="admin-loading" role="status">
      <span className="admin-loading-spinner" aria-hidden="true" />
      {children}
    </p>
  );
}

export function AdminSessionLoading({ theme = 'system' }: { theme?: 'light' | 'dark' | 'system' }) {
  return (
    <main className="admin-loader-screen" data-admin-theme={theme}>
      <div className="admin-loader-card">
        <div className="admin-loader-brand" aria-hidden="true">
          <BrandMark size={34} />
        </div>
        <p className="admin-loader-title">Indian Time Bank</p>
        <AdminLoading>Checking your session…</AdminLoading>
      </div>
    </main>
  );
}
