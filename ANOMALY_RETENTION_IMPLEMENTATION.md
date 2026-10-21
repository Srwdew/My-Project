# Experiment retention and purge ? 8 October 2026

## Deployment status
Infrastructure implemented; collection and automatic amount matching remain disabled.
No task installed, no application connection, no real backup/export deleted.
Pair candidate/answer schema and endpoints do not exist yet. This change does NOT implement
or enable them. withdrawExperiment purges the empty database experiment store and refuses
unknown future tables until a reviewed deletion adapter is installed. Main history triggers
and tables are never deleted/updated by retention. Account close still soft-deletes User.

## Controlled-location inventory (metadata inspection only)
- C:/Users/zuxas/AppData/Local/SpendSense/backups/2026-09-24T15-49-09-837Z/
  before-anomaly-review.dump, before-fingerprint.json, after-fingerprint.json, deploy.log.
  Pre-consent; excluded and protected. No dump content read.
- C:/Users/zuxas/AppData/Local/Temp/spendsense-tolerance-experiment-EW6q1r/
  scope.json; authorized/report.md and report.json; authorized-final/report.md and report.json;
  synthetic/report.md and report.json; synthetic-final/report.md and report.json.
  Legacy artifacts remain untouched. Consent scope contains account identifiers; inventory
  is not proof of anonymization. Register relevant artifacts with verified createdAt/owners
  before any real cleanup. Do not infer trustworthy creation time from filename or mtime.
- Repository filename search found no further matching dump/backup artifacts.
- Compose controls a persistent PostgreSQL volume, not its host snapshots/backups.
- Cloud sync, Docker disk snapshots, external copies and user-copied exports are unverified.
  No scheduled project cleanup found in the inspected Windows tasks.
  These limitations prevent inventory_verified and restore_verified being approved.
No collection may be enabled until controlled-copy inventory and external-copy plan are reviewed.

## Policy
Maximum backup lifetime = createdAt + 30 * 24 hours, calculated in UTC, not withdrawal + 30 days.
Expiry does not mean deletion. Present/failed records block completion until deletion/absence
is verified at a managed path. Export files are eligible immediately after withdrawal.
Pre-consent artifacts (before 2026-10-07T14:22:28.000Z) cannot be deleted by this cleaner.
Database and file operations cannot be one atomic transaction; missing files are rechecked
on retry after a crash between unlink and database commit.
No recursive delete. Reject out-of-root files, directories and symbolic links.
An operator must prevent concurrent path replacement in a managed root; filesystem ACL
hardening/OS snapshot control is an outstanding deployment requirement.

## States
- stopped: stopped collecting; DB not confirmed purged OR inventory not verified.
- waiting_backups: DB purged and inventory verified, but related artifacts remain.
- complete: DB purged, inventory verified, every related artifact verified deleted.
Unknown inventory is never silently treated as empty inventory.
Metadata retained: account ID, withdrawal time, DB purge time, artifact membership/path,
creation/deletion time and generic failure code. No amounts, answers or transaction snapshots.
Account IDs are needed to replay withdrawals; metadata is not claimed anonymous.

## API and account closure
POST /settings/experiment/withdraw authenticates the current account, ignores no foreign
account selector, and uses the same account locking/session validation as Settings.
POST /auth/close-account commits account closure first, then attempts separate maintenance (see account closure section below).
The new schema lives in experiment_retention and is accessed using parameterized SQL;
no Prisma-generated model or existing main-history schema is changed.
If retention schema is absent, collection is still hard-disabled and status is stopped.
Future candidate/answer writes MUST share consent locking and purge adapter; they are not
implemented by this retention task.

## Cleanup tools ? explicit isolated database only
From backend, with an explicitly verified test DATABASE_URL (never load .env):
- node --import tsx experiments/experimentRetentionCleanup.ts inventory ROOT
  Lists metadata only; no reads of file contents.
