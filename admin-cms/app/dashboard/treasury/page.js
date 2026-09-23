'use client';

import { useEffect, useState } from 'react';

function money(n) {
  return `${Number(n || 0).toFixed(2)} USDT`;
}
function dt(d) {
  return d ? new Date(d).toLocaleString() : '—';
}

export default function TreasuryPage() {
  const [wallet, setWallet] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState('out');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/treasury');
    const data = await res.json();
    setWallet(data.wallet);
    setLedger(data.ledger || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function adjust(e) {
    e.preventDefault();
    const res = await fetch('/api/treasury', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), note, direction }),
    });
    if (!res.ok) return alert((await res.json()).error);
    setAmount('');
    setNote('');
    load();
  }

  return (
    <>
      <h1 className="page-title">Treasury / SoftworkNovaSuite Trust Wallet</h1>
      <div className="cards" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="label">{wallet?.label || 'SoftworkNovaSuite Trust Wallet'}</div>
          <div className="value">{loading ? '…' : money(wallet?.balance)}</div>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Accounting balance. When you withdraw profits from the real SoftworkNovaSuite Trust Wallet, record it here so the ledger stays balanced.
      </p>

      <div className="card" style={{ marginBottom: 24, maxWidth: 420 }}>
        <form onSubmit={adjust}>
          <div className="form-row">
            <label>Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="out">Out (owner withdrew)</option>
              <option value="in">In (manual credit)</option>
            </select>
          </div>
          <div className="form-row">
            <label>Amount (USDT)</label>
            <input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Owner profit withdrawal" />
          </div>
          <button className="btn btn-primary" type="submit">Record adjustment</button>
        </form>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Ledger</h2>
      <div className="table-wrap">
        {!ledger.length ? (
          <div className="empty">No ledger entries</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Dir</th>
                <th>Note</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id}>
                  <td>{l.type}</td>
                  <td>{money(l.amount)}</td>
                  <td>{l.direction}</td>
                  <td className="muted">{l.note || '—'}</td>
                  <td className="muted">{dt(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
