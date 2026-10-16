/**
 * tests/adversarial/ml-override.test.js
 *
 * SEC-04: A maximum-risk ML score must never convert a hard-block decision
 * into an allow.
 *
 * These tests must pass with network access disabled.
 */

import { evaluateRequest, initDecisionEngine } from '../../src/protocol/decision-engine.js';

beforeAll(async () => {
  await initDecisionEngine();
});

const HARD_BLOCKED_REQUEST = {
  url:          'https://www.coinhive.com/lib/coinhive.min.js',
  originUrl:    'https://evil.example.com/',
  resourceType: 'script',
};

const MAX_RISK = {
  riskScore:       1.0,
  modelId:         'tracker-v1',
  evidenceCodes:   ['KNOWN_TRACKER'],
  inferenceTimeMs: 10,
};

test('hard block is not overridden by maximum ML risk score', async () => {
  // TODO(milestone-02): Once matchHardRule is implemented, this test will
  // verify that HARD_BLOCKED_REQUEST results in action:"block" even when
  // risk.riskScore === 1.0 and policy.mlEnabled === true.
  // Stub: decision engine always returns block for POLICY_UNAVAILABLE or
  // POLICY_DEFAULT in the current skeleton.
  const decision = evaluateRequest(HARD_BLOCKED_REQUEST, MAX_RISK);
  expect(decision.action).toBe('block');
  expect(decision.protocol).toBe('AIPP');
});

test('decision engine returns block when ML returns null', () => {
  const decision = evaluateRequest(HARD_BLOCKED_REQUEST, null);
  expect(decision.action).toBe('block');
});

test('decision returns block on malformed request regardless of ML score', () => {
  const decision = evaluateRequest({ url: null, resourceType: 'script' }, MAX_RISK);
  expect(decision.action).toBe('block');
  expect(decision.reason).toBe('INVALID_REQUEST');
});
