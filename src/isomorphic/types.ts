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
  /**
   * When `true`, examples that render with errors will cause the run to fail
   * with an `AggregateError` instead of silently continuing.
   */
  failOnRenderError?: boolean;
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
  /**
   * When true, extends the default pseudo-state handling by automatically
   * detecting and applying data attributes for elements currently in `:hover`,
   * `:active`, and `:focus-visible` pseudo states, and by doing deeper focus
   * traversal (e.g. into shadow DOM) when determining which element should
   * receive `data-happo-focus`.
   *
   * Note: basic focus handling (`data-happo-focus` based on `activeElement`)
   * is always applied regardless of this option. Enabling this option means
   * you can write your Playwright or Cypress tests naturally (e.g. hover or
   * focus an element) and have Happo capture those states without manually
   * adding `data-happo-hover`, `data-happo-focus-visible`, etc. attributes.
   */
  autoApplyPseudoStateAttributes?: boolean;
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
  init?: (config: InitConfig) => Promise<void> | void;
  nextExample?: () => Promise<NextExampleResult | undefined>;
  takeDOMSnapshot?: (options: TakeDOMSnapshotOptions) => DOMSnapshotResult;
  failOnRenderError?: boolean;
};

export interface WindowWithHappo extends Window {
  happo?: WindowHappo | undefined;
}

export type Logger = Pick<Console, 'log' | 'error'>;
