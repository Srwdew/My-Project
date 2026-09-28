# Forecast research benchmark - 28 September 2026 (Asia/Bangkok)

MAE/RMSE are research evaluation metrics, NOT a requirement for the application to display accuracy scores. No UI, API, model, threshold, dependency or migration changes are made by this benchmark.

## Reproduce

From backend: `npx tsx tests/forecast.benchmark.ts --report`.
Tests: `npx tsx --test tests/forecast.benchmark.test.ts tests/forecast.backtest.test.ts tests/forecast.test.ts`.
Pure in-memory synthetic data; no PrismaClient, database connection, environment loading, user data or application database. The imported production core uses Prisma.Decimal only.

Model: holt-category-v1-ca068bab730d2022
Protocol: {"version":"synthetic-walk-forward-v1","start":"2025-01-01","days":280,"seeds":[101,211,307,401,503],"firstCutoffIndex":179,"step":7,"windows":14,"scenarios":["constant","trend","weekly","intermittent","spikes","level-change","lifecycle","missing-records"],"models":["holt","seasonal-naive","mean-7"],"developmentSeeds":[17]}
Production rule: {"method":"holt_linear_category","windowDays":180,"horizon":7,"minDays":42,"minExpenseDays":14,"recentDays":7,"initialization":"ols-first-7-level-at-7-recur-from-8","grid":"0.0:0.1:1.0","folds":"last-three-nonoverlapping-7-day-inner-folds","objective":"rounded-clipped-MAE-then-MSE-then-alpha-then-beta","missing":"zero-after-first-expense","negative":"clip-output-only","rounding":"40-digit-decimal-half-up-cents-before-aggregation","coverage":"cutoff-eligible-categories-only","version":1}
Fixture SHA256: ddb8052cc1addd6c401a53ae33f5f19773a315f4172293e30daede15ec21d627
Core bytes SHA256 (holt.ts then expenseForecast.ts): 17e6deb5f4b2ccb191eb58f5582d6345ae2b7c20c83ac11e74a140a854abe1c9
Point-result SHA256: fdc432206cf87658ae7e73b93d88a7e8df699b1315fa25008738ceae571a324a

## Frozen protocol

40 synthetic account scenarios, 280 calendar days from 2025-01-01. Each has 14 outer origins, day indices 179,186,...,270 (0-based); test days cutoff+1 through cutoff+7. Maximum rolling training window is 180 days. Final two generated days are unused. Outer test blocks do not overlap, but training windows, horizons, categories and successive forecasts remain dependent: 560 windows and forecast-point counts are NOT independent sample sizes. No confidence intervals or real-user accuracy claims.

Constant, alternating rising/falling trend, weekly pattern, intermittent every third day, spikes, level change, new/stopped categories, and missing-record scenarios use integer PRNG/cents with the exact generator in tests/forecast.benchmark.ts. Final seeds 101/211/307/401/503 were fixed before scoring. Seed 17 is reserved for development/unit checks and excluded from reported results. These are engineering fixtures, not a representative population or a statistical sample-size justification.

Holt directly calls buildForecast. Eligibility uses only cutoff history: 42 calendar days inclusive of first recorded expense, at least 14 expense dates and a record in the latest seven complete days. Identical eligible categories for all models; never select by observed errors. For each origin, Holt tunes 121 alpha/beta pairs on inner cutoffs n-21,n-14,n-7, minimizing rounded/clipped MAE then MSE with ascending alpha/beta ties, then refits all training. Inner validation scores are NOT outer test scores. No outer-test tuning. Earlier outer outcomes may enter later training only after they are in the past.

Seasonal naive: forecast horizon h is training value T+h-7. Mean-7: every horizon is mean of last seven training days. No additional tuning. All methods use the same zero-filled series after first record, clamp predictions at zero, and round each category/day HALF_UP to cents before aggregation, exactly as displayed by production. No future zeros enter training. Missing records in training and actual scoring mean recorded expense zero, NOT proof of zero real spending. Missing-record fixtures evaluate recorded expenses only; latent unrecorded spending is not assessed.

Error = actual - prediction. MAE = sum(abs(error))/N; RMSE = sqrt(sum(error^2)/N). Money uses Decimal precision 40. Tables round final metrics to cents; RMSE is pooled from raw squared errors, never averaged from subgroup RMSE. Seven-day error is sum(actual seven days) - sum(prediction seven days), not mean daily absolute error. No MAPE division by zero.

Unavailable windows have no prediction and no error points (metrics null if N=0), never a predicted zero. Partial windows score only cutoff-eligible categories, including actual of that same set even if later activity changes. Actual coverage is retrospective and cannot feed eligibility/tuning. Full actual may include new categories not observed at cutoff.

## Daily aggregate errors (THB; eligible categories only)


| Model | Points | MAE | RMSE |
| --- | --- | --- | --- |
| holt | 3570 | 51.07 | 116.14 |
| seasonal-naive | 3570 | 52.60 | 138.19 |
| mean-7 | 3570 | 47.76 | 96.63 |

## Seven-day aggregate total errors (THB)

| Model | Windows with forecast | MAE | RMSE |
| --- | --- | --- | --- |
| holt | 510 | 232.11 | 538.50 |
| seasonal-naive | 510 | 167.62 | 307.34 |
| mean-7 | 510 | 167.62 | 307.34 |

## Audit of seven-day baseline totals after category/day rounding

