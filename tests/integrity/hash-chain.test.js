/**
 * tests/integrity/hash-chain.test.js
 *
 * Validates SEC-07: Ledger detects corruption, gaps, and broken hash links.
 * Integrity failures are surfaced and never silently repaired.
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

import { initHashChain, recordEvent, handleGetLedger, handleVerifyIntegrity } from '../../src/integrity/hash-chain.js';

describe('Hash Chain Integrity (SEC-07)', () => {
  beforeEach(async () => {
    for (const k of Object.keys(storage)) delete storage[k];
    await initHashChain();
  });

  test('valid chain passes full verification', async () => {
    await recordEvent('EVENT_A', { val: 1 });
    await recordEvent('EVENT_B', { val: 2 });
    await recordEvent('EVENT_C', { val: 3 });

    const check = await handleVerifyIntegrity();
    expect(check.valid).toBe(true);
    expect(check.length).toBe(3);
    expect(check.errors.length).toBe(0);
  });

  test('tampered payload is detected by verifyIntegrity', async () => {
    await recordEvent('EVENT_A', { val: 1 });
    await recordEvent('EVENT_B', { val: 2 });

    const res = handleGetLedger();
    const events = res.events ?? res.ledger;

    // Tamper with event payload in storage
    events[0].payload.val = 999;

    const check = await handleVerifyIntegrity();
    expect(check.valid).toBe(false);
    expect(check.errors.some(e => e.includes('Digest mismatch'))).toBe(true);
  });

  test('sequence gap triggers INTEGRITY_FAILURE upon chain check', async () => {
    await recordEvent('EVENT_1', { step: 1 });
    await recordEvent('EVENT_2', { step: 2 });

    const res = handleGetLedger();
    const events = res.events ?? res.ledger;

    // Introduce sequence jump
    events[1].sequence = 5;

    const check = await handleVerifyIntegrity();
    expect(check.valid).toBe(false);
    expect(check.errors.some(e => e.includes('gap'))).toBe(true);
  });
});
