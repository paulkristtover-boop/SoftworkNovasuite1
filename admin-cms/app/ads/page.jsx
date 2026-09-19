import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

async function setAdStatus(formData) {
  'use server';
  const id = formData.get('id');
  const status = formData.get('status');
  await query('UPDATE ads SET status=$1, updated_at=NOW() WHERE id=$2', [status, id]);
  await query("INSERT INTO audit_logs (actor_type,action,target_type,target_id,details) VALUES ('admin','set_ad_status','ad',$1,$2)", [String(id), JSON.stringify({ status })]);
  revalidatePath('/ads');
}

export default async function Page({ searchParams }) {
  const status = searchParams?.status || 'pending';
  const res = await query(
    "SELECT a.*, u.username FROM ads a LEFT JOIN users u ON a.owner_id=u.telegram_id WHERE ($1='all' OR a.status=$1) ORDER BY a.created_at DESC LIMIT 50",
    [status]
  );
  return (
    <AdminShell title="Ads / Campaigns">
      <div className="filters">
        {['pending', 'active', 'paused', 'rejected', 'finished', 'all'].map((s) => (
          <a key={s} href={'?status=' + s} className={status === s ? 'active' : ''}>{s}</a>
        ))}
      </div>
      <p className="muted">Activate ads after review. Users earn via verified timed views in the bot.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Owner</th><th>Title</th><th>Type</th><th>Reward</th><th>Budget / Spent</th><th>Views</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {res.rows.map((a) => (
              <tr key={a.id}>
                <td>#{a.id}</td>
                <td className="mono">{a.owner_id}</td>
                <td>{a.title}<br/><span className="muted mono">{(a.url || '').slice(0, 40)}</span></td>
                <td>{a.type}</td>
                <td>{formatUsd(a.reward)}</td>
                <td>{formatUsd(a.budget, 2)} / {formatUsd(a.spent, 2)}</td>
                <td>{a.views_done}</td>
                <td><span className={'badge badge-' + a.status}>{a.status}</span></td>
                <td>
                  {a.status === 'pending' && (
                    <>
                      <form action={setAdStatus} className="inline-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value="active" />
                        <button type="submit" className="btn btn-sm btn-primary">Activate</button>
                      </form>{' '}
                      <form action={setAdStatus} className="inline-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button type="submit" className="btn btn-sm btn-danger">Reject</button>
                      </form>
                    </>
                  )}
                  {a.status === 'active' && (
                    <form action={setAdStatus} className="inline-form">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="paused" />
                      <button type="submit" className="btn btn-sm btn-ghost">Pause</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
