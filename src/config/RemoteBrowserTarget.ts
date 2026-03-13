import { ErrorWithStatusCode } from '../network/fetchWithRetry.ts';
import makeHappoAPIRequest from '../network/makeHappoAPIRequest.ts';
import createHash from '../utils/createHash.ts';
import type {
  BrowserType,
  ConfigWithDefaults,
  Page,
  TargetWithDefaults,
} from './index.ts';

const VIEWPORT_PATTERN = /^([0-9]+)x([0-9]+)$/;

/**
 * Compute the number of chunks to use based on an estimated snapshot count.
 *
 * Aims for roughly 100 items per chunk, capped at 20. Returns 1 for
 * non-positive or non-finite inputs.
 */
function computeDefaultChunks(estimatedSnapCount: number): number {
  if (!Number.isFinite(estimatedSnapCount) || estimatedSnapCount <= 0) {
    return 1;
  }

  return Math.min(20, Math.ceil(estimatedSnapCount / 100));
}

/**
 * PageSlice is an array of pages with the extra extendsSha property.
 */
interface PageSlice extends Array<Page> {
  extendsSha?: string;
}

interface Chunk {
  index: number;
  total: number;
}

interface ChunkItem {
  type: string;
  targetName: string | undefined;
  payloadString: string;
  payloadHash: string;
  extendsSha?: string;
}

export interface CSSBlock {
  id: string;
  conditional: boolean;
  css: string;
}

export interface ExecuteParams {
  globalCSS?: string | Array<CSSBlock>;

  /** Path to the assets package */
  assetsPackage?: string;

  /** Path to the static package */
  staticPackage?: string;

  snapPayloads?: Array<unknown>;
  pages?: Array<Page>;
  targetName?: string;

  /**
   * Total number of snapshots in the package. When provided for staticPackage
   * requests without explicit chunks, used to automatically determine the
   * optimal number of parallel chunks.
   */
  estimatedSnapsCount?: number;
}

function getPageSlices(pages: Array<Page>, chunks: number): Array<PageSlice> {
  const result: Array<PageSlice> = [];

  // First, split the raw pages into chunks
  const pagesPerChunk = Math.ceil(pages.length / chunks);
  for (let i = 0; i < chunks; i += 1) {
    const pageSlice = pages.slice(
      i * pagesPerChunk,
      i * pagesPerChunk + pagesPerChunk,
    );

    if (pageSlice.length > 0) {
      result.push(pageSlice);
    }
  }
  return result;
}

function buildChunkItem({
  slice,
  chunk,
  pageSlice,
  browserName,
  viewport,
  maxHeight,
  otherOptions,
  globalCSS,
  staticPackage,
  assetsPackage,
  targetName,
}: {
  slice?: Array<unknown> | undefined;
  chunk?: Chunk | undefined;
  pageSlice?: PageSlice | undefined;
  browserName: BrowserType;
  viewport: string;
  maxHeight: number | undefined;
  otherOptions: Record<string, unknown>;
  globalCSS: string | Array<CSSBlock> | undefined;
  staticPackage: string | undefined;
  assetsPackage: string | undefined;
  targetName: string | undefined;
}): ChunkItem {
  const payloadString = JSON.stringify({
    viewport,
    maxHeight,
    ...otherOptions,
    globalCSS,
    snapPayloads: slice,
    chunk,
    staticPackage,
    assetsPackage,
    pages: pageSlice,
    extendsSha: pageSlice ? pageSlice.extendsSha : undefined,
  });

  const payloadHash = createHash(payloadString + (pageSlice ? Math.random() : ''));

  const type =
    pageSlice && pageSlice.extendsSha ? 'extends-report' : `browser-${browserName}`;

  const item: ChunkItem = { type, targetName, payloadString, payloadHash };
  if (pageSlice?.extendsSha) {
    item.extendsSha = pageSlice.extendsSha;
  }
  return item;
}

async function sendIndividualSnapRequest(
  item: ChunkItem,
  config: ConfigWithDefaults,
): Promise<number> {
  const formData: Record<string, string | number | File | undefined> = {
    type: item.type,
    targetName: item.targetName,
    payloadHash: item.payloadHash,
    payload: new File([item.payloadString], 'payload.json', {
      type: 'application/json',
    }),
  };

  if (item.extendsSha) {
    formData.extendsSha = item.extendsSha;
  }

  // We `await` here inside the loop to avoid POSTing all payloads to the
  // server at the same time (thus reducing load a little).
  const requestResult = await makeHappoAPIRequest(
    {
      path: `/api/snap-requests?payloadHash=${item.payloadHash}`,
      method: 'POST',
      formData,
    },
    config,
    { retryCount: 5 },
  );

  if (!requestResult) {
    throw new Error('No requestResult');
  }

  if (!('requestId' in requestResult)) {
    throw new Error('No requestId in requestResult');
  }

  if (typeof requestResult.requestId !== 'number') {
    throw new TypeError('requestId is not a number');
  }

  return requestResult.requestId;
}

