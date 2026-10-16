# SPEC.md — AIPP Local Engineering Specification

**Adaptive, Integrity-Preserving Privacy Protocol**
Version: 0.1.0 · Status: Draft · Date: 2026-10-16

---

## Table of Contents

1. [Project Definition](#1-project-definition)
2. [Operating Constraints](#2-operating-constraints)
3. [Security Invariants](#3-security-invariants)
4. [Module Authority Boundaries](#4-module-authority-boundaries)
5. [Decision-Engine Algorithm](#5-decision-engine-algorithm)
6. [Policy Precedence Rules](#6-policy-precedence-rules)
7. [Exception Lifecycle](#7-exception-lifecycle)
8. [Cryptographic Integrity](#8-cryptographic-integrity)
9. [Local Event Ledger](#9-local-event-ledger)
10. [Machine Learning Contract](#10-machine-learning-contract)
11. [Temporal Trust Policies](#11-temporal-trust-policies)
12. [State and Persistence](#12-state-and-persistence)
13. [Message Routing and Privilege](#13-message-routing-and-privilege)
14. [Release and Audit Checklist](#14-release-and-audit-checklist)
15. [Implementation Milestones](#15-implementation-milestones)
16. [Versioning and Changelog Policy](#16-versioning-and-changelog-policy)
17. [Known Limitations](#17-known-limitations)

---

## 1. Project Definition

AIPP Local is a self-contained Firefox WebExtension combining:

- **Browser-native request filtering** via the Declarative Net Request API
- **A deterministic policy engine** with explicit rule precedence
- **Local ML inference** with strictly advisory authority
- **Temporal trust management** for expiring evidence and exceptions
- **Cryptographic artifact verification** for all bundled rules and models
- **A bounded, hash-chained audit ledger** for tamper-evident state history

The extension operates entirely offline. No backend, account, telemetry service, or remote inference endpoint is required for any core privacy function.

---

## 2. Operating Constraints

| ID     | Constraint |
|--------|------------|
| OC-01  | No required backend, account, or remote inference endpoint. |
| OC-02  | No runtime code loading: no `eval`, `new Function`, or dynamic remote imports. |
| OC-03  | No silent rule replacement. Every rule update requires schema validation, hash verification, and an authorized source. |
| OC-04  | No ML model may disable, weaken, or override a hard security rule. |
| OC-05  | No undocumented privileged message handler or hidden administrative interface. |
| OC-06  | No cryptocurrency, mining, or blockchain consensus required for any browsing decision. |
| OC-07  | All significant security decisions must map to an implemented control and a reproducible test. |
| OC-08  | No component may both modify a security policy and unilaterally certify that modification as trustworthy. |

---

## 3. Security Invariants

A module is not complete until every relevant invariant has an automated test runnable with no network access.

| ID     | Invariant | Verification Method |
|--------|-----------|---------------------|
| SEC-01 | No required backend | All core functions pass in `tests/offline/` with network access revoked. |
| SEC-02 | No hidden code loading | Static analysis confirms zero uses of `eval`, `new Function`, or remote `import`. |
| SEC-03 | No silent policy mutation | Every policy write is accompanied by a ledger event with `changeType`, `authorizedSource`, `previousVersion`, and `nextVersion`. |
| SEC-04 | No ML override of hard rules | `tests/adversarial/ml-override.test.js` confirms a maximum-risk ML score cannot convert a hard block into an allow. |
| SEC-05 | No trust by self-assertion | Artifact verifier rejects any artifact whose embedded hash matches its own content but whose signature is absent or invalid. |
| SEC-06 | No unbounded computation | All queues, caches, inference calls, and log buffers have explicit, enforced size and time limits. |
| SEC-07 | No hidden privileged messaging | `message-router.js` contains a complete allowlist of privileged routes; any unregistered route is rejected. |
| SEC-08 | No fail-open security transitions | Module crash or timeout must not convert a block decision into an allow. |
| SEC-09 | No silent exception escalation | Exceptions have a maximum scope, a maximum duration, and may not be silently widened. |
| SEC-10 | No unverifiable security claims | `SECURITY.md` lists every advertised protection, its implementing module, and its test file. |

### Failure semantics for SEC-08

When the adaptive classifier is unavailable, enforcement falls back to deterministic bundled rules only (not fail-open). When the entire policy engine fails to initialize, the extension must set a `defaultAction: "block"` declarative rule for all third-party requests and surface a visible error indicator.

---

## 4. Module Authority Boundaries

| Module | Allowed | Forbidden |
|--------|---------|-----------|
| `native-rules.js` | Compile and apply validated declarative request rules | Execute ML-generated code; modify trust anchors |
| `decision-engine.js` | Evaluate context against approved policy | Write to storage directly; modify its own trust anchors |
| `classifier.js` | Return `{ riskScore, modelId, evidenceCodes }` | Grant permissions; override hard rules; persist model changes |
| `evidence-decay.js` | Expire time-bounded evidence per declared policy | Downgrade permanent rules; modify integrity records |
| `artifact-verifier.js` | Verify hash, schema, version, signature | Trust an artifact because it embeds its own hash |
| `hash-chain.js` | Append events; verify chain integrity; detect gaps | Modify or delete past events; change enforcement policy |
| `state-store.js` | Persist approved state using the extension storage API | Export browsing data; silently expand retention windows |
| `message-router.js` | Route declared, validated privileged messages | Accept undeclared message types |
| UI components | Submit scoped, typed policy change requests | Write directly to privileged internal state |

### One-way authority flow

```
User gesture
  -> UI (formats a PolicyChangeRequest)
    -> message-router (validates type and origin)
      -> policy engine (validates semantic legality)
        -> authorization layer (checks permissions)
          -> enforcement layer (applies result)
            -> ledger (records transition)
```

The ML engine submits a RiskEstimate, not a rule. Its output is treated as untrusted input regardless of where it executes.

---

## 5. Decision-Engine Algorithm

Every request evaluation follows this fixed sequence. Steps may not be reordered.

```js
/**
 * AIPP Decision Engine v0.1 reference logic.
 * The engine does not perform I/O, does not mutate policy,
 * and does not call ML directly. ML results are injected as a
 * pre-validated RiskEstimate.
 */
function evaluateRequest(request, policy, risk) {
  // Step 1: Reject malformed or oversized inputs.
  if (!validateRequest(request)) {
    return decision("block", "INVALID_REQUEST");
  }

  // Step 2: Apply hard-block rules. Cannot be overridden.
  const hardRule = matchHardRule(request, policy);
  if (hardRule?.action === "block") {
    return decision("block", "HARD_RULE_MATCH", { ruleId: hardRule.id });
  }

  // Step 3: Apply narrowly scoped, time-bounded exceptions.
  const exception = findValidException(request, policy);
  if (exception && !violatesHardRule(request, policy)) {
    return decision("allow", "AUTHORIZED_EXCEPTION", { exceptionId: exception.id });
  }

  // Step 4: Apply deterministic bundled rules.
  const rule = matchBundledRule(request, policy);
  if (rule) {
    return decision(rule.action, "BUNDLED_RULE_MATCH", { ruleId: rule.id });
  }

  // Step 5: Apply ML risk estimate where policy permits.
  if (risk !== null && policy.mlEnabled) {
    const mlDecision = applyRiskPolicy(request, risk, policy);
    if (mlDecision) return mlDecision;
  }

  // Step 6: Apply documented default action. Never undocumented fallback.
  return decision(policy.defaultAction, "POLICY_DEFAULT");
}

function decision(action, reason, context = {}) {
  return Object.freeze({
    protocol: "AIPP", version: "0.1.0",
    action, reason, context, timestamp: Date.now(),
  });
}
```

### Required before production use

1. Strict URL canonicalization — normalize scheme, host, port, path; reject non-HTTP(S).
2. Resource-type validation — `resourceTypes` must be in the declared allowlist.
3. Exception expiry enforcement — `findValidException` must reject stale exceptions.
4. Rule conflict semantics — block-preferred resolution for same-priority conflicts.
5. Bounded ML execution — classifier returns `null` on timeout, not a default allow.
6. RiskEstimate canonicalization — validate score range, modelId, and evidence vocabulary.

---

## 6. Policy Precedence Rules

| Priority | Category | Override allowed by |
|----------|----------|---------------------|
| 1 | Hard-block rules | Nothing |
| 2 | Valid, scoped user exceptions | Hard-block rules (exception loses) |
| 3 | Deterministic bundled rules | Priorities 1–2 |
| 4 | ML advisory recommendation | Priorities 1–3 |
| 5 | Policy default action | Priorities 1–4 |

The UI must refuse to create an exception that covers a URL matching a hard-block rule. If such an exception exists in stored state, the engine ignores it and logs a `EXCEPTION_SUPPRESSED` ledger event.

---

## 7. Exception Lifecycle

```json
{
  "id":          "uuid-v4",
  "createdAt":   "2026-10-16T10:00:00Z",
  "expiresAt":   "2026-10-17T10:00:00Z",
  "scope":       { "origin": "https://example.com", "resourceTypes": ["script"] },
  "authorizedBy": "USER_EXPLICIT",
  "reason":      "User description"
}
```

Rules:
- `expiresAt - createdAt` must not exceed `policy.maxExceptionDurationMs` (default: 86400000 ms = 24 h).
- Scope wildcards are not permitted in version 0.1.
- Exceptions are checked on every request; expired exceptions are silently dropped and removed at the next retention sweep.
- An exception cannot be extended. A new exception must be explicitly created.
- All exception creation, expiry, and suppression events are recorded in the ledger.

---

## 8. Cryptographic Integrity

### Artifact verification pipeline

Every bundled artifact must pass all four checks before use:

1. **Schema validation** — artifact matches the declared JSON schema.
2. **Version check** — `schemaVersion` and `artifactVersion` are within the supported range.
3. **Hash verification** — SHA-256 digest matches the expected digest in the bundled manifest.
4. **Signature verification** — where a pinned public key or browser-signing mechanism is available, verify the signature. An artifact passing only steps 1–3 but failing step 4 is rejected.

**The self-assertion rule (SEC-05):** The expected hash must come from a source the artifact cannot modify: either the bundled manifest (which is part of the signed extension package) or a separately stored pinned-key signature.

### Hash algorithm

SHA-256 via the Web Crypto API (`crypto.subtle.digest`). No MD5 or SHA-1. The algorithm identifier is stored alongside every digest for upgrade compatibility.

### Canonical serialization

Produced by `src/protocol/canonicalize.js`:
1. Sort all object keys lexicographically (recursive).
2. Strip all whitespace.
3. Encode as UTF-8.

The `eventDigest` field in a ledger event is excluded from its own digest computation.

---

## 9. Local Event Ledger

### Event schema (v1)

```json
{
  "schemaVersion": 1,
  "eventType": "POLICY_VERSION_CHANGED",
  "sequence": 42,
  "previousHash": "sha256:<hex>",
  "elapsedTimeMs": 920000,
  "payload": {
    "policyVersion": "0.1.1",
    "reasonCode": "USER_APPROVED_UPDATE",
    "authorizedBy": "USER_EXPLICIT"
  },
  "eventDigest": "sha256:<hex>"
}
```

`elapsedTimeMs` is monotonic time since extension startup, not wall-clock time. The first event uses `previousHash: "GENESIS"`.

### Declared event types

| Event type | Trigger |
|------------|---------|
| `LEDGER_INITIALIZED` | First run or deliberate reset |
| `POLICY_VERSION_CHANGED` | Policy updated with authorized source |
| `ARTIFACT_VERIFIED` | Artifact passed all integrity checks |
| `ARTIFACT_REJECTED` | Artifact failed any integrity check |
| `EXCEPTION_CREATED` | User created a scoped exception |
| `EXCEPTION_EXPIRED` | Exception reached `expiresAt` |
| `EXCEPTION_SUPPRESSED` | Exception ignored due to hard-block rule |
| `HARD_RULE_MATCH` | Request blocked by a hard rule (throttled 1/min per origin) |
| `ML_MODEL_LOADED` | Model artifact passed verification and activated |
| `INTEGRITY_FAILURE` | Any integrity or hash-chain check failed |
| `LEDGER_CHECKPOINT` | Periodic checkpoint with cumulative hash |
| `EXTENSION_STARTED` | Background script initialized |
| `EXTENSION_RESET` | User triggered full state reset |

### Ledger integrity rules

- Detect and surface missing sequence numbers and broken hash links.
- Any `INTEGRITY_FAILURE` is surfaced in the dashboard; it is never silently repaired.
- Maximum 10,000 events. Oldest events are pruned after a checkpoint is written.
- Ledger contents must not include raw URLs, cookies, query strings, page contents, or PII.

---

## 10. Machine Learning Contract

### Input: BoundedFeatureVector

```ts
interface BoundedFeatureVector {
  requestContextCode:   number;  // enum, not raw URL
  resourceTypeCode:     number;  // enum
  originReputationBin:  number;  // 0-9, no raw domain
  redirectDepth:        number;  // capped at policy.maxRedirectDepth (default: 5)
  headerAnomalyScore:   number;  // 0.0-1.0
  patternMatchCount:    number;  // capped at policy.maxPatternCount (default: 20)
}
```

### Output: RiskEstimate

```ts
interface RiskEstimate {
  riskScore:       number;    // [0.0, 1.0]
  modelId:         string;    // must be in model-manifest.json
  evidenceCodes:   string[];  // declared vocabulary; max 10 codes
  inferenceTimeMs: number;    // rejected if > policy.mlTimeoutMs
}
```

### Authority limits

The ML classifier cannot: write to storage, create or modify exceptions, modify hard rules, approve its own model replacement, or cause the decision engine to skip steps 1–4. Out-of-range scores are clamped and logged.

### Online learning policy (v0.1)

Online learning that silently modifies persistent model state is **not permitted** in version 0.1. Any future local adaptation must: require explicit user authorization, keep the base model unchanged, support one-click rollback, and be recorded in the ledger.

---

## 11. Temporal Trust Policies

### Monotonic elapsed time

All duration measurements use `performance.now()`. Wall-clock time is used only for `expiresAt` fields. After a browser restart, evidence older than `policy.clockUncertaintyWindowMs` (default: 60,000 ms) must be re-validated.

### Evidence decay

```
w(t) = w0 * e^(-lambda * delta_t)

where lambda = ln(2) / tau
      tau    = declared half-life in milliseconds (per evidence type)
      delta_t = elapsed monotonic time since evidence was recorded
```

Decay applies only to evidence types marked `temporal: true` in the policy schema. Permanent rules, trust anchors, and hard-block categories are never subject to decay.

### Expiry types

| Type | Storage | Decay? | Enforcement |
|------|---------|--------|-------------|
| User exceptions | `state-store` | No | Hard cutoff at `expiresAt` |
| ML evidence weights | In-memory | Yes | Rebuilt on restart |
| Origin reputation | In-memory | Yes | Rebuilt on restart |
| Hard rules | Bundled | No | Never expire |
| Artifact hashes | Bundled manifest | No | Never expire |

---

## 12. State and Persistence

### Storage keys

| Key | Content | Max size |
|-----|---------|----------|
| `aipp.policy` | Versioned policy snapshot | 64 KB |
| `aipp.ledger` | Array of ledger event objects | 2 MB (~10K events) |
| `aipp.exceptions` | Array of active ExceptionRecords | 256 KB |
| `aipp.state.version` | Schema migration version | 1 KB |
| `aipp.artifacts.manifest` | Verified artifact manifest | 64 KB |

### Migrations

Each migration in `src/storage/migrations.js` must: have a monotonically increasing version number, be idempotent, record a `POLICY_VERSION_CHANGED` ledger event on completion, and not delete data without an explicit user-facing disclosure.

### Retention

Exceptions are pruned after `expiresAt`. Ledger events beyond 10,000 are pruned after a checkpoint. No browsing data is stored. A "reset all data" function wipes every `aipp.*` key and initializes with a `EXTENSION_RESET` ledger event.

---

## 13. Message Routing and Privilege

All communication passes through `src/background/message-router.js`.

```js
const PRIVILEGED_ROUTES = {
  "policy.requestException": {
    allowedOrigins: ["popup", "dashboard"],
    validator:      validateExceptionRequest,
    handler:        handleExceptionRequest,
  },
  "policy.resetAll": {
    allowedOrigins: ["settings"],
    validator:      validateResetRequest,
    handler:        handleResetRequest,
  },
};
```

Any message whose type is not in `PRIVILEGED_ROUTES` is rejected. Any message from an unauthorized origin is rejected. Content-script messages must never reach privileged handlers directly. Every route must have a corresponding test.

---

## 14. Release and Audit Checklist

### Build integrity
- [ ] Source-only build with no network access during compilation
- [ ] All dependency versions pinned (no `^` or `~` for security-sensitive packages)
- [ ] Build output compared against reviewed source (reproducible build verification)
- [ ] No unexpected files in the packaged extension

### Static analysis
- [ ] ESLint passes with AIPP security rule set (no `eval`, `new Function`, `innerHTML`, remote `import`)
- [ ] All privileged message routes declared and documented
- [ ] `SECURITY.md` cross-reference: every listed protection has an implementing module and a test

### Automated tests
- [ ] `tests/offline/` — all core functions pass with network disabled
- [ ] `tests/adversarial/ml-override.test.js` — ML cannot override hard rules
- [ ] `tests/adversarial/exception-escalation.test.js` — exceptions cannot silently widen
- [ ] `tests/adversarial/malformed-input.test.js` — malformed requests rejected, not fail-open
- [ ] `tests/integrity/hash-chain.test.js` — corruption, truncation, and rollback detected
- [ ] `tests/integrity/artifact-verifier.test.js` — self-asserting artifacts rejected
- [ ] `tests/performance/resource-limits.test.js` — ML timeout, queue limits, cache bounds
- [ ] `tests/privacy/ledger-content.test.js` — no raw URLs or user identifiers in ledger

### Pre-release review
- [ ] All permissions in `manifest.json` reviewed and documented in `SECURITY.md`
- [ ] Every hard-block rule reviewed for correctness and false-positive risk
- [ ] Known limitations updated in `SPEC.md §17` and `THREAT_MODEL.md`
- [ ] Changelog entry written and version bump applied

---

## 15. Implementation Milestones

| Milestone | Deliverables |
|-----------|-------------|
| 01 — Specification | `SPEC.md`, `THREAT_MODEL.md`, `PRIVACY.md`, policy precedence finalized, test stubs for all invariants |
| 02 — Minimal enforcement | `manifest.json`, `bootstrap.js`, `native-rules.js`, `decision-engine.js` (no ML), minimal popup, `tests/offline/` passing |
| 03 — Integrity and state | `artifact-verifier.js`, `hash-chain.js`, `state-store.js`, `migrations.js`, `retention.js`, integrity tests |
| 04 — Temporal and ML | `classifier.js`, `model-registry.js`, `feature-extractor.js`, `evidence-decay.js`, adversarial ML tests, benchmarks |
| 05 — Independent verification | Full release-checklist audit, published known limitations, security disclosure process, reproducible-build docs |

---

## 16. Versioning and Changelog Policy

- Format: `MAJOR.MINOR.PATCH` (SemVer).
- `MAJOR` bumps: breaking changes to policy schema, ledger schema, or security invariants.
- `MINOR` bumps: new features or new invariants.
- `PATCH` bumps: bug fixes that do not change public contracts.
- Every release must list: changed invariants, new permissions, removed features, and known limitations.

---

## 17. Known Limitations

1. **Local tamper evidence is bounded.** A sufficiently privileged attacker with profile access can overwrite the ledger and its checkpoints.
2. **Hashes prove integrity, not goodness.** If both content and expected hash are replaced, a local hash check passes. An external trust anchor is required.
3. **The extension cannot protect against a compromised Firefox binary.**
4. **The extension cannot protect against extensions with equivalent privileges.**
5. **Physical access to an unlocked device** invalidates most local protection guarantees.
6. **Fingerprinting is partially mitigated.** Canvas, WebGL, timing, font, and hardware fingerprinting are outside the scope of v0.1.
7. **Wall-clock time is not tamper-proof.** Exception expiry based on `Date.now()` can be bypassed by OS clock manipulation.
8. **Reproducible builds prove source-to-binary correspondence, not source correctness.**
9. **Static analysis cannot prove the absence of backdoors.** It reduces the search space; it does not eliminate the risk.
10. **The ML classifier is not a cryptographic control.** Miscalibration or adversarial inputs can produce incorrect scores. Hard rules are the primary enforcement mechanism.
