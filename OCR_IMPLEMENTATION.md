# OCR receipt entry ? implementation (2 October 2026, Asia/Bangkok)

## Scope and flow
Browser-only Tesseract.js 7.0.0 (Thai/English), local worker/core/traineddata under frontend/public/ocr. No image/raw OCR text sent to an OCR service, backend, logs or permanent receipt storage. Model download during setup is separate from runtime processing. Explicitly run `npm run ocr:assets` in frontend to reproduce assets; model URLs and SHA256 pins are in scripts/ocr-models.json. Core is resolved from the dependency lockfile. Vendor licenses accompany the assets.

The existing /transactions/add form validates the selected JPG/PNG before preview, shows OCR suggestions, and requires an explicit action/confirmation before replacing date/time/amount/description. Missing or ambiguous fields remain empty after applying suggestions. Category is selected manually. Only the final confirmation creates an expense; the manual income/expense form remains available.

Money is a decimal string; no floating-point money accumulation. Dates follow existing calendar/UTC surrogate validation. Gregorian/Buddhist numeric dates and Thai abbreviated months are parsed; equivalent decomposed Thai sara-am characters are normalized. Names require recipient/merchant labels. Multiple distinct candidate values are not guessed. Amount labels exclude fee/balance lines. User edits are never silently replaced by a completed OCR job.
transactionTimeConfirmed remains false. Reading OCR time is not user confirmation for Anomaly.

Limits: JPG/PNG, 5 MiB, 20 million pixels. MIME/signature/header dimensions/decode are checked, including JPEG SOF dimensions before decode. Unsupported/invalid images and partial OCR allow manual entry. Selection identity, session checks and worker termination protect against stale results. A worker initializing during cancellation is terminated as soon as initialization resolves.

## Transaction idempotency
POST /transactions accepts Idempotency-Key (16?128 ASCII letters/digits/underscore/hyphen).
- Same user/key and same selected request fields: replay exact original 201 JSON response.
- Same key with different fields: 409 IDEMPOTENCY_CONFLICT.
- Auth user only; authVersion checked after the existing user-row lock.
- Creation and receipt commit atomically; validation failures do not consume a key.
- Unique primary key (userId,idempotencyKey), CHECK constraints and append-only UPDATE/DELETE trigger.
- Receipts retain original response after Transaction edits/deletion; no FK to Transaction and no image/raw OCR text/credential in receipt.
- Legacy callers without a key retain existing behavior; duplicate protection requires a key.
- Form holds key + exact body for timeout/network/5xx retries; disables edits/cancel while result is uncertain. Rapid clicks share the in-flight guard. Request timeout is 30 seconds. Session change/unmount aborts client request.
- Pending key and canonical body are persisted in per-tab sessionStorage, bound to the current authenticated session. Reload restores a read-only pending request with manual retry only. No receipt image, raw OCR text or token is stored. Explicit abandon warns that it does not undo a committed transaction. This is request-key deduplication, not image-based duplicate-slip detection.
- Post-commit notification errors cannot turn a committed create into an error response. Existing reconciliation infrastructure remains in place.

Migration: 20261002010000_add_transaction_create_requests
New model: TransactionCreateRequest, with User relation (ON DELETE/UPDATE RESTRICT).
migration.sql -text in its own .gitattributes preserves exact applied bytes.
No existing migrations were edited. Application database was NOT connected or migrated.

## AI tests actually run
- Prisma validate/generate: PASS (placeholder URL, no application connection).
- Backend/frontend builds: PASS. Existing frontend chunk >500 kB warning remains.
- Dedicated PostgreSQL runner: 61 tests PASS, 0 fail/skip in final run.
  Includes real HTTP/database idempotency, 8 concurrent requests, multiple real PostgreSQL connections, different payload 409, account isolation, invalid-request rollback, no-key compatibility, authVersion revocation, database reconnect, replay after source edit/delete, immutable receipt triggers.
  Regression: Settings HTTP/DB, notifications HTTP mocks, budget notification/calculation tests, Goals calculations, Anomaly rules, History date/range calculations and optional transaction limit.
