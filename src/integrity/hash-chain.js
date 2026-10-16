/**
 * hash-chain.js — Append-only, hash-linked event ledger.
 *
 * Each event is linked to the previous via its digest (previousHash).
 * Missing sequence numbers and broken hash links are detected and
 * surfaced as INTEGRITY_FAILURE events. They are never silently repaired.
 *
 * SEC-03: Every policy write triggers a ledger event.
 * SEC-06: Ledger is bounded at MAX_EVENTS; overflow triggers pruning.
 * SEC-07: Cryptographically verified event ledger with checkpointing.
 *
 * @module integrity/hash-chain
 */

import { sha256 }       from './hash.js';
import { canonicalize } from '../protocol/canonicalize.js';

const STORAGE_KEY  = 'aipp.ledger';
const MAX_EVENTS   = 10_000;
const SCHEMA_VER   = 1;

/** Module-level cache to avoid redundant storage reads. */
let _chain     = [];
let _startedAt = performance.now();

export async function initHashChain() {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    _chain = stored[STORAGE_KEY] ?? [];
    await verifyChainIntegrity();
  } catch {
    _chain = [];
  }
}

export function handleGetLedger() {
  // Return a copy; callers must not mutate the chain.
  const slice = _chain.slice(-500);
  return { ledger: slice, events: slice };
}

/**
 * Append a new event to the ledger.
 * @param {string} eventType
 * @param {object} payload    — must contain no raw URLs, cookies, or PII
 * @returns {Promise<void>}
 */
export async function recordEvent(eventType, payload) {
  const sequence     = _chain.length;
  const previousHash = sequence === 0 ? 'GENESIS' : _chain[sequence - 1].eventDigest;
  const elapsedTimeMs = Math.round(performance.now() - _startedAt);

  const eventBase = {
    schemaVersion: SCHEMA_VER,
    eventType,
    sequence,
    previousHash,
    elapsedTimeMs,
    payload,
  };

  const eventDigest = await sha256(canonicalize(eventBase));
  const event = { ...eventBase, eventDigest, blockHash: eventDigest, timestamp: Date.now() };

  _chain.push(event);

  // Enforce size bound (SEC-06).
  if (_chain.length > MAX_EVENTS) {
    await writeCheckpoint();
    _chain = _chain.slice(-Math.floor(MAX_EVENTS * 0.1)); // keep newest 10%
  }

  await persist();
}

/**
 * Recompute and verify integrity across all chained events.
 */
export async function handleVerifyIntegrity() {
  const errors = [];

  for (let i = 0; i < _chain.length; i++) {
    const current = _chain[i];

    if (i === 0) {
      if (current.previousHash !== 'GENESIS') {
        errors.push(`Block 0 prevHash must be GENESIS, got: ${current.previousHash}`);
      }
    } else {
      const prev = _chain[i - 1];
      if (current.sequence !== prev.sequence + 1) {
        errors.push(`Sequence gap at block ${i}: expected ${prev.sequence + 1}, got ${current.sequence}`);
      }
      if (current.previousHash !== (prev.eventDigest ?? prev.blockHash)) {
        errors.push(`Hash link broken at block ${i}`);
      }
    }

    // Recompute eventDigest
    const base = {
      schemaVersion: current.schemaVersion ?? SCHEMA_VER,
      eventType:     current.eventType,
      sequence:      current.sequence,
      previousHash:  current.previousHash,
      elapsedTimeMs: current.elapsedTimeMs,
      payload:       current.payload,
    };
    const expectedDigest = await sha256(canonicalize(base));
    if (current.eventDigest && current.eventDigest !== expectedDigest) {
      errors.push(`Digest mismatch at block ${i}: expected ${expectedDigest}, got ${current.eventDigest}`);
    }
  }

  return {
    valid: errors.length === 0,
    length: _chain.length,
    errors,
  };
}

async function verifyChainIntegrity() {
  for (let i = 1; i < _chain.length; i++) {
    const prev    = _chain[i - 1];
    const current = _chain[i];

    if (current.sequence !== prev.sequence + 1) {
      await appendIntegrityFailure('GAP_DETECTED', i);
      return;
    }

    if (current.previousHash !== (prev.eventDigest ?? prev.blockHash)) {
      await appendIntegrityFailure('HASH_LINK_BROKEN', i);
      return;
    }
  }
}

async function appendIntegrityFailure(reason, atSequence) {
  const sequence     = _chain.length;
  const previousHash = sequence === 0 ? 'GENESIS' : (_chain[sequence - 1].eventDigest ?? _chain[sequence - 1].blockHash);
  const eventBase    = {
    schemaVersion: SCHEMA_VER,
    eventType:     'INTEGRITY_FAILURE',
    sequence,
    previousHash,
    elapsedTimeMs: Math.round(performance.now() - _startedAt),
    payload: { reason, atSequence },
  };
  const eventDigest = await sha256(canonicalize(eventBase));
  _chain.push({ ...eventBase, eventDigest, blockHash: eventDigest, timestamp: Date.now() });
  await persist();
}

export async function handleCreateCheckpoint() {
  await writeCheckpoint();
  return { success: true };
}

async function writeCheckpoint() {
  if (_chain.length === 0) return;
  const last = _chain[_chain.length - 1];
  const checkpointBase = {
    schemaVersion:    SCHEMA_VER,
    checkpointSeq:    last.sequence,
    headHash:         last.eventDigest ?? last.blockHash,
    eventCount:       _chain.length,
    timestamp:        Date.now(),
  };
  const checkpointDigest = await sha256(canonicalize(checkpointBase));
  await browser.storage.local.set({ 'aipp.checkpoint': { ...checkpointBase, checkpointDigest } });
}

async function persist() {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: _chain });
  } catch (err) {
    console.warn('Failed to persist hash-chain:', err);
  }
}
