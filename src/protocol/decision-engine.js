/**
 * decision-engine.js — Deterministic request evaluation.
 *
 * Implements the 6-step algorithm defined in SPEC.md §5.
 * Steps may not be reordered. The engine does not perform I/O
 * mid-evaluation, does not mutate policy, and does not call ML directly.
 *
 * SEC-04: ML cannot override hard rules (steps 1-4 run unconditionally before step 5).
 * SEC-08: Returns block on any unrecoverable internal error or missing policy.
 * SEC-09: findValidException rejects expired and over-scoped exceptions.
 *
 * @module protocol/decision-engine
 */

import { validateRequest }     from './schema.js';
import { resolveRuleConflicts } from './precedence.js';
import { readKey, writeKey }   from '../storage/state-store.js';

const PROTOCOL = 'AIPP';
const VERSION  = '0.1.0';

const POLICY_KEY      = 'aipp.policy';
const EXCEPTIONS_KEY  = 'aipp.exceptions';

/** @type {AIPPPolicy|null} */
let _policy    = null;
/** @type {object[]|null} — in-memory exception cache, refreshed on load */
let _exceptions = null;

// ─── Initialization ──────────────────────────────────────────────────────────

export async function initDecisionEngine() {
  try {
    const stored = await readKey(POLICY_KEY);
    _policy = stored ?? getDefaultPolicy();
  } catch {
    // Fail closed (SEC-08): could not load policy, use the default block-all policy.
    _policy = getDefaultPolicy();
  }

  try {
    _exceptions = await readKey(EXCEPTIONS_KEY) ?? [];
  } catch {
    _exceptions = [];
  }
}

/**
 * Update the in-memory policy snapshot.
 * Called by native-rules.js after a new rule set is verified and applied.
 * @param {object} policyPatch
 */
export function updatePolicy(policyPatch) {
  _policy = { ...(_policy ?? getDefaultPolicy()), ...policyPatch };
}

/** Refresh in-memory exceptions from storage (called by expiry-manager). */
export async function refreshExceptions() {
  try { _exceptions = await readKey(EXCEPTIONS_KEY) ?? []; }
  catch { _exceptions = []; }
}

export function handleGetPolicy() {
  return { policy: _policy };
}

export async function handleUpdatePolicy(payload) {
  updatePolicy(payload);
  await writeKey(POLICY_KEY, _policy);
  try {
    const { recordEvent } = await import('../integrity/hash-chain.js');
    await recordEvent('POLICY_UPDATED', {
      version: _policy.version,
      mlEnabled: _policy.mlEnabled,
      riskThresholds: _policy.riskThresholds,
      maxExceptionDurationMs: _policy.maxExceptionDurationMs,
    });
  } catch (e) {
    console.warn('Failed to record policy update event:', e);
  }
  return { success: true, policy: _policy };
}

export function handleGetDecisionLog() {
  // TODO(milestone-03): bounded circular decision log.
  return { log: [] };
}

// ─── Main evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluate a single request.
 * @param {AIPPRequest}       request
 * @param {RiskEstimate|null} risk  — null when classifier unavailable
 * @returns {AIPPDecision}
 */
export function evaluateRequest(request, risk = null) {
  if (!_policy) {
    return makeDecision('block', 'POLICY_UNAVAILABLE');
  }
  try {
    return runAlgorithm(request, _policy, risk);
  } catch {
    return makeDecision('block', 'INTERNAL_ERROR');
  }
}

function runAlgorithm(request, policy, risk) {
  // ── Step 1: Input validation ─────────────────────────────────────────────
  const { valid, errors } = validateRequest(request);
  if (!valid) {
    return makeDecision('block', 'INVALID_REQUEST', { errors });
  }

  // Canonicalize URL for matching (lowercase host, strip default ports).
  const url = canonicalizeUrl(request.url);

  // ── Step 2: Hard-block rules ─────────────────────────────────────────────
  //    These cannot be overridden by exceptions, ML, or user preference.
  const hardRule = matchHardRule(url, policy);
  if (hardRule) {
    return makeDecision('block', 'HARD_RULE_MATCH', { ruleId: hardRule.id });
  }

  // ── Step 3: Valid, scoped, unexpired exceptions ──────────────────────────
  //    An exception is invalid if the URL violates any hard rule.
  const exception = findValidException(url, request.resourceType, policy);
  if (exception) {
    return makeDecision('allow', 'AUTHORIZED_EXCEPTION', { exceptionId: exception.id });
  }

  // ── Step 4: Deterministic bundled rules ──────────────────────────────────
  const rule = matchBundledRule(url, request.resourceType, policy);
  if (rule) {
    return makeDecision(rule.action, 'BUNDLED_RULE_MATCH', { ruleId: rule.id });
  }

  // ── Step 5: ML advisory (only if policy enables it) ─────────────────────
  //    risk is null when classifier unavailable; this cannot change steps 1-4.
  if (risk !== null && policy.mlEnabled) {
    const mlDecision = applyRiskPolicy(risk, policy);
    if (mlDecision) return mlDecision;
  }

  // ── Step 6: Documented policy default ───────────────────────────────────
  return makeDecision(policy.defaultAction, 'POLICY_DEFAULT');
}

// ─── Rule matching ────────────────────────────────────────────────────────────

/**
 * Match URL against hard-block rules. Returns the first matching rule or null.
 * Hard rules apply to all resource types.
 *
 * @param {string} url — canonicalized URL
 * @param {AIPPPolicy} policy
 * @returns {{ id: string, category: string }|null}
 */
function matchHardRule(url, policy) {
  for (const rule of policy.hardRules) {
    if (patternsMatch(url, rule.matchPatterns)) {
      return { id: rule.id, category: rule.category, action: 'block' };
    }
  }
  return null;
}