Let S_c be the sum of the last seven recorded daily values for category c (nonnegative cent amounts), and R be HALF_UP rounding to cents. Seasonal naive total = S_c. Mean-7 total = 7 * R(S_c / 7). Before rounding both equal S_c; after rounding the difference is 7 * R(S_c / 7) - S_c. It is zero exactly when the integer-cent sum is divisible by 7; otherwise it can be up to 0.03 THB per category. Aggregate differences are sums of these category differences. Equal displayed MAE/RMSE at two decimals do NOT imply identical forecasts or exact scores.

| Scope | Compared origins | Identical rounded totals | Different rounded totals | Maximum absolute difference THB |
| --- | --- | --- | --- | --- |
| category | 510 | 207 | 303 | 0.03 |
| aggregate | 510 | 207 | 303 | 0.03 |

| Model | Seven-day MAE (12 decimals) | Seven-day RMSE (12 decimals) |
| --- | --- | --- |
| seasonal-naive | 167.621725490196 | 307.342743637566 |
| mean-7 | 167.622431372549 | 307.343079799732 |

## Daily aggregate errors by horizon (THB)

| Model / horizon | Points | MAE | RMSE |
| --- | --- | --- | --- |
| holt / 1 | 510 | 47.72 | 108.88 |
| holt / 2 | 510 | 51.43 | 114.27 |
| holt / 3 | 510 | 51.35 | 106.84 |
| holt / 4 | 510 | 53.00 | 117.64 |
| holt / 5 | 510 | 49.34 | 116.04 |
| holt / 6 | 510 | 51.24 | 125.27 |
| holt / 7 | 510 | 53.41 | 122.89 |
| seasonal-naive / 1 | 510 | 55.41 | 141.19 |
| seasonal-naive / 2 | 510 | 51.62 | 137.63 |
| seasonal-naive / 3 | 510 | 45.15 | 118.53 |
| seasonal-naive / 4 | 510 | 54.19 | 140.93 |
| seasonal-naive / 5 | 510 | 51.54 | 138.13 |
| seasonal-naive / 6 | 510 | 54.80 | 147.67 |
| seasonal-naive / 7 | 510 | 55.49 | 141.41 |
| mean-7 / 1 | 510 | 47.21 | 92.88 |
| mean-7 / 2 | 510 | 51.58 | 100.10 |
| mean-7 / 3 | 510 | 46.81 | 82.61 |
| mean-7 / 4 | 510 | 51.28 | 101.15 |
| mean-7 / 5 | 510 | 46.33 | 98.01 |
| mean-7 / 6 | 510 | 42.78 | 100.19 |
| mean-7 / 7 | 510 | 48.37 | 100.09 |

## Daily aggregate errors by scenario (THB)

| Scenario / model | Points | MAE | RMSE |
| --- | --- | --- | --- |
| constant / holt | 490 | 0.00 | 0.00 |
| constant / seasonal-naive | 490 | 0.00 | 0.00 |
| constant / mean-7 | 490 | 0.00 | 0.00 |
| trend / holt | 490 | 0.00 | 0.00 |
| trend / seasonal-naive | 490 | 1.40 | 1.40 |
| trend / mean-7 | 490 | 1.40 | 1.46 |
| weekly / holt | 490 | 43.99 | 50.73 |
| weekly / seasonal-naive | 490 | 6.48 | 8.02 |
| weekly / mean-7 | 490 | 43.68 | 50.50 |
| intermittent / holt | 490 | 123.26 | 153.13 |
| intermittent / seasonal-naive | 490 | 202.32 | 246.58 |
| intermittent / mean-7 | 490 | 135.79 | 145.19 |
| spikes / holt | 490 | 107.08 | 246.49 |
| spikes / seasonal-naive | 490 | 93.99 | 265.88 |
| spikes / mean-7 | 490 | 90.90 | 198.20 |
| level-change / holt | 490 | 19.37 | 40.91 |
| level-change / seasonal-naive | 490 | 16.75 | 41.42 |
| level-change / mean-7 | 490 | 15.56 | 36.82 |
| lifecycle / holt | 140 | 70.58 | 80.37 |
| lifecycle / seasonal-naive | 140 | 43.78 | 62.54 |
| lifecycle / mean-7 | 140 | 43.78 | 57.60 |
| missing-records / holt | 490 | 58.21 | 89.33 |
| missing-records / seasonal-naive | 490 | 49.77 | 68.79 |
| missing-records / mean-7 | 490 | 48.16 | 53.04 |

## Category daily errors by synthetic account (THB)