- Clean isolated test DB: all 15 migrations deploy; Prisma status up to date; all 15 applied checksums equal files. Original 14 migration files equal pre-work hashes.
- Chrome browser tests: 6 groups PASS using actual local OCR assets and synthetic English/Thai canvas images, with mocked application API.
  Covers JPG decode, MIME spoofing/corrupt PNG/size/pixel limits; Thai/Gregorian dates/time/amount/recipient; no POST before confirmation; edited amount; missing fields/manual entry; same-key lost-response retry in OCR and manual form; rapid clicks; cancel worker; session reset; keyboard focus; 390px overflow; no observed external OCR requests.
- Parser unit assertions include ambiguous values, Thai digits/sara-am, leap dates, fee exclusion, decimal strings and missing fields.

Initial failures were investigated:
1. Runner accidentally included a categories-only database test whose own database-name guard rejected the OCR database; removed that unrelated suite from OCR runner, not its guard.
2. Thai OCR emitted decomposed sara-am; fixed normalization and added regression.
3. Cancellation assertion originally ran before a Worker existed; now waits on Worker-start condition before asserting termination.
4. Asset license filename is LICENSE.md for tesseract.js, LICENSE for core; corrected and asset preparation passed.

## Test environments / limitations
Only synthetic fixtures and newly created OCR test containers were used; no application/previous acceptance fixtures were written/reset/deleted.
Latest verified container: spendsense-ocr-test-1790927827426-82f2f2.
Earlier OCR test containers are retained; credentials are not in this report.
Browser/API-mock and real HTTP/PostgreSQL results remain separate. The 2026-10-02 hardening run additionally passed browser-to-real-backend/PostgreSQL integration using synthetic fixtures; this is AI testing, not user acceptance.
No actual camera capture on physical iPad/phone or representative bank slip accuracy benchmark yet. Unsupported layouts/unclear recipients may require manual entry. OCR is not slip authenticity or transfer verification.
User acceptance: NOT RUN for this OCR module.
Do not enable the keyed create flow against application DB until its migration is separately authorized/deployed.

## Files
Modified: backend/prisma/schema.prisma; backend/src/index.ts (POST only; prior category-default/limit changes preserved); frontend/package.json and package-lock.json; frontend/src/pages/Addtransaction.tsx and Addtransaction.css.
Added: migration directory; backend/src/lib/transactionCreateRequest.ts; frontend/src/components/ReceiptOcr.tsx; frontend/src/lib/receiptOcr.ts; frontend/src/utils/receiptParser.ts; frontend/scripts/prepareOcrAssets.cjs and ocr-models.json; frontend/public/ocr assets/licenses.
Tests: receiptParser.test.ts, receiptOcr.browser.cjs, transactionCreateRequest.database.test.ts, runOcrDatabase.cjs under backend/tests.
This document is separate from existing acceptance/local documents.

## Repository preservation
HEAD before work: 712199d5b04b8b9c2cf7c71b31b1b907e438224f.
32 pre-existing local paths outside the three authorized shared source files retain exact pre-work hashes (including the pre-existing deletion). Shared source changes were extended surgically; no reset/checkout/stash. Existing acceptance/context documents unchanged.
Index remained empty. No stage/commit/push.


## Hardening verification — 2026-10-02 (Asia/Bangkok)
User acceptance: NOT RUN. The following are AI automated results.

### Retry and privacy
- Normalize once (exact decimal string, trimmed optional fields, whitelisted payload), persist before POST, replay the identical body string and Idempotency-Key after reload.
- No automatic POST on load. Pending fields and image selection are disabled until replay resolves or the user explicitly abandons tracking. A fresh request gets a fresh key.
- Definitive success/known 400/404/409 rejection clears the journal. Network/timeout/unknown responses retain it. Storage failure blocks a new POST.
- Logout/account change clears the journal, including when leaving from another page. Token is not stored in the journal; owner is a one-way session binding. SessionStorage is temporary per tab, not a cross-device draft.
- Abandon does not reverse server writes; users are told to check History before creating another request.
- OCR never changes transactionTimeConfirmed from false.

### Tests actually rerun in this hardening round
| Test | Result |
| --- | --- |
| pendingTransaction + receiptParser units | 7 passed |
| Real local OCR with mocked application API | 6 browser groups passed |
| Real browser + backend + isolated PostgreSQL | 5 groups passed |
| Empty isolated DB migration deployment | 15 migrations applied |
| Backend/frontend build | PASS |
| git diff --check | PASS; existing line-ending notices only |

