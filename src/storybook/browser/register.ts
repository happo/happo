import type { Channel } from 'storybook/internal/channels';
import type { StoryStore } from 'storybook/internal/preview-api';

import type {
  AnimateConfig,
  AnimateOptions,
  AnimationDriver,
  InitConfig,
  NextExampleResult,
  StoryAnimateConfig,
  WindowHappo,
  WindowHappoAnimate,
} from '../../isomorphic/types.ts';

export type {
  AnimateTrace,
  AnimationDriver,
  AnimationDriverHandle,
  StoryAnimateConfig,
  StoryAnimateOptions,
} from '../../isomorphic/types.ts';
import type { OnlyItems, SkipItems } from '../isomorphic/types.ts';
import { SB_ROOT_ELEMENT_SELECTOR } from './constants.ts';

interface HappoTime {
  originalDateNow: typeof Date.now;
  originalSetTimeout: typeof setTimeout;
}

declare global {
  var happoTime: HappoTime | undefined;
  var happoSkipped: SkipItems | undefined;
  var happoOnly: OnlyItems | null | undefined;
  var __IS_HAPPO_RUN: boolean | undefined;
  // Shared by every copy of this module on the page. See `RegisterState`.
  var __happoRegisterState: RegisterState | undefined;
  var __STORYBOOK_CLIENT_API__:
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _storyStore: StoryStore<any>;
      }
    | undefined;
  var __STORYBOOK_PREVIEW__:
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        storyStoreValue: StoryStore<any>;
      }
    | undefined;
  var __STORYBOOK_ADDONS_CHANNEL__: Channel | undefined;
  // Set up by the Happo worker, and only during a Happo run.
  var happoAnimate: WindowHappoAnimate | undefined;
}

const time = globalThis.happoTime || {
  originalDateNow: Date.now,
  originalSetTimeout: globalThis.setTimeout.bind(globalThis),
};

const STORY_STORE_TIMEOUT = 10_000;

type HookFunction = ({
  rootElement,
}: {
  rootElement: HTMLElement;
}) => void | Promise<void>;

interface Example {
  component: string;
  variant: string;
  storyId: string;
  // Undefined until `setDefaultDelay()` is called and unless the story sets
  // `parameters.happo.delay`; `setTimeout(fn, undefined)` is a zero delay,
  // which is what "no delay configured" has always meant here.
  delay: number | undefined;
  waitForContent: string | undefined;
  waitFor: () => boolean;
  beforeScreenshot: HookFunction;
  afterScreenshot: HookFunction;
  targets: Array<string>;
  theme?: string;
  animate: StoryAnimateConfig | undefined;
}

/**
 * Everything this module mutates while a Happo run is in progress.
 *
 * It lives on `globalThis` rather than in module scope because the page can
 * end up with more than one copy of this module: Happo ships a standalone
 * build of it inside the Storybook package (so the integration works without
 * `import 'happo/storybook/register'` in `.storybook/preview`), and a project
 * that imports anything from this module -- `forceHappoScreenshot` in a story
 * file, say -- gets a second copy bundled into the preview. Storybook loads
 * story files lazily, so that second copy can be evaluated *during* a run,
 * after `init()` has already collected the examples. Sharing the state means
 * whichever copy `window.happo` happens to point at is looking at the same
 * run.
 */
interface RegisterState {
  renderTimeoutMs: number;
  examples: Array<Example> | undefined;
  currentIndex: number;
  defaultDelay: number | undefined;
  themeSwitcher: ((theme: string, channel: Channel) => Promise<void>) | undefined;
  forcedHappoScreenshotSteps: Array<{ stepLabel: string; done: boolean }> | undefined;
  shouldWaitForCompletedEvent: boolean;
}

const state: RegisterState = (globalThis.__happoRegisterState ??= {
  renderTimeoutMs: 2000,
  examples: undefined,
  currentIndex: 0,
  defaultDelay: undefined,
  themeSwitcher: undefined,
  forcedHappoScreenshotSteps: undefined,
  shouldWaitForCompletedEvent: true,
});

class ForcedHappoScreenshot extends Error {
  type: string;
  step: string;

  constructor(stepLabel: string) {
    super(`Forced screenshot with label "${stepLabel}"`);
    this.name = 'ForcedHappoScreenshot';
    this.type = 'ForcedHappoScreenshot';
    this.step = stepLabel;
  }
}

async function waitForWaitFor(
  waitFor: () => boolean,
  start = time.originalDateNow(),
): Promise<void> {
  const duration = time.originalDateNow() - start;
  if (!waitFor() && duration < state.renderTimeoutMs) {
    return new Promise((resolve) =>
      time.originalSetTimeout(() => resolve(waitForWaitFor(waitFor, start)), 50),
    );
  }

  return;
}

