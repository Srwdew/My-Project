// Called from prisma.ts so every test that reaches Prisma is covered, including files that forget their own guard.
// Unit tests that only import Prisma transitively keep working: the block fails at connect, not at import.
const ISOLATED_DATABASE = /^spendsense_[a-z0-9_]*test_/;
const LOOPBACK = ["127.0.0.1", "localhost", "[::1]"];

export const BLOCKED_DATABASE_URL =
  "postgresql://blocked:blocked@127.0.0.1:1/blocked_non_isolated_database";

export function isIsolatedTestDatabase(url: string | undefined): boolean {
  try {
    const target = new URL(url ?? "");
    return (
      LOOPBACK.includes(target.hostname) &&
      ISOLATED_DATABASE.test(target.pathname.slice(1))
    );
  } catch {
    return false;
  }
}

export function isRunningUnderTests(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
  execArgv: string[] = process.execArgv,
): boolean {
  return (
    env.NODE_TEST_CONTEXT !== undefined ||
    env.SPENDSENSE_TEST_RUN === "1" || // set by runAll.cjs; inherited by API servers it spawns

    execArgv.includes("--test") ||
    /[\\/]tests[\\/][^\\/]+$/.test(argv[1] ?? "")
  );
}

export function blockNonIsolatedTestDatabase(): void {
  if (!isRunningUnderTests() || isIsolatedTestDatabase(process.env.DATABASE_URL))
    return;
  // Overwrite the variable, not just the adapter, so an own pg/Prisma client in the same process is blocked too.
  process.env.DATABASE_URL = BLOCKED_DATABASE_URL;
  console.error(
    "[test guard] DATABASE_URL is not an isolated test database; connections are blocked. Use the test runners in backend/tests.",
  );
}
