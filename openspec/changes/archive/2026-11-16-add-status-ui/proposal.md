# Proposal

## Why

The orchestrator tracks many repositories, but its state is only visible as
lifecycle labels on each pull request and as lines in the journal. An operator
has no single place to see which issues and pull requests are currently active,
so answering "what is the orchestrator working on right now?" means visiting
each repository and pull request by hand.

## What Changes

- Add an **opt-in, read-only status view** served by the running orchestrator
  over HTTP:
  - `GET /` renders an HTML overview; `GET /status.json` returns the same data
    in a machine-readable form.
  - Each configured repository lists its active work: trigger-labeled issues
    whose workflow has not started (queued), and in-flight pull requests grouped
    by phase (`proposing`, `ready`, `implementing`, `failed`).
  - The view is strictly read-only: it reads through the existing provider
    interface and never writes labels, comments, or pull requests.
- Add a top-level `status` configuration block with `enabled` (default `false`),
  `host` (default `127.0.0.1`), and `port` (default `8787`). The service stays
  outbound-only by default; the listener is opt-in and bound to loopback, and an
  operator can set an explicit (including non-loopback) host. No authentication
  is added: the orchestrator is expected to run in a private subnet.
- Keep the interface to the served view only; no `status` CLI command is added.
- Extend the normalized provider model so issues and pull requests carry the
  host's web URL, letting the view link to them.
- Document the view, its configuration, and how to expose it behind a reverse
  proxy in the README, `docs/configuration.md`, and the deploy guide.

## Capabilities

### New Capabilities

- `status-ui`: A read-only web overview of active and in-flight workflows across
  the configured repositories, derived on demand from provider reads and served
  by the running orchestrator.

### Modified Capabilities

- `orchestrator-configuration`: adds the optional top-level `status` block
  (enablement, bind host, port) with documented defaults and fail-fast
  validation.
- `repo-provider`: normalized issues and pull requests carry the host's web URL
  so a read-only view can link to them.

## Impact

- New `src/status/` module: the status snapshot model and a Node `http` server.
  No new runtime dependency (Node's built-in `http`).
- `src/service.ts` exposes each repository's provider so the status view can read
  without running a turn; `src/index.ts` starts and stops the server with the
  long-running loop.
- `RepoProvider` implementations (GitHub, fake) populate the new URL field, and
  the shared provider contract covers it.
- Configuration model, loader, and validation gain the `status` block.
- Documentation: `README.md`, `docs/configuration.md`, `deploy/README.md`.
