export interface AssetUrl {
  url: string;
  baseUrl: string;
}

export interface CSSBlock {
  key: string;
  content?: string;
  href?: string | undefined;
  baseUrl: string;
}

export interface TakeDOMSnapshotOptions {
  doc: Document | null | undefined;
  element: HTMLElement | Array<HTMLElement> | NodeListOf<HTMLElement> | null;
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

export interface DOMSnapshotResult {
  html: string;
  assetUrls: Array<AssetUrl>;
  cssBlocks: Array<CSSBlock>;
  htmlElementAttrs: Record<string, string>;
  bodyElementAttrs: Record<string, string>;
}

export interface WindowHappo {
  happo: {
    takeDOMSnapshot: (options: TakeDOMSnapshotOptions) => DOMSnapshotResult;
    assertHTMLElement: (element: Node | null) => asserts element is HTMLElement;
  };
}
