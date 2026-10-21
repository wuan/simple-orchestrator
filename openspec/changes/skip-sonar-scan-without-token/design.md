# Design

## Context

See `proposal.md` - Why. The state that shapes the approach:

- `.github/workflows/ci.yml`'s `verify` job gates its SonarCloud scan on
  `github.event_name == 'push' || github.event.pull_request.head.repo.full_name
  == github.repository`. The condition encodes "this run can read
  `secrets.SONAR_TOKEN`": pushes and same-repository PRs get the repository's
  Actions secrets; fork PRs do not.
- Dependabot branches are pushed into this repository, so the head repo matches
  and the condition selects those runs. But a Dependabot-triggered run takes its
  secrets from the `Dependabot` secret source, not the Actions secrets, so
  `SONAR_TOKEN` resolves to an empty string. Run `39468848333` (PR #60) logs
  `Secret source: Dependabot`, `SONAR_TOKEN:` (empty), the scanner's warning
  about running without a token, and a failed step after every earlier step
  passed.
- The `secrets` context is not available in a step-level `if`, so the condition
  cannot test whether the token exists; it must test the run's provenance.
- `openspec/specs/code-quality/spec.md` already owns this behavior through its
  "CI keeps analysing" scenario, which currently says the scan runs on "a push
  or a same-repository pull request" without the Dependabot exception.
- Precedent for the provenance test exists in `.github/workflows/dependabot.yml`,
  which identifies the bot with `github.event.pull_request.user.login ==
  'dependabot[bot]'`.

## Goals / Non-Goals

**Goals:**

- A Dependabot pull request's CI run is green, with the scan step explicitly
  `skipped` rather than failed.
- Pushes to `main` and human same-repository pull requests keep scanning, and a
  real analysis failure on those runs still fails the job.
- No second source of truth for "is this Dependabot": reuse the existing
  convention for detecting the bot.

**Non-Goals:**

- Restoring a scan on Dependabot PRs through a separate Dependabot secret. The
  bot's dependency bumps do not need SonarCloud feedback to be merged, and
  adding a second token to rotate is a cost with no signal.
- `continue-on-error` on the scan step. That would also hide genuine analysis
  failures on trusted runs, which is the opposite of the intent.
- Changing the scan action version, its arguments, the coverage input, or the
  `sonar-project.properties` scope.
- Making the scan a required check or adding a `sonar.qualitygate.wait` gate.

## Decisions

### Decision: detect the bot by PR author, not by actor

Guard the step with `github.event.pull_request.user.login != 'dependabot[bot]'`,
the same test `dependabot.yml` already uses, rather than
`github.actor != 'dependabot[bot]'`. The author is a property of the pull
request and stays constant across re-runs and manual pushes, while `actor` is
whoever started the current run - a maintainer pressing "Re-run" becomes the
actor even though the run's secret source is still Dependabot, so an actor test
would let the step run and fail again. On a `push` event the `pull_request`
field is null, so the comparison is trivially true and `main` keeps scanning.

- Alternative: test `github.actor`. Rejected as above - fragile on re-runs.
- Alternative: test `github.event.pull_request.head.repo.owner.login`. Rejected:
  the Dependabot branch's owner *is* `wuan`, so the check passes and does not
  discriminate.
- Alternative: a preceding step that inspects `secrets.SONAR_TOKEN` and exports
  a job output. Rejected: it adds a step and a conditional indirection to
  express what the static provenance test already states.

### Decision: express the condition as one positive provenance test

Keep the existing `push || (same repository && not Dependabot)` shape, so a
reader sees one rule - "scan where the token is available" - rather than a list
of special cases, and the Dependabot exception sits next to the same-repository
test it contradicts.

### Decision: state the exception in the `code-quality` capability

The "CI keeps analysing" scenario is the written contract for this condition, so
it is corrected in place (MODIFIED) and the skip behavior is added as its own
requirement (ADDED). Correcting the scenario rather than leaving it keeps
`npm run verify`'s strict OpenSpec validation meaningful.

## Risks / Trade-offs

- [A future trusted-but-secretless triggering path (for example another app
  opening same-repository PRs) hits the same failure] -> the failure mode is a
  hard error naming the missing token, which points at this condition, and the
  condition is now the single place that encodes "trusted for secrets".
- [Dependency bumps stop getting a SonarCloud analysis] -> the scan analyses
  `src` on the merged result anyway, so `main`'s analysis covers the merge; a
  dependency bump rarely changes analysed sources.
- [The author test misses a Dependabot PR that a maintainer has taken over] ->
  the step stays skipped, which is safe: a skipped scan cannot fail the run.

## Migration Plan

None. A workflow-condition change with no runtime effect, picked up on the next
merge. Rollback reverts the workflow file and the spec delta.

## Open Questions

None.
