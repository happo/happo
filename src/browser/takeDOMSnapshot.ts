import { parseSrcset } from 'srcset';

import findCSSAssetUrls from '../isomorphic/findCSSAssetUrls.ts';
import type {
  AssetUrl,
  CSSBlock,
  DOMSnapshotResult,
  TakeDOMSnapshotOptions,
} from '../isomorphic/types.ts';
import applyConstructedStylesPatch, {
  recordedCSSSymbol,
} from './applyConstructedStylesPatch.ts';
import assertElement, { isElementWithDataset, isIterableCollection } from './assertElement.ts';
import { MD5 } from './md5.ts';

export { applyConstructedStylesPatch };

const CSS_ELEMENTS_SELECTOR = 'style,link[rel="stylesheet"][href]';
const COMMENT_PATTERN = /^\/\*.+\*\/$/;

if (globalThis.window) {
  applyConstructedStylesPatch(globalThis.window);
}

// Extend HTMLElement and CSSStyleSheet to include our custom properties
interface ExtendedHTMLElement extends HTMLElement {
  [recordedCSSSymbol]?: Array<string>;
}

interface ExtendedCSSStyleSheet extends CSSStyleSheet {
  [recordedCSSSymbol]?: Array<string>;
}

function getContentFromStyleSheet(element: HTMLElement | CSSStyleSheet): string {
  let lines: Array<string>;

  if ('textContent' in element && element.textContent) {
    // Handle <style> elements with direct textContent
    lines = element.textContent.split('\n').map((line) => line.trim());
  } else if (
    recordedCSSSymbol in element &&
    (element as ExtendedHTMLElement | ExtendedCSSStyleSheet)[recordedCSSSymbol]
  ) {
    lines = (element as ExtendedHTMLElement | ExtendedCSSStyleSheet)[
      recordedCSSSymbol
    ]!;
  } else if (
    'sheet' in element &&
    element.sheet &&
    (element.sheet as CSSStyleSheet).cssRules
  ) {
    // Handle <style> or <link> elements that have a sheet property
    const cssRules = (element.sheet as CSSStyleSheet).cssRules as CSSRuleList;
    lines = Array.from(cssRules).map((rule: CSSRule) => rule.cssText);
  } else if ((element as CSSStyleSheet).cssRules) {
    // Handle CSSStyleSheet objects (including adoptedStyleSheets)
    const cssRules = (element as CSSStyleSheet).cssRules as CSSRuleList;
    lines = Array.from(cssRules).map((rule: CSSRule) => rule.cssText);
  } else {
    return '';
  }

  return lines.filter((line) => line && !COMMENT_PATTERN.test(line)).join('\n');
}

function extractCSSBlocks(doc: Document): Array<CSSBlock> {
  const blocks: Array<CSSBlock> = [];
  const styleElements = doc.querySelectorAll(CSS_ELEMENTS_SELECTOR);

  for (const element of styleElements) {
    if (element.closest('happo-shadow-content')) {
      // Skip if element is inside a happo-shadow-content element. These need to
      // be scoped to the shadow root and cannot be part of the global styles.
      continue;
    }
    if (element.tagName === 'LINK') {
      // <link href>
      const href = (element as HTMLLinkElement).href || element.getAttribute('href');
      blocks.push({
        key: href || '',
        href: href || undefined,
        baseUrl: element.baseURI,
      });
    } else {
      const content = getContentFromStyleSheet(element as HTMLElement);
      // Create a hash so that we can dedupe equal styles
      const key = MD5.hashStr(content);
      blocks.push({ content, key, baseUrl: element.baseURI });
    }
  }

  for (const sheet of doc.adoptedStyleSheets || []) {
    const content = getContentFromStyleSheet(sheet);
    const key = MD5.hashStr(content);
    blocks.push({ key, content, baseUrl: sheet.href || document.baseURI });
  }
  return blocks;
}

function defaultHandleBase64Image({
  base64Url,
  element,
}: {
  base64Url: string;
  element: HTMLImageElement;
}): void {
  // Simply make the base64Url the src of the image
  element.src = base64Url;
}

