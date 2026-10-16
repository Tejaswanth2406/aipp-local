/**
 * tests/unit/schema.test.js
 */

import { validateRequest, validateRiskEstimate } from '../../src/protocol/schema.js';

describe('validateRequest', () => {
  const valid = { url: 'https://example.com/img.png', originUrl: 'https://origin.com/', resourceType: 'image' };

  test('accepts a valid request', () => {
    expect(validateRequest(valid).valid).toBe(true);
  });

  test('rejects null', () => {
    expect(validateRequest(null).valid).toBe(false);
  });

  test('rejects non-http scheme', () => {
    expect(validateRequest({ ...valid, url: 'ftp://example.com/' }).valid).toBe(false);
  });

  test('rejects oversized URL', () => {
    expect(validateRequest({ ...valid, url: 'https://' + 'a'.repeat(2050) }).valid).toBe(false);
  });

  test('rejects unknown resourceType', () => {
    expect(validateRequest({ ...valid, resourceType: 'evil_type' }).valid).toBe(false);
  });
});

describe('validateRiskEstimate', () => {
  const valid = { riskScore: 0.5, modelId: 'tracker-v1', evidenceCodes: [], inferenceTimeMs: 10 };

  test('accepts a valid estimate', () => {
    expect(validateRiskEstimate(valid).valid).toBe(true);
  });

  test('rejects riskScore > 1', () => {
    expect(validateRiskEstimate({ ...valid, riskScore: 1.5 }).valid).toBe(false);
  });

  test('rejects riskScore < 0', () => {
    expect(validateRiskEstimate({ ...valid, riskScore: -0.1 }).valid).toBe(false);
  });

  test('rejects more than 10 evidenceCodes', () => {
    const codes = new Array(11).fill('CODE');
    expect(validateRiskEstimate({ ...valid, evidenceCodes: codes }).valid).toBe(false);
  });
});
