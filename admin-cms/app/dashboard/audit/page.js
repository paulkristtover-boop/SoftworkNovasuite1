'use client';

import { useEffect, useState } from 'react';

function dt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default function AuditPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/audit')
      .then((r) => r.json())
      .then((d) => { setList(d); setLoading(false); });
  }, []);

  return (
    <>
      <h1 className="page-title">Audit logs</h1>
      <div className="table-wrap">
        {loading ? <div className="empty">Loading…</div> : !list.length ? (
          <div className="empty">No logs yet</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="muted">{dt(a.created_at)}</td>
                  <td>{a.action}</td>
                  <td className="mono">{a.entity_type} {a.entity_id ? String(a.entity_id).slice(0, 8) : ''}</td>
                  <td className="mono muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.details ? JSON.stringify(a.details) : '—'}
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