// Extend HTMLElement to include custom properties
interface ExtendedHTMLElementWithBase64 extends HTMLElement {
  _base64Url?: string;
}

function getElementAssetUrls(
  element: Element,
  {
    handleBase64Image = defaultHandleBase64Image,
  }: {
    handleBase64Image?: (params: {
      base64Url: string;
      element: HTMLImageElement;
    }) => void;
  } = {},
): Array<AssetUrl> {
  const allUrls: Array<AssetUrl> = [];
  const allElements = [element].concat(Array.from(element.querySelectorAll('*')));
  for (const element of allElements) {
    if (element.tagName === 'SCRIPT') {
      // skip script elements
      continue;
    }
    const srcset = element.getAttribute('srcset');
    const imageHref =
      element.tagName.toLowerCase() === 'image' && element.getAttribute('href');
    const linkHref =
      element.tagName.toLowerCase() === 'link' &&
      element.getAttribute('rel') === 'stylesheet' &&
      element.getAttribute('href');

    const style = element.getAttribute('style');
    const base64Url = (element as ExtendedHTMLElementWithBase64)._base64Url;
    if (base64Url && element.tagName === 'IMG') {
      handleBase64Image({ base64Url, element: element as HTMLImageElement });
    }
    const src = element.getAttribute('src');
    if (src) {
      allUrls.push({ url: src, baseUrl: element.baseURI });
    }
    if (srcset) {
      allUrls.push(
        ...parseSrcset(srcset).map((p) => ({
          url: p.url,
          baseUrl: element.baseURI,
        })),
      );
    }
    if (style) {
      allUrls.push(
        ...findCSSAssetUrls(style).map((url) => ({
          url,
          baseUrl: element.baseURI,
        })),
      );
    }
    if (imageHref) {
      allUrls.push({ url: imageHref, baseUrl: element.baseURI });
    }
    if (linkHref) {
      allUrls.push({ url: linkHref, baseUrl: element.baseURI });
    }
  }
  return allUrls.filter(({ url }) => !url.startsWith('data:'));
}

function copyStyles(sourceElement: HTMLElement, targetElement: HTMLElement): void {
  const computedStyle = globalThis.getComputedStyle(sourceElement);

  for (let i = 0; i < computedStyle.length; i++) {
    const key = computedStyle[i];
    if (!key) continue;
    const value = computedStyle.getPropertyValue(key);
    if (value !== '') {
      targetElement.style.setProperty(key, value);
    }
  }
}

function inlineCanvases(
  element: Element,
  {
    doc,
    responsiveInlinedCanvases = false,
  }: { doc: Document; responsiveInlinedCanvases?: boolean },
): { element: Element; cleanup: () => void } {
  const canvases: Array<HTMLCanvasElement> = [];
  if (element.tagName === 'CANVAS') {
    canvases.push(element as HTMLCanvasElement);
  }
  canvases.push(...Array.from(element.querySelectorAll('canvas')));

  let newElement = element;
  const replacements: Array<{ from: HTMLCanvasElement; to: HTMLImageElement }> = [];
  for (const canvas of canvases) {
    try {
      const canvasImageBase64 = canvas.toDataURL('image/png');
      if (canvasImageBase64 === 'data:,') {
        continue;
      }
      const image = doc.createElement('img');

      const url = `/.happo-tmp/_inlined/${MD5.hashStr(canvasImageBase64)}.png`;
      (image as ExtendedHTMLElementWithBase64)._base64Url = canvasImageBase64;
      for (const attributeName of canvas.getAttributeNames()) {
        if (attributeName.startsWith('on')) {
          // Skip event listeners
          continue;
        }
        // Transfer all attributes from the canvas to the image
        const value = canvas.getAttribute(attributeName);
        if (value) {
          image.setAttribute(attributeName, value);
        }
      }
      image.src = url;
      if (responsiveInlinedCanvases) {
        image.style.width = '100%';
        image.style.height = 'auto';
      } else {
        copyStyles(canvas, image);
      }
      canvas.replaceWith(image);
      if (canvas === element) {
        // We're inlining the element. Make sure we return the modified element.
        newElement = image;
      }
      replacements.push({ from: canvas, to: image });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'name' in e && e.name === 'SecurityError') {
        console.warn('[HAPPO] Failed to convert tainted canvas to PNG image');
        console.warn(e);
      } else {
        throw e;
      }
    }
  }

  function cleanup(): void {
    for (const { from, to } of replacements) {
      to.replaceWith(from);
    }
  }
  return { element: newElement, cleanup };
}

