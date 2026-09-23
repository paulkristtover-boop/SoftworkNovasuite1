import * as data from '../../lib/data';
import { money } from '../../lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const s = await data.getDashboard();
  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Overview of SoftworkNovaSuite PTC operations</p>

      <div className="cards">
        <div className="card">
          <div className="label">Trust wallet</div>
          <div className="value">{money(s.trust_balance)}</div>
        </div>
        <div className="card">
          <div className="label">Pending campaigns</div>
          <div className="value" style={{ color: 'var(--yellow)' }}>{s.pending_campaigns || 0}</div>
        </div>
        <div className="card">
          <div className="label">Pending deposits</div>
          <div className="value" style={{ color: 'var(--yellow)' }}>{s.pending_deps}</div>
        </div>
        <div className="card">
          <div className="label">Pending withdrawals</div>
          <div className="value" style={{ color: 'var(--yellow)' }}>{s.pending_wds}</div>
        </div>
        <div className="card">
          <div className="label">Users</div>
          <div className="value">{s.users_count}</div>
        </div>
        <div className="card">
          <div className="label">User balances</div>
          <div className="value">{money(s.user_balances)}</div>
        </div>
      </div>

      <div className="quick-links">
        <Link href="/dashboard/campaigns" className="btn btn-primary">Review campaigns</Link>
        <Link href="/dashboard/deposits" className="btn btn-ghost">Deposits</Link>
        <Link href="/dashboard/withdrawals" className="btn btn-ghost">Withdrawals</Link>
        <Link href="/dashboard/referrals" className="btn btn-ghost">Referrals</Link>
        <Link href="/dashboard/settings" className="btn btn-ghost">Settings</Link>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        Pay withdrawals manually from your Trust Wallet, then mark them paid.
        Campaign budgets are locked from advertiser balances until spent or refunded.
      </p>
    </>
  );
}
