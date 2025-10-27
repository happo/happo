class containerComponent extends HTMLElement {
  constructor() {
    super();
    const containerTemplate = document.createElement('template');
    containerTemplate.innerHTML = `
       <slot></slot>
    `;

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: grid;
        grid-template-columns: repeat(${this.hasAttribute('data-columns') ? this.getAttribute('data-columns') : '2'}, 1fr);
        gap: 1rem;
        width: 100%;
        max-width: 60em;
      }
    `;

    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(containerTemplate.content.cloneNode(true));
  }
}

customElements.define('layout-container', containerComponent);

// Create a class for the element
class Card extends HTMLElement {
  constructor() {
    super();

    this.setAttribute('role', 'article');

    // Title
    const title = document.createElement('h2');
    title.classList.add('card__title');
    title.textContent = this.getAttribute('data-title');

    // Description
    const description = document.createElement('div');
    description.classList.add('card__description');
    description.innerHTML = 'This is a description of the card component';

    // Image
    const image = document.createElement('img');
    image.classList.add('card__image');
    image.src = '/nested-custom-elements/avatar.jpeg';
    const imageWrapper = document.createElement('div');
    imageWrapper.classList.add('card__image-wrapper');
    imageWrapper.appendChild(image);
    this.appendChild(imageWrapper);

    const contentContainer = document.createElement('div');
    contentContainer.classList.add('card__content');
    contentContainer.appendChild(title);
    contentContainer.appendChild(description);

    // Create some CSS to apply to the shadow dom
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        background: #eaeaea;
        border-radius: 10px;
        border: 1px solid black;
        max-width: 300px;
        color: #333;
      }

      .card__content {
        padding: 1rem;
      }

      .card__title {
        color: #333;
        margin-top: 0;
        line-height: 1.1;
      }

      img {
        width: 100%;
        display: block;
        border-radius: 10px 10px 0 0;
      }
    `;

    // Attach the created elements to the shadow dom
    const shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(imageWrapper);
    shadowRoot.appendChild(contentContainer);
  }
}

// Define the new element
customElements.define('component-card', Card);
