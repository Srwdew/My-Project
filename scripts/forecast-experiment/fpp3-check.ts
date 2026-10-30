// Equation check: an independent Holt (FPP3 section 8.2, component form) vs the project's holt().
// Test data only, NOT evidence of accuracy. The independent side never imports project code;
// the project's holt() is imported only to be compared against.
//
// Run from the repo root:  backend/node_modules/.bin/tsx scripts/forecast-experiment/fpp3-check.ts
import { holt as projectHolt } from "../../backend/src/lib/holt";

// FPP3 8.2: l_t = a*y_t + (1-a)(l_{t-1} + b_{t-1});  b_t = B*(l_t - l_{t-1}) + (1-B*) b_{t-1};
// yhat_{T+h|T} = l_T + h*b_T. No damping, no seasonality, no clipping.
function fpp3Holt(y: number[], alpha: number, betaStar: number, l0: number, b0: number, h = 7) {
  let l = l0,
    b = b0;
  for (const yt of y) {
    const prev = l;
    l = alpha * yt + (1 - alpha) * (l + b);
    b = betaStar * (l - prev) + (1 - betaStar) * b;
  }
  return Array.from({ length: h }, (_, i) => l + (i + 1) * b);
}

// Least-squares line on the first 7 points, written independently: returns the fitted
// value at point 7 (as level) and the slope. Used to feed both sides the same l0, b0.
function olsStart(y7: number[]) {
  const xs = [1, 2, 3, 4, 5, 6, 7];
  const mx = 4,
    my = y7.reduce((s, v) => s + v, 0) / 7;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (y7[i]! - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { l0: my + slope * (7 - mx), b0: slope };
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const show = (a: number[]) => a.map((v) => v.toFixed(2).padStart(9)).join("");

const CASES: { name: string; y: number[] }[] = [
  { name: "up-trend", y: [100, 120, 115, 140, 150, 160, 158, 175, 190, 185, 200, 210, 220, 215] },
  { name: "zeros+spike", y: [300, 0, 250, 400, 0, 1800, 350, 0, 420, 380, 0, 310, 500, 290] },
  { name: "falling (clip)", y: [900, 850, 800, 700, 650, 600, 520, 450, 400, 330, 280, 200, 150, 90] },
];
const ALPHA = 0.2,
  BETA_STAR = 0.1; // the locked values (holt.ts:15-16), used unchanged

console.log("TEST DATA FOR EQUATION CHECK ONLY — not evidence of forecast accuracy\n");
let allMatch = true;
for (const c of CASES) {
  const { l0, b0 } = olsStart(c.y.slice(0, 7));
  // Project: OLS on days 1-7 gives the state AT day 7, then recursion from day 8.
  // Same start here: l0/b0 = that state, then feed days 8..T.
  const mine = fpp3Holt(c.y.slice(7), ALPHA, BETA_STAR, l0, b0);
  const proj = projectHolt(c.y.map((v) => v.toFixed(2)), String(ALPHA), String(BETA_STAR));
  const projNum = proj.amounts.map(Number);
  const mineAsProject = mine.map((v) => r2(Math.max(v, 0)));
  const match = mineAsProject.every((v, i) => Math.abs(v - projNum[i]!) <= 0.01);
  allMatch &&= match;
  // Convention probe: if the code meant state-space beta = alpha*betaStar, passing 0.1 as that
  // beta would equal book betaStar = 0.1/0.2 = 0.5. Different output => code uses book betaStar.
  const ssProbe = fpp3Holt(c.y.slice(7), ALPHA, BETA_STAR / ALPHA, l0, b0).map((v) => r2(Math.max(v, 0)));
  // Book-style naive start (l0 = y1, b0 = y2 - y1, recursion from y1): shows init sensitivity.
  const naive = fpp3Holt(c.y, ALPHA, BETA_STAR, c.y[0]!, c.y[1]! - c.y[0]!).map((v) => r2(Math.max(v, 0)));

  console.log(`== ${c.name}  l0=${l0.toFixed(4)} (project ${proj.initialLevel})  b0=${b0.toFixed(4)} (project ${proj.initialTrend})`);
  console.log("   h                      " + [1, 2, 3, 4, 5, 6, 7].map((h) => String(h).padStart(9)).join(""));
  console.log("   FPP3 raw               " + show(mine));
  console.log("   FPP3 clip0+round2      " + show(mineAsProject));
  console.log("   project holt()         " + show(projNum) + `   clampedDays=${proj.clampedDays}`);
  console.log("   [probe] beta=a*B*      " + show(ssProbe));
  console.log("   [probe] naive l0,b0    " + show(naive));
  console.log(`   match (<=0.01): ${match ? "YES" : "NO"}\n`);
}
console.log(allMatch ? "RESULT: equations equivalent on all cases" : "RESULT: mismatch found");
if (!allMatch) process.exitCode = 1;
