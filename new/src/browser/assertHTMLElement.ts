/**
 * Make some checks to make sure that the element is a valid
 * HTMLElement and to narrow the type of the element.
 */
export default function assertHTMLElement(
  element: Node | null,
): asserts element is HTMLElement {
  if (element === null) {
    throw new Error('element cannot be null');
  }

  if (element.nodeType !== Node.ELEMENT_NODE) {
    throw new Error('element must be an HTMLElement');
  }
}
