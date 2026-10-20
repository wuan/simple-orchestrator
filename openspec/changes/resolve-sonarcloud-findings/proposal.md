# Proposal

## Why

The project's SonarCloud analysis is red (issue #57). The CI `verify` job's
code-analysis step reports a failing quality gate because `new_security_rating`
is D, driven by a `CRITICAL` vulnerability (a fixed, world-writable temporary
path). Beyond the gate, the dashboard lists 87 unresolved findings - 4
vulnerabilities, 1 bug, 2 blockers, 7 critical, 9 major and 69 minor,
about 11 hours of debt. The failing gate flags new code as failing while the
backlog hides which findings matter and lets regressions accumulate.

## What Changes

- Resolve all 87 open findings so the analysis returns a passing quality gate
  and an empty issue list, grouped by concern:
  - **Security** (`S5443`): create private, per-invocation temporary working
    directories instead of the fixed `/tmp/contract-work`, `/tmp/fake-workspace-*`
    and `/tmp/fake-store` paths.
  - **Reliability** (`S6959`, `S8786`): give the newest-human-review `reduce` an
    initial value, and rewrite the conventional-subject, usage-marker and
    `Link`-header patterns so they cannot backtrack super-linearly.
  - **Test discovery** (`S2187`, `S5906`): make both provider contract test files
    declare tests the analyser can see, and use dedicated assertion matchers in
    the two flagged tests.
  - **Maintainability** (`S3776`, `S3358`, `S4624`, `S7778`, `S6582`, `S6551`,
    `S7785`, `S7503`, `S9382`): lower cognitive complexity in `decide`,
    `pollOnce` and the GitHub emulator's request handler; extract a nested
    ternary; remove a nested template literal; merge consecutive `Array#push`
    calls; use optional chaining; read typed fields instead of legacy object
    stringification; use top-level `await` in the three entry points; and remove
    unnecessary `async`/`await` from code whose sequencing or async signature the
    rule misreads.
- Resolve the findings that conflict with an intentional design (ordered polling,
  rate-limited pagination, repository iteration, contract-shaped async test
  doubles) by restructuring where behaviour-safe and by a documented
  suppression where it is not, so the analysis is clean without changing
  behaviour.
- Record the contract as a new `code-quality` capability so the
  analysis-cleanliness, private-workspace, linear-time-parsing and
  test-discovery expectations are specified rather than left implicit.
- No production behaviour change. The security fix and the async/suppression
  work touch test doubles, test-only destinations and equivalent refactors; the
  CI `verify` job keeps running the SonarCloud scan.

## Capabilities

### New Capabilities

- `code-quality`: the analysed sources report no unresolved SonarCloud findings
  and a passing quality gate, temporary workspaces are private, input-parsing
  patterns run in linear time, and every test file declares at least one test.

### Modified Capabilities

None. The change adds a code-quality contract; it does not change the behaviour
of an existing capability.

## Impact

- **Code**: finding-bearing sources under `src/` (orchestrator, provider,
  runtime, config and entry points) and the provider contract tests.
- **CI**: unchanged; the `verify` job's SonarCloud scan step still runs.
- **Dependencies / configuration**: none. `sonar-project.properties` already
  scopes the analysis.
- **Behaviour**: none in production; test doubles and test-only paths change.