export default class RemoteBrowserTarget {
  public readonly chunks: number | undefined;
  public readonly browserName: BrowserType;
  public readonly viewport: string;
  public readonly maxHeight: number | undefined;
  public readonly otherOptions: Record<string, unknown>;

  constructor(
    browserName: BrowserType,
    {
      viewport = '1024x768',
      chunks,
      maxHeight,
      ...otherOptions
    }: TargetWithDefaults,
  ) {
    if (!browserName) {
      throw new Error(
        `Invalid browser type: "${browserName}". Make sure the "type" field in your target configuration is set to a valid browser type.`,
      );
    }

    const viewportMatch = viewport.match(VIEWPORT_PATTERN);
    if (!viewportMatch) {
      throw new Error(
        `Invalid viewport "${viewport}". Here's an example of a valid one: "1024x768".`,
      );
    }

    this.chunks = chunks;
    this.browserName = browserName;
    this.viewport = viewport;
    this.maxHeight = maxHeight ?? undefined;
    this.otherOptions = otherOptions;
  }

  async execute(
    {
      globalCSS,
      assetsPackage,
      staticPackage,
      snapPayloads,
      pages,
      targetName,
      estimatedSnapsCount,
    }: ExecuteParams,
    config: ConfigWithDefaults,
  ): Promise<Array<number>> {
    const buildItemParams = {
      browserName: this.browserName,
      viewport: this.viewport,
      maxHeight: this.maxHeight,
      otherOptions: this.otherOptions,
      globalCSS,
      staticPackage,
      assetsPackage,
      targetName,
    };

    // Build all chunk items up front
    const items: Array<ChunkItem> = [];

    if (staticPackage) {
      const effectiveChunks =
        this.chunks ?? Math.max(1, computeDefaultChunks(estimatedSnapsCount ?? 0));
      for (let i = 0; i < effectiveChunks; i += 1) {
        items.push(
          buildChunkItem({
            ...buildItemParams,
            chunk:
              effectiveChunks > 1 ? { index: i, total: effectiveChunks } : undefined,
          }),
        );
      }
    } else if (pages) {
      for (const pageSlice of getPageSlices(pages, this.chunks ?? 1)) {
        items.push(buildChunkItem({ ...buildItemParams, pageSlice }));
      }
    } else {
      const effectiveChunks = this.chunks ?? 1;
      const snapsPerChunk = Math.ceil((snapPayloads?.length ?? 0) / effectiveChunks);
      for (let i = 0; i < effectiveChunks; i += 1) {
        const slice = snapPayloads?.slice(
          i * snapsPerChunk,
          i * snapsPerChunk + snapsPerChunk,
        );
        items.push(buildChunkItem({ ...buildItemParams, slice }));
      }
    }

    if (items.length === 0) {
      return [];
    }

    // Try the bulk endpoint first. If it is unavailable or returns an unexpected
    // payload shape, gracefully fall back to individual requests instead of
    // failing the run.
    try {
      const result = await makeHappoAPIRequest(
        {
          path: '/api/snap-requests/bulk',
          method: 'POST',
          body: { items },
        },
        config,
        { retryCount: 5 },
      );

      if (
        result &&
        'results' in result &&
        Array.isArray(result.results) &&
        result.results.length === items.length
      ) {
        const bulkResults = result.results as Array<{
          requestId?: number;
          error?: string;
        }>;

        const requestIds: Array<number | undefined> = bulkResults.map((r) =>
          typeof r.requestId === 'number' ? r.requestId : undefined,
        );

        // Retry any failed items individually (sequentially to reduce load)
        for (const [i, item] of items.entries()) {
          if (requestIds[i] === undefined) {
            requestIds[i] = await sendIndividualSnapRequest(item, config);
          }
        }

        const finalizedRequestIds: Array<number> = requestIds.map((id, index) => {
          if (id === undefined) {
            throw new Error(
              `Failed to obtain snap request ID for item at index ${index}`,
            );
          }

          return id;
        });

        return finalizedRequestIds;
      }
      // If we reach this point, the bulk endpoint responded but with an
      // unexpected shape. Treat this as if bulk is unsupported and fall back
      // to individual requests below.
    } catch (error) {
      // Fall back to individual requests only when the server explicitly
      // reports that the bulk endpoint is missing.
      if (!(error instanceof ErrorWithStatusCode && error.statusCode === 404)) {
        throw error;
      }
    }

    // Fallback: sequential individual requests (for older happo deployments or
    // when the bulk response is malformed)
    const requestIds: Array<number> = [];

    for (const item of items) {
      requestIds.push(await sendIndividualSnapRequest(item, config));
    }

    return requestIds;
  }
}