| Account / category / model | Points | MAE | RMSE |
| --- | --- | --- | --- |
| constant-101 / primary / holt | 98 | 0.00 | 0.00 |
| constant-101 / primary / seasonal-naive | 98 | 0.00 | 0.00 |
| constant-101 / primary / mean-7 | 98 | 0.00 | 0.00 |
| constant-211 / primary / holt | 98 | 0.00 | 0.00 |
| constant-211 / primary / seasonal-naive | 98 | 0.00 | 0.00 |
| constant-211 / primary / mean-7 | 98 | 0.00 | 0.00 |
| constant-307 / primary / holt | 98 | 0.00 | 0.00 |
| constant-307 / primary / seasonal-naive | 98 | 0.00 | 0.00 |
| constant-307 / primary / mean-7 | 98 | 0.00 | 0.00 |
| constant-401 / primary / holt | 98 | 0.00 | 0.00 |
| constant-401 / primary / seasonal-naive | 98 | 0.00 | 0.00 |
| constant-401 / primary / mean-7 | 98 | 0.00 | 0.00 |
| constant-503 / primary / holt | 98 | 0.00 | 0.00 |
| constant-503 / primary / seasonal-naive | 98 | 0.00 | 0.00 |
| constant-503 / primary / mean-7 | 98 | 0.00 | 0.00 |
| trend-101 / primary / holt | 98 | 0.00 | 0.00 |
| trend-101 / primary / seasonal-naive | 98 | 1.40 | 1.40 |
| trend-101 / primary / mean-7 | 98 | 1.40 | 1.46 |
| trend-211 / primary / holt | 98 | 0.00 | 0.00 |
| trend-211 / primary / seasonal-naive | 98 | 1.40 | 1.40 |
| trend-211 / primary / mean-7 | 98 | 1.40 | 1.46 |
| trend-307 / primary / holt | 98 | 0.00 | 0.00 |
| trend-307 / primary / seasonal-naive | 98 | 1.40 | 1.40 |
| trend-307 / primary / mean-7 | 98 | 1.40 | 1.46 |
| trend-401 / primary / holt | 98 | 0.00 | 0.00 |
| trend-401 / primary / seasonal-naive | 98 | 1.40 | 1.40 |
| trend-401 / primary / mean-7 | 98 | 1.40 | 1.46 |
| trend-503 / primary / holt | 98 | 0.00 | 0.00 |
| trend-503 / primary / seasonal-naive | 98 | 1.40 | 1.40 |
| trend-503 / primary / mean-7 | 98 | 1.40 | 1.46 |
| weekly-101 / primary / holt | 98 | 43.50 | 50.52 |
| weekly-101 / primary / seasonal-naive | 98 | 6.68 | 8.31 |
| weekly-101 / primary / mean-7 | 98 | 43.17 | 50.33 |
| weekly-211 / primary / holt | 98 | 44.75 | 51.35 |
| weekly-211 / primary / seasonal-naive | 98 | 6.43 | 7.94 |
| weekly-211 / primary / mean-7 | 98 | 44.44 | 51.21 |
| weekly-307 / primary / holt | 98 | 44.45 | 51.54 |
| weekly-307 / primary / seasonal-naive | 98 | 6.06 | 7.40 |
| weekly-307 / primary / mean-7 | 98 | 44.22 | 51.24 |
| weekly-401 / primary / holt | 98 | 43.23 | 49.67 |
| weekly-401 / primary / seasonal-naive | 98 | 6.78 | 8.39 |
| weekly-401 / primary / mean-7 | 98 | 42.78 | 49.25 |
| weekly-503 / primary / holt | 98 | 44.02 | 50.54 |
| weekly-503 / primary / seasonal-naive | 98 | 6.44 | 8.00 |
| weekly-503 / primary / mean-7 | 98 | 43.79 | 50.42 |
| intermittent-101 / primary / holt | 98 | 124.74 | 154.29 |
| intermittent-101 / primary / seasonal-naive | 98 | 202.30 | 246.57 |
| intermittent-101 / primary / mean-7 | 98 | 135.90 | 145.34 |
| intermittent-211 / primary / holt | 98 | 123.47 | 155.10 |
| intermittent-211 / primary / seasonal-naive | 98 | 202.30 | 246.56 |
| intermittent-211 / primary / mean-7 | 98 | 135.73 | 145.08 |
| intermittent-307 / primary / holt | 98 | 126.27 | 151.27 |
| intermittent-307 / primary / seasonal-naive | 98 | 202.98 | 247.38 |
| intermittent-307 / primary / mean-7 | 98 | 136.18 | 145.70 |
| intermittent-401 / primary / holt | 98 | 121.14 | 155.23 |
| intermittent-401 / primary / seasonal-naive | 98 | 202.05 | 246.25 |
| intermittent-401 / primary / mean-7 | 98 | 135.71 | 145.12 |
| intermittent-503 / primary / holt | 98 | 120.70 | 149.70 |
| intermittent-503 / primary / seasonal-naive | 98 | 201.97 | 246.15 |
| intermittent-503 / primary / mean-7 | 98 | 135.45 | 144.72 |
| spikes-101 / primary / holt | 98 | 73.48 | 189.83 |
| spikes-101 / primary / seasonal-naive | 98 | 87.72 | 255.81 |
| spikes-101 / primary / mean-7 | 98 | 85.52 | 194.02 |
| spikes-211 / primary / holt | 98 | 130.66 | 286.34 |
| spikes-211 / primary / seasonal-naive | 98 | 95.18 | 267.24 |
| spikes-211 / primary / mean-7 | 98 | 91.60 | 194.89 |
| spikes-307 / primary / holt | 98 | 108.36 | 230.72 |
| spikes-307 / primary / seasonal-naive | 98 | 95.41 | 268.66 |
| spikes-307 / primary / mean-7 | 98 | 91.45 | 195.34 |
| spikes-401 / primary / holt | 98 | 112.82 | 251.82 |
| spikes-401 / primary / seasonal-naive | 98 | 96.33 | 269.38 |
| spikes-401 / primary / mean-7 | 98 | 93.86 | 197.12 |
| spikes-503 / primary / holt | 98 | 110.08 | 262.90 |
| spikes-503 / primary / seasonal-naive | 98 | 95.30 | 268.07 |
| spikes-503 / primary / mean-7 | 98 | 92.05 | 209.23 |
| level-change-101 / primary / holt | 98 | 21.18 | 42.71 |
| level-change-101 / primary / seasonal-naive | 98 | 16.79 | 40.69 |
| level-change-101 / primary / mean-7 | 98 | 15.89 | 36.69 |
| level-change-211 / primary / holt | 98 | 22.28 | 45.78 |
| level-change-211 / primary / seasonal-naive | 98 | 16.44 | 41.28 |
| level-change-211 / primary / mean-7 | 98 | 15.14 | 36.61 |
| level-change-307 / primary / holt | 98 | 17.25 | 36.75 |
| level-change-307 / primary / seasonal-naive | 98 | 16.42 | 40.96 |
| level-change-307 / primary / mean-7 | 98 | 15.21 | 36.63 |
| level-change-401 / primary / holt | 98 | 18.57 | 40.82 |
| level-change-401 / primary / seasonal-naive | 98 | 17.49 | 42.97 |
| level-change-401 / primary / mean-7 | 98 | 16.07 | 37.58 |
| level-change-503 / primary / holt | 98 | 17.59 | 37.86 |
| level-change-503 / primary / seasonal-naive | 98 | 16.63 | 41.14 |
| level-change-503 / primary / mean-7 | 98 | 15.51 | 36.59 |
| lifecycle-101 / primary / holt | 14 | 92.87 | 96.37 |
| lifecycle-101 / primary / seasonal-naive | 14 | 50.01 | 70.72 |
| lifecycle-101 / primary / mean-7 | 14 | 50.01 | 66.25 |
| lifecycle-101 / new-then-stopped / holt | 14 | 48.26 | 60.19 |
| lifecycle-101 / new-then-stopped / seasonal-naive | 14 | 37.54 | 53.08 |
| lifecycle-101 / new-then-stopped / mean-7 | 14 | 37.53 | 47.36 |
| lifecycle-211 / primary / holt | 14 | 92.96 | 96.47 |
| lifecycle-211 / primary / seasonal-naive | 14 | 50.06 | 70.79 |
| lifecycle-211 / primary / mean-7 | 14 | 50.05 | 66.31 |
| lifecycle-211 / new-then-stopped / holt | 14 | 48.26 | 60.19 |
| lifecycle-211 / new-then-stopped / seasonal-naive | 14 | 37.54 | 53.08 |
| lifecycle-211 / new-then-stopped / mean-7 | 14 | 37.53 | 47.36 |
| lifecycle-307 / primary / holt | 14 | 92.92 | 96.43 |
| lifecycle-307 / primary / seasonal-naive | 14 | 50.04 | 70.76 |
| lifecycle-307 / primary / mean-7 | 14 | 50.04 | 66.29 |
| lifecycle-307 / new-then-stopped / holt | 14 | 48.26 | 60.19 |
| lifecycle-307 / new-then-stopped / seasonal-naive | 14 | 37.54 | 53.08 |
| lifecycle-307 / new-then-stopped / mean-7 | 14 | 37.53 | 47.36 |
| lifecycle-401 / primary / holt | 14 | 92.87 | 96.37 |
| lifecycle-401 / primary / seasonal-naive | 14 | 50.01 | 70.72 |
| lifecycle-401 / primary / mean-7 | 14 | 50.01 | 66.25 |
| lifecycle-401 / new-then-stopped / holt | 14 | 48.26 | 60.19 |
| lifecycle-401 / new-then-stopped / seasonal-naive | 14 | 37.54 | 53.08 |
| lifecycle-401 / new-then-stopped / mean-7 | 14 | 37.53 | 47.36 |
| lifecycle-503 / primary / holt | 14 | 92.89 | 96.39 |
| lifecycle-503 / primary / seasonal-naive | 14 | 50.02 | 70.73 |
| lifecycle-503 / primary / mean-7 | 14 | 50.02 | 66.26 |
| lifecycle-503 / new-then-stopped / holt | 14 | 48.26 | 60.19 |
| lifecycle-503 / new-then-stopped / seasonal-naive | 14 | 37.54 | 53.08 |
| lifecycle-503 / new-then-stopped / mean-7 | 14 | 37.53 | 47.36 |
| missing-records-101 / primary / holt | 98 | 52.83 | 61.66 |
| missing-records-101 / primary / seasonal-naive | 98 | 49.16 | 68.07 |
| missing-records-101 / primary / mean-7 | 98 | 47.12 | 52.79 |
| missing-records-211 / primary / holt | 98 | 49.97 | 59.58 |
| missing-records-211 / primary / seasonal-naive | 98 | 47.63 | 66.70 |
| missing-records-211 / primary / mean-7 | 98 | 46.38 | 50.45 |
| missing-records-307 / primary / holt | 98 | 82.07 | 153.17 |
| missing-records-307 / primary / seasonal-naive | 98 | 53.72 | 72.14 |
| missing-records-307 / primary / mean-7 | 98 | 48.45 | 52.64 |
| missing-records-401 / primary / holt | 98 | 52.63 | 70.83 |
| missing-records-401 / primary / seasonal-naive | 98 | 51.01 | 69.64 |
| missing-records-401 / primary / mean-7 | 98 | 50.53 | 57.33 |
| missing-records-503 / primary / holt | 98 | 53.56 | 63.80 |
| missing-records-503 / primary / seasonal-naive | 98 | 47.32 | 67.25 |
| missing-records-503 / primary / mean-7 | 98 | 48.30 | 51.71 |