Real integration verified: no POST before confirmation; commit then network timeout; reload with no auto-submit; keyboard retry with byte-identical key/body; exactly one Transaction and amount 42.70; no persisted image; false time confirmation; real 409/404 clearing; explicit abandon warning; logout away from form; account switch; second account has no transactions; no application/external OCR network requests.
Database: spendsense_goals_test_ocr_hardening_1790948090262_f18ffc, dedicated container spendsense-ocr-hardening-1790948090262-f18ffc. Containers retained; no reset/drop/application connection.
Earlier 61-test HTTP/database/regression result above is from the initial implementation run, not claimed as rerun in this hardening round.
Test harness fixes: renamed a fixture colliding with the CDP pending map; keyboard activation uses Space key down/up on the focused button. No sleeps/retries used to mask a product assertion.

### Bundle impact
Measured with the same Node gzip method, bytes:
| JavaScript | Before hardening | After hardening |
| --- | ---: | ---: |
| Initial main bundle, raw | 656453 | 644045 |
| Initial main bundle, gzip | 178815 | 173134 |
| Deferred OCR library chunk, raw / gzip | included in main | 17233 / 7262 |
Initial JavaScript drops by 12408 raw bytes / 5681 gzip bytes. Total JavaScript increases slightly with retry persistence; this is not a claim of reduced total download.
Tesseract is dynamically imported only after image validation/selection. Worker, WASM and language assets remain local and are fetched on demand. Browser network assertions verified no OCR engine/assets on initial page load. Existing main-bundle >500 kB warning remains; unrelated application splitting was not changed.

### Manual acceptance checklist (still required)
Use only a separately authorized acceptance backend/database with the OCR migration. Never point this flow at application DB before deployment authorization.
- [ ] On a real Android/iPhone/iPad, open camera; accept/deny permission; cancel capture; take a photo; choose an existing JPG/PNG from gallery; rotate device; verify layout. Desktop mobile emulation and a synthetic image assigned to the camera input passed, but do not prove hardware camera behavior.
- [ ] Clear Thai and English slips: compare date/time/amount/merchant against the image; manually select category; verify no record exists before final save.
- [ ] Buddhist/Gregorian dates and Thai digits: confirm normalized calendar date, especially leap dates.
- [ ] Blurred, rotated and low-light images: show missing/uncertain fields; allow manual entry; never guess a missing field.
- [ ] Multiple monetary values (transfer/fee/balance): accept only unambiguous labeled amount; manually correct if ambiguous.
- [ ] Unreadable time: leave empty and verify transactionTimeConfirmed remains false.
- [ ] Edit OCR-suggested amount/date/recipient, then save: persisted values must equal the user's final values, not an older OCR result.
- [ ] Replace image or switch account while OCR runs: old result must not overwrite current form.
- [ ] Interrupt response after save, reload, and manually retry pending request: verify only one record. Abandon warning must explain that committed writes are not undone.
- [ ] No image/raw OCR text leaves the browser for an external service. Representative real-slip accuracy and physical-device performance remain unmeasured.

### Files changed in hardening
Modified: frontend/src/pages/Addtransaction.tsx and .css; frontend/src/auth.ts; frontend/src/lib/receiptOcr.ts; backend/tests/receiptOcr.browser.cjs; OCR_IMPLEMENTATION.md.
Added: frontend/src/lib/pendingTransaction.ts; backend/tests/pendingTransaction.test.ts; backend/tests/ocrHardening.browser.cjs; backend/tests/runOcrHardening.cjs.
No backend production, schema, migration, dependency or OCR asset change in this hardening round. Prior OCR migration remains uncommitted and was only deployed to isolated test databases.

## Slip parsing and form feedback correction — 2026-10-03 (Asia/Bangkok)
AI verification, not user acceptance:
- The supplied local slip was processed entirely in the browser, without copying the image into the repository. Assertions passed for 2025-03-25, 13:13 and 400000.00; recipient extraction was observed as KAFAAK.
- Upscale small images in memory (maximum 3x and existing pixel cap). If resized text has no explicit time, reread original image only for an explicit time. Do not repair digits by guessing; ambiguous time still stays empty.
- Support English month dates; two-digit English years explicitly map to 2000–2099. Support Amount followed by a numeric line and To/recipient labels. Currency suffix OCR noise is tolerated only for the labeled numeric line, not by choosing the largest number.
- OCR suggestions explicitly state whether applied. Applying after confirmation updates form state; later manual edits do not rewrite the original OCR result. Reading alone still does not overwrite the user's draft.
- Browser tests: supplied image plus all six existing groups PASS, including Thai, cancellation, file validation, no external network, no POST before save, and form amount/time after apply. Unit tests: 8 PASS. Frontend build PASS (existing >500k chunk warning).
- A separate screenshot showing 18:47/78.00 has no source slip available; extraction accuracy for that image is NOT verified.
- No backend/schema/migration/dependency changes in this correction; no application database used. No stage/commit/push.

