import * as data from '../../lib/data';
import { money } from '../../lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const s = await data.getDashboard();
  const pending =
    Number(s.pending_deps || 0) +
    Number(s.pending_wds || 0) +
    Number(s.pending_campaigns || 0);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">
        SoftworkNovaSuite · {pending > 0 ? `${pending} items need review` : 'All clear'}
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Trust wallet</div>
          <div className="value">{money(s.trust_balance)}</div>
        </div>
        <div className="card">
          <div className="label">Pending campaigns</div>
          <div className="value" style={{ color: Number(s.pending_campaigns) ? 'var(--yellow)' : undefined }}>
            {s.pending_campaigns ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="label">Pending deposits</div>
          <div className="value" style={{ color: Number(s.pending_deps) ? 'var(--yellow)' : undefined }}>
            {s.pending_deps ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="label">Pending withdrawals</div>
          <div className="value" style={{ color: Number(s.pending_wds) ? 'var(--yellow)' : undefined }}>
            {s.pending_wds ?? 0}
          </div>
        </div>
        <div className="card">
          <div className="label">Users</div>
          <div className="value">{s.users_count ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">User balances</div>
          <div className="value">{money(s.user_balances)}</div>
        </div>
        <div className="card">
          <div className="label">Referrals (rewards)</div>
          <div className="value">{s.referral_rewards_count ?? 0}</div>
        </div>
        <div className="card">
          <div className="label">Active campaigns</div>
          <div className="value">{s.active_campaigns ?? 0}</div>
        </div>
      </div>

      <div className="quick-links">
        <Link href="/dashboard/campaigns" className="btn btn-primary">Campaigns</Link>
        <Link href="/dashboard/deposits" className="btn btn-ghost">Deposits</Link>
        <Link href="/dashboard/withdrawals" className="btn btn-ghost">Withdrawals</Link>
        <Link href="/dashboard/referrals" className="btn btn-ghost">Referrals</Link>
        <Link href="/dashboard/settings" className="btn btn-ghost">Settings</Link>
      </div>

      <div className="card">
        <div className="label">Ops tips</div>
        <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
          Approve campaigns so users can earn. Pay withdrawals from your Trust Wallet, then Mark Paid.
          Referral rewards (signup + welcome) appear under Referrals when a deep-link join succeeds.
        </p>
      </div>
    </>
  );
}
