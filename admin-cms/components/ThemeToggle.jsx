'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle({ className = '' }) {
  const { theme, toggle, ready } = useTheme();
  if (!ready) {
    return (
      <button type="button" className={`btn btn-outline-secondary btn-sm ${className}`} disabled>
        …
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn btn-outline-secondary btn-sm theme-toggle ${className}`}
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '☀ Light' : '☾ Dark'}
    </button>
  );
}
