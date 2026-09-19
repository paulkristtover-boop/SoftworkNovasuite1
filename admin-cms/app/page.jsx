import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function DashboardPage() {
  const [users, bal, pd, pw, ads, tb, fraud] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM users`),
    query(`SELECT COALESCE(SUM(balance),0) AS s FROM users`),
    query(`SELECT COUNT(*)::int AS c FROM deposits WHERE status='pending'`),
    query(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE status='pending'`),
    query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='active'`),
    query(`SELECT value FROM settings WHERE key='treasury_balance'`),
    query(`SELECT COUNT(*)::int AS c FROM fraud_events WHERE created_at > NOW() - INTERVAL '24 hours'`),
  ]);
  return (
    <AdminShell title="Dashboard">
      <div className="cards">
        <div className="card"><div className="label">Users</div><div className="value">{users.rows[0].c}</div></div>
        <div className="card"><div className="label">Balances</div><div className="value">{formatUsd(bal.rows[0].s, 2)}</div></div>
        <div className="card"><div className="label">Pending Deposits</div><div className="value">{pd.rows[0].c}</div></div>
        <div className="card"><div className="label">Pending Withdrawals</div><div className="value">{pw.rows[0].c}</div></div>
        <div className="card"><div className="label">Active Ads</div><div className="value">{ads.rows[0].c}</div></div>
        <div className="card"><div className="label">Treasury</div><div className="value">{formatUsd(tb.rows[0]?.value || 0, 2)}</div></div>
        <div className="card"><div className="label">Fraud (24h)</div><div className="value">{fraud.rows[0].c}</div></div>
      </div>
      <p className="muted">Complete deposit review checklist before approving. Bot notifies admins on Telegram.</p>
    </AdminShell>
  );
}
