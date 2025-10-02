import { SB_ROOT_ELEMENT_SELECTOR } from './constants.ts';

const time = globalThis.happoTime || {
  originalDateNow: Date.now,
  originalSetTimeout: globalThis.setTimeout.bind(globalThis),
};

const ASYNC_TIMEOUT = 100;
const STORY_STORE_TIMEOUT = 10_000;

let renderTimeoutMs = 2000;
let examples;
let currentIndex = 0;
let defaultDelay;
let themeSwitcher;
let forcedHappoScreenshotSteps;
let shouldWaitForCompletedEvent = true;

class ForcedHappoScreenshot extends Error {
  constructor(stepLabel) {
    super(`Forced screenshot with label "${stepLabel}"`);
    this.name = 'ForcedHappoScreenshot';
    this.type = 'ForcedHappoScreenshot';
    this.step = stepLabel;
  }
}

async function waitForSomeContent(elem, start = time.originalDateNow()) {
  const html = elem.innerHTML.trim();
  const duration = time.originalDateNow() - start;
  if (html === '' && duration < ASYNC_TIMEOUT) {
    return new Promise((resolve) =>
      time.originalSetTimeout(() => resolve(waitForSomeContent(elem, start)), 10),
    );
  }
  return html;
}

async function waitForWaitFor(waitFor, start = time.originalDateNow()) {
  const duration = time.originalDateNow() - start;
  if (!waitFor() && duration < renderTimeoutMs) {
    return new Promise((resolve) =>
      time.originalSetTimeout(() => resolve(waitForWaitFor(waitFor, start)), 50),
    );
  }
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

async function getExamples() {
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
    .filter(Boolean)
    .reduce((result, { themes, ...rest }) => {
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
    .sort((a, b) => {
      const aCompare = `${a.component}-${a.theme}-${a.storyId}`;
      const bCompare = `${b.component}-${b.theme}-${b.storyId}`;
      if (aCompare === bCompare) {
        return 0;
      }
      return aCompare < bCompare ? -1 : 1;
    });
}

function filterExamples(all) {
  if (initConfig.chunk) {
    const examplesPerChunk = Math.ceil(all.length / initConfig.chunk.total);
    const startIndex = initConfig.chunk.index * examplesPerChunk;
    const endIndex = startIndex + examplesPerChunk;
    all = all.slice(startIndex, endIndex);
  }
  if (initConfig.targetName) {
    all = all.filter((e) => {
      if (!e.targets || !Array.isArray(e.targets)) {
        // This story hasn't been filtered for specific targets
        return true;
      }
      return e.targets.includes(initConfig.targetName);
    });
  }
  if (initConfig.only) {
    all = all.filter(
      (e) =>
        e.component === initConfig.only.component &&
        e.variant === initConfig.only.variant,
    );
  }
  return all;
}

let initConfig = {};

globalThis.happo = {};

globalThis.happo.init = (config) => {
  initConfig = config;
};

function renderStory(story, { force = false } = {}) {
  const channel = globalThis.__STORYBOOK_ADDONS_CHANNEL__;
  let isPlaying = false;
  let loadingCount = 0;
  return new Promise((resolve) => {
    const timeout = time.originalSetTimeout(resolve, renderTimeoutMs);
    function handleRenderPhaseChanged(ev) {
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
          if (!pausedAtStep.done) {
            return resolve({ pausedAtStep });
          }
        }
        return resolve();
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
        resolve();
      }, 0);
    }
  });
}

globalThis.happo.nextExample = async () => {
  if (!examples) {
    examples = filterExamples(await getExamples());
  }
  if (currentIndex >= examples.length) {
    return;
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
  } = examples[currentIndex];

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
    rootElement.dataset.happoIgnore = 'true';

    const { afterScreenshot } = examples[currentIndex - 1] || {};
    if (typeof afterScreenshot === 'function') {
      try {
        await afterScreenshot({ rootElement });
      } catch (e) {
        console.error('Failed to invoke afterScreenshot hook', e);
      }
    }

    const renderResult =
      (await renderStory(
        {
          kind: component,
          story: rawVariant,
          storyId,
        },
        { force: !!forcedHappoScreenshotSteps },
      )) || {};

    pausedAtStep = renderResult.pausedAtStep;
    if (pausedAtStep) {
      variant = `${variant}-${pausedAtStep.stepLabel}`;
    } else {
      forcedHappoScreenshotSteps = undefined;
    }

    if (theme && themeSwitcher) {
      await themeSwitcher(theme, globalThis.__STORYBOOK_ADDONS_CHANNEL__);
    }

    await waitForSomeContent(rootElement);

    if (/sb-show-errordisplay/.test(document.body.className)) {
      // It's possible that the error is from unmounting the previous story. We
      // can try re-rendering in this case.
      globalThis.__STORYBOOK_ADDONS_CHANNEL__.emit('forceReRender');
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
    if (highlightsRootElement) {
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

export function forceHappoScreenshot(stepLabel) {
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

export function setDefaultDelay(delay) {
  defaultDelay = delay;
}
export function setRenderTimeoutMs(timeoutMs) {
  renderTimeoutMs = timeoutMs;
}
export function setThemeSwitcher(func) {
  themeSwitcher = func;
}
export function setShouldWaitForCompletedEvent(swfce) {
  shouldWaitForCompletedEvent = swfce;
}
export const isHappoRun = () => globalThis.__IS_HAPPO_RUN;
