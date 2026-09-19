'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

export function AdminShell({ title, children, subtitle }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add('sidebar-open');
    } else {
      document.body.classList.remove('sidebar-open');
    }
    return () => document.body.classList.remove('sidebar-open');
  }, [menuOpen]);

  return (
    <div className="layout">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm menu-toggle"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <h1 className="topbar-title mb-0">{title}</h1>
          </div>
          <div className="topbar-meta d-flex align-items-center gap-2">
            <ThemeToggle />
            <span className="pill pill-live d-none d-sm-inline-flex">USDT</span>
            <span className="pill d-none d-md-inline-flex">Operations</span>
          </div>
        </header>

        <div className="page container-fluid px-3 px-lg-4 py-4">
          {subtitle ? (
            <div className="page-header mb-4">
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
