// Pure: never connects. The child process only constructs the Prisma client (the adapter connects lazily).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { BLOCKED_DATABASE_URL, isIsolatedTestDatabase, isRunningUnderTests } from '../src/lib/testDatabaseGuard';

test('only a loopback database with a test name counts as isolated', () => {
  for (const name of ['spendsense_goals_test_x', 'spendsense_goals_plan_test_1', 'spendsense_admin_test_1', 'spendsense_reset_test_1'])
    assert.equal(isIsolatedTestDatabase(`postgresql://u:p@127.0.0.1:5999/${name}`), true, name);
  for (const url of ['postgresql://u:p@127.0.0.1:5999/spendsense', 'postgresql://u:p@127.0.0.1:5999/my_test_db', 'postgresql://u:p@db.example.invalid:5432/spendsense_goals_test_x', 'not a url', '', undefined])
    assert.equal(isIsolatedTestDatabase(url), false, String(url));
});

test('test detection does not fire for a normal server start', () => {
  assert.equal(isRunningUnderTests({}, ['node', '/srv/tests/app/dist/index.js'], []), false);
  assert.equal(isRunningUnderTests({}, ['node', 'dist/index.js'], []), false);
  assert.equal(isRunningUnderTests({ NODE_TEST_CONTEXT: 'child-v8' }, ['node', 'x'], []), true);
  assert.equal(isRunningUnderTests({}, ['node', 'x'], ['--test']), true);
  assert.equal(isRunningUnderTests({ SPENDSENSE_TEST_RUN: '1' }, ['node', 'src/index.ts'], []), true);
  assert.equal(isRunningUnderTests({}, ['node', 'C:\\repo\\backend\\tests\\a.cjs'], []), true);
});

function urlAfterImportingPrisma(databaseUrl: string) {
  const script = "import('./src/lib/prisma.ts').then(()=>process.stdout.write(process.env.DATABASE_URL))";
  const r = spawnSync(process.execPath, ['--import', 'tsx', '--eval', script], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_TEST_CONTEXT: 'child-v8' },
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('importing prisma under tests replaces a non-isolated URL and keeps an isolated one', () => {
  assert.equal(urlAfterImportingPrisma('postgresql://u:p@127.0.0.1:1/spendsense'), BLOCKED_DATABASE_URL);
  const isolated = 'postgresql://u:p@127.0.0.1:1/spendsense_goals_test_guard';
  assert.equal(urlAfterImportingPrisma(isolated), isolated);
});
