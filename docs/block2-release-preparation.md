# Block 2 final staging batch

Keep the Staging Backend and Frontend on the `staging` branch and confirm the Backend database reference resolves to Staging Postgres. Keep the existing build, pre-deploy and start commands. Keep `CHAT_ANNOUNCEMENT_EMAIL_MODE=capture` and `CHAT_UNREAD_EMAIL_MODE=capture` during the rehearsal.

## Staging feature setup

- Enable `BLOCK2_CHAT_CHANNEL_CLEANUP_ENABLED` on Staging Backend after confirming the existing archive and export flags are on. Use an archived test channel and verify that the Owner has a saved export before confirming cleanup.
- Keep `BLOCK2_BACKGROUND_PUSH_ENABLED` off until a dedicated staging VAPID key pair and the XYZ contact address are configured in the Backend as `HUB_PUSH_PUBLIC_KEY`, `HUB_PUSH_PRIVATE_KEY` and `HUB_PUSH_CONTACT` (a `mailto:` address). Use the existing `BLOCK2_BROWSER_NOTIFICATIONS_ENABLED=true` setting. Save the private key in the Backend secret only. Test with opted-in accounts and registered browsers or devices.
- Enable `BLOCK2_ROLE_SCREENS_ENABLED` on Staging Backend for My Strikes. Set `BLOCK2_TRUSTED_STATUS_OPERATOR_ID` only after verifying the intended staging Ops account ID. This is an individual grant.
- For protected audit, run [the provisioning SQL](../backend/scripts/provision-protected-audit.sql) against a dedicated, XYZ-administered database. Set the writer password separately. Give the Hub only the `xyz_hub_audit_writer` connection in `HUB_PROTECTED_AUDIT_DATABASE_URL`. Use a hostname and certificate the Backend can verify and preserve independent administrator access. Enable `BLOCK2_PROTECTED_AUDIT_ENABLED` after the destination is ready. A destination failure leaves events pending for retry.

## Database and chat file backups

Run the backup from a controlled Staging Backend runtime with access to its attachment volume, the Staging private Postgres endpoint, an appropriate `pg_dump` version (same major as the server or newer) and an existing private backup directory outside the attachments volume. Set `BLOCK2_BACKUP_DIRECTORY` to that directory. Configure `BLOCK2_BACKUP_SSL_ROOT_CERT` if the server requires a private CA. If the database certificate cannot be verified for its private hostname, resolve certificate trust before running the backup.

```sh
npm run backup:block2 --workspace=backend -- create
npm run backup:block2 --workspace=backend -- verify /absolute/backup-root/YYYY-MM-DD
```

The command publishes one completed set per UTC day after copying and checking every attachment referenced by the database snapshot. Store completed sets in approved encrypted storage outside the application runtime with access limited to recovery operators. Configure one daily run, failure monitoring and a 30-day retention policy on that storage. Record the storage and runner costs before committing to paid resources.

## Restore rehearsal

Verify one completed set, then restore it into a newly created empty database used only for the rehearsal. Set `PGHOST`, `PGPORT`, `PGUSER` and `PGDATABASE` to the isolated target, and use a password file or the client prompt for authentication. Confirm the target before running the restore.

```sh
pg_restore --dbname="$PGDATABASE" --no-owner --no-acl --single-transaction /absolute/backup-root/YYYY-MM-DD/database.dump
```

Copy the verified `attachments` directory into the rehearsal application's private attachment directory. With email and push delivery disabled, check representative restored records and downloads, including an archived or cleaned-up conversation's retained files. Record the backup date, results and recovery time. Run the full desktop/mobile and permissions walkthrough after all staging features are available.
