/**
 * tests/offline/enforcement.test.js
 *
 * Validates SEC-01 & tracker blocking:
 * Confirms bundled-rules.json compiles and evaluates offline without network.
 */

import { compileRules } from '../../src/enforcement/rule-compiler.js';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve('.');

describe('Enforcement & Rule Compilation', () => {
  let bundledArtifact;

  beforeAll(() => {
    const raw = readFileSync(join(ROOT, 'rules/bundled-rules.json'), 'utf8');
    bundledArtifact = JSON.parse(raw);
  });

  test('bundled-rules.json contains valid hardRules and bundledRules', () => {
    expect(bundledArtifact.schemaVersion).toBe(1);
    expect(Array.isArray(bundledArtifact.hardRules)).toBe(true);
    expect(Array.isArray(bundledArtifact.bundledRules)).toBe(true);
    expect(bundledArtifact.hardRules.length).toBeGreaterThan(0);
    expect(bundledArtifact.bundledRules.length).toBeGreaterThan(0);
  });

  test('hard rules block known crypto-mining and fingerprinting patterns', () => {
    const categories = bundledArtifact.hardRules.map(r => r.category);
    expect(categories).toContain('CRYPTOMINING');
    expect(categories).toContain('FINGERPRINTING');
  });

  test('compileRules produces valid Declarative Net Request rules offline', () => {
    const dnrRules = compileRules(bundledArtifact);
    expect(Array.isArray(dnrRules)).toBe(true);
    expect(dnrRules.length).toBeGreaterThan(0);

    for (const rule of dnrRules) {
      expect(typeof rule.id).toBe('number');
      expect(rule.id).toBeGreaterThan(0);
      expect(typeof rule.priority).toBe('number');
      expect(rule.action).toBeDefined();
      expect(['block', 'allow']).toContain(rule.action.type);
      expect(rule.condition).toBeDefined();
      expect(typeof rule.condition.urlFilter).toBe('string');
    }
  });
});
