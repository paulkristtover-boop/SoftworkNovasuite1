'use client';

import { useEffect, useState, useCallback } from 'react';
import Toast from '../../../components/Toast';

function money(n) {
  return `${Number(n || 0).toFixed(4)} USDT`;
}
function shortId(id) {
  return String(id || '').slice(0, 8);
}
function remainingViews(c) {
  const reward = Number(c.reward_per_view) || 0;
  if (reward <= 0) return 0;
  const left = Number(c.budget_total) - Number(c.budget_spent);
  return Math.floor(left / reward);
}

export default function CampaignsPage() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async (st = status) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns?status=${st}`);
      const data = await res.json();
      setList(Array.isArray(data) ? data : []);
    } catch {
      setToast({ message: 'Failed to load campaigns', type: 'error' });
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function act(action, id) {
    setBusy(id + action);
    const note = action === 'reject' ? prompt('Rejection note (optional):') : undefined;
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ message: data.error || 'Action failed', type: 'error' });
      } else {
        const labels = { approve: 'Campaign approved — now live', reject: 'Campaign rejected — budget refunded', pause: 'Campaign paused', resume: 'Campaign resumed' };
        setToast({ message: labels[action] || 'Done', type: 'success' });
        load();
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    }
    setBusy(null);
  }

  return (
    <>
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      <h1 className="page-title">Campaigns</h1>
      <p className="page-sub">
        Approve ads so users can earn. Budget is locked from the advertiser; reject refunds the rest.
      </p>
      <div className="actions" style={{ marginBottom: 14 }}>
        {['pending', 'active', 'paused', 'rejected', 'finished', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStatus(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : !list.length ? (
          <div className="empty">No campaigns in this filter</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Economics</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.title}</strong>
                    <div className="stat-row">
                      <span>{c.ad_type}</span>
                      <span className="mono">{shortId(c.id)}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {c.first_name || ''} {c.username ? `@${c.username}` : c.telegram_id}
                    </div>
                    <div className="mono" style={{ fontSize: 11, marginTop: 4, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <a href={c.target_url} target="_blank" rel="noreferrer">{c.target_url}</a>
                    </div>
                  </td>
                  <td>
                    <div><strong>{money(c.reward_per_view)}</strong> / view</div>
                    <div className="stat-row">
                      <span>Spent {money(c.budget_spent)}</span>
                      <span>/ {money(c.budget_total)}</span>
                    </div>
                    <div className="stat-row">
                      <span>{c.views_count} views</span>
                      <span>~{remainingViews(c)} left</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge badge-${c.status === 'active' ? 'active' : c.status === 'pending' ? 'pending' : 'rejected'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      {c.status === 'pending' && (
                        <>
                          <button type="button" className="btn btn-green btn-sm" disabled={!!busy} onClick={() => act('approve', c.id)}>Approve</button>
                          <button type="button" className="btn btn-red btn-sm" disabled={!!busy} onClick={() => act('reject', c.id)}>Reject</button>
                        </>
                      )}
                      {c.status === 'active' && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('pause', c.id)}>Pause</button>
                      )}
                      {c.status === 'paused' && (
                        <button type="button" className="btn btn-green btn-sm" disabled={!!busy} onClick={() => act('resume', c.id)}>Resume</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
