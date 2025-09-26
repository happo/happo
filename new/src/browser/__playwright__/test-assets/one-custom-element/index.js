class MyElement extends HTMLElement {
  static get observedAttributes() {
    return ['data-color'];
  }

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    const text = document.createElement('span');
    text.textContent = 'world';
    shadowRoot.appendChild(text);
    this.updateStyle();
  }

  updateStyle() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        background: ${this.getAttribute('data-color') || 'transparent'};
        font-weight: bold;
      }
    `;

    // Remove old style if it exists
    const oldStyle = this.shadowRoot.querySelector('style');
    if (oldStyle) oldStyle.remove();

    this.shadowRoot.insertBefore(style, this.shadowRoot.firstChild);
  }

  attributeChangedCallback(name) {
    if (name === 'data-color') {
      this.updateStyle();
    }
  }
}

// Define the new element
customElements.define('my-element', MyElement);
