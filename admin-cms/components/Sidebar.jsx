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

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">NS</div>
        <div className="brand-text">
          <strong>NovaSuite</strong>
          <span>Admin CMS</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {sections.map((sec) => (
          <div key={sec.label}>
            <div className="sidebar-section">{sec.label}</div>
            <nav>
              {sec.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={path === item.href ? 'active' : ''}
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
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={logout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
