# XYZ Hub - QA & Incident Tracking Data Model

## V1 Entities

### Chatter

Represents an individual chatter.

Fields:

- id
- name
- status
- createdAt
- updatedAt

Chatters are never deleted as part of normal operations.
Former chatters are marked inactive so historical incidents remain available.

---

### Rule

Represents a strike reason or policy rule.

Fields:

- id
- isActive
- archivedAt
- createdAt
- updatedAt

Rules are archived rather than deleted.

---

### Rule Version

Stores the historical wording and configuration of a rule.

Fields:

- id
- ruleId
- versionNumber
- title
- definition
- severity
- weight
- createdAt

Editing a rule creates a new Rule Version.
Existing versions are never modified by normal application operations.

---

### Incident

Represents a QA or strike incident associated with a chatter.

Fields:

- id
- chatterId
- ruleVersionId

- ruleTitleSnapshot
- ruleDefinitionSnapshot
- severitySnapshot
- weightSnapshot

- occurredAt
- details
- evidenceUrl

- status
- resolutionNotes
- resolvedAt

- createdAt
- updatedAt

Incidents preserve a snapshot of the applicable rule when they are created.

---

## Incident Statuses

- OPEN
- RESOLVED
- VOIDED

---

## Chatter Statuses

- ACTIVE
- INACTIVE

---

## Severity Levels

- LOW
- MEDIUM
- HIGH
- CRITICAL

Severity is optional until management confirms its use.

---

## Relationships

One Chatter can have many Incidents.

One Rule can have many Rule Versions.

One Rule Version can be referenced by many Incidents.

Each Incident belongs to one Chatter and one Rule Version.

---

## Future Authentication

A future User account will be able to reference a Chatter ID.

This will allow chatter users to see only incidents associated with their own Chatter record without changing the incident data model.

Future roles may include:

- ADMIN
- SUPERVISOR
- CHATTER

Authentication is not part of V1.