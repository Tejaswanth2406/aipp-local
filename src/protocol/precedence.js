/**
 * precedence.js — Formal policy precedence and conflict resolution.
 *
 * Implements SPEC.md §6. Priority order:
 *   1 = HARD_BLOCK    — cannot be overridden by anything
 *   2 = EXCEPTION     — user-authorized, scoped, time-bounded
 *   3 = BUNDLED_RULE  — deterministic shipped rules
 *   4 = ML_ADVISORY   — advisory risk score
 *   5 = POLICY_DEFAULT
 *
 * When two BUNDLED rules conflict for the same request at the same priority,
 * the block-preferred policy applies (block wins over allow).
 *
 * @module protocol/precedence
 */

export const TIER = Object.freeze({
  HARD_BLOCK:    1,
  EXCEPTION:     2,
  BUNDLED_RULE:  3,
  ML_ADVISORY:   4,
  POLICY_DEFAULT: 5,
});

/**
 * Resolve a conflict between two rules at the same tier.
 * Block-preferred: if either action is 'block', the result is 'block'.
 *
 * @param {'block'|'allow'} a
 * @param {'block'|'allow'} b
 * @returns {'block'|'allow'}
 */
export function resolveConflict(a, b) {
  return (a === 'block' || b === 'block') ? 'block' : 'allow';
}

/**
 * Given a list of matching rules (all at tier BUNDLED_RULE),
 * return the winning action using block-preferred resolution.
 *
 * @param {{ action: string, id: string }[]} matchingRules
 * @returns {{ action: 'block'|'allow', ruleId: string }}
 */
export function resolveRuleConflicts(matchingRules) {
  if (matchingRules.length === 0) return null;
  // Block-preferred: find the first blocking rule; if none, return first allow.
  const blockRule = matchingRules.find(r => r.action === 'block');
  return blockRule ?? matchingRules[0];
}
