# Goals — reviewed design and implementation

Updated: 17 September 2026 (Asia/Bangkok). Implemented; browser acceptance passed by the user on 17 September 2026 (Asia/Bangkok).

## Repository and migration baseline

- Notification work committed in `e806b56`; reconciliation was already uncommitted and is preserved.
- Reconciliation files: backend/src/index.ts; frontend/src/pages/Transactionhistory.tsx; frontend/src/utils/transactionStatus.ts; backend/tests/reconciliation.database.test.ts; backend/tests/reconciliation.frontend.test.ts; RECONCILIATION_REPORT.md; SpendSense_PROJECT_CONTEXT.md.
- Existing seven untracked migration directories are applied migrations, not new Goals work. All eight old migration names exist on disk and SHA-256 checksums match the database.
- The remove_transaction_status migration has an old rolled-back attempt followed by a successful applied attempt, both with matching checksum. No unresolved failure.
- New migration: `20260916153000_add_goals_ledger`. Tested from an empty isolated database, then applied alone to SpendSense. Final migrate status: up to date.
- No reset, resolve, db push, manual _prisma_migrations edits, financial backfill or applied migration edits. Goals-only commit authorized after user acceptance; no push.
- Previous files were backed up under `.git/goals-baseline` for task-only comparison; this directory is not a deliverable.

## Persisted models

- Goal: name, Decimal target, optional date-only target, optional positive Decimal monthly plan, category/icon key, note, archivedAt, timestamps.
- GoalFundingSource: one opening source per user, or a stable income source. Opening sourceKey='opening'; income sourceKey='income:'+originalTransactionId.
- GoalLedgerEntry: append-only positive Decimal ALLOCATE/RELEASE; RELEASE references its original ALLOCATE lot; source snapshots include amount/date/type/description and opening revision ID.
- GoalOperation: append-only idempotency record, request hash, final response status/body, reason/correction reference. IDs/time/response prepared BEFORE the single INSERT; never UPDATE responseBody.
- GoalOpeningRevision: append-only before/after amount, cutoff, note and reason, including first setup.
- User and Transaction inverse relations only; existing transaction status conventions unchanged.

## Constraints and SQL triggers

Checks: goal_amounts, goal_category, source_shape, ledger_amount, ledger_kind, revision_amount, revision_reason, operation_success.

Triggers: goals_ledger_append_only; goals_operation_append_only; goals_revision_append_only; goals_source_identity_owner; goals_transaction_owner; goals_release_lot.

Composite FKs ensure ledger goal/source/operation/lot share the same user. The source ownership trigger validates live Transaction ownership at INSERT/UPDATE; the Transaction ownership trigger prevents changing its owner while referenced. The nullable single-column live Transaction FK uses ON DELETE SET NULL. It does not null source.userId or remove history. OriginalTransactionId is immutable and is not a live FK.

Unique (userId,sourceKey) plus the source shape CHECK gives exactly one opening source per user. Unique (userId,idempotencyKey) applies across operation kinds. Unique (operationId,sequence) identifies rows in a multi-lot operation.

## Financial rules and state

- No allocations from Profile.income or automatic conversion of Profile.goal; no new Transaction is created by Goals.
- saved = ALLOCATE sum - RELEASE sum; remaining=max(target-saved,0); overfunded=max(saved-target,0).
- Capacity is opening amount or the LIVE income amount. Available subtracts net allocations across every goal, including archived goals.
- Income dates <= opening cutoff are ineligible. Cutoff is end-of-day Bangkok represented as date-only UTC surrogate. Once opening has ever had ledger, cutoff stays locked even after complete release.
- Creating/moving an unused cutoff also rejects outstanding income allocations that would become ineligible.
- Opening amount corrections cannot go below reserved amount; changes have atomic revision and reason.
- Archive-only lifecycle; no hard-delete API. Archive blocks allocations but allows release/restore. It never releases money automatically.
- Calculated status precedence: completed; overdue; not_started when saved=0; active otherwise. not_started label is “ยังไม่มีเงินจัดสรร”. Archived remains separate.
- Reducing target below saved is allowed. Numeric progress can exceed 100%; bar capped at 100%; no automatic refund.
- Missing target date -> months=null. Past target -> months=0. Otherwise inclusive calendar months: (targetYear-currentYear)*12 + targetMonth-currentMonth + 1.
- Remaining=0 -> requiredMonthly=0.00. Positive months -> Decimal ROUND_CEIL to cents. Otherwise null. No divide-by-zero.
- Plan must be positive when present. Warn only when both plan and required amount exist and plan<required. No historical monthly-plan log.
- Allocation timestamp is server time; no backdating.
- Withdrawal selects outstanding ALLOCATE lots by createdAt,id ascending; one RELEASE per lot. Correction targets a specified erroneous lot, adds compensating entries atomically, and preserves original rows.

