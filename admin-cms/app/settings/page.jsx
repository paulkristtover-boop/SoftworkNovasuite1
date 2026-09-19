import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

const KEYS = [
  'platform_name',
  'welcome_message',
  'welcome_bonus_amount',
  'welcome_bonus_limit',
  'min_withdraw',
  'referral_bonus_percent',
  'support_username',
  'channel_url',
  'group_url',
  'terms_url',
  'privacy_url',
  'trust_wallet_address',
];

async function saveSettings(formData) {
  'use server';
  for (const k of KEYS) {
    const v = formData.get(k);
    if (v !== null) {
      await query(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
        [k, String(v)]
      );
    }
  }
  await query("INSERT INTO audit_logs (actor_type,action,target_type) VALUES ('admin','update_settings','settings')");
  revalidatePath('/settings');
}

export default async function Page() {
  const res = await query('SELECT key, value FROM settings');
  const map = {};
  for (const r of res.rows) map[r.key] = r.value;
  return (
    <AdminShell title="Settings">
      <p className="muted" style={{ marginBottom: 12 }}>Shared with the Telegram bot via the settings table.</p>
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
        <button type="submit" className="btn btn-primary">Save</button>
      </form>
    </AdminShell>
  );
}
