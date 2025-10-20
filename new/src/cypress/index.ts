import takeDOMSnapshot from '../browser/takeDOMSnapshot.ts';
import chunked from './chunked.js';

Cypress.on('window:before:load', (win: unknown) => {
  if (takeDOMSnapshot.applyConstructedStylesPatch) {
    console.log('[Happo] Applying constructed styles patch');
    takeDOMSnapshot.applyConstructedStylesPatch(win);
  }
});

before(() => {
  cy.on('window:load', takeDOMSnapshot.init);
});

interface CypressConfig {
  responsiveInlinedCanvases: boolean;
  canvasChunkSize: number;
  localSnapshots?: boolean;
}

let config: CypressConfig = {
  responsiveInlinedCanvases: false,
  canvasChunkSize: 200_000, // 800 Kb per chunk
};

export const configure = (userConfig?: Partial<CypressConfig>): void => {
  config = { ...config, ...userConfig };
};

function resolveTargetName(): string {
  const { viewportHeight, viewportWidth } = Cypress.config();
  return `${Cypress.browser.name}-${viewportWidth}x${viewportHeight}`;
}

interface TakeLocalSnapshotParams {
  originalSubject: unknown;
  component: string;
  variant: string;
  targets?: Array<string> | undefined;
  options: Record<string, unknown>;
}

function takeLocalSnapshot({
  originalSubject,
  component,
  variant,
  targets,
  options,
}: TakeLocalSnapshotParams) {
  const imageId = `${Math.random()}`.slice(2);
  (cy.task as unknown as (name: string, data?: unknown, options?: unknown) => void)(
    'happoRegisterLocalSnapshot',
    {
      imageId,
      component,
      variant,
      targets,
      target: resolveTargetName(),
    },
  );
  cy.wrap(originalSubject, { log: false }).first().screenshot(imageId, options);
}

interface HappoScreenshotOptions {
  component?: string;
  variant?: string;
  responsiveInlinedCanvases?: boolean;
  includeAllElements?: boolean;
  transformDOM?: {
    selector: string;
    transform: (element: unknown, doc: unknown) => unknown;
  };
  targets?: Array<string>;
  snapshotStrategy?: 'hoist' | 'clip';
  [key: string]: unknown;
}

(
  Cypress.Commands.add as unknown as (
    name: string,
    options: { prevSubject: boolean },
    handler: (subject: unknown, options?: unknown) => void,
  ) => void
)(
  'happoScreenshot',
  { prevSubject: true },
  (originalSubject: unknown, options: unknown = {}) => {
    const happoOptions = options as HappoScreenshotOptions;
    const {
      component = cy.state('runnable').fullTitle(),
      variant = 'default',
      responsiveInlinedCanvases,
      includeAllElements,
      transformDOM,
      targets,
      snapshotStrategy = 'hoist',
      ...otherOptions
    } = happoOptions;

    if (config.localSnapshots) {
      return takeLocalSnapshot({
        originalSubject,
        component,
        variant,
        targets,
        options: otherOptions,
      });
    }

    const doc = (
      (originalSubject as Array<unknown>)[0] as { ownerDocument: unknown }
    ).ownerDocument;

    const resInCan =
      typeof responsiveInlinedCanvases === 'boolean'
        ? responsiveInlinedCanvases
        : config.responsiveInlinedCanvases;

    const domSnapshot = takeDOMSnapshot({
      doc,
      element: includeAllElements
        ? originalSubject
        : (originalSubject as Array<unknown>)[0],
      responsiveInlinedCanvases: resInCan,
      transformDOM: transformDOM,
      strategy: snapshotStrategy,
      handleBase64Image: ({
        src,
        base64Url,
      }: {
        src: string;
        base64Url: string;
      }) => {
        const rawBase64 = base64Url.replace(/^data:image\/png;base64,/, '');
        const chunks = chunked(rawBase64, config.canvasChunkSize);
        for (let i = 0; i < chunks.length; i++) {
          const base64Chunk = chunks[i];
          const isFirst = i === 0;
          const isLast = i === chunks.length - 1;
          (
            cy.task as unknown as (
              name: string,
              data?: unknown,
              options?: unknown,
            ) => void
          )(
            'happoRegisterBase64Image',
            {
              base64Chunk,
              src,
              isFirst,
              isLast,
            },
            otherOptions,
          );
        }
      },
    });

    (
      cy.task as unknown as (name: string, data?: unknown, options?: unknown) => void
    )(
      'happoRegisterSnapshot',
      {
        timestamp: Date.now(),
        component,
        variant,
        targets,
        ...domSnapshot,
      },
      otherOptions,
    );
  },
);
