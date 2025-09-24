import parseSrcset from 'parse-srcset';

import { findCSSAssetUrls } from './findCSSAssetUrls.ts';
import applyConstructedStylesPatch, {
  recordedCSSSymbol,
} from './applyConstructedStylesPatch.ts';
import { MD5 } from './md5.ts';

export { applyConstructedStylesPatch };

const CSS_ELEMENTS_SELECTOR = 'style,link[rel="stylesheet"][href]';
const COMMENT_PATTERN = /^\/\*.+\*\/$/;

if (globalThis.window) {
  applyConstructedStylesPatch();
}

// Extend HTMLElement and CSSStyleSheet to include our custom properties
interface ExtendedHTMLElement extends HTMLElement {
  [recordedCSSSymbol]?: string[];
}

interface ExtendedCSSStyleSheet extends CSSStyleSheet {
  [recordedCSSSymbol]?: string[];
}

function getContentFromStyleSheet(element: HTMLElement | CSSStyleSheet): string {
  let lines: string[];

  if ('textContent' in element && element.textContent) {
    // Handle <style> elements with direct textContent
    lines = element.textContent.split('\n').map((line) => line.trim());
  } else if (
    'recordedCSSSymbol' in element &&
    (element as ExtendedHTMLElement | ExtendedCSSStyleSheet)[recordedCSSSymbol]
  ) {
    lines = (element as ExtendedHTMLElement | ExtendedCSSStyleSheet)[
      recordedCSSSymbol
    ]!;
  } else if (
    'sheet' in element &&
    element.sheet &&
    (element.sheet as any).cssRules
  ) {
    // Handle <style> or <link> elements that have a sheet property
    const cssRules = (element.sheet as any).cssRules as CSSRuleList;
    lines = Array.from(cssRules).map((rule: CSSRule) => rule.cssText);
  } else if ((element as any).cssRules) {
    // Handle CSSStyleSheet objects (including adoptedStyleSheets)
    const cssRules = (element as any).cssRules as CSSRuleList;
    lines = Array.from(cssRules).map((rule: CSSRule) => rule.cssText);
  } else {
    return '';
  }

  return lines.filter((line) => line && !COMMENT_PATTERN.test(line)).join('\n');
}

interface CSSBlock {
  key: string;
  content?: string;
  href?: string | undefined;
  baseUrl: string;
}