## Category seven-day total errors (THB)

| Account / category / model | Windows | MAE | RMSE |
| --- | --- | --- | --- |
| constant-101 / primary / holt | 14 | 0.00 | 0.00 |
| constant-101 / primary / seasonal-naive | 14 | 0.00 | 0.00 |
| constant-101 / primary / mean-7 | 14 | 0.00 | 0.00 |
| constant-211 / primary / holt | 14 | 0.00 | 0.00 |
| constant-211 / primary / seasonal-naive | 14 | 0.00 | 0.00 |
| constant-211 / primary / mean-7 | 14 | 0.00 | 0.00 |
| constant-307 / primary / holt | 14 | 0.00 | 0.00 |
| constant-307 / primary / seasonal-naive | 14 | 0.00 | 0.00 |
| constant-307 / primary / mean-7 | 14 | 0.00 | 0.00 |
| constant-401 / primary / holt | 14 | 0.00 | 0.00 |
| constant-401 / primary / seasonal-naive | 14 | 0.00 | 0.00 |
| constant-401 / primary / mean-7 | 14 | 0.00 | 0.00 |
| constant-503 / primary / holt | 14 | 0.00 | 0.00 |
| constant-503 / primary / seasonal-naive | 14 | 0.00 | 0.00 |
| constant-503 / primary / mean-7 | 14 | 0.00 | 0.00 |
| trend-101 / primary / holt | 14 | 0.00 | 0.00 |
| trend-101 / primary / seasonal-naive | 14 | 9.80 | 9.80 |
| trend-101 / primary / mean-7 | 14 | 9.80 | 9.80 |
| trend-211 / primary / holt | 14 | 0.00 | 0.00 |
| trend-211 / primary / seasonal-naive | 14 | 9.80 | 9.80 |
| trend-211 / primary / mean-7 | 14 | 9.80 | 9.80 |
| trend-307 / primary / holt | 14 | 0.00 | 0.00 |
| trend-307 / primary / seasonal-naive | 14 | 9.80 | 9.80 |
| trend-307 / primary / mean-7 | 14 | 9.80 | 9.80 |
| trend-401 / primary / holt | 14 | 0.00 | 0.00 |
| trend-401 / primary / seasonal-naive | 14 | 9.80 | 9.80 |
| trend-401 / primary / mean-7 | 14 | 9.80 | 9.80 |
| trend-503 / primary / holt | 14 | 0.00 | 0.00 |
| trend-503 / primary / seasonal-naive | 14 | 9.80 | 9.80 |
| trend-503 / primary / mean-7 | 14 | 9.80 | 9.80 |
| weekly-101 / primary / holt | 14 | 34.31 | 40.30 |
| weekly-101 / primary / seasonal-naive | 14 | 21.98 | 25.55 |
| weekly-101 / primary / mean-7 | 14 | 21.98 | 25.55 |
| weekly-211 / primary / holt | 14 | 26.24 | 31.92 |
| weekly-211 / primary / seasonal-naive | 14 | 13.58 | 16.88 |
| weekly-211 / primary / mean-7 | 14 | 13.58 | 16.88 |
| weekly-307 / primary / holt | 14 | 36.35 | 44.55 |
| weekly-307 / primary / seasonal-naive | 14 | 19.30 | 21.09 |
| weekly-307 / primary / mean-7 | 14 | 19.31 | 21.10 |
| weekly-401 / primary / holt | 14 | 42.74 | 49.59 |
| weekly-401 / primary / seasonal-naive | 14 | 21.08 | 25.48 |
| weekly-401 / primary / mean-7 | 14 | 21.07 | 25.47 |
| weekly-503 / primary / holt | 14 | 28.59 | 35.43 |
| weekly-503 / primary / seasonal-naive | 14 | 17.77 | 23.30 |
| weekly-503 / primary / mean-7 | 14 | 17.77 | 23.31 |
| intermittent-101 / primary / holt | 14 | 369.29 | 442.97 |
| intermittent-101 / primary / seasonal-naive | 14 | 216.80 | 253.68 |
| intermittent-101 / primary / mean-7 | 14 | 216.80 | 253.68 |
| intermittent-211 / primary / holt | 14 | 362.73 | 457.08 |
| intermittent-211 / primary / seasonal-naive | 14 | 211.36 | 247.65 |
| intermittent-211 / primary / mean-7 | 14 | 211.36 | 247.65 |
| intermittent-307 / primary / holt | 14 | 323.54 | 384.74 |
| intermittent-307 / primary / seasonal-naive | 14 | 220.44 | 257.47 |
| intermittent-307 / primary / mean-7 | 14 | 220.44 | 257.47 |
| intermittent-401 / primary / holt | 14 | 407.98 | 467.34 |
| intermittent-401 / primary / seasonal-naive | 14 | 224.74 | 261.52 |
| intermittent-401 / primary / mean-7 | 14 | 224.74 | 261.52 |
| intermittent-503 / primary / holt | 14 | 311.81 | 364.05 |
| intermittent-503 / primary / seasonal-naive | 14 | 210.54 | 246.50 |
| intermittent-503 / primary / mean-7 | 14 | 210.53 | 246.50 |
| spikes-101 / primary / holt | 14 | 504.65 | 628.46 |
| spikes-101 / primary / seasonal-naive | 14 | 585.11 | 688.62 |
| spikes-101 / primary / mean-7 | 14 | 585.11 | 688.63 |
| spikes-211 / primary / holt | 14 | 884.33 | 1626.09 |
| spikes-211 / primary / seasonal-naive | 14 | 625.31 | 702.49 |
| spikes-211 / primary / mean-7 | 14 | 625.31 | 702.49 |
| spikes-307 / primary / holt | 14 | 741.73 | 1105.58 |
| spikes-307 / primary / seasonal-naive | 14 | 624.60 | 701.67 |
| spikes-307 / primary / mean-7 | 14 | 624.60 | 701.68 |
| spikes-401 / primary / holt | 14 | 761.18 | 1306.96 |
| spikes-401 / primary / seasonal-naive | 14 | 643.80 | 722.94 |
| spikes-401 / primary / mean-7 | 14 | 643.81 | 722.95 |
| spikes-503 / primary / holt | 14 | 746.83 | 1316.81 |
| spikes-503 / primary / seasonal-naive | 14 | 628.38 | 705.34 |
| spikes-503 / primary / mean-7 | 14 | 628.38 | 705.34 |
| level-change-101 / primary / holt | 14 | 138.15 | 255.31 |
| level-change-101 / primary / seasonal-naive | 14 | 96.98 | 222.02 |
| level-change-101 / primary / mean-7 | 14 | 96.98 | 222.02 |
| level-change-211 / primary / holt | 14 | 147.98 | 287.06 |
| level-change-211 / primary / seasonal-naive | 14 | 88.58 | 219.24 |
| level-change-211 / primary / mean-7 | 14 | 88.58 | 219.25 |
| level-change-307 / primary / holt | 14 | 115.01 | 220.36 |
| level-change-307 / primary / seasonal-naive | 14 | 94.30 | 223.50 |
| level-change-307 / primary / mean-7 | 14 | 94.31 | 223.49 |
| level-change-401 / primary / holt | 14 | 117.20 | 246.48 |
| level-change-401 / primary / seasonal-naive | 14 | 96.08 | 222.17 |
| level-change-401 / primary / mean-7 | 14 | 96.07 | 222.16 |
| level-change-503 / primary / holt | 14 | 112.51 | 224.60 |
| level-change-503 / primary / seasonal-naive | 14 | 91.33 | 218.65 |
| level-change-503 / primary / mean-7 | 14 | 91.33 | 218.65 |
| lifecycle-101 / primary / holt | 2 | 650.07 | 651.99 |
| lifecycle-101 / primary / seasonal-naive | 2 | 350.04 | 430.16 |
| lifecycle-101 / primary / mean-7 | 2 | 350.05 | 430.16 |
| lifecycle-101 / new-then-stopped / holt | 2 | 337.82 | 386.45 |
| lifecycle-101 / new-then-stopped / seasonal-naive | 2 | 262.75 | 285.86 |
| lifecycle-101 / new-then-stopped / mean-7 | 2 | 262.74 | 285.85 |
| lifecycle-211 / primary / holt | 2 | 650.72 | 652.64 |
| lifecycle-211 / primary / seasonal-naive | 2 | 350.39 | 430.59 |
| lifecycle-211 / primary / mean-7 | 2 | 350.38 | 430.59 |
| lifecycle-211 / new-then-stopped / holt | 2 | 337.82 | 386.45 |
| lifecycle-211 / new-then-stopped / seasonal-naive | 2 | 262.75 | 285.86 |
| lifecycle-211 / new-then-stopped / mean-7 | 2 | 262.74 | 285.85 |
| lifecycle-307 / primary / holt | 2 | 650.46 | 652.38 |
| lifecycle-307 / primary / seasonal-naive | 2 | 350.25 | 430.42 |
| lifecycle-307 / primary / mean-7 | 2 | 350.26 | 430.42 |
| lifecycle-307 / new-then-stopped / holt | 2 | 337.82 | 386.45 |
| lifecycle-307 / new-then-stopped / seasonal-naive | 2 | 262.75 | 285.86 |
| lifecycle-307 / new-then-stopped / mean-7 | 2 | 262.74 | 285.85 |
| lifecycle-401 / primary / holt | 2 | 650.07 | 651.99 |
| lifecycle-401 / primary / seasonal-naive | 2 | 350.04 | 430.16 |
| lifecycle-401 / primary / mean-7 | 2 | 350.05 | 430.16 |
| lifecycle-401 / new-then-stopped / holt | 2 | 337.82 | 386.45 |
| lifecycle-401 / new-then-stopped / seasonal-naive | 2 | 262.75 | 285.86 |
| lifecycle-401 / new-then-stopped / mean-7 | 2 | 262.74 | 285.85 |
| lifecycle-503 / primary / holt | 2 | 650.20 | 652.12 |
| lifecycle-503 / primary / seasonal-naive | 2 | 350.11 | 430.25 |
| lifecycle-503 / primary / mean-7 | 2 | 350.11 | 430.25 |
| lifecycle-503 / new-then-stopped / holt | 2 | 337.82 | 386.45 |
| lifecycle-503 / new-then-stopped / seasonal-naive | 2 | 262.75 | 285.86 |
| lifecycle-503 / new-then-stopped / mean-7 | 2 | 262.74 | 285.85 |
| missing-records-101 / primary / holt | 14 | 266.00 | 301.43 |
| missing-records-101 / primary / seasonal-naive | 14 | 185.67 | 210.36 |
| missing-records-101 / primary / mean-7 | 14 | 185.67 | 210.36 |
| missing-records-211 / primary / holt | 14 | 228.18 | 260.05 |
| missing-records-211 / primary / seasonal-naive | 14 | 156.05 | 161.57 |
| missing-records-211 / primary / mean-7 | 14 | 156.04 | 161.57 |
| missing-records-307 / primary / holt | 14 | 497.81 | 920.61 |
| missing-records-307 / primary / seasonal-naive | 14 | 145.16 | 172.01 |
| missing-records-307 / primary / mean-7 | 14 | 145.16 | 172.01 |
| missing-records-401 / primary / holt | 14 | 309.06 | 367.48 |
| missing-records-401 / primary / seasonal-naive | 14 | 248.05 | 279.19 |
| missing-records-401 / primary / mean-7 | 14 | 248.06 | 279.19 |
| missing-records-503 / primary / holt | 14 | 235.28 | 297.92 |
| missing-records-503 / primary / seasonal-naive | 14 | 132.46 | 153.73 |
| missing-records-503 / primary / mean-7 | 14 | 132.47 | 153.74 |

