import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const res = await query('SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 50');
  return (<AdminShell title="Support"><div className="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Message</th><th>Status</th><th>Date</th></tr></thead>
  <tbody>{res.rows.map(t=>(<tr key={t.id}><td>#{t.id}</td><td>{t.user_id}</td><td style={{whiteSpace:'normal',maxWidth:400}}>{t.message}</td><td>{t.status}</td><td>{formatDate(t.created_at)}</td></tr>))}</tbody></table></div></AdminShell>);
}
