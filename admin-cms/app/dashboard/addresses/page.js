'use client';

import { useEffect, useState } from 'react';
import Toast from '../../../components/Toast';

export default function AddressesPage() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ network: 'TRC20', address: '', label: '', instructions: '' });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/addresses');
    setList(await res.json());
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    const res = await fetch('/api/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', ...form }),
    });
    if (!res.ok) return alert((await res.json()).error);
    setForm({ network: 'TRC20', address: '', label: '', instructions: '' });
    load();
  }

  async function toggle(id) {
    await fetch('/api/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id }),
    });
    load();
  }

  async function del(id) {
    if (!confirm('Delete this address?')) return;
    await fetch('/api/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    load();
  }

  return (
    <>
      <h1 className="page-title">Payment addresses</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Users see only active addresses when depositing. No external payment API.
      </p>

      <div className="card" style={{ marginBottom: 24, maxWidth: 480 }}>
        <form onSubmit={add}>
          <div className="form-row">
            <label>Network</label>
            <select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
              <option>TRC20</option>
              <option>ERC20</option>
              <option>BEP20</option>
              <option>SOL</option>
            </select>
          </div>
          <div className="form-row">
            <label>Address</label>
            <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Label (optional)</label>
            <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <div className="form-row">
            <label>Instructions (optional)</label>
            <textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
          <button className="btn btn-primary" type="submit">Add address</button>
        </form>
      </div>

      <div className="table-wrap">
        {loading ? <div className="empty">Loading…</div> : !list.length ? (
          <div className="empty">No addresses yet</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Network</th>
                <th>Address</th>
                <th>Label</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>{a.network}</td>
                  <td className="mono">{a.address}</td>
                  <td>{a.label || '—'}</td>
                  <td>{a.is_active ? '✅' : '❌'}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => toggle(a.id)}>
                        {a.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-red btn-sm" onClick={() => del(a.id)}>Delete</button>
                    </div>
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