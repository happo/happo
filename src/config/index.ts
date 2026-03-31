import type { SkipItems } from '../storybook/isomorphic/types.ts';

export interface StorybookIntegration {
  type: 'storybook';

  /**
   * The directory containing the Storybook configuration
   */
  configDir?: string;

  /**
   * The directory containing the static files to serve
   */
  staticDir?: string;

  /**
   * The directory to output the static Storybook package to
   */
  outputDir?: string;

  /**
   * Whether to use a prebuilt Storybook package. If you use this option, make
   * sure that files are built to the outputDir.
   */
  usePrebuiltPackage?: boolean;

  /**
   * Items to skip when generating snapshots.
   *
   * Can be an async function that resolves to an array of `{component,
   * variant}`, or an array of `{component, variant}`.
   */
  skip?: SkipItems | (() => Promise<SkipItems>) | undefined;

  /**
   * When `true`, stories that render with errors (e.g. unhandled exceptions
   * that cause Storybook to show its error overlay) will cause the Happo run
   * to fail with an `AggregateError` listing every affected story, rather than
   * silently capturing screenshots of the error display.
   *
   * Defaults to `false` for backwards compatibility. The default may change
   * in a future major release.
   */
  failOnStoryError?: boolean;
}

interface BaseE2EIntegration {
  /**
   * Whether to allow failures.
   */
  allowFailures?: boolean;

  /**
   * Whether to download and include all assets in the asset package. If false
   * (default), only local assets will be included. When true, even external
   * assets will be included.
   */
  downloadAllAssets?: boolean;

  /**
   * When set to `true`, Happo automatically detects elements that are in
   * `:hover`, `:active`, or `:focus-visible` states at the moment a screenshot
   * is taken and adds the corresponding `data-happo-hover`,
   * `data-happo-active`, and `data-happo-focus-visible` attributes. It also
   * improves focus handling by traversing into shadow DOM to find the deepest
   * focused element so that `data-happo-focus` is applied reliably.
   *
   * Note: basic focus handling (`data-happo-focus` based on `activeElement`)
   * is always applied regardless of this option.
   *
   * This lets you write tests naturally (e.g. hover or focus an element) and
   * have Happo capture those states without any extra markup.
   *
   * Requires `applyPseudoClasses: true` on your targets for the attributes to
   * be rendered as CSS pseudo-class styles on Happo workers.
   */
  autoApplyPseudoStateAttributes?: boolean;
}

interface CypressIntegration extends BaseE2EIntegration {
  type: 'cypress';
}

interface PlaywrightIntegration extends BaseE2EIntegration {
  type: 'playwright';
}

export type E2EIntegration = CypressIntegration | PlaywrightIntegration;

interface CustomIntegration {
  type: 'custom';

  /**
   * An async function that generates a custom package. Returns an object with
   * the path to the folder containing the custom files and the path to the
   * entry point file relative to the root directory.
   *
   * Optionally return `estimatedSnapsCount` to enable server-side auto-chunking,
   * which parallelizes rendering across multiple workers.
   *
   * @example
   * { rootDir: 'dist/custom', entryPoint: 'index.js', estimatedSnapsCount: 42 }
   */
  build: () => Promise<{
    rootDir: string;
    entryPoint: string;
    estimatedSnapsCount?: number;
  }>;

  /**
   * When `true`, examples whose `render` function throws will cause the Happo
   * run to fail with an `AggregateError` listing every affected example,
   * rather than silently capturing screenshots of whatever partial state was
   * rendered.
   *
   * Defaults to `false` for backwards compatibility. The default may change
   * in a future major release.
   */
  failOnStoryError?: boolean;
}

export interface Page {
  /**
   * URL of the page to screenshot
   *
   * Note: The URLs to the website need to be publicly available, otherwise
   * Happo workers won't be able to access the pages.
   */
  url: string;

  /**
   * Title of the page to screenshot
   *
   * This is used as the "component" identifier in Happo reports, so ensure
   * it is unique for each page.
   */
  title: string;

  /**
   * Wait for the content to appear on the page before taking the screenshot.
   */
  waitForContent?: string;

  /**
   * Wait for a condition to be true before taking the screenshot.
   */
  waitForSelector?: string;
}

