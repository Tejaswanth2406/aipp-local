/**
 * lifecycle.js — Extension lifecycle event handlers.
 *
 * Handles install, update, suspend, and wakeup events.
 * Records lifecycle events in the ledger.
 *
 * @module background/lifecycle
 */

import { recordEvent } from '../integrity/hash-chain.js';

/**
 * Called on extension install or update.
 * @param {object} details - { reason: 'install' | 'update', previousVersion? }
 */
export async function onInstalled(details) {
  if (details.reason === 'install') {
    await recordEvent('LEDGER_INITIALIZED', { reason: 'FRESH_INSTALL' });
  } else if (details.reason === 'update') {
    await recordEvent('POLICY_VERSION_CHANGED', {
      reasonCode: 'EXTENSION_UPDATED',
      previousVersion: details.previousVersion,
    });
  }
}

browser.runtime.onInstalled.addListener(onInstalled);
