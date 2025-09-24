import { beforeEach, it } from 'node:test';
import assert from 'node:assert';

import { MD5 } from '../md5.ts';

let md5: MD5;

function stringToArray(str: string) {
  let length = str.length,
    buff = new ArrayBuffer(length),
    arr = new Uint8Array(buff),
    i;

  for (i = 0; i < length; i += 1) {
    arr[i] = str.charCodeAt(i);
  }

  return arr;
}

beforeEach(() => {
  md5 = new MD5();
});

it('passes the self test', () => {
  assert.strictEqual(MD5.hashStr('hello'), '5d41402abc4b2a76b9719d911017c592');
});

it('hashes a 64 byte string', () => {
  let str = '5d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c592',
    expectedResult = 'e0b153045b08d59d4e18a98ab823ac42',
    arr = stringToArray(str);

  assert.strictEqual(md5.appendByteArray(arr).end(), expectedResult);

  assert.strictEqual(MD5.hashStr(str), expectedResult);
});

it('hashes a 128 byte string', () => {
  let str =
      '5d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c592',
    expectedResult = 'b12bc24f5507eba4ee27092f70148415',
    arr = stringToArray(str);

  assert.strictEqual(md5.appendByteArray(arr).end(), expectedResult);

  assert.strictEqual(MD5.hashStr(str), expectedResult);
});

it('hashes a 160 byte string', () => {
  let str =
      '5d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c5925d41402abc4b2a765d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c5925d41402abc4b2a76',
    expectedResult = '66a1e6b119bf30ade63378f770e52549',
    arr = stringToArray(str);

  assert.strictEqual(md5.appendByteArray(arr).end(), expectedResult);

  assert.strictEqual(MD5.hashStr(str), expectedResult);
});

it('works incrementally', () => {
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456a234');
  assert.strictEqual(md5.end(), '014d4bbb02c66c98249114dc674a7187');

  md5.start(); // reset
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456a234'));
  assert.strictEqual(md5.end(), '014d4bbb02c66c98249114dc674a7187');

  md5.start();
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a4214565d41402abc4b2a4214565d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456');
  assert.strictEqual(md5.end(), '45762198a57a35c8523915898fb8c68c');

  md5.start();
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  md5.appendByteArray(
    stringToArray('5d41402abc4b2a4214565d41402abc4b2a4214565d41402abc4b2a421456'),
  );
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  assert.strictEqual(md5.end(), '45762198a57a35c8523915898fb8c68c');
});

it('is resumable', () => {
  let result, state;

  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456a234');
  result = md5.end();

  // AppendStr
  md5.start();
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456');
  md5.appendStr('5d41402abc4b2a421456');
  state = md5.getState();

  md5 = new MD5();
  md5.setState(state);
  md5.appendStr('5d41402abc4b2a421456a234');
  assert.strictEqual(md5.end(), result);

  // Append Byte Array
  md5.start();
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456'));
  state = md5.getState();

  md5 = new MD5();
  md5.setState(state);
  md5.appendByteArray(stringToArray('5d41402abc4b2a421456a234'));
  assert.strictEqual(md5.end(), result);
});

it('can handle UTF8 strings', () => {
  let str = 'räksmörgås',
    arr = stringToArray(str);

  assert.strictEqual(
    md5.appendByteArray(arr).end(),
    '09d9d71ec8a8e3bc74e51ebd587154f3',
  );
  assert.strictEqual(MD5.hashAsciiStr(str), '09d9d71ec8a8e3bc74e51ebd587154f3');

  assert.strictEqual(MD5.hashStr(str), 'e462805dcf84413d5eddca45a4b88a5e');

  str = '\u30b9\u3092\u98df';
  arr = stringToArray(str);

  md5 = new MD5();
  assert.strictEqual(
    md5.appendByteArray(arr).end(),
    '4664c02a4cf6b69392f8309b6d6256f5',
  );
  assert.strictEqual(MD5.hashAsciiStr(str), '4664c02a4cf6b69392f8309b6d6256f5');

  assert.strictEqual(MD5.hashStr(str), '453931ab48a4a5af69f3da3c21064fc9');
});