interface PagesIntegration {
  type: 'pages';

  /**
   * A list of pages to screenshot.
   */
  pages: Array<Page>;
}

/**
 * Settings for deep compare functionality
 */
export interface DeepCompareSettings {
  /**
   * Threshold for comparing images with the given diff algorithm (float between
   * 0 and 1). 1 means all differences are allowed. 0 means no differences are
   * allowed. A good starting value is 0.03 for color-delta and 0.01 for ssim.
   */
  compareThreshold: number;

  /**
   * Algorithm to use for diff comparison. Must be "color-delta" or "ssim".
   * Defaults to "color-delta" if not provided. Note that "ssim" is experimental
   * and may be removed in the future.
   */
  diffAlgorithm?: 'color-delta' | 'ssim';

  /**
   * Threshold for ignoring individual pixel differences, side-stepping the
   * compare threshold. Used relatively to the image size. E.g. a value of 0.01
   * means 1% of the pixels can be above the compare threshold. Use this option
   * if your screenshots contain images or graphics with sharp noise. It is not
   * recommended to use this option for other types of diffs. (float
   * between 0 and 1).
   */
  ignoreThreshold?: number;

  /**
   * Whether to ignore whitespace in the diff. If true, whitespace differences
   * will not be considered when comparing images. Whitespace is defined as a
   * vertical section in a screenshot containing a single solid color.
   */
  ignoreWhitespace?: boolean;

  /**
   * Whether to apply blur to the diff. This can be used to smooth out subtle
   * differences that would otherwise be above the compare threshold. This
   * should mainly be used when your screenshots have a high contrast and you
   * want to smooth out some of the sharpness that can otherwise cause flakiness.
   */
  applyBlur?: boolean;
}

export interface Config {
  /**
   * Key used to authenticate with the Happo API. Never store this in plain
   * text.
   */
  apiKey?: string;

  /**
   * Secret used to authenticate with the Happo API. Never store this in plain
   * text.
   */
  apiSecret?: string;

  /**
   * The endpoint to use for the happo run. Defaults to `https://happo.io`
   */
  endpoint?: string;

  /**
   * The name of the project to associate the Happo run with. If not provided,
   * the default project will be used.
   */
  project?: string;

  /**
   * Use this to post Happo statuses as comments to your PR. This can be useful
   * if the Happo server doesn't have access to your GitHub repository.
   *
   * The default is `'https://api.github.com'`. If you are using GitHub
   * Enterprise, enter the URL to your local GitHub API here, such as
   * `'https://ghe.mycompany.zone/api/v3'` (the default for GHE installation is
   * for the API to be located at `/api/v3`).
   */
  githubApiUrl?: string;

  /**
   * Browsers to use when generating snapshots
   */
  targets: Record<string, Target>;

  /**
   * Type of integration to use
   *
   * - 'storybook': Use Storybook to generate snapshots
   * - 'e2e': Use Playwright or Cypress to generate snapshots
   * - 'custom': Use a custom JS bundle to generate snapshots
   *
   * - 'pages': Use a list of pages to generate snapshots
   */
  integration?:
    | StorybookIntegration
    | CypressIntegration
    | PlaywrightIntegration
    | CustomIntegration
    | PagesIntegration;

  /**
   * An object with settings for deep compare.
   */
  deepCompare?: DeepCompareSettings;
}

type MobileSafariBrowserType = 'ios-safari' | 'ipad-safari';
type DesktopBrowserType = 'chrome' | 'firefox' | 'edge' | 'safari' | 'accessibility';
export type BrowserType = MobileSafariBrowserType | DesktopBrowserType;

interface BaseTarget {
  type: BrowserType;

  /**
   * Split the target into chunks to be run on multiple workers in parallel
   *
   * This adds some overhead, so if your test suite isn't large, using more than
   * one chunk might actually slow things down.
   */
  chunks?: number;

  /**
   * Override the default maximum height (5000px) used by Happo workers
   *
   * This is useful when taking screenshots of tall components or pages.
   *
   * Note: The maximum width defaults to the maximum height, so if you set
   * `maxHeight`, you may also want to set `maxWidth` at the same time.
   */
  maxHeight?: number;

