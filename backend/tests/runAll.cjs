// Central test runner. Usage (from backend/): node tests/runAll.cjs unit|db|browser|test|all
// Disposable postgres:16 container (always removed), .env never loaded, every file reported as PASS, FAIL or SKIP.
// A new test file not listed here counts as FAIL, so a suite cannot silently stay unrun (ISSUE-TEST-2).
const fs = require('fs'), os = require('os'), net = require('net'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
// SPENDSENSE_TEST_FRONTEND: test another checkout, e.g. to tell uncommitted frontend changes from older failures.
const BACKEND = path.resolve(__dirname, '..'), FRONTEND = process.env.SPENDSENSE_TEST_FRONTEND || path.resolve(BACKEND, '../frontend');
const mode = process.argv[2] || 'test';
if (!['unit', 'db', 'browser', 'test', 'all'].includes(mode)) throw Error('Unknown mode: ' + mode);
const wants = g => mode === 'all' || mode === g || (mode === 'test' && g !== 'browser');

const UNIT = ['anomaly', 'anomalyDetail.presentation', 'anomalyDimensions', 'anomalyLevelShift', 'anomalyTolerance', 'behavior', 'budgetNotifications', 'cycle', 'dashboard', 'forecast.backtest', 'forecast.benchmark', 'forecast', 'forecastTrend', 'goalFeasibility', 'goals.calculations', 'goalSavingsPlan', 'passwordResetProviders', 'pendingTransaction', 'presence', 'receiptBatch', 'receiptParser', 'recommendation.engine', 'recommendation.rules', 'reconciliation.frontend', 'setupChecklist', 'setupRequirement', 'testDatabaseGuard', 'weeklyExpenses.frontend'].map(n => n + '.test.ts');
const GOALS = 'spendsense_goals_test_';
// file -> database name prefix its own guard demands
const DB = {
  'admin.database.test.ts': 'spendsense_admin_test_', 'anomaly.database.test.ts': GOALS, 'anomalyDimensions.database.test.ts': GOALS, 'anomalyLevelShift.database.test.ts': GOALS, 'anomalyReview.database.test.ts': GOALS, 'anomalyTolerance.database.test.ts': GOALS, 'behavior.database.test.ts': GOALS, 'budgetNotifications.database.ts': GOALS, 'closedAccountExperiment.database.test.ts': GOALS, 'cycleDefaults.database.test.ts': GOALS, 'dashboard.database.test.ts': GOALS, 'defaultCategories.database.test.ts': GOALS + 'categories_', 'experimentRetention.test.ts': GOALS, 'flexibleCategories.database.test.ts': GOALS, 'forecast.database.test.ts': GOALS, 'goalSavingsPlan.database.test.ts': 'spendsense_goals_plan_test_', 'goals.database.test.ts': GOALS, 'notifications.http.test.ts': GOALS, 'overviewGoals.database.test.ts': GOALS + 'overview_', 'passwordReset.database.test.ts': 'spendsense_reset_test_', 'recommendations.database.test.ts': GOALS, 'reconciliation.database.test.ts': GOALS, 'settings.database.test.ts': GOALS, 'setup.database.test.ts': GOALS, 'setupInvitation.database.test.ts': GOALS, 'transactionCreateRequest.database.test.ts': GOALS + 'ocr_', 'transactionsByDate.database.test.ts': GOALS, 'transactionsLimit.database.test.ts': GOALS,
};
const BROWSER_MOCK = ['admin', 'anomaly', 'anomalyDetail', 'anomalyReview', 'behavior', 'dashboard', 'forecast', 'goalAssessment', 'goalIntention', 'guide', 'motion', 'overviewInsights', 'passwordReset', 'publicHome', 'receiptOcr', 'settings', 'setup', 'setupCompletion', 'weeklyExpenses'].map(n => n + '.browser.cjs');
const BROWSER_REAL = ['anomalyDimensions', 'anomaly.acceptance', 'defaultCategories', 'ocrHardening'].map(n => n + '.browser.cjs');
const HELPERS = ['anomaly.levelShift.backtest.ts', 'browserGuard.cjs', 'forecast.anomalyExclusion.ts', 'forecast.benchmark.ts', 'forecast.fixture.ts', 'localResetSink.ts', 'recommendation.samples.ts', 'runAll.cjs'];
// Older single-purpose runners. Most keep databases or containers behind, so nothing here calls them.
const LEGACY = ['runAnomalyDatabase', 'runAnomalyDimensionsUpgrade', 'runAnomalyReviewDatabase', 'runBehaviorDatabase', 'runBehaviorV2', 'runDashboardDatabase', 'runDefaultCategoriesDatabase', 'runForecastDatabase', 'runGoalSavingsPlan', 'runGoalsDatabase', 'runIsolatedDatabase', 'runOcrDatabase', 'runOcrHardening', 'runPasswordReset', 'runSettingsDatabase', 'runSetupMigration'].map(n => n + '.cjs');

const results = [], stamp = Date.now();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spendsense-runall-'));
const logs = path.join(tmp, 'logs'); fs.mkdirSync(logs);
const record = (group, file, status, detail = '') => { results.push({ group, file, status, detail }); console.log(`[${group}] ${status} ${file}${detail ? ' - ' + detail : ''}`); };

const hook = path.join(tmp, 'no-env.cjs').split(path.sep).join('/');
fs.writeFileSync(hook, "const d=require(" + JSON.stringify(require.resolve('dotenv', { paths: [BACKEND] })) + ");d.config=()=>({parsed:{}});d.configDotenv=()=>({parsed:{}});");
const baseEnv = () => ({ ...process.env, SPENDSENSE_TEST_RUN: '1', DOTENV_CONFIG_PATH: path.join(tmp, 'absent.env'), NODE_OPTIONS: '--require "' + hook + '"', JWT_SECRET: crypto.randomBytes(32).toString('hex'), ANOMALY_EXPERIMENT_COLLECTION_ENABLED: 'false', PASSWORD_RESET_MODE: 'disabled', NODE_ENV: 'test' });

function runFile(group, file, args, env) {
  const r = cp.spawnSync(process.execPath, args, { cwd: BACKEND, env, encoding: 'utf8', windowsHide: true, timeout: 600000, maxBuffer: 1 << 28 });
  const out = (r.stdout || '') + (r.stderr || '');
  const log = path.join(logs, group + '-' + file + '.log');
  fs.writeFileSync(log, out);
  const pass = /ℹ pass (\d+)/.exec(out)?.[1], fail = /ℹ fail (\d+)/.exec(out)?.[1];
  const counts = pass === undefined ? '' : `${pass} pass, ${fail} fail`;
  const skips = out.split('\n').filter(l => /^\s*SKIP\b/.test(l)).length;
  if (r.status === 0) return record(group, file, 'PASS', [counts, skips ? skips + ' part(s) skipped: see log' : ''].filter(Boolean).join('; '));
  record(group, file, 'FAIL', [counts, r.error?.code === 'ETIMEDOUT' ? 'timed out' : '', 'log: ' + log].filter(Boolean).join('; '));
}
const nodeTest = file => ['--import', 'tsx', '--test', '--test-concurrency=1', 'tests/' + file];

const portFree = port => new Promise(res => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(false); }); s.once('error', () => res(true)); });
const waitFor = async url => { for (let i = 0; i < 240; i++) { try { await fetch(url); return; } catch { } await new Promise(r => setTimeout(r, 250)); } throw Error('Did not start: ' + url); };

