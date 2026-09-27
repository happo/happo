import { JSDOM } from 'jsdom';
import { afterEach } from 'vitest';

/**
 * Helper for using JSDOM in tests
 *
 * @example
 * const initDOM = withJSDOM();
 * it('is a test', () => {
 *   initDOM('<!DOCTYPE html>');
 * });
 */
export default function withJSDOM(): (html: string) => void {
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  return (html: string) => {
    const dom = new JSDOM(html);

    // @ts-expect-error Type 'DOMWindow' is not assignable to type 'Window & typeof globalThis'.
    globalThis.window = dom.window;
  };
}
