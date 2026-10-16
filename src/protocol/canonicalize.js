/**
 * canonicalize.js — Deterministic JSON serialization for integrity hashing.
 *
 * Canonical form:
 *   1. Sort all object keys lexicographically (recursive).
 *   2. Strip all whitespace.
 *   3. Encode as UTF-8.
 *
 * The output of canonicalize() is the input to the SHA-256 hash function.
 * This module must have no side effects and must not perform I/O.
 *
 * @module protocol/canonicalize
 */

/**
 * Produce the canonical UTF-8 byte representation of a JSON-serializable value.
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function canonicalize(value) {
  const sorted = sortDeep(value);
  const json   = JSON.stringify(sorted);
  return new TextEncoder().encode(json);
}

/**
 * Recursively sort object keys. Arrays preserve order. Primitives are returned as-is.
 * @param {unknown} value
 * @returns {unknown}
 */
function sortDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortDeep);

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(k => [k, sortDeep(value[k])])
  );
}
