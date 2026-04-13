import applyConstructedStylesPatch, {
  isExtendedWindow,
} from '../browser/applyConstructedStylesPatch.ts';
import takeDOMSnapshot from '../browser/takeDOMSnapshot.ts';
import {
  isInSkipSet,
  type SkipSet,
  toSkipSet,
} from '../isomorphic/parseSkippedExamples.ts';
import type { TakeDOMSnapshotOptions } from '../isomorphic/types.ts';
import chunked from './chunked.ts';

interface HappoScreenshotOptions {
  component?: string;
  variant?: string;
  includeAllElements?: boolean;
  targets?: Array<string>;
  snapshotStrategy?: 'hoist' | 'clip';
  responsiveInlinedCanvases?: boolean;
  canvasChunkSize?: number;
  transformDOM?: {
    selector: string;
    transform: (element: Element, doc: Document) => Element;
  };

  /**
   * Options passed to the `cy.task` command
   */
  log?: boolean;
  timeout?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      happoScreenshot(options?: HappoScreenshotOptions): Chainable<Element>;
    }
  }
}

Cypress.on('window:before:load', (win: Window) => {
  console.log('[Happo] Applying constructed styles patch');
  if (!isExtendedWindow(win)) {
    throw new TypeError('CSSStyleSheet is not supported in this browser');
  }
  applyConstructedStylesPatch(win);

  // Track hover and active elements via mouse events so that takeDOMSnapshot
  // can apply data-happo-hover / data-happo-active reliably (cy.trigger fires
  // events but doesn't update querySelectorAll(':hover') / ':active').
  let _happoHoveredElement: Element | null = null;
  let _happoActiveElement: Element | null = null;

  win.document.addEventListener(
    'mouseover',
    (e) => {
      if (isEventTargetElement(e.target)) {
        _happoHoveredElement = e.target;
      }
    },
    true,
  );
  win.document.addEventListener(
    'mouseout',
    (e) => {
      if (_happoHoveredElement === e.target) {
        _happoHoveredElement = null;
      }
    },
    true,
  );
  win.document.addEventListener(
    'mousedown',
    (e) => {
      if (isEventTargetElement(e.target)) {
        _happoActiveElement = e.target;
      }
    },
    true,
  );
  win.document.addEventListener('mouseup', () => {
    _happoActiveElement = null;
  }, true);

  Object.defineProperty(win, '__happoHoveredElement', {
    get: () => _happoHoveredElement,
    configurable: true,
  });
  Object.defineProperty(win, '__happoActiveElement', {
    get: () => _happoActiveElement,
    configurable: true,
  });
});

// nodeType 1 === Element. Cross-frame safe alternative to instanceof Element.
function isEventTargetElement(target: EventTarget | null): target is Element {
  return target != null && 'nodeType' in target && (target as Node).nodeType === 1;
}

interface CypressConfig {
  responsiveInlinedCanvases: boolean;
  canvasChunkSize: number;
}

let config: CypressConfig = {
  responsiveInlinedCanvases: false,
  canvasChunkSize: 200_000, // 800 Kb per chunk
};

// Cached so the happoGetIntegrationConfig task is called at most once per run.
let cachedAutoApplyPseudoStateAttributes: boolean | null = null;
let cachedSkipSet: SkipSet | null = null;

export const configure = (userConfig?: Partial<CypressConfig>): void => {
  config = { ...config, ...userConfig };
};

Cypress.Commands.add(
  'happoScreenshot',
  { prevSubject: true },
  (originalSubject: Array<Element>, options: HappoScreenshotOptions = {}) => {
    const {
      // `cy.state` is an internal command not exposed in the type definitions.
      // We use it here to get the full title of the current test.
      component = cy
        // @ts-expect-error - cy.state is not exposed in the type definitions
        .state('runnable')
        .fullTitle(),
      variant = 'default',
      responsiveInlinedCanvases,
      includeAllElements,
      transformDOM,
      targets,
      snapshotStrategy = 'hoist',
      log = false,
      timeout = 10_000,
    } = options;

    const doc = originalSubject[0]?.ownerDocument;
    if (!doc) {
      throw new Error('ownerDocument cannot be null or undefined');
    }

    const taskOptions: Partial<Cypress.Loggable & Cypress.Timeoutable> = {
      log,
      timeout,
    };

    const resInCan =
      typeof responsiveInlinedCanvases === 'boolean'
        ? responsiveInlinedCanvases
        : config.responsiveInlinedCanvases;

    const element = includeAllElements
      ? Array.from(originalSubject)
      : originalSubject[0];
    if (!element) {
      throw new Error('element cannot be null or undefined');
    }

    const takeSnapshot = (autoApplyPseudoStateAttributes: boolean): void => {
      const properties: TakeDOMSnapshotOptions = {
        doc,
        element,
        responsiveInlinedCanvases: resInCan,
        strategy: snapshotStrategy,
        autoApplyPseudoStateAttributes,
        handleBase64Image: ({ base64Url, element }) => {
          const rawBase64 = base64Url.replace(/^data:image\/png;base64,/, '');
          const chunks = chunked(rawBase64, config.canvasChunkSize);
          for (let i = 0; i < chunks.length; i++) {
            const base64Chunk = chunks[i];
            const isFirst = i === 0;
            const isLast = i === chunks.length - 1;
            cy.task(
              'happoRegisterBase64Image',
              {
                base64Chunk,
                src: element.getAttribute('src'),
                isFirst,
                isLast,
              },
              taskOptions,
            );
          }
        },
      };

      if (transformDOM) {
        properties.transformDOM = transformDOM;
      }

      const domSnapshot = takeDOMSnapshot(properties);

      cy.task(
        'happoRegisterSnapshot',
        {
          timestamp: Date.now(),
          component,
          variant,
          targets,
          ...domSnapshot,
        },
        taskOptions,
      );
    };

    if (cachedAutoApplyPseudoStateAttributes === null) {
      cy.task<{ autoApplyPseudoStateAttributes: boolean; skippedExamples: Array<{ component: string; variant?: string }> } | null>(
        'happoGetIntegrationConfig',
        null,
        { ...taskOptions, log: false },
      ).then((happoSettings) => {
        cachedAutoApplyPseudoStateAttributes =
          happoSettings?.autoApplyPseudoStateAttributes ?? false;
        cachedSkipSet = toSkipSet(happoSettings?.skippedExamples ?? []);
        if (isInSkipSet(cachedSkipSet, component, variant)) {
          return;
        }
        takeSnapshot(cachedAutoApplyPseudoStateAttributes);
      });
    } else {
      if (cachedSkipSet && isInSkipSet(cachedSkipSet, component, variant)) {
        return;
      }
      takeSnapshot(cachedAutoApplyPseudoStateAttributes);
    }
  },
);
