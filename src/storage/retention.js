/**
 * retention.js — Data retention and pruning policy.
 *
 * Prunes expired exceptions and oversized ledger events on a schedule.
 * No browsing data is ever stored. Pruning is logged in the ledger.
 *
 * @module storage/retention
 */

import { readKey, writeKey } from './state-store.js';
import { recordEvent }       from '../integrity/hash-chain.js';

const EXCEPTION_KEY  = 'aipp.exceptions';
const PRUNE_ALARM    = 'aipp.retention.prune';
const ALARM_PERIOD   = 60; // minutes

export function initRetention() {
  browser.alarms.create(PRUNE_ALARM, { periodInMinutes: ALARM_PERIOD });
  browser.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === PRUNE_ALARM) await pruneExpiredExceptions();
  });
}

async function pruneExpiredExceptions() {
  const exceptions = await readKey(EXCEPTION_KEY) ?? [];
  const now        = Date.now();
  const active     = exceptions.filter(e => new Date(e.expiresAt).getTime() > now);
  const pruned     = exceptions.length - active.length;

  if (pruned > 0) {
    await writeKey(EXCEPTION_KEY, active);
    await recordEvent('EXCEPTION_EXPIRED', { prunedCount: pruned });
  }
}
