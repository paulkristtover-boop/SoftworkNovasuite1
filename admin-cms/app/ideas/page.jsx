import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/format';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const res = await query('SELECT * FROM ideas ORDER BY created_at DESC LIMIT 50');
  return (<AdminShell title="Ideas"><div className="table-wrap"><table><thead><tr><th>ID</th><th>User</th><th>Content</th><th>Date</th></tr></thead>
  <tbody>{res.rows.map(i=>(<tr key={i.id}><td>#{i.id}</td><td>{i.user_id}</td><td style={{whiteSpace:'normal',maxWidth:400}}>{i.content}</td><td>{formatDate(i.created_at)}</td></tr>))}</tbody></table></div></AdminShell>);
}
