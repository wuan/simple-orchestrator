# Tasks

## 1. Skip the scan on Dependabot pull requests

- [x] 1.1 Add `github.event.pull_request.user.login != 'dependabot[bot]'` to the
      `SonarCloud scan` step's `if` in `.github/workflows/ci.yml`, keeping the
      existing `push` and same-repository clauses; verify the file still parses
      as YAML and that the condition is false only for a Dependabot-opened
      same-repository pull request.
- [x] 1.2 Confirm the step keeps its action version, `SONAR_TOKEN` and
      `GITHUB_TOKEN` environment, and has no `continue-on-error`, so a real
      analysis failure on a trusted run still fails the job; verify the rendered
      `if` reads as one "scan where the token is available" rule.

## 2. Record the contract

- [x] 2.1 Write the `code-quality` spec delta with the "CI keeps analysing"
      scenario narrowed to a pull request not opened by Dependabot (MODIFIED,
      full requirement block) and a new requirement that the step is skipped
      where no token is available (ADDED); verify it matches the workflow.
- [x] 2.2 Check `.github/workflows/dependabot.yml` still detects the bot the
      same way as the new condition, so the repository has one convention;
      verify no other workflow reads `secrets.SONAR_TOKEN`.

## 3. Verification

- [x] 3.1 Run `npm run verify` and confirm the format check, lint, typecheck,
      the unit and integration tests, and strict OpenSpec validation all pass.
- [x] 3.2 Verify `openspec validate --strict skip-sonar-scan-without-token`
      passes and `openspec status --change skip-sonar-scan-without-token`
      reports every artifact `done`.
- [x] 3.3 After merge, verify a Dependabot pull request's CI run reports the
      `SonarCloud scan` step as `skipped` with the job green, and that a push to
      `main` still reports the step as `success`.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the `code-quality` requirements into
  `openspec/specs/code-quality/spec.md`.
