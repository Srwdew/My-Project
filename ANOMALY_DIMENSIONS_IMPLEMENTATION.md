# Anomaly dimension decisions and manual patterns

Implementation/test record: 6 October 2026 (Asia/Bangkok).
Base HEAD: `f8e8237d17edcff56a610635d8dec1ee23f7902f`.
This is a new working-tree implementation. No files have been staged or committed.
This document supplements, and does not replace, the existing locally modified
`ANOMALY_IMPLEMENTATION.md` and project-context acceptance records.

## Requirements versus implementation policy

The user explicitly supplied the following Anomaly-specific policy in this conversation.
It is not a Forecast readiness rule and is not attributed to the project book.

| Check | Contract |
| --- | --- |
| Global Gate | At least 30 own-account expense transactions; first-to-last transaction dates span at least 30 inclusive calendar days |
| Historical boundary | Only dates strictly before the evaluated transaction's date; never the target transaction, same date, or future |
| Amount readiness | At least 30 eligible records, 10 distinct transaction dates, first-to-last difference at least 28 days |
| Time readiness | At least 60 confirmed times, 20 distinct dates, difference at least 42 days, confirmed-time coverage at least 80% |
| Fallback | Independently per dimension: ready category baseline, otherwise ready own-account baseline; otherwise not_evaluated |
| Window | Existing scoring window of 180 prior calendar dates remains unchanged |
| Scoring | Existing modified-Z/IQR/constant-series rules, strict thresholds and time-frequency rules remain unchanged |

The Global Gate uses inclusive days (max minus min plus one); dimension span uses the existing
exclusive difference (max minus min). Time coverage is confirmed eligible times divided by
the time-dimension eligible population, independently of amount exclusion. Tests explicitly
distinguish these contracts. Before Gate, there is no scoring, flag or decision prompt.
If Gate passes but one dimension is unready, only that dimension remains not_evaluated.

Additional implementation policy, not a claim about the book:
- Bootstrap is chronological. The prefix before its historical Gate is ready remains an
  explicitly unscored seed, not a user-confirmed or automatically classified normal record.
  Subsequent rows are evaluated against earlier dates only. Historical flags are all retained
  in the queue; there is no top-N filter.
- Bootstrap processes at most 100 prior rows per CRUD evaluation attempt; reconcile continues
  in batches of at most 50. These are operational limits, not eligibility thresholds. An
  unfinished target stays pending. Reconciliation can evaluate previously unassessed history
  after Gate is ready; merely opening a notification never makes a decision.
- Restoring an expired manual pattern starts lifecycle counting from today's Bangkok date.
  It does not invent an occurrence or alter the previous occurrence/median/history.
- Pattern lifecycle is refreshed by explicit refresh or reconciliation, not a background
  scheduler. No automatic notification setting is enabled.

Sources: `backend/src/lib/anomalyRules.ts`, `anomaly.ts`, `anomalyReview.ts`,
`anomalyPatternPolicy.ts`. The rule fingerprint includes the new dimension-decisions-v2
eligibility policy. The snapshot records Gate, per-dimension scope, baselines, version,
assessment and only applicable scoring evidence.

## Baselines and append-only evidence

Baselines are computed from PostgreSQL queries, not stored as separate copied transaction
tables. The amount and time membership predicates are independent.

| Effective dimension state | Main baseline | Exception/pattern evidence |
| --- | --- | --- |
| Not flagged | Eligible, subject to normal date/time requirements | Evaluation retained |
| Explicit normal | Eligible | Decision history retained |
| Flagged, waiting | Excluded for that dimension | Queue remains until a decision |
| Correct occasional exception | Excluded | Occasional decision event |
| Correct recurring exception | Excluded | Manual secondary pattern and recurring decision |
| Confirmed problem | Excluded | Decision/evaluation evidence retained |
| Not evaluated | Not called normal; may contribute to documented historical bootstrap seed | Insufficient/Gate reason preserved |

A flag in amount does not by itself exclude a nonflagged eligible time sample, and vice versa.
A decision on an old revision does not approve the current revision.

