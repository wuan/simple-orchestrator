# Design

## Context

`GitHubProvider.listReviews` reads `GET /repos/{owner}/{repo}/pulls/{number}/reviews`
and maps each payload through `mapReview`, which drops any state
`normalizeGithubReviewState` does not recognise. That function looked the native
state up in a table keyed by lower case (`approved`, `changes_requested`,
`commented`), but the REST API (and the `gh api` transport the provider uses)
returns upper case. The result: every review mapped to `null` and was discarded.

The unit tests did not catch it because their fixtures seeded lower-case states,
matching the table rather than the host.

## Goals / Non-Goals

**Goals:**

- Derive normalized review events from the states GitHub actually returns.
- Keep accepting lower-case states so existing fixtures and the webhook-style
  casing still map.

**Non-Goals:**

- Changing the normalized model or the turn trigger rules.
- Handling review states the orchestrator intentionally ignores (`DISMISSED`,
  `PENDING`).

## Decisions

### Decision: lower-case the native state before lookup

`normalizeGithubReviewState` lower-cases its input before the table lookup. This
is a one-line change that accepts both the REST API's `CHANGES_REQUESTED` and the
already-supported `changes_requested`, with no new states or branches.

Alternatives considered: adding upper-case keys alongside the lower-case ones
(rejected: more surface, and any future casing variation re-opens the bug);
normalizing at the transport boundary (rejected: the transport is generic and
`mapReview` is the right place).

### Decision: keep the fixture change minimal

The tests now assert both casings, so the mapping cannot silently regress to
case-sensitive matching. The provider contract fixture keeps seeding lower case,
which the fix still accepts.

## Risks / Trade-offs

- [Later GitHub casing changes] -> case-insensitive matching absorbs them.
- [A genuinely unknown state is discarded] -> unchanged and intended; the
  orchestrator only acts on approved, changes-requested, and commented reviews.

## Migration Plan

None. A code-only fix; deployments pick it up on the next build and restart.

## Open Questions

None.
