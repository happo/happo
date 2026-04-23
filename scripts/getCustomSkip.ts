/**
 * Outputs a --skip JSON argument for the happo.custom.config.ts test run.
 *
 * Skips two of the four "Page" examples registered in
 * `src/custom/__happo__/index.ts`. The skipped variants come *after* an
 * unskipped "Page" example whose render function replaces the entire
 * document via `document.open()` / `document.write()`. That destroys the
 * `<script id="happo-skipped">` tag injected into iframe.html, which is
 * how `--skip` is currently delivered to the browser. If `--skip` is
 * working correctly, the Page "two" and "four" snapshots should be
 * borrowed from the baseline via the extends-report snap-request and not
 * re-rendered by the workers.
 *
 * Usage:
 *   node scripts/getCustomSkip.ts
 */

process.stdout.write(
  JSON.stringify([
    { component: 'Page', variant: 'two' },
    { component: 'Page', variant: 'four' },
  ]),
);
