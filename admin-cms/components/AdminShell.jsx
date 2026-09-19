import { Sidebar } from './Sidebar';

export function AdminShell({ title, children }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <h1 style={{ fontSize: '1rem' }}>{title}</h1>
          <span className="muted">Admin CMS · USDT</span>
        </header>
        <div className="page">{children}</div>
      </div>
    </div>
  );
}
