import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

const KEYS = [
  'platform_name', 'welcome_message', 'min_withdraw', 'referral_bonus_percent',
  'default_ad_reward', 'currency', 'currency_symbol', 'support_username',
  'terms_url', 'privacy_url', 'trust_wallet_address',
];

async function saveSettings(formData: FormData) {
  'use server';
  for (const key of KEYS) {
    const value = formData.get(key);
    if (value !== null) {
      await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
         ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
        [key, String(value)]
      );
    }
  }
  revalidatePath('/settings');
}

export default async function SettingsPage() {
  const res = await query(`SELECT key, value FROM settings`);
  const map: Record<string, string> = {};
  for (const r of res.rows) map[r.key] = r.value;

  return (
    <AdminShell title="Settings">
      <form action={saveSettings} className="form-card" style={{ maxWidth: 560 }}>
        {KEYS.map((k) => (
          <div className="form-group" key={k}>
            <label>{k}</label>
            {k === 'welcome_message' ? (
              <textarea name={k} rows={3} defaultValue={map[k] || ''} style={{ maxWidth: '100%' }} />
            ) : (
              <input name={k} defaultValue={map[k] || ''} style={{ maxWidth: '100%' }} />
            )}
          </div>
        ))}
        <button type="submit" className="btn btn-primary">Save Settings</button>
      </form>
    </AdminShell>
  );
}