## Category daily errors by horizon (pooled across accounts; THB)

| Category / model / horizon | Points | MAE | RMSE |
| --- | --- | --- | --- |
| primary / holt / 1 | 500 | 47.93 | 109.71 |
| primary / holt / 2 | 500 | 51.71 | 115.16 |
| primary / holt / 3 | 500 | 51.63 | 107.65 |
| primary / holt / 4 | 500 | 53.30 | 118.58 |
| primary / holt / 5 | 500 | 49.58 | 116.95 |
| primary / holt / 6 | 500 | 50.76 | 126.07 |
| primary / holt / 7 | 500 | 52.98 | 123.65 |
| primary / seasonal-naive / 1 | 500 | 55.76 | 142.40 |
| primary / seasonal-naive / 2 | 500 | 51.90 | 138.80 |
| primary / seasonal-naive / 3 | 500 | 45.31 | 119.48 |
| primary / seasonal-naive / 4 | 500 | 54.52 | 142.13 |
| primary / seasonal-naive / 5 | 500 | 51.82 | 139.30 |
| primary / seasonal-naive / 6 | 500 | 55.14 | 148.95 |
| primary / seasonal-naive / 7 | 500 | 55.84 | 142.62 |
| primary / mean-7 / 1 | 500 | 47.62 | 93.65 |
| primary / mean-7 / 2 | 500 | 52.07 | 100.95 |
| primary / mean-7 / 3 | 500 | 47.21 | 83.25 |
| primary / mean-7 / 4 | 500 | 51.77 | 102.02 |
| primary / mean-7 / 5 | 500 | 46.72 | 98.84 |
| primary / mean-7 / 6 | 500 | 42.34 | 100.76 |
| primary / mean-7 / 7 | 500 | 48.05 | 100.66 |
| new-then-stopped / holt / 1 | 10 | 37.54 | 53.08 |
| new-then-stopped / holt / 2 | 10 | 37.54 | 53.08 |
| new-then-stopped / holt / 3 | 10 | 37.54 | 53.08 |
| new-then-stopped / holt / 4 | 10 | 37.54 | 53.08 |
| new-then-stopped / holt / 5 | 10 | 37.54 | 53.08 |
| new-then-stopped / holt / 6 | 10 | 75.07 | 75.07 |
| new-then-stopped / holt / 7 | 10 | 75.07 | 75.07 |
| new-then-stopped / seasonal-naive / 1 | 10 | 37.54 | 53.08 |
| new-then-stopped / seasonal-naive / 2 | 10 | 37.54 | 53.08 |
| new-then-stopped / seasonal-naive / 3 | 10 | 37.54 | 53.08 |
| new-then-stopped / seasonal-naive / 4 | 10 | 37.54 | 53.08 |
| new-then-stopped / seasonal-naive / 5 | 10 | 37.54 | 53.08 |
| new-then-stopped / seasonal-naive / 6 | 10 | 37.54 | 53.08 |
| new-then-stopped / seasonal-naive / 7 | 10 | 37.54 | 53.08 |
| new-then-stopped / mean-7 / 1 | 10 | 26.81 | 37.92 |
| new-then-stopped / mean-7 / 2 | 10 | 26.81 | 37.92 |
| new-then-stopped / mean-7 / 3 | 10 | 26.81 | 37.92 |
| new-then-stopped / mean-7 / 4 | 10 | 26.81 | 37.92 |
| new-then-stopped / mean-7 / 5 | 10 | 26.81 | 37.92 |
| new-then-stopped / mean-7 / 6 | 10 | 64.35 | 65.23 |
| new-then-stopped / mean-7 / 7 | 10 | 64.35 | 65.23 |

