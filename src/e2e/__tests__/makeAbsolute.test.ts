import assert from 'node:assert';
import { describe, it } from 'node:test';

import makeAbsolute from '../makeAbsolute.ts';

const baseUrl = 'https://base.url';

describe('makeAbsolute', () => {
  it('prepends baseUrl if protocol is missing', () => {
    assert.equal(makeAbsolute('/foo.png', baseUrl), 'https://base.url/foo.png');
    assert.equal(
      makeAbsolute('/bar/foo.png', baseUrl),
      'https://base.url/bar/foo.png',
    );
    assert.equal(
      makeAbsolute('bar/foo.png', baseUrl),
      'https://base.url/bar/foo.png',
    );
    assert.equal(
      makeAbsolute('../bar/foo.png', 'http://goo.bar/foo/'),
      'http://goo.bar/bar/foo.png',
    );
    assert.equal(
      makeAbsolute('../bar/foo.png', 'http://goo.bar/foo/test.html?foo=bar'),
      'http://goo.bar/bar/foo.png',
    );
    assert.equal(
      makeAbsolute(
        './bar/foo.png',
        'http://goo.bar/foo/test.html?foo=bar#difference',
      ),
      'http://goo.bar/foo/bar/foo.png',
    );
    assert.equal(
      makeAbsolute('/bar/foo.png', 'http://goo.bar/foo/'),
      'http://goo.bar/bar/foo.png',
    );
    assert.equal(
      makeAbsolute('./foo.png', 'http://goo.bar'),
      'http://goo.bar/foo.png',
    );
    assert.equal(
      makeAbsolute('foo/bar/baz.png', 'http://goo.bar/car/'),
      'http://goo.bar/car/foo/bar/baz.png',
    );
  });

  it('returns absolute URL if protocol is present', () => {
    assert.equal(
      makeAbsolute('http://elsewhere.com/bar.png', baseUrl),
      'http://elsewhere.com/bar.png',
    );
    assert.equal(
      makeAbsolute('https://elsewhere.com/bar.png', baseUrl),
      'https://elsewhere.com/bar.png',
    );
  });

  it('handles relative protocol URLs', () => {
    assert.equal(
      makeAbsolute('//elsewhere.com/bar.png', baseUrl),
      'https://elsewhere.com/bar.png',
    );
  });
});
