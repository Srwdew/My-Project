// Disposable PostgreSQL for database tests. Starts a fresh postgres:16 container bound to 127.0.0.1, applies every
// migration, checks schema.prisma against the migrated DB, runs the tests, and always removes the container.
// Never loads .env and never connects to an existing database: the main database cannot be touched from here.
// Usage (from backend/): node tests/runIsolatedDatabase.cjs                      -> DEFAULT_TESTS
//                        TESTS=tests/a.database.test.ts,tests/b.database.test.ts node tests/runIsolatedDatabase.cjs
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process'), crypto = require('crypto'), assert = require('assert/strict');
const BACKEND = path.resolve(__dirname, '..');
const stamp = Date.now(), name = 'spendsense_goals_test_iso_' + stamp, container = 'spendsense-isolated-test-' + stamp;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spendsense-iso-'));
// Drift that predates the current work (documented in 20261101010000_add_recommendation_log): allowed, nothing else.
const KNOWN_DRIFT = [/Changed the `AnomalyReview` table/, /Renamed index `AnomalyReview_userId_originalTransactionId_revision_sequence/, /Changed the `Profile` table/, /Renamed the foreign key "Profile_primaryGoal_fkey"/, /Loaded Prisma config/];
const DEFAULT_TESTS = ['anomaly', 'anomalyDimensions', 'anomalyReview', 'anomalyTolerance', 'anomalyLevelShift', 'behavior', 'forecast', 'goals', 'recommendations', 'flexibleCategories'].map(n => `tests/${n}.database.test.ts`);
const run = (cmd, args) => { const r = cp.spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true }); if (r.status !== 0) throw Error('Command failed: ' + cmd + ' ' + (r.stderr || r.stdout)); return r.stdout; };
(async () => {
  const password = crypto.randomBytes(24).toString('hex');
  run('docker', ['run', '-d', '--name', container, '--label', 'spendsense.scope=isolated-database-test', '-e', 'POSTGRES_DB=' + name, '-e', 'POSTGRES_USER=iso_test', '-e', 'POSTGRES_PASSWORD=' + password, '-p', '127.0.0.1::5432', 'postgres:16']);
  try {
    const binding = JSON.parse(run('docker', ['inspect', '--format', '{{json .NetworkSettings.Ports}}', container]))['5432/tcp'][0];
    assert.equal(binding.HostIp, '127.0.0.1');
    const url = 'postgresql://iso_test:' + password + '@127.0.0.1:' + binding.HostPort + '/' + name;
    const { Client } = require(require.resolve('pg', { paths: [BACKEND] }));
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) { const c = new Client({ connectionString: url }); try { await c.connect(); assert.equal((await c.query('select current_database() as n')).rows[0].n, name); ready = true; } catch { } finally { await c.end().catch(() => { }); } if (!ready) await new Promise(r => setTimeout(r, 500)); }
    assert.ok(ready); console.log('Verified isolated database:', name);
    const env = { ...process.env, DATABASE_URL: url, DOTENV_CONFIG_PATH: path.join(tmp, 'absent.env') };
    const prisma = args => { const r = cp.spawnSync(process.execPath, [require.resolve('prisma/build/index.js', { paths: [BACKEND] }), ...args], { env, cwd: BACKEND, encoding: 'utf8', windowsHide: true }); return { code: r.status, out: (r.stdout + r.stderr).replace(url, '<url>') }; };
    const deploy = prisma(['migrate', 'deploy']); console.log(deploy.out.split('\n').filter(l => /applied|error/i.test(l)).join('\n')); assert.equal(deploy.code, 0);
    const diff = prisma(['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code']);
    const unexpected = diff.out.split('\n').map(l => l.trim()).filter(l => l && !KNOWN_DRIFT.some(p => p.test(l)));
    console.log('schema vs migrated DB: ' + (unexpected.length ? 'UNEXPECTED DIFF\n' + unexpected.join('\n') : 'only known pre-existing drift'));
    assert.equal(unexpected.length, 0, 'schema.prisma and migrations disagree');
    const hook = path.join(tmp, 'no-env.cjs').split(path.sep).join('/');
    fs.writeFileSync(hook, "const d=require(" + JSON.stringify(require.resolve('dotenv', { paths: [BACKEND] })) + ");d.config=()=>({parsed:{}});d.configDotenv=()=>({parsed:{}});");
    const testEnv = { ...env, GOALS_TEST_DATABASE: name, JWT_SECRET: crypto.randomBytes(32).toString('hex'), NODE_OPTIONS: '--require "' + hook + '"', ANOMALY_EXPERIMENT_COLLECTION_ENABLED: 'false' };
    // Suites that accept any spendsense_goals_test_* name. Others guard their own prefix and have their own runner.
    const files = process.env.TESTS ? process.env.TESTS.split(',') : DEFAULT_TESTS;
    const t = cp.spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], { env: testEnv, cwd: BACKEND, stdio: 'inherit', windowsHide: true });
    assert.equal(t.status, 0, 'database tests failed');
  } finally { run('docker', ['rm', '-f', container]); console.log('Removed disposable container', container); }
})().catch(e => { console.error(e.message.includes('Command failed') ? 'Isolated command failed: ' + e.message.slice(0, 300) : e.message); process.exitCode = 1; });
