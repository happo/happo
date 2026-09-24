import { inspect } from 'node:util';

import * as v from 'valibot';

import findClosestMatch from '../utils/findClosestMatch.ts';
import type {
  AnimateConfig,
  AnimateDiscovery,
  AnimateExpectations,
  AnimateOptions,
  AnimateSamplingStop,
  AnimateStages,
  AnimateTrigger,
  BrowserType,
  Config,
  DeepCompareSettings,
  E2EIntegration,
  Page,
  StorybookIntegration,
  Target,
  TargetWithDefaults,
} from './index.ts';

// Every `*Entries` object below is checked with `satisfies EntriesOf<T>`, which
// fails to compile if it is missing an option that the public type has, or
// has one that the public type doesn't. Together with the return type of
// `parseConfig`, this keeps the schema and the public types in sync.
type EntriesOf<T> = Record<keyof T, v.GenericSchema>;

type CustomIntegration = Extract<
  NonNullable<Config['integration']>,
  { type: 'custom' }
>;
type PagesIntegration = Extract<
  NonNullable<Config['integration']>,
  { type: 'pages' }
>;
// The desktop variant has every target option, so we check the target schema
// against it.
type DesktopTarget = Exclude<Target, { type: 'ios-safari' | 'ipad-safari' }>;

const TARGETS_DOCS_URL = 'https://docs.happo.io/docs/configuration#targets';

const TARGET_TYPES = [
  'chrome',
  'firefox',
  'edge',
  'safari',
  'ios-safari',
  'ipad-safari',
  'accessibility',
] as const satisfies ReadonlyArray<BrowserType>;

const DEFAULT_VIEWPORT = '1024x768';

const DEFAULT_ENDPOINT = 'https://happo.io';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Valibot's `object` and `record` schemas accept arrays and class instances
 * like `Map` (which `record` turns into an empty object), so we check that we
 * have a plain object first.
 *
 * This is the only `custom` schema that can end up inside a union, where its
 * `expects` of `unknown` shows up in the union's message. `describeExpected`
 * describes that as an object.
 */
const plainObjectCheck = v.custom<Record<string, unknown>>(
  isPlainObject,
  'must be an object',
);

function plainObject<TEntries extends v.ObjectEntries>(entries: TEntries) {
  return v.pipe(plainObjectCheck, v.looseObject(entries));
}

function plainRecord<TValue extends v.GenericSchema>(value: TValue) {
  return v.pipe(plainObjectCheck, v.record(v.string(), value));
}

const betweenZeroAndOne = v.pipe(
  v.number('must be a number between 0 and 1'),
  v.minValue(0, 'must be a number between 0 and 1'),
  v.maxValue(1, 'must be a number between 0 and 1'),
);

const viewport = v.custom<`${number}x${number}`>(
  (value) => typeof value === 'string' && /^\d+x\d+$/.test(value),
  `must be a string like '${DEFAULT_VIEWPORT}'`,
);

const animateTriggerEntries = {
  selector: v.string(),
  action: v.picklist([
    'addClass',
    'removeClass',
    'setAttribute',
    'removeAttribute',
    'click',
    'focus',
    'hover',
  ]),
  value: v.exactOptional(
    v.union([v.string(), plainObject({ name: v.string(), value: v.string() })]),
  ),
} satisfies EntriesOf<AnimateTrigger>;

const animateDiscoveryEntries = {
  settleMs: v.exactOptional(v.number()),
  maxFrames: v.exactOptional(v.number()),
} satisfies EntriesOf<AnimateDiscovery>;

const animateSamplingStopEntries = {
  stop: v.number(),
  frames: v.exactOptional(v.number()),
} satisfies EntriesOf<AnimateSamplingStop>;

const animateExpectationsEntries = {
  minAnimations: v.exactOptional(v.number()),
  minFrames: v.exactOptional(v.number()),
  triggered: v.exactOptional(v.boolean()),
  minStages: v.exactOptional(v.number()),
  drivers: v.exactOptional(plainRecord(v.number())),
} satisfies EntriesOf<AnimateExpectations>;

const animateStagesEntries = {
  max: v.exactOptional(v.number()),
  waitMs: v.exactOptional(v.number()),
} satisfies EntriesOf<AnimateStages>;