## English receipt semantics — 2026-10-03 (Asia/Bangkok)
AI automated verification; user acceptance remains pending.
- Same browser Tesseract pipeline and local tha/eng models retained. No dependencies, backend, schema or migrations changed.
- Confirmed parser defect using identical synthetic raw text: TOTAL DUE $107.00 was null before, 107.00 after. Engine read the label and number correctly. Old TOTAL PAID acceptance removed; SUBTOTAL/TAX/VAT/tender/change are not total candidates.
- Labels: AMOUNT, AMT, TOTAL, GRAND TOTAL, TOTAL DUE, NET AMOUNT, BALANCE DUE and existing Thai labels plus net/due labels. Same-line/next-line values, properly grouped commas, dot decimals and currency symbols supported. No exchange-rate conversion. Multiple distinct labeled totals stay blank, expose labeled choices, and require user selection/manual entry.
- Ambiguous numeric dates produce no date (both DD/MM and MM/DD candidates considered). Unambiguous ISO, explicit English/Thai months or day/month combinations retain existing parsing. English two-digit years remain the previously documented 2000–2099 policy.
- Development-only expandable diagnostic shows raw resized/original-time OCR text in component memory; cleared on image/session/job change and unmount. No production logging or persistence of raw text. Test logs contain synthetic receipt text only.
- Synthetic realistic receipts include merchant, receipt ID, item rows, subtotal 100, VAT 7, total 107, paid 200, change 93. English, bilingual and mild blur (0.5px)/tilt (0.012 radians) passed engine/raw-text and parser assertions. Local worker and English/Thai asset endpoints returned 200; no external OCR requests observed.
- UI browser test: conflicting TOTAL 107 / BALANCE DUE 57 remains blank until selected; ambiguous date stays blank; explicit application gives chosen 57; no POST before save. Existing cancellation/session/manual-edit/retry/file validation/mobile browser regressions passed.
- Unit tests: 11 PASS including pending-request regression. Frontend build PASS.
- Main JS: 646.01 kB -> 646.88 kB (Vite gzip 174.89 -> 175.23 kB). Deferred Tesseract chunk remains 17.23 kB. Existing >500k warning remains, not suppressed.
- Physical-device/strong blur/arbitrary real slips are not proven by these fixtures. Missing merchant labels still require manual entry. Amount recognition alone does not identify or convert currency to THB; users must verify the app's amount before saving.
- No application database connection, no migration, no staging/commit/push.

## Four local bank samples — 2026-10-03 (Asia/Bangkok)
AI tests only; user acceptance not claimed. All four supplied files were readable and tested locally in a browser. Images were not copied to the repository. Full raw diagnostics/preprocessing results remain only in a temporary directory outside Git.

| Sample | Final date | Time | Amount | Recipient |
| --- | --- | --- | --- | --- |
| Bangkok English | 2025-03-25 | 13:13 | 400000.00 | extracted from To label |
| Krungthai | 2023-07-07 | absent in source | 7403.00 | absent in source |
| K PLUS 2 | 2022-01-26 | 05:10 | 888.00 | blank; no reliable sender/recipient label |
| K PLUS 3 | 2018-08-18 | 08:55 | 888.88 | blank; no reliable sender/recipient label |

Before: Bangkok date/time/amount already worked; Krungthai and both K PLUS date/time/amount were null (except Krungthai has no time). Failures were both engine and parser:
- Krungthai resized OCR emitted 7,.403.00 and an unrecognized month; original OCR emitted valid 7,403.00 and ก.ค. Long total label was missing.
- K PLUS 2 resized month was Latin-like U.A.; original retained ม.ค. Parser lacked two-digit Buddhist years and จำนวน label, and collected phone clock 9:41.
- K PLUS 3 retained the correct date/time/888.88 in raw text, but short year, QR noise between label/value and phone clock blocked extraction.
- Bangkok resized time lost its colon; original-image reread still recovers the explicit time.

