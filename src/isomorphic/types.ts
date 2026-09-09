export interface AssetUrl {
  url: string;
  baseUrl: string;
}

export interface CSSBlock {
  key: string;
  content?: string;
  href?: string | undefined;
  baseUrl: string;
}

export interface InitConfig {
  chunk?: {
    index: number;
    total: number;
  };
  targetName?: string;
  only?: {
    component: string;
    variant: string;
  };
}

export interface TakeDOMSnapshotOptions {
  doc: Document | null | undefined;
  element: Element | Array<Element> | NodeListOf<Element> | null;
  responsiveInlinedCanvases?: boolean;
  transformDOM?: {
    selector: string;
    transform: (element: Element, doc: Document) => Element;
  };
  handleBase64Image?: (params: {
    base64Url: string;
    element: HTMLImageElement;
  }) => void;
  strategy?: 'hoist' | 'clip';
  /**
   * When true, extends the default pseudo-state handling by automatically
   * detecting and applying data attributes for elements currently in `:hover`,
   * `:active`, and `:focus-visible` pseudo states, and by doing deeper focus
   * traversal (e.g. into shadow DOM) when determining which element should
   * receive `data-happo-focus`.
   *
   * Note: basic focus handling (`data-happo-focus` based on `activeElement`)
   * is always applied regardless of this option. Enabling this option means
   * you can write your Playwright or Cypress tests naturally (e.g. hover or
   * focus an element) and have Happo capture those states without manually
   * adding `data-happo-hover`, `data-happo-focus-visible`, etc. attributes.
   */
  autoApplyPseudoStateAttributes?: boolean;
}

export interface DOMSnapshotResult {
  html: string;
  assetUrls: Array<AssetUrl>;
  cssBlocks: Array<CSSBlock>;
  htmlElementAttrs: Record<string, string>;
  bodyElementAttrs: Record<string, string>;
}

export interface NextExampleResult {
  component?: string;
  variant?: string;
  skipped?: boolean;
  waitForContent?: string | undefined;
  render?: () => Promise<void> | void;
  animate?: AnimateConfig | undefined;
}

export type AnimateMode = 'off' | 'auto' | 'always';

export interface AnimateTrigger {
  /**
   * CSS selector for the element to provoke. Matched through shadow roots.
   */
  selector: string;

  /**
   * The action to perform on the matched element in order to provoke the
   * animation or transition.
   */
  action:
    | 'addClass'
    | 'removeClass'
    | 'setAttribute'
    | 'removeAttribute'
    | 'click'
    | 'focus'
    | 'hover';

  /**
   * The value associated with the action:
   * - `addClass` / `removeClass`: the class name
   * - `setAttribute`: an attribute name/value pair, or a bare string, which
   *   sets the attribute to `""`
   * - `removeAttribute`: the attribute name
   * - `click` / `focus` / `hover`: not used
   */
  value?: string | { name: string; value: string };
}

export interface AnimateOptions {
  /**
   * - `'off'` (default): capture a still, as usual.
   * - `'auto'`: capture an animated PNG only when there is something Happo
   *   can drive (a CSS animation/transition, `element.animate()`, SMIL, or a
   *   `requestAnimationFrame` loop when `clock: 'virtual'` is armed).
   *   Anything else is captured as a still.
   * - `'always'`: capture an animated PNG even when nothing on the page
   *   reports a duration of its own (e.g. a `requestAnimationFrame` loop).
   */
  mode?: AnimateMode;

  /**
   * Capture window, in milliseconds, or `'auto'` to derive it from the
   * animations found on the page.
   *
   * @default 'auto'
   */
  duration?: number | 'auto';

  /**
   * Ceiling for a derived `duration`. Also the window used by
   * `mode: 'always'`, since nothing reports a duration of its own in that
   * case.
   *
   * @default 4000
   */
  maxDuration?: number;

  /**
   * Sampling rate, in frames per second. E.g. 500ms at `fps: 6` is 3 frames,
   * not 6.
   *
   * @default 10
   */
  fps?: number;

  /**
   * Hard cap on the number of frames captured. Wins over `fps` × `duration`.
   *
   * @default 24
   */
  maxFrames?: number;

  /**
   * Set to `'virtual'` to replace the page's clock so that
   * `requestAnimationFrame` animations can be stepped. Must be armed on the
   * target for a story to be able to use it, since it has to be installed
   * before the page loads.
   *
   * @default 'off'
   */
  clock?: 'off' | 'virtual';

  /**
   * What to do to the page in order to start the animation. Needed for CSS
   * transitions and other animations that don't exist until something
   * provokes them.
   *
   * Setting a trigger turns capturing on by itself, but it will not override
   * an explicitly set `mode`, including `mode: 'off'`.
   */
  trigger?: AnimateTrigger | null;

  /**
   * APNG `num_plays`. `0` loops forever.
   *
   * @default 0
   */
  loop?: number;

  /**
   * Size budget, in bytes. Overshooting drops frames rather than the
   * snapshot.
   *
   * @default 4_000_000
   */
  maxBytes?: number;
}

/**
 * Configures animated (APNG) snapshot capture.
 *
 * Shorthands: `true` means `{ mode: 'always' }`, `false` means
 * `{ mode: 'off' }`, and `'auto'` means `{ mode: 'auto' }`.
 *
 * @experimental This option and its shape are still evolving and may change
 * in a future release.
 */
export type AnimateConfig = AnimateOptions | boolean | 'auto';

export type WindowHappo = {
  init?: (config: InitConfig) => Promise<void> | void;
  nextExample?: () => Promise<NextExampleResult | undefined>;
  takeDOMSnapshot?: (options: TakeDOMSnapshotOptions) => DOMSnapshotResult;
};

export interface WindowWithHappo extends Window {
  happo?: WindowHappo | undefined;
}

export type Logger = Pick<Console, 'log' | 'error'>;

export type SkipItem =
  | { component: string; variant?: string }
  | { storyFile: string };

export type OnlyItem =
  | { component: string }
  | { storyFile: string };
