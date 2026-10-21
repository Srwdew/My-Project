# Anomaly amount-tolerance experiment (offline, v1)

Date: 7 October 2026, Asia/Bangkok.
Automatic amount-pattern matching remains **DISABLED**. No tolerance or absolute floor
is selected, persisted into the model, or enabled by this experiment.

## Authorization and collection boundary

The user authorized analysis of subsequent user decisions in this conversation, using
authorized test data only. The operational collection cutoff established during this task is
**2026-10-07T14:22:28.000Z** (21:22:28 Asia/Bangkok). This is a conservative software
collection boundary, not an invented timestamp of the user's message.

The local scope manifest allowlists the five previously prepared Anomaly acceptance accounts
and the dedicated PostgreSQL database `spendsense_goals_test_anomaly_dim`.
The inspected container is `spendsense-anomaly-dim-1791214432588`; its loopback mapping
at this run is port 64641. Docker-assigned ports may change after restart; inspect the test
container and update the local scope explicitly instead of guessing.
No application/production database connection, migration or aggregate query was made.

Scope/output files are outside Git. They contain no passwords or connection strings.
Existing acceptance credentials are not copied into reports. Reports use account/pattern
aliases and aggregate counts rather than emails, transaction IDs, descriptions or rows.
The scope file itself contains the explicitly authorized test account IDs and stays local.

Existing POST decision operations already append AnomalyDecision and AnomalyPatternEvent.
No second decision log, background collector, telemetry or automatic submission was added.
Future decisions continue to be stored by the current application. Reports are generated
only on explicit invocation and only from the allowlisted accounts after the cutoff.

## What existing records can and cannot establish

Evidence:
- `backend/src/lib/anomalyDecisions.ts`: revision/dimension/pattern decision and durable receipt.
- `backend/src/lib/anomalyPatterns.ts`: create-event founding members/referenceMedian;
  later occurrence events do not change the reference.
- Additive migrations `20261005010000` and `20261005020000`: append-only triggers,
  owned foreign keys, sequence/supersession constraints. These migrations were READ, not changed/applied.

Existing data supports an explicit positive: a current amount-dimension recurring decision
linked to the specific pattern. A normal, occasional or problem decision is **not** an
explicit statement that the transaction is a different pattern from a particular candidate.
A different pattern ID is also not silently treated as a negative pair label: patterns
may overlap or duplicate without a confirmed distinction.

The current UI creates a new manual cadence pattern; it does not provide a selector for
linking an occurrence to an existing pattern, although the API accepts patternId.
Consequently, operational data may contain only founding members and no independent
positive examples. The decision schema does not store a rejected candidate pattern or an
explicit same-pattern/different-pattern answer. It also does not prove human-versus-test
origin; account allowlisting keeps new automated fixtures out of this acceptance report.

**Blocked collection extension:** pair-level negative labels and adequate independent
positive observations require additional collection design. This part has NOT been
implemented. There is no schema or migration change in this task.

## Experiment protocol

Implementation: `backend/experiments/anomalyTolerance.ts`.

- Predeclared tolerances: ±5%, ±10%, ±15%, ±20%, ±25%.
- For each pair, match if `abs(amount - foundingMedian) <= foundingMedian * tolerance / 100`.
- Decimal arithmetic; inclusive boundaries. No guessed absoluteFloorInBaht.
  This percentage-only experiment is not the disabled production max(percentage, floor) rule.
- Freeze the median from the original create event and its confirmed founding amounts.
  Validate the stored median against those founding amounts. Later amounts never move it.
- Exclude founding evaluations from their own evaluation samples.
- Use amount decisions only, within the consent/report interval and the same account/category.
- Use the latest effective decision for each transaction/revision/dimension once.
  Superseded labels are not carried to a new decision ID.
- Exclude deleted sources, non-expense current sources and changed revisions without a new
  explicit decision. Historical evidence remains stored; exclusion does not delete it.
- Exclude patterns created before the cutoff, even if they later receive a new occurrence.
  Reusing a pre-consent founding reference would require separate explicit authorization.
- Candidate unit: pattern × current transaction revision × amount dimension.
  This evaluates amount proximity, not cadence timing, candidate discovery or full matching.
- A known positive is the current recurring decision for that exact pattern; an explicit
  pair label may identify a known negative in the pure experiment input.
  The DB reader does not manufacture or accept negative labels from ordinary decisions.
- No statistical sample sufficiency threshold has been invented. With both classes present,
  counts are descriptive only. Missing either class is insufficient_data. Every report
  still says “ยังสรุปไม่ได้” and recommendedTolerance=null.
- Observations within one pattern/account are correlated. They are not independent samples.
  Do not combine repeated pattern-pairs as if each represented a distinct independent transaction.
- There is no tolerance ranking, automatic selection, change to scoring/baseline, or production hook.

Metrics per account and pattern, for each tolerance:
- correctMatch: known same-pattern examples inside range.
- falseMatch: explicitly different-pattern examples inside range.
- falseMiss: known same-pattern examples outside range.
- correctRejection: explicitly different-pattern examples outside range.
- samples: labeled pairs; positiveSamples, negativeSamples and unknownSamples are separate.
- Missing positive/negative evidence yields null (“ยังสรุปไม่ได้”), not a fabricated zero.
  Input event/current-decision/pattern counts also appear in the report.

