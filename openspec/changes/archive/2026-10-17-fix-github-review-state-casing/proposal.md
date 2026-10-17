# Proposal

## Why

GitHub's REST API returns pull request review states in **upper case**
(`CHANGES_REQUESTED`, `APPROVED`, `COMMENTED`), but the provider's mapping only
recognised lower-case values, so every real review was filtered out.
`listReviews` returned nothing, no review drove a revise turn, and no approval
could ever start implementation. A workflow could sit at `openspec:proposing`
and never advance, however many reviews a human submitted.

## What Changes

- Normalize GitHub review states **case-insensitively**, so the REST API's
  upper-case values map to the normalized events the orchestrator acts on.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `repo-provider`: review-state normalization accepts the casing the host
  returns.

## Impact

- **Code**: `src/provider/normalize.ts` (one-line fix) and its tests.
- **Operational**: review-driven turns and the approval gate work on GitHub;
  previously they were silently inert.
- **Dependencies**: none.
