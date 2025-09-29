interface Page {
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
}

export interface Config {
  /**
   * Key used to authenticate with the Happo API. Never store this in plain
   * text.
   */
  apiKey: string;

  /**
   * Secret used to authenticate with the Happo API. Never store this in plain
   * text.
   */
  apiSecret: string;

  /**
   * Browsers to test on
   */
  targets: Record<string, Target>;

  /**
   * The endpoint to use for the happo run. Defaults to `https://happo.io`
   */
  endpoint?: string;

  /**
   * The project to use for the happo run
   *
   * If you have multiple projects configured for your Happo account, specify
   * the name of the project you want to associate with. If left empty, the
   * default project will be used.
   */
  project?: string;

  plugins?: Array<unknown>;

  pages?: Array<Page>;

  /**
   * Used when you have the CI script configured to post Happo statuses as comments
   *
   * The default is `'https://api.github.com'`. If you are using GitHub
   * Enterprise, enter the URL to your local GitHub API here, such as
   * `'https://ghe.mycompany.zone/api/v3'` (the default for GHE installation is
   * for the API to be located at `/api/v3`).
   */
  githubApiUrl?: string;
}

type MobileSafariBrowserType = 'ios-safari' | 'ipad-safari';
type DesktopBrowserType = 'chrome' | 'firefox' | 'edge' | 'safari' | 'accessibility';
export type BrowserType = MobileSafariBrowserType | DesktopBrowserType;

interface BaseTarget {
  browserType: BrowserType;

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
   * Set `allowPointerEvents: true` to allow pointer events in the browser
   *
   * By default Happo injects some CSS to prevent spurious hover effects caused
   * by the system mouse pointer. If you rely on mouse interaction in your tests
   * (e.g., when using Storybook interactive stories), you might see an error
   * like this in your logs:
   *
   * > Error: Unable to perform pointer interaction as the element has
   * > `pointer-events: none`
   *
   * In some cases, this error prevents the variant from being included in the
   * report.
   *
   * To resolve this, set `allowPointerEvents: true` to tell Happo to skip
   * injecting the CSS that disables pointer events.
   *
   * If you're interested in testing `:hover`, `:focus`, and `:active` states
   * with Happo, you may also want to use the `applyPseudoClasses` option.
   */
  allowPointerEvents?: boolean;

  /**
   * Set the viewport size for the browser
   */
  viewport: `${number}x${number}`;

  // Internal flag for dynamic targets
  __dynamic?: boolean;
}

interface MobileSafariTarget extends BaseTarget {
  browserType: MobileSafariBrowserType;
}

interface DesktopTarget extends BaseTarget {
  browserType: DesktopBrowserType;

  /**
   * Set `prefersReducedMotion: true` to make the browser prefer reduced motion
   * when rendering the UI.
   */
  prefersReducedMotion?: boolean;
}

export type Target = MobileSafariTarget | DesktopTarget;

export function defineConfig(config: Config): Config {
  return config;
}
