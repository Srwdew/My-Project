# MoneyData (GBP, one account) — holt-total-v2-e949a61713de0b90
Rule: {"method":"holt_linear_total","windowDays":180,"horizon":7,"minTransactions":30,"minObservedDays":30,"tuningMinDays":42,"defaultAlpha":"0.2","defaultBetaStar":"0.1","defaultSource":"engineering-fixed-before-total-outer-benchmark","staleDays":7,"longGapDays":7,"readiness":"lifetime-expense-count-and-inclusive-first-last-through-cutoff","initialization":"ols-first-7-level-at-7-recur-from-8","grid":"0.0:0.1:1.0","folds":"last-three-nonoverlapping-7-day-inner-folds","objective":"rounded-clipped-MAE-then-MSE-then-alpha-then-beta","missing":"zero-after-first-expense","negative":"clip-output-only","rounding":"40-digit-decimal-half-up-daily-total-cents-before-seven-day-sum","coverage":"all-expenses-total","version":2}

## M1: 4717 expense rows · daily mean 104.15 · daily median 16.19 GBP · origins scored 180, unavailable 0

### all origins
| model | daily pts | MAE | RMSE | MAE/mean | MAE/median | MASE | 7-day MAE | 7-day RMSE | 7-day MAPE % (weeks >0) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| holt | 1260 | 383.94 | 1237.76 | 3.69 | 23.71 | 2.268 | 2483.29 | 7946.12 | 664.57 (180/180) |
| naive-1 | 1260 | 226.05 | 543.44 | 2.17 | 13.96 | 1.355 | 1371.78 | 3264.24 | 341.67 (180/180) |
| seasonal-naive | 1260 | 159.19 | 417.86 | 1.53 | 9.83 | 0.931 | 778.05 | 1102.87 | 205.09 (180/180) |
| mean-7 | 1260 | 150.66 | 320.46 | 1.45 | 9.31 | 0.88 | 778.05 | 1102.88 | 205.09 (180/180) |

### first 18 origins (comparable to the synthetic report)
| model | daily pts | MAE | RMSE | MAE/mean | MAE/median | MASE | 7-day MAE | 7-day RMSE | 7-day MAPE % (weeks >0) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| holt | 126 | 218.05 | 423.82 | 2.09 | 13.47 | 1.399 | 1298.94 | 2462.64 | 368.41 (18/18) |
| naive-1 | 126 | 199.65 | 405.65 | 1.92 | 12.33 | 1.277 | 1097.66 | 2381.78 | 404.14 (18/18) |
| seasonal-naive | 126 | 146.4 | 320.03 | 1.41 | 9.04 | 0.92 | 653.98 | 865.2 | 284.56 (18/18) |
| mean-7 | 126 | 133.83 | 253.09 | 1.28 | 8.27 | 0.844 | 653.98 | 865.2 | 284.56 (18/18) |

Parameter modes: {"fixed_default":1,"inner_validation":179}
Holt 7-day total vs mean-7: >2x 51/180 (28.33%) · >5x 18/180 (10%) · >10x 8/180 (4.44%)
Holt 7-day total vs actual: >2x 61/180 (33.89%) · >5x 33/180 (18.33%) · >10x 21/180 (11.67%) | mean-7 vs actual >2x 62/180 (34.44%)
Worst Holt weeks (origin start date: actual / Holt / mean-7, GBP): 2018-08-22: 289.74 / 74801.72 / 3866.17 · 2018-04-04: 330.03 / 46402.4 / 1464.19 · 2017-05-03: 434.86 / 28142.93 / 1889.65 · 2018-05-02: 2064.67 / 27091.3 / 1866.13 · 2022-02-02: 653.85 / 23193.3 / 1594.6

## M3: 4185 expense rows · daily mean 65.16 · daily median 13.63 GBP · origins scored 180, unavailable 0

### all origins
| model | daily pts | MAE | RMSE | MAE/mean | MAE/median | MASE | 7-day MAE | 7-day RMSE | 7-day MAPE % (weeks >0) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| holt | 1260 | 204.66 | 918.93 | 3.14 | 15.02 | 1.847 | 1272.62 | 5969.35 | 462.47 (180/180) |
| naive-1 | 1260 | 130.92 | 346.54 | 2.01 | 9.61 | 1.251 | 785.97 | 2207.43 | 264.07 (180/180) |
| seasonal-naive | 1260 | 87.21 | 229.36 | 1.34 | 6.4 | 0.851 | 386.68 | 583.1 | 127 (180/180) |
| mean-7 | 1260 | 87.03 | 166.09 | 1.34 | 6.39 | 0.852 | 386.68 | 583.1 | 127 (180/180) |

### first 18 origins (comparable to the synthetic report)
| model | daily pts | MAE | RMSE | MAE/mean | MAE/median | MASE | 7-day MAE | 7-day RMSE | 7-day MAPE % (weeks >0) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| holt | 126 | 188.22 | 538.75 | 2.89 | 13.81 | 1.909 | 1172.95 | 3495.66 | 715.28 (18/18) |
| naive-1 | 126 | 122.24 | 278.56 | 1.88 | 8.97 | 1.261 | 766.18 | 1760.47 | 385.08 (18/18) |
| seasonal-naive | 126 | 82.47 | 173 | 1.27 | 6.05 | 0.863 | 388.58 | 498.9 | 249.44 (18/18) |
| mean-7 | 126 | 80.31 | 139.37 | 1.23 | 5.89 | 0.846 | 388.59 | 498.9 | 249.45 (18/18) |

Parameter modes: {"fixed_default":1,"inner_validation":179}
Holt 7-day total vs mean-7: >2x 36/180 (20%) · >5x 14/180 (7.78%) · >10x 8/180 (4.44%)
Holt 7-day total vs actual: >2x 45/180 (25%) · >5x 22/180 (12.22%) · >10x 16/180 (8.89%) | mean-7 vs actual >2x 39/180 (21.67%)
Worst Holt weeks (origin start date: actual / Holt / mean-7, GBP): 2018-08-22: 289.74 / 74227.16 / 3839.15 · 2016-11-02: 223.5 / 20491.3 / 1002.82 · 2015-11-04: 138.43 / 14801.19 / 1386.49 · 2017-05-03: 434.86 / 10557.6 / 747.6 · 2020-12-23: 317.15 / 6618.88 / 1096.13
