import crypto from 'node:crypto';
import fs from 'node:fs';

import { imageSize } from 'image-size';
import pAll from 'p-all';

import type { BrowserType, Config, Target } from '../config/index.ts';
import { findConfigFile, loadConfigFile } from '../config/loadConfig.ts';
import RemoteBrowserTarget from '../config/RemoteBrowserTarget.js';
// import type { Config } from '../config/index.ts';
import resolveEnvironment from '../environment/index.js';
import findCSSAssetUrls from '../isomorphic/findCSSAssetUrls.js';
import makeRequest from '../utils/makeRequest.ts';
import convertBase64FileToReal from './convertBase64FileToReal.js';
import createAssetPackage from './createAssetPackage.js';
import proxiedFetch from './fetch.js';
import makeAbsolute from './makeAbsolute.js';
import makeExternalUrlsAbsolute from './makeExternalUrlsAbsolute.js';
import uploadAssets from './uploadAssets.js';

// Type definitions
interface Snapshot {
  timestamp?: number | undefined;
  html: string;
  component: string;
  variant: string;
  targets?: string[] | undefined;
  stylesheets?: string[] | undefined;
  htmlElementAttrs?: Record<string, string> | undefined;
  bodyElementAttrs?: Record<string, string> | undefined;
}

interface LocalSnapshot {
  component: string;
  variant: string;
  targets?: string[] | undefined;
  target?: string | undefined;
  url: string;
  width?: number | undefined;
  height?: number | undefined;
}

interface AssetUrl {
  url: string;
  baseUrl?: string | undefined;
  name?: string | undefined;
}

interface DynamicTarget {
  name: string;
  viewport: `${number}x${number}`;
  browserType: BrowserType;
}

interface CSSBlock {
  key: string;
  content?: string;
  href?: string | undefined;
  baseUrl?: string | undefined;
  assetsBaseUrl?: string;
}

interface SnapshotRegistrationParams {
  timestamp?: number | undefined;
  html: string;
  assetUrls: AssetUrl[];
  cssBlocks: CSSBlock[];
  component: string;
  variant: string;
  targets?: (string | DynamicTarget)[] | undefined;
  htmlElementAttrs?: Record<string, string> | undefined;
  bodyElementAttrs?: Record<string, string> | undefined;
}

interface LocalSnapshotRegistrationParams {
  component: string;
  variant: string;
  targets?: string[] | undefined;
  target?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  path?: string | undefined;
  buffer?: Buffer<ArrayBuffer> | undefined;
}

interface TimeframeParams {
  start: number;
  end: number;
}

interface Base64ChunkParams {
  base64Chunk: string;
  src: string;
  isFirst: boolean;
  isLast: boolean;
}

function dedupeSnapshots(snapshots: Snapshot[]): Snapshot[] {
  const allIndexed: Record<string, Snapshot> = {};
  for (const snapshot of snapshots) {
    const key = [snapshot.component, snapshot.variant].join('-_|_-');
    allIndexed[key] = snapshot;
  }
  return Object.values(allIndexed);
}

function getUniqueUrls(urls: AssetUrl[]): AssetUrl[] {
  const seenKeys = new Set<string>();
  const result: AssetUrl[] = [];
  for (const url of urls) {
    const key = [url.url, url.baseUrl].join('||');
    if (!seenKeys.has(key)) {
      result.push(url);
      seenKeys.add(key);
    }
  }
  return result;
}

function ampersands(string: string): string {
  return string.replaceAll('&', '&amp;');
}

