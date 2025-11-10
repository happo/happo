import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';

import { up as findPackage } from 'empathic/package';

import pkg from '../../package.json' with { type: 'json' };

type CI =
  | 'github'
  | 'circleci'
  | 'travis'
  | 'azure'
  | 'buildkite'
  | 'jenkins'
  | 'gitlab'
  | 'bitbucket'
  | 'appveyor'
  | 'drone'
  | 'ci'
  | 'unknown';

type ErrorPayload = {
  pkg: {
    name: string;
    version: string;
  };

  error: {
    name: string;
    message: string;
    stack?: string;
  };

  env: string;

  /** Detected CI vendor if any */
  ci: CI;

  nodeVersion: string;
  platform: string;
};

export type ReporterOptions = {
  maxPerMinute?: number; // default 10
  env?: string;
};

/**
 * Happo's PUBLIC DSN. Safe to ship.
 */
const SENTRY_DSN =
  'https://3a495ff2101313edb024de73b005398f@o108341.ingest.us.sentry.io/4510341337645056';

export interface Reporter {
  captureException(e: unknown): Promise<void>;
}

export function detectCI(env: Record<string, string | undefined> = process.env): CI {
  if (env.GITHUB_ACTIONS) {
    return 'github';
  }

  if (env.CIRCLECI) {
    return 'circleci';
  }

  if (env.TRAVIS) {
    return 'travis';
  }

  if (env.TF_BUILD) {
    return 'azure';
  }

  if (env.BUILDKITE) {
    return 'buildkite';
  }

  if (env.JENKINS_URL) {
    return 'jenkins';
  }

  if (env.GITLAB_CI) {
    return 'gitlab';
  }

  if (env.BITBUCKET_BUILD_NUMBER) {
    return 'bitbucket';
  }

  if (env.APPVEYOR) {
    return 'appveyor';
  }

  if (env.DRONE) {
    return 'drone';
  }

  if (env.CI) {
    return 'ci';
  }

  return 'unknown';
}

export function parseDsn(dsn: string): {
  host: string;
  projectId: string;
  key: string;
  protocol: string;
} | null {
  try {
    // https://{PUBLIC_KEY}@{host}/{project_id}
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    const key = u.username; // public key
    const host = u.host; // includes subdomain + port
    return {
      host,
      projectId,
      key,
      protocol: u.protocol.replace(':', ''),
    };
  } catch {
    return null;
  }
}

async function sendToSentry(payload: ErrorPayload) {
  const dsn = parseDsn(SENTRY_DSN);

  if (!dsn) {
    return;
  }

  // Sentry envelope: https://develop.sentry.dev/sdk/envelopes/
  const now = Date.now();

  // Hexadecimal string representing a uuid4 value. The length is exactly 32
  // characters. Dashes are not allowed. Has to be lowercase.
  const eventId = crypto.randomUUID().replaceAll('-', '');

  const url = `https://${dsn.host}/api/${dsn.projectId}/envelope/`;

  const httpHeaders = {
    'content-type': 'application/x-sentry-envelope',
    'x-sentry-auth': [
      'Sentry sentry_version=7',
      `sentry_key=${dsn.key}`,
      `sentry_client=${pkg.name}@${pkg.version}`,
    ].join(', '),
  };

  const memoryInfo = process.memoryUsage();

  // Minimal event; we keep fields lean & sanitized
  // https://develop.sentry.dev/sdk/data-model/event-payloads/#required-attributes
  const event = {
    event_id: eventId,

    // RFC 3339 format
    timestamp: new Date(now).toISOString(),

    // A string representing the platform the SDK is submitting from. This will
    // be used by the Sentry interface to customize various components in the
    // interface.
    platform: 'node',

    // Possible values: fatal, error, warning, info, debug
    level: 'error',

    logger: 'happo.telemetry.cli',

    environment: payload.env ?? 'unknown',

    // Release versions must be unique across all projects in the organization.
    release: `${payload.pkg.name}@${payload.pkg.version}`,

    tags: {
      ci: payload.ci ?? '',
    },

    contexts: {
      runtime: {
        type: 'runtime',
        name: 'node',
        version: payload.nodeVersion ?? '',
      },
      os: {
        type: 'os',
        name: payload.platform ?? '',
      },
      memory_info: {
        type: 'memory_info',
        ...memoryInfo,
      },
    },

    exception: {
      values: [
        {
          type: payload.error.name || 'Error',
          value: payload.error.message,

          // https://develop.sentry.dev/sdk/data-model/event-payloads/stacktrace/
          stacktrace: payload.error.stack
            ? {
                frames: await parseFrames(payload.error.stack),
              }
            : undefined,
        },
      ],
    },
  };

  /**
   * Envelope is ndjson-like chunks
   *
   * Envelope = Headers { "\n" Item } [ "\n" ] ;
   * Item = Headers "\n" Payload ;
   * Payload = { * } ;
   *
   * @see https://develop.sentry.dev/sdk/data-model/envelopes/#headers
   */
  const envelopeHeader = JSON.stringify({
    event_id: eventId,
    dsn: SENTRY_DSN,
    sent_at: new Date(now).toISOString(),
  });

  // https://develop.sentry.dev/sdk/data-model/envelopes/#items
  const item = JSON.stringify(event);
  const itemHeader = JSON.stringify({ type: 'event', length: item.length });

  const body = [envelopeHeader, itemHeader, item].join('\n');

  try {
    await fetch(url, { method: 'POST', headers: httpHeaders, body });
  } catch {
    // swallow; never throw in library code
  }
}

