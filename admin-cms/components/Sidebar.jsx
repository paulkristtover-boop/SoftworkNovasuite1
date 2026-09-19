'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const links = [
  ['/', 'Dashboard'],
  ['/deposits', 'Deposits'],
  ['/withdrawals', 'Withdrawals'],
  ['/users', 'Users'],
  ['/ads', 'Ads'],
  ['/addresses', 'Addresses'],
  ['/treasury', 'Treasury'],
  ['/transactions', 'Ledger'],
  ['/ideas', 'Ideas'],
  ['/support', 'Support'],
  ['/fraud', 'Fraud'],
  ['/audit', 'Audit'],
  ['/settings', 'Settings'],
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
      <div className="sidebar-brand">NovaSuite</div>
      <nav>
        {links.map(([href, label]) => (
          <Link key={href} href={href} className={path === href ? 'active' : ''}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-foot">
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={logout}>
          Logout
        </button>
      </div>
    </aside>
  );
}
