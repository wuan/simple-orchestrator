# Proposal

## Why

A hardware turn can open the host devices its environment exposes, but the agent
is never told what they are. It sees `/dev/qtpy2` and `/dev/jtum120` and has to
discover them from inside the container, which yields USB IDs at best and never
reveals the physical context: which sensors and display are wired to the board,
what the meter measures, or how the board behaves when flashed. The orchestrator
already knows exactly which devices it exposed, so the turn should advertise that
knowledge instead of leaving the agent to guess.

## What Changes

- Let an `environment.devices` entry carry a short description alongside its
  path, while a bare path keeps working, so the one-line hint travels with the
  exposure and cannot drift from it.
- At turn start, enrich each exposed device with best-effort host identity
  (vendor/product, model, serial, subsystem), degrading to the configured
  description when the host cannot be probed rather than failing the turn.
- Hand the turn a hardware advertisement: a compact line in the turn instruction
  naming the exposed devices, plus a read-only manifest outside the worktree with
  the full detail for the agent to read when its task touches hardware.
- Advertise only devices the environment exposes. No ambient host inventory
  reaches the agent, so the advertisement stays inside the existing
  least-privilege boundary.
- Leave physical context that cannot be discovered over USB (sensors, display,
  pin map, protocol) to the repository's own documentation. The orchestrator
  points at it rather than copying it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator-configuration`: `environment.devices` accepts an optional
  per-device description alongside the path, with the existing path validation
  unchanged and bare paths still valid.
- `agent-runtime`: a containerized turn's instruction advertises the hardware its
  environment exposes, and the turn can read a per-turn hardware manifest, while
  the advertisement remains bounded to exposed devices.

## Impact

- `src/config/types.ts` and the config loader/validator: the `devices` entry
  shape gains an optional description.
- `src/runtime/hardware.ts`: best-effort host identity for a configured path,
  next to the existing availability check.
- `src/runtime/opencode/opencode-runtime.ts`: the turn instruction gains the
  hardware advertisement when the turn has an environment with devices.
- `src/runtime/opencode/container-client.ts` and `src/runner.ts`: carry and
  expose the per-turn manifest outside the worktree.
- `docs/configuration.md` and `environments/README.md`: document the description
  field, the advertisement, and what remains repository-owned.
- In-process turns are unchanged: they configure no devices and keep their
  current instruction.
