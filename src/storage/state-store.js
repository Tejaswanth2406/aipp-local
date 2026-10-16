/**
 * state-store.js — The sole interface to browser.storage.local.
 *
 * All storage reads and writes go through this module.
 * Raw URLs, cookies, page contents, and PII must never be written.
 *
 * SEC-06: Storage keys have declared size limits; writes that would
 * exceed them are rejected before being submitted to the storage API.
 *
 * @module storage/state-store
 */

import { recordEvent } from '../integrity/hash-chain.js';

const KEY_LIMITS = {
  'aipp.policy':             64  * 1024,
  'aipp.ledger':             2   * 1024 * 1024,
  'aipp.exceptions':         256 * 1024,
  'aipp.state.version':      1   * 1024,
  'aipp.artifacts.manifest': 64  * 1024,
};

export async function initStateStore() {
  const stored = await browser.storage.local.get('aipp.state.version');
  if (!stored['aipp.state.version']) {
    await browser.storage.local.set({ 'aipp.state.version': 1 });
  }
}

/**
 * Read a value from storage.
 * @param {string} key
 * @returns {Promise<unknown>}
 */
export async function readKey(key) {
  assertKnownKey(key);
  const result = await browser.storage.local.get(key);
  return result[key] ?? null;
}

/**
 * Write a value to storage, enforcing the declared size limit.
 * @param {string} key
 * @param {unknown} value
 */
export async function writeKey(key, value) {
  assertKnownKey(key);
  const serialized = JSON.stringify(value);
  const limit      = KEY_LIMITS[key];
  if (serialized.length > limit) {
    throw new Error(`Storage write rejected: ${key} would exceed ${limit} byte limit`);
  }
  await browser.storage.local.set({ [key]: value });
}

/**
 * Handle a policy.resetAll message from settings UI.
 * Wipes all aipp.* keys and reinitializes.
 */
export async function handleResetRequest() {
  const allKeys = Object.keys(KEY_LIMITS);
  await browser.storage.local.remove(allKeys);
  await initStateStore();
  // Note: recordEvent is called by hash-chain after this; the chain will
  // re-initialize on its next access.
  return { ok: true };
}

function assertKnownKey(key) {
  if (!Object.prototype.hasOwnProperty.call(KEY_LIMITS, key)) {
    throw new Error(`Unknown storage key: ${key}`);
  }
}