function registerScrollPositions(doc: Document): void {
  const elements = doc.body.querySelectorAll<HTMLElement | SVGElement>('*');
  for (const node of elements) {
    if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
      node.dataset.happoScrollposition = `${node.scrollTop},${node.scrollLeft}`;
    }
  }
}

function registerCheckedInputs(doc: Document): void {
  const elements = doc.body.querySelectorAll(
    'input[type="checkbox"], input[type="radio"]',
  );
  for (const node of elements) {
    const input = node as HTMLInputElement;
    if (input.checked) {
      input.setAttribute('checked', 'checked');
    } else {
      input.removeAttribute('checked');
    }
  }
}

function extractElementAttributes(el: Element): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of el.attributes) {
    result[item.name] = item.value;
  }
  return result;
}

function performDOMTransform({
  doc,
  selector,
  transform,
  element,
}: {
  doc: Document;
  selector: string;
  transform: (element: Element, doc: Document) => Element;
  element: Element;
}): (() => void) | undefined {
  const elements = Array.from(element.querySelectorAll(selector));
  if (!elements.length) {
    return;
  }
  const replacements: Array<{ from: Element; to: Element }> = [];
  for (const element of elements) {
    const replacement = transform(element, doc);
    replacements.push({ from: element, to: replacement });
    element.replaceWith(replacement);
  }
  return () => {
    for (const { from, to } of replacements) {
      to.replaceWith(from);
    }
  };
}

function transformToElementArray(
  elements: Element | Array<Element> | NodeListOf<Element>,
): Array<Element> {
  // Check if 'elements' is already an array
  if (Array.isArray(elements)) {
    return elements;
  }

  // Check if 'elements' is an iterable collection, like a NodeList
  if (isIterableCollection(elements)) {
    return Array.from(elements);
  }

  return [elements];
}

/**
 * Injects all shadow roots from the given element.
 *
 * @param {HTMLElement} element
 */
function inlineShadowRoots(element: Element): void {
  const elements = [element];

  const elementsToProcess: Array<Element> = [];
  while (elements.length) {
    const currentElement = elements.shift();
    if (!currentElement) continue;

    if (currentElement.shadowRoot) {
      elementsToProcess.unshift(currentElement); // LIFO so that leaf nodes are processed first
    }
    elements.unshift(...(Array.from(currentElement.children) as Array<HTMLElement>)); // LIFO so that leaf nodes are processed first
  }

  for (const element of elementsToProcess) {
    const ownerDoc = element.ownerDocument;
    const hiddenElement = ownerDoc.createElement('happo-shadow-content');
    hiddenElement.style.display = 'none';

    // Add adopted stylesheets as <style> elements
    if (element.shadowRoot) {
      for (const styleSheet of element.shadowRoot.adoptedStyleSheets || []) {
        const styleElement = ownerDoc.createElement('style');
        styleElement.dataset.happoInlined = 'true';
        const styleContent = getContentFromStyleSheet(styleSheet);
        styleElement.textContent = styleContent;
        hiddenElement.append(styleElement);
      }

      hiddenElement.innerHTML += element.shadowRoot.innerHTML;
      element.append(hiddenElement);
    }
  }
}

/**
 * Adds data-happo-modal to the first modal dialog that is open, and removes it
 * from all other dialogs.
 */
