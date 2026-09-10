function ConfigurationPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Configuration</p>
          <h2>Severity & Weight</h2>
          <p className="page-description">
            Configure the severity and strike-weight options used by rules.
          </p>
        </div>
      </header>

      <div className="two-column-grid">
        <section className="content-card">
          <div className="card-header">
            <div>
              <h3>Severity Levels</h3>
              <p>Manage severity options used by rules.</p>
            </div>

            <button className="secondary-button" type="button">
              Add Severity
            </button>
          </div>

          <div className="empty-state">
            <strong>No severity data loaded</strong>
          </div>
        </section>

        <section className="content-card">
          <div className="card-header">
            <div>
              <h3>Strike Weights</h3>
              <p>Manage configurable strike values.</p>
            </div>

            <button className="secondary-button" type="button">
              Add Weight
            </button>
          </div>

          <div className="empty-state">
            <strong>No weight data loaded</strong>
          </div>
        </section>
      </div>
    </div>
  );
}

export default ConfigurationPage;