let db = null;
function dockerProblem() {
  const r = cp.spawnSync('docker', ['info'], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? null : 'Docker daemon is not reachable';
}
const docker = args => { const r = cp.spawnSync('docker', args, { encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw Error('docker ' + args[0] + ' failed'); return r.stdout; };
async function startDatabase() {
  const password = crypto.randomBytes(24).toString('hex'), container = 'spendsense-runall-' + stamp, template = GOALS + 'template_' + stamp;
  docker(['run', '-d', '--name', container, '--label', 'spendsense.scope=runall-test', '-e', 'POSTGRES_DB=' + template, '-e', 'POSTGRES_USER=runall', '-e', 'POSTGRES_PASSWORD=' + password, '-p', '127.0.0.1::5432', 'postgres:16']);
  db = { container };
  const port = JSON.parse(docker(['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]))['5432/tcp'][0].HostPort;
  const urlFor = name => `postgresql://runall:${password}@127.0.0.1:${port}/${name}`;
  const { Client } = require(require.resolve('pg', { paths: [BACKEND] }));
  const query = async sql => { const c = new Client({ connectionString: urlFor(template) }); await c.connect(); try { await c.query(sql); } finally { await c.end(); } };
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { try { await query('select 1'); ready = true; } catch { await new Promise(r => setTimeout(r, 500)); } }
  if (!ready) throw Error('Test database did not start');
  const deploy = cp.spawnSync(process.execPath, [require.resolve('prisma/build/index.js', { paths: [BACKEND] }), 'migrate', 'deploy'], { cwd: BACKEND, env: { ...baseEnv(), DATABASE_URL: urlFor(template) }, encoding: 'utf8', windowsHide: true });
  if (deploy.status !== 0) throw Error('migrate deploy failed on the test database');
  // A second connection blocks CREATE DATABASE ... TEMPLATE, so connect through the maintenance database.
  let n = 0;
  db.create = async prefix => {
    const name = prefix + stamp + '_' + (++n), c = new Client({ connectionString: urlFor('postgres') });
    await c.connect(); try { await c.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`); } finally { await c.end(); }
    return { name, url: urlFor(name) };
  };
}
const dbEnv = ({ name, url }) => ({ ...baseEnv(), DATABASE_URL: url, GOALS_TEST_DATABASE: name, ADMIN_TEST_DATABASE: name, RESET_TEST_DATABASE: name, RETENTION_TEST_DATABASE_URL: url });

function buildFrontend(apiUrl, label) {
  const outDir = path.join(tmp, 'frontend-' + label);
  const r = cp.spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { cwd: FRONTEND, env: { ...baseEnv(), NODE_ENV: 'production', VITE_API_URL: apiUrl }, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw Error('Frontend build failed: ' + (r.stderr || '').slice(0, 300));
  return outDir;
}
const children = [];
const start = (args, cwd, env) => { const c = cp.spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: 'ignore' }); children.push(c); return c; };
async function preview(outDir, port) {
  start(['node_modules/vite/bin/vite.js', 'preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], FRONTEND, baseEnv());
  await waitFor(`http://127.0.0.1:${port}/`);
}
const stopChildren = () => { while (children.length) children.pop().kill(); };

async function runBrowser() {
  const all = [...BROWSER_MOCK, ...BROWSER_REAL], skipAll = reason => all.forEach(f => record('browser', f, 'SKIP', reason));
  const chrome = process.env.SETTINGS_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  if (!fs.existsSync(chrome)) return skipAll('Chrome not found; set SETTINGS_CHROME_PATH');
  // A mock miss must not find a real API. Anything on 4000 may be connected to the main database.
  if (!await portFree(4000)) return skipAll('port 4000 is in use; stop the local backend first');
  const busy = []; for (const p of [5199, 4088, 5188, 4001, 5175, 4004, 5180]) if (!await portFree(p)) busy.push(p);
  if (busy.length) return skipAll('ports in use: ' + busy.join(', '));

  // Always rebuild: a dist from before the guard has no guard.
  const tsc = cp.spawnSync(process.execPath, ['node_modules/typescript/bin/tsc'], { cwd: BACKEND, encoding: 'utf8', windowsHide: true });
  if (tsc.status !== 0) return skipAll('backend build failed');
  if (!fs.readFileSync(path.join(BACKEND, 'dist/lib/prisma.js'), 'utf8').includes('blockNonIsolatedTestDatabase')) throw Error('dist/lib/prisma.js has no database guard');

  await preview(buildFrontend('http://localhost:4000', 'mock'), 5199);
  // No DATABASE_URL: anything in these harnesses that loads Prisma hits the central block.
  for (const f of BROWSER_MOCK) runFile('browser', f, ['tests/' + f], { ...baseEnv(), SETTINGS_BROWSER_ORIGIN: 'http://127.0.0.1:5199', DATABASE_URL: 'postgresql://none:none@127.0.0.1:1/spendsense_browser_test_none' });
  stopChildren();

  const problem = dockerProblem();
  if (problem) return BROWSER_REAL.forEach(f => record('browser', f, 'SKIP', problem));
  if (!db) await startDatabase();

  const withApi = async (apiPort, frontPort, prefix, label, run) => {
    const target = await db.create(prefix), env = dbEnv(target), api = `http://127.0.0.1:${apiPort}`;
    start(['--import', 'tsx', 'src/index.ts'], BACKEND, { ...env, PORT: String(apiPort) });
    await waitFor(api + '/health');
    await preview(buildFrontend(api, label), frontPort);
    try { await run(env, target, api, `http://127.0.0.1:${frontPort}`); } finally { stopChildren(); }
  };
  await withApi(4088, 5188, GOALS, 'dimensions', (env, _t, api, origin) => runFile('browser', 'anomalyDimensions.browser.cjs', ['tests/anomalyDimensions.browser.cjs'], { ...env, ANOMALY_BROWSER_API: api, ANOMALY_BROWSER_ORIGIN: origin }));
  await withApi(4001, 5175, GOALS + 'acceptance_', 'acceptance', (env, t, api, origin) => runFile('browser', 'anomaly.acceptance.browser.cjs', ['tests/anomaly.acceptance.browser.cjs'], { ...env, ACCEPTANCE_API: api, ACCEPTANCE_DATABASE: t.name, SETTINGS_BROWSER_ORIGIN: origin }));
  await withApi(4004, 5180, GOALS + 'categories_acceptance_', 'categories', async (env, t, api, origin) => {
    const meta = path.join(tmp, 'categories-runtime.json'), account = () => ({ email: crypto.randomUUID() + '@example.invalid', password: crypto.randomUUID() + '!A9' });
    const legacy = account(), fresh = account();
    // The harness needs an account that predates default categories, so it cannot come from /auth/register.
    const { Client } = require(require.resolve('pg', { paths: [BACKEND] })), bcrypt = require(require.resolve('bcrypt', { paths: [BACKEND] }));
    const c = new Client({ connectionString: t.url });
    await c.connect();
    try { await c.query('INSERT INTO "User" (id,email,"passwordHash","setupCompletedAt") VALUES ($1,$2,$3,now())', [crypto.randomUUID(), legacy.email, await bcrypt.hash(legacy.password, 12)]); } finally { await c.end(); }
    fs.writeFileSync(meta, JSON.stringify({ db: t.name, api, frontend: origin, legacy, fresh }));
    runFile('browser', 'defaultCategories.browser.cjs', ['tests/defaultCategories.browser.cjs'], { ...env, CATEGORY_ACCEPTANCE_RUNTIME: meta });
  });
  runFile('browser', 'ocrHardening.browser.cjs', ['--import', 'tsx', 'tests/ocrHardening.browser.cjs'], dbEnv(await db.create(GOALS + 'ocr_hardening_')));
}

function checkClassified() {
  const known = new Set([...UNIT, ...Object.keys(DB), ...BROWSER_MOCK, ...BROWSER_REAL, ...HELPERS, ...LEGACY]);
  const files = fs.readdirSync(__dirname).filter(f => /\.(ts|cjs)$/.test(f));
  for (const f of files) if (!known.has(f)) record('classify', f, 'FAIL', 'not assigned to a group in runAll.cjs');
  for (const f of known) if (!files.includes(f)) record('classify', f, 'FAIL', 'listed in runAll.cjs but missing');
  for (const f of [...BROWSER_MOCK, ...BROWSER_REAL]) if (files.includes(f) && !fs.readFileSync(path.join(__dirname, f), 'utf8').includes("require('./browserGuard.cjs')")) record('classify', f, 'FAIL', 'missing browserGuard');
}

(async () => {
  checkClassified();
  if (wants('unit')) {
    // Port 1 refuses connections: a "unit" test that really queries fails here instead of reaching a database.
    const env = { ...baseEnv(), DATABASE_URL: 'postgresql://none:none@127.0.0.1:1/spendsense_unit_test_none' };
    for (const f of UNIT) runFile('unit', f, f === 'presence.test.ts' ? ['--import', 'tsx', 'tests/' + f] : nodeTest(f), env);
  }
  if (wants('db')) {
    const problem = dockerProblem();
    if (problem) Object.keys(DB).forEach(f => record('db', f, 'SKIP', problem));
    else {
      await startDatabase();
      for (const [f, prefix] of Object.entries(DB)) runFile('db', f, f === 'budgetNotifications.database.ts' ? ['--import', 'tsx', 'tests/' + f] : nodeTest(f), dbEnv(await db.create(prefix)));
    }
  }
  if (wants('browser')) await runBrowser();
})().catch(e => { record('runner', 'runAll.cjs', 'FAIL', e.message); }).finally(() => {
  stopChildren();
  if (db) { cp.spawnSync('docker', ['rm', '-f', db.container], { windowsHide: true }); console.log('Removed disposable container', db.container); }
  const count = s => results.filter(r => r.status === s).length;
  console.log('\n===== SUMMARY =====');
  for (const r of results.filter(r => r.status !== 'PASS')) console.log(`${r.status} [${r.group}] ${r.file}${r.detail ? ' - ' + r.detail : ''}`);
  console.log(`PASS ${count('PASS')} | FAIL ${count('FAIL')} | SKIP ${count('SKIP')} | logs: ${logs}`);
  if (!wants('browser')) console.log(`NOT RUN: ${BROWSER_MOCK.length + BROWSER_REAL.length} browser suites. Run: npm run test:browser`);
  console.log(`NOT RUN: ${LEGACY.length} older runners (tests/run*.cjs), including the upgrade-path checks in runPasswordReset, runSetupMigration and runAnomalyDimensionsUpgrade.`);
  process.exitCode = count('FAIL') || count('SKIP') ? 1 : 0;
});