/**
 * Find a valid, unexpired exception for this URL + resourceType pair.
 * Rejects: expired exceptions, wrong-scope exceptions, exceptions that
 * would violate a hard-block rule (SEC-09).
 *
 * @param {string} url
 * @param {string} resourceType
 * @param {AIPPPolicy} policy
 * @returns {ExceptionRecord|null}
 */
function findValidException(url, resourceType, policy) {
  const now = Date.now();
  const exceptions = _exceptions ?? policy.exceptions ?? [];

  for (const exc of exceptions) {
    // Reject expired.
    if (new Date(exc.expiresAt).getTime() <= now) continue;

    // Scope check: origin must match and resourceType must be in scope.
    if (!urlMatchesOrigin(url, exc.scope.origin)) continue;
    if (!exc.scope.resourceTypes.includes(resourceType)) continue;

    // SEC-09: exception cannot cover a hard-block URL.
    if (matchHardRule(url, policy)) continue;

    return exc;
  }
  return null;
}

/**
 * Match URL + resourceType against bundled rules.
 * Returns the winning rule after block-preferred conflict resolution.
 *
 * @param {string} url
 * @param {string} resourceType
 * @param {AIPPPolicy} policy
 * @returns {{ id: string, action: string }|null}
 */
function matchBundledRule(url, resourceType, policy) {
  const matches = [];

  for (const rule of policy.bundledRules) {
    if (!patternsMatch(url, rule.matchPatterns)) continue;
    if (rule.resourceTypes && !rule.resourceTypes.includes(resourceType)) continue;
    matches.push(rule);
  }

  if (matches.length === 0) return null;

  // Group by priority; within each priority level, apply block-preferred resolution.
  const byPriority = {};
  for (const r of matches) {
    const p = r.priority ?? 100;
    (byPriority[p] = byPriority[p] ?? []).push(r);
  }

  const highestPriority = Math.max(...Object.keys(byPriority).map(Number));
  return resolveRuleConflicts(byPriority[highestPriority]);
}

// ─── ML advisory ──────────────────────────────────────────────────────────────

function applyRiskPolicy(risk, policy) {
  const { riskScore } = risk;
  const { block, allow } = policy.riskThresholds;

  if (riskScore >= block) {
    return makeDecision('block', 'ML_HIGH_RISK', { riskScore, modelId: risk.modelId });
  }
  if (riskScore <= allow) {
    return makeDecision('allow', 'ML_LOW_RISK',  { riskScore, modelId: risk.modelId });
  }
  // Within uncertainty band — fall through to policy default.
  return null;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Canonicalize a URL: lowercase scheme+host, strip default ports.
 * Returns the original string on parse failure (validation already rejected
 * truly malformed URLs in step 1).
 */
function canonicalizeUrl(url) {
  try {
    const u = new URL(url);
    // Lowercase scheme and host; strip default ports; preserve path+query.
    const host = u.hostname.toLowerCase();
    const defaultPort = (u.protocol === 'https:' && u.port === '443') ||
                        (u.protocol === 'http:'  && u.port === '80');
    const port = (u.port && !defaultPort) ? `:${u.port}` : '';
    return `${u.protocol}//${host}${port}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * Test whether a canonicalized URL matches any of the given match patterns.
 * Supported pattern forms:
 *   *://host/path   — wildcard scheme
 *   *://*.host/path — wildcard subdomain
 *   https://host/*  — exact scheme, wildcard path
 *
 * @param {string}   url
 * @param {string[]} patterns
 */
function patternsMatch(url, patterns) {
  return patterns.some(p => matchPattern(url, p));
}

function matchPattern(url, pattern) {
  if (pattern === '<all_urls>') return true;

  // Convert match pattern to a regex.
  // 1. Escape regex specials (not *)
  let escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

  // 2. Wildcard scheme: *:// -> https?://
  escaped = escaped.replace(/^\*:\/\//, 'https?:\\/\\/');

  // 3. Wildcard subdomain: *.host -> (?:[a-z0-9-]+\\.)*host
  escaped = escaped.replace(/\*\\\./g, '(?:[a-z0-9-]+\\.)*');

  // 4. Remaining wildcards: * -> .*
  escaped = escaped.replace(/\*/g, '.*');

  try {
    return new RegExp(`^${escaped}`, 'i').test(url);
  } catch {
    return false;
  }
}

/**
 * Check whether a URL's origin matches an exception's scope origin.
 * @param {string} url
 * @param {string} origin  — e.g. "https://example.com"
 */
function urlMatchesOrigin(url, origin) {
  try {
    const u = new URL(url);
    const o = new URL(origin);
    return u.protocol === o.protocol &&
           u.hostname.toLowerCase() === o.hostname.toLowerCase() &&
           u.port === o.port;
  } catch {
    return false;
  }
}

// ─── Decision record ──────────────────────────────────────────────────────────

function makeDecision(action, reason, context = {}) {
  return Object.freeze({
    protocol:  PROTOCOL,
    version:   VERSION,
    action,
    reason,
    context,
    timestamp: Date.now(),
  });
}

// ─── Default policy ───────────────────────────────────────────────────────────

function getDefaultPolicy() {
  return {
    version:                  '0.1.0',
    defaultAction:            'block',
    mlEnabled:                false,
    mlTimeoutMs:              200,
    maxExceptionDurationMs:   86_400_000,
    maxRedirectDepth:         5,
    maxPatternCount:          20,
    clockUncertaintyWindowMs: 60_000,
    hardRules:                [],
    bundledRules:             [],
    exceptions:               [],
    riskThresholds:           { block: 0.75, allow: 0.25 },
  };
}