async function downloadCSSContent(blocks: CSSBlock[]): Promise<void> {
  const { HAPPO_DEBUG } = process.env;

  const actions = blocks.map((block) => async () => {
    if (block.href) {
      const absUrl = makeAbsolute(block.href, block.baseUrl || '');
      if (HAPPO_DEBUG) {
        console.log(`[HAPPO] Downloading CSS file from ${absUrl}`);
      }

      let res;
      try {
        res = await proxiedFetch(absUrl, { retryCount: 5 });
      } catch {
        console.warn(
          `[HAPPO] Failed to fetch CSS file from ${absUrl} (using ${block.href} with base URL ${block.baseUrl}). This might mean styles are missing in your Happo screenshots.`,
        );
        return;
      }

      let text = await res.text();
      if (HAPPO_DEBUG) {
        console.log(
          `[HAPPO] Done downloading CSS file from ${absUrl}. Got ${text.length} chars back.`,
        );
      }

      // Strip UTF-8 BOM character if present
      if (text.codePointAt(0) === 0xfe_ff) {
        text = text.slice(1);
        if (HAPPO_DEBUG) {
          console.log(`[HAPPO] Stripped UTF-8 BOM from CSS file ${absUrl}`);
        }
      }

      if (!absUrl.startsWith(block.baseUrl || '')) {
        text = makeExternalUrlsAbsolute(text, absUrl);
      }

      block.content = text;
      block.assetsBaseUrl = absUrl.replace(/\/[^/]*$/, '/');
      delete block.href;
    }
  });

  await pAll(actions, { concurrency: 5 });
}

class Controller {
  private snapshots: Snapshot[] = [];
  private allCssBlocks: CSSBlock[] = [];
  private snapshotAssetUrls: AssetUrl[] = [];
  private localSnapshots: LocalSnapshot[] = [];
  // private localSnapshotImages: Record<string, any> = {};
  private happoDebug: boolean = false;
  private happoConfig: Config | null = null;

  // Public getters for testing
  get config(): Config | null {
    return this.happoConfig;
  }

  get snapshotsList(): Snapshot[] {
    return this.snapshots;
  }

  get assetUrls(): AssetUrl[] {
    return this.snapshotAssetUrls;
  }

  get cssBlocks(): CSSBlock[] {
    return this.allCssBlocks;
  }

  async init(): Promise<void> {
    this.snapshots = [];
    this.allCssBlocks = [];
    this.snapshotAssetUrls = [];
    this.localSnapshots = [];
    // this.localSnapshotImages = {};
    this.happoDebug = false;

    const { HAPPO_E2E_PORT, HAPPO_ENABLED, HAPPO_DEBUG } = process.env;

    if (HAPPO_DEBUG) {
      this.happoDebug = true;
    }

    if (!(HAPPO_E2E_PORT || HAPPO_ENABLED)) {
      console.log(
        `
[HAPPO] Happo is disabled. Here's how to enable it:
  - Use the \`happo-e2e\` wrapper.
  - Set \`HAPPO_ENABLED=true\`.

Docs:
  https://docs.happo.io/docs/cypress#usage-with-cypress-run
  https://docs.happo.io/docs/cypress#usage-with-cypress-open
      `.trim(),
      );
      return;
    }

    if (this.happoDebug) {
      console.log('[HAPPO] Running Controller.init');
    }

    const configFilePath = findConfigFile();
    this.happoConfig = await loadConfigFile(configFilePath);
  }

  isActive(): boolean {
    const result = !!this.happoConfig;
    if (this.happoDebug) {
      console.log('[HAPPO] Controller.isActive()?', result);
    }
    return result;
  }

  async uploadAssetsIfNeeded({
    buffer,
    hash,
  }: {
    buffer: Buffer<ArrayBuffer>;
    hash: string;
  }): Promise<string> {
    if (!this.happoConfig) {
      throw new Error('Happo config not initialized');
    }
    if (!this.happoConfig.endpoint) {
      throw new Error('Missing `endpoint` in Happo config');
    }
    const assetsPath = await uploadAssets(buffer, {
      hash,
      endpoint: this.happoConfig.endpoint,
      apiKey: this.happoConfig.apiKey,
      apiSecret: this.happoConfig.apiSecret,
      logger: console,
      project: this.happoConfig.project,
    });

    return assetsPath;
  }