Changes: add จำนวนเงินรวมทั้งสิ้น/จำนวน; recognize Thai-month two-digit years as 25xx Buddhist years; prefer explicit time/date-line times over unlabelled device clocks; bounded currency-marked amount extraction below จำนวน stops at fee/balance/tender boundaries and exposes conflicting values. Original-image fallback now fills missing date/amount/time only, never overrides ambiguous/existing fields or repairs digits. No automatic sender/recipient inference.

Experiments per image: full resized, vertical crop (12% top removed; 65% original height), grayscale/contrast1.5, rotation -1 degree. Crop removed needed Krungthai date and misread K PLUS 3 888.88 as 888.68; contrast/rotation also damaged some numbers. Therefore none are applied blindly in production. Existing bounded upscaling plus original reread was sufficient for the supplied originals. Arbitrary orientation/strong blur and automatic deskew are not claimed.
All local tha/eng assets retained; no new dependency. Diagnostic remains development-only and browser-only.
Final unit/pending tests: 13 PASS. Browser OCR regression and realistic synthetic bank screenshot PASS, including phone clock, balance/fee exclusion, manual confirmation, session cancellation, retry and no external OCR traffic. Real four-image rerun matched expected date/amount/time where present. Full banking/privacy data were not added as regression fixtures.
Build PASS: main 646.88 -> 647.84 kB, gzip175.23 ->175.56 kB; deferred OCR17.23 kB unchanged; existing >500k warning remains.
Modified this round only: receiptParser.ts, receiptOcr.ts, receiptParser.test.ts, receiptOcr.browser.cjs, this document. No changes to pending/idempotency/time-confirmation/create-transaction code; no application database used; no stage/commit/push.

## Retail quantity/net-total regression — 10 October 2026

AI verification only, not user acceptance. Added a strictly labeled retail row: `ยอดสุทธิ 1 ชิ้น 69.00` yields 69.00, including a following-line value, optional currency and grouped thousands. Bare 69.00 or a quantity without that label remains null. Redacted synthetic text tests cover subtotal, discount, VAT, cash/change and savings text; conflicting labeled totals remain null. No arithmetic reconstruction, fuzzy label correction or selection of the largest number was added.

The supplied local photograph was inspected and processed in browser memory only. Original pipeline raw text lost the net amount/label and time. A manually selected diagnostic crop (not an automatic application rule) recovered 69.00 and 18:08 but still lost the net-total label. Experiments used full-image sparse segmentation, cropped block segmentation, grayscale/contrast 1.6, and cropped local thresholding with a 51-pixel neighborhood and biases 10/20/30. None reliably recovered the required label; the stronger threshold damaged digits. These settings were not enabled in production. The actual sample therefore still requires manual amount entry. Numeric short-year date remains unresolved; no date interpretation was added.

No supplied image or raw personal receipt text was saved as a fixture. Experiments used the original attachment with in-memory canvas processing, local tha/eng assets and mocked application APIs. No external OCR service or database was used. Production OCR preprocessing, confirmation flow, pending request/idempotency and transactionTimeConfirmed=false are unchanged.

Verification: parser + pending request units 17 passed; existing local OCR browser regression passed (synthetic receipts, ambiguity, no POST before save, final user edits, same-key retry, cancellation/session change, file validation, mobile/keyboard and no external OCR traffic). Frontend build passed: main JS 689.60 kB / gzip 184.60 kB, deferred OCR 17.23 kB / gzip 7.30 kB; >500 kB warning remains. These are current build sizes, not a measured before/after delta. No physical-device acceptance or real-backend integration was rerun.

## 7-Eleven evidence-based support — 10 October 2026

Scope: preserve the user's Addtransaction.tsx/WebP selection changes exactly. Parser version is now seven-eleven-net-v2. This audit uses the same private local photograph, never copied into the repository or persisted by tests.

Visual structure: explicit CP ALL,7-Eleven header above the receipt body; product and pre-discount total 100.00; discount 31.00; net-total row with quantity (ยอดสุทธิ 1 ชิ้น 69.00); cash/change 100.00 / 31.00; short numeric date 05/10/65 and time 18:08; savings text 31.00 and promotion below. No transaction/reference/contact identifiers are retained here.

