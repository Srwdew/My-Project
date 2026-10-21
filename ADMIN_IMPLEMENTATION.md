# Admin implementation

## Approved scope and thesis mapping
The reference thesis pages 26–28 and 56 require administrator authentication, member summary/search and limited account metadata. Page 55 gives the general 30-expense/30-day readiness gate. The following precise definitions were approved in the conversation; they are not claims that the thesis specifies the implementation details.

- Normal members: User.role=USER and deletedAt IS NULL.
- Started: at least one current Transaction row, income or expense. Transactions are hard-deleted by the existing application; history/snapshots never contribute.
- Transaction count: all current income and expense rows, including future-dated rows; the date cutoff applies only to basic readiness.
- Basic readiness: at least 30 expenses dated on/before today's Asia/Bangkok calendar date; max date - min date + 1 >=30. Label: ความพร้อมข้อมูลพื้นฐาน. This does not promise all analysis modules are ready.
- New members: registrations in the current Bangkok calendar month through today. Counts exclude administrators and closed accounts.
- No amounts, transaction details, goals, budgets, financial Profile fields or authentication secrets in Admin responses.

## Schema and authentication
Additive migration 20261009010000_add_admin_role adds UserRole(USER,ADMIN), User.role default USER, nullable lastLoginAt and a member-filter/order index. Existing rows remain USER with null lastLoginAt; no fabricated login history. Existing schema changes and migrations are preserved.

Existing email/password login is retained. After password verification, finishLogin locks and rechecks the account, password hash, authVersion and closed state. It reads the role from the database, signs the token, updates lastLoginAt and conditionally records the normal-user Setup invitation in one transaction. ADMIN does not consume a Setup invitation. Login failures roll back. Regular authenticated reads do not update lastLoginAt.

The login response carries user.role for routing only: ADMIN -> /admin; USER retains Setup/Overview behavior. JWT/localStorage/request role does not authorize Admin access.
All /admin/* requests pass existing authentication and a fresh database role/version check. Data reads recheck under a user share lock within RepeatableRead, serializing with CLI role updates and account closure. Anonymous/revoked sessions receive 401; ordinary members receive 403. Authorization/database failures never fall through. Existing financial API ownership remains unchanged.

## API
- GET /admin/summary: asOfDate, timezone, readinessLabel, totalMembers, newMembers, startedMembers, basicReadyMembers.
- GET /admin/users?q=&limit=25&cursor=<id>: asOfDate, items, hasMore, nextCursor.
- Each item has exactly id, displayName, email, createdAt, lastLoginAt, transactionCount, basicReadiness.
- Query keys are strictly validated; limit is 1–100, search length <=120. Literal case-insensitive substring search by ID/name/email escapes LIKE wildcards and uses bound SQL parameters.
- Keyset order is createdAt DESC,id DESC. Cursor must remain an eligible member matching the query, otherwise 400 and restart search. Concurrent inserts do not provide a frozen cross-page snapshot; each request has its own consistent snapshot.
- SQL aggregates only counts/dates. No amount columns or financial-detail joins. List aggregation is bounded to the requested member page plus one row.
- Responses are private,no-store. No public role-management endpoint exists.

## UI
/admin is a separate protected page; refresh/direct URL validates against the API, not stored role. It has summary cards, search, pagination, null-last-login text, loading, empty, errors/retry and Forbidden. User/session changes abort pending requests and clear results. Table scrolls within its region on mobile and is keyboard focusable. No financial drilldown/actions.

## Operator CLI: preview, bootstrap, rotation and recovery
Entry: backend/src/cli/admin.ts. Run from backend with node --import tsx src/cli/admin.ts.
The operator must have trusted local OS access and explicitly provided database credentials. This is not a web-user authentication mechanism. Do not share database credentials with ordinary members.

No .env is loaded and no default target is selected. DATABASE_URL must be explicitly supplied out of band, and --database-name plus --database-host (host:port) must match it. Commands default to read-only preview. Never put a password in these documented command examples.

Bootstrap preview:
```text
node --import tsx src/cli/admin.ts --mode bootstrap --target-id <existing-user-uuid> --target-email <exact-email> --database-name <approved-test-db> --database-host <host:port>
```
Execution adds --execute --confirm bootstrap:none:<target-id> after reviewing output.

Rotation:
```text
node --import tsx src/cli/admin.ts --mode rotate --previous-id <current-admin-uuid> --previous-email <exact-email> --target-id <existing-user-uuid> --target-email <exact-email> --database-name <approved-test-db> --database-host <host:port>
```
Execution adds --execute --confirm rotate:<previous-id>:<target-id>.
Recovery uses --mode recover and the corresponding confirmation; unlike rotate, it permits the explicitly identified previous Admin to already be closed. It does not reopen that account.

All modes reject a closed target or mismatching identity. Bootstrap refuses another existing Admin, including a closed Admin, directing the operator to explicit recovery. Rotation/recovery require exactly the expected previous Admin and a distinct existing USER target. Unexpected multiple-admin state is refused for manual investigation, not silently corrected.
A global advisory transaction lock serializes commands; ordered account row locks serialize login/closure. Both role changes commit atomically. Changed accounts increment authVersion, invalidating old sessions; the target must log in again. Same completed operation replay does not increment again. Passwords, deletedAt, identities and financial/history data are not modified.
Only synthetic isolated PostgreSQL accounts were used for CLI tests; no application/production migration or CLI execution was performed.

## Verification (AI, not User Acceptance)
- Additive upgrade from 19 to 20 migrations on a dedicated postgres:16 container: existing account columns byte/value-preserved; USER/null defaults verified. Prisma migrate status: database schema is up to date.
- Admin HTTP/PostgreSQL/actual CLI suite: 8/8 passed, including concurrent bootstrap/rotation, replay, wrong/closed identity, recovery, authVersion revocation, mass-assignment rejection, literal search/pagination, response allowlist, readiness 29/30 x 29/30, future income/expense, Bangkok month boundary and leap date.
- Financial table fingerprints (Transaction, Goal, Budget, GoalLedgerEntry, AnomalyEvaluation, AnomalyDecision) unchanged by CLI rotation/recovery.
- Existing Settings/Setup/invitation regression on a separate fresh test database: 12/12 passed, including atomic first-login invitation and password session revocation.
- Chrome API-double tests: summary/search/pagination, null last login, error/retry, 403/revoked role, late old-session responses, existing login redirects, keyboard and 390px viewport: passed.
- Backend and frontend builds passed. Existing frontend >500kB chunk warning remains (main JS about 685.20 kB, gzip 183.54 kB).
- User Acceptance is recorded separately below; automated results above are AI verification only.
- Test databases are retained for inspection, no reset/drop of existing databases. CLI and migrations were never run on application/production.

To rerun database tests, provide an explicitly isolated fresh database named spendsense_admin_test_* with ADMIN_TEST_DATABASE matching the name, deploy migrations only there, then run node --import tsx --test tests/admin.database.test.ts. CLI tests intentionally require a fresh no-admin fixture database; do not rerun against retained acceptance accounts. Browser tests: node tests/admin.browser.cjs with a running frontend and API doubles.

## User Acceptance: PASS

The user confirmed Admin User Acceptance as PASS in this conversation. No acceptance date, time, numerical observations or additional scenario outcomes were supplied, so none are asserted here.

Scope limitation: acceptance used an isolated test database containing only one USER account (and one ADMIN account). Multi-page pagination was not manually verified by the user. Automated pagination evidence above is separate and does not replace this missing manual coverage.
