# Design

## Context

See `proposal.md` for motivation and the spec deltas for the behavior contract.

The hardware seam already exists in `src/runtime/hardware.ts`
(`assertDeviceAvailable`) and `src/runtime/opencode/container-client.ts`, which
validates configured paths and emits `--device`/`--group-add` through
`buildDockerRunArgs` (`src/runtime/sandbox.ts`). `EnvironmentSpec`
(`src/config/types.ts`) carries `devices` as `string[]` and `groups` as
`(string | number)[]`.

The turn instruction is built host-side by `buildSkillPrompt` in
`src/runtime/opencode/opencode-runtime.ts`. It receives only `TurnContext`;
`TurnRequest` already carries the `environment`, so the runtime can see the
exposed devices without widening `TurnContext`. The container client serializes
the prompt into the runner's stdin payload (`src/runner.ts`), and the runner
drives the in-container OpenCode host.

Three knowledge layers matter:

```
config (environment.devices)      -> what is exposed, plus an optional hint
host probe (udev properties)      -> vendor/product/model/serial/subsystem
repository documentation          -> sensors, display, pin map, protocol
```

Only the first two cross the orchestrator. The third stays in the repository,
because USB enumeration cannot observe a wired sensor or an attached display.

## Goals / Non-Goals

**Goals:**

- Advertise exactly the devices the environment exposes, with configured hints
  and host-detected identity.
- Keep the advertisement cheap and bounded: a compact instruction block plus an
  on-demand manifest, not a growing prompt section.
- Degrade gracefully when the host cannot probe a device; the existing
  availability check remains the only hard failure.
- Leave bare `devices` paths fully backward compatible.

**Non-Goals:**

- Ambient host inventory for the agent, including devices the environment does
  not expose.
- Non-USB devices, dynamic re-enumeration, exclusive device locking, or a
  hardware broker.
- Advertising hardware to in-process turns, which configure no environment and
  keep their current instruction.
- Verifying operator-declared physical attachments (sensors, display) against
  the device.
- Tracking hardware identity as state between turns.

## Decisions

### 1. A device entry is a path or a path-plus-description object

`environment.devices` accepts either the existing bare path or:

```yaml
environment:
  devices:
    - path: /dev/qtpy2
      description: Adafruit QT Py ESP32-S2; e-ink display and sensors wired to it
    - /dev/jtum120
```

Rationale: the hint travels with the exposure, so it cannot drift from the list
of mapped paths, and a repository that wants no hints keeps writing strings.
The loader normalizes both forms to a path plus an optional description before
validation, and validation keeps rejecting empty or relative paths. A malformed
object (no path, empty description, non-string field) fails startup naming the
repository, consistent with the existing device validation.

Alternatives considered:

- **Separate `hardware` block keyed by path** - keeps `devices` untouched, but
  duplicates the path list and lets the two drift.
- **Repository-level hardware note only** - no config change, but then the
  advertisement cannot tie a hint to a specific exposed path and the orchestrator
  has nothing to advertise when the repository lacks such a note.

### 2. Host identity is best-effort enrichment, not a dependency

At turn start, next to the availability check, probe each configured path with
`udevadm info --query=property --name=<path>` and read the vendor/product IDs,
model, serial, subsystem, and devlinks. The probe is injectable like
`DeviceStat`/`GroupResolver`, so tests run without udev.

Rationale: the host already owns device naming and permissions through udev, so
its property database is the cheapest identity source and follows stable
symlinks. A missing `udevadm`, a non-zero exit, or an unparseable result yields
an identity-less entry rather than a failed turn; the path check remains the hard
gate. Running the probe on the host, not inside the container, means the
advertisement works even for an image without `usbutils`.

Alternatives considered:

- **Walk sysfs directly** - more code and more failure modes for the same fields.
- **`lsusb` on the host** - lists USB devices but does not correlate them to the
  configured device node without extra matching.
- **Probe inside the container** - loses host udev aliases and requires tooling in
  every flavour.

