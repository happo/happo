import makeRequest from '../utils/makeRequest.ts';
import createHash from './createHash.js';
import type { Target } from './index.ts';

const VIEWPORT_PATTERN = /^([0-9]+)x([0-9]+)$/;

interface Page {
  url: string;
  title: string;
  extends?: string;
  [key: string]: unknown;
}

interface PageSlice extends Array<Page> {
  extendsSha?: string;
}

interface Chunk {
  index: number;
  total: number;
}

interface BoundMakeRequestParams {
  slice?: unknown[] | undefined;
  chunk?: Chunk | undefined;
  pageSlice?: PageSlice | undefined;
}

export interface CSSBlock {
  id: string;
  conditional: boolean;
  css: string;
}

interface ExecuteParams {
  globalCSS?: string | Array<CSSBlock>;
  assetsPackage?: unknown;
  staticPackage?: unknown;
  snapPayloads?: unknown[];
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  pages?: Page[];
  targetName?: string;
}

const MIN_INTERNET_EXPLORER_WIDTH = 400;

function getPageSlices(pages: Page[], chunks: number): PageSlice[] {
  const extendsPages: Record<string, Page[]> = {};
  const rawPages: Page[] = [];
  for (const page of pages) {
    if (page.extends) {
      extendsPages[page.extends] = extendsPages[page.extends] ?? [];
      extendsPages[page.extends]!.push(page);
    } else {
      rawPages.push(page);
    }
  }
  const result: PageSlice[] = [];
  const pagesPerChunk = Math.ceil(rawPages.length / chunks);
  for (let i = 0; i < chunks; i += 1) {
    const pageSlice = rawPages.slice(
      i * pagesPerChunk,
      i * pagesPerChunk + pagesPerChunk,
    );
    if (pageSlice.length > 0) {
      result.push(pageSlice as PageSlice);
    }
  }

  for (const sha of Object.keys(extendsPages)) {
    const pageSlice = extendsPages[sha] as PageSlice;
    pageSlice.extendsSha = sha;
    result.push(pageSlice);
  }
  return result;
}

export default class RemoteBrowserTarget {
  public readonly chunks: number;
  public readonly browserName: string;
  public readonly viewport: string;
  public readonly maxHeight: number | undefined;
  public readonly otherOptions: Record<string, unknown>;

  constructor(
    browserName: string,
    { viewport = '1024x768', chunks = 1, maxHeight, ...otherOptions }: Target,
  ) {
    const viewportMatch = viewport.match(VIEWPORT_PATTERN);
    if (!viewportMatch) {
      throw new Error(
        `Invalid viewport "${viewport}". Here's an example of a valid one: "1024x768".`,
      );
    }

    const [, width] = viewportMatch;

    if (
      browserName === 'edge' &&
      Number.parseInt(width!, 10) < MIN_INTERNET_EXPLORER_WIDTH
    ) {
      throw new Error(
        `Invalid viewport width for the "edge" target (you provided ${width}). Smallest width it can handle is ${MIN_INTERNET_EXPLORER_WIDTH}.`,
      );
    }

    this.chunks = chunks;
    this.browserName = browserName;
    this.viewport = viewport;
    this.maxHeight = maxHeight ?? undefined;
    this.otherOptions = otherOptions;
  }

  async execute({
    globalCSS,
    assetsPackage,
    staticPackage,
    snapPayloads,
    apiKey,
    apiSecret,
    endpoint,
    pages,
    targetName,
  }: ExecuteParams): Promise<Array<string>> {
    const boundMakeRequest = async ({
      slice,
      chunk,
      pageSlice,
    }: BoundMakeRequestParams) => {
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

      const requestResult = await makeRequest(
        {
          url: `${endpoint}/api/snap-requests?payloadHash=${payloadHash}`,
          method: 'POST',
          json: true,
          formData,
        },
        { apiKey, apiSecret, retryCount: 5 },
      );

      if (!requestResult) {
        throw new Error('No requestResult');
      }

      if (!('requestId' in requestResult)) {
        throw new Error('No requestId in requestResult');
      }

      return { requestId: String(requestResult.requestId) };
    };

    const requestIds: string[] = [];

    if (staticPackage) {
      for (let i = 0; i < this.chunks; i += 1) {
        // We `await` here inside the loop to avoid POSTing all payloads to the
        // server at the same time (thus reducing load a little).
        const { requestId } = await boundMakeRequest({
          chunk: { index: i, total: this.chunks },
        });
        requestIds.push(requestId);
      }
    } else if (pages) {
      for (const pageSlice of getPageSlices(pages, this.chunks)) {
        // We `await` here inside the loop to avoid POSTing all payloads to the
        // server at the same time (thus reducing load a little).
        const { requestId } = await boundMakeRequest({
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
        const { requestId } = await boundMakeRequest({
          slice,
        });
        requestIds.push(requestId);
      }
    }

    return requestIds;
  }
}
