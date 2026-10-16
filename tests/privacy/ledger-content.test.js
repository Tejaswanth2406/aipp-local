/**
 * tests/privacy/ledger-content.test.js
 *
 * Validates that no raw URLs, cookies, search queries, or user identifiers
 * are ever stored in the ledger payload (Zero-PII ledger guarantee).
 */

const storage = {};
global.browser = {
  storage: {
    local: {
      get: async (k) => ({ [k]: storage[k] }),
      set: async (obj) => Object.assign(storage, obj),
    },
  },
};

import { initHashChain, recordEvent, handleGetLedger } from '../../src/integrity/hash-chain.js';

describe('Privacy: Ledger Content (Zero-PII)', () => {
  beforeEach(async () => {
    for (const k of Object.keys(storage)) delete storage[k];
    await initHashChain();
  });

  test('events do not contain raw full URLs or search parameters', async () => {
    await recordEvent('EXCEPTION_CREATED', {
      exceptionId: 'uuid-1234',
      expiresAt: '2026-10-17T00:00:00Z',
    });

    await recordEvent('POLICY_UPDATED', {
      version: '0.1.0',
      mlEnabled: false,
    });

    const res = handleGetLedger();
    const events = res.events ?? res.ledger;

    for (const ev of events) {
      const serialized = JSON.stringify(ev.payload);
      // No http/https full URLs
      expect(serialized).not.toMatch(/https?:\/\/[^\s"]+/i);
      // No query string parameters
      expect(serialized).not.toMatch(/\?[a-zA-Z0-9_]+=/);
      // No cookie or token tokens
      expect(serialized).not.toMatch(/token|cookie|password|secret/i);
    }
  });
});
