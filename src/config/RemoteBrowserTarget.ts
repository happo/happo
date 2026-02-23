import makeHappoAPIRequest from '../network/makeHappoAPIRequest.ts';
import createHash from '../utils/createHash.ts';
import type { BrowserType, ConfigWithDefaults, Page, TargetWithDefaults } from './index.ts';

const VIEWPORT_PATTERN = /^([0-9]+)x([0-9]+)$/;

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

interface BoundMakeRequestParams {
  slice?: Array<unknown> | undefined;
  chunk?: Chunk | undefined;
  pageSlice?: PageSlice | undefined;
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

export default class RemoteBrowserTarget {
  public readonly chunks: number;
  public readonly browserName: BrowserType;
  public readonly viewport: string;
  public readonly maxHeight: number | undefined;
  public readonly otherOptions: Record<string, unknown>;

  constructor(
    browserName: BrowserType,
    {
      viewport = '1024x768',
      chunks = 1,
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
    }: ExecuteParams,
    config: ConfigWithDefaults,
  ): Promise<Array<number>> {
    const boundMakeRequest = async ({
      slice,
      chunk,
      pageSlice,
    }: BoundMakeRequestParams): Promise<number> => {
      const payloadString = JSON.stringify({
        viewport: this.viewport,
        maxHeight: this.maxHeight,
        ...this.otherOptions,
        globalCSS,
        snapPayloads: slice,
        chunk,
        staticPackage,
        assetsPackage,
        pages: pageSlice,
        extendsSha: pageSlice ? pageSlice.extendsSha : undefined,
      });

      const payloadHash = createHash(
        payloadString + (pageSlice ? Math.random() : ''),
      );

      const formData: Record<string, string | File | undefined> = {
        type:
          pageSlice && pageSlice.extendsSha
            ? 'extends-report'
            : `browser-${this.browserName}`,
        targetName,
        payloadHash,
        payload: new File([payloadString], 'payload.json', {
          type: 'application/json',
        }),
      };

      if (pageSlice && pageSlice.extendsSha) {
        formData.extendsSha = pageSlice.extendsSha;
      }

      const requestResult = await makeHappoAPIRequest(
        {
          path: `/api/snap-requests?payloadHash=${payloadHash}`,
          method: 'POST',
          json: true,
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
    };

    const requestIds: Array<number> = [];

    if (staticPackage) {
      for (let i = 0; i < this.chunks; i += 1) {
        // We `await` here inside the loop to avoid POSTing all payloads to the
        // server at the same time (thus reducing load a little).
        const requestId = await boundMakeRequest({
          chunk: { index: i, total: this.chunks },
        });
        requestIds.push(requestId);
      }
    } else if (pages) {
      for (const pageSlice of getPageSlices(pages, this.chunks)) {
        // We `await` here inside the loop to avoid POSTing all payloads to the
        // server at the same time (thus reducing load a little).
        const requestId = await boundMakeRequest({
          pageSlice,
        });
        requestIds.push(requestId);
      }
    } else {
      const snapsPerChunk = Math.ceil((snapPayloads?.length ?? 0) / this.chunks);
      for (let i = 0; i < this.chunks; i += 1) {
        const slice = snapPayloads?.slice(
          i * snapsPerChunk,
          i * snapsPerChunk + snapsPerChunk,
        );

        // We `await` here inside the loop to avoid POSTing all payloads to the
        // server at the same time (thus reducing load a little).
        const requestId = await boundMakeRequest({
          slice,
        });
        requestIds.push(requestId);
      }
    }

    return requestIds;
  }
}
