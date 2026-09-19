import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const res = await query('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100');
  return (<AdminShell title="Ledger"><div className="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Type</th><th>Amount</th><th>Idempotency</th><th>Date</th></tr></thead>
  <tbody>{res.rows.map(t=>(<tr key={t.id}><td>#{t.id}</td><td>{t.user_id||'System'}</td><td>{t.type}</td><td>{formatUsd(t.amount)}</td><td className="mono muted">{t.idempotency_key?String(t.idempotency_key).slice(0,10):'—'}</td><td>{formatDate(t.created_at)}</td></tr>))}</tbody></table></div></AdminShell>);
}
