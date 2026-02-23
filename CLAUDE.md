# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Happo is an open source library for integrating with [happo.io](https://happo.io) — a visual and accessibility regression testing platform. It ships as a Node.js package with a CLI tool (`happo`) and integration adapters for Storybook, Cypress, Playwright, and custom setups.

## Commands

```bash
pnpm install        # Install dependencies
pnpm build          # Full build: type-check + esbuild dist
pnpm build:types    # TypeScript declarations build (tsc project refs; emits to dist/ and tmp/tsc/)
pnpm build:dist     # esbuild bundling only
pnpm lint           # ESLint
pnpm test           # Run unit tests (Node test runner)
pnpm all            # Run everything in parallel: lint, build:types, test, test:playwright
pnpm clean          # Remove dist/, tmp/tsc, tmp/happo-custom
```

### Running a single test or subset of tests

The test script (`scripts/test.ts`) wraps Node's built-in test runner with `fzf`-based file selection:

```bash
# Run tests matching a file pattern (uses fzf fuzzy matching)
pnpm test loadConfig

# Run tests matching a test name pattern
pnpm test -- --testName "should load config"

# Watch mode with interactive file picker
pnpm test -- --watch

# Run all tests
pnpm test
```

Unit tests are TypeScript files named `*.test.ts`. The test runner looks under `src/`, `tsconfigs/`, and `scripts/` (including `__tests__/` subdirectories), so tests are not limited to `src/`. The `fzf` CLI tool must be installed for the interactive file picker.

### Environment

`.env.local` (gitignored) is loaded automatically by the test scripts. Use `env.example` as a template. Tests that hit the real Happo API require `HAPPO_API_KEY` and `HAPPO_API_SECRET`.

## Architecture

### Package Outputs

The library produces multiple distinct bundles from `scripts/build.ts` using esbuild:

| Entry point                            | Output                    | Platform | Notes                                                 |
| -------------------------------------- | ------------------------- | -------- | ----------------------------------------------------- |
| `src/cli/main.ts`                      | `dist/cli/main.js`        | node     | Executable CLI                                        |
| `src/config/index.ts`                  | `dist/config/`            | node     | Public types + `defineConfig`                         |
| `src/browser/main.ts`                  | `dist/browser/`           | browser  | IIFE bundle for in-browser snapshot capture           |
| `src/storybook/browser/`               | `dist/storybook/browser/` | browser  | Storybook addon/decorator                             |
| `src/storybook/index.ts` + `preset.ts` | `dist/storybook/`         | node     | Storybook integration (build Storybook, prep package) |
| `src/cypress/`                         | `dist/cypress/`           | node     | Cypress task + commands                               |
| `src/playwright/index.ts`              | `dist/playwright/`        | node     | Playwright integration                                |
| `src/custom/index.ts`                  | `dist/custom/`            | node     | Custom integration helper                             |

### Source Directory Map

- **`src/cli/`** — CLI entry point and command dispatching (`main`, `finalize`, `flake`, and e2e wrapper commands)
- **`src/config/`** — Public TypeScript types (`Config`, `Target`, etc.) and `defineConfig`. This is the main package export.
- **`src/environment/`** — Resolves CI environment variables (GitHub Actions, CircleCI, Travis, Azure) into a normalized `EnvironmentResult` (before/after SHAs, PR link, author, etc.)
- **`src/network/`** — All HTTP communication with happo.io: start/cancel jobs, upload assets, create async reports and comparisons, post GitHub comments
- **`src/e2e/`** — Wrapper that starts a local HTTP server to collect snap request IDs from Cypress/Playwright tests, then finalizes the Happo report
- **`src/storybook/`** — Builds a static Storybook package, injects Happo bootstrap script into `iframe.html`, and prepares it for upload
- **`src/browser/`** — Runs inside the browser to capture DOM snapshots (`takeDOMSnapshot.ts`, `applyConstructedStylesPatch.ts`)
- **`src/isomorphic/`** — Code shared between browser and node (CSS asset URL extraction, types)
- **`src/cypress/`** — Cypress task and custom command for `happoScreenshot()`
- **`src/playwright/`** — Playwright fixture/helper for `happoScreenshot()`
- **`src/custom/`** — Custom integration that lets users provide their own JS bundle

### Key Data Flow

1. **CLI invoked** → `src/cli/index.ts` parses args, resolves environment (git SHAs, CI metadata), loads config
2. **Snap requests prepared** → `src/network/prepareSnapRequests.ts` builds the static package (Storybook or custom), archives and uploads assets, then calls `RemoteBrowserTarget.execute()` for each target to queue screenshots on happo.io workers
3. **Async report created** → `src/network/createAsyncReport.ts` tells happo.io which snap request IDs belong to this SHA
4. **Async comparison created** → `src/network/createAsyncComparison.ts` diffs before/after SHAs and optionally posts a GitHub PR comment

For **E2E integrations** (Cypress/Playwright), the flow differs: a local HTTP server is started to receive snap request IDs as tests run, then the report is finalized after the test suite exits.

### TypeScript Configuration

The repo uses TypeScript project references. The root `tsconfig.json` references multiple configs in `tsconfigs/`:

- `tsconfig.dist.json` — source compilation for the published package (strict, `isolatedDeclarations`, emits to `dist/`)
- `tsconfig.browser.json` — browser-only source
- `tsconfig.isomorphic.json` — isomorphic (node + browser) source
- `tsconfig.tests.node.json`, `tsconfig.tests.playwright.json`, `tsconfig.tests.cypress.json` — test compilation (less strict, includes test helpers)

All configs extend `tsconfigs/tsconfig.base.json` which enables strict mode, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`, and `isolatedDeclarations`.

### ESLint

ESLint uses `eslint-plugin-compat` with different `browserslist` environments per directory:

- Default: `node` environment
- `src/browser/**`: `browser` environment
- `src/isomorphic/**`: `isomorphic` environment (both node + browser)

Import order is enforced with `eslint-plugin-simple-import-sort`.

### Test Infrastructure

Tests use Node's built-in test runner (`node --test`). Integration tests in `happoconfigs/` contain real happo configs used by `pnpm test:storybook`, `test:cypress`, `test:playwright`, etc. These require valid API credentials in `.env.local`.
