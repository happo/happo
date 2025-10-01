/**
 * Make some checks to make sure that the element is a valid
 * HTMLElement and to narrow the type of the element.
 */
export default function assertHTMLElement(
  element: Node | null,
  gt: typeof globalThis = globalThis,
): asserts element is HTMLElement {
  if (element === null) {
    throw new Error('element cannot be null');
  }

  if (element.nodeType !== gt.Node.ELEMENT_NODE) {
    throw new Error('element must have a nodeType of ELEMENT_NODE');
  }

  if (!(element instanceof gt.HTMLElement)) {
    throw new TypeError('element must be an HTMLElement instance');
  }
}
