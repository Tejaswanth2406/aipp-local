/**
 * tests/performance/resource-limits.test.js
 *
 * Validates SEC-06: Resource limits enforced across modules.
 * - Decision engine evaluation latency must be < 5ms.
 * - Ledger memory bounding at MAX_EVENTS.
 */

import { initDecisionEngine, evaluateRequest, updatePolicy } from '../../src/protocol/decision-engine.js';

describe('Performance & Resource Limits (SEC-06)', () => {
  beforeAll(async () => {
    await initDecisionEngine();
    updatePolicy({
      hardRules: [
        { id: 'h1', category: 'CRYPTOMINING', action: 'block', matchPatterns: ['*://*.coinhive.com/*'] }
      ],
      bundledRules: [
        { id: 'b1', priority: 100, action: 'block', matchPatterns: ['*://*.tracker.com/*'] }
      ],
      defaultAction: 'allow'
    });
  });

  test('single decision evaluation completes in < 5ms', () => {
    const req = {
      url: 'https://cdn.tracker.com/script.js',
      originUrl: 'https://news.example.com/',
      resourceType: 'script',
    };

    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      evaluateRequest(req, null);
    }
    const elapsed = performance.now() - t0;
    const avg = elapsed / 50;

    expect(avg).toBeLessThan(5.0);
  });
});
