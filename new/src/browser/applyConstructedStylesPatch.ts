const recordedCSSSymbol: unique symbol = Symbol('recordedCssRules');
const hasBrokenIndexesSymbol: unique symbol = Symbol('hasBrokenIndexes');
const isInstalledSymbol: unique symbol = Symbol('isInstalled');

// Extend CSSStyleSheet interface to include our custom properties
interface ExtendedCSSStyleSheet extends CSSStyleSheet {
  [recordedCSSSymbol]?: Array<string>;
  [hasBrokenIndexesSymbol]?: boolean;
}

// Extend CSSStyleSheet constructor to include our custom properties
interface ExtendedCSSStyleSheetConstructor {
  new (options?: CSSStyleSheetInit): CSSStyleSheet;
  [isInstalledSymbol]?: boolean;
  prototype: CSSStyleSheet;
}

// Extend Window interface to include CSSStyleSheet
interface ExtendedWindow extends Window {
  CSSStyleSheet: ExtendedCSSStyleSheetConstructor;
}

export function isExtendedWindow(w: Window): w is ExtendedWindow {
  return (
    'CSSStyleSheet' in w &&
    typeof (w as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet === 'function'
  );
}

// Helper to ensure our custom recorded array exists on the sheet.
function ensureRecord(sheet: ExtendedCSSStyleSheet): void {
  if (!sheet[recordedCSSSymbol]) {
    sheet[recordedCSSSymbol] = [];
  }
}

function displayError(message: string): void {
  console.error(message);

  const el = document.createElement('div');
  el.setAttribute(
    'style',
    `
    position: fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    padding: 30px;
    background: red;
    font-weight: bold;
    color: white;
    z-index: 1000;
    font-family: monospace;
  `,
  );
  const inner = document.createElement('div');
  inner.textContent = message;
  el.append(inner);
  document.addEventListener('DOMContentLoaded', () => {
    document.body.append(el);
  });
}

export default function applyConstructedStylesPatch(
  win: ExtendedWindow = globalThis.window as ExtendedWindow,
): void {
  if (win.CSSStyleSheet === undefined) {
    console.error('CSSStyleSheet is not supported in this browser');
    return;
  }

  const CSSStyleSheetConstructor =
    win.CSSStyleSheet as ExtendedCSSStyleSheetConstructor;
  if (CSSStyleSheetConstructor[isInstalledSymbol]) {
    return;
  }
  CSSStyleSheetConstructor[isInstalledSymbol] = true;

  // Patch insertRule to record each rule string.
  const originalInsertRule = win.CSSStyleSheet.prototype.insertRule;
  win.CSSStyleSheet.prototype.insertRule = function (
    rule: string,
    index: number = 0,
  ): number {
    const extendedThis = this as ExtendedCSSStyleSheet;
    ensureRecord(extendedThis);

    if (extendedThis[hasBrokenIndexesSymbol] && index) {
      displayError(
        'CSSStyleSheet.prototype.insertRule with a non-zero index does not work with Happo after first having called replace/replaceSync. Reach out to support@happo.io if you need help with this.',
      );
      return originalInsertRule.call(this, rule, index);
    }

    // If index is not provided or invalid, default to appending.
    if (
      index === undefined ||
      index < 0 ||
      index > (extendedThis[recordedCSSSymbol]?.length || 0)
    ) {
      extendedThis[recordedCSSSymbol]?.push(rule);
    } else {
      extendedThis[recordedCSSSymbol]?.splice(index, 0, rule);
    }
    return originalInsertRule.call(this, rule, index);
  };

  const originalAddRule = win.CSSStyleSheet.prototype.addRule;
  win.CSSStyleSheet.prototype.addRule = function (
    selector: string,
    styleBlock: string,
    index?: number,
  ): number {
    const extendedThis = this as ExtendedCSSStyleSheet;
    ensureRecord(extendedThis);
    if (extendedThis[hasBrokenIndexesSymbol] && index) {
      displayError(
        'CSSStyleSheet.prototype.addRule with a non-zero index does not work with Happo after first having called replace/replaceSync. Reach out to support@happo.io if you need help with this.',
      );
      return originalAddRule.call(this, selector, styleBlock, index);
    }

    const rule = `${selector} { ${styleBlock} }`;
    if (
      index === undefined ||
      index < 0 ||
      index > (extendedThis[recordedCSSSymbol]?.length || 0)
    ) {
      extendedThis[recordedCSSSymbol]?.push(rule);
    } else {
      extendedThis[recordedCSSSymbol]?.splice(index, 0, rule);
    }
    return originalAddRule.call(this, selector, styleBlock, index);
  };

  // Patch deleteRule so that removed rules are taken out of our record.
  const originalDeleteRule = win.CSSStyleSheet.prototype.deleteRule;
  win.CSSStyleSheet.prototype.deleteRule = function (index: number): void {
    const extendedThis = this as ExtendedCSSStyleSheet;
    ensureRecord(extendedThis);
    if (extendedThis[hasBrokenIndexesSymbol]) {
      displayError(
        'CSSStyleSheet.prototype.deleteRule does not work with Happo after first having called replace/replaceSync. Reach out to support@happo.io if you need help with this.',
      );
    } else if (
      index >= 0 &&
      index < (extendedThis[recordedCSSSymbol]?.length || 0)
    ) {
      extendedThis[recordedCSSSymbol]?.splice(index, 1);
    }
    return originalDeleteRule.call(this, index);
  };

  const originalRemoveRule = win.CSSStyleSheet.prototype.removeRule;
  win.CSSStyleSheet.prototype.removeRule = function (index?: number): void {
    const extendedThis = this as ExtendedCSSStyleSheet;
    ensureRecord(extendedThis);
    if (extendedThis[hasBrokenIndexesSymbol]) {
      displayError(
        'CSSStyleSheet.prototype.removeRule does not work with Happo after first having called replace/replaceSync. Reach out to support@happo.io if you need help with this.',
      );
    } else if (
      index !== undefined &&
      index >= 0 &&
      index < (extendedThis[recordedCSSSymbol]?.length || 0)
    ) {
      extendedThis[recordedCSSSymbol]?.splice(index, 1);
    }
    return originalRemoveRule.call(this, index);
  };

  // Patch replaceSync to capture the new CSS text.
  const originalReplaceSync = win.CSSStyleSheet.prototype.replaceSync;
  win.CSSStyleSheet.prototype.replaceSync = function (text: string): void {
    const extendedThis = this as ExtendedCSSStyleSheet;
    extendedThis[recordedCSSSymbol] = text.split('\n').map((rule) => rule.trim());
    extendedThis[hasBrokenIndexesSymbol] = true;
    return originalReplaceSync.call(this, text);
  };

  // Patch replace (the asynchronous version) similarly.
  const originalReplace = win.CSSStyleSheet.prototype.replace;
  win.CSSStyleSheet.prototype.replace = function (
    text: string,
  ): Promise<CSSStyleSheet> {
    const sheet = this as ExtendedCSSStyleSheet;
    return originalReplace.call(sheet, text).then(function (result: CSSStyleSheet) {
      sheet[recordedCSSSymbol] = text.split('\n').map((rule) => rule.trim());
      sheet[hasBrokenIndexesSymbol] = true;
      return result;
    });
  };
}

export { recordedCSSSymbol };
