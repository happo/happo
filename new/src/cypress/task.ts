import Controller, { type SnapshotRegistrationParams } from '../e2e/controller.ts';

const controller = new Controller();

const { HAPPO_DEBUG } = process.env;

interface Attempt {
  wallClockStartedAt?: string;
  wallClockDuration?: number;
  state: string;
}

function getCleanupTimeframe({
  attempt,
  results,
}: {
  attempt: Attempt;
  results: CypressCommandLine.RunResult;
}) {
  if (attempt.wallClockStartedAt && attempt.wallClockDuration) {
    // Cypress <= v12 (custom timing data)
    const start = new Date(attempt.wallClockStartedAt).getTime();
    return { start, end: start + attempt.wallClockDuration };
  }

  // Cypress >= 13 (use official stats)
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

interface HappoTask {
  isRegisteredCorrectly: boolean;
  register(on: Cypress.PluginEvents): void;
  handleAfterSpec(
    spec: Cypress.Spec,
    results: CypressCommandLine.RunResult,
  ): Promise<void>;
  happoRegisterSnapshot(snapshot: SnapshotRegistrationParams): Promise<null>;
  happoRegisterBase64Image(params: {
    base64Chunk: string;
    src: string;
    isFirst: boolean;
    isLast: boolean;
  }): Promise<null>;
  handleBeforeSpec(): Promise<void>;
}

const task: HappoTask = {
  isRegisteredCorrectly: false,

  register(on: Cypress.PluginEvents) {
    on('task', {
      happoRegisterSnapshot: task.happoRegisterSnapshot,
      happoRegisterBase64Image: task.happoRegisterBase64Image,
    });
    on('before:spec', task.handleBeforeSpec);
    on('after:spec', task.handleAfterSpec);
    task.isRegisteredCorrectly = true;
  },

  async handleAfterSpec(
    _spec: Cypress.Spec,
    results: CypressCommandLine.RunResult,
  ): Promise<void> {
    if (!controller.isActive()) {
      return;
    }
    if (results) {
      for (const test of results.tests) {
        const wasRetried =
          test.attempts.some((t) => t.state === 'failed') &&
          test.attempts.at(-1)?.state === 'passed';
        if (!wasRetried) {
          continue;
        }
        for (const attempt of test.attempts) {
          if (attempt.state === 'failed') {
            const { start, end } = getCleanupTimeframe({
              attempt,
              results,
            });
            controller.removeDuplicatesInTimeframe({
              start,
              end,
            });
          }
        }
      }
    }

    await controller.finish();
  },

  async happoRegisterSnapshot(snapshot: SnapshotRegistrationParams): Promise<null> {
    if (!controller.isActive()) {
      return null;
    }
    await controller.registerSnapshot(snapshot);
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

  async handleBeforeSpec(): Promise<void> {
    await controller.init(process.env.HAPPO_PROJECT_NAME || 'default');

    if (controller.isActive() && !task.isRegisteredCorrectly) {
      throw new Error(`Happo hasn't been registered correctly. Make sure you call \`happoTask.register\` when you register the plugin:

  const happoTask = require('happo/cypress/task');

  module.exports = (on) => {
    happoTask.register(on);
  };
      `);
    }
  },
};

export default task;
