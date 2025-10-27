// Create a new constructed stylesheet that uses insertRule and deleteRule.
const injectSheet = new CSSStyleSheet();
injectSheet.insertRule(
  `
  :root {
    --my-custom-font: 400 1rem / 1.5rem Roboto;
    --my-custom-font-weight: 400;
  }`,
  0,
);
injectSheet.insertRule(
  `
  p {
    font: var(--my-custom-font);
    font-weight: var(--my-custom-font-weight);
  }`,
  1,
);
injectSheet.insertRule('b { color: green; }'); // This will go to the top
injectSheet.insertRule('i { color: red; }', 1);
injectSheet.deleteRule(1); // Remove "i { color: red; }"
document.adoptedStyleSheets.push(injectSheet);

// Create a new constructed stylesheet that uses replaceSync.
const replaceSyncSheet = new CSSStyleSheet();
replaceSyncSheet.insertRule('i { color: red; }', 0);
replaceSyncSheet.replaceSync('b { color: violet; }');
replaceSyncSheet.deleteRule(0);
document.adoptedStyleSheets.push(replaceSyncSheet);

// Create a new constructed stylesheet that uses async replace.
const replaceSheet = new CSSStyleSheet();
replaceSheet.addRule('i', 'color: red;');
replaceSheet
  .replace(
    `
  :root {
    --my-custom-font: 600 1em / 1em Comic;
    --my-custom-font-weight: 400;
  }
  p {
    font: var(--my-custom-font);
    font-weight: var(--my-custom-font-weight);
  }
  `,
  )
  .then(() => {
    // Apply the constructed stylesheet to the document
    document.adoptedStyleSheets.push(replaceSheet);
  });
