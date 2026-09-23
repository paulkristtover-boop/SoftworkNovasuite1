'use client';

import { useEffect, useState } from 'react';
import Toast from '../../../components/Toast';

const FIELDS = [
  { key: 'default_reward', label: 'Default reward / view (USDT)' },
  { key: 'min_campaign_budget', label: 'Min campaign budget' },
  { key: 'min_reward_per_view', label: 'Min reward / view' },
  { key: 'max_reward_per_view', label: 'Max reward / view' },
  { key: 'referral_signup_bonus', label: 'Referral bonus (to inviter)' },
  { key: 'referral_welcome_bonus', label: 'Welcome bonus (to new joiner)' },
  { key: 'referral_earn_percent', label: 'Referral % of earnings' },
  { key: 'daily_view_limit', label: 'Daily view limit per user' },
  { key: 'claim_delay_seconds', label: 'Claim delay (seconds)' },
  { key: 'daily_checkin_base', label: 'Daily check-in base' },
  { key: 'daily_checkin_streak_bonus', label: 'Streak bonus per day' },
];

export default function SettingsPage() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => { setForm(d || {}); setLoading(false); });
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg('');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || 'Failed');
    setForm(data);
    setMsg('Saved');
    setToast('Settings saved successfully');
  }

  if (loading) return <div className="empty">Loading…</div>;

  return (
    <>
      <h1 className="page-title">PTC & referral settings</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Control rewards, anti-abuse timers, and referral rates for SoftworkNovaSuite.
      </p>
      {msg && <p style={{ color: msg === 'Saved' ? 'var(--green)' : 'var(--red)', marginBottom: 12 }}>{msg}</p>}
      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={save}>
          {FIELDS.map((f) => (
            <div className="form-row" key={f.key}>
              <label>{f.label}</label>
              <input
                type="number"
                step="any"
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          <button className="btn btn-primary" type="submit">Save settings</button>
        </form>
      </div>
          <Toast message={toast} onClose={() => setToast("")} />
    </>
  );
}
