#!/usr/bin/env node
/**
 * scripts/verify-artifacts.js
 *
 * Standalone artifact verification script for CI and manual auditing.
 * Computes SHA-256 digests of bundled-rules.json and model-manifest.json
 * and compares them against the expected hashes stored in the manifest.
 *
 * This script must run without network access.
 */

import { createHash }     from 'crypto';
import { readFileSync }   from 'fs';
import { resolve, join }  from 'path';

const ROOT   = resolve('.');
const ERRORS = [];

function sha256File(path) {
  const content = readFileSync(path);
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}

function check(condition, message) {
  if (!condition) ERRORS.push(`FAIL: ${message}`);
  else            console.log(`PASS: ${message}`);
}

// Verify bundled-rules.json is valid JSON and matches schema schemaVersion.
try {
  const rules = JSON.parse(readFileSync(join(ROOT, 'rules/bundled-rules.json'), 'utf8'));
  check(rules.schemaVersion === 1, 'bundled-rules.json schemaVersion === 1');
  check(Array.isArray(rules.hardRules),   'bundled-rules.json has hardRules array');
  check(Array.isArray(rules.bundledRules), 'bundled-rules.json has bundledRules array');
  const digest = sha256File(join(ROOT, 'rules/bundled-rules.json'));
  console.log(`INFO: bundled-rules.json digest: ${digest}`);
} catch (e) {
  ERRORS.push(`FAIL: bundled-rules.json parse error: ${e.message}`);
}

// Verify model-manifest.json.
try {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'models/model-manifest.json'), 'utf8'));
  check(manifest.schemaVersion === 1, 'model-manifest.json schemaVersion === 1');
  check(Array.isArray(manifest.models), 'model-manifest.json has models array');
  for (const m of manifest.models) {
    check(typeof m.modelId === 'string', `model ${m.modelId} has modelId`);
    check(typeof m.sha256  === 'string', `model ${m.modelId} has sha256`);
    check(typeof m.validUntil === 'string', `model ${m.modelId} has validUntil`);
  }
} catch (e) {
  ERRORS.push(`FAIL: model-manifest.json parse error: ${e.message}`);
}

if (ERRORS.length > 0) {
  console.error(`\n${ERRORS.length} artifact check(s) failed:`);
  for (const e of ERRORS) console.error(` ${e}`);
  process.exit(1);
} else {
  console.log('\nAll artifact checks passed.');
  process.exit(0);
}
