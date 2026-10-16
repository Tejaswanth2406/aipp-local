/**
 * rule-compiler.js — Compiles AIPP rule format into browser Declarative Net Request rules.
 *
 * AIPP rules use match patterns and category metadata.
 * DNR rules use resourceTypes, urlFilter, and action objects.
 *
 * Priority allocation:
 *   Hard-block rules : 10000 + index  (highest; cannot be overridden)
 *   Bundled rules    : priority field  (100 default)
 *   Fail-closed rule : 1              (lowest; overridden by any real rule)
 *
 * @module enforcement/rule-compiler
 */

export const PRIORITY = {
  FAIL_CLOSED:   1,
  BUNDLED_BASE:  100,
  HARD_BLOCK:    10_000,
};

const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
  'font', 'object', 'xmlhttprequest', 'ping',
  'media', 'websocket', 'other',
];

/**
 * Compile the full bundled-rules artifact into DNR rule objects.
 * Hard-block rules are compiled first and assigned the highest priority.
 *
 * @param {object} rulesArtifact   — validated bundled-rules.json content
 * @param {number} idOffset        — starting ID (default 100 to leave room for session rules)
 * @returns {browser.declarativeNetRequest.Rule[]}
 */
export function compileRules(rulesArtifact, idOffset = 100) {
  const dnrRules = [];
  let id = idOffset;

  // 1. Hard-block rules — highest priority, all resource types.
  for (const rule of rulesArtifact.hardRules) {
    for (const pattern of rule.matchPatterns) {
      dnrRules.push({
        id:       id++,
        priority: PRIORITY.HARD_BLOCK,
        action:   { type: 'block' },
        condition: {
          urlFilter:      matchPatternToUrlFilter(pattern),
          resourceTypes:  ALL_RESOURCE_TYPES,
        },
        // Store AIPP metadata for decision-engine matching.
        _aippMeta: { ruleId: rule.id, category: rule.category, isHard: true },
      });
    }
  }

  // 2. Bundled rules — priority from the rule definition.
  for (const rule of rulesArtifact.bundledRules) {
    for (const pattern of rule.matchPatterns) {
      dnrRules.push({
        id:       id++,
        priority: rule.priority ?? PRIORITY.BUNDLED_BASE,
        action:   { type: rule.action === 'allow' ? 'allow' : 'block' },
        condition: {
          urlFilter:      matchPatternToUrlFilter(pattern),
          resourceTypes:  ALL_RESOURCE_TYPES,
        },
        _aippMeta: { ruleId: rule.id, isHard: false },
      });
    }
  }

  return dnrRules;
}

/**
 * Convert a Firefox-style match pattern to a DNR urlFilter string.
 * Match patterns use * for wildcard host/path; DNR urlFilter uses ||host.
 *
 * @param {string} pattern  e.g. "*://*.doubleclick.net/*"
 * @returns {string}        e.g. "||doubleclick.net"
 */
export function matchPatternToUrlFilter(pattern) {
  // Strip scheme wildcard (*://)
  let p = pattern.replace(/^\*:\/\//, '');

  // Strip leading "*." wildcard subdomain prefix
  p = p.replace(/^\*\./, '');

  // Strip trailing path wildcard "/*"
  p = p.replace(/\/\*$/, '');

  // Use "||" anchor (domain anchor in DNR)
  return '||' + p;
}