interface SentryFrame {
  function: string;
  raw_function: string;
  abs_path: string | undefined;
  filename: string | undefined;
  lineno: number | undefined;
  colno: number | undefined;
  context_line?: string;
  pre_context?: Array<string>;
  post_context?: Array<string>;
}

/**
 * Get the package root directory
 */
function getPackageRoot(): string {
  const packageJsonPath = findPackage({ cwd: import.meta.dirname });

  if (!packageJsonPath) {
    // Fallback to relative path if empathic can't find it
    return path.resolve(import.meta.dirname, '../..');
  }

  return path.dirname(packageJsonPath);
}

/**
 * Check if a file path is part of this package
 */
function isFileInThisPackage(filePath: string): boolean {
  // Skip node: internal modules
  if (filePath.startsWith('node:')) {
    return false;
  }

  try {
    const packageRoot = getPackageRoot();
    // Remove file:// prefix if present
    const cleanPath = filePath.replace(/^file:\/\//, '');
    const resolvedPath = path.resolve(cleanPath);
    return resolvedPath.startsWith(packageRoot + path.sep);
  } catch {
    return false;
  }
}

/**
 * Read context lines from a source file around a given line number
 * Only reads files that are part of this package
 */
async function readContextLines(
  filePath: string,
  lineNumber: number,
  contextLines: number = 5,
): Promise<{
  context_line?: string;
  pre_context?: Array<string>;
  post_context?: Array<string>;
}> {
  // Only read context for files in this package. This is to avoid reading
  // context from external files that may contain sensitive information.
  if (!isFileInThisPackage(filePath)) {
    return {};
  }

  try {
    // Remove file:// prefix if present
    const cleanPath = filePath.replace(/^file:\/\//, '');

    // Line numbers are 1-indexed in stack traces, but arrays are 0-indexed
    const lineIndex = lineNumber - 1;

    if (lineIndex < 0) {
      return {};
    }

    const startLine = Math.max(0, lineIndex - contextLines);
    const endLine = lineIndex + contextLines + 1;

    const pre_context: Array<string> = [];
    let context_line: string | undefined;
    const post_context: Array<string> = [];

    const fileStream = fs.createReadStream(cleanPath, { encoding: 'utf8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let currentLine = 0;

    for await (const line of rl) {
      if (currentLine < startLine) {
        // Skip lines before our context window
        currentLine++;
        continue;
      }

      if (currentLine === lineIndex) {
        context_line = line;
      } else if (currentLine < lineIndex) {
        pre_context.push(line);
      } else if (currentLine < endLine) {
        post_context.push(line);
      } else {
        // We've read all the lines we need
        break;
      }

      currentLine++;
    }

    // Check if we found the target line
    if (context_line === undefined) {
      return {};
    }

    const result: {
      context_line: string;
      pre_context?: Array<string>;
      post_context?: Array<string>;
    } = {
      context_line,
    };

    if (pre_context.length > 0) {
      result.pre_context = pre_context;
    }

    if (post_context.length > 0) {
      result.post_context = post_context;
    }

    return result;
  } catch {
    // File might not exist, might not be readable, etc. Best-effort only.
    return {};
  }
}

/**
 * Convert an error stack to Sentry frames (best-effort)
 */
export async function parseFrames(
  stack: string,
  cwd: string = process.cwd(),
): Promise<Array<SentryFrame>> {
  // Node stack lines like: "    at func (file:///absolute/path/to/file.js:10:5)"
  const stackLines = stack.split('\n').slice(0, 50);

  const frames = [];

  for (const stackLine of stackLines) {
    const match = stackLine.match(
      /\s+at\s+(?<functionName>.*?)\s+\((?:file:\/\/)?(?<absPath>.+?):(?<lineno>\d+):(?<colno>\d+)\)?/,
    );

    if (!match || !match.groups) {
      // We didn't match a stack line, so skip it. This could cause some stack
      // lines to be dropped.
      continue;
    }

    const rawAbsPath = match.groups.absPath ?? '';

    const absPath = rawAbsPath.startsWith('node:')
      ? rawAbsPath
      : path.relative(cwd, rawAbsPath);
    const filename = rawAbsPath.startsWith('node:')
      ? rawAbsPath
      : path.basename(rawAbsPath);

    const functionName =
      match.groups.functionName === 'new'
        ? '<anonymous>'
        : (match.groups.functionName ?? 'unknown');

    const lineno = match.groups.lineno
      ? Number.parseInt(match.groups.lineno, 10)
      : undefined;

    // Read context lines from the source file (only for package files)
    const context =
      rawAbsPath && lineno ? await readContextLines(rawAbsPath, lineno) : {};

    // https://develop.sentry.dev/sdk/data-model/event-payloads/stacktrace/#frame-attributes
    const frame: SentryFrame = {
      function: functionName.slice(0, 120),
      raw_function: functionName,

      abs_path: absPath,
      filename,

      lineno,

      colno: match.groups.colno
        ? Number.parseInt(match.groups.colno, 10)
        : undefined,

      ...context,
    };

    frames.push(frame);
  }

  // Sentry expects most recent frame last
  return frames.toReversed();
}

/**
 * Create a reporter with rate limiting
 */
export function createReporter(opts: ReporterOptions = {}): Reporter {
  const maxPerMinute = Math.max(1, opts.maxPerMinute ?? 10);
  let sentThisMinute = 0;
  let minuteTick = Date.now();

  function isRateLimitExceeded(): boolean {
    const now = Date.now();

    if (now - minuteTick >= 60_000) {
      minuteTick = now;
      sentThisMinute = 0;
    }

    if (sentThisMinute >= maxPerMinute) {
      return true;
    }

    sentThisMinute++;

    return false;
  }

  const ci = detectCI(process.env);
  const nodeVersion = process.version;
  const platform = process.platform;

  return {
    async captureException(e: unknown) {
      if (isRateLimitExceeded()) {
        return;
      }

      const err = e instanceof Error ? e : new Error(String(e));
      const message = err.message ?? 'Error';
      const stack = err.stack;

      const payload: ErrorPayload = {
        pkg,
        env: opts.env ?? process.env.NODE_ENV ?? 'unknown',
        ci,
        nodeVersion,
        platform,

        error: {
          name: err.name || 'Error',
          message,
          stack: stack ?? '',
        },
      };

      await sendToSentry(payload);
    },
  };
}
