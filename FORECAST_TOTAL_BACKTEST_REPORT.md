# Forecast TOTAL model synthetic benchmark

This report belongs only to holt-total-v2-e949a61713de0b90. The category-v1 results remain in FORECAST_BACKTEST_REPORT.md and are not evidence for this model.

Synthetic engineering evidence only. No user data, database, or application connection. MAE/RMSE are research metrics, not UI accuracy scores.

Protocol: {"version":"total-walk-forward-v2","start":"2025-01-01","days":280,"seeds":[607,701,809],"developmentSeeds":[17],"firstCutoffIndex":29,"step":14,"windows":18,"scenarios":["constant","trend","weekly","intermittent","spikes","level-change","lifecycle","missing-records"],"models":["holt","seasonal-naive","mean-7"]}

Rule: {"method":"holt_linear_total","windowDays":180,"horizon":7,"minTransactions":30,"minObservedDays":30,"tuningMinDays":42,"defaultAlpha":"0.2","defaultBetaStar":"0.1","defaultSource":"engineering-fixed-before-total-outer-benchmark","staleDays":7,"longGapDays":7,"readiness":"lifetime-expense-count-and-inclusive-first-last-through-cutoff","initialization":"ols-first-7-level-at-7-recur-from-8","grid":"0.0:0.1:1.0","folds":"last-three-nonoverlapping-7-day-inner-folds","objective":"rounded-clipped-MAE-then-MSE-then-alpha-then-beta","missing":"zero-after-first-expense","negative":"clip-output-only","rounding":"40-digit-decimal-half-up-daily-total-cents-before-seven-day-sum","coverage":"all-expenses-total","version":2}

Fixture SHA256: ef41ff9c8ce4d73f2e8eee97a4eccb4e8d31d0a8619673604bfe38e689456e0e

Core SHA256: 371b54b68fe7e9f8259d9ce367a254df73c24188725ac3bd1366b978385e9521

Point SHA256: 977c31d1e83f23c02649a6822e7865ea02dc3e61fc0bf683ed3d312fa7a65930

## Frozen methodology

Fixed alpha=0.2, beta*=0.1 are engineering defaults frozen before this benchmark, not optimized using its outcomes or claimed optimal. At 42 training days use the existing 121-pair grid with inner cuts n-21,n-14,n-7 (earliest training 21 days), rounded/clipped MAE then MSE then ascending alpha/beta ties. Fit again through cutoff. Shorter ready histories use defaults without personal validation scores.

Readiness is lifetime expense count >=30 and inclusive first-to-last observed span >=30, evaluated using cutoff data only. PostgreSQL production groups all categories per date; the in-memory harness performs equivalent Decimal aggregation. Maximum training window 180 days; no future data/zeros. All models use the same account-origin readiness and score all actual expenses, including newly appearing categories.

Outer origins start at day index29, step14, 18 origins per account; test horizons1-7 never tune that origin. Later training may contain earlier outcomes only once past. Seeds607/701/809 were frozen before running this total benchmark; development seed17 is excluded. Model policies were not changed from these scores.

MAE=mean(abs(actual-prediction)); RMSE=sqrt(mean(error^2)); weekly error=sum(actual)-sum(prediction). Daily forecasts clip at0 and HALF_UP cents before summation. No MAPE. Unavailable origins have null forecasts and no error points, not zero errors.

## Pooled errors (THB)

| Model | Daily points | MAE | RMSE | 7-day origins | 7-day MAE | 7-day RMSE |
| --- | --- | --- | --- | --- | --- | --- |
| holt | 2884 | 38.80 | 101.75 | 412 | 174.48 | 461.33 |
| seasonal-naive | 2884 | 39.71 | 122.54 | 412 | 126.58 | 270.85 |
| mean-7 | 2884 | 37.14 | 86.69 | 412 | 126.58 | 270.85 |

In this frozen synthetic run Mean-7 has lower pooled daily MAE/RMSE and seven-day MAE/RMSE than Holt; Holt is not superior to the baselines. Seasonal naive and Mean-7 have the same displayed seven-day scores here, not necessarily identical rounded predictions: before rounding both sum to S=sum(last7); after daily rounding Mean-7 sums to 7*round(S/7,2), while Seasonal naive sums the seven observed cents. Their totals may differ by up to0.03 THB, as the regression fixture S=0.08 (0.08 versus0.07) demonstrates. Displayed score equality is not proof of pointwise equality.

## Horizon errors (THB)

| Model | Horizon | Points | MAE | RMSE |
| --- | --- | --- | --- | --- |
| holt | 1 | 412 | 34.97 | 102.04 |
| holt | 2 | 412 | 33.59 | 96.47 |
| holt | 3 | 412 | 33.18 | 90.99 |
| holt | 4 | 412 | 42.95 | 105.57 |
| holt | 5 | 412 | 47.31 | 108.87 |
| holt | 6 | 412 | 39.83 | 102.42 |
| holt | 7 | 412 | 39.78 | 104.84 |
| seasonal-naive | 1 | 412 | 41.97 | 126.91 |
| seasonal-naive | 2 | 412 | 35.72 | 116.15 |
| seasonal-naive | 3 | 412 | 38.32 | 113.08 |
| seasonal-naive | 4 | 412 | 41.62 | 126.11 |
| seasonal-naive | 5 | 412 | 38.23 | 122.37 |
| seasonal-naive | 6 | 412 | 40.67 | 126.33 |
| seasonal-naive | 7 | 412 | 41.48 | 126.07 |
| mean-7 | 1 | 412 | 35.09 | 88.81 |
| mean-7 | 2 | 412 | 31.50 | 79.32 |
| mean-7 | 3 | 412 | 31.60 | 75.03 |
| mean-7 | 4 | 412 | 39.78 | 90.37 |
| mean-7 | 5 | 412 | 42.40 | 92.41 |
| mean-7 | 6 | 412 | 40.01 | 89.18 |
| mean-7 | 7 | 412 | 39.57 | 90.21 |

