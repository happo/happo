import type { NextExampleResult, WindowWithHappo } from '../isomorphic/types.ts';

declare global {
  var __HAPPO_FAIL_ON_STORY_ERROR: boolean | undefined;
}

interface HappoStaticExample extends NextExampleResult {
  component: Required<NextExampleResult>['component'];
  variant: Required<NextExampleResult>['variant'];
  render: Required<NextExampleResult>['render'];
  targets?: Array<string>;
}

let examples: Array<HappoStaticExample> = [];
let currentIndex = 0;
let renderErrors: Array<Error> = [];

const happoStatic = {
  init(win: WindowWithHappo = globalThis.window): void {
    win.happo = {
      ...win.happo,

      init: ({ targetName, chunk, only }) => {
        currentIndex = 0;
        renderErrors = [];

        if (only) {
          examples = examples.filter(
            (e) => e.component === only.component && e.variant === only.variant,
          );
        } else if (chunk) {
          const examplesPerChunk = Math.ceil(examples.length / chunk.total);
          const startIndex = chunk.index * examplesPerChunk;
          const endIndex = startIndex + examplesPerChunk;
          examples = examples.slice(startIndex, endIndex);
        }

        if (targetName) {
          examples = examples.filter((example) => {
            if (!example.targets || !Array.isArray(example.targets)) {
              // This story hasn't been filtered for specific targets
              return true;
            }

            return example.targets.includes(targetName);
          });
        }
      },

      nextExample: async () => {
        const example = examples[currentIndex];

        if (!example) {
          // we're done
          if (globalThis.__HAPPO_FAIL_ON_STORY_ERROR && renderErrors.length > 0) {
            throw new AggregateError(
              renderErrors,
              `${renderErrors.length} example(s) had errors`,
            );
          }
          return;
        }

        if (example.render) {
          try {
            await example.render();
          } catch (e) {
            if (globalThis.__HAPPO_FAIL_ON_STORY_ERROR) {
              const message =
                e instanceof Error ? e.message : String(e);
              const error = new Error(
                `${example.component} > ${example.variant}: ${message}`,
              );
              if (e instanceof Error && e.stack !== undefined) {
                error.stack = e.stack;
              }
              renderErrors.push(error);
              currentIndex++;
              return { component: example.component, variant: example.variant, skipped: true };
            }
            throw e;
          }
        }
        currentIndex++;

        const clone = {
          component: example.component,
          variant: example.variant,
          targets: example.targets,
          waitForContent: example.waitForContent,
        };

        return clone;
      },
    };
  },

  registerExample(props: HappoStaticExample): void {
    if (!props.component) {
      throw new Error('Missing `component` property');
    }
    if (!props.variant) {
      throw new Error('Missing `variant` property');
    }
    if (!props.render) {
      throw new Error('Missing `render` property');
    }

    const compType = typeof props.component;
    if (compType !== 'string') {
      throw new Error(`Property \`component\` must be a string. Got "${compType}".`);
    }

    const varType = typeof props.variant;
    if (varType !== 'string') {
      throw new Error(`Property \`variant\` must be a string. Got "${varType}".`);
    }

    const rendType = typeof props.render;
    if (rendType !== 'function') {
      throw new Error(`Property \`render\` must be a function. Got "${rendType}".`);
    }

    examples.push(props);
  },

  reset(): void {
    examples = [];
    currentIndex = 0;
    renderErrors = [];
  },
};

export default happoStatic;