Storage additions:
- AnomalyIdentity survives removal of the live Transaction.
- AnomalyRevision captures category, amount, date/time and confirmation state. Migration
  backfills only the current observable revision; it cannot reconstruct revisions never recorded.
- Existing immutable AnomalyEvaluation and legacy review evidence remain intact.
- AnomalyDecision binds evaluation, identity, revision and dimension. A new event supersedes
  the previous event; updates/deletes and concurrent branching are rejected.
- AnomalyDecisionRequest stores durable user-scoped idempotency receipts.
- AnomalyPattern, AnomalyPatternEvent and AnomalyPatternRequest store manual pattern identity,
  append-only lifecycle and durable operation receipts.
- Database triggers invalidate affected later evaluations after transaction edits/deletion
  or decisions. Reconciliation appends new evaluations; old snapshots remain readable.
- Baseline fingerprints include membership/revision/decision identity, not only numeric stats.

Owned foreign keys, unique sequence/supersession constraints and triggers complement the
existing per-user transaction lock and authVersion recheck. A successful duplicate key replays
its original result; a different payload or stale expected predecessor returns 409.
Existing legacy review receipts remain replayable. Once dimensional decisions exist for a
revision, a new legacy review cannot silently replace them.

Migrations:
1. `20261005010000_add_anomaly_dimension_decisions`
2. `20261005020000_add_anomaly_manual_patterns`
3. `20261005030000_invalidate_anomaly_successors`

These are additive migrations. Existing local TransactionCreateRequest schema work was preserved.

## API and UI

All Anomaly routes retain authentication/ownership and private, no-store responses.
New read/write routes:
- GET /anomaly/queue: filter waiting/all/amount/time, stable severity-first pagination,
  total count (also beyond the last page), Gate readiness and pending-evaluation count.
- GET/POST /anomaly/evaluations/:id/decisions: revision and dimension scoped history/actions.
  Writes require Idempotency-Key and expectedDecisionId.
- GET /anomaly/patterns: stored lifecycle/history, fixed reference, valid current occurrences
  and explicit disabled automatic-matching policy.
- POST /anomaly/patterns/:id/events: refresh/restore with expectedEventId and idempotency key.

The new /anomaly page provides filters, queue, desktop detail panel, stacked mobile layout,
revision-specific actions/history, technical evidence in expandable sections and an edit
link to the existing transaction flow. There is no duplicate transaction editor or implicit
bulk approval. Opening/reading the queue or a notification does not create a decision.

The existing detail page continues to distinguish notification snapshot from latest evaluation,
deduplicates the same evaluation, and supports deleted-source evidence. Session changes clear
old data; retry of an uncertain decision keeps the same key/body. Direct detail access before
Gate never offers a decision. Editing financial data remains separate from deciding Anomaly.

## Automatic matching deliberately remains disabled

The user explicitly instructed that amount-pattern matching must wait until an authorized
database/instance can provide nonpersonal aggregate evidence for absoluteFloorInBaht.
Consequently:
- absoluteFloorInBaht is null; matchingEnabled is false.
- No real/application database was read to derive a floor.
- The existing scoring minimumDifference=100 is NOT reused as a pattern floor.
- No automatic amount match, automatic cadence activation or irregular-pattern promotion
  is enabled. Automatic acceptance of later matching revisions is also disabled.
- Pure policy tests cover the given 15%/explicit-floor formula, two cadence intervals,
  three-occurrence candidate and five-confirmed-occurrence offer predicates with synthetic
  values. These helpers are not an active runtime candidate/one-time-offer workflow.

Explicit manual recurring decisions and preset cadence creation are available now, without
claiming an amount-range match. Presets/grace: 7 days/2, 14 days/3, monthly/5, quarterly/7,
half-yearly/10, yearly/14 days. Month-end/leap-year anchors are retained.
One missed cycle remains active, two paused, four expired; lifecycle history is retained.
The API can explicitly attach an occurrence to an existing owned pattern; the present UI
offers new manual cadence creation, not an existing-pattern occurrence selector.
Automatic paused-to-active matching cannot run while matching is disabled.

