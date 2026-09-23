'use client';

import { useEffect, useState, useCallback } from 'react';
import Toast from '../../../components/Toast';

function money(n) {
  return `${Number(n || 0).toFixed(4)} USDT`;
}
function shortId(id) {
  return String(id || '').slice(0, 8);
}

export default function CampaignsPage() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async (st = status) => {
    setLoading(true);
    const res = await fetch(`/api/campaigns?status=${st}`);
    const data = await res.json();
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function act(action, id) {
    setBusy(id + action);
    const note = action === 'reject' ? prompt('Rejection note (optional):') : undefined;
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, note }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setToast(data.error || 'Failed');
      return;
    }
    const labels = { approve: 'Campaign approved — now live', reject: 'Campaign rejected & budget refunded', pause: 'Campaign paused', resume: 'Campaign resumed', boost: 'Priority boosted' };
    setToast(labels[action] || 'Done');
    load();
  }

  return (
    <>
      <h1 className="page-title">Campaigns</h1>
      <p className="page-sub">Approve ads so users can earn. Higher reward/view delivers faster.</p>
      <div className="actions" style={{ marginBottom: 16 }}>
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
          <div className="empty">No campaigns</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Advertiser</th>
                <th>Budget</th>
                <th>Reward</th>
                <th>Views</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const pct = Math.min(100, (Number(c.budget_spent) / Number(c.budget_total || 1)) * 100);
                const remaining = Number(c.budget_total) - Number(c.budget_spent);
                const estLeft = Number(c.reward_per_view) > 0 ? Math.floor(remaining / Number(c.reward_per_view)) : 0;
                return (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>{c.ad_type} · {shortId(c.id)}</div>
                      <div className="mono" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <a href={c.target_url} target="_blank" rel="noreferrer">{c.target_url}</a>
                      </div>
                    </td>
                    <td>{c.first_name || ''} {c.username ? `@${c.username}` : c.telegram_id}</td>
                    <td>
                      <div>{money(c.budget_spent)} / {money(c.budget_total)}</div>
                      <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                      <div className="muted" style={{ fontSize: 11 }}>~{estLeft} views left</div>
                    </td>
                    <td><strong>{money(c.reward_per_view)}</strong></td>
                    <td>{c.views_count}{c.estimated_views ? ` / ~${c.estimated_views}` : ''}</td>
                    <td><span className={`badge badge-${c.status === 'active' ? 'active' : c.status === 'pending' ? 'pending' : 'rejected'}`}>{c.status}</span></td>
                    <td>
                      <div className="actions">
                        {c.status === 'pending' && (
                          <>
                            <button type="button" className="btn btn-green btn-sm" disabled={!!busy} onClick={() => act('approve', c.id)}>Approve</button>
                            <button type="button" className="btn btn-red btn-sm" disabled={!!busy} onClick={() => act('reject', c.id)}>Reject</button>
                          </>
                        )}
                        {c.status === 'active' && (
                          <>
                            <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => act('pause', c.id)}>Pause</button>
                            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('boost', c.id)}>Boost</button>
                          </>
                        )}
                        {c.status === 'paused' && (
                          <button type="button" className="btn btn-green btn-sm" disabled={!!busy} onClick={() => act('resume', c.id)}>Resume</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <Toast message={toast} onClose={() => setToast('')} />
    </>
  );
}
