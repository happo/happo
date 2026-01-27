import type { ConfigWithDefaults } from '../config/index.ts';
import type { Logger } from '../isomorphic/types.ts';
import makeHappoAPIRequest from './makeHappoAPIRequest.ts';

export type FlakeEntry = {
  project?: string;
  component?: string;
  variant?: string;
  target?: string;
  snapshots?: Array<{
    url?: string;
    width?: number;
    height?: number;
  }>;
  comparison?: {
    sha1?: string;
    sha2?: string;
    status?: string;
    url?: string;
    createdAt?: string;
    diffs?: number;
    unchanged?: number;
    added?: number;
    deleted?: number;
    link?: string;
    message?: string;
    project?: string;
  };
};

export type GetFlakesOptions = {
  project?: string | undefined;
  limit?: string | undefined;
  page?: string | undefined;
  component?: string | undefined;
  variant?: string | undefined;
  target?: string | undefined;
  sha?: string | undefined;
};

export function formatFlakeOutput(flakes: Array<FlakeEntry>): string {
  if (flakes.length === 0) {
    return 'No flakes found.';
  }

  const lines = [
    `Found ${flakes.length} flake${flakes.length === 1 ? '' : 's'}:`,
  ];

  for (const flake of flakes) {
    const parts = [
      flake.component,
      flake.variant,
      flake.target,
    ].filter(Boolean);
    const label = parts.length > 0 ? parts.join(' / ') : 'Unknown flake';
    const projectLabel = flake.project ? `[${flake.project}] ` : '';
    const snapshotUrls = (flake.snapshots ?? [])
      .map((snapshot) => snapshot.url)
      .filter(Boolean) as Array<string>;
    const snapshotsLabel =
      snapshotUrls.length > 0 ? ` [${snapshotUrls.join(', ')}]` : '';
    const comparisonLabel = flake.comparison?.url
      ? ` (${flake.comparison.url})`
      : '';
    lines.push(
      `- ${projectLabel}${label}${snapshotsLabel}${comparisonLabel}`,
    );
  }

  lines.push('Tip: use --format=json to see full details.');

  return lines.join('\n');
}

export default async function getFlakes(
  { project, limit, page, component, variant, target, sha }: GetFlakesOptions,
  config: ConfigWithDefaults,
  logger: Logger,
): Promise<Array<FlakeEntry>> {
  const searchParams = new URLSearchParams();
  if (project) {
    searchParams.set('project', project);
  }
  if (limit) {
    searchParams.set('limit', limit);
  }
  if (page) {
    searchParams.set('page', page);
  }
  if (component) {
    searchParams.set('component', component);
  }
  if (variant) {
    searchParams.set('variant', variant);
  }
  if (target) {
    searchParams.set('target', target);
  }
  if (sha) {
    searchParams.set('sha', sha);
  }

  const query = searchParams.toString();
  const path = (query ? `/api/flake?${query}` : '/api/flake') as `/api/${string}`;

  const response = await makeHappoAPIRequest(
    { path, method: 'GET' },
    config,
    { retryCount: 3 },
    logger,
  );

  if (!Array.isArray(response)) {
    throw new TypeError('Expected flake response to be an array.');
  }

  return response as Array<FlakeEntry>;
}