Parser changes: an exact CP ALL / 7-Eleven header among the first three nonempty OCR lines supplies the merchant name. Product/ad mentions do not identify the merchant. In that identified layout, ยอดรวม is treated as pre-discount, never as a payable substitute if the net label is missing. Explicit net quantity rows retain existing strict monetary validation; discount/savings/VAT/change or unlabelled numbers are not selected. Conflicting payable totals remain null. Unambiguous Buddhist dates such as 13/10/2565 or 13 ต.ค. 65 use existing calendar conversion; 05/10/65, 05/10/2565, invalid dates and unresolved short numeric years remain blank. No date policy or year guessing was added.

Fresh image experiment: full block OCR still missed time/net label. Grayscale plus contrast 1.6 on the full scaled image recovered explicit 18:08, while net label and merchant stayed unreadable. The diagnostic crop recovered an explicit merchant header and time but still lost the net label. Only the full-image contrast pass was adopted: one additional in-memory fallback when time or amount is missing, filling missing fields only, never overwriting existing or ambiguous fields. No fixed crop coordinates, guessed label correction or derived amount was put into production. Enhanced canvas is released after the pass; worker cancellation remains active.

Verification: 19 parser/pending unit tests passed. Browser regression ran with OCR_RETAIL_SAMPLE_PATH pointing to the original attachment, with mocked app APIs and actual local OCR assets. It verified loaded parser version, each raw-to-parser result, amount null through the rendered UI, explicit apply remaining blank, recovered 18:08, unresolved date, reread preserving manual edits and no POST. Existing English/Thai/bilingual, cancellation/session, retry and no-external-network assertions also passed. This is AI testing, not User Acceptance or a general receipt accuracy claim. Real image amount/merchant still need manual entry; parser-only support does not repair unreadable labels.

Frontend build passed: main JS 690.56 kB / gzip 184.84 kB versus preceding build 689.61 / 184.60 kB (about +0.95 / +0.24 kB). Deferred OCR remains 17.23 / 7.30 kB. Existing >500 kB warning remains. No dependency, schema, migration, application database, transaction-confirmation or idempotency change.

## Document-aware payment/date policy — 10 October 2026

User-approved change supersedes the prior restriction on short numeric years for explicitly identified 7-Eleven receipts. With the explicit CP ALL / 7-Eleven header, D/M/YY is interpreted as Buddhist 25YY and normalized to the existing YYYY-MM-DD date contract (05/10/65 -> 2022-10-05). Without document identification it stays blank; invalid and multiple distinct dates remain unresolved. Existing ambiguous four-digit numeric-date handling is unchanged.

Parser document-payment-v3 suggests cash only for the identified retail receipt with เงินสด, เงินทอน, CASH or CHANGE evidence. Bank-transfer suggestions require corroborating bank/transfer layout evidence: Bangkok Bank with Transaction successful and From/To; K PLUS/K+/กสิกร with โอนเงินสำเร็จ; or Krungthai/กรุงไทย with ทำรายการเสร็จสมบูรณ์. A bank mention alone does not qualify. Conflicting document types produce no suggestion. Suggestions use existing paymentMethod cash/transfer, not income/expense type, and appear separately in the OCR review. Only explicit apply fills paymentMethod; without a suggestion the user's existing selection is retained. Users may override it before final save.

The user's WebP accept attribute is preserved. The pre-existing OCR validator still rejected WebP despite that accept attribute; it now checks RIFF/WEBP signature, declared length, VP8/VP8L/VP8X dimensions, 5 MiB/20-million-pixel limits and real browser decode. No image is persisted. Addtransaction.tsx changes are restricted to applyReceipt's optional payment suggestion and confirmation wording; pending requests/idempotency, category choice and transactionTimeConfirmed=false are unchanged.

AI tests: parser/pending units 20 passed. Real local Tesseract browser tests passed with a synthetic WebP 7-Eleven receipt and PNG bank slip: cash/transfer suggestions did not auto-fill or POST, explicit apply filled amount/date/payment, manually overriding payment to card was preserved in the final mocked API body, and time confirmation stayed false. Real WebP decode plus spoofed/corrupt/oversized-header rejection passed. Existing same-key retry, session/cancellation, English/Thai/bilingual, ambiguity and mobile regressions passed. The private original photograph was also rerun without copying/saving it: time 18:08 recovered, but amount/date remain null because OCR still loses the net label and document header. No claim of complete extraction from that photograph.

