/**
 * exception-manager.js — Scoped, time-bounded exception lifecycle.
 *
 * Exceptions may not be wildcarded (v0.1). They cannot cover hard-block rules.
 * All creation, expiry, and suppression events are recorded in the ledger (SEC-09).
 *
 * @module enforcement/exception-manager
 */

import { recordEvent } from '../integrity/hash-chain.js';
import { readKey, writeKey } from '../storage/state-store.js';
import { handleGetPolicy } from '../protocol/decision-engine.js';

const STORAGE_KEY = 'aipp.exceptions';
const MAX_DURATION_MS = 86_400_000; // 24 hours

export async function initExceptionManager() {
  await purgeExpiredInternal();
}

/**
 * Handle a policy.requestException message from the UI.
 * @param {{ origin: string, resourceTypes: string[], durationMs: number, reason?: string }} payload
 */
export async function handleExceptionRequest(payload) {
  const { origin, resourceTypes, durationMs } = payload;

  if (durationMs > MAX_DURATION_MS) {
    return { error: 'DURATION_EXCEEDS_MAXIMUM', maxMs: MAX_DURATION_MS };
  }

  // Check that the origin does not match any hard-block rule (SEC-09).
  const policyRes = handleGetPolicy();
  const hardRules = policyRes?.policy?.hardRules ?? [];
  const normalizedOrigin = origin.toLowerCase();

  for (const hr of hardRules) {
    for (const pat of hr.matchPatterns ?? []) {
      const patClean = pat.replace(/\*/g, '').replace('://', '').toLowerCase();
      if (normalizedOrigin.includes(patClean) || patClean.includes(normalizedOrigin)) {
        return { error: 'HARD_RULE_CONFLICT', ruleId: hr.id };
      }
    }
  }

  const now = Date.now();
  const exception = {
    id:           crypto.randomUUID(),
    createdAt:    new Date(now).toISOString(),
    expiresAt:    new Date(now + durationMs).toISOString(),
    scope:        { origin, resourceTypes },
    authorizedBy: 'USER_EXPLICIT',
    reason:       payload.reason ?? '',
  };

  // Persist and record.
  const existing = await readKey(STORAGE_KEY) ?? [];
  existing.push(exception);
  await writeKey(STORAGE_KEY, existing);

  await recordEvent('EXCEPTION_CREATED', {
    exceptionId: exception.id,
    expiresAt:   exception.expiresAt,
  });

  return { ok: true, exceptionId: exception.id };
}

/**
 * Revoke an existing exception by ID.
 * @param {{ exceptionId: string }} payload
 */
export async function handleRevokeException(payload) {
  const { exceptionId } = payload;
  const existing = await readKey(STORAGE_KEY) ?? [];
  const filtered = existing.filter(e => e.id !== exceptionId);

  if (filtered.length === existing.length) {
    return { error: 'EXCEPTION_NOT_FOUND' };
  }

  await writeKey(STORAGE_KEY, filtered);
  await recordEvent('EXCEPTION_REVOKED', { exceptionId });
  return { success: true };
}

/**
 * Purge all expired exceptions.
 */
export async function handlePurgeExpired() {
  const count = await purgeExpiredInternal();
  return { success: true, purgedCount: count };
}

async function purgeExpiredInternal() {
  const now = Date.now();
  const existing = await readKey(STORAGE_KEY) ?? [];
  const active = [];
  let purgedCount = 0;

  for (const exc of existing) {
    if (new Date(exc.expiresAt).getTime() > now) {
      active.push(exc);
    } else {
      purgedCount++;
    }
  }

  if (purgedCount > 0) {
    await writeKey(STORAGE_KEY, active);
    await recordEvent('EXCEPTIONS_PURGED', { purgedCount });
  }

  return purgedCount;
}

/**
 * Return all active exceptions.
 */
export async function handleGetExceptions() {
  const existing = await readKey(STORAGE_KEY) ?? [];
  const now = Date.now();
  return { exceptions: existing.filter(e => new Date(e.expiresAt).getTime() > now) };
}