function extractCSSBlocks(doc: Document): CSSBlock[] {
  const blocks: CSSBlock[] = [];
  const styleElements = doc.querySelectorAll(CSS_ELEMENTS_SELECTOR);

  styleElements.forEach((element) => {
    if (element.closest('happo-shadow-content')) {
      // Skip if element is inside a happo-shadow-content element. These need to
      // be scoped to the shadow root and cannot be part of the global styles.
      return;
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
  });

  (doc.adoptedStyleSheets || []).forEach((sheet) => {
    const content = getContentFromStyleSheet(sheet);
    const key = MD5.hashStr(content);
    blocks.push({ key, content, baseUrl: sheet.href || document.baseURI });
  });
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

interface AssetUrl {
  url: string;
  baseUrl: string;
}

// Extend HTMLElement to include custom properties
interface ExtendedHTMLElementWithBase64 extends HTMLElement {
  _base64Url?: string;
}

function getElementAssetUrls(
  element: HTMLElement,
  {
    handleBase64Image = defaultHandleBase64Image,
  }: {
    handleBase64Image?: (params: {
      base64Url: string;
      element: HTMLImageElement;
    }) => void;
  } = {},
): AssetUrl[] {
  const allUrls: AssetUrl[] = [];
  const allElements = [element].concat(Array.from(element.querySelectorAll('*')));
  allElements.forEach((element) => {
    if (element.tagName === 'SCRIPT') {
      // skip script elements
      return;
    }
    const srcset = element.getAttribute('srcset');
    const src = element.getAttribute('src');
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
    if (src) {
      allUrls.push({ url: src, baseUrl: element.baseURI });
    }
    if (srcset) {
      allUrls.push(
        ...parseSrcset(srcset).map((p: { url: string }) => ({
          url: p.url,
          baseUrl: element.baseURI,
        })),
      );
    }
    if (style) {
      allUrls.push(
        ...findCSSAssetUrls(style).map((url: string) => ({
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
  });
  return allUrls.filter(({ url }) => !url.startsWith('data:'));
}

function copyStyles(sourceElement: HTMLElement, targetElement: HTMLElement): void {
  const computedStyle = window.getComputedStyle(sourceElement);

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
  element: HTMLElement,
  {
    doc,
    responsiveInlinedCanvases = false,
  }: { doc: Document; responsiveInlinedCanvases?: boolean },
): { element: HTMLElement; cleanup: () => void } {
  const canvases: HTMLCanvasElement[] = [];
  if (element.tagName === 'CANVAS') {
    canvases.push(element as HTMLCanvasElement);
  }
  canvases.push(...Array.from(element.querySelectorAll('canvas')));

  let newElement = element;
  const replacements: { from: HTMLCanvasElement; to: HTMLImageElement }[] = [];
  for (const canvas of canvases) {
    try {
      const canvasImageBase64 = canvas.toDataURL('image/png');
      if (canvasImageBase64 === 'data:,') {
        continue;
      }
      const image = doc.createElement('img');

      const url = `/.happo-tmp/_inlined/${MD5.hashStr(canvasImageBase64)}.png`;
      image.src = url;
      (image as ExtendedHTMLElementWithBase64)._base64Url = canvasImageBase64;
      const style = canvas.getAttribute('style');
      if (style) {
        image.setAttribute('style', style);
      }
      const className = canvas.getAttribute('class');
      if (className) {
        image.setAttribute('class', className);
      }
      if (responsiveInlinedCanvases) {
        image.style.width = '100%';
        image.style.height = 'auto';
      } else {
        const width = canvas.getAttribute('width');
        const height = canvas.getAttribute('height');
        if (width) image.setAttribute('width', width);
        if (height) image.setAttribute('height', height);
        copyStyles(canvas, image);
      }
      canvas.replaceWith(image);
      if (canvas === element) {
        // We're inlining the element. Make sure we return the modified element.
        newElement = image;
      }
      replacements.push({ from: canvas, to: image });
    } catch (e) {
      if ((e as Error).name === 'SecurityError') {
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
  const elements = doc.body.querySelectorAll('*');
  for (const node of elements) {
    if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
      node.setAttribute(
        'data-happo-scrollposition',
        `${node.scrollTop},${node.scrollLeft}`,
      );
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
  [...el.attributes].forEach((item) => {
    result[item.name] = item.value;
  });
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
  element: HTMLElement;
}): (() => void) | undefined {
  const elements = Array.from(element.querySelectorAll(selector));
  if (!elements.length) {
    return;
  }
  const replacements: { from: Element; to: Element }[] = [];
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
  elements: HTMLElement | HTMLElement[] | NodeListOf<HTMLElement>,
): HTMLElement[] {
  // Check if 'elements' is already an array
  if (Array.isArray(elements)) {
    return elements;
  }
  // Check if 'elements' is a NodeList
  if (elements instanceof globalThis.window.NodeList) {
    return Array.from(elements);
  }
  // Check if 'elements' is a single HTMLElement
  if (elements instanceof globalThis.window.HTMLElement) {
    return [elements];
  }

  // Handle array-like objects
  if (typeof (elements as any).length !== 'undefined') {
    return Array.from(elements as any);
  }

  return [elements];
}

/**
 * Injects all shadow roots from the given element.
 *
 * @param {HTMLElement} element
 */
function inlineShadowRoots(element: HTMLElement): void {
  const elements: HTMLElement[] = [element];

  const elementsToProcess: HTMLElement[] = [];
  while (elements.length) {
    const currentElement = elements.shift();
    if (!currentElement) continue;

    if (currentElement.shadowRoot) {
      elementsToProcess.unshift(currentElement); // LIFO so that leaf nodes are processed first
    }
    elements.unshift(...(Array.from(currentElement.children) as HTMLElement[])); // LIFO so that leaf nodes are processed first
  }

  for (const element of elementsToProcess) {
    const hiddenElement = document.createElement('happo-shadow-content');
    hiddenElement.style.display = 'none';

    // Add adopted stylesheets as <style> elements
    if (element.shadowRoot) {
      for (const styleSheet of element.shadowRoot.adoptedStyleSheets) {
        const styleElement = document.createElement('style');
        styleElement.setAttribute('data-happo-inlined', 'true');
        const styleContent = getContentFromStyleSheet(styleSheet);
        styleElement.textContent = styleContent;
        hiddenElement.appendChild(styleElement);
      }

      hiddenElement.innerHTML += element.shadowRoot.innerHTML;
      element.appendChild(hiddenElement);
    }
  }
}

function findSvgElementsWithSymbols(element: HTMLElement): SVGElement[] {
  return [...element.ownerDocument.querySelectorAll('svg')].filter((svg) =>
    svg.querySelector('symbol'),
  );
}

interface TakeDOMSnapshotOptions {
  doc: Document;
  element: HTMLElement | HTMLElement[] | NodeListOf<HTMLElement>;
  responsiveInlinedCanvases?: boolean;
  transformDOM?: {
    selector: string;
    transform: (element: Element, doc: Document) => Element;
  };
  handleBase64Image?: (params: {
    base64Url: string;
    element: HTMLImageElement;
  }) => void;
  strategy?: 'hoist' | 'clip';
}

interface DOMSnapshotResult {
  html: string;
  assetUrls: AssetUrl[];
  cssBlocks: CSSBlock[];
  htmlElementAttrs: Record<string, string>;
  bodyElementAttrs: Record<string, string>;
}

export default function takeDOMSnapshot({
  doc,
  element: oneOrMoreElements,
  responsiveInlinedCanvases = false,
  transformDOM,
  handleBase64Image,
  strategy = 'hoist',
}: TakeDOMSnapshotOptions): DOMSnapshotResult {
  const allElements = transformToElementArray(oneOrMoreElements);
  const htmlParts: string[] = [];
  const assetUrls: AssetUrl[] = [];
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

    element.querySelectorAll('script').forEach((scriptEl) => {
      if (scriptEl.parentNode) {
        scriptEl.parentNode.removeChild(scriptEl);
      }
    });

    doc
      .querySelectorAll('[data-happo-focus]')
      .forEach((e) => e.removeAttribute('data-happo-focus'));

    if (doc.activeElement && doc.activeElement !== doc.body) {
      doc.activeElement.setAttribute('data-happo-focus', 'true');
    }

    inlineShadowRoots(element);

    assetUrls.push(
      ...getElementAssetUrls(
        element,
        handleBase64Image ? { handleBase64Image } : {},
      ),
    );

    if (strategy === 'hoist') {
      htmlParts.push(element.outerHTML);
    } else if (strategy === 'clip') {
      element.setAttribute('data-happo-clip', 'true');
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
  doc.querySelectorAll('happo-shadow-content').forEach((e) => e.remove());
  if (strategy === 'clip') {
    doc
      .querySelectorAll('[data-happo-clip]')
      .forEach((e) => e.removeAttribute('data-happo-clip'));
  }

  return {
    html: htmlParts.join('\n'),
    assetUrls,
    cssBlocks,
    htmlElementAttrs,
    bodyElementAttrs,
  };
}
