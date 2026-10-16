/**
 * tests/offline/decision-engine.test.js
 *
 * Validates SEC-04, SEC-08, SEC-09 under fully offline conditions.
 * All browser APIs are mocked — no network access required.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────

global.browser = {
  storage: { local: { _d: {}, get: async k => ({ [k]: global.browser.storage.local._d[k] }), set: async o => Object.assign(global.browser.storage.local._d, o) } }
};

jest.mock('../../src/integrity/hash-chain.js', () => ({
  recordEvent: jest.fn().mockResolvedValue(undefined),
  initHashChain: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/integrity/artifact-verifier.js', () => ({
  initArtifactVerifier: jest.fn().mockResolvedValue(undefined),
}));

import { initDecisionEngine, evaluateRequest, updatePolicy } from '../../src/protocol/decision-engine.js';

// ── Test data ──────────────────────────────────────────────────────────────

const HARD_RULES = [
  { id: 'hard-001', category: 'CRYPTOMINING', action: 'block', matchPatterns: ['*://*.coinhive.com/*'] },
  { id: 'hard-002', category: 'FINGERPRINTING', action: 'block', matchPatterns: ['*://*.fingerprintjs.com/*'] },
];

const BUNDLED_RULES = [
  { id: 'rule-001', priority: 100, action: 'block', matchPatterns: ['*://www.google-analytics.com/*'] },
  { id: 'rule-002', priority: 100, action: 'block', matchPatterns: ['*://*.doubleclick.net/*'] },
];

const validReq = (url, resourceType = 'script') => ({
  url, originUrl: 'https://example.com/', resourceType,
});

const MAX_RISK = { riskScore: 1.0, modelId: 'tracker-v1', evidenceCodes: ['TRACKER'], inferenceTimeMs: 10 };

// ── Setup ──────────────────────────────────────────────────────────────────

beforeEach(async () => {
  global.browser.storage.local._d = {};
  await initDecisionEngine();
  updatePolicy({ hardRules: HARD_RULES, bundledRules: BUNDLED_RULES });
});

// ── SEC-01: Offline operation ──────────────────────────────────────────────

test('SEC-01: engine evaluates without any network access', () => {
  const d = evaluateRequest(validReq('https://www.google-analytics.com/collect'), null);
  expect(d.protocol).toBe('AIPP');
  expect(['block', 'allow']).toContain(d.action);
});

// ── SEC-04: ML cannot override hard rules ─────────────────────────────────

test('SEC-04: max-risk ML score cannot unblock a hard-blocked URL', () => {
  updatePolicy({ hardRules: HARD_RULES, bundledRules: BUNDLED_RULES, mlEnabled: true });
  const d = evaluateRequest(validReq('https://www.coinhive.com/lib/coinhive.min.js'), MAX_RISK);
  expect(d.action).toBe('block');
  expect(d.reason).toBe('HARD_RULE_MATCH');
});

test('SEC-04: ML result is ignored for hard-blocked requests (null risk)', () => {
  const d = evaluateRequest(validReq('https://sub.coinhive.com/miner.js'), null);
  expect(d.action).toBe('block');
  expect(d.reason).toBe('HARD_RULE_MATCH');
});

test('SEC-04: ML step only reached when steps 1-4 all pass through', () => {
  // A URL not matching any rule — ML is advisory only
  updatePolicy({ hardRules: HARD_RULES, bundledRules: BUNDLED_RULES, mlEnabled: true });
  const d = evaluateRequest(validReq('https://clean-site.example.com/asset.js'), MAX_RISK);
  // Either ML blocks it OR policy default does — both are valid. Key: not HARD_RULE_MATCH.
  expect(d.reason).not.toBe('HARD_RULE_MATCH');
  expect(d.reason).not.toBe('AUTHORIZED_EXCEPTION');
  expect(d.reason).not.toBe('BUNDLED_RULE_MATCH');
});

// ── SEC-08: Fail closed ────────────────────────────────────────────────────

test('SEC-08: malformed request is blocked, not allowed', () => {
  const d = evaluateRequest({ url: null, resourceType: 'script', originUrl: 'https://x.com' }, null);
  expect(d.action).toBe('block');
  expect(d.reason).toBe('INVALID_REQUEST');
});

test('SEC-08: oversized URL is blocked', () => {
  const d = evaluateRequest(validReq('https://' + 'a'.repeat(2100) + '.com/'), null);
  expect(d.action).toBe('block');
});

test('SEC-08: unknown resourceType is blocked', () => {
  const d = evaluateRequest({ url: 'https://example.com/f', originUrl: 'https://x.com', resourceType: 'evil' }, null);
  expect(d.action).toBe('block');
});

test('SEC-08: non-http scheme is blocked', () => {
  const d = evaluateRequest({ url: 'ftp://example.com/file', originUrl: 'https://x.com', resourceType: 'other' }, null);
  expect(d.action).toBe('block');
});

// ── SEC-09: Exception cannot cover a hard-block URL ───────────────────────

test('SEC-09: exception for hard-blocked origin is suppressed', () => {
  // Inject an exception that matches a hard-blocked URL.
  const future = new Date(Date.now() + 3_600_000).toISOString();
  global.browser.storage.local._d['aipp.exceptions'] = [{
    id:           'exc-001',
    createdAt:    new Date().toISOString(),
    expiresAt:    future,
    scope:        { origin: 'https://www.coinhive.com', resourceTypes: ['script'] },
    authorizedBy: 'USER_EXPLICIT',
    reason:       'test',
  }];

  // Re-init to load the exception from storage.
  return initDecisionEngine().then(() => {
    updatePolicy({ hardRules: HARD_RULES, bundledRules: BUNDLED_RULES });
    const d = evaluateRequest(validReq('https://www.coinhive.com/lib/coinhive.min.js'), null);
    expect(d.action).toBe('block');
    expect(d.reason).toBe('HARD_RULE_MATCH');
  });
});

test('SEC-09: expired exception is not applied', async () => {
  const past = new Date(Date.now() - 1000).toISOString();
  global.browser.storage.local._d['aipp.exceptions'] = [{
    id: 'exc-002', createdAt: past, expiresAt: past,
    scope: { origin: 'https://www.google-analytics.com', resourceTypes: ['script'] },
    authorizedBy: 'USER_EXPLICIT', reason: 'test',
  }];
  await initDecisionEngine();
  updatePolicy({ hardRules: HARD_RULES, bundledRules: BUNDLED_RULES });

  const d = evaluateRequest(validReq('https://www.google-analytics.com/collect'), null);
  // Should be blocked by bundled rule, not allowed by expired exception.
  expect(d.action).toBe('block');
  expect(d.reason).toBe('BUNDLED_RULE_MATCH');
});

// ── Bundled rule matching ──────────────────────────────────────────────────

test('BUNDLED: blocks known tracker', () => {
  const d = evaluateRequest(validReq('https://www.google-analytics.com/collect'), null);
  expect(d.action).toBe('block');
  expect(d.reason).toBe('BUNDLED_RULE_MATCH');
  expect(d.context.ruleId).toBe('rule-001');
});

test('BUNDLED: blocks doubleclick subdomain', () => {
  const d = evaluateRequest(validReq('https://ad.doubleclick.net/ddm/ad'), null);
  expect(d.action).toBe('block');
  expect(d.reason).toBe('BUNDLED_RULE_MATCH');
});

test('BUNDLED: clean URL reaches policy default', () => {
  const d = evaluateRequest(validReq('https://safe-cdn.example.com/lib.js'), null);
  expect(d.reason).toBe('POLICY_DEFAULT');
});

// ── Decision record invariants ────────────────────────────────────────────

test('decision record always has protocol=AIPP', () => {
  const d = evaluateRequest(validReq('https://anything.example.com/'), null);
  expect(d.protocol).toBe('AIPP');
  expect(d.version).toBe('0.1.0');
  expect(typeof d.timestamp).toBe('number');
});

test('decision record is frozen (immutable)', () => {
  const d = evaluateRequest(validReq('https://anything.example.com/'), null);
  expect(() => { d.action = 'allow'; }).toThrow();
});
