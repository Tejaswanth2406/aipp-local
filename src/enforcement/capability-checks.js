/**
 * capability-checks.js — Runtime capability assertions.
 *
 * Verifies that required browser APIs are available before use.
 * Returns a structured capability report used by bootstrap.js.
 *
 * @module enforcement/capability-checks
 */

/**
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function checkCapabilities() {
  const missing = [];

  if (typeof browser === 'undefined')                          missing.push('browser API');
  if (!browser?.declarativeNetRequest)                         missing.push('declarativeNetRequest');
  if (!browser?.declarativeNetRequest?.updateDynamicRules)     missing.push('updateDynamicRules');
  if (!browser?.declarativeNetRequest?.updateSessionRules)     missing.push('updateSessionRules');
  if (!browser?.storage?.local)                                missing.push('storage.local');
  if (!browser?.alarms)                                        missing.push('alarms');
  if (!crypto?.subtle)                                         missing.push('crypto.subtle');
  if (!crypto?.randomUUID)                                     missing.push('crypto.randomUUID');

  return { ok: missing.length === 0, missing };
}
