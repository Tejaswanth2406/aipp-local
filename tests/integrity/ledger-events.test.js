/**
 * tests/integrity/ledger-events.test.js
 *
 * Validates SEC-03: Every policy write and exception change triggers a ledger event.
 */

// Mock browser storage
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

describe('Ledger Events (SEC-03)', () => {
  beforeEach(async () => {
    for (const k of Object.keys(storage)) delete storage[k];
    await initHashChain();
  });

  test('recording a policy change creates a verifiable chained event', async () => {
    await recordEvent('POLICY_UPDATED', {
      version: '0.1.0',
      mlEnabled: false,
    });

    const res = handleGetLedger();
    const events = res.events ?? res.ledger;
    expect(events.length).toBe(1);

    const first = events[0];
    expect(first.sequence).toBe(0);
    expect(first.previousHash).toBe('GENESIS');
    expect(first.eventType).toBe('POLICY_UPDATED');
    expect(typeof first.eventDigest).toBe('string');
    expect(first.eventDigest.length).toBe(64);
  });

  test('subsequent events link to prior block eventDigest', async () => {
    await recordEvent('POLICY_UPDATED', { version: '0.1.0' });
    await recordEvent('EXCEPTION_CREATED', { exceptionId: 'exc-1', expiresAt: '2026-10-17T00:00:00Z' });

    const res = handleGetLedger();
    const events = res.events ?? res.ledger;
    expect(events.length).toBe(2);

    expect(events[1].sequence).toBe(1);
    expect(events[1].previousHash).toBe(events[0].eventDigest);
  });
});
