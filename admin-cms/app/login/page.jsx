'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Login failed (${res.status})`);
        setLoading(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err.message || 'Network error');
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-theme">
          <ThemeToggle />
        </div>
        <div className="login-logo">NS</div>
        <h1>NovaSuite</h1>
        <p className="sub">Admin operations · USDT</p>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              autoComplete="current-password"
              placeholder="ADMIN_CMS_PASSWORD"
            />
          </div>
          <button type="submit" className="btn btn-primary w-100" style={{ marginTop: 4 }} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in to dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
