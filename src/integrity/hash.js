/**
 * hash.js — SHA-256 hashing over canonical byte sequences.
 *
 * Uses the Web Crypto API (crypto.subtle.digest). No MD5 or SHA-1.
 * The algorithm identifier is returned alongside every digest for
 * forward compatibility.
 *
 * @module integrity/hash
 */

export const ALGORITHM = 'SHA-256';

/**
 * Compute a SHA-256 digest of the given bytes.
 * @param {Uint8Array} bytes
 * @returns {Promise<string>} hex-encoded digest prefixed with algorithm
 */
export async function sha256(bytes) {
  const buffer = await crypto.subtle.digest(ALGORITHM, bytes);
  const hex    = Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Compare two digest strings in constant time to avoid timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function digestsEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