function markModalDialogs(element: Element): void {
  const cleanups = element.querySelectorAll<HTMLDialogElement>(
    'dialog[data-happo-modal]',
  );
  for (const cleanup of cleanups) {
    delete cleanup.dataset.happoModal;
  }

  const openModal = element.querySelector<HTMLDialogElement>('dialog:modal[open]');
  if (!openModal) {
    return;
  }
  openModal.dataset.happoModal = 'true';
}

function findSvgElementsWithSymbols(element: Element): Array<SVGElement> {
  return [...element.ownerDocument.querySelectorAll('svg')].filter((svg) =>
    svg.querySelector('symbol'),
  );
}

type QueryRoot = Document | ShadowRoot | Element;

// nodeType === 1 identifies Element nodes (Document = 9, ShadowRoot/DocumentFragment = 11).
function isElementNode(root: QueryRoot): root is Element {
  return root.nodeType === 1;
}

/**
 * Collects the given root plus all shadow roots reachable from it. Accepts any
 * query root (Document, ShadowRoot, or Element) so callers can scope the
 * traversal to a specific subtree. Collecting once and reusing the result
 * avoids repeated full-DOM scans when querying multiple selectors.
 *
 * Note: when `root` is an Element that is itself a shadow host, its own
 * `shadowRoot` is added explicitly before walking descendants, because
 * `querySelectorAll('*')` only traverses light-DOM children and will not
 * descend into the element's own shadow tree.
 */
function collectAllRoots(root: QueryRoot): Array<QueryRoot> {
  const roots: Array<QueryRoot> = [root];
  if (isElementNode(root) && root.shadowRoot) {
    roots.push(...collectAllRoots(root.shadowRoot));
  }
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) {
      roots.push(...collectAllRoots(el.shadowRoot));
    }
  }
  return roots;
}

/**
 * Returns the deepest focused element, traversing into shadow roots.
 */