## Coverage (separate from errors)

| Scenario | Available / partial / unavailable | Eligible / observed category-origins | Zero-filled training days (repeated origins) | Eligible actual / all actual THB |
| --- | --- | --- | --- | --- |
| constant | 70 / 0 / 0 | 70 / 70 | 0 | 49022.54 / 49022.54 |
| trend | 70 / 0 / 0 | 70 / 70 | 0 | 44543.94 / 44543.94 |
| weekly | 70 / 0 / 0 | 70 / 70 | 0 | 85796.21 / 85796.21 |
| intermittent | 70 / 0 / 0 | 70 / 70 | 8330 | 49594.48 / 49594.48 |
| spikes | 70 / 0 / 0 | 70 / 70 | 0 | 69846.21 / 69846.21 |
| level-change | 70 / 0 / 0 | 70 / 70 | 0 | 100046.21 / 100046.21 |
| lifecycle | 0 / 20 / 50 | 20 / 170 | 40 | 2376.98 / 25116.63 |
| missing-records | 70 / 0 / 0 | 70 / 70 | 4517 | 31282.81 / 31282.81 |

## Per-origin coverage and exclusions (lifecycle scenario)

| Account / cutoff | Status | Eligible / observed | Excluded category: reasons |
| --- | --- | --- | --- |
| lifecycle-101 / 2025-06-29 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history, insufficient_expense_days |
| lifecycle-101 / 2025-07-06 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history |
| lifecycle-101 / 2025-07-13 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-101 / 2025-07-20 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-101 / 2025-07-27 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-101 / 2025-08-03 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-101 / 2025-08-10 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-101 / 2025-08-17 | unavailable | 0 / 2 | new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-101 / 2025-08-24 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-101 / 2025-08-31 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-101 / 2025-09-07 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-101 / 2025-09-14 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-101 / 2025-09-21 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-101 / 2025-09-28 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-06-29 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history, insufficient_expense_days |
| lifecycle-211 / 2025-07-06 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history |
| lifecycle-211 / 2025-07-13 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-211 / 2025-07-20 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-211 / 2025-07-27 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-211 / 2025-08-03 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-211 / 2025-08-10 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-211 / 2025-08-17 | unavailable | 0 / 2 | new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-08-24 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-08-31 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-09-07 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-09-14 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-09-21 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-211 / 2025-09-28 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-06-29 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history, insufficient_expense_days |
| lifecycle-307 / 2025-07-06 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history |
| lifecycle-307 / 2025-07-13 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-307 / 2025-07-20 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-307 / 2025-07-27 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-307 / 2025-08-03 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-307 / 2025-08-10 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-307 / 2025-08-17 | unavailable | 0 / 2 | new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-08-24 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-08-31 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-09-07 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-09-14 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-09-21 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-307 / 2025-09-28 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-06-29 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history, insufficient_expense_days |
| lifecycle-401 / 2025-07-06 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history |
| lifecycle-401 / 2025-07-13 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-401 / 2025-07-20 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-401 / 2025-07-27 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-401 / 2025-08-03 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-401 / 2025-08-10 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-401 / 2025-08-17 | unavailable | 0 / 2 | new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-08-24 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-08-31 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-09-07 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-09-14 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-09-21 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-401 / 2025-09-28 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-06-29 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history, insufficient_expense_days |
| lifecycle-503 / 2025-07-06 | partial | 1 / 2 | new-then-stopped: insufficient_calendar_history |
| lifecycle-503 / 2025-07-13 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-503 / 2025-07-20 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-503 / 2025-07-27 | unavailable | 0 / 2 | new-then-stopped: insufficient_calendar_history; primary: no_recent_expense_records |
| lifecycle-503 / 2025-08-03 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-503 / 2025-08-10 | partial | 1 / 2 | primary: no_recent_expense_records |
| lifecycle-503 / 2025-08-17 | unavailable | 0 / 2 | new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-08-24 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-08-31 | unavailable | 0 / 3 | late: insufficient_calendar_history, insufficient_expense_days; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-09-07 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-09-14 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-09-21 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |
| lifecycle-503 / 2025-09-28 | unavailable | 0 / 3 | late: insufficient_calendar_history; new-then-stopped: no_recent_expense_records; primary: no_recent_expense_records |

