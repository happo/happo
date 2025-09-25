import assert from 'node:assert';
import { describe, it } from 'node:test';

import { findCSSAssetUrls } from '../findCSSAssetUrls.ts';

describe('findCSSAssetUrls', () => {
  it('finds asset urls in CSS', () => {
    assert.deepEqual(
      findCSSAssetUrls(
        `
        .foo {
          background-image: url("/bar.png");
        }
        @font-face {
          font-family: "MyFont";
          src: url('/fonts/myfont.woff2') format("woff2"),
                 url(/fonts/myfont.woff) format("woff");
        }
        .ignore {
          background: url(data:image/png;base64,asdfasdfasfd);
        }
      `.trim(),
      ),
      ['/bar.png', '/fonts/myfont.woff2', '/fonts/myfont.woff'],
    );
  });
});
