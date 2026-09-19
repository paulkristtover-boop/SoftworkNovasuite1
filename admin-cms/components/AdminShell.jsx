import { Sidebar } from './Sidebar';

export function AdminShell({ title, children, subtitle }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="topbar-meta">
            <span className="pill pill-live">USDT</span>
            <span className="pill">Operations</span>
          </div>
        </header>
        <div className="page">
          {subtitle ? (
            <div className="page-header">
              <h2>{title}</h2>
              <p>{subtitle}</p>
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
