function IncidentsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">QA Records</p>
          <h2>Incidents</h2>
          <p className="page-description">
            Log, review, resolve, and void chatter incidents.
          </p>
        </div>

        <button className="primary-button" type="button">
          Log Incident
        </button>
      </header>

      <section className="content-card">
        <div className="empty-state">
          <strong>Incident management is coming next</strong>
          <span>The backend API is already ready for this page.</span>
        </div>
      </section>
    </div>
  );
}

export default IncidentsPage;