### 3. Advertise only a turn with an environment that exposes devices

`OpenCodeRuntime` composes the advertisement when `request.environment` has a
non-empty device list. In-process turns have no environment and are unchanged.
Both propose and apply turns get the same advertisement, because a hardware
change's proposal benefits from knowing the constraints and the protocol as much
as the implementer does.

The instruction gains a short block:

```
Hardware exposed to this turn:
- /dev/qtpy2 - Adafruit QT Py ESP32-S2 (USB 239a:8111, serial ...)
- /dev/jtum120 - JT-UM120 meter (USB 2e3c:5558)
Full detail: /tmp/orchestrator-hardware.json
A turn holds these devices until it ends.
```

The block is capped by the number of configured devices, not by arbitrary
detail; the manifest carries the rest.

### 4. The manifest travels in the turn payload and is written outside the worktree

The host builds a JSON manifest describing the normalized devices and detected
identity, adds it to the runner payload, and the runner writes it to a fixed
container path (`/tmp/orchestrator-hardware.json`) before prompting the agent.
The instruction names that path.

Rationale: no extra host temp file or bind mount, no new `docker run` argument,
and the existing stdin protocol already carries the payload. `/tmp` is outside the
mounted worktree, so the manifest cannot be committed, and the container's
writable `HOME=/tmp` already exists. The path is a constant shared by the
instruction and the runner, so the agent and the writer agree.

Alternatives considered:

- **Bind-mount a host-generated file** - keeps the runner simpler but adds a temp
  file lifecycle, a new mount in `buildDockerRunArgs`, and a path the image could
  theoretically own.
- **Inline the full manifest in the instruction** - no file handling, but every
  turn pays the tokens whether or not it touches hardware.
- **Have the runner probe the container's devices itself** - loses host identity
  and duplicates the probe.

### 5. Physical context stays repository-owned

The advertisement names what the environment exposes. It does not attempt to
describe attached sensors, displays, or protocols; the turn instruction points
the agent at the repository's own documentation for that. This keeps the
orchestrator's claim factual and avoids advertising hardware knowledge that only
a human can verify.

### 6. Diagnostics reuse the same inventory

The resolved inventory is logged as a verbose per-turn diagnostic, so an operator
can confirm that a configured stable name resolved to the expected USB identity
without running a turn. This is logging only; it changes no label, comment, or
workflow decision.

## Risks / Trade-offs

- **Prompt cost every turn** -> the instruction carries only path, hint, and
  identity; detail lives in the manifest. A repository with no devices pays
  nothing.
- **Stale description** -> a declared hint can disagree with the plugged device.
  Mitigation: the detected identity is shown next to it, and the mismatch is
  diagnostic rather than a failure, because only the path check is authoritative.
- **Probe inconsistency** -> `udevadm` may be absent or report partial properties.
  Mitigation: identity fields are optional and the advertisement falls back to
  path plus description.
- **Manifest path collision** -> an image could already use
  `/tmp/orchestrator-hardware.json`. Mitigation: the runner overwrites it before
  the prompt and the instruction names it explicitly, so the turn reads the
  orchestrator's copy.
- **Encouraging hardware actions** -> naming a device invites the agent to reset
  or flash it. Mitigation: access remains opt-in per repository, the instruction
  states the device is held for the turn, and the existing trust-boundary
  documentation applies.
- **Description as untrusted text** -> the description is operator configuration,
  not repository content, so it is trusted like the rest of the config; it is
  emitted as plain text, not executed.

## Migration Plan

- Additive: bare `devices` strings keep working, and a repository that sets no
  devices sees no instruction or manifest change.
- Existing deployments need no host change beyond the udev rules they already
  use for device access; `udevadm` ships with the systemd/udev host setup.
- Rollback is removing the descriptions or reverting the orchestrator; no stored
  state or config migration is involved.

## Open Questions

None blocking. Extending the advertisement to in-process turns and surfacing the
inventory in the status UI are deferred follow-ups, not prerequisites.
