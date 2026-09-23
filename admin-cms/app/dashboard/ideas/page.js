'use client';

import { useEffect, useState } from 'react';

function dt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default function IdeasPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/ideas?status=all');
    setList(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function setStatus(id, status) {
    await fetch('/api/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  return (
    <>
      <h1 className="page-title">Ideas & feedback</h1>
      <div className="table-wrap">
        {loading ? <div className="empty">Loading…</div> : !list.length ? (
          <div className="empty">No ideas yet</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>User</th>
                <th>Content</th>
                <th>Status</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => (
                <tr key={i.id}>
                  <td>{i.id}</td>
                  <td>{i.first_name || ''} {i.username ? `@${i.username}` : i.telegram_id}</td>
                  <td style={{ maxWidth: 320 }}>{i.content}</td>
                  <td><span className={`badge badge-${i.status === 'new' ? 'new' : 'approved'}`}>{i.status}</span></td>
                  <td className="muted">{dt(i.created_at)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setStatus(i.id, 'reviewed')}>Reviewed</button>
                      <button className="btn btn-green btn-sm" onClick={() => setStatus(i.id, 'implemented')}>Done</button>
                      <button className="btn btn-red btn-sm" onClick={() => setStatus(i.id, 'closed')}>Close</button>
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
