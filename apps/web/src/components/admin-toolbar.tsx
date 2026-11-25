'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ADMIN_THEME_KEY } from '@/lib/admin-theme';
import { Icon, type IconName } from './icons';

type Theme = 'light' | 'dark';

export function useAdminTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    function update() {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(ADMIN_THEME_KEY);
      } catch {
        // The system theme is available even when local storage is blocked.
      }
      setTheme(saved === 'light' || saved === 'dark' ? saved : media.matches ? 'dark' : 'light');
    }
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function changeTheme(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(ADMIN_THEME_KEY, next);
    } catch {
      // Keep the current theme for this session.
    }
  }

  return [theme, changeTheme] as const;
}

export function AdminThemeButton({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} mode`;
  return (
    <button type="button" className="admin-control admin-icon-control admin-theme-control" title={label} aria-label={label} onClick={() => onChange(next)}>
      <Icon name={next === 'dark' ? 'moon' : 'sun'} />
    </button>
  );
}

export function AdminPageSearch<T extends string>({
  pages, disabled, onSelect,
}: {
  pages: { id: T; text: string; icon: IconName }[];
  disabled: boolean;
  onSelect: (id: T) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const matches = pages.filter((page) => page.text.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (disabled) return;
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === '/') {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [disabled]);

  function select(id: T) {
    setQuery('');
    setOpen(false);
    input.current?.focus();
    onSelect(id);
  }

  return (
    <div
      className="admin-page-search"
      role="search"
      aria-label="Dashboard pages"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        input.current?.focus();
        setOpen(false);
      }}
    >
      <div className="admin-search-field">
        <Icon name="search" size={16} />
        <input
          type="search"
          ref={input}
          aria-label="Find a dashboard page"
          placeholder="Search (Ctrl+/)"
          aria-keyshortcuts="Control+/ Meta+/"
          disabled={disabled}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !open || !matches[0]) return;
            event.preventDefault();
            select(matches[0].id);
          }}
        />
      </div>
      {open && !disabled && (
        <div className="admin-search-results">
          {matches.length ? (
            <ul>
              {matches.map((page) => (
                <li key={page.id}>
                  <button type="button" onClick={() => select(page.id)}>
                    <Icon name={page.icon} size={16} /> {page.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p role="status">No matching pages.</p>}
        </div>
      )}
    </div>
  );
}

export function AdminProfileDropdown({
  role, phone, pending, onSignOut,
}: {
  role: string;
  phone: string | undefined;
  pending: boolean;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const dropdownId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div className="admin-profile" ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (!open || event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }}
    >
      <button
        type="button"
        className="admin-profile-avatar"
        ref={trigger}
        aria-label="Admin profile"
        title="Admin profile"
        aria-expanded={open}
        aria-controls={dropdownId}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="user" size={18} />
      </button>
      <div className="admin-profile-dropdown" id={dropdownId} hidden={!open}>
        <div className="admin-profile-identity">
          <strong>{role}</strong>
          {phone && <span>{phone}</span>}
        </div>
        <button type="button" className="admin-profile-sign-out" disabled={pending} onClick={onSignOut}>
          <Icon name="logout" size={16} />
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}
