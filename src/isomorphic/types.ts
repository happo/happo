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

export interface InitConfig {
  chunk?: {
    index: number;
    total: number;
  };
  targetName?: string;
  only?: {
    component: string;
    variant: string;
  };
}

export interface TakeDOMSnapshotOptions {
  doc: Document | null | undefined;
  element: Element | Array<Element> | NodeListOf<Element> | null;
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

export interface NextExampleResult {
  component?: string;
  variant?: string;
  skipped?: boolean;
  waitForContent?: string | undefined;
  render?: () => Promise<void> | void;
}

export type WindowHappo = {
  init?: (config: InitConfig) => void;
  nextExample?: () => Promise<NextExampleResult | undefined>;
  takeDOMSnapshot?: (options: TakeDOMSnapshotOptions) => DOMSnapshotResult;
};

export interface WindowWithHappo extends Window {
  happo?: WindowHappo | undefined;
}

export type Logger = Pick<Console, 'log' | 'error'>;
