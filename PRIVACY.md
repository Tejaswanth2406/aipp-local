# PRIVACY.md — AIPP Local Data Handling

## Data stored locally

| Key | Content | Retention |
|-----|---------|-----------|
| `aipp.policy` | Versioned policy snapshot | Until reset |
| `aipp.ledger` | Security event records (no URLs, no PII) | Max 10,000 events |
| `aipp.exceptions` | Scoped, time-bounded exceptions | Until `expiresAt` |
| `aipp.state.version` | Migration version counter | Until reset |
| `aipp.artifacts.manifest` | Artifact hash manifest | Until reset |

## Data never stored

- Raw URLs visited by the user.
- Page contents, HTML, or scripts.
- Cookies or session identifiers.
- Query strings or form data.
- User identifiers of any kind.

## Data never transmitted

No data is transmitted to any server. The extension has no network permissions for outbound connections. `connect-src 'none'` is enforced in the Content Security Policy.

## Ledger privacy

The audit ledger records only security-relevant state transitions. It contains event types, timestamps, policy version identifiers, exception identifiers, and artifact identifiers. It does not contain browsing history.

## Limitations

See THREAT_MODEL.md §5 and SPEC.md §17 for explicit protection limits.
A sufficiently privileged attacker with profile access can read or modify locally stored data.
