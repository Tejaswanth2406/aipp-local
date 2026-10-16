/**
 * tests/unit/precedence.test.js
 */

import { resolveConflict, resolveRuleConflicts } from '../../src/protocol/precedence.js';

test('resolveConflict: block wins over allow', () => {
  expect(resolveConflict('block', 'allow')).toBe('block');
  expect(resolveConflict('allow', 'block')).toBe('block');
});

test('resolveConflict: allow + allow = allow', () => {
  expect(resolveConflict('allow', 'allow')).toBe('allow');
});

test('resolveConflict: block + block = block', () => {
  expect(resolveConflict('block', 'block')).toBe('block');
});

test('resolveRuleConflicts: returns null for empty list', () => {
  expect(resolveRuleConflicts([])).toBeNull();
});

test('resolveRuleConflicts: block rule wins over allow rule', () => {
  const rules = [
    { id: 'allow-1', action: 'allow' },
    { id: 'block-1', action: 'block' },
  ];
  expect(resolveRuleConflicts(rules).action).toBe('block');
  expect(resolveRuleConflicts(rules).id).toBe('block-1');
});

test('resolveRuleConflicts: returns first rule when all allow', () => {
  const rules = [
    { id: 'allow-1', action: 'allow' },
    { id: 'allow-2', action: 'allow' },
  ];
  expect(resolveRuleConflicts(rules).id).toBe('allow-1');
});
