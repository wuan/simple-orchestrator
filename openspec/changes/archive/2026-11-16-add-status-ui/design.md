# Design

## Context

See `proposal.md` for motivation and `specs/status-ui/spec.md` for the required
behavior. The relevant current state:

- The service composition root (`src/service.ts`) builds one `RepoProvider`,
  `Sandbox`, and `Poller` per configured repository, then returns them as
  `ServiceRepository` values (`key`, `repo`, `intervalSeconds`, `poller`). The
  provider is not currently exposed to anything but the poller.
- The orchestrator keeps no durable state; an in-flight workflow is discovered
  each poll from lifecycle labels (`src/orchestrator/labels.ts`,
  `Poller.driveByLabel`). The status view must therefore derive its data the
  same way, from provider reads.
- The service is documented as a stateless, outbound-only poller with no inbound
  ports (`README.md` "Deploy"), and credentials are resolved once at startup and
  never logged (`docs/configuration.md`).
- `RepoProvider` models issues and pull requests without a web URL
  (`src/provider/types.ts`), so a view cannot link to the host without a new
  field.

## Goals / Non-Goals

**Goals:**

- A live, read-only overview of active work that reuses the providers,
  credentials, and label helpers the service already builds.
- Keep the default deployment outbound-only: the listener is opt-in and local.
- Add no runtime dependency and no durable state.

**Non-Goals:**

- Authentication, TLS termination, or multi-user access control for the view;
  review confirmed these are out of scope for now (private subnet).
- Any mutation (labels, comments, reviews, merges) through the view.
- Historical, metrics, or cost reporting; only current active work.
- A standalone `status` CLI command; review confirmed the served web UI is the
  intended shape and no CLI status is planned.

## Decisions

### Serve from the running orchestrator, over HTTP

The status server runs inside the existing service process, started after
`createService` resolves providers and credentials. This reuses the resolved
providers and the repository/label configuration instead of introducing a second
configuration-and-credential path, and it keeps the view live without the poller
persisting anything.

*Alternatives considered.* A one-shot `orchestrator status` CLI command that
prints a table would be simpler and need no listener, but it is a snapshot, not
an overview an operator can leave open. Review settled on the served web UI and
ruled the CLI out, so this change ships no `status` command. A separate status
process would duplicate provider and credential wiring for little benefit.

### Opt-in listener, loopback by default, no authentication yet

A new top-level `status` block (`enabled` false, `host` `127.0.0.1`, `port`
`8787`) keeps the shipped behavior outbound-only. Loopback is the safe default
because the view exposes private repository titles. An operator who needs the
view remotely sets `host` to a non-loopback address explicitly, which this
change supports. Review confirmed that binding is in scope and that no
authentication is needed yet because the orchestrator runs in a private subnet;
TLS and access control therefore remain out of scope and are the operator's
responsibility, with the docs pointing remote exposure at a reverse proxy.

### Derive the snapshot from provider reads, no new state

`src/status/snapshot.ts` builds the overview from
`listTriggerIssues(triggerLabel)` plus `listPullRequestsForIssue`, and unions in
`listPullRequestsWithLabel` over the lifecycle labels so an in-flight pull
request is shown even while its issue label is being reconciled. Phases come from
the existing `phaseFromLabels` helper, so the view agrees with the poller's
decision logic. An issue with no pull request is queued; a merged pull request is
terminal and omitted from the active list.

### A short, in-memory snapshot cache with in-flight coalescing

Because the view is request-driven, a browser refresh or a shared link could
otherwise issue a provider read per request. The server keeps the last snapshot
and its timestamp, serves it within a short refresh interval, and shares one
in-flight build across concurrent requests. This is ephemeral and process-local,
consistent with "no database"; it does not become source of truth.

### Node's built-in `http`, server-rendered HTML, one JSON endpoint

No web framework or template dependency: `src/status/server.ts` uses
`node:http`, routes `GET`/`HEAD /` to a small server-rendered HTML page and
`GET /status.json` to the same snapshot as JSON, and answers every other method
with `405`. The HTML is a plain table per repository (issue, pull request,
phase); styling stays minimal and inline.

### Add an optional web URL to the normalized provider model

`ProviderIssue` and `ProviderPullRequest` gain an optional `url`. The GitHub map
populates it from the payload's `html_url`; the fake provider sets one; the
shared contract test asserts the field is present or `undefined`, so other
providers can omit it. This is what lets the view link to a host without
host-specific code in the status module.

### Expose the provider on `ServiceRepository`

The status module needs providers but not pollers. `ServiceRepository` gains a
`provider` field (an internal type, not a public API), so the status server
reads providers directly and stays decoupled from `Poller` internals.

## Risks / Trade-offs

- **[No authentication]** Accepted: the listener is opt-in, defaults to
  loopback, and the orchestrator runs in a private subnet. An operator who binds
  a non-loopback interface takes on access control themselves (the docs
  recommend a reverse proxy); adding authentication would be a separate change.
- **[Provider rate limits]** The view shares the repository's quota with polling.
  The short cache and coalescing bound the extra reads; the refresh interval is
  kept small relative to the poll interval.
- **[A provider without a URL]** The `url` field is optional, so a future host
  that exposes none still renders, just without links.
- **[A second connection while polling]** Reads are paginated and read-only, and
  the cache collapses bursts; a status read cannot run a turn or mutate state.

## Migration Plan

No migration is needed: `status` defaults to disabled, so upgrading changes
nothing until an operator opts in. Rollback is disabling or removing the block
(and restarting); there is no data to revert. Documentation in `README.md`,
`docs/configuration.md`, and `deploy/README.md` covers enabling it and exposing
it behind a reverse proxy.

## Resolved Questions

All three questions from the first review are settled; none remains open and the
specs and tasks below reflect the answers.

- **Shape**: serve the read-only overview from the running orchestrator, opt-in,
  with optional non-loopback binding. No CLI status command.
- **Remote access**: no authentication in this change; the orchestrator runs in
  a private subnet. A reverse proxy is the documented way to expose it.
- **Defaults**: keep `127.0.0.1:8787` disabled by default, and allow an explicit
  non-loopback `host`. `examples/config.yaml` shows the block commented out.
