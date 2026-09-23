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

export default function WithdrawalsPage() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState('');

  async function load(st = status) {
    setLoading(true);
    const res = await fetch(`/api/withdrawals?status=${st}`);
    const data = await res.json();
    setList(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [status]);

  async function act(action, id) {
    setBusy(id + action);
    const note = action === 'reject' ? prompt('Rejection note (optional):') : undefined;
    if (action === 'pay') {
      const ok = confirm('Confirm you have already sent the USDT from SoftworkNovaSuite Trust Wallet?');
      if (!ok) { setBusy(null); return; }
    }
    const res = await fetch('/api/withdrawals', {
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
      <h1 className="page-title">Withdrawals</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Pay the user manually from your SoftworkNovaSuite Trust Wallet, then click <strong>Mark Paid</strong>.
      </p>
      <div className="actions" style={{ marginBottom: 16 }}>
        {['pending', 'paid', 'rejected', 'all'].map((s) => (
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
          <div className="empty">No withdrawals</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Amount</th>
                <th>Network</th>
                <th>Address</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id}>
                  <td className="mono">{shortId(w.id)}</td>
                  <td>
                    {w.first_name || ''} {w.username ? `@${w.username}` : w.telegram_id}
                  </td>
                  <td><strong>{money(w.amount)}</strong></td>
                  <td>{w.network}</td>
                  <td className="mono" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {w.to_address}
                  </td>
                  <td><span className={`badge badge-${w.status}`}>{w.status}</span></td>
                  <td className="muted">{dt(w.created_at)}</td>
                  <td>
                    {w.status === 'pending' && (
                      <div className="actions">
                        <button
                          className="btn btn-green btn-sm"
                          disabled={!!busy}
                          onClick={() => act('pay', w.id)}
                        >
                          Mark Paid
                        </button>
                        <button
                          className="btn btn-red btn-sm"
                          disabled={!!busy}
                          onClick={() => act('reject', w.id)}
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