'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/campaigns', label: 'Campaigns' },
  { href: '/dashboard/deposits', label: 'Deposits' },
  { href: '/dashboard/withdrawals', label: 'Withdrawals' },
  { href: '/dashboard/addresses', label: 'Addresses' },
  { href: '/dashboard/treasury', label: 'Treasury' },
  { href: '/dashboard/users', label: 'Users' },
  { href: '/dashboard/referrals', label: 'Referrals' },
  { href: '/dashboard/settings', label: 'Settings' },
  { href: '/dashboard/audit', label: 'Audit' },
];

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      <div className="mobile-bar">
        <strong>SOFTWORK CMS</strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          Menu
        </button>
      </div>
      <div
        className={`sidebar-backdrop${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <h1>SOFTWORK NOVA SUITE</h1>
        <nav>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                path === l.href || (l.href !== '/dashboard' && path.startsWith(l.href))
                  ? 'active'
                  : ''
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 28, padding: '0 8px' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
