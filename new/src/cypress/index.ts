const chunked = require('./src/chunked');
const takeDOMSnapshot = require('happo-e2e/takeDOMSnapshot');

Cypress.on('window:before:load', (win) => {
  if (takeDOMSnapshot.applyConstructedStylesPatch) {
    console.log('[Happo] Applying constructed styles patch');
    takeDOMSnapshot.applyConstructedStylesPatch(win);
  }
});

before(() => {
  cy.on('window:load', takeDOMSnapshot.init);
});

let config = {
  responsiveInlinedCanvases: false,
  canvasChunkSize: 200000, // 800 Kb per chunk
};

module.exports = {
  configure: (userConfig) => {
    config = { ...config, ...(userConfig || {}) };
  },
};

function resolveTargetName() {
  const { viewportHeight, viewportWidth } = Cypress.config();
  return `${Cypress.browser.name}-${viewportWidth}x${viewportHeight}`;
}

function takeLocalSnapshot({
  originalSubject,
  component,
  variant,
  targets,
  options,
}) {
  const imageId = `${Math.random()}`.slice(2);
  cy.task('happoRegisterLocalSnapshot', {
    imageId,
    component,
    variant,
    targets,
    target: resolveTargetName(),
  });
  cy.wrap(originalSubject, { log: false }).first().screenshot(imageId, options);
}

Cypress.Commands.add(
  'happoScreenshot',
  { prevSubject: true },
  (originalSubject, options = {}) => {
    const {
      component = cy.state('runnable').fullTitle(),
      variant = 'default',
      responsiveInlinedCanvases,
      includeAllElements,
      transformDOM,
      targets,
      snapshotStrategy = 'hoist',
      ...otherOptions
    } = options;

    if (config.localSnapshots) {
      return takeLocalSnapshot({
        originalSubject,
        component,
        variant,
        targets,
        options: otherOptions,
      });
    }

    const doc = originalSubject[0].ownerDocument;

    const resInCan =
      typeof responsiveInlinedCanvases === 'boolean'
        ? responsiveInlinedCanvases
        : config.responsiveInlinedCanvases;

    const domSnapshot = takeDOMSnapshot({
      doc,
      element: includeAllElements ? originalSubject : originalSubject[0],
      responsiveInlinedCanvases: resInCan,
      transformDOM: transformDOM,
      strategy: snapshotStrategy,
      handleBase64Image: ({ src, base64Url }) => {
        const rawBase64 = base64Url.replace(/^data:image\/png;base64,/, '');
        const chunks = chunked(rawBase64, config.canvasChunkSize);
        for (let i = 0; i < chunks.length; i++) {
          const base64Chunk = chunks[i];
          const isFirst = i === 0;
          const isLast = i === chunks.length - 1;
          cy.task(
            'happoRegisterBase64Image',
            {
              base64Chunk,
              src,
              isFirst,
              isLast,
            },
            otherOptions,
          );
        }
      },
    });

    cy.task(
      'happoRegisterSnapshot',
      {
        timestamp: Date.now(),
        component,
        variant,
        targets,
        ...domSnapshot,
      },
      otherOptions,
    );
  },
);

Cypress.Commands.add('happoHideDynamicElements', (options = {}) => {
  const {
    defaultMatchers = [
      /[0-9]+\sdays?\sago/,
      /[0-9]+\sminutes?\sago/,
      /[0-9]{1,2}:[0-9]{2}/,
    ],
    matchers = [],
    defaultSelectors = ['time'],
    selectors = [],
    replace = false,
    ...otherOptions
  } = options;
  const allMatchers = defaultMatchers.concat(matchers);
  const allSelectors = defaultSelectors.concat(selectors);
  cy.document(otherOptions).then((doc) => {
    const elementsToHide = [];
    doc.body.querySelectorAll('*').forEach((e) => {
      if (e.firstElementChild) {
        return; // this is not a leaf element
      }
      const text = e.textContent;
      if (allMatchers.some((regex) => regex.test(text))) {
        elementsToHide.push(e);
      }
    });

    for (const selector of allSelectors) {
      doc.body.querySelectorAll(selector).forEach((e) => {
        elementsToHide.push(e);
      });
    }
    if (replace) {
      const styleElement = doc.createElement('style');
      styleElement.innerHTML = `
          [data-happo-replaced] {
            position: relative;
          }
          [data-happo-replaced]:after {
            content: ' ';'
            display: block;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: black;
          }
        `;
      doc.head.appendChild(styleElement);

      for (const e of elementsToHide) {
        console.log('Replacing', e);
        e.setAttribute('data-happo-replaced', 'true');
        e.removeAttribute('data-happo-hide');
      }
    } else {
      for (const e of elementsToHide) {
        console.log('Hiding', e);
        e.setAttribute('data-happo-hide', 'true');
        e.removeAttribute('data-happo-replaced');
      }
    }
  });
});