Frontend build passed: main 692.51 kB / gzip 185.49 kB, deferred OCR 17.23 / 7.30 kB. >500 kB warning remains. API tests in this browser suite are mocked; no application/test database access, schema/migration changes or new dependencies occurred. Results are automated checks, not user acceptance.

## CP ALL / 7-Eleven template regions — 11 October 2026

AI/local verification, not user acceptance. Parser version: `seven-eleven-regions-v4`. These observations supersede earlier single-image limitations only where stated below; prior reports remain historical.

The existing browser worker now has an internal region helper. A bounded low-resolution paper detector locates the light receipt, then OCR line boxes locate the header, amount block and reference timestamp. Header evidence requires both CP ALL and 7-Eleven; filenames and user descriptions are not evidence. Separate English header/reference and Thai+English body passes use local assets. Crops, decoded images and text remain in memory; no supplied image or private raw text is written as a fixture or report. Region selection uses detected coordinates, not sample-specific coordinates. No dependency was added.

A recognized template prefers an explicit net label over pre-discount Total. Quantity columns are supported. Without a net label, Total is usable only without discount or conflicting subtotal evidence. Cash/Change and Purse are never amount sources. Footer promotions after a reference timestamp or recognized footer marker are excluded. Two-digit Buddhist D/M/Y interpretation requires the header; cash is suggested only when its text is actually recognized. Bank transfer evidence and explicit apply/save remain unchanged.

The reference OCR experiment misread 59 as 55. The region pipeline therefore rejects date tokens below confidence 95 and time tokens below 80, or missing/conflicting tokens. These are conservative engineering thresholds, not calibrated probabilities or a guarantee against high-confidence OCR errors. It never repairs a year by knowing the sample's expected answer. Users must still verify all suggestions.

### Actual supplied photographs

| Image | Raw OCR evidence / cause | Final date | Final time | Final amount | Store/payment |
| --- | --- | --- | --- | --- | --- |
| Thai receipt with promotion (net 69) | Cropped raw contains 69.00 but net label remains corrupted. Header recovered; reference date is below confidence gate. Parser cannot safely recover a missing label. | blank | 18:08 | blank | 7-Eleven; payment blank because cash text remains unreadable |
| IMG_1433.JPG | Header/reference recovered. Body reads Total as 10.00 instead of visual 70.00; subtotal/discount evidence makes this ineligible regardless. | 2014-03-05 | 08:08 | blank | 7-Eleven / cash |
| 1461289664.jpg | Raw Total (quantity) 155.00 is readable; old parser rejected that quantity layout. Regional date reads 09/04/55 instead of visual 09/04/59 and is rejected. | blank | 16:12 | 155.00 | 7-Eleven / cash |
| 1384170988-pantiptalk-o.jpg | Header is physically absent. Short-year format/store cannot be established; subtotal/discount/Purse must not become amount. | blank | 18:03 | blank | blank / blank |

Before this change, the 155 receipt had no amount and incorrectly proposed 2012-04-09. This change recovers its labeled amount and leaves the unreliable date blank. It does not claim to read all fields of all four photographs. The 69 receipt remains an OCR recognition limitation, not a reason to select a bare number.

The private four-image browser regression verifies the loaded parser version, every development raw-to-parser result, final fields, amount after explicit apply and no transaction POST. Measured individual runs: approximately 24.8, 20.5, 14.2 and 21.2 seconds on this machine (not a performance guarantee). Private paths are provided at runtime via OCR_TEMPLATE_SAMPLE_PATHS (JSON array in table order); images are never copied into the repository. OCR_RETAIL_SAMPLE_PATH additionally verifies reread/manual-draft preservation for the first receipt.

Redacted parser cases include net 69 versus Total 100/discount 31, quantity Total 155, Sub Total/Purse/cash/change exclusions, missing header/labels, short Buddhist dates, ambiguous dates, footer advertising and confidence boundaries. Synthetic browser images exercise English template/footer exclusion and mild tilt/blur; WebP retail exercises validation, decoding, actual OCR and explicit apply. Strong perspective, severe blur and general automatic deskew remain unproven. Region reads add latency and may leave more fields blank rather than accept uncertain values.