## Parameter-mode errors (including baselines on identical origins)

| Mode | Model | Daily points | MAE | RMSE | 7-day origins | 7-day MAE | 7-day RMSE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixed_default | holt | 126 | 23.01 | 104.64 | 18 | 113.96 | 299.61 |
| fixed_default | seasonal-naive | 126 | 16.56 | 101.59 | 18 | 97.32 | 273.19 |
| fixed_default | mean-7 | 126 | 22.09 | 103.05 | 18 | 97.33 | 273.20 |
| inner_validation | holt | 2758 | 39.52 | 101.62 | 394 | 177.25 | 467.38 |
| inner_validation | seasonal-naive | 2758 | 40.77 | 123.42 | 394 | 127.92 | 270.75 |
| inner_validation | mean-7 | 2758 | 37.82 | 85.87 | 394 | 127.92 | 270.75 |

## Scenario errors

| Scenario | Model | Daily points | MAE | RMSE | 7-day origins | 7-day MAE | 7-day RMSE |
| --- | --- | --- | --- | --- | --- | --- | --- |
| constant | holt | 378 | 0.00 | 0.00 | 54 | 0.00 | 0.00 |
| constant | seasonal-naive | 378 | 0.00 | 0.00 | 54 | 0.00 | 0.00 |
| constant | mean-7 | 378 | 0.00 | 0.00 | 54 | 0.00 | 0.00 |
| trend | holt | 378 | 0.00 | 0.00 | 54 | 0.00 | 0.00 |
| trend | seasonal-naive | 378 | 1.40 | 1.40 | 54 | 9.80 | 9.80 |
| trend | mean-7 | 378 | 1.40 | 1.46 | 54 | 9.80 | 9.80 |
| weekly | holt | 378 | 42.96 | 51.95 | 54 | 104.33 | 125.02 |
| weekly | seasonal-naive | 378 | 6.86 | 8.49 | 54 | 18.59 | 22.57 |
| weekly | mean-7 | 378 | 43.48 | 50.23 | 54 | 18.59 | 22.58 |
| intermittent | holt | 273 | 125.16 | 149.49 | 39 | 312.78 | 386.70 |
| intermittent | seasonal-naive | 273 | 200.47 | 244.91 | 39 | 210.81 | 249.66 |
| intermittent | mean-7 | 273 | 134.70 | 143.52 | 39 | 210.81 | 249.66 |
| spikes | holt | 378 | 96.21 | 235.34 | 54 | 646.25 | 1168.81 |
| spikes | seasonal-naive | 378 | 88.56 | 256.84 | 54 | 583.18 | 682.26 |
| spikes | mean-7 | 378 | 85.51 | 192.28 | 54 | 583.17 | 682.26 |
| level-change | holt | 378 | 8.55 | 14.05 | 54 | 47.27 | 78.70 |
| level-change | seasonal-naive | 378 | 8.03 | 15.90 | 54 | 26.91 | 44.14 |
| level-change | mean-7 | 378 | 6.06 | 8.17 | 54 | 26.91 | 44.14 |
| lifecycle | holt | 378 | 8.01 | 23.48 | 54 | 54.53 | 151.06 |
| lifecycle | seasonal-naive | 378 | 7.70 | 24.99 | 54 | 45.59 | 129.76 |
| lifecycle | mean-7 | 378 | 7.19 | 20.72 | 54 | 45.59 | 129.76 |
| missing-records | holt | 343 | 55.02 | 66.59 | 49 | 278.80 | 340.21 |
| missing-records | seasonal-naive | 343 | 50.31 | 69.14 | 49 | 142.64 | 181.35 |
| missing-records | mean-7 | 343 | 46.73 | 52.16 | 49 | 142.64 | 181.35 |

## Coverage separate from error

| Scenario | Available | Unavailable | Fixed | Tuned |
| --- | --- | --- | --- | --- |
| constant | 54 | 0 | 3 | 51 |
| trend | 54 | 0 | 3 | 51 |
| weekly | 54 | 0 | 3 | 51 |
| intermittent | 39 | 15 | 0 | 39 |
| spikes | 54 | 0 | 3 | 51 |
| level-change | 54 | 0 | 3 | 51 |
| lifecycle | 54 | 0 | 3 | 51 |
| missing-records | 49 | 5 | 0 | 49 |

## Limits

Windows/training histories/forecast points are dependent, not independent sample sizes. No real-user accuracy or statistical significance claim. Zero-filled missing records score recorded spending, not latent unrecorded spending. No revision-history reconstruction or prospective evaluation. Only a few fixed-mode origins exist; no reliable personal accuracy claim from30 days. No policy/model changes based on outer scores. Baselines can outperform Holt; report all scenarios.

Reproduce from backend: node --import tsx tests/forecast.benchmark.ts --report. Report is written only with --report.
