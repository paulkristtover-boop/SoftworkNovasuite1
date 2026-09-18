import { Sidebar } from './Sidebar';

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <span className="muted">NovaSuite Admin</span>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
