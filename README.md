# AIPP Local

**Adaptive, Integrity-Preserving Privacy Protocol** — v0.1.0

A self-contained Firefox privacy extension with no required backend, no silent policy changes, and no hidden authority.

## What it does

- Blocks trackers, cryptominers, and fingerprinting services via browser-native Declarative Net Request rules.
- Evaluates every request through a deterministic 6-step policy engine with explicit precedence.
- Verifies all bundled rule sets and ML models via a four-step cryptographic integrity pipeline.
- Records every security-relevant state transition in a bounded, hash-chained local audit ledger.
- Enforces time-bounded, narrowly scoped exceptions that cannot silently widen.
- Uses local ML inference in an advisory-only role that cannot override hard rules.

## What it does NOT do

- No backend, account, telemetry, or remote inference.
- No runtime code loading (`eval`, `new Function`, remote imports).
- No cryptocurrency, mining, or blockchain consensus.
- No ML authority over hard security rules.
- No hidden privileged interfaces.

## Security invariants

See [SPEC.md](SPEC.md) §3. A module is not complete until its invariants have automated tests.

## Threat model

See [THREAT_MODEL.md](THREAT_MODEL.md) for adversary profiles, trust boundaries, and explicit protection limits.

## Getting started

```sh
npm install
node scripts/verify-artifacts.js
npm test
```

To load in Firefox: open `about:debugging`, click "Load Temporary Add-on", select `manifest.json`.

## Project structure

```
src/
  background/    Entry point, message router, lifecycle
  enforcement/   DNR rule management, exception lifecycle
  protocol/      Decision engine, schema validation, canonicalization
  intelligence/  Feature extraction, ML classifier, model registry
  temporal/      Evidence decay, monotonic clock, expiry management
  integrity/     Hash, artifact verifier, hash-chain ledger, checkpoints
  storage/       State store, migrations, retention
  ui/            Popup, dashboard, settings
rules/           Bundled tracker/privacy rule sets
models/          Model manifest and versioned model artifacts
tests/           Unit, integration, adversarial, offline, privacy, performance
scripts/         validate-release.js, verify-artifacts.js
```

## Implementation milestones

| Milestone | Status |
|-----------|--------|
| 01 — Specification and threat model | ✅ Complete ([SPEC.md](SPEC.md), [THREAT_MODEL.md](THREAT_MODEL.md), [SECURITY.md](SECURITY.md)) |
| 02 — Minimal Firefox enforcement & UI | ✅ Complete (Popup, Dashboard, Settings, DNR compilation) |
| 03 — Integrity and state | ✅ Complete (Hash-chain ledger, checkpointing, state store) |
| 04 — Temporal engine and ML advisory | ✅ Complete (Evidence decay, monotonic clock, classifier) |
| 05 — Independent verification & tests | ✅ Complete (10-invariant test suite, release validation) |

## License

To be determined before public release. No license grants are made in this draft.
