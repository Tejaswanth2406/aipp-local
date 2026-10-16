/**
 * monotonic-clock.js — Session-scoped monotonic elapsed time.
 *
 * Uses performance.now() which is monotonic within a session and
 * unaffected by OS clock adjustments. Wall-clock time is acknowledged
 * as non-tamper-proof and is used only for expiresAt fields.
 *
 * After a browser restart, clock uncertainty is explicitly acknowledged:
 * evidence older than policy.clockUncertaintyWindowMs is re-validated.
 *
 * @module temporal/monotonic-clock
 */

const _startedAt = performance.now();

/** Elapsed milliseconds since extension startup. */
export function elapsedMs() {
  return performance.now() - _startedAt;
}

/**
 * Determine whether evidence recorded at `recordedElapsedMs` is within
 * the trust window for this session.
 *
 * @param {number} recordedElapsedMs
 * @param {number} clockUncertaintyWindowMs
 * @returns {boolean}
 */
export function isWithinTrustWindow(recordedElapsedMs, clockUncertaintyWindowMs) {
  const current = elapsedMs();
  // Evidence must have been recorded in this session (positive elapsed time)
  // and must not be older than the uncertainty window.
  return recordedElapsedMs >= 0 && (current - recordedElapsedMs) <= clockUncertaintyWindowMs;
}
