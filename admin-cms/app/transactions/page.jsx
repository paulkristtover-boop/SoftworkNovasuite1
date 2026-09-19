import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
export const dynamic = 'force-dynamic';

export default async function Page() {
  const res = await query(
    'SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON t.user_id = u.telegram_id ORDER BY t.created_at DESC LIMIT 120'
  );
  return (
    <AdminShell title="Transaction Ledger">
      <p className="muted" style={{ marginBottom: 12 }}>Idempotency keys prevent double credits from bot + CMS.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>After</th><th>Ref</th><th>Key</th><th>Date</th></tr>
          </thead>
          <tbody>
            {res.rows.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td>
                <td>{t.user_id || 'System'}{t.username ? ' @' + t.username : ''}</td>
                <td>{t.type}</td>
                <td style={{ color: parseFloat(t.amount) >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{formatUsd(t.amount)}</td>
                <td>{t.balance_after != null ? formatUsd(t.balance_after) : '—'}</td>
                <td className="muted">{t.reference_type || ''} {t.reference_id || ''}</td>
                <td className="mono muted">{t.idempotency_key ? String(t.idempotency_key).slice(0, 12) : '—'}</td>
                <td>{formatDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