const animateOptionsEntries = {
  mode: v.exactOptional(v.picklist(['off', 'auto', 'always'])),
  duration: v.exactOptional(v.union([v.number(), v.literal('auto')])),
  maxDuration: v.exactOptional(v.number()),
  fps: v.exactOptional(v.number()),
  maxFrames: v.exactOptional(v.number()),
  clock: v.exactOptional(v.picklist(['off', 'virtual'])),
  trigger: v.exactOptional(v.nullable(plainObject(animateTriggerEntries))),
  loop: v.exactOptional(v.number()),
  maxBytes: v.exactOptional(v.number()),
  prefersReducedMotion: v.exactOptional(v.nullable(v.boolean())),
  discovery: v.exactOptional(
    v.union([v.number(), plainObject(animateDiscoveryEntries)]),
  ),
  sampling: v.exactOptional(
    v.union([
      v.literal('uniform'),
      v.array(plainObject(animateSamplingStopEntries)),
      plainObject({ times: v.array(v.number()) }),
    ]),
  ),
  root: v.exactOptional(v.nullable(v.string())),
  expect: v.exactOptional(v.nullable(plainObject(animateExpectationsEntries))),
  onExpectationFailure: v.exactOptional(v.picklist(['image', 'fail', 'warn'])),
  drivers: v.exactOptional(v.nullable(v.array(v.string()))),
  stages: v.exactOptional(v.union([v.number(), plainObject(animateStagesEntries)])),
} satisfies EntriesOf<AnimateOptions>;

const animateConfig = v.union([
  v.boolean(),
  v.literal('auto'),
  plainObject(animateOptionsEntries),
]);

/**
 * Determines whether a target's `animate` setting would actually trigger
 * animated snapshot capture, accounting for the shorthands (`true`,
 * `false`, `'auto'`) as well as a trigger implicitly turning capture on.
 */
function isAnimateEnabled(animate: AnimateConfig | undefined): boolean {
  if (animate === undefined || animate === false) {
    return false;
  }

  if (animate === true || animate === 'auto') {
    return true;
  }

  if (animate.trigger) {
    return true;
  }
  return animate.mode !== undefined && animate.mode !== 'off';
}

/**
 * The previous hand-written validation applied these defaults with `||` or
 * `??`, so we keep accepting `null` for them.
 */
function nullishWithDefault<
  TSchema extends v.GenericSchema,
  TDefault extends v.InferOutput<TSchema>,
>(schema: TSchema, defaultValue: TDefault) {
  return v.exactOptional(v.nullable(schema, defaultValue), defaultValue);
}

const targetEntries = {
  type: v.picklist(TARGET_TYPES),
  viewport: nullishWithDefault(viewport, DEFAULT_VIEWPORT),
  chunks: v.exactOptional(v.number()),
  maxHeight: v.exactOptional(v.number()),
  maxWidth: v.exactOptional(v.number()),
  hideBehavior: v.exactOptional(v.literal('ignore')),
  applyPseudoClasses: v.exactOptional(v.boolean()),
  prefersColorScheme: v.exactOptional(v.picklist(['light', 'dark'])),
  allowPointerEvents: nullishWithDefault(v.boolean(), true),
  freezeAnimations: nullishWithDefault(
    v.picklist(['last-frame', 'first-frame']),
    'last-frame',
  ),
  animate: v.exactOptional(animateConfig),
  prefersReducedMotion: nullishWithDefault(v.boolean(), true),
  outgoingRequestHeaders: v.exactOptional(
    v.array(plainObject({ name: v.string(), value: v.string() })),
  ),
  allowedHostnames: v.exactOptional(v.array(v.string())),
} satisfies EntriesOf<DesktopTarget>;

const target = v.pipe(
  plainObject(targetEntries),
  v.forward(
    v.check(
      (target) =>
        !(
          (target.type === 'ios-safari' || target.type === 'ipad-safari') &&
          isAnimateEnabled(target.animate)
        ),
      (issue) =>
        `animated snapshots are not supported on "${issue.input.type}" targets. Remove \`animate\` from this target, or capture it in a Playwright-driven browser (chrome, firefox, edge, or safari) instead.`,
    ),
    ['animate'],
  ),
);

