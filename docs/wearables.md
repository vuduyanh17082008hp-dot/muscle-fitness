# Wearable Provider Layer

## Why this exists

Muscle Fitness is a web product. A browser cannot read Apple
HealthKit or Android Health Connect directly — both are native,
sandboxed platform APIs that only a native (or hybrid) mobile app can
access. Rather than distort the web architecture to fake native
access, this layer defines a **provider-neutral contract** any real
adapter — native or server-to-server — normalizes into, and ships
exactly one working implementation today: a clearly labeled **demo**
provider.

```
WearableProvider  →  normalize  →  Athlete Digital Twin
```

## Canonical signal shape

Every provider — real or demo — returns a `WearableSnapshotBundle`
(`lib/wearables/types.ts`): one `WearableDailySnapshot` per day, with
resting heart rate, average heart rate, HRV (ms), sleep (total/REM/
deep minutes), steps, respiratory rate, and skin temperature delta.
Every field is independently nullable — a real provider rarely reports
all of them, and a caller must never assume otherwise.

## What's implemented today

| Provider | Status | Notes |
|---|---|---|
| `demo` | **Implemented** | Deterministic fixture data, four named scenarios (`lib/demo/scenarios.ts`). Never claims to be a real device. |
| `apple_healthkit` | Documented, not built | Requires a native iOS app or companion — HealthKit cannot be read from web JS. |
| `health_connect` | Documented, not built | Requires a native Android app — same constraint as HealthKit. |
| `garmin` | Documented, not built | Garmin Connect has a server-to-server OAuth API — buildable from this backend, needs a developer account + OAuth flow + sync job. |
| `oura` | Documented, not built | Oura Cloud API — same shape of work as Garmin. |
| `whoop` | Documented, not built | WHOOP API — same shape of work as Garmin. |

See `lib/wearables/registry.ts` — `FUTURE_WEARABLE_PROVIDERS` is data,
not code; there is no stub function anywhere pretending to be a real
adapter.

## Native integration boundary

- **HealthKit** belongs in an Apple-native (Swift/SwiftUI or a React
  Native module with native HealthKit bridging) layer, running as its
  own iOS target or companion app, syncing to this backend over the
  existing API surface.
- **Health Connect** belongs in an equivalent Android-native layer.
- Neither should ever be simulated inside the web app — a browser
  "requesting HealthKit permission" would be fake UI with nothing
  behind it, which this project treats as a hard line not to cross.

## Adding a real server-to-server provider (Garmin/Oura/WHOOP)

1. Register a developer application with the provider, get OAuth
   credentials.
2. Build the OAuth authorize/callback flow and store the resulting
   token server-side (never in a client-bundled file).
3. Implement `WearableProvider` (`lib/wearables/types.ts`) — the same
   interface the demo provider already satisfies — mapping that
   provider's API response into `WearableDailySnapshot[]`.
4. Register it in `lib/wearables/registry.ts` and move its entry out
   of `FUTURE_WEARABLE_PROVIDERS`.
5. No other code changes needed: the Athlete Digital Twin, Recovery
   Radar, and Experiment Lab all consume the same normalized shape.

## Demo Data Control

See `lib/demo/scenarios.ts` and `lib/demo/settings.ts`. A user's demo
mode is strictly per-account (RLS-scoped `user_demo_settings` row) and
every surface that consumes demo wearable data marks it
`isDemo: true` end to end (`AthleteState.wearable.isDemo`,
`HawkerLensResult.isDemo`, Recovery Radar limitations) so it can never
be mistaken for a real connection.
