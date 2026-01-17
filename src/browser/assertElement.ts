function isIterableCollection(
  element: NonNullable<unknown>,
): element is Iterable<unknown> {
  if (typeof element !== 'object') {
    return false;
  }

  if (!('length' in element)) {
    return false;
  }

  if (typeof element.length !== 'number') {
    return false;
  }

  if (!('item' in element)) {
    return false;
  }

  if (typeof element.item !== 'function') {
    return false;
  }

  if (!(Symbol.iterator in element)) {
    return false;
  }

  if (typeof element[Symbol.iterator] !== 'function') {
    return false;
  }

  return true;
}

/**
 * Throws if the element is not a valid Element instance, an array of elements,
 * or a NodeList of elements.
 */
export default function assertElement(
  element: unknown,
): asserts element is Element | Array<Element> | NodeListOf<Element> {
  if (element == null) {
    throw new Error('element cannot be null or undefined');
  }

  if (typeof element !== 'object') {
    throw new TypeError('element must be an object');
  }

  if (Array.isArray(element) || isIterableCollection(element)) {
    for (const el of element) {
      assertElement(el);
    }

    return;
  }

  if (!('nodeType' in element)) {
    throw new TypeError('element must have a nodeType property');
  }

  if (element.nodeType !== 1 /* ELEMENT_NODE */) {
    throw new Error('element must have a nodeType of ELEMENT_NODE');
  }
}
