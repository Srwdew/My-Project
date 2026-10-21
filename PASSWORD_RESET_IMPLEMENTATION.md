# Password recovery implementation

## Scope and approval
The reference thesis, C:/Doc Project/รวมเล่ม (3-67).pdf, page 7 section 2.2.2.1, requires a password-recovery link on the login page. Token mechanics, rate limits and mail delivery are additional security design choices, not requirements attributed to the thesis.
The user approved additive migration and 15-minute single-use tokens. The owner has approved Gmail API and SMTP adapters with one configured provider at a time. Real mail delivery remains disabled until deployment configuration is completed. The numerical rate policy below is a proposal for isolated tests, not an approved production rollout.

## Proposed rate policy (proposal-v1)
| Scope | Limit | Reason |
| --- | --- | --- |
| Request per normalized email | 1 / 60 seconds and 5 / hour | Reduce repeated email delivery while allowing retries |
| Request per socket IP | 20 / 15 minutes | Limit multi-address abuse, with allowance for shared networks |
| Reset per socket IP | 30 / 15 minutes | Limit token attempts without account lockout |
| Reset per token subject | 5 / 15 minutes | Limit repeat attempts even across source IPs |

PostgreSQL atomic upsert counters use fixed windows and database time. A boundary may permit bursts across two windows; these are not rolling-window guarantees. IP comes from the socket, not client forwarding headers. Behind a proxy this groups users at the proxy IP; trusted proxy configuration and policy review are required before any nonlocal rollout.
The limiter key must remain stable across process restarts. Changing it resets the derived subjects; rotate only with a deployment plan. Counter subjects are keyed HMACs, never plaintext email/IP/token. IP throttling returns 429; email throttling still returns the generic 202 message. These controls do not change the existing registration endpoint's duplicate-email response.

## Data and atomicity
Migration 20261009020000_add_password_reset adds only PasswordResetToken and PasswordResetRateLimit plus indexes, checks and a User FK. No existing row is backfilled or financial schema changed.
Token: 32 cryptographically random bytes, base64url encoding; only SHA-256 stored, unique tokenHash. Expiry is exactly creation statement time + 15 minutes. The record captures authVersionAtIssue. Tokens are bound to a user; body fields cannot choose a different user or role.
A reset locks User in the same order as login/password change/account closure, checks closed state and version, and conditionally consumes one live token. Password hashing, authVersion increment and revocation of other tokens commit atomically (the expensive bcrypt computation happens before acquiring the row lock). Any database failure rolls back consumption and password changes. Two simultaneous submissions cannot both succeed.
Password reset does not change role, lastLoginAt, financial data or Anomaly history. Existing sessions fail the existing database authVersion check. Closed accounts and tokens issued before password/role changes are rejected. A new reset request alone does not invalidate earlier delivered links; successful reset invalidates all of them.
Existing password convention is retained: at least 6 characters and at most 72 UTF-8 bytes for bcrypt, matching authenticated password change. No new password policy is silently introduced.

## HTTP and UI
- POST /auth/forgot-password: normalize email; strict input; generic 202 for active/missing/closed/throttled email.
- POST /auth/reset-password: token, newPassword, confirmPassword; success requires a fresh normal login.
- Both are public and no-store. The scoped 8 KB JSON parser redacts errors rather than passing input fragments to the default error logger.
- /forgot-password and /reset-password are public routes; login includes a recovery button.
- The token is read from a fragment and removed from the address bar. It is kept only in component memory, never storage. Refresh requires reopening the email link. Requests use no-referrer and do not include a session Authorization header.
- Loading, explicit submit, duplicate-click guard, mismatch/invalid/expired errors and success state are visible. Reset does not auto-login.
- A timeout can occur after a successful commit. A retry with the same token is rejected; the user can try normal login with the new password or request another link.

## Original local-test configuration (historical; superseded by current configuration below)
The runtime factory fails closed unless ALL conditions hold:
- PASSWORD_RESET_MODE=local-test, NODE_ENV is not production.
- DATABASE_URL hostname is loopback and database name starts with spendsense_reset_test_.
- RESET_TEST_DATABASE exactly equals that database name.
- PASSWORD_RESET_POLICY=proposal-v1 is explicitly set.
- PASSWORD_RESET_LIMITER_KEY has at least 32 characters (supply out of band; never commit).
- PASSWORD_RESET_ORIGIN is a bare loopback HTTP origin, with no credentials/query/fragment.
- PASSWORD_RESET_SINK_URL is http://127.0.0.1:<port>/messages or the IPv6 loopback equivalent; redirects are rejected.

