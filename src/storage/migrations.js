/**
 * migrations.js — Sequential, idempotent storage schema migrations.
 *
 * Each migration has a monotonically increasing version number and must
 * be safe to run more than once. Migrations record a POLICY_VERSION_CHANGED
 * ledger event on completion. They must not delete data without disclosure.
 *
 * @module storage/migrations
 */

import { readKey, writeKey } from './state-store.js';
import { recordEvent }       from '../integrity/hash-chain.js';

const MIGRATIONS = [
  // { version: 1, up: async () => { ... } },
];

export async function initMigrations() {
  const current = await readKey('aipp.state.version') ?? 0;
  const pending  = MIGRATIONS.filter(m => m.version > current);

  for (const migration of pending) {
    await migration.up();
    await writeKey('aipp.state.version', migration.version);
    await recordEvent('POLICY_VERSION_CHANGED', {
      reasonCode:      'SCHEMA_MIGRATION',
      authorizedBy:    'INIT',
      previousVersion: current,
      nextVersion:     migration.version,
    });
  }
}
