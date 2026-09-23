import Link from 'next/link';
import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [
    users,
    bal,
    pd,
    pw,
    adsActive,
    adsPending,
    tb,
    fraud,
    welcomeGranted,
    welcomeLimit,
    recentDep,
    recentWd,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM users`),
    query(`SELECT COALESCE(SUM(balance),0) AS s FROM users`),
    query(`SELECT COUNT(*)::int AS c FROM deposits WHERE status='pending'`),
    query(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE status='pending'`),
    query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='active'`),
    query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='pending'`),
    query(`SELECT value FROM settings WHERE key='treasury_balance'`),
    query(`SELECT COUNT(*)::int AS c FROM fraud_events WHERE created_at > NOW() - INTERVAL '24 hours'`),
    query(`SELECT COUNT(*)::int AS c FROM transactions WHERE type='welcome_bonus'`),
    query(`SELECT value FROM settings WHERE key='welcome_bonus_limit'`),
    query(
      `SELECT d.id, d.amount, d.network, d.user_id, d.created_at, u.username
       FROM deposits d LEFT JOIN users u ON d.user_id = u.telegram_id
       WHERE d.status = 'pending' ORDER BY d.created_at ASC LIMIT 4`
    ),
    query(
      `SELECT w.id, w.amount, w.network, w.user_id, w.created_at, u.username
       FROM withdrawals w LEFT JOIN users u ON w.user_id = u.telegram_id
       WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT 4`
    ),
  ]);

  const limit = parseInt(welcomeLimit.rows[0]?.value || '30', 10);
  const granted = welcomeGranted.rows[0].c;
  const remaining = Math.max(0, limit - granted);
  const actionNeeded = pd.rows[0].c + pw.rows[0].c + adsPending.rows[0].c;

  return (
    <AdminShell title="Dashboard">
      <div className="page-header d-none d-md-block">
        <h2>Operations</h2>
        <p>Queues, balances, and welcome credits — optimized for mobile and desktop.</p>
      </div>

      {actionNeeded > 0 && (
        <div className="panel mb-3" style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
          <div className="panel-header">
            <h3>Needs attention · {actionNeeded}</h3>
            <span className="badge badge-pending">Queue</span>
          </div>
          <div className="panel-body" style={{ padding: '0.75rem 1rem' }}>
            <div className="d-flex flex-wrap gap-2">
              {pd.rows[0].c > 0 && (
                <Link href="/deposits?status=pending" className="btn btn-sm btn-primary">
                  {pd.rows[0].c} deposits
                </Link>
              )}
              {pw.rows[0].c > 0 && (
                <Link href="/withdrawals?status=pending" className="btn btn-sm btn-primary">
                  {pw.rows[0].c} withdrawals
                </Link>
              )}
              {adsPending.rows[0].c > 0 && (
                <Link href="/ads?status=pending" className="btn btn-sm btn-primary">
                  {adsPending.rows[0].c} campaigns
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="cards">
        <Link href="/users" className="card card-accent-sky">
          <div className="label">Users</div>
          <div className="value">{users.rows[0].c}</div>
        </Link>
        <div className="card card-accent-green">
          <div className="label">Balances</div>
          <div className="value">{formatUsd(bal.rows[0].s, 2)}</div>
        </div>
        <Link href="/treasury" className="card card-accent-green">
          <div className="label">Treasury</div>
          <div className="value">{formatUsd(tb.rows[0]?.value || 0, 2)}</div>
        </Link>
        <Link href="/bonuses" className="card card-accent-amber">
          <div className="label">Welcome left</div>
          <div className="value">{remaining}</div>
          <div className="card-hint">{granted}/{limit} granted</div>
        </Link>
        <Link href="/deposits?status=pending" className="card card-accent-amber">
          <div className="label">Deposits</div>
          <div className="value">{pd.rows[0].c}</div>
        </Link>
        <Link href="/withdrawals?status=pending" className="card card-accent-amber">
          <div className="label">Withdrawals</div>
          <div className="value">{pw.rows[0].c}</div>
        </Link>
        <Link href="/ads?status=active" className="card card-accent-sky">
          <div className="label">Live ads</div>
          <div className="value">{adsActive.rows[0].c}</div>
        </Link>
        <Link href="/fraud" className="card card-accent-rose">
          <div className="label">Fraud 24h</div>
          <div className="value">{fraud.rows[0].c}</div>
        </Link>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h3>Deposit queue</h3>
            <Link href="/deposits?status=pending" className="muted" style={{ fontSize: '0.75rem' }}>
              All →
            </Link>
          </div>
          <div className="panel-body">
            {recentDep.rows.length === 0 ? (
              <div className="empty-state">Clear</div>
            ) : (
              recentDep.rows.map((d) => (
                <div className="queue-item" key={d.id}>
                  <div className="qi-main">
                    <div className="qi-title">
                      #{d.id} · {formatUsd(d.amount)}
                    </div>
                    <div className="qi-meta mono">
                      {d.user_id} · {formatDate(d.created_at)}
                    </div>
                  </div>
                  <Link href="/deposits?status=pending" className="btn btn-sm btn-primary">
                    Review
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Withdrawal queue</h3>
            <Link href="/withdrawals?status=pending" className="muted" style={{ fontSize: '0.75rem' }}>
              All →
            </Link>
          </div>
          <div className="panel-body">
            {recentWd.rows.length === 0 ? (
              <div className="empty-state">Clear</div>
            ) : (
              recentWd.rows.map((w) => (
                <div className="queue-item" key={w.id}>
                  <div className="qi-main">
                    <div className="qi-title">
                      #{w.id} · {formatUsd(w.amount)}
                    </div>
                    <div className="qi-meta mono">
                      {w.user_id} · {formatDate(w.created_at)}
                    </div>
                  </div>
                  <Link href="/withdrawals?status=pending" className="btn btn-sm btn-primary">
                    Pay
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
