class MyElement extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: 'open' });
    const text = document.createElement('h1');
    text.textContent = 'Hello world';
    shadowRoot.appendChild(text);
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = '/custom-element-with-special-stylesheets/style.css';
    shadowRoot.appendChild(linkElement);

    // Create a new constructed stylesheet
    const sheet = new CSSStyleSheet();
    // Add rules one by one
    sheet.insertRule('h1 { font-size: 88px; }', 0);
    // Adopt the stylesheet into the shadow root
    shadowRoot.adoptedStyleSheets = [sheet];
  }
}

// Define the new element
customElements.define('my-element', MyElement);
