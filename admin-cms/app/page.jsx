import Link from 'next/link';
import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [users, bal, pd, pw, ads, pendingAds, tb, fraud, recentDep, recentWd, recentUsers] =
    await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM users`),
      query(`SELECT COALESCE(SUM(balance),0) AS s FROM users`),
      query(`SELECT COUNT(*)::int AS c FROM deposits WHERE status='pending'`),
      query(`SELECT COUNT(*)::int AS c FROM withdrawals WHERE status='pending'`),
      query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='active'`),
      query(`SELECT COUNT(*)::int AS c FROM ads WHERE status='pending'`),
      query(`SELECT value FROM settings WHERE key='treasury_balance'`),
      query(
        `SELECT COUNT(*)::int AS c FROM fraud_events WHERE created_at > NOW() - INTERVAL '24 hours'`
      ),
      query(
        `SELECT d.id, d.amount, d.network, d.user_id, d.created_at, u.username
         FROM deposits d LEFT JOIN users u ON d.user_id = u.telegram_id
         WHERE d.status = 'pending' ORDER BY d.created_at ASC LIMIT 5`
      ),
      query(
        `SELECT w.id, w.amount, w.network, w.user_id, w.created_at, u.username
         FROM withdrawals w LEFT JOIN users u ON w.user_id = u.telegram_id
         WHERE w.status = 'pending' ORDER BY w.created_at ASC LIMIT 5`
      ),
      query(
        `SELECT telegram_id, username, first_name, balance, created_at
         FROM users ORDER BY created_at DESC LIMIT 6`
      ),
    ]);

  const pendingDep = pd.rows[0].c;
  const pendingWd = pw.rows[0].c;
  const actionNeeded = pendingDep + pendingWd + pendingAds.rows[0].c;

  return (
    <AdminShell title="Dashboard">
      <div className="page-header">
        <h2>Operations overview</h2>
        <p>
          Shared Postgres with the Telegram bot. Review deposits with the checklist, pay withdrawals from the Trust
          wallet, then mark them paid.
        </p>
      </div>

      <div className="cards">
        <Link href="/users" className="card card-accent-sky">
          <div className="label">Users</div>
          <div className="value">{users.rows[0].c}</div>
          <div className="card-hint">Registered accounts</div>
        </Link>
        <div className="card card-accent-green">
          <div className="label">User balances</div>
          <div className="value">{formatUsd(bal.rows[0].s, 2)}</div>
          <div className="card-hint">Total available USDT</div>
        </div>
        <Link href="/deposits?status=pending" className="card card-accent-amber">
          <div className="label">Pending deposits</div>
          <div className="value">{pendingDep}</div>
          <div className="card-hint">Awaiting review</div>
        </Link>
        <Link href="/withdrawals?status=pending" className="card card-accent-amber">
          <div className="label">Pending withdrawals</div>
          <div className="value">{pendingWd}</div>
          <div className="card-hint">Awaiting payout</div>
        </Link>
        <Link href="/ads?status=pending" className="card card-accent-amber">
          <div className="label">Ads to review</div>
          <div className="value">{pendingAds.rows[0].c}</div>
          <div className="card-hint">Pending approval</div>
        </Link>
        <Link href="/ads?status=active" className="card card-accent-sky">
          <div className="label">Active campaigns</div>
          <div className="value">{ads.rows[0].c}</div>
          <div className="card-hint">Live ads</div>
        </Link>
        <Link href="/treasury" className="card card-accent-green">
          <div className="label">Treasury</div>
          <div className="value">{formatUsd(tb.rows[0]?.value || 0, 2)}</div>
          <div className="card-hint">Operator balance</div>
        </Link>
        <Link href="/fraud" className="card card-accent-rose">
          <div className="label">Fraud (24h)</div>
          <div className="value">{fraud.rows[0].c}</div>
          <div className="card-hint">Recent events</div>
        </Link>
      </div>

      {actionNeeded > 0 && (
        <div
          className="panel"
          style={{ marginBottom: '1.5rem', borderColor: 'rgba(245, 158, 11, 0.35)' }}
        >
          <div className="panel-header">
            <h3>Action required · {actionNeeded} item{actionNeeded === 1 ? '' : 's'}</h3>
            <span className="badge badge-pending">Queue</span>
          </div>
          <div className="panel-body" style={{ padding: '0.85rem 1.15rem' }}>
            <p className="muted" style={{ marginBottom: 0 }}>
              {pendingDep > 0 && (
                <>
                  <Link href="/deposits?status=pending" style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>
                    {pendingDep} deposit{pendingDep === 1 ? '' : 's'}
                  </Link>
                  {' need review. '}
                </>
              )}
              {pendingWd > 0 && (
                <>
                  <Link href="/withdrawals?status=pending" style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>
                    {pendingWd} withdrawal{pendingWd === 1 ? '' : 's'}
                  </Link>
                  {' need payout. '}
                </>
              )}
              {pendingAds.rows[0].c > 0 && (
                <>
                  <Link href="/ads?status=pending" style={{ color: 'var(--accent-hover)', fontWeight: 600 }}>
                    {pendingAds.rows[0].c} campaign{pendingAds.rows[0].c === 1 ? '' : 's'}
                  </Link>
                  {' need review.'}
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="panel">
          <div className="panel-header">
            <h3>Deposit queue</h3>
            <Link href="/deposits?status=pending" className="muted" style={{ fontSize: '0.75rem' }}>
              View all →
            </Link>
          </div>
          <div className="panel-body">
            {recentDep.rows.length === 0 ? (
              <div className="empty-state">No pending deposits</div>
            ) : (
              recentDep.rows.map((d) => (
                <div className="queue-item" key={d.id}>
                  <div className="qi-main">
                    <div className="qi-title">
                      #{d.id} · {formatUsd(d.amount)} · {d.network}
                    </div>
                    <div className="qi-meta mono">
                      {d.user_id} @{d.username || '—'} · {formatDate(d.created_at)}
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
              View all →
            </Link>
          </div>
          <div className="panel-body">
            {recentWd.rows.length === 0 ? (
              <div className="empty-state">No pending withdrawals</div>
            ) : (
              recentWd.rows.map((w) => (
                <div className="queue-item" key={w.id}>
                  <div className="qi-main">
                    <div className="qi-title">
                      #{w.id} · {formatUsd(w.amount)} · {w.network}
                    </div>
                    <div className="qi-meta mono">
                      {w.user_id} @{w.username || '—'} · {formatDate(w.created_at)}
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

      <div className="panel">
        <div className="panel-header">
          <h3>Recent users</h3>
          <Link href="/users" className="muted" style={{ fontSize: '0.75rem' }}>
            Manage →
          </Link>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Balance</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.rows.map((u) => (
                <tr key={u.telegram_id}>
                  <td className="mono">{u.telegram_id}</td>
                  <td>
                    @{u.username || '—'}{' '}
                    <span className="muted">{u.first_name || ''}</span>
                  </td>
                  <td>{formatUsd(u.balance)}</td>
                  <td className="muted">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