The reference median is fixed from explicitly confirmed founding members (one member for
manual creation); later occurrences never silently shift it. Problem decisions, superseded
revision decisions and deleted-source decisions are not counted as current valid occurrences.

No push provider/delivery exists in this implementation. It does not claim to send reminders
on days 1/3/7. The in-app queue remains available without an age cutoff.

## AI verification actually run

All database operations below used a newly isolated PostgreSQL 16 container, loopback port
52810, database `spendsense_goals_test_anomaly_dim`. The application database/container
was not connected to or migrated. Synthetic accounts only; no real-user data or passwords
are recorded here. The test data is retained, with no reset/drop of an existing database.

- Prisma validate and generate: PASS.
- Empty isolated database migration chain: all 18 migrations applied.
- Upgrade test: original 15 migrations and synthetic legacy transactions/evaluation/review/
  receipt, then the 3 new migrations. PASS: legacy fingerprints unchanged, one current
  revision backfill, no fabricated decision/pattern. The separately created upgrade test
  database is retained. Runner: `backend/tests/runAnomalyDimensionsUpgrade.cjs`.
- Backend TypeScript build: PASS.
- Related Node/Prisma/HTTP/presentation tests: 47/47 PASS, final run 35.025 seconds:
  `anomalyDimensions.test.ts`, `anomalyDimensions.database.test.ts`,
  `anomaly.test.ts`, `anomaly.database.test.ts`, `anomalyReview.database.test.ts`,
  `anomalyDetail.presentation.test.ts`.
- Real Chrome + actual backend + isolated PostgreSQL:
  `anomalyDimensions.browser.cjs` PASS. Covers no decision on open, independent dimensions,
  real server commit followed by dropped response, exact retry without duplicate event,
  manual cadence creation once, keyboard, 1440px/390px overflow, session switch, direct
  detail below Gate. Screenshots are in OS temp, not Git.
- Existing detail browser regression with API doubles:
  `anomalyDetail.browser.cjs` PASS. Covers snapshot/latest, revision/history switchback,
  409/retry, pending/insufficient/not-flagged/deleted source, ownership/session,
  keyboard/mobile, notification read-only and applicable formulas.
- Frontend production build: PASS. Main JS 663.43 kB (gzip 178.96 kB), CSS 114.44 kB
  (gzip 20.44 kB), separate OCR chunk 17.23 kB. The >500 kB chunk warning remains.
  No dependency added; no measured before/after bundle delta is claimed.

Database regression includes Gate 29/30 records x 29/30 inclusive days, future/account
isolation, category fallback, independent baseline dimensions, concurrency/idempotency,
immutable history, edits/deletion, queues of 53 beyond a 50-row boundary and empty-page
totals, lifecycle replay, baseline re-evaluation and chronological bootstrap without self/future
inclusion. These are functional tests, not a large-history performance benchmark.

Tests/build used the current working tree, including pre-existing local work. This is not
an isolated staged candidate verification. Browser mobile checks used Chrome viewport
emulation, not a physical phone. No real-world detection-accuracy claim is made.

## User Acceptance

**User Acceptance: PASS — ผู้ใช้ยืนยันในบทสนทนานี้ว่าผ่านทุกกรณีใน checklist ทั้ง 4 บัญชี สำหรับ Anomaly แบบผู้ใช้ตรวจและตัดสินเอง**

ผลนี้เป็นคำยืนยันการตรวจรับของผู้ใช้ แยกจากผล automated tests และผลเตรียมระบบโดย AI ที่บันทึกไว้ก่อนหน้า ไม่ใช่การรัน tests ใหม่ และไม่ระบุวันที่ เวลา หรือค่าผลตรวจเพิ่มเติมที่ผู้ใช้ไม่ได้รายงาน

