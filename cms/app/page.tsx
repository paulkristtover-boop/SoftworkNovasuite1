import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd } from '@/lib/format';

export const dynamic = 'force-dynamic';

async function getStats() {
  const [users, bal, pendDep, pendWd, ads, treasury] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM users`),
    query(`SELECT COALESCE(SUM(balance),0) AS s FROM users`),
    query(`SELECT COUNT(*)::int AS c FROM deposits WHERE status='pending'`),
    query(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE status='pending'`),
    query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='active'`),
    query(`SELECT value FROM settings WHERE key='treasury_balance'`),
  ]);
  return {
    users: users.rows[0].c,
    balances: bal.rows[0].s,
    pendingDeposits: pendDep.rows[0].c,
    pendingWithdrawals: pendWd.rows[0].c,
    activeAds: ads.rows[0].c,
    treasury: treasury.rows[0]?.value || '0',
  };
}

export default async function DashboardPage() {
  const s = await getStats();
  return (
    <AdminShell title="Dashboard">
      <div className="cards">
        <div className="card"><div className="label">Users</div><div className="value">{s.users}</div></div>
        <div className="card"><div className="label">User Balances</div><div className="value">{formatUsd(s.balances, 2)}</div></div>
        <div className="card"><div className="label">Pending Deposits</div><div className="value">{s.pendingDeposits}</div></div>
        <div className="card"><div className="label">Pending Withdrawals</div><div className="value">{s.pendingWithdrawals}</div></div>
        <div className="card"><div className="label">Active Ads</div><div className="value">{s.activeAds}</div></div>
        <div className="card"><div className="label">Treasury</div><div className="value">{formatUsd(s.treasury, 2)}</div></div>
      </div>
      <p className="muted">
        Manage deposits, withdrawals, payment addresses, and treasury from the sidebar.
        The Telegram bot sends real-time notifications to admin IDs for new requests.
      </p>
    </AdminShell>
  );
}
