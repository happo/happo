import happoStatic from '../index.ts';

happoStatic.init();

happoStatic.registerExample({
  component: 'Hello',
  variant: 'red',
  render: () => {
    document.body.innerHTML = '<div style="background-color:red">Hello</div>';
  },
});

happoStatic.registerExample({
  component: 'Hello',
  variant: 'blue',
  render: () => {
    document.body.innerHTML = '<div style="background-color:blue">Hello</div>';
  },
});

// The "Page" examples below render by replacing the entire document via
// `document.open()` / `document.write()` / `document.close()`. This is how
// the happo.io docs site (and other custom integrations that snapshot full
// HTML pages) render their examples. Each `document.write` wipes out the
// `<script id="happo-skipped">` tag injected into iframe.html by `--skip`,
// so these examples exercise the code path that has to read the skip set
// before any rendering happens.
for (const variant of ['one', 'two', 'three', 'four']) {
  happoStatic.registerExample({
    component: 'Page',
    variant,
    render: () => {
      document.open();
      document.write(
        `<!DOCTYPE html><html><body><h1 style="font-family:sans-serif">Page ${variant}</h1></body></html>`,
      );
      document.close();
    },
  });
}
