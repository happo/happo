interface NextExampleResult {
  component: string;
  variant: string;
  targets?: Array<string>;
  waitForContent?: string;
}

interface Example extends NextExampleResult {
  render: () => Promise<void> | void;
}

let examples: Array<Example> = [];
let currentIndex = 0;

interface InitParams {
  targetName: string;
  chunk?: { index: number; total: number };
  only?: { component: string; variant: string };
}

interface HappoStatic {
  init: (win?: ExtendedWindow) => void;
  registerExample: (example: Example) => void;
  reset: () => void;
}

export interface ExtendedWindow extends Window {
  happo?: {
    init: (params: InitParams) => void;
    nextExample: () => Promise<NextExampleResult | undefined>;
  };
}

const happoStatic: HappoStatic = {
  init(win: ExtendedWindow = globalThis.window as ExtendedWindow) {
    win.happo = {
      ...win.happo,
      init: ({ targetName, chunk, only }: InitParams) => {
        currentIndex = 0;
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
        examples = examples.filter((e) => {
          if (!e.targets || !Array.isArray(e.targets)) {
            // This story hasn't been filtered for specific targets
            return true;
          }
          return e.targets.includes(targetName);
        });
      },

      nextExample: async () => {
        const e = examples[currentIndex];
        if (!e) {
          // we're done
          return;
        }
        await e.render();
        currentIndex++;
        const clone = {
          component: e.component,
          variant: e.variant,
          targets: e.targets,
          waitForContent: e.waitForContent,
        } as Omit<Example, 'render'>;
        return clone;
      },
    };
  },

  registerExample(props: Example) {
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

  reset() {
    examples = [];
    currentIndex = 0;
  },
};

export default happoStatic;
