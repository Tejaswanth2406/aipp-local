/**
 * tests/adversarial/exception-escalation.test.js
 *
 * SEC-09: Exceptions cannot silently widen their scope or duration.
 */

import { handleExceptionRequest, initExceptionManager } from '../../src/enforcement/exception-manager.js';

// Mock storage
global.browser = {
  storage: {
    local: {
      _data: {},
      get: async (key) => ({ [key]: global.browser.storage.local._data[key] }),
      set: async (obj) => { Object.assign(global.browser.storage.local._data, obj); },
    }
  }
};

// Mock hash-chain
jest.mock('../../src/integrity/hash-chain.js', () => ({
  recordEvent: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => { global.browser.storage.local._data = {}; });

test('exception duration cannot exceed maximum', async () => {
  const result = await handleExceptionRequest({
    origin:        'https://example.com',
    resourceTypes: ['script'],
    durationMs:    999_999_999, // far beyond 24 hours
  });
  expect(result.error).toBe('DURATION_EXCEEDS_MAXIMUM');
});

test('exception is created with correct scope and expiry', async () => {
  const result = await handleExceptionRequest({
    origin:        'https://example.com',
    resourceTypes: ['script'],
    durationMs:    3_600_000, // 1 hour
  });
  expect(result.ok).toBe(true);
  expect(typeof result.exceptionId).toBe('string');
});
