/**
 * checkpoint.js — Periodic ledger checkpointing.
 *
 * A checkpoint records a cumulative hash of all events up to a given
 * sequence number. Checkpoints allow the ledger to be pruned without
 * losing the ability to verify that earlier events were present.
 *
 * @module integrity/checkpoint
 */

import { sha256 }       from './hash.js';
import { canonicalize } from '../protocol/canonicalize.js';
import { recordEvent }  from './hash-chain.js';

/**
 * Write a checkpoint event covering all events up to `upToSequence`.
 * @param {object[]} events
 * @param {number}   upToSequence
 */
export async function writeCheckpoint(events, upToSequence) {
  const covered       = events.filter(e => e.sequence <= upToSequence);
  const cumulativeHash = await sha256(canonicalize(covered.map(e => e.eventDigest)));
  await recordEvent('LEDGER_CHECKPOINT', { upToSequence, cumulativeHash });
}