- node --import tsx experiments/experimentRetentionCleanup.ts register SCOPE_JSON ROOT MANIFEST_JSON
  Manifest array entries: path, kind (backup/export), verified createdAt, accounts.
  Validates exact test DB/loopback and account allowlist; no pre-consent registration.
- node --import tsx experiments/experimentRetentionCleanup.ts cleanup SCOPE_JSON ROOT
  Dry run, no unlink.
- Add --execute only after reviewing paths. No live-file execution was performed here.

Manual cleanup is implemented, NOT installed as a scheduler. Proposed future task scope:
invoke this CLI with an explicit database scope/root; no admin shell, no application DB,
run at startup and on a periodic schedule, and expose overdue/failure state.
A periodic task alone cannot guarantee deadlines while the host is offline. Do not enable
collection until availability/cleanup monitoring and restore procedures meet the policy.
No Windows Task Scheduler changes were made.

## Restore
replayWithdrawals accepts the externally preserved minimal withdrawal ID list and replays
it in a transaction before experimental admission. restore_verified stays false and
collection stays disabled even after replay. This does not prove the supplied list complete.
An independent withdrawal-journal location, its durability and restore operator process
still require review; do not restore/open collection relying only on a journal in the same backup.
No restore of a real backup was performed or dump opened.

## Exports
Authorized-data file export in anomalyToleranceReport is blocked before reading scope/data.
Synthetic calculation export remains available. No new permanent account/pattern report
is produced. A consent-filtered aggregate reporting API is not yet implemented.
Legacy files were inventoried, not deleted.

## Verification (AI only)
New PostgreSQL migration SQL was executed only on spendsense_goals_test_anomaly_dim.
This was SQL validation, not a Prisma migrate deploy on application; no .env was read.
Tests: experimentRetention.test.ts covers exact expiry, pre-consent protection, failure/retry,
temporary export deletion, pending/completed/unknown-inventory status, concurrent disabled
admission, withdrawal replay, blocked real-data export and actual HTTP account closure.
All deleted files were synthetic files in freshly created OS temp directories.
The pair workflow remains absent, so successful answer/export racing against withdrawal
cannot yet be validated end-to-end. No user acceptance claimed.

## Account closure decoupling (8 October 2026)
The earlier same-transaction coupling is replaced: password verification, deletedAt and
incrementing authVersion commit in the original Settings transaction. Only after commit,
retryClosedAccountExperiment runs a bounded, separate maintenance transaction. SQL failure
returns logout:true plus experimentPurge:{status:'stopped',retryPending:true}; it cannot
undo the committed account closure. No raw SQL error or account identifier is logged.

User.deletedAt plus missing/null subject.database_purged_at is the durable pending marker.
It survives a crash before the immediate maintenance attempt. No new schema/migration.
Maintenance permits closed accounts, uses FOR UPDATE SKIP LOCKED plus the existing global
experiment advisory lock (nonblocking acquisition), and skips already DB-purged work.
An existing database purge timestamp never means backup deletion or full completion.
Repeated attempts preserve that timestamp and do not duplicate subject rows.

Manual restart/retry command, from backend with an explicitly verified test DATABASE_URL:
node --import tsx experiments/retryClosedAccountExperiment.ts --scope LOCAL_SCOPE_JSON
This is dry-run by default. Add --execute to retry only accounts allowlisted in that scope.
The scope must match the isolated test database/loopback address; no .env is loaded.
Output contains counts only. No files are removed, no migration applied and no history is
purged. No scheduler is installed; pending jobs require explicit maintenance invocation.
Do not run against the prior backlog until its separate handling has been reviewed.

AI verification: closedAccountExperiment.database.test.ts exercises real HTTP/PostgreSQL
success, wrong password, injected SQL failure after main commit, new-process CLI retry,
idempotence, overlapping workers and unchanged main-history/pre-existing-retention rows.
Only new synthetic accounts are processed. The nine legacy experiment files are untouched.
Existing experiments remain disabled. No User Acceptance is claimed.
