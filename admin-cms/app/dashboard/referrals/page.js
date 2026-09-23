'use client';

import { useEffect, useState } from 'react';

function money(n) {
  return `${Number(n || 0).toFixed(4)} USDT`;
}
function dt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default function ReferralsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/referrals')
      .then((r) => r.json())
      .then((d) => {
        setList(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <>
      <h1 className="page-title">Referrals</h1>
      <p className="page-sub">
        Signup/welcome bonuses and earn-share payouts. Confirms whether joiners and inviters were credited.
      </p>
      <div className="table-wrap">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : !list.length ? (
          <div className="empty">No referral rewards yet</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Referrer</th>
                <th>Joiner</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{dt(r.created_at)}</td>
                  <td>
                    <span className={`badge badge-${r.reward_type === 'welcome' ? 'new' : 'approved'}`}>
                      {r.reward_type}
                    </span>
                  </td>
                  <td>
                    {r.referrer_username ? `@${r.referrer_username}` : r.referrer_tg}
                  </td>
                  <td>
                    {r.referred_name || ''} {r.referred_username ? `@${r.referred_username}` : r.referred_tg}
                  </td>
                  <td><strong>{money(r.amount)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
