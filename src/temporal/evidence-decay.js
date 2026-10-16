/**
 * evidence-decay.js — Exponential decay for time-sensitive evidence weights.
 *
 * Decay applies only to evidence types marked temporal:true in the policy.
 * Permanent rules, trust anchors, and hard-block categories are never
 * subject to decay.
 *
 * w(t) = w0 * e^(-lambda * delta_t)
 * lambda = ln(2) / tau   (tau = half-life in ms)
 *
 * @module temporal/evidence-decay
 */

const LN2 = Math.LN2;

/**
 * Compute a decayed weight.
 * @param {number} w0         — initial weight (0.0–1.0)
 * @param {number} tau        — half-life in milliseconds
 * @param {number} elapsedMs  — elapsed monotonic time in milliseconds
 * @returns {number}          — decayed weight in [0.0, 1.0]
 */
export function decayWeight(w0, tau, elapsedMs) {
  if (tau <= 0) throw new Error('tau must be positive');
  if (elapsedMs < 0) elapsedMs = 0;
  const lambda = LN2 / tau;
  return Math.max(0, Math.min(1, w0 * Math.exp(-lambda * elapsedMs)));
}

/**
 * Decay all temporal evidence entries in a feature set.
 * Non-temporal entries are returned unchanged.
 *
 * @param {object[]} evidenceEntries — [{ value, weight, tau, recordedAt, temporal }]
 * @param {number}   nowMs           — current monotonic time (performance.now())
 * @returns {object[]}
 */
export function decayEvidenceSet(evidenceEntries, nowMs) {
  return evidenceEntries.map(entry => {
    if (!entry.temporal) return entry;
    const elapsedMs = Math.max(0, nowMs - entry.recordedAt);
    return { ...entry, weight: decayWeight(entry.weight, entry.tau, elapsedMs) };
  });
}
