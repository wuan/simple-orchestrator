# Design

## Context

See `proposal.md` - Why. The constraints that shape the approach:

- A containerized turn is started by `ContainerOpenCodeClient`, which builds its
  argv through `buildDockerRunArgs` and then runs `docker run --rm -i <flags>
  <image> ...`. The environment's fields travel on the turn request
  (`TurnRequest.environment`) and the client reads them when it builds the args.
- `docker run` uses the local image for a reference and only pulls when the
  image is absent. Published flavours advance `latest` on every default-branch
  push, but nothing re-resolves the tag after the first pull, so a long-running
  orchestrator keeps using the image it first fetched.
- Docker's `docker run` already supports a `--pull` policy (`always`, `missing`,
  `never`) that resolves the tag's current manifest, reuses the layer cache when
  the content is unchanged, and fails when the image cannot be resolved. The
  existing turn failure path already reports an image that cannot be pulled or
  started.
- A repository's turns all run on one orchestrator machine, and different
  repositories can configure different images or the same image, so the policy
  belongs on the per-repository environment like the other fields.

## Goals / Non-Goals

**Goals:**

- A turn runs the image its configured reference currently names, so a mutable
  tag such as `latest` picks up a published image before the next turn.
- An operator can choose to keep Docker's default behavior or run fully offline.
- A digest-pinned image is not re-checked, because it cannot change.
- The behaviour is the orchestrator's, visible in the emitted container command,
  and covered by unit tests.

**Non-Goals:**

- Changing how images are built or published, their tags, or their platforms.
- Watching the registry in the background or between turns; the check happens
  when a turn starts.
- A per-image cache of the last resolved digest. Docker's own image store
  already makes an unchanged pull cheap.
- Managing registry credentials; the operator's Docker configuration keeps
  providing them, as it does for the initial pull.

## Decisions

### Refresh with Docker's `--pull` rather than a hand-rolled digest comparison

Pass the resolved policy to `docker run` as `--pull <policy>`. Docker already
resolves the reference to the current manifest, skips downloading layers whose
digests it has, and surfaces an unreachable registry as a run failure that the
existing error path turns into a failed turn.

Alternatives considered:

- Compare the local image's digest with the registry's (`docker image inspect`
  versus `docker manifest inspect`) and pull only on a difference: more code to
  own, needs its own registry-auth and error handling, and duplicates what
  Docker's pull already does. It only avoids a manifest round-trip, which is not
  worth the added failure surface.
- Re-pull every turn with an unconditional `docker pull` before `docker run`:
  two commands per turn, a race between the pull and the run if the tag moves
  again, and no policy knob.
- Keep `missing` and document "run `docker pull` yourself": leaves the stale
  image in place, which is the problem the issue reports.

### Default to checking the registry

The default policy is `always`, so a repository that names a mutable tag gets
the freshness the issue asks for without opting in. `missing` preserves the
previous behavior and `never` supports a host that cannot reach a registry.

### Treat a digest reference as immutable

When the image reference encodes a digest (`...@sha256:...`), the orchestrator
uses `missing` regardless of the configured policy: there is no newer image for
a digest, so a registry round-trip can only fail or waste time. This mirrors how
the image contract already recommends pinning what must not drift.

### Fail the turn when a required refresh fails

If the policy requires a check and the registry cannot be reached or the
credential is rejected, the turn fails with the container diagnostic instead of
falling back to the cached image. Falling back would silently reintroduce the
stale image the change removes; an operator who needs offline operation sets
`never` or pins a digest explicitly.

### Keep the policy on the existing environment pass-through

`pull` is a plain field on `EnvironmentSpec`, so it flows through the existing
`defaults` merge, `resolveEnvironment`, and `TurnRequest.environment` exactly
like `network` and `caches`. No new plumbing or runtime interface change is
needed; `buildDockerRunArgs` just emits the flag.

## Risks / Trade-offs

- [A registry round-trip on every turn adds latency] -> it is a manifest
  resolution, not a re-download, and turns are minutes long; `missing` removes
  it for operators who care.
- [A registry outage now fails turns that would previously run the cached
  image] -> that is the intended freshness guarantee; `never` or a digest pin is
  the documented escape hatch.
- [`always` changes existing deployments' behaviour] -> the change is the point
  of the issue, the previous behaviour is a documented one-value opt-out, and
  the release notes and configuration docs call it out.
- [The digest special case surprises an operator who set `always`] -> it is
  documented next to the policy and pinned by a test; there is no update for a
  digest to find.

## Migration Plan

1. Land the code, config, docs, and tests on a pull request.
2. On upgrade, a repository with a mutable tag and no `pull` set starts checking
   the registry before each turn; no configuration change is required.
3. An operator who wants the old behaviour sets `environment.pull: missing`, and
   one who wants no registry access sets `never`. Rollback is removing the field
   and the emitted flag.

## Open Questions

None blocking. The default is deliberately `always`; if the maintainers prefer a
quieter default, changing `DEFAULT_ENVIRONMENT_PULL` to `missing` is a one-line
change with no spec change beyond the scenario that names the default.