const storybookIntegrationEntries = {
  type: v.literal('storybook'),
  configDir: v.exactOptional(v.string()),
  staticDir: v.exactOptional(v.string()),
  outputDir: v.exactOptional(v.string()),
  usePrebuiltPackage: v.exactOptional(v.boolean()),
  navigatePerStory: v.exactOptional(v.boolean()),
  previewOnly: v.exactOptional(v.boolean()),
} satisfies EntriesOf<StorybookIntegration>;

const e2eIntegrationEntries = {
  type: v.picklist(['cypress', 'playwright']),
  allowFailures: v.exactOptional(v.boolean()),
  downloadAllAssets: v.exactOptional(v.boolean()),
  autoApplyPseudoStateAttributes: v.exactOptional(v.boolean()),
} satisfies EntriesOf<E2EIntegration>;

const customIntegrationEntries = {
  type: v.literal('custom'),
  build: v.custom<CustomIntegration['build']>(
    (value) => typeof value === 'function',
    'must be a function',
  ),
} satisfies EntriesOf<CustomIntegration>;

const pageEntries = {
  url: v.string(),
  title: v.string(),
  waitForContent: v.exactOptional(v.string()),
  waitForSelector: v.exactOptional(v.string()),
  animate: v.exactOptional(animateConfig),
} satisfies EntriesOf<Page>;

const pagesIntegrationEntries = {
  type: v.literal('pages'),
  pages: v.array(plainObject(pageEntries)),
} satisfies EntriesOf<PagesIntegration>;

const deepCompareEntries = {
  compareThreshold: betweenZeroAndOne,
  diffAlgorithm: v.exactOptional(v.picklist(['color-delta', 'ssim']), 'color-delta'),
  ignoreThreshold: v.exactOptional(betweenZeroAndOne),
  ignoreWhitespace: v.exactOptional(v.boolean()),
  applyBlur: v.exactOptional(v.boolean()),
} satisfies EntriesOf<DeepCompareSettings>;

// These are functions so that every parse gets its own objects. Code later on
// adds to `config.targets` (e.g. dynamic targets in e2e/controller.ts).
function getDefaultTargets() {
  return { chrome: { type: 'chrome', viewport: DEFAULT_VIEWPORT } };
}
function getDefaultIntegration() {
  return { type: 'storybook' };
}

/**
 * A missing (or otherwise falsy) `targets` or `integration` has always meant
 * "use the default", so we keep that working.
 */
function defaultIfFalsy(getDefault: () => unknown) {
  return (value: unknown): unknown => value || getDefault();
}

const configEntries = {
  // `null` (e.g. `process.env.HAPPO_API_KEY ?? null`) has always meant "look
  // for credentials elsewhere". `parseConfig` removes it from the output.
  apiKey: v.exactOptional(v.nullable(v.string())),
  apiSecret: v.exactOptional(v.nullable(v.string())),
  endpoint: v.exactOptional(
    v.pipe(
      v.nullable(v.string()),
      v.transform((endpoint) => endpoint || DEFAULT_ENDPOINT),
    ),
    DEFAULT_ENDPOINT,
  ),
  project: v.exactOptional(v.string()),
  githubApiUrl: v.exactOptional(v.string(), 'https://api.github.com'),
  targets: v.exactOptional(
    v.pipe(
      v.unknown(),
      v.transform(defaultIfFalsy(getDefaultTargets)),
      plainRecord(target),
    ),
    getDefaultTargets,
  ),
  integration: v.exactOptional(
    v.pipe(
      v.unknown(),
      v.transform(defaultIfFalsy(getDefaultIntegration)),
      plainObjectCheck,
      v.variant('type', [
        v.looseObject(storybookIntegrationEntries),
        v.looseObject(e2eIntegrationEntries),
        v.looseObject(customIntegrationEntries),
        v.looseObject(pagesIntegrationEntries),
      ]),
    ),
    getDefaultIntegration,
  ),
  deepCompare: v.exactOptional(v.nullable(plainObject(deepCompareEntries))),
  failOnWaitForTimeout: v.exactOptional(v.boolean(), true),
} satisfies EntriesOf<Config>;

const configSchema = v.looseObject(configEntries);

