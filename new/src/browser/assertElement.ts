/**
 * Throws if the element is not a valid Element instance, an array of elements,
 * or a NodeList of elements.
 */
export default function assertElement(
  element: unknown,
  gt: typeof globalThis = globalThis.window,
): asserts element is Element | Array<Element> | NodeListOf<Element> {
  if (element == null) {
    throw new Error('element cannot be null or undefined');
  }

  if (typeof element !== 'object') {
    throw new TypeError('element must be an object');
  }

  if (Array.isArray(element) || element instanceof gt.NodeList) {
    for (const el of element) {
      assertElement(el, gt);
    }
    return;
  }

  if ('nodeType' in element && element.nodeType !== gt.Node.ELEMENT_NODE) {
    throw new Error('element must have a nodeType of ELEMENT_NODE');
  }

  if (!(element instanceof gt.Element)) {
    throw new TypeError('element must be an Element instance');
  }
}
