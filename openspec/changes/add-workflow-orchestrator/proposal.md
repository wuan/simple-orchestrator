# Proposal

## Why

Teams that work from repository issues have no repeatable way to turn an issue into a reviewed, executable plan before code is written. An agent either jumps straight to code or plans in an ephemeral chat that is never versioned, reviewed, or reusable. This change introduces a workflow orchestrator that drives the OpenSpec lifecycle from an issue and gates implementation on a human-approved, versioned plan.

## What Changes

- Add a single-tenant, config-driven service that connects to source repositories (GitHub first, GitLab next) and discovers work by **polling** (outbound-only, no public endpoint).
- Turn an issue carrying a trigger label into an OpenSpec change on a branch behind a single draft PR/MR.
- Drive bounded **propose -> review -> revise** turns in dialogue with the human, then a human **approval gate**, then an **apply** turn that implements tasks and archives the change.
- Track workflow state with provider lifecycle labels plus timestamps (no database), and consume an approval as a claim before applying so a later push cannot un-approve it.
- Compute readiness objectively from `openspec status --change ... --json` and `openspec validate --strict`, never from agent prose.
- Abstract the source provider (issues, comments, labels, PRs/MRs, review states) and the agent runtime (sandboxed per-turn skill execution) behind plugin interfaces; ship a GitHub adapter and an OpenCode runtime adapter first, leaving explicit extension points for GitLab and other runtimes.
- Execute each turn as an ephemeral, sandboxed job with branch-only push permissions and per-turn cost caps.

## Capabilities

### New Capabilities

- `workflow-orchestration`: polling and trigger detection, the OpenSpec lifecycle state machine, turn dispatch, the readiness predicate, the approval gate/claim, revise-round limits, and archive-on-merge.
- `repo-provider`: the provider abstraction and the normalized issue/comment/label/PR/review model, with a GitHub adapter and an explicit extension point for GitLab.
- `agent-runtime`: the pluggable runtime interface for executing one skill (propose or apply) per turn inside a sandbox, including permissions, cost caps, and failure policy; OpenCode adapter first.
- `orchestrator-configuration`: single-tenant, config-driven repo onboarding (provider, credential, label overrides) with no multi-tenant install flow.

### Modified Capabilities

- None. This is a greenfield project with no existing capability specs.

## Impact

- **New code**: orchestrator service (poller, state machine, turn dispatcher, job runner) plus provider and runtime adapters. Greenfield repository.
- **External dependencies**: GitHub REST/GraphQL APIs; a headless agent harness (OpenCode first); a container runtime for sandboxed jobs; the OpenSpec CLI.
- **Operational**: outbound-only networking; per-repo fine-grained tokens; no inbound ports or webhook configuration; a stateful component is avoided by design.
- **Future**: GitLab adapter (review state is GraphQL-only and its blocking semantics are a paid tier), additional runtime adapters, and an optional move to a multi-tenant install flow without redesigning the provider seam.