/**
 * Type safe function to check if a value is defined
 *
 * @example
 * const filtered = values.filter(isDefined);
 */
function isDefined<T>(value: T): value is NonNullable<T> {
  if (value === undefined) {
    return false;
  }
  if (value === null) {
    return false;
  }
  return true;
}

async function getStoryStore(startTime = time.originalDateNow()) {
  const duration = time.originalDateNow() - startTime;
  if (duration >= STORY_STORE_TIMEOUT) {
    throw new Error(
      `Timeout: Could not find Storybook Client API after ${STORY_STORE_TIMEOUT}ms`,
    );
  }

  const { __STORYBOOK_CLIENT_API__: clientApi, __STORYBOOK_PREVIEW__: preview } =
    globalThis;

  if (clientApi && clientApi._storyStore) {
    return clientApi._storyStore;
  }
  if (preview && preview.storyStoreValue) {
    return preview.storyStoreValue;
  }

  // Wait 100ms and try again
  await new Promise((resolve) => time.originalSetTimeout(resolve, 100));
  return getStoryStore(startTime);
}

async function getExamples(): Promise<Array<Example>> {
  const storyStore = await getStoryStore();

  if (!storyStore) {
    throw new Error('Could not get Storybook story store');
  }

  if (!storyStore.extract) {
    throw new Error('Missing Storybook Client API');
  }

  if (storyStore.cacheAllCSFFiles) {
    await storyStore.cacheAllCSFFiles();
  }

  return Object.values(storyStore.extract())
    .map(({ id, kind, story, parameters }) => {
      if (parameters.happo === false) {
        return;
      }
      let delay = state.defaultDelay;
      let waitForContent;
      let waitFor;
      let beforeScreenshot;
      let afterScreenshot;
      let targets;
      let themes;
      let animate;
      if (typeof parameters.happo === 'object' && parameters.happo !== null) {
        delay = parameters.happo.delay || state.defaultDelay;
        waitForContent = parameters.happo.waitForContent;
        waitFor = parameters.happo.waitFor;
        beforeScreenshot = parameters.happo.beforeScreenshot;
        afterScreenshot = parameters.happo.afterScreenshot;
        targets = parameters.happo.targets;
        themes = parameters.happo.themes;
        animate = parameters.happo.animate;
      }
      return {
        component: kind,
        variant: story,
        storyId: id,
        delay,
        waitForContent,
        waitFor,
        beforeScreenshot,
        afterScreenshot,
        targets,
        themes,
        animate,
      };
    })
    .filter(isDefined)
    .reduce<Array<Example>>((result, { themes, ...rest }) => {
      if (themes) {
        for (const theme of themes) {
          result.push({
            ...rest,
            variant: `${rest.variant} [${theme}]`,
            theme,
          });
        }
      } else {
        result.push(rest);
      }

      return result;
    }, [])
    .toSorted((a, b) => {
      const aCompare = `${a.component}-${a.theme}-${a.storyId}`;
      const bCompare = `${b.component}-${b.theme}-${b.storyId}`;
      if (aCompare === bCompare) {
        return 0;
      }
      return aCompare < bCompare ? -1 : 1;
    });
}

function filterExamples(
  all: Array<Example>,
  initConfig: InitConfig,
): Array<Example> {
  const { chunk, targetName, only } = initConfig;

  if (globalThis.happoOnly) {
    const happoOnly = globalThis.happoOnly;
    all = all.filter((e) => happoOnly.some((item) => item.component === e.component));
  }

  if (globalThis.happoSkipped) {
    const happoSkipped = globalThis.happoSkipped;
    all = all.filter(
      (e) =>
        !happoSkipped.some(
          (item) =>
            item.component === e.component &&
            (item.variant === undefined || item.variant === e.variant),
        ),
    );
  }

  if (chunk) {
    const examplesPerChunk = Math.ceil(all.length / chunk.total);
    const startIndex = chunk.index * examplesPerChunk;
    const endIndex = startIndex + examplesPerChunk;
    all = all.slice(startIndex, endIndex);
  }

  if (targetName) {
    all = all.filter((e) => {
      if (!e.targets || !Array.isArray(e.targets)) {
        // This story hasn't been filtered for specific targets
        return true;
      }

      return e.targets.includes(targetName);
    });
  }

  if (only) {
    all = all.filter(
      (e) => e.component === only.component && e.variant === only.variant,
    );
  }

  return all;
}

globalThis.happo = globalThis.happo || ({} as WindowHappo);

