'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const sections = [
  {
    label: 'Overview',
    items: [{ href: '/', label: 'Dashboard', icon: '◈' }],
  },
  {
    label: 'Finance',
    items: [
      { href: '/deposits', label: 'Deposits', icon: '↓' },
      { href: '/withdrawals', label: 'Withdrawals', icon: '↑' },
      { href: '/treasury', label: 'Treasury', icon: '◆' },
      { href: '/transactions', label: 'Ledger', icon: '☰' },
      { href: '/addresses', label: 'Addresses', icon: '◇' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { href: '/users', label: 'Users', icon: '◎' },
      { href: '/ads', label: 'Campaigns', icon: '▣' },
      { href: '/bonuses', label: 'Bonuses', icon: '🎁' },
    ],
  },
  {
    label: 'Ops',
    items: [
      { href: '/support', label: 'Support', icon: '✉' },
      { href: '/ideas', label: 'Ideas', icon: '✦' },
      { href: '/fraud', label: 'Fraud', icon: '⚠' },
      { href: '/audit', label: 'Audit', icon: '◉' },
      { href: '/settings', label: 'Settings', icon: '⚙' },
    ],
  },
];

export function Sidebar({ open, onClose }) {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function handleNav() {
    if (typeof window !== 'undefined' && window.innerWidth < 992) {
      onClose?.();
    }
  }

  return (
    <>
      <div
        className={`sidebar-backdrop ${open ? 'show' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside className={`sidebar ${open ? 'open' : ''}`} id="adminSidebar">
        <div className="sidebar-brand">
          <div className="d-flex align-items-center gap-2">
            <div className="logo">NS</div>
            <div className="brand-text">
              <strong>NovaSuite</strong>
              <span>Admin CMS</span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary sidebar-close d-lg-none"
            onClick={onClose}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <div className="sidebar-scroll">
          {sections.map((sec) => (
            <div key={sec.label}>
              <div className="sidebar-section">{sec.label}</div>
              <nav className="nav flex-column px-2">
                {sec.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link sidebar-link ${path === item.href ? 'active' : ''}`}
                    onClick={handleNav}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <button type="button" className="btn btn-outline-secondary btn-sm w-100" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
