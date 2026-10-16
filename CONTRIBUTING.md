# CONTRIBUTING.md

## Before contributing

Read SPEC.md and THREAT_MODEL.md. Every contribution to a security-sensitive module must:
1. Maintain or strengthen the relevant security invariants (SPEC.md §3).
2. Include or update automated tests for affected invariants.
3. Not introduce `eval`, `new Function`, `innerHTML`, or remote code loading.
4. Pass `npm test` and `node scripts/validate-release.js` with no errors.

## Security-sensitive modules

Changes to these files require explicit security review before merge:
- `src/background/bootstrap.js`
- `src/background/message-router.js`
- `src/protocol/decision-engine.js`
- `src/integrity/`
- `src/enforcement/`
- `manifest.json`
- `rules/bundled-rules.json`

## Adding a new message route

1. Add the route to `PRIVILEGED_ROUTES` in `message-router.js`.
2. Add a validator function (pure, throws on invalid input).
3. Add a test in `tests/unit/message-router.test.js`.
4. Update `SECURITY.md` if the route affects a listed protection.

## Adding a new bundled rule

1. Add the rule to `rules/bundled-rules.json`.
2. Validate it against `rules/schema.json`.
3. If it is a hard rule, document it in `SECURITY.md` with a rationale.
4. Review for false-positive risk.

## Release process

Follow the checklist in SPEC.md §14 in full. No release without a complete checklist.
