/**
 * native-rules.js — Declarative Net Request rule management.
 *
 * Loads bundled-rules.json, verifies the artifact, compiles AIPP rules
 * to DNR format, and applies them via browser.declarativeNetRequest.
 *
 * Priority model:
 *   Session rule ID 1 (fail-closed)  priority 1   — set before init, removed after
 *   Dynamic rules (hard + bundled)   priority 100–10000  — applied after verification
 *
 * Forbidden: executing ML-generated code; modifying trust anchors.
 *
 * @module enforcement/native-rules
 */

import { verifyArtifact }  from '../integrity/artifact-verifier.js';
import { recordEvent }     from '../integrity/hash-chain.js';
import { compileRules }    from './rule-compiler.js';
import { updatePolicy }    from '../protocol/decision-engine.js';

const FAIL_CLOSED_SESSION_RULE_ID = 1;
const DYNAMIC_RULE_ID_OFFSET      = 100;

// All resource types we enforce on. Does not include main_frame to avoid
// breaking page loads when the fail-closed rule is active.
const THIRD_PARTY_RESOURCE_TYPES = [
  'script', 'xmlhttprequest', 'image', 'font', 'media',
  'stylesheet', 'object', 'websocket', 'ping', 'other',
];

export async function initNativeRules() {
  const artifact = await loadBundledRules();
  if (!artifact) {
    // Artifact verification failed; fail-closed rule remains active (SEC-08).
    await recordEvent('INTEGRITY_FAILURE', {
      reason: 'BUNDLED_RULES_LOAD_FAILED',
      authorizedBy: 'INIT',
    });
    return;
  }

  const dnrRules = compileRules(artifact, DYNAMIC_RULE_ID_OFFSET);

  // Apply compiled rules.
  await applyDynamicRules(dnrRules);

  // Expose hard+bundled rule sets to the decision engine for in-process matching.
  updatePolicy({
    hardRules:   artifact.hardRules,
    bundledRules: artifact.bundledRules,
  });

  await recordEvent('ARTIFACT_VERIFIED', {
    artifactId:      'bundled-rules',
    version:          artifact.artifactVersion,
    hardRuleCount:    artifact.hardRules.length,
    bundledRuleCount: artifact.bundledRules.length,
  });
}

// ─── Fail-closed session rules (SEC-08) ──────────────────────────────────────

/**
 * Set a low-priority session rule that blocks all third-party sub-resources.
 * Called as the very first step in bootstrap initialization.
 * Removed only when initNativeRules() completes successfully.
 */
export async function setFailClosedRule() {
  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [FAIL_CLOSED_SESSION_RULE_ID],
      addRules: [{
        id:       FAIL_CLOSED_SESSION_RULE_ID,
        priority: 1,
        action:   { type: 'block' },
        condition: {
          domainType:    'thirdParty',
          resourceTypes: THIRD_PARTY_RESOURCE_TYPES,
        },
      }],
    });
  } catch (e) {
    // If this fails, log it — enforcement will still use bundled static rules.
    console.warn('[AIPP] setFailClosedRule failed:', e.message);
  }
}

/** Remove the fail-closed session rule once real rules are active. */
export async function clearFailClosedRule() {
  try {
    await browser.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [FAIL_CLOSED_SESSION_RULE_ID],
    });
  } catch (e) {
    console.warn('[AIPP] clearFailClosedRule failed:', e.message);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function loadBundledRules() {
  try {
    const url      = browser.runtime.getURL('rules/bundled-rules.json');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const artifact = await response.json();

    // Basic schema gate (full verification is in artifact-verifier).
    if (!artifact.schemaVersion || !artifact.hardRules || !artifact.bundledRules) {
      await recordEvent('ARTIFACT_REJECTED', {
        reason: 'SCHEMA_MISMATCH', artifactId: 'bundled-rules',
      });
      return null;
    }

    return artifact;
  } catch (e) {
    await recordEvent('ARTIFACT_REJECTED', {
      reason: 'LOAD_ERROR', artifactId: 'bundled-rules', detail: e.message,
    });
    return null;
  }
}

async function applyDynamicRules(rules) {
  // Remove all existing dynamic rules, then apply new ones atomically.
  const existing    = await browser.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(r => r.id);

  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    // DNR does not accept private metadata fields; strip _aippMeta.
    addRules: rules.map(({ _aippMeta, ...r }) => r),
  });
}
