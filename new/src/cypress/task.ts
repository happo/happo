import Controller from 'happo-e2e/controller';

const controller = new Controller();

interface LocalSnapshotImage {
  component: string;
  variant: string;
  targets?: Array<string>;
  target: string;
}

const localSnapshotImages: Record<string, LocalSnapshotImage> = {};

const { HAPPO_DEBUG } = process.env;

interface Attempt {
  wallClockStartedAt?: string;
  wallClockDuration?: number;
  state: string;
}

interface TestResults {
  stats?: {
    startedAt: string;
    endedAt: string;
  };
}

interface Test {
  attempts: Array<Attempt>;
}

interface SpecResults {
  tests: Array<Test>;
}

function getCleanupTimeframe({
  attempt,
  results,
}: {
  attempt: Attempt;
  results: SpecResults;
}) {
  if (attempt.wallClockStartedAt && attempt.wallClockDuration) {
    // Cypress <= v12
    const start = new Date(attempt.wallClockStartedAt).getTime();
    return { start, end: start + attempt.wallClockDuration };
  }

  // Cypress >= 13
  if (!results.stats) {
    if (HAPPO_DEBUG) {
      console.log(
        `[HAPPO] Couldn't find start and end time for failed attempt. This could lead to duplicate screenshots in your Happo reports.`,
      );
    }
    return { start: 0, end: 0 };
  }

  const start = new Date(results.stats.startedAt).getTime();
  const end = new Date(results.stats.endedAt).getTime();
  return { start, end };
}

interface CypressPluginEvents {
  (event: 'task', handler: Record<string, unknown>): void;
  (event: 'before:spec', handler: () => Promise<null>): void;
  (
    event: 'after:spec',
    handler: (spec: unknown, results: SpecResults) => Promise<null>,
  ): void;
  (
    event: 'after:screenshot',
    handler: (details: ScreenshotDetails) => Promise<null>,
  ): void;
}

interface ScreenshotDetails {
  name: string;
  path: string;
  dimensions: {
    width: number;
    height: number;
  };
}

const task = {
  isRegisteredCorrectly: false,

  register(on: CypressPluginEvents) {
    on('task', task);
    on('before:spec', task.handleBeforeSpec);
    on('after:spec', task.handleAfterSpec);
    on('after:screenshot', task.handleAfterScreenshot);
    task.isRegisteredCorrectly = true;
  },

  async handleAfterSpec(spec: unknown, results: SpecResults): Promise<null> {
    if (!controller.isActive()) {
      return;
    }
    if (results) {
      for (const test of results.tests) {
        const wasRetried =
          test.attempts.some((t) => t.state === 'failed') &&
          test.attempts[test.attempts.length - 1].state === 'passed';
        if (!wasRetried) {
          continue;
        }
        for (const attempt of test.attempts) {
          if (attempt.state === 'failed') {
            const { start, end } = getCleanupTimeframe({ attempt, results });
            if (typeof controller.removeDuplicatesInTimeframe === 'function') {
              // happo-e2e >= 2.4.0
              controller.removeDuplicatesInTimeframe({
                start,
                end,
              });
            } else {
              // happo-e2e < 2.4.0
              controller.removeSnapshotsMadeBetween({
                start,
                end,
              });
            }
          }
        }
      }
    }

    await controller.finish();
    return null;
  },

  async happoRegisterSnapshot(snapshot: Record<string, unknown>): Promise<null> {
    if (!controller.isActive()) {
      return null;
    }
    await controller.registerSnapshot(snapshot);
    return null;
  },

  happoRegisterLocalSnapshot({
    imageId,
    component,
    variant,
    target,
    targets,
  }: {
    imageId: string;
    component: string;
    variant: string;
    target: string;
    targets?: Array<string>;
  }): null {
    localSnapshotImages[imageId] = { component, variant, targets, target };
    return null;
  },

  async handleAfterScreenshot({
    name,
    path,
    dimensions,
  }: ScreenshotDetails): Promise<null> {
    if (!controller.isActive()) {
      return null;
    }

    if (!name) {
      return null;
    }

    const snapshotData = localSnapshotImages[name];
    if (!snapshotData) {
      if (HAPPO_DEBUG) {
        console.log(`[HAPPO] Ignoring unregistered screenshot: ${name}`);
      }
      return;
    }

    await controller.registerLocalSnapshot({
      ...snapshotData,
      ...dimensions,
      path,
    });
    return null;
  },

  async happoRegisterBase64Image({
    base64Chunk,
    src,
    isFirst,
    isLast,
  }: {
    base64Chunk: string;
    src: string;
    isFirst: boolean;
    isLast: boolean;
  }): Promise<null> {
    if (!controller.isActive()) {
      return null;
    }
    await controller.registerBase64ImageChunk({
      base64Chunk,
      src,
      isFirst,
      isLast,
    });
    return null;
  },

  async handleBeforeSpec(): Promise<null> {
    await controller.init();

    if (controller.isActive() && !task.isRegisteredCorrectly) {
      throw new Error(`happo-cypress hasn't been registered correctly. Make sure you call \`happoTask.register\` when you register the plugin:

  const happoTask = require('happo-cypress/task');

  module.exports = (on) => {
    happoTask.register(on);
  };
      `);
    }
    return null;
  },
};

export default task;