/**
 * The config after validation and after defaults have been applied, but
 * before `apiKey` and `apiSecret` have been resolved (which may involve
 * network requests).
 */
export type ParsedConfig = Omit<Config, 'targets'> &
  Required<
    Pick<
      Config,
      'endpoint' | 'githubApiUrl' | 'integration' | 'failOnWaitForTimeout'
    >
  > & {
    targets: Record<string, TargetWithDefaults>;
  };

/**
 * Turns a valibot `expected` string like `("a" | "b")`, `boolean`, or
 * `(boolean | "auto" | Object)` into something readable like `one of 'a',
 * 'b'`, `a boolean`, or `a boolean, 'auto', or an object`.
 */
function describeExpected(expected: string | null): string {
  if (!expected) {
    return 'valid';
  }

  // Nested unions come through with their own parentheses, e.g.
  // `("storybook" | ("cypress" | "playwright"))`.
  const parts = expected
    .replaceAll(/[()]/g, '')
    .split(' | ')
    .map((part) => {
      if (part.startsWith('"')) {
        return `'${part.slice(1, -1)}'`;
      }
      if (part === 'unknown') {
        // See `plainObjectCheck`.
        return 'an object';
      }
      const article = /^[aeiou]/i.test(part) ? 'an' : 'a';
      return `${article} ${part.toLowerCase()}`;
    });

  if (parts.every((part) => part.startsWith("'"))) {
    return parts.length === 1 ? parts.join('') : `one of ${parts.join(', ')}`;
  }
  if (parts.length <= 2) {
    return parts.join(' or ');
  }
  return `${parts.slice(0, -1).join(', ')}, or ${parts.at(-1)}`;
}

const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

function formatPath(path: ReadonlyArray<unknown>): string {
  return path
    .map((key, index) => {
      if (typeof key === 'number') {
        return `[${key}]`;
      }
      const name = String(key);
      if (IDENTIFIER_PATTERN.test(name)) {
        return index === 0 ? name : `.${name}`;
      }
      return `[${inspect(name)}]`;
    })
    .join('');
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return 'an array';
  }
  if (value === null) {
    return 'null';
  }
  return `${typeof value} ${inspect(value)}`;
}

/**
 * Builds a snippet of what a valid `targets` config could look like, based on
 * what we were able to infer from the user's (invalid) config. This lets us
 * show people something close to what they meant to write.
 */
function exampleTargetsSnippet(
  entries: Array<{ name: string; type: unknown }>,
): string {
  const lines = entries.map(({ name, type }) => {
    // `inspect` gives us a properly escaped string literal for keys that
    // aren't valid identifiers, e.g. `'my-target'` or `"user's"`.
    const key = IDENTIFIER_PATTERN.test(name) ? name : inspect(name);
    const exampleType = TARGET_TYPES.find((known) => known === type) ?? 'chrome';
    return `    ${key}: { type: '${exampleType}', viewport: '${DEFAULT_VIEWPORT}' },`;
  });

  return ['  targets: {', ...lines, '  },'].join('\n');
}

/**
 * Some mistakes in `targets` are common enough (e.g. `targets: ['chrome']`)
 * that we want to show people what a fixed-up version looks like instead of a
 * generic message.
 */
function formatTargetsIssue(
  path: ReadonlyArray<unknown>,
  input: unknown,
  configFilePath: string,
): string | undefined {
  const [, name, option] = path;

  if (path.length === 1) {
    // People sometimes write `targets: ['chrome', 'firefox']` or
    // `targets: 'chrome'`, so we use those values to build the example.
    const entries = (Array.isArray(input) ? input : [input])
      .filter((value): value is string => typeof value === 'string' && !!value)
      .map((value) => ({ name: value, type: value }));

    return `Invalid \`targets\` in config file ${configFilePath}: must be an object where each key is a name you choose for the target and each value is an object describing the browser, got ${describeValue(input)}. For example:

${exampleTargetsSnippet(entries.length > 0 ? entries : [{ name: 'chrome', type: 'chrome' }])}

See ${TARGETS_DOCS_URL}`;
  }

  if (typeof name !== 'string') {
    return undefined;
  }

  if (path.length === 2) {
    // e.g. `targets: { chrome: 'chrome' }`
    return `Invalid target \`${name}\` in config file ${configFilePath}: each target must be an object describing the browser, got ${describeValue(input)}. For example:

${exampleTargetsSnippet([{ name, type: TARGET_TYPES.find((type) => type === input) ?? name }])}

See ${TARGETS_DOCS_URL}`;
  }

  if (path.length === 3 && option === 'type') {
    // e.g. `targets: { chrome: { viewport: '1024x768' } }`
    const got = input === undefined ? 'nothing' : inspect(input);
    return `Invalid target \`${name}\` in config file ${configFilePath}: \`type\` must be one of ${TARGET_TYPES.map((type) => `'${type}'`).join(', ')}, got ${got}. For example:

${exampleTargetsSnippet([{ name, type: name }])}

See ${TARGETS_DOCS_URL}`;
  }

  return undefined;
}