globalThis.happo.init = async (config: InitConfig) => {
  state.examples = filterExamples(await getExamples(), config);
};

interface Story {
  kind: string;
  story: string;
  storyId: string;
}

function renderStory(
  story: Story,
  { force = false } = {},
): Promise<{ pausedAtStep?: { stepLabel: string; done: boolean } }> {
  const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;

  if (!channel) {
    throw new Error('Missing Storybook Addons Channel');
  }

  let isPlaying = false;
  let loadingCount = 0;

  return new Promise((resolve) => {
    const timeout = time.originalSetTimeout(resolve, state.renderTimeoutMs);
    function handleRenderPhaseChanged(ev: { storyId: string; newPhase: string }) {
      if (!channel) {
        throw new Error('Missing Storybook Addons Channel');
      }

      if (ev.storyId !== story.storyId) {
        console.log(
          `Skipping render phase event (${ev.newPhase}) because story IDs don't match. Current storyId: ${story.storyId}, event storyId: ${ev.storyId}`,
        );
        return;
      }

      if (ev.newPhase === 'loading') {
        loadingCount++;
      }

      if (ev.newPhase === 'finished' || ev.newPhase === 'aborted') {
        loadingCount--;
      }

      if (ev.newPhase === 'finished') {
        if (loadingCount > 0) {
          console.log(
            `Skipping finished event because loadingCount is ${loadingCount} for story ${story.storyId}`,
          );
          return;
        }

        channel.off('storyRenderPhaseChanged', handleRenderPhaseChanged);
        clearTimeout(timeout);

        if (isPlaying && state.forcedHappoScreenshotSteps) {
          const pausedAtStep = state.forcedHappoScreenshotSteps.at(-1);

          if (pausedAtStep && !pausedAtStep.done) {
            return resolve({ pausedAtStep });
          }
        }

        return resolve({});
      }

      if (ev.newPhase === 'playing') {
        isPlaying = true;
      }
    }

    if (state.shouldWaitForCompletedEvent) {
      channel.on('storyRenderPhaseChanged', handleRenderPhaseChanged);
    }

    if (force) {
      channel.emit('forceRemount', story);
    } else {
      channel.emit('setCurrentStory', story);
    }

    if (!state.shouldWaitForCompletedEvent) {
      time.originalSetTimeout(() => {
        clearTimeout(timeout);
        resolve({});
      }, 0);
    }
  });
}

function assertHTMLElement(element: Element | null): asserts element is HTMLElement {
  if (element === null) {
    throw new Error('element cannot be null');
  }
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('element must be an HTMLElement');
  }
}

globalThis.happo.nextExample = async (): Promise<NextExampleResult | undefined> => {
  if (!state.examples) {
    throw new Error(
      'Missing examples. Make sure to call the init function before calling nextExample.',
    );
  }

  if (state.currentIndex >= state.examples.length) {
    return;
  }

  const example = state.examples[state.currentIndex];
  if (!example) {
    throw new Error(`Missing example at index ${state.currentIndex}`);
  }

  const {
    component,
    variant: rawVariant,
    storyId,
    delay,
    waitForContent,
    waitFor,
    beforeScreenshot,
    theme,
    animate,
  } = example;

  let pausedAtStep;
  let variant = rawVariant;

  try {
    const docsRootElement = document.getElementById('docs-root');
    if (docsRootElement) {
      docsRootElement.dataset.happoIgnore = 'true';
    }

    const rootElement = document.querySelector(SB_ROOT_ELEMENT_SELECTOR);
    assertHTMLElement(rootElement);
    rootElement.dataset.happoIgnore = 'true';

    const { afterScreenshot } = state.examples[state.currentIndex - 1] || {};
    if (afterScreenshot && typeof afterScreenshot === 'function') {
      try {
        await afterScreenshot({ rootElement });
      } catch (e) {
        console.error('Failed to invoke afterScreenshot hook', e);
      }
    }

    // A story that animates has to render in its motion environment: its
    // reduced-motion override, its `setup` hook, and the worker's capture
    // styles all have to be in place before it mounts, or it has already
    // decided how to animate. The worker decides whether the story needs one.
    if (globalThis.happoAnimate) {
      await globalThis.happoAnimate.beforeRender(animate);
    }

    const renderResult = await renderStory(
      {
        kind: component,
        story: rawVariant,
        storyId,
      },
      { force: !!state.forcedHappoScreenshotSteps },
    );

    pausedAtStep = renderResult.pausedAtStep;

    if (pausedAtStep) {
      variant = `${variant}-${pausedAtStep.stepLabel}`;
    } else {
      state.forcedHappoScreenshotSteps = undefined;
    }

    const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
    if (!channel) {
      throw new Error('Missing Storybook Addons Channel');
    }

    if (theme && state.themeSwitcher) {
      await state.themeSwitcher(theme, channel);
    }

    if (/sb-show-errordisplay/.test(document.body.className)) {
      // It's possible that the error is from unmounting the previous story. We
      // can try re-rendering in this case.
      channel.emit('forceReRender');
    }

    if (beforeScreenshot && typeof beforeScreenshot === 'function') {
      try {
        await beforeScreenshot({ rootElement });
      } catch (e) {
        console.error('Failed to invoke beforeScreenshot hook', e);
      }
    }

    await new Promise((resolve) => time.originalSetTimeout(resolve, delay));

    if (waitFor) {
      await waitForWaitFor(waitFor);
    }

    const highlightsRootElement = document.querySelector(
      '#storybook-highlights-root',
    );
    if (
      highlightsRootElement &&
      (highlightsRootElement instanceof HTMLElement ||
        highlightsRootElement instanceof SVGElement ||
        highlightsRootElement instanceof MathMLElement)
    ) {
      highlightsRootElement.dataset.happoIgnore = 'true';
    }

    return {
      component,
      variant,
      waitForContent,
      animate: withoutHooks(animate),
    };
  } catch (e) {
    console.warn(e);
    return { component, variant };
  } finally {
    if (pausedAtStep) {
      pausedAtStep.done = true;
    } else {
      state.currentIndex++;
    }
  }
};