No .env file or existing configuration was changed. The test helper localResetSink.ts binds loopback, holds at most 100 messages in memory and has no public inbox/list endpoint or file/console mail output. Browser tests inspect that inbox in the test process, never through a production endpoint.
Requests queue bounded in-memory delivery work after the HTTP response path. Plain tokens exist transiently in memory for delivery only. Delivery errors emit only PASSWORD_RESET_DELIVERY_FAILED and revoke the token where the database is reachable. If the process stops before delivery, the user requests another link. There is no persisted raw-token email queue and no promise of durable mail delivery.
If revocation after a delivery failure also encounters a database failure, a hash record may remain live until its 15-minute expiry; raw token is still not persisted. A provider timeout could mean delivery occurred. This is another reason production delivery remains disabled.

## Original production follow-up (see current release gates below)
Select/review provider, sender/domain ownership, HTTPS origin, provider retention/log settings and environment credentials. The provider necessarily sees recipient and reset link. Do not log mail bodies, token-bearing URLs, passwords or raw provider errors. Decide notification email after reset, delivery failure/retry operations and an expired-token/rate-row cleanup schedule. No OS cleanup job, production provider or production rollout is installed here. Current expired rows remain in the isolated test database for inspection; production retention/cleanup is not claimed complete.

## Verification
Automated verification results are recorded below. User Acceptance is recorded separately and is based only on the user confirmation in this conversation.
The initial test harness ran from backend and triggered the existing dotenv.config() read of .env. Its explicit DATABASE_URL still targeted the verified isolated test database, and no secret values were displayed. Subsequent runs use a temporary working directory without .env and an absolute TS loader; no application/production database was accessed.