  async finish(): Promise<void> {
    if (this.happoDebug) {
      console.log('[HAPPO] Running Controller.finish');
    }
    if (this.localSnapshots.length) {
      if (this.happoDebug) {
        console.log(
          `[HAPPO] Processing ${this.localSnapshots.length} local snapshots`,
        );
      }
      await this.processSnapRequestIds([await this.uploadLocalSnapshots()]);
      return;
    }
    if (!this.snapshots.length) {
      if (this.happoDebug) {
        console.log('[HAPPO] No snapshots recorded');
      }
      return;
    }
    this.snapshots = dedupeSnapshots(this.snapshots);
    await downloadCSSContent(this.allCssBlocks);
    const allUrls = [...this.snapshotAssetUrls];
    for (const block of this.allCssBlocks) {
      for (const url of findCSSAssetUrls(block.content || ''))
        allUrls.push({
          url,
          baseUrl: block.assetsBaseUrl || block.baseUrl || undefined,
        });
    }

    const uniqueUrls = getUniqueUrls(allUrls);
    const { buffer, hash } = await createAssetPackage(uniqueUrls as any);

    const assetsPath = await this.uploadAssetsIfNeeded({ buffer, hash });

    const globalCSS = this.allCssBlocks.map((block) => ({
      id: block.key,
      conditional: true,
      css: block.content || '',
    }));
    for (const url of uniqueUrls) {
      if (url.name && /^\/_external\//.test(url.name) && url.name !== url.url) {
        for (const block of globalCSS) {
          block.css = block.css ? block.css.split(url.url).join(url.name!) : '';
        }
        for (const snapshot of this.snapshots) {
          snapshot.html = snapshot.html.split(url.url).join(url.name!);
          if (/&/.test(url.url)) {
            // When URL has an ampersand, we need to make sure the html wasn't
            // escaped so we replace again, this time with "&" replaced by
            // "&amp;"
            snapshot.html = snapshot.html.split(ampersands(url.url)).join(url.name!);
          }
        }
      }
    }
    const allRequestIds = [];
    for (const name of Object.keys(this.happoConfig!.targets)) {
      if (this.happoDebug) {
        console.log(`[HAPPO] Sending snap-request(s) for target=${name}`);
      }
      const snapshotsForTarget = this.snapshots.filter(
        ({ targets }) => !targets || targets.includes(name),
      );
      if (!snapshotsForTarget.length) {
        if (this.happoDebug) {
          console.log(`[HAPPO] No snapshots recorded for target=${name}. Skipping.`);
        }
        continue;
      }

      if (!this.happoConfig!.targets[name]) {
        throw new Error(`Target ${name} not found in Happo config`);
      }

      if (!this.happoConfig!.endpoint) {
        throw new Error('Missing `endpoint` in Happo config');
      }

      const target = this.happoConfig!.targets[name];
      const remoteTarget = new RemoteBrowserTarget(target.browserType, target);
      const requestIds = await remoteTarget.execute({
        targetName: name,
        endpoint: this.happoConfig!.endpoint,
        globalCSS,
        assetsPackage: assetsPath,
        snapPayloads: snapshotsForTarget,
        apiKey: this.happoConfig!.apiKey,
        apiSecret: this.happoConfig!.apiSecret,
      });
      if (this.happoDebug) {
        console.log(
          `[HAPPO] Snap-request(s) for target=${name} created with ID(s)=${requestIds.join(
            ',',
          )}`,
        );
      }
      allRequestIds.push(...requestIds);
    }
    await this.processSnapRequestIds(allRequestIds);
  }

