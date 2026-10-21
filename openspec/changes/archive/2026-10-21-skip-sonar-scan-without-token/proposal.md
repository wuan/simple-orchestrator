# Proposal

## Why

Every CI run started by a Dependabot pull request fails at the SonarCloud scan
step. Dependabot-triggered runs take their secrets from the `Dependabot` secret
source rather than the repository's Actions secrets, so `secrets.SONAR_TOKEN` is
empty, and the step's condition still selects those runs because the Dependabot
branch lives in this repository (run `39468848333` on PR #60 shows an empty
`SONAR_TOKEN` and a failed step after `npm run verify` had already passed). The
red run is noise: it blocks nothing that the analysis would actually check, and
it hides real failures behind an expected one.

## What Changes

- Narrow the `verify` job's SonarCloud scan condition so it also skips pull
  requests opened by Dependabot, keeping the scan on pushes and on
  same-repository pull requests from people. A Dependabot PR is same-repository
  but is not trusted with Actions secrets, so the "we have a token" intent the
  condition encodes does not hold for it.
- Record the narrower contract in the `code-quality` capability: the scan still
  runs on every push and on every same-repository pull request that is not
  opened by Dependabot, and the step is skipped where no `SONAR_TOKEN` is
  available instead of failing the job.
- No change to the scan step's action, arguments, or coverage input, no change
  to the local verification gate, and no change to enforcement: a real analysis
  failure on a trusted run still fails the job.

## Capabilities

### New Capabilities

None. The scan step's behavior is already owned by `code-quality`.

### Modified Capabilities

- `code-quality`: the requirement "Static analysis reports no unresolved
  findings" gains the Dependabot exception in its "CI keeps analysing" scenario,
  and a new requirement states that the scan step is skipped on runs that cannot
  read `SONAR_TOKEN` (Dependabot-triggered runs) so those runs do not fail on a
  missing token.

## Impact

- `.github/workflows/ci.yml` - the SonarCloud scan step's `if` condition.
- No runtime, configuration, dependency, or `sonar-project.properties` change.
- The other workflows are untouched: the Dependabot automation and
  dependency-review jobs already run without the token.
