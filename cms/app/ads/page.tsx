import { AdminShell } from '@/components/AdminShell';
import { query } from '@/lib/db';
import { formatUsd, formatDate } from '@/lib/format';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function setStatus(formData: FormData) {
  'use server';
  const id = formData.get('id') as string;
  const status = formData.get('status') as string;
  await query(`UPDATE ads SET status=$1, updated_at=NOW() WHERE id=$2`, [status, id]);
  revalidatePath('/ads');
}

export default async function AdsPage({ searchParams }: { searchParams: { status?: string } }) {
  const status = searchParams.status || 'pending';
  const res = await query(
    `SELECT a.*, u.username FROM ads a LEFT JOIN users u ON a.owner_id=u.telegram_id
     WHERE ($1='all' OR a.status=$1) ORDER BY a.created_at DESC LIMIT 100`,
    [status]
  );

  return (
    <AdminShell title="Ads">
      <div className="filters">
        {['pending', 'active', 'paused', 'rejected', 'finished', 'all'].map((s) => (
          <a key={s} href={`?status=${s}`} className={status === s ? 'active' : ''}>{s}</a>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Owner</th><th>Title</th><th>Type</th><th>Reward</th><th>Budget/Spent</th><th>Views</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {res.rows.map((a) => (
              <tr key={a.id}>
                <td>#{a.id}</td>
                <td>{a.owner_id}</td>
                <td>{a.title}</td>
                <td>{a.type}</td>
                <td>{formatUsd(a.reward)}</td>
                <td>{formatUsd(a.budget, 2)} / {formatUsd(a.spent, 2)}</td>
                <td>{a.views_done}{a.max_views ? `/${a.max_views}` : ''}</td>
                <td><span className={`badge badge-${a.status}`}>{a.status}</span></td>
                <td>
                  {a.status === 'pending' && (
                    <>
                      <form action={setStatus} className="inline-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value="active" />
                        <button className="btn btn-sm btn-primary">Activate</button>
                      </form>{' '}
                      <form action={setStatus} className="inline-form">
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button className="btn btn-sm btn-danger">Reject</button>
                      </form>
                    </>
                  )}
                  {a.status === 'active' && (
                    <form action={setStatus} className="inline-form">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="paused" />
                      <button className="btn btn-sm btn-ghost">Pause</button>
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
