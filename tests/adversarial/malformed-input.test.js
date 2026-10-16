/**
 * tests/adversarial/malformed-input.test.js
 *
 * Validates SEC-08: Malformed inputs rejected in step 1.
 * Returns block on any unrecoverable invalid request schema.
 */

import { initDecisionEngine, evaluateRequest } from '../../src/protocol/decision-engine.js';

describe('Malformed Input Rejection (SEC-08)', () => {
  beforeAll(async () => {
    await initDecisionEngine();
  });

  test('null or undefined request returns block with INVALID_REQUEST', () => {
    const d1 = evaluateRequest(null);
    expect(d1.action).toBe('block');
    expect(d1.reason).toBe('INVALID_REQUEST');

    const d2 = evaluateRequest(undefined);
    expect(d2.action).toBe('block');
    expect(d2.reason).toBe('INVALID_REQUEST');
  });

  test('non-HTTP URL scheme is rejected', () => {
    const d1 = evaluateRequest({ url: 'javascript:alert(1)', originUrl: 'https://example.com', resourceType: 'script' });
    expect(d1.action).toBe('block');
    expect(d1.reason).toBe('INVALID_REQUEST');

    const d2 = evaluateRequest({ url: 'data:text/html,<script></script>', originUrl: 'https://example.com', resourceType: 'script' });
    expect(d2.action).toBe('block');
    expect(d2.reason).toBe('INVALID_REQUEST');
  });

  test('missing or invalid resourceType is rejected', () => {
    const d = evaluateRequest({ url: 'https://example.com/asset.js', originUrl: 'https://example.com', resourceType: 'invalid_type' });
    expect(d.action).toBe('block');
    expect(d.reason).toBe('INVALID_REQUEST');
  });

  test('prototype pollution attempts are safely rejected', () => {
    const malicious = JSON.parse('{"__proto__": {"admin": true}, "url": "https://example.com", "resourceType": "script"}');
    const d = evaluateRequest(malicious);
    expect(d.action).toBe('block');
  });
});
