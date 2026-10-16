/**
 * expiry-manager.js — Exception and evidence expiry enforcement.
 *
 * Checks exception expiry on a high-frequency alarm. Expired exceptions
 * are dropped at check time and logged. An exception cannot be silently
 * widened; a new one must be explicitly created (SEC-09).
 *
 * @module temporal/expiry-manager
 */

import { readKey, writeKey } from '../storage/state-store.js';
import { recordEvent }       from '../integrity/hash-chain.js';

const EXCEPTION_KEY = 'aipp.exceptions';
const ALARM_NAME    = 'aipp.expiry.check';
const ALARM_PERIOD  = 5; // minutes

export async function initExpiryManager() {
  browser.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD });
  browser.alarms.onAlarm.addListener(async alarm => {
    if (alarm.name === ALARM_NAME) await checkExpiry();
  });
}

async function checkExpiry() {
  const exceptions = await readKey(EXCEPTION_KEY) ?? [];
  const now        = Date.now();
  const active     = [];
  const expired    = [];

  for (const e of exceptions) {
    if (new Date(e.expiresAt).getTime() <= now) {
      expired.push(e.id);
    } else {
      active.push(e);
    }
  }

  if (expired.length > 0) {
    await writeKey(EXCEPTION_KEY, active);
    await recordEvent('EXCEPTION_EXPIRED', { expiredIds: expired });
  }
}
