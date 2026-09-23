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
        Every credited bonus appears here — signup (inviter), welcome (joiner), and earn-share.
      </p>
      <div className="table-wrap">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : !list.length ? (
          <div className="empty">No referral rewards yet. When someone joins with a link, it shows up here.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Inviter</th>
                <th>Joiner</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td className="muted">{dt(r.created_at)}</td>
                  <td>
                    <span className={`badge badge-${r.reward_type || 'new'}`}>{r.reward_type}</span>
                  </td>
                  <td>
                    {r.referrer_username ? `@${r.referrer_username}` : r.referrer_tg || r.referrer_id}
                  </td>
                  <td>
                    {r.referred_username ? `@${r.referred_username}` : r.referred_tg || r.referred_id}
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