### Prior AI verification (not User Acceptance)
- Command: node backend/tests/runPasswordReset.cjs --with-regressions (frontend available at http://127.0.0.1:5173).
- Runner creates new isolated PostgreSQL resources, generates connection credentials in memory only, uses a temporary working directory and absolute TS loader, and retains test data. No reset/drop, production CLI, or application migration.
- Container: spendsense-reset-test-1791623257728-3bbf67, loopback port 57893.
- Databases: spendsense_reset_test_1791623257728_3bbf67, spendsense_admin_test_1791623257728_3bbf67, spendsense_goals_test_1791623257728_3bbf67.
- All three: 21 applied migrations, 0 pending; Prisma migrate status up to date. Additive 20-to-21 upgrade preserved an existing synthetic User row exactly.
- Reset HTTP/PostgreSQL/local-mail/Chrome suite: 16/16 passed, 6.57 seconds. Covers hash-only storage/15-minute TTL, neutral account responses, repeat/concurrent consumption, expiry/closed/version invalidation, transaction rollback, session revocation, real financial-row fingerprints unchanged, delivery failure with safe logs, input and 8 KB body checks, rate boundaries/concurrency, recreated service using persisted counters, and forwarded-header bypass denial.
- Real Chrome uses the existing frontend and remaps its API origin to the isolated real HTTP listener; API responses are not mocked. Local inbox is inspected only inside the test process. Desktop/390px, keyboard Enter, explicit submit/no auto-reset, duplicate submit, same-tab link reopening, token stripping/no browser storage, used-token error and refresh behavior passed.
- A browser-discovered same-tab link issue was fixed: new fragment links clear the prior result, and response versions prevent an earlier request from overwriting the new link state.
- Admin regression: 8/8 passed, 18.31 seconds. Settings regression: 10/10 passed, 5.72 seconds.
- Backend TypeScript build passed. Frontend TypeScript/Vite build passed using a temporary config with envDir:false; main JS 689.46 kB, gzip 184.54 kB. Existing >500 kB warning remains; no dependency added.
- These automated results do not establish real-email delivery, external provider verification, a statistical timing-side-channel audit, production rate-policy approval, or User Acceptance.

## User Acceptance: PASS

The user confirmed Password Reset User Acceptance as PASS based on their testing reported in this conversation. This confirmation is separate from the automated/AI verification above.

No acceptance date, time, numerical results or additional scenario outcomes were supplied by the user, so none are added here. This acceptance record does not authorize real-email delivery or production rollout, and does not change the pending provider and production rate-policy decisions.

## Production-capable adapters (current implementation; rollout remains OFF)

The local/test implementation above is retained. Production adapters are implemented but **no production account, OAuth credential, SMTP server or real email delivery has been configured or verified by this work**. Existing User Acceptance PASS remains the earlier local flow, not acceptance of these new providers.

Defaults: `PASSWORD_RESET_ENABLED=false`, `PASSWORD_RESET_MAIL_PROVIDER=local`. Missing ENABLED is disabled. Legacy MODE alone no longer enables recovery. Exactly one provider (`local`, `gmail`, `smtp`) is selected; comma lists/unknown providers are rejected. Development/test factory permits only local sink; production rejects local and never falls back. There is no Google sign-in or end-user Google account linking.

### Configuration and startup readiness
Set deployment environment/secret manager values before starting the process; do not place credentials in Git or pass them on CLI arguments. Startup validates enabled reset configuration and aborts on invalid configuration. Diagnostics include fixed config field names only. This is configuration validation, **not** verification of remote credentials, sender ownership or delivery health. Disabled reset endpoints return 503.

| Setting | Required action |
| --- | --- |
| PUBLIC_APP_ORIGIN | Exact origin without trailing slash/path/query/userinfo; HTTPS in production |
| PASSWORD_RESET_ALLOWED_ORIGINS | Comma-separated exact approved origins; public origin must match one; never use request Host |
| PASSWORD_RESET_LIMITER_KEY | Stable high-entropy secret, at least 32 characters; identical on all backend instances |
| PASSWORD_RESET_TRUSTED_PROXIES | Explicit `none` for direct connections, or comma-separated exact proxy IP addresses (not wildcard/hop count); owner must verify topology |
| PASSWORD_RESET_FROM | Single valid sender email address; owner must verify permission to send from it |
| PASSWORD_RESET_MAIL_PROVIDER | Select gmail OR smtp in production |
| PASSWORD_RESET_ENABLED | Keep false until all deployment and policy checks below are completed |
| NODE_ENV | production for production deployment |

All production rate values are **owner decisions, not approved defaults**. Configure a positive integer `_LIMIT` and `_WINDOW_MS` for each prefix:
- `PASSWORD_RESET_REQUEST_IP`
- `PASSWORD_RESET_EMAIL_SHORT`
- `PASSWORD_RESET_EMAIL_LONG`
- `PASSWORD_RESET_RESET_IP`
- `PASSWORD_RESET_RESET_TOKEN`

No production number is inferred from proposal-v1. PostgreSQL counters and stable keyed subjects are shared by instances and persist through restart. Fixed-window boundary bursts remain a limitation. Retry-After derives from the applicable configured window. Trust checks start at the socket peer and walk forwarding addresses from right to left only through explicitly trusted addresses. Untrusted peers cannot select an IP using X-Forwarded-For. The reverse proxy must remove/normalize forwarding headers and prevent direct bypass; exact IPv4/IPv6 spellings must match deployment.

Local opt-in additionally requires `PASSWORD_RESET_MODE=local-test`, `PASSWORD_RESET_POLICY=proposal-v1`, `RESET_TEST_DATABASE` matching a loopback `spendsense_reset_test_*` database, `PASSWORD_RESET_SINK_URL` and the public origin/allowlist/proxy settings above. The integration test runner injects a service connected to its new isolated database and local sink; it does not activate a deployment.

### Gmail API setup — owner performs these steps
1. In the owner's Google Cloud project, enable Gmail API and configure the OAuth consent screen/application audience. Use a dedicated service sender mailbox.
2. Create an OAuth client of the appropriate type for the owner's administrative authorization tool. Register its exact authorized redirect URI. This is an operator setup tool, not a SpendSense end-user login route.
3. Authorize the sender with only `https://www.googleapis.com/auth/gmail.send`, requesting offline access. Obtain a refresh token using the owner's secure OAuth flow. Do not use broader read/modify-mail scopes. Follow Google's publishing/verification requirements and token-expiration rules for the selected audience.
4. Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` in the deployment secret manager/environment. Set PASSWORD_RESET_FROM to an address the authenticated sender is permitted to use.
5. Adapter refreshes an access token against Google's fixed OAuth endpoint, then calls `users/me/messages/send` with base64url MIME. No message-read scope or Google login UI is added.
6. Owner verifies credentials, sender permissions and delivery in their approved staging environment before production enablement. No authorization or verification was performed against a real Google account here.

References: [Gmail send method](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth offline access](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

### SMTP setup — owner performs these steps
Configure `SMTP_HOST`, `SMTP_PORT` (465 implicit TLS or 587 required STARTTLS), `SMTP_USER`, `SMTP_PASSWORD`, and PASSWORD_RESET_FROM. Obtain credentials through the owner's provider process; verify sender/domain ownership and provider SPF/DKIM/DMARC instructions. TLS >=1.2 with certificate validation is mandatory; plaintext port 25 and certificate bypass are not supported. File/URL content loading and transport debug logging are disabled. No SMTP server was contacted by tests; tests inject a mock transport.

Reference: [Nodemailer SMTP transport](https://nodemailer.com/smtp). Nodemailer is an added backend dependency; no financial schema change is needed.

### Delivery semantics and operational limits
Only one provider send attempt is made per issued link; there is no automatic retry, fallback provider, or resend after an ambiguous timeout. Gmail refresh/send and SMTP stages have bounded timeouts. A timeout may occur after provider acceptance; retrying cannot guarantee exactly-once delivery, so the service revokes the issued token when possible and the user requests a fresh link subject to rate limits. Provider errors are replaced by a fixed error code. Logs contain only DELIVERY_SUCCEEDED / DELIVERY_FAILED, no recipient, body, credentials, password or reset URL.

The bounded queue remains in memory, without persisted plaintext tokens. Process failure before delivery requires a fresh request. This intentionally does not promise durable or exactly-once email delivery. Hash-only tokens expire in 15 minutes; revocation during DB failure cannot be guaranteed before expiry. Owner must monitor failure counts and decide retention/cleanup for expired token and limiter rows (no cleanup schedule installed here).

### Frontend/deployment checks before enablement
The existing public forgot/reset forms remain, with fragment token removal, no-referrer requests, no browser token storage, explicit submit and no auto-login. Session/link changes suppress stale response messages. API responses send Cache-Control:no-store and Referrer-Policy:no-referrer.

The frontend is served separately from the API. The hosting/CDN owner must set no-store and no-referrer headers on /forgot-password and /reset-password HTML, exclude these pages from analytics/session replay and avoid caching request bodies or logging fragments/tokens. No production hosting config exists here to verify those headers. Token fragments are not sent to the web server; they are cleared after the component reads them. Do not install analytics that reads the URL before that point. Provider credentials, external sending, production rate policy, sender/domain validation and deployment headers remain release gates.

### Current automated verification
Results for the current changes are recorded separately below. All accounts/data are synthetic. Provider tests use mocked network/transport; real HTTP/browser tests use local sink and a newly created PostgreSQL container. No application/production or existing UAT database is used.

#### Results of this implementation round
- Provider/config/proxy unit tests: **7/7 PASS** (mock fetch/SMTP transport only; no external mail).
- Final PostgreSQL/HTTP/local-sink/browser run: **19/19 PASS**, suite 10.10 seconds (runner 11.88 seconds).
- Final isolated target: container `spendsense-reset-test-1791978838549-ea9a62`, `127.0.0.1:56770`, database `spendsense_reset_test_1791978838549_ea9a62`. **21 applied migrations, 0 pending**, migrate status up to date. Existing synthetic User preserved during additive upgrade. No new schema or migration was required for these adapter/config changes.
- Reset coverage includes existing/missing/closed neutral replies; host injection; no-store/no-referrer; valid/expired/used/invalid and multiple tokens; concurrent consumption; rollback; account lock with closure/version change; authVersion revocation; unchanged populated Transaction/Goal/Budget/GoalLedgerEntry fingerprints; two services sharing counters; independent new Node process observing persisted quota; forwarding spoof denial.
- Restart isolation uses a test-only long fixed window to avoid rollover during child startup. An earlier restart assertion using the short window failed; the final isolated test passes. Existing proposal-v1 quota/boundary tests remain. No production rate numbers were chosen.
- Browser uses real isolated HTTP/PostgreSQL and in-memory mail sink: desktop1440/mobile390, keyboard, duplicate submit, token stripping/no storage/no token in request URL or headers, used-token/refresh states, reduced-motion preference and suppressed stale response after session switch. No UAT login or real user data was used.
- Admin regression **8/8 PASS** (suite 9.72 seconds); Settings regression **10/10 PASS** (suite 3.45 seconds), on separately created databases `spendsense_admin_test_1791973395344_420049` and `spendsense_goals_test_1791973395344_420049`, port56782. Both 21 migrations, 0 pending. These include registration/mass-assignment, login, role/session and authenticated password-change coverage.
- Backend TypeScript and frontend TypeScript/Vite builds passed. Frontend build used envDir:false; DB test processes ran in a temporary directory with no .env file and explicit synthetic test connection settings. No existing .env or credential file was read.
- Git diff --check passed. User Acceptance recorded earlier is unchanged; no new production or provider acceptance is claimed.
- External Gmail/SMTP delivery, credentials, TLS handshake against a real provider, production reverse proxy/CDN headers, retention schedule and approved production limits remain operator verification/configuration tasks. No real Google authorization, production database connection, or real mail send was performed.