## API

Money is decimal STRING, date-only is YYYY-MM-DD, event timestamps ISO UTC. Auth supplies userId; client-supplied userId is rejected on Goals request bodies.

- GET/POST /goals; GET/PATCH /goals/:id
- POST /goals/:id/archive and /restore (no DELETE)
- GET /goals/:id/ledger
- POST /goals/:id/allocations {amount,source,reason?}
- POST /goals/:id/releases {amount,reason}
- POST /goals/:id/allocation-corrections {allocationId,amount,replacementSource?,reason}
- GET/POST /goal-funding/opening-balance
- POST /goal-funding/opening-balance/corrections {amount?,cutoffDate?,note?,reason}
- GET /goal-funding/opening-balance/revisions
- GET /goal-funding/incomes

Source: {type:OPENING_BALANCE} or {type:INCOME_TRANSACTION,transactionId}.

CREATE Goal, financial and opening writes require Idempotency-Key (8–100 ASCII letters/digits/_/-). Matching normalized request replays the original status/body, including concurrent retries. Reusing key with different payload ->409. Failed transaction rolls back the operation too. Replay body describes the old operation; UI refetches current state.

GET lists support limit (1–100, default30) and cursor. Goals also accept status and archived=exclude|only|include. Computed status is filtered before cursor slicing. Invalidated cursor ->400 INVALID_CURSOR. Multi-query reads use RepeatableRead snapshots.

Errors: 400 validation/key/cursor,401 auth,404 absent or other-account resource,409 state/capacity/cutoff/idempotency conflict,503 after exhausted retryable transaction conflicts;500 unexpected failure. Transaction endpoints retain compatible error:string plus code on Goals guards.

## Lock and Transaction integration

All relevant writes first SELECT the auth user's row FOR UPDATE in a Prisma interactive ReadCommitted transaction. One account per operation avoids cross-account lock order cycles. Capacity checks, eligibility, entries and operation persist together. Retry P2034 at most twice, then503. No network/notification producer inside lock.

Transaction CREATE uses same lock; UPDATE re-reads and guards in the lock; DELETE guards net allocation. With net>0 block delete, changing to expense, amount below net, or date<=cutoff. Other eligible edits remain allowed. At net0 ordinary edits/delete resume. Notification hooks run after commit as before.

The protocol governs application writers. Direct privileged SQL that bypasses it is not a supported financial writer; CHECK/unique alone cannot constrain all aggregate sums.

## Frontend

Reference: docs/mockups/Savings-goals-page.png. Shared UserHeader already includes NotificationBell. No duplicated bell or user data.

Card and list views, status/archive filters, create/edit/opening setup/correction, allocation/FIFO release/history/compensation, archive/restore, loading/empty/error/retry and native modal keyboard handling exist. No red annotation borders.

View preference is per user in localStorage. Session change remounts Goals state, aborts reads and rejects old responses. List load-more rejects old filter results. Shared Sidebar/AppLayout CSS supplies compact mobile navigation across protected pages; no page-specific navigation.

## Limits

- Browser acceptance passed by the user on 17 September 2026; no AI browser automation was run.
- Filtering is correct before pagination but reads all goals and computes aggregates before slicing; suitable for initial scale, not yet optimized for very large ledgers. Income picker/history currently load all pages.
- No cash-account ledger: source capacity is protected, actual spendable cash is not asserted.
- No Goals notifications, recurring allocation, queue or plan history added. Existing budget-notification lack of durable queue/event log remains unchanged.
- Vite reports bundle>500 kB; builds succeed.
- Disposable test databases are retained, not dropped. Tests only use explicit spendsense_goals_test_* databases for committed fixtures.

See GOALS_IMPLEMENTATION.md for executed tests, changed files and browser checklist.
