'use client';

import { Suspense, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { Flash } from './Flash';

export function AdminShell({ title, children, subtitle }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) document.body.classList.add('sidebar-open');
    else document.body.classList.remove('sidebar-open');
    return () => document.body.classList.remove('sidebar-open');
  }, [menuOpen]);

  return (
    <div className="layout">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <div className="d-flex align-items-center gap-2 min-w-0">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm menu-toggle"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <h1 className="topbar-title mb-0 text-truncate">{title}</h1>
          </div>
          <div className="topbar-meta d-flex align-items-center gap-2 flex-shrink-0">
            <ThemeToggle />
            <span className="pill pill-live d-none d-sm-inline-flex">USDT</span>
          </div>
        </header>

        <div className="page container-fluid px-3 px-md-4 py-3 py-md-4">
          <Suspense fallback={null}>
            <Flash />
          </Suspense>
          {subtitle ? (
            <div className="page-header mb-3 mb-md-4">
              <h2 className="h4 mb-1">{title}</h2>
              <p className="text-muted mb-0">{subtitle}</p>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
