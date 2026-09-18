'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/users', label: 'Users' },
  { href: '/deposits', label: 'Deposits' },
  { href: '/withdrawals', label: 'Withdrawals' },
  { href: '/ads', label: 'Ads' },
  { href: '/addresses', label: 'Payment Addresses' },
  { href: '/treasury', label: 'Treasury' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/ideas', label: 'Ideas' },
  { href: '/support', label: 'Support' },
  { href: '/audit', label: 'Audit Logs' },
  { href: '/settings', label: 'Settings' },
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
        <span>NovaSuite</span>
      </div>
      <nav>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
            <span>{l.label}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout} style={{ width: '100%' }}>
          Logout
        </button>
      </div>
    </aside>
  );
}
