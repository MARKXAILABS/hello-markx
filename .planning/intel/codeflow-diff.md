# CodeFlow Diff — baseline → final

- **Baseline captured:** 2026-08-22T06:50:25.653Z
- **Final captured:** 2026-08-23T14:50:18.266Z

## Headline

- 🟡 **WARN** — Health score dropped by 1 (62 → 61)
- 🔴 **HIGH** — 16 new HIGH-severity security finding(s)
- 🟡 **WARN** — Layer violations increased by 8 (274 → 282)
- 🟡 **WARN** — Unused functions increased by 1

## Health

- Score: 62 → 61 (delta -1)

## Security findings

- New HIGH: 16
- New (any severity): 31
- Resolved: 15

### New HIGH severity findings
- `src/main/config.ts:552` — finding
- `src/main/config.ts:553` — finding
- `src/main/config.ts:554` — finding
- `src/main/config.ts:555` — finding
- `test/config-secrets.test.cjs:100` — finding
- `test/config-secrets.test.cjs:101` — finding
- `test/config-secrets.test.cjs:102` — finding
- `test/config-secrets.test.cjs:103` — finding
- `test/config-secrets.test.cjs:105` — finding
- `test/engine-parity.test.cjs:669` — finding
- `test/hive-durability.test.cjs:234` — finding
- `test/hive-durability.test.cjs:246` — finding
- `test/net-binding.test.cjs` — finding
- `test/telemetry-auth.test.cjs:467` — finding
- `test/voice-messages.test.cjs:203` — finding
- `test/webhook-endpoints.test.cjs:56` — finding

## Circular dependencies

- New: 0
- Resolved: 0

## Layer violations

- Before: 274
- After: 282
- Delta: +8

## Unused functions

- Before: 15
- After: 16
- Delta: +1
