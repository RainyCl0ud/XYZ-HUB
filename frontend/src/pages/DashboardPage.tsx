function DashboardPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Overview</p>
          <h2>Dashboard</h2>
          <p className="page-description">
            Monitor QA activity, incidents, chatters, and rule configuration.
          </p>
        </div>
      </header>

      <section className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Open Incidents</span>
          <strong className="stat-value">—</strong>
          <span className="stat-help">Waiting for API connection</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Active Chatters</span>
          <strong className="stat-value">—</strong>
          <span className="stat-help">Waiting for API connection</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Active Rules</span>
          <strong className="stat-value">—</strong>
          <span className="stat-help">Waiting for API connection</span>
        </div>
      </section>

      <section className="content-card">
        <div className="card-header">
          <div>
            <h3>Recent Activity</h3>
            <p>Recent incidents will appear here.</p>
          </div>
        </div>

        <div className="empty-state">
          <strong>No activity loaded yet</strong>
          <span>We will connect this section to the backend later.</span>
        </div>
      </section>
    </div>
  );
}

export default DashboardPage;