## Interpretation and limits

These deterministic synthetic comparisons are research/engineering evidence only. In this synthetic benchmark Mean-7 has lower pooled daily and seven-day aggregate MAE/RMSE than Holt (daily 47.76/96.63 versus 51.07/116.14; seven-day 167.62/307.34 versus 232.11/538.50 THB). This does not establish superiority on every scenario or real user data. Holt is NOT superior to the baselines in these pooled results. Seasonal naive performs best on the weekly-pattern scenario. Seasonal naive and mean-7 seven-day totals are algebraically equal before rounding, since both sum the last seven values; cent rounding can cause small differences. Different structures favor different baselines; pooled THB errors weight high-spend scenarios more heavily. Do not select categories, change production thresholds or claim Holt superiority based on this suite. Keep all scenarios including weak results. No new model-selection behavior was introduced in the app. This v1 benchmark has at most one eligible category per account/origin; therefore aggregate-error cancellation between simultaneous categories is not empirically evaluated here. The separate two-category regression verifies arithmetic conservation only. A future frozen benchmark should add simultaneous category structures before drawing conclusions about multi-category error cancellation.

The original forecast.backtest.test.ts remains a separate eight-window/three-scenario regression and future-counterfactual check, not added to this benchmark's sample counts. User browser acceptance on 26 September 2026 validates functionality, not forecast accuracy. This benchmark was executed by the AI against synthetic fixtures only. It does not assess actual user behavior, prospective accuracy, recording completeness, uncertainty intervals or real revision history. Frozen generated histories contain no edits/deletes; future authorized studies need versioned snapshots to avoid hindsight reconstruction.

Method checks cover benchmark formulas, equal eligibility, null unavailable output, future invariance, production rounded-total reconciliation and deterministic fixtures. No database or browser acceptance is needed for this isolated harness; no database/HTTP/browser tests were performed as part of this benchmark.