function getDeepActiveElement(doc: Document): Element | null {
  let el: Element | null = doc.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

const PSEUDO_STATE_ATTRS = [
  { pseudo: ':hover', attrSelector: '[data-happo-hover]', datasetKey: 'happoHover' },
  { pseudo: ':active', attrSelector: '[data-happo-active]', datasetKey: 'happoActive' },
  {
    pseudo: ':focus-visible',
    attrSelector: '[data-happo-focus-visible]',
    datasetKey: 'happoFocusVisible',
  },
] as const;

export default function takeDOMSnapshot({
  doc,
  element: oneOrMoreElements,
  responsiveInlinedCanvases = false,
  transformDOM,
  handleBase64Image,
  strategy = 'hoist',
  autoApplyPseudoStateAttributes = false,
}: TakeDOMSnapshotOptions): DOMSnapshotResult {
  if (doc == null) {
    throw new Error('doc cannot be null or undefined');
  }
  if (doc.defaultView == null) {
    throw new Error('doc.defaultView cannot be null or undefined');
  }

  assertElement(oneOrMoreElements);

  const allElements = transformToElementArray(oneOrMoreElements);
  const htmlParts: Array<string> = [];
  const assetUrls: Array<AssetUrl> = [];

  // Collect doc-level roots once (used for focus cleanup across the whole document,
  // including shadow roots). Only traverse when the option is enabled.
  const allDocRoots: Array<QueryRoot> = autoApplyPseudoStateAttributes
    ? collectAllRoots(doc)
    : [doc];

  for (const originalElement of allElements) {
    const { element, cleanup: canvasCleanup } = inlineCanvases(originalElement, {
      doc,
      responsiveInlinedCanvases,
    });

    registerScrollPositions(doc);
    registerCheckedInputs(doc);

    const transformCleanup = transformDOM
      ? performDOMTransform({
          doc,
          element,
          ...transformDOM,
        })
      : undefined;

    for (const scriptEl of element.querySelectorAll('script')) {
      if (scriptEl.parentNode) {
        scriptEl.remove();
      }
    }

    // Clear stale focus attributes across the full document (including shadow roots)
    // so that stale data-happo-focus from previous snapshots is never left behind.
    for (const root of allDocRoots) {
      for (const e of root.querySelectorAll<HTMLElement | SVGElement | MathMLElement>(
        '[data-happo-focus]',
      )) {
        delete e.dataset.happoFocus;
      }
    }

    const activeElement = autoApplyPseudoStateAttributes
      ? getDeepActiveElement(doc)
      : doc.activeElement;

    if (activeElement && activeElement !== doc.body && isElementWithDataset(activeElement)) {
      activeElement.dataset.happoFocus = 'true';
    }

    if (autoApplyPseudoStateAttributes) {
      // Scope to the element subtree being snapshotted to avoid mutating DOM
      // nodes that won't appear in this snapshot.
      const elementRoots = collectAllRoots(element);
      for (const { pseudo, attrSelector, datasetKey } of PSEUDO_STATE_ATTRS) {
        for (const root of elementRoots) {
          // Probe selector support first. If unsupported, skip entirely so we
          // don't strip manually-set attributes without being able to re-apply them.
          let matches: NodeListOf<Element>;
          let rootMatches: boolean;
          try {
            matches = root.querySelectorAll(pseudo);
            // querySelectorAll only returns descendants, not root itself — check explicitly.
            rootMatches = isElementNode(root) && root.matches(pseudo);
          } catch {
            // Selector not supported in this environment (e.g. :focus-visible in older browsers)
            continue;
          }
          // Clear stale attribute from descendants.
          for (const e of root.querySelectorAll(attrSelector)) {
            if (isElementWithDataset(e)) {
              delete e.dataset[datasetKey];
            }
          }
          // Clear stale attribute from root itself (not returned by querySelectorAll).
          if (isElementNode(root) && isElementWithDataset(root)) {
            delete root.dataset[datasetKey];
          }
          // Apply to matched descendants.
          for (const e of matches) {
            if (isElementWithDataset(e)) {
              e.dataset[datasetKey] = 'true';
            }
          }
          // Apply to root itself if it matches the pseudo-class.
          if (rootMatches && isElementWithDataset(root)) {
            root.dataset[datasetKey] = 'true';
          }
        }
      }
    }

    inlineShadowRoots(element);
    markModalDialogs(element);

    assetUrls.push(
      ...getElementAssetUrls(
        element,
        handleBase64Image ? { handleBase64Image } : {},
      ),
    );

    if (strategy === 'hoist') {
      htmlParts.push(element.outerHTML);
    } else if (strategy === 'clip') {
      if (!isElementWithDataset(element)) {
        throw new TypeError(
          'element does not support the dataset property, i.e. it is not an HTMLElement or SVGElement or MathMLElement',
        );
      }

      element.dataset.happoClip = 'true';
      htmlParts.push(doc.body.outerHTML);
    } else {
      throw new Error(`Unknown strategy: ${strategy}`);
    }

    if (strategy === 'hoist') {
      const svgElementsWithSymbols = findSvgElementsWithSymbols(element);
      for (const svgElement of svgElementsWithSymbols) {
        htmlParts.push(`<div style="display: none;">${svgElement.outerHTML}</div>`);
      }
    }
    if (canvasCleanup) canvasCleanup();
    if (transformCleanup) transformCleanup();
  }

  const cssBlocks = extractCSSBlocks(doc);
  const htmlElementAttrs = extractElementAttributes(doc.documentElement);
  const bodyElementAttrs = extractElementAttributes(doc.body);

  // Remove our shadow content elements so that they don't affect the page
  for (const e of doc.querySelectorAll('happo-shadow-content')) e.remove();
  if (strategy === 'clip') {
    for (const e of doc.querySelectorAll<HTMLElement | SVGElement>(
      '[data-happo-clip]',
    )) {
      delete e.dataset.happoClip;
    }
  }

  return {
    html: htmlParts.join('\n'),
    assetUrls,
    cssBlocks,
    htmlElementAttrs,
    bodyElementAttrs,
  };
}
