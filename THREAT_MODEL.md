# THREAT_MODEL.md — AIPP Local Threat Model

Version: 0.1.0 · Status: Draft · Date: 2026-10-16

---

## 1. Overview

This document describes the adversaries AIPP Local is designed to resist, the failure modes it is designed to detect, and the explicit boundaries where it provides no protection. It is the companion to SPEC.md and must be updated alongside it.

A threat model is only useful if it is honest about limits. Any protection claim not listed here with a corresponding control in SPEC.md is unverified.

---

## 2. Assets

| Asset | Description | Value |
|-------|-------------|-------|
| User browsing privacy | Which sites a user visits, when, and how often | High |
| Policy integrity | The set of rules that determines what is blocked and allowed | Critical |
| Extension authenticity | Confidence that the running code matches the reviewed source | Critical |
| Audit ledger | Tamper-evident record of security-relevant state transitions | High |
| ML model confidentiality | The trained model artifact and its parameters | Medium |
| Exception records | User-authorized temporary allowances | High |
| Trust anchors | Pinned keys and expected hashes used to verify artifacts | Critical |

---

## 3. Trust Boundaries

```
+--------------------------+
|   Firefox browser        |  <-- Trusted: not in AIPP's control
|  +-----------------------+
|  |   AIPP background     |  <-- Trusted execution context
|  |   service worker      |
|  |   (bootstrap.js,      |
|  |    message-router.js) |
|  +----+------------------+
|       |  Declared message routes only
|  +----v------------------+
|  |   AIPP UI             |  <-- Partially trusted: validated inputs only
|  |   (popup, dashboard)  |
|  +-----------------------+
|       |  No direct state writes
|  +----v------------------+
|  |   Content scripts     |  <-- Untrusted: sandboxed, no privileged access
|  +-----------------------+
+-----------+--------------+
            |
     External network       <-- Untrusted: filtered by enforcement layer
```

The background service worker is the only component that may write to `browser.storage.local`. The UI submits typed requests through message-router. Content scripts have no access to privileged handlers.

---

## 4. Adversary Profiles

### A1 — Malicious website or tracker

**Goal:** Track user behavior, fingerprint the browser, abuse permissions, or exploit extension messaging.

**Capability:** Can serve arbitrary content, set cookies, redirect requests, inject scripts into page context, and attempt to communicate with the extension via `window.postMessage` or externally connectable APIs.

**AIPP controls:**
- Declarative Net Request rules block known tracker origins.
- Content-script isolation prevents direct access to the background context.
- All externally connectable APIs must be declared and are disabled in v0.1.
- `postMessage`-based attacks are mitigated by content-script origin checking.

**Residual risk:** Browser fingerprinting via canvas, WebGL, fonts, and timing is not fully mitigated in v0.1. Sophisticated trackers using first-party context may partially evade rule-based blocking.

---

### A2 — Malicious, compromised, or accidentally corrupted rule or model artifact

**Goal:** Introduce rules or a model that weakens privacy protections, introduces false allows, or causes the extension to crash.

**Capability:** May replace bundled artifact files if the attacker can write to the extension's installation directory (requires OS-level access or a compromised build process).

**AIPP controls:**
- Artifact verification pipeline (schema + version + hash + optional signature) runs before any artifact is used (SPEC §8).
- Expected hashes are stored in the bundled manifest, which is part of the signed extension package.
- Corrupted or invalid artifacts are rejected; the extension logs `ARTIFACT_REJECTED` and falls back to defaults.
- ML models have declared `validUntil` dates; expired models are deactivated.

**Residual risk:** If the attacker controls both the artifact and the bundled manifest (i.e., full build-pipeline compromise), local hash verification cannot detect the substitution. An external trust anchor (browser signing) is the final defense.

---

### A3 — Silent policy manipulation

**Goal:** Modify AIPP's policy without the user's knowledge, either to weaken protections or to track user behavior.

**Capability:** May attempt to inject policy changes through the extension messaging API, the storage API (if another extension has write access), or through a malicious rule update.

**AIPP controls:**
- Every policy write is recorded in the ledger with `changeType`, `authorizedSource`, and policy version before/after.
- The message router rejects any message type not in the declared allowlist (SEC-07).
- The UI cannot write directly to storage; it submits typed requests through the authority chain.
- Storage writes are gated by the authorization layer in the background service worker.

**Residual risk:** A malicious Firefox extension with equivalent privileges may be able to write to `browser.storage.local` directly. AIPP cannot defend against this.

---

### A4 — ML poisoning and adversarial inputs

**Goal:** Mislead the classifier into producing incorrect risk scores, either to cause false allows or to exhaust resources.

**Capability:** Can craft HTTP requests designed to produce extreme or misleading feature vectors.

**AIPP controls:**
- The classifier only receives `BoundedFeatureVector`; raw URLs and identifiers are never exposed to the model (SPEC §10).
- Feature values are clamped to declared ranges before inference.
- Classifier must return within `policy.mlTimeoutMs`; a timeout returns `null`, not a default allow.
- Out-of-range outputs are clamped and logged.
- ML scores cannot override hard rules or bundled deterministic rules (SEC-04).

**Residual risk:** A sufficiently adversarial input may cause the classifier to produce a misleading score that affects the advisory ML stage. Hard rules are unaffected.

---

### A5 — Malicious code contribution

**Goal:** Introduce a backdoor or weakened control through a code contribution, a dependency, or a build step.

**Capability:** Can submit pull requests, publish malicious npm packages, or poison the build environment.

