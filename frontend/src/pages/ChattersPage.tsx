function ChattersPage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Team Management</p>
          <h2>Chatters</h2>
          <p className="page-description">
            Manage the chatters available for incident logging.
          </p>
        </div>

        <button className="primary-button" type="button">
          Add Chatter
        </button>
      </header>

      <section className="content-card">
        <div className="empty-state">
          <strong>No chatter data loaded yet</strong>
          <span>This will be the first page we connect to PostgreSQL.</span>
        </div>
      </section>
    </div>
  );
}

export default ChattersPage;