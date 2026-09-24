/**
 * Keeps the test suite from reporting errors to Sentry.
 *
 * scripts/test.ts preloads this with `--import`, but it is also imported
 * directly by the tests that can reach the telemetry reporter. That way
 * running those files with `node --test` (bypassing scripts/test.ts) doesn't
 * send events either. Child processes spawned by tests inherit process.env,
 * so this covers them too.
 */
process.env.HAPPO_DISABLE_TELEMETRY = 'true';