export function forceHappoScreenshot(stepLabel: string): void {
  if (!state.examples) {
    console.log(
      `Ignoring forceHappoScreenshot with step label "${stepLabel}" since we are not currently rendering for Happo`,
    );
    return;
  }

  if (!stepLabel) {
    throw new Error(
      'Missing stepLabel argument. Make sure to pass a string as the first argument to this function. E.g. `forceHappoScreenshot("modal open")`',
    );
  }

  if (
    state.forcedHappoScreenshotSteps &&
    state.forcedHappoScreenshotSteps.some((s) => s.stepLabel === stepLabel)
  ) {
    // ignore, this step has already been handled
    return;
  }

  state.forcedHappoScreenshotSteps = state.forcedHappoScreenshotSteps || [];
  state.forcedHappoScreenshotSteps.push({ stepLabel, done: false });

  console.log('Forcing happo screenshot', stepLabel);
  throw new ForcedHappoScreenshot(stepLabel);
}

export function setDefaultDelay(delay: number): void {
  state.defaultDelay = delay;
}

export function setRenderTimeoutMs(timeoutMs: number): void {
  state.renderTimeoutMs = timeoutMs;
}

export function setThemeSwitcher(
  func: (theme: string, channel: Channel) => Promise<void>,
): void {
  state.themeSwitcher = func;
}

export function setShouldWaitForCompletedEvent(swfce: boolean): void {
  state.shouldWaitForCompletedEvent = swfce;
}

/**
 * A story's `animate` without its hooks, for the example result that goes to
 * the worker. The hooks already reached the page through
 * `happoAnimate.beforeRender()`, and functions can't travel to the worker.
 */
function withoutHooks(
  animate: StoryAnimateConfig | undefined,
): AnimateConfig | undefined {
  if (!animate || typeof animate !== 'object') {
    return animate;
  }
  return Object.fromEntries(
    Object.entries(animate).filter(([, value]) => typeof value !== 'function'),
  ) as AnimateOptions;
}

/**
 * Teaches Happo to capture an animation it can't see on its own -- anything
 * that runs its own frame loop, like Lottie -- in animated snapshots. Does
 * nothing outside a Happo run, so it's safe to call from a Storybook preview.
 *
 * `discover(root)` should return only the animations under `root`, which is
 * how a capture is limited to part of the page.
 *
 * @example
 * registerAnimationDriver({
 *   name: 'lottie',
 *   discover: (root) =>
 *     lottie
 *       .getRegisteredAnimations()
 *       .filter((animation) => root.contains(animation.wrapper))
 *       .map((animation) => ({
 *         target: animation,
 *         element: animation.wrapper,
 *         durationMs: (animation.totalFrames / animation.frameRate) * 1000,
 *         pause: () => animation.pause(),
 *         seek: (timeMs) => animation.goToAndStop(timeMs, false),
 *       })),
 * });
 */
export function registerAnimationDriver(driver: AnimationDriver): void {
  globalThis.happoAnimate?.registerDriver(driver);
}

export const isHappoRun = (): boolean => globalThis.__IS_HAPPO_RUN ?? false;