  async registerSnapshot({
    timestamp,
    html,
    assetUrls,
    cssBlocks,
    component,
    variant,
    targets: rawTargets,
    htmlElementAttrs,
    bodyElementAttrs,
  }: SnapshotRegistrationParams): Promise<void> {
    if (!component) {
      throw new Error('Missing `component`');
    }
    if (!variant) {
      throw new Error('Missing `variant`');
    }

    if (this.happoDebug) {
      console.log(`[HAPPO] Registering snapshot for ${component} > ${variant}`);
    }
    this.snapshotAssetUrls.push(...assetUrls);
    const targets = this.handleDynamicTargets(rawTargets);
    this.snapshots.push({
      timestamp,
      html,
      component,
      variant,
      targets,
      stylesheets: cssBlocks.map((b) => b.key),
      htmlElementAttrs,
      bodyElementAttrs,
    });
    for (const block of cssBlocks) {
      if (this.allCssBlocks.some((b) => b.key === block.key)) {
        continue;
      }
      this.allCssBlocks.push(block);
    }
  }

  async registerLocalSnapshot({
    component,
    variant,
    targets,
    target,
    width,
    height,

    // One of path, buffer is required
    path,
    buffer,
  }: LocalSnapshotRegistrationParams): Promise<void> {
    if (!width && !height && buffer) {
      const dimensions = imageSize(buffer);
      width = dimensions.width;
      height = dimensions.height;
    }

    this.localSnapshots.push({
      component,
      variant,
      targets,
      target,
      url: await this.uploadImage(path || buffer!),
      width,
      height,
    });
  }

  removeSnapshotsMadeBetween({ start, end }: TimeframeParams): void {
    if (this.happoDebug) {
      console.log(
        `[HAPPO] Removing snapshots made between ${new Date(
          start,
        )} and ${new Date(end)}`,
      );
    }
    this.snapshots = this.snapshots.filter(({ timestamp }) => {
      if (!timestamp) {
        return true;
      }
      return timestamp < start || timestamp > end;
    });
  }

  removeDuplicatesInTimeframe({ start, end }: TimeframeParams): void {
    if (this.happoDebug) {
      console.log(
        `[HAPPO] Removing duplicate snapshots made between ${new Date(
          start,
        )} and ${new Date(end)}`,
      );
    }
    const seenSnapshots: Record<string, boolean> = {};
    this.snapshots = this.snapshots.filter((snapshot) => {
      const { timestamp, component, variant } = snapshot;
      if (!timestamp) {
        return true;
      }
      const id = [component, variant].join('-_|_-');
      const inTimeframe = timestamp >= start && timestamp <= end;
      if (inTimeframe) {
        if (seenSnapshots[id]) {
          // Found a duplicate made in the timeframe specified
          if (this.happoDebug) {
            console.log(
              `[HAPPO] Found duplicate snapshot to remove: "${component}", "${variant}" at timestamp ${new Date(
                timestamp,
              )}`,
            );
          }
          return false;
        }
        seenSnapshots[id] = true;
      }
      return true;
    });
  }

  async processSnapRequestIds(allRequestIds: string[]): Promise<void> {
    const { HAPPO_E2E_PORT } = process.env;

    if (HAPPO_E2E_PORT) {
      // We're running with `happo-cypress --`
      const fetchRes = await fetch(`http://localhost:${HAPPO_E2E_PORT}/`, {
        method: 'POST',
        body: allRequestIds.join('\n'),
      });
      if (!fetchRes.ok) {
        throw new Error('Failed to communicate with happo-e2e server');
      }
    } else {
      // We're not running with `happo-e2e --`. We'll create a report
      // despite the fact that it might not contain all the snapshots. This is
      // still helpful when running e.g. `cypress open` locally.
      const environment = await resolveEnvironment();
      const { afterSha } = environment;
      const reportResult = await makeRequest(
        {
          url: `${this.happoConfig!.endpoint}/api/async-reports/${afterSha}`,
          method: 'POST',
          json: true,
          body: { requestIds: allRequestIds, project: this.happoConfig!.project },
        },
        { ...this.happoConfig!, maxTries: 3 },
      );
      console.log(`[HAPPO] ${reportResult.url}`);

      return;
    }
  }

