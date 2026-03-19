import { parseArgs } from 'node:util';

export const parseOptions = {
  version: {
    type: 'boolean',
    short: 'v',
  },

  help: {
    type: 'boolean',
    short: 'h',
  },

  config: {
    type: 'string',
    short: 'c',
  },

  baseBranch: {
    type: 'string',
  },

  link: {
    type: 'string',
  },

  message: {
    type: 'string',
  },

  authorEmail: {
    type: 'string',
  },

  afterSha: {
    type: 'string',
  },

  beforeSha: {
    type: 'string',
  },

  beforeShaTagMatcher: {
    type: 'string',
  },

  fallbackShas: {
    type: 'string',
  },

  fallbackShasCount: {
    type: 'string',
  },

  notify: {
    type: 'string',
  },

  nonce: {
    type: 'string',
  },

  githubToken: {
    type: 'string',
  },

  // Flake command options
  allProjects: {
    type: 'boolean',
  },

  format: {
    type: 'string',
  },

  project: {
    type: 'string',
  },

  limit: {
    type: 'string',
  },

  page: {
    type: 'string',
  },

  component: {
    type: 'string',
  },

  variant: {
    type: 'string',
  },

  target: {
    type: 'string',
  },

  sha: {
    type: 'string',
  },

  skippedExamples: {
    type: 'string',
  },
} as const;

export type ParsedCLIArgs = ReturnType<
  typeof parseArgs<{ options: typeof parseOptions; allowPositionals: true }>
>['values'];