**AIPP controls:**
- Security-sensitive changes require review (release checklist item).
- All dependency versions are pinned with no range specifiers on security-sensitive packages.
- Static analysis (ESLint + custom rules) rejects known unsafe patterns.
- Reproducible build process allows comparison of reviewed source to published binary.
- `scripts/validate-release.js` checks for unexpected files and undeclared permissions.

**Residual risk:** Static analysis cannot prove the absence of a backdoor. It raises the cost and reduces the search space. Independent human review remains necessary.

---

### A6 — Clock manipulation

**Goal:** Manipulate system time to prevent exception expiry, extend trust windows, or corrupt monotonic elapsed-time measurements.

**Capability:** Can modify the OS system clock (requires OS-level access or privileged malware).

**AIPP controls:**
- Session-scoped durations use `performance.now()` (monotonic within a session), which is unaffected by clock adjustments during a session.
- After a browser restart, clock uncertainty is acknowledged explicitly: evidence older than `policy.clockUncertaintyWindowMs` is re-validated.
- Wall-clock time (`Date.now()`) is used only for human-readable `expiresAt` fields; these are acknowledged as clock-manipulation-susceptible in SPEC §17.

**Residual risk:** An attacker who can pause the browser process and then restart it with a manipulated clock can bypass elapsed-time protections. This is within the threat model's explicit limits.

---

### A7 — Rollback attack

**Goal:** Replace a newer, more secure artifact or policy with an older, less secure version.

**Capability:** Can rewrite extension storage or artifact files if OS-level access is available.

**AIPP controls:**
- Policy versions are monotonically tracked; loading a policy version lower than the stored version is rejected and logged as `INTEGRITY_FAILURE`.
- Artifact manifests include `artifactVersion` fields; older versions are rejected.
- The ledger's sequence numbers and hash chain detect gaps and out-of-order events.

**Residual risk:** If the attacker can rewrite both the ledger and the current policy version counter, local rollback detection is defeated. An external trust anchor remains the final defense.

---

### A8 — Resource exhaustion

**Goal:** Exhaust CPU, memory, or storage to degrade or disable the extension.

**Capability:** Can submit pathological URLs, oversized payloads, or high-frequency requests.

**AIPP controls:**
- All queues, caches, and log buffers have explicit size limits (SEC-06).
- ML inference is bounded by `policy.mlTimeoutMs`.
- Ledger is bounded at 10,000 events; overflow triggers pruning after a checkpoint.
- Input validation rejects oversized inputs before processing (Step 1 of the decision engine).
- `tests/performance/resource-limits.test.js` verifies all bounds under adversarial load.

**Residual risk:** A very high request rate from a malicious page may cause the decision engine to queue requests. The extension must degrade gracefully (blocking unknown requests) rather than fail open.

---

## 5. Explicit Protection Limits

AIPP Local explicitly does NOT protect against:

| Limit | Reason |
|-------|--------|
| Compromised Firefox binary | The browser is a trusted component outside AIPP's control |
| Malicious OS | An OS-level attacker can overwrite any file or intercept any call |
| Extensions with equivalent privileges | Other extensions can write to shared storage |
| Physical access to an unlocked device | Physical access bypasses all software controls |
| Every fingerprinting technique | Canvas, WebGL, font, and hardware fingerprinting are not fully mitigated in v0.1 |
| Post-compromise forensics | The ledger is not a forensic-grade audit trail |
| Network-level surveillance | AIPP does not route through a VPN or Tor |
| DNS-level tracking | DNS queries are outside the extension API boundary |

---

## 6. Security Property Claims

Each claim below maps to a control in SPEC.md and a test that must pass before release.

| Claim | Control | Test |
|-------|---------|------|
| Third-party tracker requests are blocked | `native-rules.js` + `bundled-rules.json` | `tests/offline/enforcement.test.js` |
| Hard rules cannot be overridden by ML | `decision-engine.js` step ordering | `tests/adversarial/ml-override.test.js` |
| All policy changes are recorded | `hash-chain.js` + ledger events | `tests/integrity/ledger-events.test.js` |
| Corrupted artifacts are rejected | `artifact-verifier.js` | `tests/integrity/artifact-verifier.test.js` |
| Extension functions without network | All modules | `tests/offline/` (full suite) |
| Exceptions expire and cannot escalate | `expiry-manager.js` | `tests/adversarial/exception-escalation.test.js` |
| Ledger detects corruption and gaps | `hash-chain.js` | `tests/integrity/hash-chain.test.js` |
| Malformed inputs are rejected | `decision-engine.js` step 1 | `tests/adversarial/malformed-input.test.js` |
| No raw URLs in ledger | `hash-chain.js` sanitization | `tests/privacy/ledger-content.test.js` |
| Resource limits are enforced | All modules | `tests/performance/resource-limits.test.js` |

---

## 7. Residual Risk Summary

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Build-pipeline compromise | Low | Critical | Reproducible builds, dependency pinning, release audit |
| Malicious co-installed extension | Medium | High | Documented limit; recommend extension hygiene |
| Advanced fingerprinting evasion | High | Medium | Out-of-scope for v0.1; tracked for future milestone |
| Sophisticated first-party tracking | High | Medium | Hard rules cover known patterns; ML provides advisory signal |
| Ledger tampering by privileged attacker | Low | Medium | Documented limit; external trust anchor required |
| Clock manipulation | Low | Low | Monotonic session timers; acknowledged in SPEC §17 |

---

## 8. Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-10-16 | 0.1.0 | Initial draft |
