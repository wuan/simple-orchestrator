# Tasks

## 1. Fix the mapping

- [x] 1.1 Normalize GitHub review states case-insensitively in
      `normalizeGithubReviewState` and verify unit tests cover the REST API's
      upper-case states (`CHANGES_REQUESTED`, `APPROVED`, `COMMENTED`) and still
      accept the lower-case ones
- [x] 1.2 Confirm `GitHubProvider.listReviews` now returns a real review by
      checking the mapped result against the live API, and verify the engine's
      watermark now sees it

## 2. Verification

- [x] 2.1 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
