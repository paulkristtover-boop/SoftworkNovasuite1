import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  const res = await query(
    `SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON t.user_id=u.telegram_id
     ORDER BY t.created_at DESC LIMIT 200`
  );

  return (
    <AdminShell title="Transaction Ledger">
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>Balance After</th><th>Note</th><th>Date</th></tr>
          </thead>
          <tbody>
            {res.rows.map((t) => (
              <tr key={t.id}>
                <td>#{t.id}</td>
                <td>{t.user_id || 'System'} {t.username ? `@${t.username}` : ''}</td>
                <td>{t.type}</td>
                <td style={{ color: parseFloat(t.amount) >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                  {formatUsd(t.amount)}
                </td>
                <td>{t.balance_after != null ? formatUsd(t.balance_after) : '—'}</td>
                <td className="muted">{t.note || '—'}</td>
                <td>{formatDate(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
