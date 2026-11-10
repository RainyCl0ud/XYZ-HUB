-- Run on a dedicated audit database under an XYZ-controlled administrator.
-- The Hub gets only the writer login. Set its password separately with
-- psql's \password xyz_hub_audit_writer and keep the admin login out of the Hub.
BEGIN;

CREATE ROLE xyz_hub_audit_writer LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
ALTER ROLE xyz_hub_audit_writer SET statement_timeout = '5s';
CREATE SCHEMA hub_protected_audit;
REVOKE ALL ON SCHEMA hub_protected_audit FROM PUBLIC;
GRANT USAGE ON SCHEMA hub_protected_audit TO xyz_hub_audit_writer;

CREATE TABLE hub_protected_audit.events (
  id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  event jsonb NOT NULL
);
REVOKE ALL ON hub_protected_audit.events FROM PUBLIC;
GRANT INSERT (id, occurred_at, event) ON hub_protected_audit.events TO xyz_hub_audit_writer;

COMMIT;
