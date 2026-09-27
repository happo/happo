/**
 * Keeps the test suite from reporting errors to Sentry.
 *
 * vitest.config.ts runs this as a setup file before every test file, but it
 * is also imported directly by the tests that can reach the telemetry
 * reporter. That way running those files some other way (bypassing the
 * config) doesn't send events either. Child processes spawned by tests
 * inherit process.env, so this covers them too.
 */
process.env.HAPPO_DISABLE_TELEMETRY = 'true';
