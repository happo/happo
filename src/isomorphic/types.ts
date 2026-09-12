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

  /**
   * Overrides the target's `prefersReducedMotion` setting for just this
   * capture, in either direction. `null` (the default) inherits the
   * target's setting.
   *
   * A page that honours `prefers-reduced-motion` typically turns its own
   * animation off, which leaves `animate` with nothing to step through and
   * it quietly falls back to a still. Since targets prefer reduced motion
   * by default, set `prefersReducedMotion: false` here to switch it off for
   * this capture so the animation actually runs.
   *
   * Reduced motion sometimes only trims an animation rather than removing
   * it outright, and that trimmed version can be worth capturing on its
   * own — this is opt-in rather than automatic for that reason.
   *
   * @default null
   */
  prefersReducedMotion?: boolean | null;

  /**
   * Keep looking for animations after the capture starts, for the ones that
   * only start later on their own -- the items of a staggered list mounted on
   * timers after a trigger, content that arrives after a fetch. Each is taken
   * over as it appears and keeps its offset in time, so a stagger stays a
   * stagger.
   *
   * A number is short for `{ settleMs }`.
   *
   * @default { settleMs: 0, maxFrames: 90 }
   */
  discovery?: number | AnimateDiscovery;

  /**
   * Where in the capture window frames are taken.
   *
   * - `'uniform'` (default): evenly, at `fps`.
   * - `{ split, front, tail }`: `front` frames across the first `split` of
   *   the window and `tail` across the rest. For springs and overshoots,
   *   which do their moving early and then hold still.
   * - `{ times }`: exactly these times, in milliseconds.
   *
   * Anything but `'uniform'` ignores `fps`. A split always ends on the end
   * state; `times` are sampled exactly as listed, so the end state is only
   * included if one of them is at it.
   *
   * @default 'uniform'
   */
  sampling?: AnimateSampling;

  /**
   * CSS selector limiting the capture to the animations inside it, matched
   * through shadow roots. Nothing is captured when it matches nothing.
   *
   * @default null
   */
  root?: string | null;

  /**
   * What a capture has to find to count as having worked. Without this, a
   * capture that finds nothing quietly falls back to a still -- right for
   * `mode: 'auto'` across a whole target, wrong for a story that exists to
   * show an animation. Set to `null` on a story to switch a target's checks
   * off.
   *
   * @default null
   */
  expect?: AnimateExpectations | null;

  /**
   * What happens when `expect` isn't met.
   *
   * - `'image'` (default): the snapshot is replaced by an image describing
   *   the failure and every animation that was found, so it shows up as a
   *   diff that names itself.
   * - `'fail'`: the run fails.
   * - `'warn'`: logged, and whatever was captured is kept.
   *
   * @default 'image'
   */
  onExpectationFailure?: 'image' | 'fail' | 'warn';
}

export interface AnimateDiscovery {
  /** How long to keep looking, in milliseconds. Capped at 10000. */
  settleMs?: number;

  /** Cap on how many of the page's frames the search may take. */
  maxFrames?: number;
}

export type AnimateSampling =
  | 'uniform'
  | {
      /** Where the dense segment ends, as a fraction of the window. */
      split?: number;
      /** Frames in the first segment. */
      front?: number;
      /** Frames in the second segment, ending on the end state. */
      tail?: number;
    }
  | {
      /** Sample times, in milliseconds. */
      times: Array<number>;
    };

export interface AnimateExpectations {
  /** At least this many animations found (SMIL roots count). */
  minAnimations?: number;

  /** At least this many distinct frames in the encoded APNG. */
  minFrames?: number;

  /** `true` requires the `trigger` to have matched an element. */
  triggered?: boolean;
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