  /**
   * Override the default maximum width used by Happo workers (defaults to
   * `maxHeight`, which defaults to 5000 pixels)
   *
   * This is useful when taking screenshots of wide components or pages.
   */
  maxWidth?: number;

  /**
   * Controls how Happo handles elements with the `data-happo-hide` attribute.
   * By default, elements with this attribute are made invisible. Use the value
   * `'ignore'` to make the content appear in screenshots but exclude it from
   * comparison.
   */
  hideBehavior?: 'ignore';

  /**
   * When set to `true`, this option allows you to add `data-happo-hover`,
   * `data-happo-focus`, and `data-happo-active` attributes to your DOM elements
   * and have Happo apply the corresponding `:hover`, `:focus`, or `:active`
   * styles.
   *
   * For example, if you have this markup:
   *
   * ```html
   * <button>Hover me</button>
   * <style>
   *   button:hover {
   *     background-color: blue;
   *   }
   * </style>
   * ```
   *
   * To apply the hover style before taking the screenshot (making the button
   * blue), change the markup to:
   *
   * ```html
   * <button data-happo-hover>Hover me</button>
   * <style>
   *   button:hover {
   *     background-color: blue;
   *   }
   * </style>
   * ```
   *
   * Similarly, you can add focus to elements using `data-happo-focus`:
   *
   * ```html
   * <input type="text" data-happo-focus />
   * ```
   *
   * And add `data-happo-active` to elements to simulate the `:active` state:
   *
   * ```html
   * <button data-happo-active>Click me</button>
   * <style>
   *   button:active {
   *     background-color: red;
   *   }
   * </style>
   * ```
   */
  applyPseudoClasses?: boolean;

  /**
   * Set `prefersColorScheme: 'dark'` or `prefersColorScheme: 'light'` to set
   * the color scheme preference in the browser.
   */
  prefersColorScheme?: 'light' | 'dark';

  /**
   * Controls whether pointer events are allowed in the browser. Defaults to
   * `true`.
   *
   * When `true` (the default), Happo does not inject CSS to disable pointer
   * events, which allows mouse interaction in your tests (e.g., when using
   * Storybook interactive stories).
   *
   * Set `allowPointerEvents: false` to tell Happo to inject CSS that disables
   * pointer events. This can prevent spurious hover effects caused by the
   * system mouse pointer.
   *
   * If you're interested in testing `:hover`, `:focus`, and `:active` states
   * with Happo, you may also want to use the `applyPseudoClasses` option.
   */
  allowPointerEvents?: boolean;

  /**
   * Set `freezeAnimations: 'last-frame'` to freeze the animations at the last
   * frame. This is the default behavior.
   *
   * Set `freezeAnimations: 'first-frame'` to freeze the animations at the first
   * frame.
   */
  freezeAnimations?: 'last-frame' | 'first-frame';
}

interface MobileSafariTarget extends BaseTarget {
  type: MobileSafariBrowserType;
}

interface DesktopTarget extends BaseTarget {
  type: DesktopBrowserType;

  /**
   * Set the viewport size for the browser
   */
  viewport: `${number}x${number}`;

  /**
   * By default, Happo makes the browser prefer reduced motion when rendering
   * the UI. Set `prefersReducedMotion: false` to disable this behavior.
   */
  prefersReducedMotion?: boolean;

  /**
   * Add additional headers to the outgoing requests from the browser. This is
   * useful if you for instance need to tell a CDN that the request originates
   * from a Happo run.
   */
  outgoingRequestHeaders?: Array<{ name: string; value: string }>;
}

export type Target = MobileSafariTarget | DesktopTarget;

export interface TargetWithDefaults extends BaseTarget {
  viewport: `${number}x${number}`;
  __dynamic: boolean;
  prefersReducedMotion?: boolean;
}

export interface ConfigWithDefaults extends Config {
  apiKey: NonNullable<Config['apiKey']>;
  apiSecret: NonNullable<Config['apiSecret']>;
  integration: NonNullable<Config['integration']>;
  endpoint: NonNullable<Config['endpoint']>;
  githubApiUrl: NonNullable<Config['githubApiUrl']>;
  targets: Record<string, TargetWithDefaults>;
}

export function defineConfig(config: Config): Config {
  return config;
}
