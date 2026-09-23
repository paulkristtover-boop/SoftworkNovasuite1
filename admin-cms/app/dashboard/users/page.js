'use client';

import { useEffect, useState } from 'react';
import Toast from '../../../components/Toast';

function money(n) {
  return `${Number(n || 0).toFixed(2)} USDT`;
}
function dt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default function UsersPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/users');
    setList(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function ban(id) {
    const reason = prompt('Ban reason:');
    if (reason === null) return;
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ban', id, reason }),
    });
    load();
  }

  async function unban(id) {
    await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unban', id }),
    });
    load();
  }

  return (
    <>
      <h1 className="page-title">Users</h1>
      <div className="table-wrap">
        {loading ? <div className="empty">Loading…</div> : !list.length ? (
          <div className="empty">No users</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Telegram</th>
                <th>Name</th>
                <th>Balance</th>
                <th>Terms</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.telegram_id}</td>
                  <td>{u.first_name || ''} {u.username ? `@${u.username}` : ''}</td>
                  <td>{money(u.balance)}</td>
                  <td>{u.accepted_terms ? '✅' : '—'}</td>
                  <td>{u.is_banned ? <span className="badge badge-rejected">banned</span> : 'active'}</td>
                  <td className="muted">{dt(u.created_at)}</td>
                  <td>
                    {u.is_banned ? (
                      <button className="btn btn-green btn-sm" onClick={() => unban(u.id)}>Unban</button>
                    ) : (
                      <button className="btn btn-red btn-sm" onClick={() => ban(u.id)}>Ban</button>
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