## Read-only runner

Files:
- `backend/experiments/anomalyToleranceRead.ts`: validates exact database/loopback host/port,
  explicit account allowlist and cutoff; rejects application names and remote hosts.
- `backend/experiments/anomalyToleranceReport.ts`: manual CLI; local Markdown/JSON outputs.
- `backend/experiments/anomalyToleranceSynthetic.ts`: deterministic, nonpersonal test fixture.

The reader does not load .env. DATABASE_URL must explicitly target the authorized isolated
database and match the local scope. Reads occur in one PostgreSQL REPEATABLE READ transaction
with SET TRANSACTION READ ONLY. Queries are restricted to the allowlisted accounts.
Only the scope/aggregate report is written locally. No image, external service or network
destination other than the local PostgreSQL connection is used.

From backend, after setting an explicitly verified test DATABASE_URL without printing it:

```powershell
node --import tsx experiments/anomalyToleranceReport.ts --scope C:\path\to\scope.json --out C:\path\to\new-report
node --import tsx experiments/anomalyToleranceReport.ts --synthetic --out C:\path\to\new-synthetic-report
```

Scope contract (use the actual local manifest, not placeholders):
```json
{
  "source": "authorized-test-decisions",
  "database": "spendsense_goals_test_anomaly_dim",
  "host": "127.0.0.1",
  "port": "64641",
  "since": "2026-10-07T14:22:28.000Z",
  "accounts": ["explicitly-authorized-test-user-uuid"]
}
```

Each output directory must be new; previous reports are not overwritten. No reset, deletion,
backfill of labels or reclassification occurs. Re-run manually as new authorized decisions
arrive. A report with no eligible patterns is an honest empty report, not a failed test.

## Actual results, separated by source

### Authorized acceptance-account decisions

The first read-only run covered the 5 allowlisted accounts through
2026-10-07T14:48:13.633Z. It found **0 eligible post-cutoff amount patterns**.
No historical decision was retroactively included and no acceptance data was created to
make the report nonempty. Conclusion: **ยังสรุปไม่ได้**. No tolerance is recommended.

The local report and scope are under:
`C:\Users\zuxas\AppData\Local\Temp\spendsense-tolerance-experiment-EW6q1r\`.
This directory is not a repository artifact. Subsequent final-format reports are separate
directories, not replacements of the first report.

### Deterministic synthetic calculation check

One fictional pattern, fixed median 100.00; 4 same-pattern and 4 explicitly different-pattern
examples. These labels are synthetic ground truth; ordinary application decisions were not
reinterpreted to produce them. This is a calculation fixture, not accuracy evidence.

| Range | Correct match | False match | False miss | Correct rejection | Labeled pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| ±5% | 1 | 1 | 3 | 3 | 8 |
| ±10% | 2 | 1 | 2 | 3 | 8 |
| ±15% | 2 | 2 | 2 | 2 | 8 |
| ±20% | 3 | 2 | 1 | 2 | 8 |
| ±25% | 3 | 3 | 1 | 1 | 8 |

These hand-designed cases exercise boundaries and competing error counts. They do not
establish a best range for users, calibrate a floor, or justify enabling matching.

## Required next collection design (proposal only)

Before implementing this part, review the following proposal:
1. Let the user explicitly choose an existing pattern for a recurring occurrence using the
   existing patternId decision API. Never create/link automatically.
2. Record pair-level answers “same pattern / different pattern / unsure” against a specific
   transaction revision, amount dimension and frozen reference event. Do not overload the
   existing normal/occasional/problem actions.
3. A possible additive append-only label-event table would contain id, owner, source identity/
   revision, decision ID, candidate pattern ID, reference event ID, label, timestamp,
   sequence and supersedes ID. Ownership FKs, predecessor/sequence uniqueness, immutable
   UPDATE/DELETE guards and idempotent receipts are required. Revisions must not inherit labels.
   A local reviewed annotation import is an alternative for a small experiment; it is not
   currently wired to the CLI and would need validation/provenance and supersession rules.
4. Record consent/collection provenance for each future collection run and separate human
   labels from synthetic fixtures. Never label an unreviewed pair as a negative.
5. Agree a sampling plan, adequate positive/negative counts and a holdout protocol before
   interpreting results. Include close-valued different patterns and genuine outlying members.
   User confirmation remains required for every suggestion.
6. Review the resulting reports and explicitly approve any later production policy separately.
   No floor/automatic matching permission follows from this data-analysis authorization.

## Verification

AI tests; User Acceptance of this experiment has NOT been recorded.
- Unit tests: 10/10 PASS (`backend/tests/anomalyTolerance.test.ts`).
- PostgreSQL tests plus existing dimension regression: 11/11 PASS, 54.363 seconds total.
  New file: `backend/tests/anomalyTolerance.database.test.ts`.
  Tests reject UPDATE/DELETE of decisions and pattern events, retain history, prove fixed
  founding reference, exclude revised sources and compare decisions before/after read-only export.
- Strict TypeScript no-emit check of experiment/test files: PASS.
- Backend build: PASS.
- No frontend/production model/schema/migration/dependency files changed by this task.
- Database tests create only new synthetic accounts on the isolated test instance, outside
  the 5-account reporting allowlist. They do not reset/delete existing data.
- No stage/commit/push. Existing local files remain preserved.
