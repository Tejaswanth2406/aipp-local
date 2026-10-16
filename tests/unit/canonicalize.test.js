/**
 * tests/unit/canonicalize.test.js
 */

import { canonicalize } from '../../src/protocol/canonicalize.js';

test('sorts object keys lexicographically', () => {
  const result = canonicalize({ z: 1, a: 2, m: 3 });
  const str    = new TextDecoder().decode(result);
  expect(str).toBe(`{"a":2,"m":3,"z":1}`);
});

test('sorts recursively', () => {
  const result = canonicalize({ b: { z: 1, a: 2 }, a: 0 });
  const str    = new TextDecoder().decode(result);
  expect(str).toBe(`{"a":0,"b":{"a":2,"z":1}}`);
});

test('arrays preserve order', () => {
  const result = canonicalize([3, 1, 2]);
  const str    = new TextDecoder().decode(result);
  expect(str).toBe(`[3,1,2]`);
});

test('null is handled', () => {
  const result = canonicalize(null);
  const str    = new TextDecoder().decode(result);
  expect(str).toBe('null');
});

test('two canonically identical objects produce identical bytes', () => {
  const a = canonicalize({ x: 1, y: 2 });
  const b = canonicalize({ y: 2, x: 1 });
  expect(a).toEqual(b);
});
