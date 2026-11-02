# Berka (CZK) — seeded sample of 100 of 4500 accounts (seed 20261031) — holt-total-v2-e949a61713de0b90

## D1: accounts with >=1 scored origin 93 of 100; unavailable origins (gate) 1893
| model | per-account MASE | per-account MAE / mean daily | pooled daily MAE | pooled 7-day MAE |
| --- | --- | --- | --- | --- |
| holt | median 0.94 · p25 0.72 · p75 1.13 · worst 3.93 | median 1.63 · p25 1.29 · p75 2 · worst 7.09 | 1085.73 | 7137.78 |
| naive-1 | median 0.88 · p25 0.73 · p75 1.06 · worst 4.19 | median 1.53 · p25 1.34 · p75 1.81 · worst 3.63 | 990.02 | 6571.41 |
| seasonal-naive | median 1.01 · p25 0.97 · p75 1.07 · worst 3.48 | median 1.89 · p25 1.8 · p75 1.95 · worst 2.45 | 1145.87 | 6358.97 |
| mean-7 | median 0.98 · p25 0.94 · p75 1.04 · worst 3.14 | median 1.83 · p25 1.74 · p75 1.9 · worst 2.37 | 1110.52 | 6358.97 |

Holt beats baseline (per account, lower daily MAE): naive-1 40/93 · seasonal-naive 61/93 · mean-7 59/93
Worst Holt accounts by MASE: 3022 (MASE 3.932, MAE/mean 7.09), 214 (MASE 2.928, MAE/mean 5.01), 2346 (MASE 2.896, MAE/mean 1.03)
First 18 origins, pooled daily MAE: holt 1543.82 · naive-1 1390.89 · seasonal-naive 1456.77 · mean-7 1440.2

## D1-no-unlabelled-transfers: accounts with >=1 scored origin 92 of 100; unavailable origins (gate) 2005
| model | per-account MASE | per-account MAE / mean daily | pooled daily MAE | pooled 7-day MAE |
| --- | --- | --- | --- | --- |
| holt | median 0.95 · p25 0.71 · p75 1.12 · worst 18.03 | median 1.6 · p25 1.25 · p75 1.94 · worst 7.09 | 1038.76 | 6830.63 |
| naive-1 | median 0.86 · p25 0.71 · p75 1.03 · worst 17.95 | median 1.51 · p25 1.24 · p75 1.79 · worst 3.34 | 950.59 | 6340.04 |
| seasonal-naive | median 1.01 · p25 0.96 · p75 1.07 · worst 18.04 | median 1.91 · p25 1.79 · p75 1.95 · worst 2.45 | 1107.95 | 6222.21 |
| mean-7 | median 0.99 · p25 0.94 · p75 1.04 · worst 18.07 | median 1.84 · p25 1.74 · p75 1.91 · worst 2.37 | 1076.98 | 6222.21 |

Holt beats baseline (per account, lower daily MAE): naive-1 36/92 · seasonal-naive 62/92 · mean-7 61/92
Worst Holt accounts by MASE: 2346 (MASE 18.034, MAE/mean 1.22), 3022 (MASE 3.932, MAE/mean 7.09), 40 (MASE 2.031, MAE/mean 1.31)
First 18 origins, pooled daily MAE: holt 1857.33 · naive-1 1597.55 · seasonal-naive 1585.36 · mean-7 1562.64
