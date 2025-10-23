import type { Channel } from 'storybook/internal/channels';
import type { StoryStore } from 'storybook/internal/preview-api';

import type { InitConfig, NextExampleResult } from '../../isomorphic/types.ts';
import type { SkipItems } from '../isomorphic/types.ts';
import { SB_ROOT_ELEMENT_SELECTOR } from './constants.ts';

interface HappoTime {
  originalDateNow: typeof Date.now;
  originalSetTimeout: typeof setTimeout;
}

declare global {
  var happoTime: HappoTime | undefined;
  var happoSkipped: SkipItems | undefined;
  var __IS_HAPPO_RUN: boolean | undefined;
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
}

const time = globalThis.happoTime || {
  originalDateNow: Date.now,
  originalSetTimeout: globalThis.setTimeout.bind(globalThis),
};

const ASYNC_TIMEOUT = 100;
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
  delay: number;
  waitForContent: () => boolean;
  waitFor: () => boolean;
  beforeScreenshot: HookFunction;
  afterScreenshot: HookFunction;
  targets: Array<string>;
  theme?: string;
}

let renderTimeoutMs = 2000;
let examples: Array<Example>;
let currentIndex = 0;
let defaultDelay: number;
let themeSwitcher: (theme: string, channel: Channel) => Promise<void>;
let forcedHappoScreenshotSteps:
  | Array<{ stepLabel: string; done: boolean }>
  | undefined;
let shouldWaitForCompletedEvent = true;

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

async function waitForSomeContent(
  elem: HTMLElement,
  start = time.originalDateNow(),
): Promise<string> {
  const html = elem.innerHTML.trim();
  const duration = time.originalDateNow() - start;

  if (html === '' && duration < ASYNC_TIMEOUT) {
    return new Promise((resolve) =>
      time.originalSetTimeout(() => resolve(waitForSomeContent(elem, start)), 10),
    );
  }

  return html;
}

async function waitForWaitFor(
  waitFor: () => boolean,
  start = time.originalDateNow(),
): Promise<void> {
  const duration = time.originalDateNow() - start;
  if (!waitFor() && duration < renderTimeoutMs) {
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
      let delay = defaultDelay;
      let waitForContent;
      let waitFor;
      let beforeScreenshot;
      let afterScreenshot;
      let targets;
      let themes;
      if (typeof parameters.happo === 'object' && parameters.happo !== null) {
        delay = parameters.happo.delay || defaultDelay;
        waitForContent = parameters.happo.waitForContent;
        waitFor = parameters.happo.waitFor;
        beforeScreenshot = parameters.happo.beforeScreenshot;
        afterScreenshot = parameters.happo.afterScreenshot;
        targets = parameters.happo.targets;
        themes = parameters.happo.themes;
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

let initConfig: InitConfig = {};

function filterExamples(all: Array<Example>): Array<Example> {
  const { chunk, targetName, only } = initConfig;

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

globalThis.happo = globalThis.happo || {};

globalThis.happo.init = (config: InitConfig) => {
  initConfig = config;
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
    const timeout = time.originalSetTimeout(resolve, renderTimeoutMs);
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

        if (isPlaying && forcedHappoScreenshotSteps) {
          const pausedAtStep = forcedHappoScreenshotSteps.at(-1);

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

    if (shouldWaitForCompletedEvent) {
      channel.on('storyRenderPhaseChanged', handleRenderPhaseChanged);
    }

    if (force) {
      channel.emit('forceRemount', story);
    } else {
      channel.emit('setCurrentStory', story);
    }

    if (!shouldWaitForCompletedEvent) {
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
  if (!examples) {
    examples = filterExamples(await getExamples());
  }

  if (currentIndex >= examples.length) {
    return;
  }

  const example = examples[currentIndex];
  if (!example) {
    throw new Error(`Missing example at index ${currentIndex}`);
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
  } = example;

  let pausedAtStep;
  let variant = rawVariant;

  try {
    if (
      globalThis.happoSkipped &&
      globalThis.happoSkipped.some(
        (item) => item.component === component && item.variant === variant,
      )
    ) {
      console.log(`Skipping ${component}, ${variant} since it is in the skip list`);
      return { component, variant, skipped: true };
    }

    const docsRootElement = document.getElementById('docs-root');
    if (docsRootElement) {
      docsRootElement.dataset.happoIgnore = 'true';
    }

    const rootElement = document.querySelector(SB_ROOT_ELEMENT_SELECTOR);
    assertHTMLElement(rootElement);
    rootElement.dataset.happoIgnore = 'true';

    const { afterScreenshot } = examples[currentIndex - 1] || {};
    if (afterScreenshot && typeof afterScreenshot === 'function') {
      try {
        await afterScreenshot({ rootElement });
      } catch (e) {
        console.error('Failed to invoke afterScreenshot hook', e);
      }
    }

    const renderResult = await renderStory(
      {
        kind: component,
        story: rawVariant,
        storyId,
      },
      { force: !!forcedHappoScreenshotSteps },
    );

    pausedAtStep = renderResult.pausedAtStep;

    if (pausedAtStep) {
      variant = `${variant}-${pausedAtStep.stepLabel}`;
    } else {
      forcedHappoScreenshotSteps = undefined;
    }

    const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
    if (!channel) {
      throw new Error('Missing Storybook Addons Channel');
    }

    if (theme && themeSwitcher) {
      await themeSwitcher(theme, channel);
    }

    await waitForSomeContent(rootElement);

    if (/sb-show-errordisplay/.test(document.body.className)) {
      // It's possible that the error is from unmounting the previous story. We
      // can try re-rendering in this case.
      channel.emit('forceReRender');
      await waitForSomeContent(rootElement);
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

    return { component, variant, waitForContent };
  } catch (e) {
    console.warn(e);
    return { component, variant };
  } finally {
    if (pausedAtStep) {
      pausedAtStep.done = true;
    } else {
      currentIndex++;
    }
  }
};

export function forceHappoScreenshot(stepLabel: string): void {
  if (!examples) {
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
    forcedHappoScreenshotSteps &&
    forcedHappoScreenshotSteps.some((s) => s.stepLabel === stepLabel)
  ) {
    // ignore, this step has already been handled
    return;
  }

  forcedHappoScreenshotSteps = forcedHappoScreenshotSteps || [];
  forcedHappoScreenshotSteps.push({ stepLabel, done: false });

  console.log('Forcing happo screenshot', stepLabel);
  throw new ForcedHappoScreenshot(stepLabel);
}

export function setDefaultDelay(delay: number): void {
  defaultDelay = delay;
}

export function setRenderTimeoutMs(timeoutMs: number): void {
  renderTimeoutMs = timeoutMs;
}

export function setThemeSwitcher(
  func: (theme: string, channel: Channel) => Promise<void>,
): void {
  themeSwitcher = func;
}

export function setShouldWaitForCompletedEvent(swfce: boolean): void {
  shouldWaitForCompletedEvent = swfce;
}

export const isHappoRun = (): boolean => globalThis.__IS_HAPPO_RUN ?? false;