| บัญชีตรวจรับ | ขอบเขตที่ผู้ใช้ยืนยันผ่าน |
|---|---|
| `anomaly_amount@example.test` | คิวที่ถูก flag เฉพาะจำนวนเงิน และการตัดสินมิติจำนวนเงิน |
| `anomaly_time@example.test` | คิวที่ถูก flag เฉพาะเวลา และการตัดสินมิติเวลา |
| `anomaly_both@example.test` | คิวสองมิติ ตัดสินเฉพาะมิติที่เลือกแล้วอีกมิติยังค้าง เมื่อครบทุกมิติออกจากคิวรอตรวจแต่ยังดูประวัติได้ |
| `anomaly_history@example.test` | การแก้คำตัดสินและดูประวัติ โดยเพิ่มประวัติใหม่และรักษาประวัติเดิม |

ผู้ใช้ยืนยันว่าการตัดสินไม่เปลี่ยนยอดเงิน วันที่ หมวดธุรกรรม หรืองบประมาณ ตาม checklist ที่ตรวจรับ

ขอบเขต PASS นี้ไม่ใช่การรับรองความแม่นยำของการตรวจจับ และไม่ขยายไปยังการทดลอง tolerance หรือ automatic amount-pattern matching ซึ่งยังปิดอยู่ ไม่บันทึกรหัสผ่านหรือข้อมูล credentials ลงเอกสารนี้

### รายการตรวจเพิ่มเติมจากแผนเดิม (ไม่เหมารวมเป็นผล PASS รอบนี้)

รายการต่อไปนี้เก็บเป็นแผนตรวจเดิม ข้อใดอยู่นอก checklist ทั้ง 4 บัญชีข้างต้นยังไม่ถือว่าผู้ใช้ยืนยันผ่านจากข้อความรอบนี้:

1. Below Gate: readiness visible, no score/flag/decision; compare amount/time unavailable reasons.
2. Ready account: category/fallback scope, amount-only/time-only/both flags, queue pagination.
3. Decide each dimension independently; inspect main-baseline effect and append-only history.
4. Edit category/amount/time, reconcile and compare new revision with immutable old evidence.
5. Simulate lost response, retry, stale predecessor and session switch.
6. Create cadence, inspect fixed median/history, refresh/restore lifecycle.
7. Verify explicit automatic-matching-disabled notice, keyboard and 390px layout.

## Change boundary and remaining rollout decisions

13 existing paths changed in this task:
- backend/prisma/schema.prisma
- backend/src/lib/anomaly.ts
- backend/src/lib/anomalyReview.ts
- backend/src/lib/anomalyRules.ts
- backend/src/routes/anomaly.ts
- backend/tests/anomaly.database.test.ts
- backend/tests/anomalyDetail.browser.cjs
- frontend/src/App.tsx
- frontend/src/components/AnomalyDetails.tsx
- frontend/src/components/AnomalyReviewPanel.tsx
- frontend/src/components/Sidebar.tsx
- frontend/src/pages/AnomalyDetail.tsx
- frontend/src/utils/anomalyPresentation.ts

16 new paths:
- The three migrations listed above
- backend/src/lib/anomalyDecisions.ts
- backend/src/lib/anomalyPatternPolicy.ts
- backend/src/lib/anomalyPatterns.ts
- backend/tests/anomalyDimensions.browser.cjs
- backend/tests/anomalyDimensions.database.test.ts
- backend/tests/anomalyDimensions.test.ts
- backend/tests/runAnomalyDimensionsUpgrade.cjs
- frontend/src/components/AnomalyBaselineSummary.tsx
- frontend/src/components/AnomalyDecisionPanel.tsx
- frontend/src/components/AnomalyPatterns.tsx
- frontend/src/pages/AnomalyQueue.css
- frontend/src/pages/AnomalyQueue.tsx
- ANOMALY_DIMENSIONS_IMPLEMENTATION.md

The schema and Sidebar already contained local edits: do not later stage these wholesale
without reviewing their pre-existing hunks. All other pre-existing local files remain outside
this task. No stage/commit/push was performed.

Remaining authorized pause: establish a permitted aggregate source and decide the floor,
then integrate and separately accept automatic pattern matching/promotion. No implicit
permission to read the application database is inferred. Push transport/scheduling and
real-device acceptance and acceptance outside the four-account manual-review checklist are not claimed complete.
