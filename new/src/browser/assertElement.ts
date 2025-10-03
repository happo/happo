/**
 * Make some checks to make sure that the element is a valid
 * Element instance.
 */
export default function assertElement(
  element: Node | null,
  gt: typeof globalThis = globalThis,
): asserts element is Element {
  if (element === null) {
    throw new Error('element cannot be null');
  }

  if (element.nodeType !== gt.Node.ELEMENT_NODE) {
    throw new Error('element must have a nodeType of ELEMENT_NODE');
  }

  if (!(element instanceof gt.Element)) {
    throw new TypeError('element must be an Element instance');
  }
}
