/**
 * bootstrap.js — AIPP Local background entry point.
 *
 * Initialization order is strictly defined. The fail-closed session rule
 * is active before any module loads and is only removed when enforcement
 * is fully ready. A startup timeout ensures we never hang silently.
 *
 * SEC-08: If initialization fails, the fail-closed session rule remains
 * active. The badge shows an error indicator.
 *
 * @module background/bootstrap
 */

import { initStateStore }        from '../storage/state-store.js';
import { initMigrations }        from '../storage/migrations.js';
import { initHashChain, recordEvent } from '../integrity/hash-chain.js';
import { initArtifactVerifier }  from '../integrity/artifact-verifier.js';
import { setFailClosedRule, clearFailClosedRule, initNativeRules } from '../enforcement/native-rules.js';
import { initDecisionEngine }    from '../protocol/decision-engine.js';
import { initExceptionManager }  from '../enforcement/exception-manager.js';
import { initExpiryManager }     from '../temporal/expiry-manager.js';
import { initRetention }         from '../storage/retention.js';
import { registerRoutes }        from './message-router.js';
import { onInstalled }           from './lifecycle.js';
import { checkCapabilities }     from '../enforcement/capability-checks.js';

const STARTUP_TIMEOUT_MS = 15_000;

async function initialize() {
  // ── 1. Capability check ──────────────────────────────────────────────────
  const caps = checkCapabilities();
  if (!caps.ok) {
    throw new Error(`Missing browser APIs: ${caps.missing.join(', ')}`);
  }

  // ── 2. Fail-closed rule — MUST be first (SEC-08) ─────────────────────────
  await setFailClosedRule();

  // ── 3. Persistent state + migrations ─────────────────────────────────────
  await initStateStore();
  await initMigrations();

  // ── 4. Integrity chain — before any policy is loaded ─────────────────────
  await initHashChain();

  // ── 5. Artifact verification ──────────────────────────────────────────────
  await initArtifactVerifier();

  // ── 6. Enforcement — loads, verifies, and applies bundled rules ───────────
  await initNativeRules();
  await initDecisionEngine();

  // ── 7. Exception + expiry management ─────────────────────────────────────
  await initExceptionManager();
  await initExpiryManager();
  initRetention();

  // ── 8. Message routing (SEC-07) ───────────────────────────────────────────
  registerRoutes();

  // ── 9. Remove fail-closed — enforcement is ready ─────────────────────────
  await clearFailClosedRule();

  // ── 10. Record successful startup ─────────────────────────────────────────
  await recordEvent('EXTENSION_STARTED', { capsOk: true });

  // Clear error badge if any.
  await browser.action.setBadgeText({ text: '' });
}

// ─── Startup with timeout ────────────────────────────────────────────────────

const initTimeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('AIPP initialization timed out')), STARTUP_TIMEOUT_MS)
);

Promise.race([initialize(), initTimeout]).catch(async (err) => {
  console.error('[AIPP] Startup failed:', err.message);
  // SEC-08: Fail-closed rule remains active. Show error badge.
  try {
    await browser.action.setBadgeText({ text: '!' });
    await browser.action.setBadgeBackgroundColor({ color: '#c0392b' });
  } catch { /* badge API may not be available in all contexts */ }
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────
browser.runtime.onInstalled.addListener(onInstalled);
