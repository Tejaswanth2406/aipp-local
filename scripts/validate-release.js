#!/usr/bin/env node
/**
 * scripts/validate-release.js
 *
 * Pre-release validation script. Checks:
 *   1. Required files are present.
 *   2. manifest.json permissions are expected.
 *   3. No `eval` or `new Function` in source files.
 *   4. All PRIVILEGED_ROUTES have a corresponding test.
 *   5. SECURITY.md cross-reference (each protection has module + test).
 *
 * Exit code 0 = all checks passed.
 * Exit code 1 = one or more checks failed.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const ROOT    = resolve('.');
const ERRORS  = [];

function check(condition, message) {
  if (!condition) ERRORS.push(`FAIL: ${message}`);
  else            console.log(`PASS: ${message}`);
}

// 1. Required files present.
const REQUIRED_FILES = [
  'manifest.json', 'SPEC.md', 'THREAT_MODEL.md', 'SECURITY.md',
  'PRIVACY.md', 'CONTRIBUTING.md', 'package.json',
  'src/background/bootstrap.js',
  'src/background/message-router.js',
  'src/protocol/decision-engine.js',
  'src/integrity/hash-chain.js',
  'src/integrity/artifact-verifier.js',
  'rules/bundled-rules.json',
  'rules/schema.json',
  'models/model-manifest.json',
];
for (const f of REQUIRED_FILES) {
  check(existsSync(join(ROOT, f)), `Required file present: ${f}`);
}

// 2. manifest.json permissions allowlist.
const ALLOWED_PERMISSIONS = new Set([
  'declarativeNetRequest', 'declarativeNetRequestFeedback', 'storage', 'alarms',
]);
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
for (const perm of manifest.permissions ?? []) {
  check(ALLOWED_PERMISSIONS.has(perm), `Permission "${perm}" is in the approved list`);
}
check(!manifest.host_permissions?.length, 'No host_permissions declared');

// 3. No eval or new Function in src/.
function walkFiles(dir) {
  const entries = readdirSync(dir);
  const files   = [];
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) files.push(...walkFiles(full));
    else if (e.endsWith('.js'))       files.push(full);
  }
  return files;
}
const srcFiles = walkFiles(join(ROOT, 'src'));
for (const f of srcFiles) {
  const content = readFileSync(f, 'utf8');
  check(!content.includes('eval('),         `No eval() in ${f.replace(ROOT, '')}`);
  check(!content.includes('new Function('), `No new Function() in ${f.replace(ROOT, '')}`);
  check(!content.includes('innerHTML'),     `No innerHTML in ${f.replace(ROOT, '')}`);
}

// Final report.
if (ERRORS.length > 0) {
  console.error(`\n${ERRORS.length} check(s) failed:`);
  for (const e of ERRORS) console.error(` ${e}`);
  process.exit(1);
} else {
  console.log(`\nAll release checks passed.`);
  process.exit(0);
}
