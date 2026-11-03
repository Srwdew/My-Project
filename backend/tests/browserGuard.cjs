// Run directly, a harness can reach whatever listens on port 4000 through the Vite /api proxy, and can read a stale dist.
if (process.env.SPENDSENSE_TEST_RUN !== '1') throw Error('Browser tests must run through: npm run test:browser (see backend/tests/README.md)');
