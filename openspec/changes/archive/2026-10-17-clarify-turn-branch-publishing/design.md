# Design

## Context

See proposal.md - Why. `buildSkillPrompt` in
`src/runtime/opencode/opencode-runtime.ts` composes the single instruction the
agent receives for a turn. Its constraints currently read:

- `Commit all work to the current branch only. Never push to another branch and never merge the pull request.`
- `Follow the OpenSpec workflow and validate the change before declaring it ready.`

and the turn is asked to `Report a short summary, any questions for the human,
the commit SHAs produced, and whether you need input.`

The orchestrator already publishes the workflow branch after a successful turn
(`WorkflowEngine.runTurn`) and the sandbox has no push credentials, so the turn
can never push. The instruction does not say that, and its negative phrasing
("never push to another branch") leaves room to read "do not push at all", which
the agent then reports.

## Goals / Non-Goals

**Goals:**

- The turn instruction truthfully states that the orchestrator publishes the
  branch, so the agent has no reason to report push status.
- The `agent-runtime` least-privilege requirement matches what a turn actually
  does (commit, not push).

**Non-Goals:**

- Filtering or rewriting the agent's prose summary in the orchestrator; the
  summary is the agent's report and stays verbatim.
- Changing who pushes, the push policy guard, or the publish-before-advance
  ordering.
- Parsing a "pushed" flag out of the agent's output.

## Decisions

### Decision: fix the instruction, not the posted comment

The misleading text originates in the agent's summary, which the orchestrator
posts verbatim. Removing it downstream would mean pattern-matching free-form
prose and silently editing the agent's report, which is brittle and hides the
real cause. Naming the publisher in the instruction removes the reason for the
claim.

Alternatives considered: stripping push-related sentences from the summary
(rejected: brittle prose filtering and it loses genuine signal); adding an
orchestrator-owned footer that restates the push status (rejected: adds noise to
every comment and does not stop the agent's own claim).

### Decision: state the publisher positively

The constraint becomes a positive statement ("the orchestrator publishes the
workflow branch after the turn") followed by the prohibitions, and the report
directive says not to comment on push status. This replaces the ambiguous
"never push to another branch", which the agent could read as "do not push".

Alternatives considered: only appending "the orchestrator will push" to the
existing wording (rejected: leaves the contradictory "never push" clause in
place, which is what prompted the hedge).

### Decision: keep the guard rails in the instruction

The instruction still forbids pushing and merging the pull request, so the
least-privilege intent is unchanged; only the actor that publishes is made
explicit. The provider-side `assertPushAllowed` guard and the orchestrator's
publish step are untouched.

## Risks / Trade-offs

- [A model may still mention push status] -> the instruction now makes the
  expected behavior explicit, which is the strongest control available over a
  free-form summary; the orchestrator does not rely on the summary for
  correctness.
- [The corrected least-privilege wording could be read as dropping the push
  restriction] -> the requirement still forbids the turn from pushing, and the
  orchestrator publishes under the existing policy guard.

## Migration Plan

None: an instruction wording change plus a spec correction, effective on the
next turn. Rollback is a revert.
