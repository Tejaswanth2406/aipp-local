/**
 * tests/unit/rule-compiler.test.js
 */

import { compileRules, matchPatternToUrlFilter } from '../../src/enforcement/rule-compiler.js';

const RULES_ARTIFACT = {
  schemaVersion:   1,
  artifactVersion: '0.1.0',
  hardRules: [
    { id: 'h1', category: 'CRYPTOMINING', action: 'block', matchPatterns: ['*://*.coinhive.com/*'] },
  ],
  bundledRules: [
    { id: 'b1', priority: 100, action: 'block', matchPatterns: ['*://www.google-analytics.com/*', '*://analytics.google.com/*'] },
    { id: 'b2', priority: 100, action: 'allow', matchPatterns: ['*://trusted.example.com/*'] },
  ],
};

test('compileRules: hard rules get HARD_BLOCK priority (10000)', () => {
  const rules = compileRules(RULES_ARTIFACT);
  const hard  = rules.filter(r => r.priority === 10_000);
  expect(hard.length).toBe(1);
  expect(hard[0].action.type).toBe('block');
});

test('compileRules: bundled block rule gets priority 100', () => {
  const rules   = compileRules(RULES_ARTIFACT);
  const bundled = rules.filter(r => r.priority === 100);
  // b1 has 2 patterns, b2 has 1 → 3 bundled rules total
  expect(bundled.length).toBe(3);
});

test('compileRules: allow bundled rule gets action allow', () => {
  const rules      = compileRules(RULES_ARTIFACT);
  const allowRules = rules.filter(r => r.action.type === 'allow');
  expect(allowRules.length).toBe(1);
});

test('compileRules: IDs are unique and start at offset', () => {
  const rules = compileRules(RULES_ARTIFACT, 100);
  const ids   = rules.map(r => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(Math.min(...ids)).toBe(100);
});

test('compileRules: _aippMeta is present on each rule', () => {
  const rules = compileRules(RULES_ARTIFACT);
  for (const r of rules) {
    expect(r._aippMeta).toBeDefined();
    expect(typeof r._aippMeta.ruleId).toBe('string');
  }
});

describe('matchPatternToUrlFilter', () => {
  test('wildcard scheme becomes domain anchor', () => {
    expect(matchPatternToUrlFilter('*://*.doubleclick.net/*')).toBe('||doubleclick.net');
  });

  test('specific host preserved', () => {
    expect(matchPatternToUrlFilter('*://www.google-analytics.com/*')).toBe('||www.google-analytics.com');
  });

  test('trailing path stripped', () => {
    expect(matchPatternToUrlFilter('*://tracker.example.com/track/*')).toBe('||tracker.example.com/track');
  });
});
