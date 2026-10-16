# Design

## Context

See `proposal.md` for motivation. This is a greenfield single-tenant service. The design is shaped by five decisions made during exploration:

- Bounded propose/review/revise turns instead of a live, suspended agent conversation. Turns are stateless and replayable.
- One pull request per change, carrying both the OpenSpec plan and, later, the implementation.
- The human drives turns and the gate through host-native review semantics.
- The service runs anywhere by polling (outbound-only); it has no inbound endpoint.
- The service keeps no database: workflow state lives in labels and timestamps.

These choices collapse most of the hard problems. In particular, "no suspended sessions" and "no debounce" mean every turn is a pure function of `(branch, transcript)`, so the orchestrator needs neither conversation state nor timers.

## Goals / Non-Goals

**Goals:**

- Turn a labeled issue into a reviewed, executable OpenSpec change, then into implementation, with a human approval gate in between.
- Keep the orchestrator stateless and portable: outbound-only, no database, safe to restart.
- Isolate host differences (GitHub vs GitLab) and runtime differences (OpenCode vs others) behind two plugin seams.
- Make correctness properties explicit: idempotent turns, an objective readiness predicate, and a consumed-approval claim.

**Non-Goals:**

- Multi-tenant install flows, per-user accounts, or hosted SaaS concerns.
- Real-time reaction (sub-second). Polling latency is accepted.
- Replacing human code review or human merge authority.
- Supporting more than one provider or runtime in the first milestone; both seams are designed, GitHub and OpenCode are implemented.

## Decisions

### Decision: Bounded turns, not suspended sessions

A "turn" is one stateless agent run that re-reads the branch and the entire review transcript, produces a commit, and posts a summary. The dialog is carried by the review transcript, and the orchestrator's implied next state is renamed from `CHANGES_REQUESTED` to a revise turn. The agent front-loads its questions at the end of a turn so the human's next review answers them.

Consequence: the orchestrator never persists conversation state; a turn can be retried or replayed.

### Decision: Pull request is the state-machine anchor

Starting a workflow creates a branch and one draft PR/MR. The OpenSpec change lives under `openspec/changes/<name>/` on that branch, so the plan is a reviewable diff and the branch itself is durable memory.

Consequence: the lifecycle maps onto host-native PR lifecycle events, and merge is the natural completion event. Archive is folded into the apply commit.

### Decision: Native review semantics as the control plane

`Request changes` and a submitted review (non-approval) trigger a revise turn; `Approve` is the gate; plain conversation comments do nothing. This is idiomatic on GitHub and portable to GitLab, whose review state (`REQUESTED_CHANGES`, `APPROVED`) is available, though only through GraphQL.

Risks: GitHub reviews have no `since` filter, so the poller must fetch recent reviews and compare timestamps; the "newer than my last turn" heuristic can be racy (dismissed or edited reviews, clock skew). The claim mitigates the worst case.

### Decision: Polling instead of webhooks

The service polls each configured repository. Reads use conditional requests, pagination, and ETag/`since` where the host supports it.

Alternatives considered: webhooks (rejected: require a public endpoint and per-repo configuration, reducing portability); CI-native execution (rejected: must be built twice, least app-like).

Consequence: no inbound ports, no webhook secrets, identical operation on a laptop, a VPS, or a cluster. Cost: latency floor and the need for a watermark.

### Decision: Labels plus timestamps as the watermark

The orchestrator represents phase with host-native labels (`openspec:proposing`, `openspec:ready`, `openspec:implementing`, `openspec:done`, `openspec:failed`) and decides the pending action by comparing the latest human review time against the last bot turn time.

The critical rule: on observing an approval, the orchestrator sets the `implementing` label **before** enqueuing the apply turn. That label is the claim, and it is how "this approval was already consumed" survives GitHub dismissing stale reviews when the apply turn pushes commits.

Alternatives considered: a small SQLite/Postgres cursor store (rejected for now: adds a stateful component the operator must run and back up); a committed watermark file on the branch (rejected: churns the diff and leaks orchestration state into the repo).

### Decision: Objective readiness predicate

READY is computed by the orchestrator from `openspec status --change <name> --json` (all artifacts `done`) plus `openspec validate --strict`. Agent prose that claims readiness is ignored. This makes the gate deterministic and testable.

### Decision: Two plugin seams

`RepoProvider` owns host operations (issues, comments, labels, PRs, review state, clone) and normalizes host events. `AgentRuntime` owns turn execution (`run(skill, context) -> result`) and returns a structured result (commits, summary, questions). Everything between them is orchestration.

Alternatives considered: a single fixed harness (rejected: couples orchestration to one vendor); building an in-house agent loop (rejected: reimplements tool use, editing, sandboxing with no near-term benefit).

### Decision: Least-privilege, sandboxed turns

Each turn runs as an ephemeral container cloned at the workflow branch, with a fine-grained token scoped to that repository. The turn may push only to its branch: no default-branch writes, no force-push, no merge. The bot has a distinct identity and marks its own output so the poller can exclude it.

### Decision: Archive inside the apply commit

The apply turn runs `openspec archive` and commits code, updated specs, and the archived change together, so a merge lands a consistent repository state. This is preferred to a post-merge archive job, which would need separate triggering and could leave specs and code briefly inconsistent.

## Risks / Trade-offs

- [Timestamp watermark races (dismissed/edited reviews, clock skew)] -> The `implementing` claim makes approval consumption idempotent; treat timestamps as a hint, not an authority, and compare against the last bot turn rather than wall-clock alone.
- [GitHub has no `since` for reviews] -> Fetch a bounded recent window and compare timestamps; accept a small overlap.
- [Polling cost and rate limits at scale] -> Conditional requests, pagination, per-repo fairness, and backoff below quota.
- [Provider divergence] -> Confine host differences to the provider; encode GitLab's GraphQL-only review state and paid-tier blocking semantics in the adapter, never in orchestration.
- [One PR carries plan and code, so it can grow large] -> Accepted; the plan is small and the code review happens after the apply turn.
- [Approval dismissal on push] -> Consume the approval before pushing (the claim).
- [Readiness predicate gaming] -> READY is computed by the orchestrator, never trusted from agent prose.
- [Agent may push poor code] -> Turns only push to a branch; a human still reviews and merges; per-turn cost caps bound the blast radius.

## Migration Plan

Greenfield, no migration. Deployment: build and run the service with a config listing repositories and externally sourced credentials. Rollback: stop the service; because it is stateless, no state cleanup is required.

## Open Questions

- Whether the apply output gets its own code-review revise loop before merge (same semantics as the plan). The specs allow it; scope is a later call.
- Change naming: agent-proposed slug versus a slug derived from the issue title.
- Poll interval default and per-repo scheduling fairness policy.
- Whether one issue may ever spawn multiple changes (assumed 1:1 for now).
