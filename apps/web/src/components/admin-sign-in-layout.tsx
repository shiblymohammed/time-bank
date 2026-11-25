import type { ReactNode } from 'react';
import { Icon } from './icons';

type Theme = 'light' | 'dark';

export function AdminSignInLayout({
  theme,
  onThemeChange,
  children,
}: {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  children: ReactNode;
}) {
  return (
    <main className="admin-login" data-admin-theme={theme}>
      <div className="admin-login-theme" role="group" aria-label="Appearance">
        <button type="button" aria-label="Light mode" aria-pressed={theme === 'light'} onClick={() => onThemeChange('light')}>
          <Icon name="sun" size={18} />
        </button>
        <button type="button" aria-label="Dark mode" aria-pressed={theme === 'dark'} onClick={() => onThemeChange('dark')}>
          <Icon name="moon" size={18} />
        </button>
      </div>
      <div className="admin-login-card">
        <section className="admin-login-form" aria-labelledby="admin-login-title">
          <div className="admin-login-brand">
            <span className="admin-login-mark"><Icon name="clock" size={23} /></span>
            <span>Time Bank</span>
          </div>
          {children}
          <p className="admin-login-help">Need help signing in? Contact your administrator.</p>
        </section>

        <aside className="admin-login-intro" aria-labelledby="admin-login-intro-title">
          <h2 id="admin-login-intro-title">Manage your time bank in one place</h2>
          <ul className="admin-login-features">
            <li className="admin-login-feature-primary">
              <Icon name="requests" size={24} />
              <div><strong>Requests &amp; matching</strong><span>Coordinate service requests and volunteer assignments.</span></div>
            </li>
            <li><Icon name="memberships" size={18} /><strong>Memberships</strong></li>
            <li><Icon name="reports" size={18} /><strong>Reports</strong></li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
export function AdminLoginButton({
  children, working, disabled, onClick, secondary = false,
}: {
  children: ReactNode;
  working?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      className={secondary ? 'btn btn-secondary' : 'btn btn-primary'}
      disabled={disabled || working}
      aria-busy={working || undefined}
      onClick={onClick}
    >
      <span aria-live="polite">{children}</span>
      {working ? <span className="admin-login-spinner" aria-hidden="true" /> :
        !secondary && <Icon name="arrowRight" size={18} />}
    </button>
  );
}

export function AdminLoginAlert({ children }: { children: ReactNode }) {
  return (
    <div className="admin-login-alert" role="alert">
      <Icon name="complaints" size={18} />
      <span>{children}</span>
    </div>
  );
}
