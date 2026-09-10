function RulesPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Policy Management</p>
          <h2>Rules & Strike Reasons</h2>
          <p className="page-description">
            Manage rules while preserving their complete version history.
          </p>
        </div>

        <button className="primary-button" type="button">
          Add Rule
        </button>
      </header>

      <section className="content-card">
        <div className="empty-state">
          <strong>No rules loaded yet</strong>
          <span>We will connect this page to the Rules API.</span>
        </div>
      </section>
    </div>
  );
}

export default RulesPage;