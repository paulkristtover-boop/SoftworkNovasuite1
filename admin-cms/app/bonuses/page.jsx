import { AdminShell } from '@/components/AdminShell';
import { query, pool } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
import { notifyUser, checkMembership } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

async function saveBonusSettings(formData) {
  'use server';
  const pairs = [
    ['welcome_bonus_amount', String(formData.get('welcome_bonus_amount') || '0').trim()],
    ['welcome_bonus_limit', String(formData.get('welcome_bonus_limit') || '30').trim()],
    ['channel_url', String(formData.get('channel_url') || '').trim()],
    ['group_url', String(formData.get('group_url') || '').trim()],
  ];
  for (const [k, v] of pairs) {
    await query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [k, v]
    );
  }
  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, details)
     VALUES ('admin','update_bonus_settings','settings',$1)`,
    [JSON.stringify(Object.fromEntries(pairs))]
  );
  revalidatePath('/bonuses');
}

async function grantManual(formData) {
  'use server';
  const userId = formData.get('user_id');
  const amount = parseFloat(formData.get('amount'));
  if (!userId || !Number.isFinite(amount) || amount <= 0) throw new Error('Invalid user or amount');

  const prior = await query(
    `SELECT id FROM transactions WHERE user_id=$1 AND type='welcome_bonus' LIMIT 1`,
    [userId]
  );
  if (prior.rows[0]) throw new Error('User already received welcome bonus');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [userId]);
    if (!u.rows[0]) throw new Error('User not found');
    const newBal = parseFloat(u.rows[0].balance) + amount;
    await client.query(
      `UPDATE users SET balance=$1, total_earned=total_earned+$2, updated_at=NOW() WHERE telegram_id=$3`,
      [newBal, amount, userId]
    );
    await client.query(
      `INSERT INTO transactions (user_id, type, amount, balance_after, note, idempotency_key)
       VALUES ($1,'welcome_bonus',$2,$3,'Manual/retro welcome credit (CMS)',$4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [userId, amount, newBal, `welcome_bonus_${userId}`]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_type, action, target_type, target_id, details)
       VALUES ('admin','manual_welcome_bonus','user',$1,$2)`,
      [String(userId), JSON.stringify({ amount })]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await notifyUser(
    userId,
    `🎁 *Welcome starter credit*\n\n+$${amount.toFixed(4)} USDT has been added to your wallet.\n\n_Use it for Earn or Promote._\n\nOpen the bot → *Wallet* to check your balance.`
  );
  revalidatePath('/bonuses');
}

/**
 * Backfill: earliest users without welcome_bonus, up to remaining spots.
 * require_membership=on → only users currently in channel+group.
 */
async function backfillWelcome(formData) {
  'use server';
  const requireMember = formData.get('require_membership') === 'on';
  const notify = formData.get('notify') === 'on';

  const amountRow = await query(`SELECT value FROM settings WHERE key='welcome_bonus_amount'`);
  const limitRow = await query(`SELECT value FROM settings WHERE key='welcome_bonus_limit'`);
  const amount = parseFloat(amountRow.rows[0]?.value || process.env.WELCOME_BONUS_AMOUNT || '0.5');
  const limit = parseInt(limitRow.rows[0]?.value || process.env.WELCOME_BONUS_LIMIT || '30', 10);

  const given = await query(`SELECT COUNT(*)::int AS c FROM transactions WHERE type='welcome_bonus'`);
  let remaining = Math.max(0, limit - given.rows[0].c);
  if (remaining <= 0) throw new Error('Welcome pool is full — increase limit to credit more users');

  // Candidates: oldest accounts without welcome_bonus
  const candidates = await query(
    `SELECT u.telegram_id, u.username, u.created_at
     FROM users u
     WHERE NOT EXISTS (
       SELECT 1 FROM transactions t WHERE t.user_id = u.telegram_id AND t.type = 'welcome_bonus'
     )
     AND u.is_banned IS NOT TRUE
     ORDER BY u.created_at ASC
     LIMIT 200`
  );

  let granted = 0;
  let skipped = 0;
  const credited = [];

  for (const c of candidates.rows) {
    if (remaining <= 0) break;

    if (requireMember) {
      const m = await checkMembership(c.telegram_id);
      if (!m.ok) {
        skipped += 1;
        continue;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query(
        `SELECT id FROM transactions WHERE user_id=$1 AND type='welcome_bonus' LIMIT 1`,
        [c.telegram_id]
      );
      if (prior.rows[0]) {
        await client.query('ROLLBACK');
        skipped += 1;
        continue;
      }
      const u = await client.query(`SELECT balance FROM users WHERE telegram_id=$1 FOR UPDATE`, [
        c.telegram_id,
      ]);
      if (!u.rows[0]) {
        await client.query('ROLLBACK');
        continue;
      }
      const newBal = parseFloat(u.rows[0].balance) + amount;
      await client.query(
        `UPDATE users SET balance=$1, total_earned=total_earned+$2, updated_at=NOW() WHERE telegram_id=$3`,
        [newBal, amount, c.telegram_id]
      );
      await client.query(
        `INSERT INTO transactions (user_id, type, amount, balance_after, note, idempotency_key)
         VALUES ($1,'welcome_bonus',$2,$3,'Retroactive welcome credit (CMS backfill)',$4)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [c.telegram_id, amount, newBal, `welcome_bonus_${c.telegram_id}`]
      );
      await client.query('COMMIT');
      granted += 1;
      remaining -= 1;
      credited.push(c.telegram_id);
    } catch (_) {
      await client.query('ROLLBACK').catch(() => {});
      skipped += 1;
    } finally {
      client.release();
    }
  }

  if (notify && credited.length) {
    for (const id of credited) {
      await notifyUser(
        id,
        `🎁 *Welcome starter credit*\n\n+$${amount.toFixed(4)} USDT was added to your wallet (catch-up credit).\n\n_Use it for Earn or Promote._\nCheck *Wallet* in the bot.`
      );
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, details)
     VALUES ('admin','backfill_welcome_bonus','bonus',$1)`,
    [JSON.stringify({ granted, skipped, requireMember, notified: notify })]
  );

  revalidatePath('/bonuses');
}

async function notifyEligible(formData) {
  'use server';
  // Message users who have NO welcome_bonus yet (and pool not full messaging)
  const limitRow = await query(`SELECT value FROM settings WHERE key='welcome_bonus_limit'`);
  const amountRow = await query(`SELECT value FROM settings WHERE key='welcome_bonus_amount'`);
  const limit = limitRow.rows[0]?.value || '30';
  const amount = amountRow.rows[0]?.value || '0.5';
  const channel = (await query(`SELECT value FROM settings WHERE key='channel_url'`)).rows[0]?.value
    || 'https://t.me/SoftworkNovaSuite';
  const group = (await query(`SELECT value FROM settings WHERE key='group_url'`)).rows[0]?.value
    || 'https://t.me/softworknovasuitecommunity';

  const users = await query(
    `SELECT u.telegram_id FROM users u
     WHERE NOT EXISTS (
       SELECT 1 FROM transactions t WHERE t.user_id = u.telegram_id AND t.type = 'welcome_bonus'
     )
     AND COALESCE(u.is_banned, FALSE) = FALSE
     ORDER BY u.created_at ASC
     LIMIT 500`
  );

  const text = [
    '🎁 *Welcome starter credit*',
    '',
    `If you are among the first *${limit}* members, you can still claim *$${parseFloat(amount).toFixed(4)} USDT*.`,
    '',
    '1. Join the channel',
    '2. Join the group',
    '3. Open the bot → /start → *Verify membership*',
    '',
    `📢 ${channel}`,
    `💬 ${group}`,
    '',
    '_Already credited? Open Wallet to confirm your balance._',
  ].join('\n');

  let sent = 0;
  for (const u of users.rows) {
    const r = await notifyUser(u.telegram_id, text);
    if (r.ok) sent += 1;
    await new Promise((r) => setTimeout(r, 45));
  }

  await query(
    `INSERT INTO audit_logs (actor_type, action, target_type, details)
     VALUES ('admin','notify_bonus_eligible','bonus',$1)`,
    [JSON.stringify({ sent, candidates: users.rows.length })]
  );
  revalidatePath('/bonuses');
}

export default async function BonusesPage() {
  const settings = await query(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [['welcome_bonus_amount', 'welcome_bonus_limit', 'channel_url', 'group_url']]
  );
  const map = {};
  for (const r of settings.rows) map[r.key] = r.value;

  const stats = await query(
    `SELECT COUNT(*)::int AS total_granted, COALESCE(SUM(amount),0) AS total_paid
     FROM transactions WHERE type = 'welcome_bonus'`
  );
  const pending = await query(
    `SELECT COUNT(*)::int AS c FROM users u
     WHERE NOT EXISTS (
       SELECT 1 FROM transactions t WHERE t.user_id = u.telegram_id AND t.type = 'welcome_bonus'
     )
     AND COALESCE(u.is_banned, FALSE) = FALSE`
  );
  const recent = await query(
    `SELECT t.id, t.user_id, t.amount, t.note, t.created_at, u.username
     FROM transactions t
     LEFT JOIN users u ON t.user_id = u.telegram_id
     WHERE t.type = 'welcome_bonus'
     ORDER BY t.created_at DESC LIMIT 50`
  );

  const amount = map.welcome_bonus_amount || '0.5';
  const limit = parseInt(map.welcome_bonus_limit || '30', 10);
  const granted = stats.rows[0].total_granted;
  const remaining = Math.max(0, limit - granted);

  return (
    <AdminShell title="Bonuses">
      <div className="page-header">
        <h2>Welcome starter credit</h2>
        <p>
          First N users (direct or referred) get a one-time credit after membership verify.
          Use backfill to credit early joiners who missed it; use notify to tell others how to claim.
        </p>
      </div>

      <div className="cards">
        <div className="card card-accent-green">
          <div className="label">Per user</div>
          <div className="value">{formatUsd(amount)}</div>
        </div>
        <div className="card card-accent-amber">
          <div className="label">Spots left</div>
          <div className="value">{remaining}</div>
          <div className="card-hint">of {limit}</div>
        </div>
        <div className="card card-accent-sky">
          <div className="label">Already credited</div>
          <div className="value">{granted}</div>
        </div>
        <div className="card">
          <div className="label">Not credited yet</div>
          <div className="value">{pending.rows[0].c}</div>
          <div className="card-hint">Registered users</div>
        </div>
        <div className="card">
          <div className="label">Total paid</div>
          <div className="value">{formatUsd(stats.rows[0].total_paid, 2)}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="form-card" style={{ maxWidth: '100%' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Catch-up / backfill</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Credits oldest users without a welcome bonus until the pool is full.
            Prefer “require membership” so only verified community members get paid.
          </p>
          <form action={backfillWelcome}>
            <div className="checklist">
              <label>
                <input type="checkbox" name="require_membership" defaultChecked /> Only if in channel + group now
              </label>
              <label>
                <input type="checkbox" name="notify" defaultChecked /> Telegram-notify each credited user
              </label>
            </div>
            <button type="submit" className="btn btn-primary">
              Run backfill ({remaining} spots left)
            </button>
          </form>
        </div>

        <div className="form-card" style={{ maxWidth: '100%' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Notify uncredited users</h3>
          <p className="muted" style={{ marginBottom: 12 }}>
            Sends instructions to join + verify so they can claim if spots remain. Does not credit automatically.
          </p>
          <form action={notifyEligible}>
            <button type="submit" className="btn btn-ghost">
              Send claim instructions
            </button>
          </form>
        </div>
      </div>

      <div className="form-card">
        <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Manual credit (one user)</h3>
        <form action={grantManual}>
          <div className="form-group">
            <label>Telegram user ID</label>
            <input name="user_id" required placeholder="123456789" />
          </div>
          <div className="form-group">
            <label>Amount USDT</label>
            <input name="amount" type="number" step="0.0001" defaultValue={amount} required />
          </div>
          <button type="submit" className="btn btn-primary">Credit &amp; notify</button>
        </form>
      </div>

      <div className="form-card" style={{ maxWidth: 560 }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Settings</h3>
        <form action={saveBonusSettings}>
          <div className="form-group">
            <label>Welcome amount (USDT)</label>
            <input name="welcome_bonus_amount" type="number" step="0.0001" defaultValue={amount} required />
          </div>
          <div className="form-group">
            <label>Limit (first N)</label>
            <input name="welcome_bonus_limit" type="number" min="0" defaultValue={limit} required />
          </div>
          <div className="form-group">
            <label>Channel URL</label>
            <input name="channel_url" defaultValue={map.channel_url || 'https://t.me/SoftworkNovaSuite'} style={{ maxWidth: '100%' }} />
          </div>
          <div className="form-group">
            <label>Group URL</label>
            <input name="group_url" defaultValue={map.group_url || 'https://t.me/softworknovasuitecommunity'} style={{ maxWidth: '100%' }} />
          </div>
          <button type="submit" className="btn btn-primary">Save</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h3>Credited users (proof of payment)</h3>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Amount</th>
                <th>Note</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>
                    No welcome bonuses yet
                  </td>
                </tr>
              )}
              {recent.rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.id}</td>
                  <td className="mono">
                    {r.user_id} @{r.username || '—'}
                  </td>
                  <td>{formatUsd(r.amount)}</td>
                  <td className="muted">{(r.note || '').slice(0, 48)}</td>
                  <td className="muted">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
