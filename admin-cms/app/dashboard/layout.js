import { redirect } from 'next/navigation';
import { isAuthenticated } from '../../lib/auth';
import Sidebar from '../../components/Sidebar';

export default async function DashboardLayout({ children }) {
  if (!(await isAuthenticated())) {
    redirect('/login');
  }
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">{children}</main>
    </div>
  );
}
