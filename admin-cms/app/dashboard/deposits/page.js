'use client';

import { useEffect, useState } from 'react';
import Toast from '../../../components/Toast';

function money(n) {
  return `${Number(n || 0).toFixed(2)} USDT`;
}
function shortId(id) {
  return String(id || '').slice(0, 8);
}
function dt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default function DepositsPage() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');

  async function load(st = status) {
    setLoading(true);
    const res = await fetch(`/api/deposits?status=${st}`);
    const data = await res.json();
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [status]);

  async function act(action, id) {
    setBusy(id + action);
    const note = action === 'reject' ? prompt('Rejection note (optional):') : undefined;
    const res = await fetch('/api/deposits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, note }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) { setToast(data.error || 'Failed'); return; }
    setToast('Action completed successfully');
    load();
  }

  return (
    <>
      <h1 className="page-title">Deposits</h1>
      <div className="actions" style={{ marginBottom: 16 }}>
        {['pending', 'approved', 'rejected', 'all'].map((s) => (
          <button
            key={s}
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
          <div className="empty">No deposits</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Amount</th>
                <th>Network</th>
                <th>TX</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{shortId(d.id)}</td>
                  <td>
                    {d.first_name || ''} {d.username ? `@${d.username}` : d.telegram_id}
                  </td>
                  <td><strong>{money(d.amount)}</strong></td>
                  <td>{d.network || '—'}</td>
                  <td className="mono" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.tx_hash || '—'}
                  </td>
                  <td><span className={`badge badge-${d.status}`}>{d.status}</span></td>
                  <td className="muted">{dt(d.created_at)}</td>
                  <td>
                    {d.status === 'pending' && (
                      <div className="actions">
                        <button
                          className="btn btn-green btn-sm"
                          disabled={!!busy}
                          onClick={() => act('approve', d.id)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-red btn-sm"
                          disabled={!!busy}
                          onClick={() => act('reject', d.id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
          <Toast message={toast} type={toast && !toast.includes("success") && toast.length < 40 && /fail|error|invalid/i.test(toast) ? "error" : "success"} onClose={() => setToast("")} />
    </>
  );
}