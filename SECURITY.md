# SECURITY.md — AIPP Local Security Claims

Each row maps an advertised protection to its implementing module and test.
A CI check confirms all three entries exist before release (SEC-10).

| Protection | Module | Test |
|------------|--------|------|
| Third-party tracker blocking | `src/enforcement/native-rules.js` + `rules/bundled-rules.json` | `tests/offline/enforcement.test.js` |
| Hard rules cannot be overridden by ML | `src/protocol/decision-engine.js` | `tests/adversarial/ml-override.test.js` |
| All policy changes recorded | `src/integrity/hash-chain.js` | `tests/integrity/ledger-events.test.js` |
| Corrupted artifacts rejected | `src/integrity/artifact-verifier.js` | `tests/integrity/artifact-verifier.test.js` |
| Offline operation | All modules | `tests/offline/` (full suite) |
| Exceptions expire and cannot escalate | `src/temporal/expiry-manager.js` | `tests/adversarial/exception-escalation.test.js` |
| Ledger detects corruption and gaps | `src/integrity/hash-chain.js` | `tests/integrity/hash-chain.test.js` |
| Malformed inputs rejected | `src/protocol/decision-engine.js` step 1 | `tests/adversarial/malformed-input.test.js` |
| No raw URLs in ledger | `src/integrity/hash-chain.js` sanitization | `tests/privacy/ledger-content.test.js` |
| Resource limits enforced | All modules | `tests/performance/resource-limits.test.js` |

## Permissions

| Permission | Reason |
|------------|--------|
| `declarativeNetRequest` | Apply privacy enforcement rules |
| `declarativeNetRequestFeedback` | Read rule match counts for dashboard |
| `storage` | Persist policy, ledger, and exceptions locally |
| `alarms` | Schedule periodic expiry and retention sweeps |

## Disclosure

To report a security issue, open a GitHub Security Advisory (link TBD before public release).
Do not open public issues for security vulnerabilities.