type Issue = v.BaseIssue<unknown>;

/**
 * Unions report one issue for the union as a whole, with the issues from each
 * option nested inside it. When one of the options matched the type of the
 * value (e.g. an object was given, and one of the options is an object), the
 * nested issues from that option are much more useful, so we surface those
 * instead.
 */
function flattenIssues(
  issues: ReadonlyArray<Issue>,
  parentPath: ReadonlyArray<unknown> = [],
): Array<{ issue: Issue; path: ReadonlyArray<unknown> }> {
  return issues.flatMap((issue) => {
    const path = [...parentPath, ...(issue.path ?? []).map((item) => item.key)];
    const nestedWithPaths = (issue.issues ?? []).filter(
      (nested) => nested.path && nested.path.length > 0,
    );

    if (issue.type === 'union' && nestedWithPaths.length > 0) {
      return flattenIssues(nestedWithPaths, path);
    }

    return [{ issue, path }];
  });
}

function formatIssue(
  issue: Issue,
  path: ReadonlyArray<unknown>,
  configFilePath: string,
): string {
  if (path[0] === 'targets') {
    const targetsMessage = formatTargetsIssue(path, issue.input, configFilePath);
    if (targetsMessage) {
      return targetsMessage;
    }
  }

  const where = `\`${formatPath(path)}\` in config file ${configFilePath}`;

  // Valibot reports a missing required key as an issue for the object that
  // is missing it.
  if (
    issue.kind === 'schema' &&
    issue.received === 'undefined' &&
    issue.input === undefined
  ) {
    return issue.type.endsWith('object')
      ? `Missing required option ${where}.`
      : `Missing required option ${where}: must be ${describeExpected(issue.expected)}.`;
  }

  if (issue.type === 'check') {
    return `Invalid ${where}: ${issue.message}`;
  }

  return `Invalid ${where}: ${issue.message}, got: ${inspect(issue.input, { breakLength: Infinity })}.`;
}

const MAX_REPORTED_ISSUES = 10;

function formatIssues(issues: ReadonlyArray<Issue>, configFilePath: string): string {
  const messages = flattenIssues(issues).map(({ issue, path }) =>
    formatIssue(issue, path, configFilePath),
  );

  if (messages.length === 1) {
    return messages.join('');
  }

  const shown = messages.slice(0, MAX_REPORTED_ISSUES);
  const hidden = messages.length - shown.length;

  return [
    `Found ${messages.length} problems in config file ${configFilePath}:`,
    ...shown.map((message) => `- ${message}`),
    ...(hidden > 0 ? [`...and ${hidden} more.`] : []),
  ].join('\n\n');
}

function isSchema(value: unknown): value is v.GenericSchema {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'schema'
  );
}

interface UnknownOption {
  path: ReadonlyArray<string | number>;
  knownOptions: ReadonlyArray<string>;
}

/**
 * Walks the schema alongside a (valid) config value to find options the
 * schema doesn't know about. Those are usually typos or leftovers from older
 * versions, so we want to tell people about them.
 */
