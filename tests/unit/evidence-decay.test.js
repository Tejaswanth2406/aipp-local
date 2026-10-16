/**
 * tests/unit/evidence-decay.test.js
 */

import { decayWeight, decayEvidenceSet } from '../../src/temporal/evidence-decay.js';

test('decayWeight: at t=0 weight is unchanged', () => {
  expect(decayWeight(1.0, 60_000, 0)).toBeCloseTo(1.0);
});

test('decayWeight: at t=tau weight is ~0.5 (half-life)', () => {
  const tau = 60_000;
  expect(decayWeight(1.0, tau, tau)).toBeCloseTo(0.5, 2);
});

test('decayWeight: at t=2*tau weight is ~0.25', () => {
  const tau = 60_000;
  expect(decayWeight(1.0, tau, 2 * tau)).toBeCloseTo(0.25, 2);
});

test('decayWeight: result is always in [0, 1]', () => {
  for (const t of [0, 1000, 100_000, 1_000_000]) {
    const w = decayWeight(0.8, 30_000, t);
    expect(w).toBeGreaterThanOrEqual(0);
    expect(w).toBeLessThanOrEqual(1);
  }
});

test('decayWeight: throws on non-positive tau', () => {
  expect(() => decayWeight(1.0, 0, 100)).toThrow();
  expect(() => decayWeight(1.0, -1, 100)).toThrow();
});

test('decayEvidenceSet: non-temporal entries unchanged', () => {
  const entries = [{ value: 0.9, weight: 0.9, temporal: false, tau: 60000, recordedAt: 0 }];
  const result  = decayEvidenceSet(entries, 120_000);
  expect(result[0].weight).toBe(0.9);
});

test('decayEvidenceSet: temporal entries are decayed', () => {
  const tau     = 60_000;
  const entries = [{ value: 1.0, weight: 1.0, temporal: true, tau, recordedAt: 0 }];
  const result  = decayEvidenceSet(entries, tau); // one half-life
  expect(result[0].weight).toBeCloseTo(0.5, 2);
});