  handleDynamicTargets(targets?: (string | DynamicTarget)[]): string[] {
    const result: string[] = [];
    if (targets === undefined) {
      // return non-dynamic targets from .happo.js
      if (!this.happoConfig) {
        return [];
      }
      return Object.keys(this.happoConfig.targets).filter(
        (targetName) => !this.happoConfig!.targets[targetName]?.__dynamic,
      );
    }
    for (const target of targets) {
      if (typeof target === 'string') {
        result.push(target);
      }
      if (
        typeof target === 'object' &&
        target.name &&
        target.viewport &&
        target.browserType
      ) {
        if (!this.happoConfig) {
          throw new Error('Happo config not initialized');
        }
        if (this.happoConfig.targets[target.name]) {
          // already added
        } else {
          const targetName = target.name;
          const constructedTarget: Target = {
            viewport: target.viewport,
            browserType: target.browserType,
            __dynamic: true,
          };
          // add dynamic target
          this.happoConfig.targets[targetName] = constructedTarget;
        }
        result.push(target.name);
      }
    }
    return result;
  }

  async uploadImage(pathOrBuffer: string | Buffer<ArrayBuffer>): Promise<string> {
    if (!this.happoConfig) {
      throw new Error('Happo config not initialized');
    }

    const pathToFile = Buffer.isBuffer(pathOrBuffer) ? undefined : pathOrBuffer;
    if (this.happoDebug) {
      console.log(`[HAPPO] Uploading image ${pathToFile || ''}`);
    }

    const buffer = pathToFile
      ? await fs.promises.readFile(pathToFile, { encoding: 'binary' })
      : pathOrBuffer;

    const hash = crypto.createHash('md5').update(buffer).digest('hex');

    const uploadUrlResult = await makeRequest(
      {
        url: `${this.happoConfig.endpoint}/api/images/${hash}/upload-url`,
        method: 'GET',
        json: true,
      },
      { ...this.happoConfig, maxTries: 2 },
    );

    if (!uploadUrlResult.uploadUrl) {
      // image has already been uploaded
      if (this.happoDebug) {
        console.log(
          `[HAPPO] Image has already been uploaded: ${uploadUrlResult.url}`,
        );
      }
      return uploadUrlResult.url;
    }

    const uploadResult = await makeRequest(
      {
        url: uploadUrlResult.uploadUrl,
        method: 'POST',
        json: true,
        formData: {
          file: new File([buffer], 'image.png', { type: 'image/png' }),
        },
      },
      { ...this.happoConfig, maxTries: 2 },
    );
    if (this.happoDebug) {
      console.log(`[HAPPO] Uploaded image: ${uploadUrlResult.url}`);
    }
    return uploadResult.url;
  }

  async uploadLocalSnapshots(): Promise<string> {
    if (!this.happoConfig) {
      throw new Error('Happo config not initialized');
    }
    const reportResult = await makeRequest(
      {
        url: `${this.happoConfig.endpoint}/api/snap-requests/with-results`,
        method: 'POST',
        json: true,
        body: { snaps: this.localSnapshots },
      },
      { ...this.happoConfig, maxTries: 3 },
    );
    return reportResult.requestId;
  }

  async registerBase64ImageChunk({
    base64Chunk,
    src,
    isFirst,
    isLast,
  }: Base64ChunkParams): Promise<void> {
    const filename = src.slice(1);
    const filenameB64 = `${filename}.b64`;
    if (isFirst) {
      await fs.promises.mkdir('.happo-tmp/_inlined', { recursive: true });
      await new Promise<void>((resolve, reject) =>
        fs.writeFile(filenameB64, base64Chunk, (e) => {
          if (e) {
            reject(e);
          } else {
            resolve();
          }
        }),
      );
    } else {
      await new Promise<void>((resolve, reject) =>
        fs.appendFile(filenameB64, base64Chunk, (e) => {
          if (e) {
            reject(e);
          } else {
            resolve();
          }
        }),
      );
    }

    if (isLast) {
      await convertBase64FileToReal(filenameB64, filename);
    }
  }
}

export default Controller;