Unit command: `node --import tsx --test tests/receiptParser.test.ts tests/pendingTransaction.test.ts` from backend: 23 PASS. Frontend build PASS: main JS 699.92 kB / gzip 187.80 kB (pre-change 692.51 / 185.49 kB); deferred Tesseract 17.23 / 7.30 kB. Existing >500 kB warning remains visible. No schema, migration, dependency or application database changes. Addtransaction.tsx and its WebP changes are preserved byte-for-byte.

Browser verification completed: the four private-image assertions passed in their dedicated run; the subsequent complete suite passed after its synthetic-retail test explicitly entered a date when confidence correctly left it blank. That manual test correction is not an OCR date-recognition claim. The complete suite includes private-image reread, WebP, English template tilt/blur, Thai/bilingual/bank images, ambiguity, no POST before confirmation, transactionTimeConfirmed=false, same-key retry, worker cancellation, session clearing, file validation, keyboard/mobile and no external network. No private image screenshots were taken.

## OCR preview and direct form fill — 11 October 2026

User-requested UI change; template work is paused. This section supersedes earlier instructions requiring a separate OCR apply button. Parser/template recognition and preprocessing rules are unchanged.

- Status now appears inside the slip preview header where the file-selection status was shown. During recognition, the label is กำลังสแกน xx% with a native progress element. Percentages come directly from Tesseract recognizing-text events; initialization uses an indeterminate progress element and preparation text. Each real recognition pass can restart its percentage; this is not a fabricated overall estimate or a timer.
- Removed the separate OCR result box, field summary, candidate dropdown and apply button. Clear non-null results populate the actual form and its existing summary directly. Ambiguous/missing values are not guessed. Starting a new image/read clears previous automatic/default values only; user edits, including explicitly empty fields, survive.
- Manual edits are tracked per date/time/amount/description/payment field. Result application checks the image-selection generation, current login token, mounted state and pending/save lock. Component cleanup cancels work and ignores late results. Changing account resets the form and invalidates old selections.
- Preview, reread, cancellation and development-only raw/parser/final diagnostics remain. WebP validation/decode and file acceptance remain. Only the final save button creates a transaction; pending request keys, retry behavior and transactionTimeConfirmed=false are unchanged.

Verification: 23 parser/pending unit tests PASS. Full receiptOcr.browser.cjs PASS on localhost with actual local Tesseract and mocked APIs: preview location; displayed percentages matched actual worker events; direct form/summary fill; ambiguous date/amount blank; every manual field protected; explicit empty edit/reread; image replacement and account switch while actual worker completion was held; WebP/bank/Thai/English/bilingual images; final-confirmation-only POST; same-key retry; cancellation; mobile/keyboard; no external OCR network. Desktop (1440px) and mobile (390px) synthetic-image preview screenshots were inspected. Private template images were intentionally not rerun in this UI-only round.

The real-database ocrHardening.browser.cjs was updated only to wait for the new completion marker and remove its obsolete apply click; its database integration runner was not run in this round. No application/test database connection or migration was required by the executed mocked-API suite.

Frontend build PASS: main JS 698.21 kB / gzip 187.56 kB; deferred OCR 17.23 / 7.30 kB. Existing >500 kB warning remains. No new dependencies. Git diff/check and before/after hashes verify only this UI/logic, its two browser test files and this document changed; parser, region helper and all unrelated local changes were preserved. No stage, commit or push.

## OCR completion badge follow-up — 11 October 2026

Per the user's follow-up, removed the development raw-text panel and the reread button from the page. The component no longer collects diagnostic text. Successful OCR completion displays only a green สแกนสำเร็จ badge at the top right of the preview card. It means processing finished, not that every field was readable. Real progress, cancellation while reading, safe direct fill, preview and final save confirmation remain. Selecting another image starts a new scan.

Frontend build and full mocked-API browser regression PASS, including badge text/position, absence of diagnostics/completed-state buttons, actual progress, manual edits, image re-selection/session races, WebP and retry. Desktop/mobile screenshots were inspected. Private-image optional tests and the database hardening runner were not run in this UI-only follow-up. Build main JS 698.04 kB (gzip 187.52 kB); existing >500 kB warning remains. No parser/template/database changes, staging, commit or push.
