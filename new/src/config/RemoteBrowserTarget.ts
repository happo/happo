import makeRequest from '../utils/makeRequest.ts';
import createHash from './createHash.js';

const POLL_INTERVAL = 5000; // 5 secs
const VIEWPORT_PATTERN = /^([0-9]+)x([0-9]+)$/;

// Type definitions
interface WaitForParams {
  requestId: string;
  endpoint: string;
  apiKey: string;
  apiSecret: string;
}

interface SnapResult {
  snapRequestId: string;
  [key: string]: unknown;
}

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

interface ExecuteParams {
  globalCSS?: string;
  assetsPackage?: unknown;
  staticPackage?: unknown;
  snapPayloads?: unknown[];
  apiKey: string;
  apiSecret: string;
  endpoint: string;
  pages?: Page[];
  asyncResults?: boolean;
  targetName?: string;
}

interface RemoteBrowserTargetOptions {
  viewport: string;
  chunks?: number;
  maxHeight?: number;
  [key: string]: unknown;
}

async function waitFor({
  requestId,
  endpoint,
  apiKey,
  apiSecret,
}: WaitForParams): Promise<SnapResult[]> {
  const { status, result } = await makeRequest(
    {
      url: `${endpoint}/api/snap-requests/${requestId}`,
      method: 'GET',
      json: true,
    },
    { apiKey, apiSecret, retryCount: 5 },
  );
  if (status === 'done') {
    return result.map(
      (i: unknown) =>
        ({
          ...(i as Record<string, unknown>),
          snapRequestId: requestId,
        }) as SnapResult,
    );
  }
  await new Promise<void>((r) => {
    setTimeout(r, POLL_INTERVAL);
  });
  return waitFor({ requestId, endpoint, apiKey, apiSecret });
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
    { viewport, chunks = 1, maxHeight, ...otherOptions }: RemoteBrowserTargetOptions,
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
    asyncResults = false,
    targetName,
  }: ExecuteParams): Promise<SnapResult[] | string[]> {
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
      const formData: Record<string, unknown> = {
        type:
          pageSlice && pageSlice.extendsSha
            ? 'extends-report'
            : `browser-${this.browserName}`,
        targetName,
        payloadHash,
        payload: {
          options: {
            filename: 'payload.json',
            contentType: 'application/json',
          },
          value: payloadString,
        },
      };
      if (pageSlice && pageSlice.extendsSha) {
        formData.extendsSha = pageSlice.extendsSha;
      }
      return makeRequest(
        {
          url: `${endpoint}/api/snap-requests?payloadHash=${payloadHash}`,
          method: 'POST',
          json: true,
          formData,
        },
        { apiKey, apiSecret, retryCount: 5 },
      );
    };
    const promises: Promise<SnapResult[]>[] = [];
    const requestIds: string[] = [];
    if (staticPackage) {
      for (let i = 0; i < this.chunks; i += 1) {
        // We allow one `await` inside the loop here to avoid POSTing all payloads
        // to the server at the same time (thus reducing load a little).

        const { requestId }: { requestId: string } = await boundMakeRequest({
          chunk: { index: i, total: this.chunks },
        });
        if (asyncResults) {
          requestIds.push(requestId);
        } else {
          promises.push(waitFor({ requestId, endpoint, apiKey, apiSecret }));
        }
      }
    } else if (pages) {
      for (const pageSlice of getPageSlices(pages, this.chunks)) {
        // We allow one `await` inside the loop here to avoid POSTing all payloads
        // to the server at the same time (thus reducing load a little).
        const { requestId }: { requestId: string } = await boundMakeRequest({
          pageSlice,
        });
        if (asyncResults) {
          requestIds.push(requestId);
        } else {
          promises.push(waitFor({ requestId, endpoint, apiKey, apiSecret }));
        }
      }
    } else {
      const snapsPerChunk = Math.ceil((snapPayloads?.length ?? 0) / this.chunks);
      for (let i = 0; i < this.chunks; i += 1) {
        const slice = snapPayloads?.slice(
          i * snapsPerChunk,
          i * snapsPerChunk + snapsPerChunk,
        );
        // We allow one `await` inside the loop here to avoid POSTing all payloads
        // to the server at the same time (thus reducing load a little).
        const { requestId }: { requestId: string } = await boundMakeRequest({
          slice,
        });
        if (asyncResults) {
          requestIds.push(requestId);
        } else {
          promises.push(waitFor({ requestId, endpoint, apiKey, apiSecret }));
        }
      }
    }

    if (asyncResults) {
      return requestIds;
    }

    const result: SnapResult[] = [];
    for (const list of await Promise.all(promises)) {
      result.push(...list);
    }

    return result;
  }
}