function findUnknownOptions(
  schema: v.GenericSchema,
  value: unknown,
  path: ReadonlyArray<string | number> = [],
): Array<UnknownOption> {
  const unknownOptions: Array<UnknownOption> = [];

  // A piped schema is a copy of the first schema in its pipe, so we walk the
  // schemas in the pipe instead of the piped schema itself.
  if ('pipe' in schema && Array.isArray(schema.pipe)) {
    for (const item of schema.pipe) {
      if (isSchema(item)) {
        unknownOptions.push(...findUnknownOptions(item, value, path));
      }
    }
  } else if (
    'entries' in schema &&
    isPlainObject(schema.entries) &&
    isPlainObject(value)
  ) {
    const { entries } = schema;
    for (const [key, entryValue] of Object.entries(value)) {
      const entrySchema = entries[key];
      if (isSchema(entrySchema)) {
        unknownOptions.push(
          ...findUnknownOptions(entrySchema, entryValue, [...path, key]),
        );
      } else {
        unknownOptions.push({
          path: [...path, key],
          knownOptions: Object.keys(entries),
        });
      }
    }
  } else if ('wrapped' in schema && isSchema(schema.wrapped)) {
    unknownOptions.push(...findUnknownOptions(schema.wrapped, value, path));
  } else if (
    schema.type === 'record' &&
    'value' in schema &&
    isSchema(schema.value)
  ) {
    if (isPlainObject(value)) {
      for (const [key, entryValue] of Object.entries(value)) {
        unknownOptions.push(
          ...findUnknownOptions(schema.value, entryValue, [...path, key]),
        );
      }
    }
  } else if ('item' in schema && isSchema(schema.item) && Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      unknownOptions.push(
        ...findUnknownOptions(schema.item, item, [...path, index]),
      );
    }
  } else if ('options' in schema && Array.isArray(schema.options)) {
    const matchingOption = schema.options.find(
      (option: unknown) => isSchema(option) && v.is(option, value),
    );
    if (isSchema(matchingOption)) {
      unknownOptions.push(...findUnknownOptions(matchingOption, value, path));
    }
  }

  return unknownOptions;
}

/**
 * Config files commonly set options to `undefined` (e.g. `apiKey:
 * process.env.HAPPO_API_KEY`). We treat those the same as leaving the option
 * out, which lets the schema match the optional properties of the public types
 * exactly.
 */
function removeUndefinedValues(
  value: unknown,
  // Configs can contain circular structures in options we don't know about, so
  // we reuse the copy we already made instead of recursing forever.
  copies: WeakMap<object, unknown> = new WeakMap(),
): unknown {
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return value;
  }

  const existingCopy = copies.get(value);
  if (existingCopy) {
    return existingCopy;
  }

  if (Array.isArray(value)) {
    const copy: Array<unknown> = [];
    copies.set(value, copy);
    for (const item of value) {
      copy.push(removeUndefinedValues(item, copies));
    }
    return copy;
  }

  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  for (const [key, entryValue] of Object.entries(value)) {
    if (entryValue !== undefined) {
      copy[key] = removeUndefinedValues(entryValue, copies);
    }
  }
  return copy;
}

/**
 * Validates a config object and applies defaults. Throws a `TypeError`
 * describing every problem it found if the config is invalid.
 *
 * Unknown options are reported through `onUnknownOption` instead of failing,
 * since they have historically been allowed.
 */
export function parseConfig(
  rawInput: unknown,
  configFilePath: string,
  onUnknownOption: (message: string) => void,
): ParsedConfig {
  const input = removeUndefinedValues(rawInput);
  const result = v.safeParse(configSchema, input, {
    abortEarly: false,
    message: (issue) => `must be ${describeExpected(issue.expected)}`,
  });

  if (!result.success) {
    throw new TypeError(formatIssues(result.issues, configFilePath));
  }

  for (const { path, knownOptions } of findUnknownOptions(configSchema, input)) {
    const suggestion = findClosestMatch(String(path.at(-1)), knownOptions);
    onUnknownOption(
      `Unknown option \`${formatPath(path)}\` in config file ${configFilePath}.${suggestion ? ` Did you mean \`${suggestion}\`?` : ''} This will be an error in the next major version of Happo.`,
    );
  }

  // These have always treated `null` the same as leaving them out.
  const { apiKey, apiSecret, deepCompare, ...output } = result.output;
  return {
    ...output,
    ...(typeof apiKey === 'string' ? { apiKey } : {}),
    ...(typeof apiSecret === 'string' ? { apiSecret } : {}),
    ...(deepCompare ? { deepCompare } : {}),
  };
}
